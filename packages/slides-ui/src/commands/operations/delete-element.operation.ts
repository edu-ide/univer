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

import type { ICommand, SlideDataModel } from '@univerjs/core';
import { CommandType, ICommandService, IUndoRedoService, IUniverInstanceService } from '@univerjs/core';
import { AddSlideElementMutation, RemoveSlideElementMutation } from '../mutations/element.mutation';

export interface IDeleteElementOperationParams {
    unitId: string;
    id: string;
};

export const DeleteSlideElementCommand: ICommand<IDeleteElementOperationParams> = {
    id: 'slide.command.delete-element',
    type: CommandType.COMMAND,
    handler: (accessor, params) => {
        if (!params?.id) return false;
        const { unitId, id } = params;

        const commandService = accessor.get(ICommandService);
        const undoRedoService = accessor.get(IUndoRedoService);
        const univerInstanceService = accessor.get(IUniverInstanceService);
        const slideData = univerInstanceService.getUnit<SlideDataModel>(unitId);
        if (!slideData) return false;

        const activePage = slideData.getActivePage();
        if (!activePage) return false;

        // Capture full element data before deletion for undo
        const elementData = activePage.pageElements[id];
        if (!elementData) return false;
        const savedElementData = JSON.parse(JSON.stringify(elementData));

        const removeParams = { unitId, pageId: activePage.id, elementId: id };
        const result = commandService.executeCommand(RemoveSlideElementMutation.id, removeParams);
        if (!result) return false;

        // Push undo/redo: undo = add back, redo = remove again
        undoRedoService.pushUndoRedo({
            unitID: unitId,
            undoMutations: [{ id: AddSlideElementMutation.id, params: { unitId, pageId: activePage.id, element: savedElementData } }],
            redoMutations: [{ id: RemoveSlideElementMutation.id, params: removeParams }],
        });

        return true;
    },
};

/**
 * @deprecated Use DeleteSlideElementCommand instead. Kept for backward compatibility.
 */
export const DeleteSlideElementOperation: ICommand<IDeleteElementOperationParams> = {
    id: 'slide.operation.delete-element',
    type: CommandType.OPERATION,
    handler: (accessor, params) => {
        if (!params?.id) return false;
        const commandService = accessor.get(ICommandService);
        return commandService.executeCommand(DeleteSlideElementCommand.id, params);
    },
};
