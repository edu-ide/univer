
import { describe, expect, it } from 'vitest';
import { SlideDataModel } from '../slide-model';
import { PageType, ISlideData } from '../../types/interfaces';

describe('SlideDataModel', () => {
    it('should retrieve layouts and masters correctly', () => {
        const masterId = 'master1';
        const layoutId = 'layout1';
        const slideId = 'slide1';

        const snapshot: Partial<ISlideData> = {
            id: 'test-slide',
            title: 'Test Presentation',
            pageSize: { width: 100, height: 100 },
            body: {
                pages: {
                    [slideId]: {
                        id: slideId,
                        pageType: PageType.SLIDE,
                        zIndex: 1,
                        title: 'Slide 1',
                        description: '',
                        pageBackgroundFill: { rgb: 'white' },
                        pageElements: {},
                        slideProperties: {
                            layoutObjectId: layoutId,
                            masterObjectId: '',
                            isSkipped: false,
                        }
                    }
                },
                pageOrder: [slideId]
            },
            layouts: {
                [layoutId]: {
                    id: layoutId,
                    pageType: PageType.LAYOUT,
                    zIndex: 0,
                    title: 'Layout 1',
                    description: '',
                    pageBackgroundFill: { rgb: 'gray' },
                    pageElements: {},
                    layoutProperties: {
                        masterObjectId: masterId,
                        name: 'Title Layout'
                    }
                }
            },
            master: {
                [masterId]: {
                    id: masterId,
                    pageType: PageType.MASTER,
                    zIndex: 0,
                    title: 'Master 1',
                    description: '',
                    pageBackgroundFill: { rgb: 'black' },
                    pageElements: {},
                    masterProperties: {
                        name: 'Office Theme'
                    }
                }
            }
        };

        const model = new SlideDataModel(snapshot);

        expect(model.getLayout(layoutId)).toBeDefined();
        expect(model.getLayout(layoutId)?.id).toBe(layoutId);
        expect(model.getMaster(masterId)).toBeDefined();
        expect(model.getMaster(masterId)?.id).toBe(masterId);

        // Verify relationship
        const slide = model.getPage(slideId);
        const layoutIds = slide?.slideProperties?.layoutObjectId;
        expect(layoutIds).toBe(layoutId);

        const layout = model.getLayout(layoutIds!);
        const masterIds = layout?.layoutProperties?.masterObjectId;
        expect(masterIds).toBe(masterId);
    });
});
