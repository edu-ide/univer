import { CommandType, ICommand, IUniverInstanceService, UniverInstanceType } from '@univerjs/core';
import type { IAccessor } from '@wendellhu/redi';
import type { IPageElement } from '@univerjs/core';
import { SlideDataModel } from '@univerjs/core';

export interface IAddSlideElementMutationParams {
    unitId: string;
    pageId: string;
    element: IPageElement;
}

export const AddSlideElementMutation: ICommand<IAddSlideElementMutationParams> = {
    id: 'slide.mutation.add-slide-element',
    type: CommandType.MUTATION,
    handler: (accessor: IAccessor, params: IAddSlideElementMutationParams) => {
        const { unitId, pageId, element } = params;
        const univerInstanceService = accessor.get(IUniverInstanceService);
        const slideDataModel = univerInstanceService.getUnit<SlideDataModel>(unitId, UniverInstanceType.UNIVER_SLIDE);

        if (!slideDataModel) {
            console.error(`[AddSlideElementMutation] Slide Data Model not found for unitId: ${unitId}`);
            return false;
        }

        const page = slideDataModel.getPage(pageId);
        if (!page) {
            console.error(`[AddSlideElementMutation] Page not found for pageId: ${pageId}`);
            return false;
        }

        // Mutation: directly modify the page elements map
        if (!page.pageElements) {
            page.pageElements = {};
        }
        page.pageElements[element.id] = element;

        return true;
    },
};
