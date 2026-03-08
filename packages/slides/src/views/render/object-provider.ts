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

import './adaptors';

import type { IPageElement } from '@univerjs/core';
import { Inject, Injector, sortRules } from '@univerjs/core';
import type { BaseObject, Scene } from '@univerjs/engine-render';

import type { ObjectAdaptor } from './adaptor';
import { CanvasObjectProviderRegistry } from './adaptor';

export class ObjectProvider {
    private _adaptors: ObjectAdaptor[] = [];

    constructor(@Inject(Injector) private readonly _injector: Injector) {
        this._adaptorLoader();
    }

    convertToRenderObjects(pageElements: { [elementId: string]: IPageElement }, mainScene: Scene) {
        const pageKeys = Object.keys(pageElements);
        const objects: BaseObject[] = [];
        console.log(`🔍 [ObjectProvider] convertToRenderObjects called with ${pageKeys.length} elements, ${this._adaptors.length} adaptors loaded`);
        if (this._adaptors.length > 0) {
            console.log(`🔍 [ObjectProvider] Adaptor types:`, this._adaptors.map((a: any) => `${a.constructor?.name || 'unknown'}(viewKey=${a.viewKey})`).join(', '));
        }
        pageKeys.forEach((key) => {
            const pageElement = pageElements[key];
            const o = this._executor(pageElement, mainScene);
            if (o != null) {
                objects.push(o);
            } else {
                console.warn(`⚠️ [ObjectProvider] Element ${key} (type=${pageElement.type}) returned null from _executor`);
            }
        });
        console.log(`🔍 [ObjectProvider] Converted ${objects.length}/${pageKeys.length} elements to render objects`);
        return objects;
    }

    convertToRenderObject(pageElement: IPageElement, mainScene: Scene) {
        return this._executor(pageElement, mainScene);
    }

    private _executor(pageElement: IPageElement, mainScene: Scene) {
        const { id: pageElementId, type } = pageElement;

        for (const adaptor of this._adaptors) {
            const checked = adaptor.check(type);
            if (checked) {
                try {
                    const o = checked.convert(pageElement, mainScene);
                    if (o != null) {
                        return o;
                    } else {
                        console.warn(`⚠️ [ObjectProvider] Adaptor ${(adaptor as any).constructor?.name} check passed but convert returned null for ${pageElementId} (type=${type})`);
                    }
                } catch (err) {
                    console.error(`❌ [ObjectProvider] Adaptor ${(adaptor as any).constructor?.name} convert threw for ${pageElementId} (type=${type}):`, err);
                }
            }
        }
    }

    private _adaptorLoader() {
        CanvasObjectProviderRegistry.getData()
            .sort(sortRules)
            .forEach((adaptorFactory: ObjectAdaptor) => {
                this._adaptors.push(adaptorFactory.create(this._injector) as unknown as ObjectAdaptor);
            });
    }
}
