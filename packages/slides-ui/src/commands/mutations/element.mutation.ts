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

import type { ICommand, IPageElement, SlideDataModel } from '@univerjs/core';
import { CommandType, IUniverInstanceService } from '@univerjs/core';

/**
 * Mutation to add an element to a slide page (DATA ONLY).
 * Scene rendering is handled by SlideRenderController's onCommandExecuted listener.
 * Undo: RemoveSlideElementMutation
 */
export interface IAddSlideElementMutationParams {
    unitId: string;
    pageId: string;
    element: IPageElement;
}

export const AddSlideElementMutation: ICommand<IAddSlideElementMutationParams> = {
    id: 'slide.mutation.add-element',
    type: CommandType.MUTATION,
    handler: (accessor, params) => {
        if (!params) return false;
        const { unitId, pageId, element } = params;

        const univerInstanceService = accessor.get(IUniverInstanceService);
        const slideData = univerInstanceService.getUnit<SlideDataModel>(unitId);
        if (!slideData) return false;

        const page = slideData.getPage(pageId);
        if (!page) return false;

        // Add element to data model only
        page.pageElements[element.id] = element;
        slideData.updatePage(pageId, page);

        return true;
    },
};

/**
 * Mutation to remove an element from a slide page (DATA ONLY).
 * Scene rendering is handled by SlideRenderController's onCommandExecuted listener.
 * Undo: AddSlideElementMutation
 */
export interface IRemoveSlideElementMutationParams {
    unitId: string;
    pageId: string;
    elementId: string;
    /** Saved element data for undo restoration (not used by this mutation, stored for undo) */
    elementData?: IPageElement;
}

export const RemoveSlideElementMutation: ICommand<IRemoveSlideElementMutationParams> = {
    id: 'slide.mutation.remove-element',
    type: CommandType.MUTATION,
    handler: (accessor, params) => {
        if (!params) return false;
        const { unitId, pageId, elementId } = params;

        const univerInstanceService = accessor.get(IUniverInstanceService);
        const slideData = univerInstanceService.getUnit<SlideDataModel>(unitId);
        if (!slideData) return false;

        const page = slideData.getPage(pageId);
        if (!page) return false;

        // Remove element from data model only
        delete page.pageElements[elementId];
        slideData.updatePage(pageId, page);

        return true;
    },
};
