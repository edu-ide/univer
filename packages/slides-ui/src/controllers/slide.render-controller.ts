/**
 * Copyright 2023-present DreamNum Co., Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { EventState, IColorStyle, IPageElement, ISlidePage, Nullable, SlideDataModel, UnitModel } from '@univerjs/core';
import type { BaseObject, IRenderContext, IRenderModule, IWheelEvent } from '@univerjs/engine-render';
import type { IUpdateElementOperationParams } from '../commands/operations/update-element.operation';
import type { PageID } from '../type';
import { CommandType, debounce, getColorStyle, ICommandService, Inject, Injector, IUndoRedoService, IUniverInstanceService, RxDisposable, UniverInstanceType } from '@univerjs/core';
import {
    getCurrentTypeOfRenderer,
    Image as UniverImage,
    IRenderManagerService,
    Rect,
    Scene,
    ScrollBar,
    Slide,
    Viewport,
} from '@univerjs/engine-render';
import { ObjectProvider, SLIDE_KEY } from '@univerjs/slides';
import { AddSlideElementMutation } from '../commands/mutations/element.mutation';
import type { IAddSlideElementMutationParams, IRemoveSlideElementMutationParams } from '../commands/mutations/element.mutation';
import { RemoveSlideElementMutation } from '../commands/mutations/element.mutation';
import { UpdateSlideElementOperation } from '../commands/operations/update-element.operation';

export class SlideRenderController extends RxDisposable implements IRenderModule {
    private _objectProvider: ObjectProvider | null = null;

    constructor(
        private readonly _renderContext: IRenderContext<UnitModel>,
        @Inject(Injector) private readonly _injector: Injector,
        @IUniverInstanceService private readonly _univerInstanceService: IUniverInstanceService,
        @IRenderManagerService private readonly _renderManagerService: IRenderManagerService,
        @ICommandService private readonly _commandService: ICommandService,
        @IUndoRedoService private readonly _undoRedoService: IUndoRedoService
    ) {
        super();
        this._objectProvider = this._injector.createInstance(ObjectProvider);
        this._addNewRender();
    }

    private _addNewRender() {
        const { unitId, engine, scene } = this._renderContext;
        const slideDataModel = this._getCurrUnitModel();

        if (!slideDataModel) return;

        // createRender moved to slideRenderService@this._instanceSrv.getAllUnitsForType<SlideDataModel>(UniverInstanceType.UNIVER_SLIDE).forEach((slideModel)
        // this._renderManagerService.createRender(unitId);

        //#region scene subscribe
        // const { engine, scene } = currentRender;
        const observer = engine.onTransformChange$.subscribeEvent(() => {
            this._scrollToCenter();
            // add once
            observer?.unsubscribe();
        });
        engine.onTransformChange$.subscribeEvent(() => {
            setTimeout(() => {
                this.createThumbs();
            }, 300);
        });

        const viewMain = new Viewport(SLIDE_KEY.VIEW, scene, {
            left: 0,
            top: 0,
            bottom: 0,
            right: 0,
            explicitViewportWidthSet: false,
            explicitViewportHeightSet: false,
            isWheelPreventDefaultX: true,
        });
        scene.attachControl();
        scene.onMouseWheel$.subscribeEvent((evt: unknown, state: EventState) => {
            const e = evt as IWheelEvent;
            if (e.ctrlKey) {
                const deltaFactor = Math.abs(e.deltaX);
                let scrollNum = deltaFactor < 40 ? 0.2 : deltaFactor < 80 ? 0.4 : 0.2;
                scrollNum *= e.deltaY > 0 ? -1 : 1;
                if (scene.scaleX < 1) {
                    scrollNum /= 2;
                }

                if (scene.scaleX + scrollNum > 4) {
                    scene.scale(4, 4);
                } else if (scene.scaleX + scrollNum < 0.1) {
                    scene.scale(0.1, 0.1);
                } else {
                    const value = e.deltaY > 0 ? 0.1 : -0.1;
                    // scene.scaleBy(scrollNum, scrollNum);
                    e.preventDefault();
                }
            } else {
                viewMain.onMouseWheel(e, state);
            }
        });
        scene.onFileLoaded$.subscribeEvent(() => {
            this._refreshThumb();
        });
        //#endregion

        ScrollBar.attachTo(viewMain);
        // this._renderManagerService.setCurrent(unitId);

        // #region create slide
        const slide = this._createSlide(scene);
        this._renderContext.mainComponent = slide;
        this._createSlidePages(slideDataModel, slide);
        this.createThumbs();
        // #endregion

        engine.runRenderLoop(() => {
            scene.render();
        });

        // Listen for element mutations (add/remove/update) to sync render objects (including undo/redo)
        this._commandService.onCommandExecuted((command) => {
            const slideComponent = this._renderContext.mainComponent as Slide;
            if (!slideComponent) return;

            if (command.id === AddSlideElementMutation.id) {
                const params = command.params as IAddSlideElementMutationParams;
                if (!params) return;
                const { pageId, element } = params;

                // Add the object to the scene
                const sceneObject = this.createObjectToPage(element, pageId);
                if (sceneObject) {
                    this.setObjectActiveByPage(sceneObject, pageId);
                }

                // Refresh thumbnail
                this._thumbSceneRender(pageId, slideComponent);
            } else if (command.id === RemoveSlideElementMutation.id) {
                const params = command.params as IRemoveSlideElementMutationParams;
                if (!params) return;
                const { pageId, elementId } = params;

                // Remove the object from the scene
                this.removeObjectById(elementId, pageId);

                // Refresh thumbnail
                this._thumbSceneRender(pageId, slideComponent);
            } else if (command.id === UpdateSlideElementOperation.id) {
                const params = command.params as IUpdateElementOperationParams;
                if (!params) return;
                const model = this._getCurrUnitModel();
                if (!model) return;
                const activePage = model.getActivePage();
                if (!activePage) return;

                const pageScene = slideComponent.getSubScene(activePage.id);
                if (!pageScene) return;

                const obj = pageScene.getObject(params.oKey);
                if (obj && params.props) {
                    obj.transformByState({
                        left: params.props.left,
                        top: params.props.top,
                        width: params.props.width,
                        height: params.props.height,
                    });
                    pageScene.makeDirtyNoParent(true);
                }

                // Refresh thumbnail
                this._thumbSceneRender(activePage.id, slideComponent);
            }
        });

        // 🦜 Listen for remote sync updates from SlideSyncController
        const syncUpdateHandler = () => {
            try {
                const slideModel = this._getCurrUnitModel();
                if (!slideModel) return;

                const currentRender = this._currentRender();
                if (!currentRender || !currentRender.mainComponent) return;

                const slide = currentRender.mainComponent as Slide;
                const pages = slideModel.getPages();
                const pageOrder = slideModel.getPageOrder();
                if (!pages || !pageOrder) return;

                const activePageId = slideModel.getActivePage()?.id;

                // 1. Remove scenes for pages that no longer exist
                const existingKeys = Array.from(slide.getSubScenes().keys());
                for (const key of existingKeys) {
                    if (!pages[key]) {
                        const scene = slide.getSubScene(key);
                        scene?.dispose();
                        slide.removeSubScene(key);
                    }
                }

                // 2. Rebuild all existing pages to reflect element changes
                for (const pageId of pageOrder) {
                    const pageData = pages[pageId];
                    if (!pageData) continue;

                    // Destroy existing scene
                    if (slide.hasPage(pageId)) {
                        const existingScene = slide.getSubScene(pageId);
                        existingScene?.dispose();
                        slide.removeSubScene(pageId);
                    }

                    // Recreate scene from current model data
                    // NOTE: createPageScene internally calls slide.addPageScene
                    this.createPageScene(pageId, pageData);

                    // Ensure thumb render exists for this page
                    this._createThumb(pageId);
                }

                // 3. Restore active page
                if (activePageId && slide.hasPage(activePageId)) {
                    slide.changePage(activePageId);
                } else {
                    slide.activeFirstPage();
                }

                // 4. Mark scene dirty to trigger re-render
                const { scene } = this._renderContext;
                scene.makeDirtyNoParent(true);

                // 5. Refresh all thumbnails (deferred to let scenes settle)
                setTimeout(() => this.createThumbs(), 100);

                console.log('🦜 [SlideRenderController] Remote sync scene rebuild complete');
            } catch (e) {
                console.warn('⚠️ [SlideRenderController] Sync update error:', e);
            }
        };
        window.addEventListener('univer-slide-sync-update', syncUpdateHandler);
        this.disposeWithMe({ dispose: () => window.removeEventListener('univer-slide-sync-update', syncUpdateHandler) });
    }

    private _scrollToCenter() {
        const mainScene = this._currentRender()?.scene;
        const viewMain = mainScene?.getViewport(SLIDE_KEY.VIEW);
        const getCenterPositionViewPort = this._getCenterPositionViewPort(mainScene);
        if (!viewMain || !getCenterPositionViewPort) return;
        const { left: viewPortLeft, top: viewPortTop } = getCenterPositionViewPort;

        const { x, y } = viewMain.transViewportScroll2ScrollValue(viewPortLeft, viewPortTop);

        viewMain.scrollToBarPos({
            x,
            y,
        });
    }

    private _currentRender() {
        return getCurrentTypeOfRenderer(UniverInstanceType.UNIVER_SLIDE, this._univerInstanceService, this._renderManagerService);
    }

    private _refreshThumb = debounce(() => {
        this.createThumbs();
    }, 300);

    /**
     * @param mainScene
     */
    private _createSlide(mainScene: Scene) {
        const model = this._univerInstanceService.getCurrentUnitForType<SlideDataModel>(UniverInstanceType.UNIVER_SLIDE)!;

        const pageSize = model.getPageSize();
        const { width = 100, height = 100 } = pageSize;

        // Use engine (canvas) dimensions to center the slide in the visible viewport
        const engine = mainScene.getEngine();
        const canvasWidth = engine?.width || mainScene.width;
        const canvasHeight = engine?.height || mainScene.height;

        // Add padding around the slide so it's scrollable
        const padding = 100;
        const sceneWidth = Math.max(width + padding * 2, canvasWidth);
        const sceneHeight = Math.max(height + padding * 2, canvasHeight);

        // Resize scene to fit the slide with padding
        mainScene.resize(sceneWidth, sceneHeight);

        const slideComponent = new Slide(SLIDE_KEY.COMPONENT, {
            left: (sceneWidth - width) / 2,
            top: (sceneHeight - height) / 2,
            width,
            height,
            zIndex: 10,
        });

        // slideComponent.enableNav();

        slideComponent.enableSelectedClipElement();

        mainScene.addObject(slideComponent);

        return slideComponent;
    }

    private _addBackgroundRect(scene: Scene, fill: any) {
        const model = this._univerInstanceService.getCurrentUnitForType<SlideDataModel>(UniverInstanceType.UNIVER_SLIDE)!;

        const pageSize = model.getPageSize();

        const { width: pageWidth = 0, height: pageHeight = 0 } = pageSize;

        console.log(`🎨 [BG] _addBackgroundRect called: fill=${JSON.stringify(fill)?.substring(0, 200)}, pageSize=${pageWidth}x${pageHeight}`);

        // Check if background is an image fill (from PPTX import)
        if (fill && fill.image && typeof fill.image === 'string') {
            console.log(`🎨 [BG] Creating IMAGE background: url length=${fill.image.length}`);
            const bgImage = new UniverImage(`canvas_bg_image_${Date.now()}`, {
                url: fill.image,
                left: 0,
                top: 0,
                width: pageWidth,
                height: pageHeight,
                zIndex: 0,
                evented: false,
                forceRender: true,
            });
            scene.addObject(bgImage, 0);
            return;
        }

        // Gradient background: use Canvas native gradient
        if (fill && fill.gradient && fill.gradient.stops && fill.gradient.stops.length >= 2) {
            const { angle = 0, stops } = fill.gradient;
            console.log(`🎨 [BG] Creating GRADIENT background: ${stops.length} stops, angle=${angle}`);

            // White base rect behind gradient — ensures alpha/transparent areas
            // show white instead of canvas default black
            const gradBase = new Rect('canvas-grad-base', {
                left: 0,
                top: 0,
                width: pageWidth,
                height: pageHeight,
                fill: 'rgba(255,255,255,1)',
                zIndex: -1,
                evented: false,
            });
            scene.addObject(gradBase, 0);

            const page = new Rect('canvas', {
                left: 0,
                top: 0,
                width: pageWidth,
                height: pageHeight,
                strokeWidth: 1,
                stroke: 'rgba(198,198,198,1)',
                fill: 'rgba(255,255,255,0)',
                zIndex: 0,
                evented: false,
            });

            // Override draw to use native canvas gradient
            const origDraw = page.render.bind(page);
            page.render = (ctx: any, ...args: any[]) => {
                if (ctx && ctx._context) {
                    const rad = (angle * Math.PI) / 180;
                    const cx = pageWidth / 2;
                    const cy = pageHeight / 2;
                    const d = Math.max(pageWidth, pageHeight);
                    const x0 = cx - (d / 2) * Math.cos(rad);
                    const y0 = cy - (d / 2) * Math.sin(rad);
                    const x1 = cx + (d / 2) * Math.cos(rad);
                    const y1 = cy + (d / 2) * Math.sin(rad);
                    const grad = ctx._context.createLinearGradient(x0, y0, x1, y1);
                    for (const s of stops) {
                        grad.addColorStop(Math.min(1, Math.max(0, s.position)), s.color);
                    }
                    (page as any)._fill = grad;
                }
                return origDraw(ctx, ...args);
            };
            scene.addObject(page, 0);
            return;
        }

        // Standard color background
        const fillColor = getColorStyle(fill) || 'rgba(255,255,255,1)';
        console.log(`🎨 [BG] Creating COLOR background: fill=${fillColor}`);
        const page = new Rect(`canvas_${Date.now()}`, {
            left: 0,
            top: 0,
            width: pageWidth,
            height: pageHeight,
            strokeWidth: 1,
            stroke: 'rgba(198,198,198,1)',
            fill: fillColor,
            zIndex: 0,
            evented: false,
        });
        scene.addObject(page, 0);
    }

    private _getCenterPositionViewPort(mainScene?: Scene) {
        if (!mainScene) return { left: 0, top: 0 };
        const { width, height } = mainScene;

        const engine = mainScene.getEngine();

        const canvasWidth = engine?.width || 0;
        const canvasHeight = engine?.height || 0;

        return {
            left: (width - canvasWidth) / 2,
            top: (height - canvasHeight) / 2,
        };
    }

    private _thumbSceneRender(pageId: string, slide: Slide) {
        const render = this._renderManagerService.getRenderById(pageId);

        if (render == null) {
            return;
        }

        const { engine: thumbEngine } = render;

        if (thumbEngine == null) {
            return;
        }

        const { width, height } = slide;

        const { width: pageWidth = width, height: pageHeight = height } = thumbEngine;

        const thumbContext = thumbEngine.getCanvas().getContext();

        slide.renderToThumb(thumbContext, pageId, pageWidth / width, pageHeight / height);
    }

    /**
     * CreateScene by pages, and activate first one.
     * @param slideDataModel
     * @param slide
     */
    private _createSlidePages(slideDataModel: SlideDataModel, slide: Slide) {
        const pages = slideDataModel.getPages();

        const pageOrder = slideDataModel.getPageOrder();

        if (!pages || !pageOrder) {
            return;
        }

        if (pageOrder.length === 0) {
            return;
        }

        for (let i = 0, len = pageOrder.length; i < len; i++) {
            const pageId = pageOrder[i];

            this.createPageScene(pageId, pages[pageId]);

            this._createThumb(pageId);
        }

        // setTimeout(() => {
        //     for (let i = 0, len = pageOrder.length; i < len; i++) {
        //         const pageId = pageOrder[i];

        //         this._thumbSceneRender(pageId, slide);
        //     }
        // }, 0);

        slide.activeFirstPage();
    }

    private _createThumb(pageId: string) {
        this._renderManagerService.createRender(pageId);
    }

    /**
     * SlideDataModel is UnitModel
     */
    private _getCurrUnitModel() {
        // return this._univerInstanceService.getCurrentUnitForType<SlideDataModel>(UniverInstanceType.UNIVER_SLIDE)!;

        return this._renderContext.unit as SlideDataModel;
    }

    activePage(_pageId?: string) {
        let pageId = _pageId;
        const model = this._getCurrUnitModel();
        let page: Nullable<ISlidePage>;
        if (pageId) {
            page = model.getPage(pageId);
        } else {
            const pageElements = model.getPages();
            const pageOrder = model.getPageOrder();
            if (pageOrder == null || pageElements == null) {
                return;
            }
            page = pageElements[pageOrder[0]];

            pageId = page.id;
        }

        const render = this._currentRender();

        if (page == null || render == null || render.mainComponent == null) {
            return;
        }

        const { id } = page;

        const slide = render.mainComponent as Slide;

        model.setActivePage(page);

        if (slide?.hasPage(id)) {
            slide.changePage(id);
            return;
        }

        this.createPageScene(id, page);
    }

    createThumbs() {
        const slideDataModel = this._getCurrUnitModel();
        const pageOrder = slideDataModel.getPageOrder();

        const render = this._currentRender();

        if (!pageOrder || !render) {
            return;
        }

        if (pageOrder.length === 0) {
            return;
        }

        for (let i = 0, len = pageOrder.length; i < len; i++) {
            const pageId = pageOrder[i];

            this._thumbSceneRender(pageId, render.mainComponent as Slide);
        }
    }

    /**
     * Create scene by page and set to _sceneMap.
     * @param pageId
     * @param page
     */
    createPageScene(pageId: string, page: ISlidePage): Nullable<Scene> {
        // const render = this._currentRender();
        const render = this._renderContext;
        if (!render || !this._objectProvider) {
            return;
        }

        const { scene: mainScene, mainComponent } = render;

        const slide = mainComponent as Slide;
        const { width, height } = slide;

        const pageScene = new Scene(pageId, slide, {
            width,
            height,
        });

        const viewMain = new Viewport(`PageViewer_${pageId}`, pageScene, {
            left: 0,
            top: 0,
            bottom: 0,
            right: 0,
            explicitViewportWidthSet: false,
            explicitViewportHeightSet: false,
        });
        viewMain.closeClip();

        const model = this._getCurrUnitModel();

        // Hierarchy resolution: Slide -> Layout -> Master
        const layoutId = page.slideProperties?.layoutObjectId;
        const layout = layoutId ? model.getLayout(layoutId) : undefined;
        const masterId = layout?.layoutProperties?.masterObjectId;
        const master = masterId ? model.getMaster(masterId) : undefined;

        // Layer Constants
        const LAYER_Z_INDEX = {
            MASTER: 0,
            LAYOUT: 1,
            SLIDE: 2
        };

        // NOTE: Layer caching is intentionally disabled for sub-scenes.
        // enableLayerCache causes a coordinate mismatch where cached layers (background)
        // render at a different position than uncached layers (text objects) within
        // SceneViewer sub-scenes. This is an engine-render bug in Layer cache transform handling.
        // pageScene.enableLayerCache(LAYER_Z_INDEX.MASTER, LAYER_Z_INDEX.LAYOUT);

        // 1. Determine Background (Priority: Slide > Layout > Master)
        const effectiveBackground = page.pageBackgroundFill || layout?.pageBackgroundFill || master?.pageBackgroundFill;

        if (effectiveBackground) {
            // Background goes to Master layer (bottom-most)
            this._addBackgroundRect(pageScene, effectiveBackground);
        }

        // 2. Functional Element Processing (using Layers)
        const addElementsToLayer = (
            elementsMap: Record<string, IPageElement> | undefined,
            layerIndex: number,
            isInteractive: boolean,
            layerName: string = 'unknown'
        ) => {
            if (!elementsMap) {
                console.log(`🔍 [RenderCtrl] addElementsToLayer(${layerName}): no elements map`);
                return;
            }

            console.log(`🔍 [RenderCtrl] addElementsToLayer(${layerName}): ${Object.keys(elementsMap).length} elements, _objectProvider exists: ${!!this._objectProvider}`);

            // Log element types before conversion
            for (const [eid, el] of Object.entries(elementsMap)) {
                console.log(`  🔍 [RenderCtrl] Element ${eid}: type=${el.type}, hasRichText=${!!el.richText}, hasImage=${!!el.image}, hasShape=${!!el.shape}`);
            }

            const objects = this._objectProvider?.convertToRenderObjects(elementsMap, mainScene);

            console.log(`🔍 [RenderCtrl] convertToRenderObjects returned: ${objects?.length ?? 'NULL'} objects`);

            if (!objects) return;

            objects.forEach(obj => {
                obj.evented = isInteractive;
                // Add to specific layer
                pageScene.addObject(obj, layerIndex);
            });

            console.log(`🔍 [RenderCtrl] Added ${objects.length} objects to layer ${layerIndex} (${layerName})`);
            return objects;
        };

        // 3. Render Layers
        addElementsToLayer(master?.pageElements, LAYER_Z_INDEX.MASTER, false, 'master');
        addElementsToLayer(layout?.pageElements, LAYER_Z_INDEX.LAYOUT, false, 'layout');
        const slideObjects = addElementsToLayer(page.pageElements, LAYER_Z_INDEX.SLIDE, true, 'slide') || [];

        console.log(`🔍 [RenderCtrl] Page ${pageId} scene created: ${slideObjects.length} slide objects, bg=${JSON.stringify(effectiveBackground)?.substring(0, 100)}`);


        pageScene.initTransformer();

        // Only attach transformer to Slide objects (interactive ones)
        slideObjects.forEach((object) => {
            pageScene.attachTransformerTo(object);
        });

        const transformer = pageScene.getTransformer();

        transformer?.changeEnd$.subscribe((config) => {
            this._thumbSceneRender(pageId, slide);

            // Persist moved/resized element positions back to SlideDataModel with undo/redo support
            const model = this._getCurrUnitModel();
            if (model && config.objects) {
                const unitId = model.getUnitId();
                const undoMutations: { id: string; params: IUpdateElementOperationParams }[] = [];
                const redoMutations: { id: string; params: IUpdateElementOperationParams }[] = [];

                config.objects.forEach((obj) => {
                    const elementId = obj.oKey;
                    const activePage = model.getActivePage();
                    const element = activePage?.pageElements?.[elementId];
                    if (element) {
                        // Capture previous state for undo
                        undoMutations.push({
                            id: UpdateSlideElementOperation.id,
                            params: {
                                unitId,
                                oKey: elementId,
                                props: {
                                    left: element.left,
                                    top: element.top,
                                    width: element.width,
                                    height: element.height,
                                },
                            },
                        });

                        // New state for redo
                        const newProps = {
                            left: obj.left,
                            top: obj.top,
                            width: obj.width,
                            height: obj.height,
                        };
                        redoMutations.push({
                            id: UpdateSlideElementOperation.id,
                            params: {
                                unitId,
                                oKey: elementId,
                                props: newProps,
                            },
                        });

                        // Execute the mutation to apply the change
                        this._commandService.executeCommand(UpdateSlideElementOperation.id, {
                            unitId,
                            oKey: elementId,
                            props: newProps,
                        });
                    }
                });

                // Push undo/redo pair to the service
                if (undoMutations.length > 0) {
                    this._undoRedoService.pushUndoRedo({
                        unitID: unitId,
                        undoMutations,
                        redoMutations,
                    });
                }
            }
        });

        transformer?.clearControl$.subscribe(() => {
            this._thumbSceneRender(pageId, slide);
        });

        // add SubScene
        slide.addPageScene(pageScene);

        return pageScene;
    }

    /**
     * Get pageScene from Slide.
     * @param pageId
     * @returns {Scene, Engine, UnitModel} scene & engine & unit from renderContext
     */
    getPageRenderUnit(pageId: PageID) {
        //pageScene was added to the mainComponent(Slide) in createPageScene --> slide.addPageScene
        const subsceneMap = (this._renderContext.mainComponent as Slide).getSubScenes();
        const pageScene = subsceneMap.get(pageId) as unknown as Scene;
        const { engine, unit } = this._renderContext;
        return {
            scene: pageScene,
            engine,
            unit,
        };
    }

    createObjectToPage(element: IPageElement, pageID: PageID): Nullable<BaseObject> {
        const { scene } = this.getPageRenderUnit(pageID);

        if (!scene || !this._objectProvider) {
            return;
        }
        const object = this._objectProvider.convertToRenderObject(element, scene);
        if (object) {
            // Layer 2 = SLIDE (interactive), matching createPageScene's LAYER_Z_INDEX.SLIDE
            object.evented = true;
            scene.addObject(object, 2);
            scene.attachTransformerTo(object);
            scene.getLayer(2)?.makeDirty();
            return object;
        }
    }

    setObjectActiveByPage(obj: BaseObject, pageID: PageID) {
        const { scene } = this.getPageRenderUnit(pageID);
        if (!scene) return;
        const transformer = scene.getTransformer();
        transformer?.activeAnObject(obj);
    }

    removeObjectById(id: string, pageID: PageID) {
        const { scene } = this.getPageRenderUnit(pageID);
        if (!scene) return;
        scene.removeObject(id);
        const transformer = scene.getTransformer();
        transformer?.clearControls();
    }

    appendPage() {
        const model = this._getCurrUnitModel();
        const page = model.getBlankPage();
        const render = this._currentRender();

        if (page == null || render == null || render.mainComponent == null) {
            return;
        }

        const { id: pageId } = page;

        const slide = render.mainComponent as Slide;
        const scene = this.createPageScene(pageId, page);

        if (slide && scene) {
            slide.addPageScene(scene);
        }

        model.appendPage(page);
        model.setActivePage(page);
    }
}
