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

import type { Injector, IPageElement } from '@univerjs/core';
import { BasicShapes, getColorStyle, PageElementType } from '@univerjs/core';
import { Circle, Path, Rect } from '@univerjs/engine-render';

import { CanvasObjectProviderRegistry, ObjectAdaptor } from '../adaptor';

export class ShapeAdaptor extends ObjectAdaptor {
    override zIndex = 2;

    override viewKey = PageElementType.SHAPE;

    override check(type: PageElementType) {
        if (type !== this.viewKey) {
            return;
        }
        return this;
    }

    override convert(pageElement: IPageElement) {
        const {
            id,
            zIndex,
            left = 0,
            top = 0,
            width,
            height,
            angle,
            scaleX,
            scaleY,
            skewX,
            skewY,
            flipX,
            flipY,
            title,
            description,
        } = pageElement;
        const { shapeType, text, shapeProperties, placeholder, link } = pageElement.shape || {};

        const fill =
            shapeProperties == null ? '' : getColorStyle(shapeProperties.shapeBackgroundFill) || 'rgba(255,255,255,1)';

        const outline = shapeProperties?.outline;
        const strokeStyle: { [key: string]: string | number } = {};
        if (outline) {
            const { outlineFill, weight } = outline;

            strokeStyle.strokeWidth = weight;
            strokeStyle.stroke = getColorStyle(outlineFill) || 'rgba(0,0,0,1)';
        }

        if (shapeType === BasicShapes.Rect) {
            return new Rect(id, {
                fill,
                top,
                left,
                width,
                height,
                zIndex,
                angle,
                scaleX,
                scaleY,
                skewX,
                skewY,
                flipX,
                flipY,
                forceRender: true,
                ...strokeStyle,
            });
        }
        if (shapeType === BasicShapes.RoundRect) {
            const radius = shapeProperties?.radius || 0;
            return new Rect(id, {
                fill,
                top,
                left,
                width,
                height,
                zIndex,
                angle,
                scaleX,
                scaleY,
                skewX,
                skewY,
                flipX,
                flipY,
                forceRender: true,
                radius,
                ...strokeStyle,
            });
        }
        if (shapeType === BasicShapes.Ellipse) {
            const radius = shapeProperties?.radius || 0;
            return new Circle(id, {
                fill,
                top,
                left,
                width,
                height,
                zIndex,
                angle,
                scaleX,
                scaleY,
                skewX,
                skewY,
                flipX,
                flipY,
                forceRender: true,
                radius,
                ...strokeStyle,
            });
        }

        // --- Polygon shapes rendered via Path with SVG path data ---
        const polygonPathMap: Record<string, (w: number, h: number) => string> = {
            diamond: (w, h) => `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`,
            triangle: (w, h) => `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`,
            rtTriangle: (w, h) => `M 0 0 L ${w} ${h} L 0 ${h} Z`,
            parallelogram: (w, h) => `M ${w * 0.25} 0 L ${w} 0 L ${w * 0.75} ${h} L 0 ${h} Z`,
            trapezoid: (w, h) => `M ${w * 0.2} 0 L ${w * 0.8} 0 L ${w} ${h} L 0 ${h} Z`,
            pentagon: (w, h) => {
                const cx = w / 2;
                const cy = h / 2;
                const r = Math.min(w, h) / 2;
                const pts = Array.from({ length: 5 }, (_, i) => {
                    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
                    return `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
                });
                return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
            },
            hexagon: (w, h) => {
                const cx = w / 2;
                const cy = h / 2;
                const r = Math.min(w, h) / 2;
                const pts = Array.from({ length: 6 }, (_, i) => {
                    const a = (i * 2 * Math.PI) / 6 - Math.PI / 6;
                    return `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
                });
                return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
            },
            octagon: (w, h) => {
                const cx = w / 2;
                const cy = h / 2;
                const r = Math.min(w, h) / 2;
                const pts = Array.from({ length: 8 }, (_, i) => {
                    const a = (i * 2 * Math.PI) / 8 - Math.PI / 8;
                    return `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
                });
                return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
            },
            star4: (w, h) => {
                const cx = w / 2;
                const cy = h / 2;
                return `M ${cx} 0 L ${cx * 1.3} ${cy * 0.7} L ${w} ${cy} L ${cx * 1.3} ${cy * 1.3} L ${cx} ${h} L ${cx * 0.7} ${cy * 1.3} L 0 ${cy} L ${cx * 0.7} ${cy * 0.7} Z`;
            },
            star5: (w, h) => {
                const cx = w / 2;
                const cy = h / 2;
                const r = Math.min(w, h) / 2;
                const ri = r * 0.4;
                const pts: string[] = [];
                for (let i = 0; i < 5; i++) {
                    const aOuter = (i * 2 * Math.PI) / 5 - Math.PI / 2;
                    const aInner = aOuter + Math.PI / 5;
                    pts.push(`${cx + r * Math.cos(aOuter)} ${cy + r * Math.sin(aOuter)}`);
                    pts.push(`${cx + ri * Math.cos(aInner)} ${cy + ri * Math.sin(aInner)}`);
                }
                return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
            },
            // --- Arrows ---
            rightArrow: (w, h) => `M 0 ${h * 0.25} L ${w * 0.65} ${h * 0.25} L ${w * 0.65} 0 L ${w} ${h / 2} L ${w * 0.65} ${h} L ${w * 0.65} ${h * 0.75} L 0 ${h * 0.75} Z`,
            leftArrow: (w, h) => `M ${w} ${h * 0.25} L ${w * 0.35} ${h * 0.25} L ${w * 0.35} 0 L 0 ${h / 2} L ${w * 0.35} ${h} L ${w * 0.35} ${h * 0.75} L ${w} ${h * 0.75} Z`,
            upArrow: (w, h) => `M ${w * 0.25} ${h} L ${w * 0.25} ${h * 0.35} L 0 ${h * 0.35} L ${w / 2} 0 L ${w} ${h * 0.35} L ${w * 0.75} ${h * 0.35} L ${w * 0.75} ${h} Z`,
            downArrow: (w, h) => `M ${w * 0.25} 0 L ${w * 0.75} 0 L ${w * 0.75} ${h * 0.65} L ${w} ${h * 0.65} L ${w / 2} ${h} L 0 ${h * 0.65} L ${w * 0.25} ${h * 0.65} Z`,
            leftRightArrow: (w, h) => `M 0 ${h / 2} L ${w * 0.15} ${h * 0.2} L ${w * 0.15} ${h * 0.35} L ${w * 0.85} ${h * 0.35} L ${w * 0.85} ${h * 0.2} L ${w} ${h / 2} L ${w * 0.85} ${h * 0.8} L ${w * 0.85} ${h * 0.65} L ${w * 0.15} ${h * 0.65} L ${w * 0.15} ${h * 0.8} Z`,
            notchedRightArrow: (w, h) => `M 0 ${h * 0.25} L ${w * 0.65} ${h * 0.25} L ${w * 0.65} 0 L ${w} ${h / 2} L ${w * 0.65} ${h} L ${w * 0.65} ${h * 0.75} L 0 ${h * 0.75} L ${w * 0.1} ${h / 2} Z`,
            chevron: (w, h) => `M 0 0 L ${w * 0.75} 0 L ${w} ${h / 2} L ${w * 0.75} ${h} L 0 ${h} L ${w * 0.25} ${h / 2} Z`,
            homePlate: (w, h) => `M 0 0 L ${w * 0.8} 0 L ${w} ${h / 2} L ${w * 0.8} ${h} L 0 ${h} Z`,
            // --- Callouts ---
            wedgeRectCallout: (w, h) => `M 0 0 L ${w} 0 L ${w} ${h * 0.7} L ${w * 0.55} ${h * 0.7} L ${w * 0.4} ${h} L ${w * 0.35} ${h * 0.7} L 0 ${h * 0.7} Z`,
            wedgeEllipseCallout: (w, h) => {
                const cx = w / 2;
                const cy = h * 0.35;
                const rx = w / 2;
                const ry = h * 0.35;
                return `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} M ${w * 0.45} ${h * 0.65} L ${w * 0.4} ${h} L ${w * 0.55} ${h * 0.65}`;
            },
            cloudCallout: (w, h) => `M ${w * 0.15} ${h * 0.5} Q 0 ${h * 0.3} ${w * 0.2} ${h * 0.15} Q ${w * 0.35} 0 ${w * 0.5} ${h * 0.1} Q ${w * 0.65} 0 ${w * 0.8} ${h * 0.15} Q ${w} ${h * 0.3} ${w * 0.85} ${h * 0.5} Q ${w} ${h * 0.7} ${w * 0.8} ${h * 0.7} Q ${w * 0.65} ${h * 0.85} ${w * 0.5} ${h * 0.7} Q ${w * 0.35} ${h * 0.85} ${w * 0.2} ${h * 0.7} Q 0 ${h * 0.7} ${w * 0.15} ${h * 0.5} Z`,
            // --- Flowchart shapes ---
            flowChartProcess: (w, h) => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
            flowChartDecision: (w, h) => `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`,
            flowChartTerminator: (w, h) => {
                const r = Math.min(w * 0.15, h / 2);
                return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
            },
            flowChartInputOutput: (w, h) => `M ${w * 0.15} 0 L ${w} 0 L ${w * 0.85} ${h} L 0 ${h} Z`,
            flowChartPredefinedProcess: (w, h) => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z M ${w * 0.1} 0 L ${w * 0.1} ${h} M ${w * 0.9} 0 L ${w * 0.9} ${h}`,
            flowChartManualOperation: (w, h) => `M 0 0 L ${w} 0 L ${w * 0.8} ${h} L ${w * 0.2} ${h} Z`,
            // --- Special shapes ---
            heart: (w, h) => {
                const cx = w / 2;
                return `M ${cx} ${h} C ${cx} ${h * 0.65} 0 ${h * 0.4} 0 ${h * 0.25} C 0 0 ${cx} 0 ${cx} ${h * 0.3} C ${cx} 0 ${w} 0 ${w} ${h * 0.25} C ${w} ${h * 0.4} ${cx} ${h * 0.65} ${cx} ${h}`;
            },
            cloud: (w, h) => `M ${w * 0.15} ${h * 0.55} Q 0 ${h * 0.35} ${w * 0.2} ${h * 0.2} Q ${w * 0.35} 0 ${w * 0.5} ${h * 0.15} Q ${w * 0.65} 0 ${w * 0.8} ${h * 0.2} Q ${w} ${h * 0.35} ${w * 0.85} ${h * 0.55} Q ${w} ${h * 0.75} ${w * 0.8} ${h * 0.8} Q ${w * 0.65} ${h} ${w * 0.5} ${h * 0.85} Q ${w * 0.35} ${h} ${w * 0.2} ${h * 0.8} Q 0 ${h * 0.75} ${w * 0.15} ${h * 0.55} Z`,
            donut: (w, h) => {
                const cx = w / 2;
                const cy = h / 2;
                const r = Math.min(w, h) / 2;
                const ri = r * 0.5;
                return `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} Z M ${cx + ri} ${cy} A ${ri} ${ri} 0 1 1 ${cx - ri} ${cy} A ${ri} ${ri} 0 1 1 ${cx + ri} ${cy} Z`;
            },
            // N-gon helpers for remaining star/polygon variants
            heptagon: (w, h) => {
                const cx = w / 2;
                const cy = h / 2;
                const r = Math.min(w, h) / 2;
                const pts = Array.from({ length: 7 }, (_, i) => {
                    const a = (i * 2 * Math.PI) / 7 - Math.PI / 2;
                    return `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
                });
                return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
            },
            decagon: (w, h) => {
                const cx = w / 2;
                const cy = h / 2;
                const r = Math.min(w, h) / 2;
                const pts = Array.from({ length: 10 }, (_, i) => {
                    const a = (i * 2 * Math.PI) / 10 - Math.PI / 2;
                    return `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
                });
                return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
            },
            dodecagon: (w, h) => {
                const cx = w / 2;
                const cy = h / 2;
                const r = Math.min(w, h) / 2;
                const pts = Array.from({ length: 12 }, (_, i) => {
                    const a = (i * 2 * Math.PI) / 12 - Math.PI / 2;
                    return `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
                });
                return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
            },
            // Remaining star variants (N-pointed star helper)
            star6: (w, h) => {
                const cx = w / 2;
                const cy = h / 2;
                const r = Math.min(w, h) / 2;
                const ri = r * 0.5;
                const pts: string[] = [];
                for (let i = 0; i < 6; i++) {
                    const aO = (i * 2 * Math.PI) / 6 - Math.PI / 2;
                    const aI = aO + Math.PI / 6;
                    pts.push(`${cx + r * Math.cos(aO)} ${cy + r * Math.sin(aO)}`);
                    pts.push(`${cx + ri * Math.cos(aI)} ${cy + ri * Math.sin(aI)}`);
                }
                return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
            },
            star8: (w, h) => {
                const cx = w / 2;
                const cy = h / 2;
                const r = Math.min(w, h) / 2;
                const ri = r * 0.4;
                const pts: string[] = [];
                for (let i = 0; i < 8; i++) {
                    const aO = (i * 2 * Math.PI) / 8 - Math.PI / 2;
                    const aI = aO + Math.PI / 8;
                    pts.push(`${cx + r * Math.cos(aO)} ${cy + r * Math.sin(aO)}`);
                    pts.push(`${cx + ri * Math.cos(aI)} ${cy + ri * Math.sin(aI)}`);
                }
                return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
            },
            // Misc shapes
            plaque: (w, h) => {
                const r = Math.min(w, h) * 0.15;
                return `M ${r} 0 L ${w - r} 0 Q ${w} ${r} ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
            },
            frame: (w, h) => {
                const t = Math.min(w, h) * 0.12;
                return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z M ${t} ${t} L ${t} ${h - t} L ${w - t} ${h - t} L ${w - t} ${t} Z`;
            },
        };

        const pathGen = polygonPathMap[shapeType as string];
        if (pathGen) {
            const pathData = pathGen(width || 100, height || 100);
            return new Path(id, {
                data: pathData,
                fill,
                top,
                left,
                width,
                height,
                zIndex,
                angle,
                scaleX,
                scaleY,
                skewX,
                skewY,
                flipX,
                flipY,
                forceRender: true,
                ...strokeStyle,
            });
        }

        // Line shape
        const st = shapeType as string;
        if (st === 'line' || st === 'lineInv' || st === 'straightConnector1' || st === 'bentConnector3') {
            const h2 = (height || 2) / 2;
            const lineData = `M 0 ${h2} L ${width || 100} ${h2}`;
            return new Path(id, {
                data: lineData,
                fill: 'none',
                top,
                left,
                width,
                height,
                zIndex,
                angle,
                scaleX,
                scaleY,
                skewX,
                skewY,
                flipX,
                flipY,
                forceRender: true,
                ...strokeStyle,
                stroke: (strokeStyle.stroke as string) || 'rgba(0,0,0,1)',
                strokeWidth: (strokeStyle.strokeWidth as number) || 1,
            });
        }

        // Fallback: render any unknown/unsupported shape type as a Rect
        return new Rect(id, {
            fill,
            top,
            left,
            width,
            height,
            zIndex,
            angle,
            scaleX,
            scaleY,
            skewX,
            skewY,
            flipX,
            flipY,
            forceRender: true,
            ...strokeStyle,
        });
    }
}

export class ShapeAdaptorFactory {
    readonly zIndex = 2;

    create(injector: Injector): ShapeAdaptor {
        const shapeAdaptor = injector.createInstance(ShapeAdaptor);
        return shapeAdaptor;
    }
}

CanvasObjectProviderRegistry.add(new ShapeAdaptorFactory());
