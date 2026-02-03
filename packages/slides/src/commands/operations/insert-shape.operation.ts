import { CommandType, ICommand, ICommandService, PageElementType, generateRandomId } from '@univerjs/core';
import type { IAccessor } from '@wendellhu/redi';
import { AddSlideElementMutation } from '../mutations/add-slide-element.mutation';

export interface IInsertShapeOperationParams {
    unitId: string;
    pageId: string;
    shapeType: any; 
    transform?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export const InsertShapeOperation: ICommand<IInsertShapeOperationParams> = {
    id: 'slide.command.insert-shape',
    type: CommandType.COMMAND,
    handler: async (accessor: IAccessor, params: IInsertShapeOperationParams) => {
        const { unitId, pageId, shapeType, transform } = params;
        const commandService = accessor.get(ICommandService);

        const elementId = generateRandomId(6);

        const element = {
            id: elementId,
            type: PageElementType.SHAPE,
            zIndex: 10, 
            left: transform?.x ?? 100,
            top: transform?.y ?? 100,
            width: transform?.width ?? 100,
            height: transform?.height ?? 100,
            title: 'Shape',
            description: '',
            scaleX: 1,
            scaleY: 1,
            angle: 0,
            skewX: 0,
            skewY: 0,
            flipX: false,
            flipY: false,
            shape: {
                shapeType: shapeType,
                text: '',
                shapeProperties: {
                    shapeBackgroundFill: {
                        rgb: 'rgb(200, 200, 200)'
                    }
                }
            }
        };

        return commandService.executeCommand(AddSlideElementMutation.id, {
            unitId,
            pageId,
            element
        });
    },
};
