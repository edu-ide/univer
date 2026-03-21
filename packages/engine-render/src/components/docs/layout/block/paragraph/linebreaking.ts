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

import type { IBullet, IDocDrawingBase, IDrawings, IParagraph, IVisualDocBlock, Nullable } from '@univerjs/core';
import type { IDocumentSkeletonBullet, IDocumentSkeletonDrawing, IDocumentSkeletonPage, IDocumentSkeletonTable, IParagraphList } from '../../../../../basics/i-document-skeleton-cached';
import type { IParagraphConfig, ISectionBreakConfig } from '../../../../../basics/interfaces';
import type { DataStreamTreeNode } from '../../../view-model/data-stream-tree-node';
import type { DocumentViewModel } from '../../../view-model/document-view-model';
import type { ILayoutContext } from '../../tools';
import type { IShapedText } from './shaping';
import { DataStreamTreeTokenType, DrawingTypeEnum, PositionedObjectLayoutType, Tools } from '@univerjs/core';
import { BreakType } from '../../../../../basics/i-document-skeleton-cached';
import { prepareParagraphBody } from '../../shaping-engine/utils';
import { BreakPointType } from '../../line-breaker/break';
import { createSkeletonPage } from '../../model/page';
import { setColumnFullState } from '../../model/section';
import { getLastNotFullColumnInfo } from '../../tools';
import { dealWithBullet } from './bullet';
import { layoutParagraph } from './layout-ruler';

function _getListLevelAncestors(
    bullet?: IBullet,
    listLevel?: Map<string, IParagraphList[][]>
): Array<Nullable<IDocumentSkeletonBullet>> | undefined {
    if (!bullet || !listLevel) {
        return;
    }

    const { listId, nestingLevel } = bullet;

    const sameList = listLevel?.get(listId);

    let level = nestingLevel;

    if (level < 0) {
        level = 0;
    }

    const listLevelAncestors: Array<Nullable<IDocumentSkeletonBullet>> = [];

    for (let i = level; i >= 0; i--) {
        if (Array.isArray(sameList?.[i])) {
            const len = sameList[i].length;

            listLevelAncestors[i] = sameList[i][len - 1]?.bullet ?? null;
        } else {
            listLevelAncestors[i] = null;
        }
    }

    return listLevelAncestors;
}

function _updateListLevelAncestors(
    paragraph: IParagraph,
    bullet?: IBullet,
    bulletSkeleton?: IDocumentSkeletonBullet,
    listLevel?: Map<string, IParagraphList[][]>
) {
    if (!bullet || !bulletSkeleton) {
        return;
    }

    const { listId, nestingLevel } = bullet;

    const cacheItem: IParagraphList[][] = [...(listLevel?.get(listId) || [])];

    // [[nestingLevel, bulletSkeleton]];

    if (cacheItem[nestingLevel] == null) {
        cacheItem[nestingLevel] = [];
    }
    cacheItem[nestingLevel].push({
        bullet: bulletSkeleton,
        paragraph,
    });

    cacheItem.splice(nestingLevel + 1); // 文档自上而下渲染，如果一个level被更新，则它以下的level数据的startIndex就要重置

    listLevel?.set(listId, cacheItem);
}

function _changeDrawingToSkeletonFormat(
    drawingIds: string[],
    drawings: IDrawings
): Map<string, IDocumentSkeletonDrawing> {
    const skeDrawings: Map<string, IDocumentSkeletonDrawing> = new Map();
    drawingIds.forEach((drawingId) => {
        const drawingOrigin = drawings[drawingId];
        drawingOrigin && skeDrawings.set(drawingId, _getDrawingSkeletonFormat(drawingOrigin));
    });
    return skeDrawings;
}

function _getDrawingSkeletonFormat(drawingOrigin: IDocDrawingBase): IDocumentSkeletonDrawing {
    const { drawingId } = drawingOrigin;

    return {
        drawingId,
        aLeft: 0,
        aTop: 0,
        width: 0,
        height: 0,
        angle: 0,
        initialState: false,
        drawingOrigin,
        columnLeft: 0,
        lineHeight: 0,
        lineTop: 0,
        blockAnchorTop: 0,
        isPageBreak: false,
    };
}

function _getVisualBlockSize(visualBlock: Nullable<IVisualDocBlock>) {
    if (visualBlock == null) {
        return null;
    }

    if (
        visualBlock.kind === 'notice_box_block'
        || visualBlock.kind === 'form_grid_block'
        || visualBlock.kind === 'form_box_block'
        || visualBlock.kind === 'title_box_block'
        || visualBlock.kind === 'section_body_block'
        || visualBlock.kind === 'page_number_block'
    ) {
        return { width: visualBlock.outerWidth || 0, height: visualBlock.outerHeight || 0 };
    }

    return null;
}

function _getVisualBlockSkeletonFormat(blockId: string, visualBlock: IVisualDocBlock): IDocumentSkeletonDrawing {
    const size = _getVisualBlockSize(visualBlock) ?? { width: 0, height: 0 };
    const drawingOrigin = {
        unitId: '',
        subUnitId: '',
        drawingId: blockId,
        drawingType: DrawingTypeEnum.DRAWING_DOM,
        title: '',
        description: '',
        docTransform: {
            size,
            angle: 0,
            positionH: {},
            positionV: {},
        },
        layoutType: PositionedObjectLayoutType.INLINE,
    } as unknown as IDocDrawingBase;

    const skeleton = _getDrawingSkeletonFormat(drawingOrigin);
    skeleton.width = size.width;
    skeleton.height = size.height;
    return skeleton;
}

function _getNextPageNumber(lastPage: IDocumentSkeletonPage) {
    return lastPage.pageNumber + 1;
}

export function lineBreaking(
    ctx: ILayoutContext,
    viewModel: DocumentViewModel,
    shapedTextList: IShapedText[],
    curPage: IDocumentSkeletonPage,
    paragraphNode: DataStreamTreeNode,
    sectionBreakConfig: ISectionBreakConfig,
    tableSkeleton: Nullable<IDocumentSkeletonTable>
): IDocumentSkeletonPage[] {
    const { skeletonResourceReference } = ctx;
    const {
        lists,
        drawings = {},
        localeService,
    } = sectionBreakConfig;

    const { endIndex, blocks = [], children } = paragraphNode;
    const { segmentId } = curPage;

    const paragraph = viewModel.getParagraph(endIndex) || { startIndex: 0 };
    const paragraphBody = prepareParagraphBody(viewModel.getBody()!, endIndex);

    const { paragraphStyle = {}, bullet } = paragraph;
    const explicitBreakTokens = Array.from(paragraphBody.dataStream).filter(
        (char) => char === DataStreamTreeTokenType.PAGE_BREAK || char === DataStreamTreeTokenType.COLUMN_BREAK
    );

    const { skeHeaders, skeFooters, skeListLevel, drawingAnchor } = skeletonResourceReference;

    const paragraphNonInlineSkeDrawings: Map<string, IDocumentSkeletonDrawing> = new Map();
    const paragraphInlineSkeDrawings: Map<string, IDocumentSkeletonDrawing> = new Map();

    let segmentDrawingAnchorCache = drawingAnchor?.get(segmentId);

    if (segmentDrawingAnchorCache == null) {
        segmentDrawingAnchorCache = new Map();
        drawingAnchor?.set(segmentId, segmentDrawingAnchorCache);
    }

    const paragraphConfig: IParagraphConfig = {
        paragraphIndex: endIndex,
        // TODO optimize this deepClone
        paragraphStyle: Tools.deepClone(paragraphStyle),
        paragraphNonInlineSkeDrawings,
        paragraphInlineSkeDrawings,
        skeTablesInParagraph: tableSkeleton
            ? [
                {
                    tableId: tableSkeleton.tableId,
                    table: tableSkeleton,
                    hasPositioned: false,
                    isSlideTable: false,
                    tableNode: children[0],
                },
            ]
            : undefined,
        skeHeaders,
        skeFooters,
        pDrawingAnchor: segmentDrawingAnchorCache,
    };

    let segmentParagraphCache = ctx.paragraphConfigCache.get(segmentId);

    if (segmentParagraphCache == null) {
        segmentParagraphCache = new Map();
        ctx.paragraphConfigCache.set(segmentId, segmentParagraphCache);
    }

    if (segmentParagraphCache.has(endIndex)) {
        const bulletSkeleton = segmentParagraphCache.get(endIndex)?.bulletSkeleton;

        paragraphConfig.bulletSkeleton = bulletSkeleton;
    } else {
        const listLevelAncestors = _getListLevelAncestors(bullet, skeListLevel); // 取得列表所有 level 的缓存
        const bulletSkeleton = dealWithBullet(bullet, lists, listLevelAncestors, localeService); // 生成 bullet

        _updateListLevelAncestors(paragraph, bullet, bulletSkeleton, skeListLevel); // 更新最新的 level 缓存列表

        paragraphConfig.bulletSkeleton = bulletSkeleton;
    }

    for (let i = 0, len = blocks.length; i < len; i++) {
        const charIndex = blocks[i];
        const customBlock = viewModel.getCustomBlock(charIndex)
            || (i === 0 ? viewModel.getCustomBlock(charIndex - 1) : null);

        if (customBlock == null) {
            continue;
        }

        const { blockId } = customBlock;
        const drawingOrigin = drawings[blockId];
        const visualBlock = viewModel.getSnapshot().visualBlocks?.[blockId] ?? null;

        if (drawingOrigin != null) {
            if (drawingOrigin.layoutType === PositionedObjectLayoutType.INLINE) {
                paragraphInlineSkeDrawings.set(blockId, _getDrawingSkeletonFormat(drawingOrigin));
            } else {
                paragraphNonInlineSkeDrawings.set(blockId, _getDrawingSkeletonFormat(drawingOrigin));
            }
            continue;
        }

        if (visualBlock != null) {
            paragraphInlineSkeDrawings.set(blockId, _getVisualBlockSkeletonFormat(blockId, visualBlock));
        }
    }

    segmentParagraphCache.set(endIndex, paragraphConfig);

    let allPages = [curPage];
    let isParagraphFirstShapedText = true; // 第一个分词
    let handledPageBreaks = 0;
    let handledColumnBreaks = 0;
    for (const [_index, { text, glyphs, breakPointType }] of shapedTextList.entries()) {
        const pushPending = (
            pendingGlyphs: typeof glyphs = glyphs,
            pendingBreakPointType: BreakPointType = breakPointType
        ) => {
            if (pendingGlyphs.length === 0) {
                return;
            }

            allPages = layoutParagraph(
                ctx,
                pendingGlyphs,
                allPages,
                sectionBreakConfig,
                paragraphConfig,
                isParagraphFirstShapedText,
                pendingBreakPointType
            );

            isParagraphFirstShapedText = false;
        };

        let segmentStart = 0;
        for (let glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
            const glyph = glyphs[glyphIndex];
            if (glyph.content !== DataStreamTreeTokenType.PAGE_BREAK && glyph.content !== DataStreamTreeTokenType.COLUMN_BREAK) {
                continue;
            }

            const beforeBreakGlyphs = glyphs.slice(segmentStart, glyphIndex);
            pushPending(beforeBreakGlyphs, BreakPointType.Normal);

            if (glyph.content === DataStreamTreeTokenType.PAGE_BREAK) {
                handledPageBreaks += 1;
                allPages.push(
                    createSkeletonPage(
                        ctx,
                        sectionBreakConfig,
                        skeletonResourceReference,
                        _getNextPageNumber(allPages[allPages.length - 1]),
                        BreakType.PAGE
                    )
                );
                paragraphNonInlineSkeDrawings.clear();
                paragraphInlineSkeDrawings.clear();
            } else if (glyph.content === DataStreamTreeTokenType.COLUMN_BREAK) {
                handledColumnBreaks += 1;
                const lastPage = allPages[allPages.length - 1];
                const columnInfo = getLastNotFullColumnInfo(lastPage);

                if (columnInfo && !columnInfo.isLast) {
                    setColumnFullState(columnInfo.column, true);
                } else {
                    allPages.push(
                        createSkeletonPage(
                            ctx,
                            sectionBreakConfig,
                            skeletonResourceReference,
                            _getNextPageNumber(lastPage),
                            BreakType.COLUMN
                        )
                    );
                }
            }

            segmentStart = glyphIndex + 1;
        }

        const trailingGlyphs = glyphs.slice(segmentStart);
        pushPending(trailingGlyphs, breakPointType);
    }

    let remainingPageBreaks = handledPageBreaks;
    let remainingColumnBreaks = handledColumnBreaks;
    for (const token of explicitBreakTokens) {
        if (token === DataStreamTreeTokenType.PAGE_BREAK) {
            if (remainingPageBreaks > 0) {
                remainingPageBreaks -= 1;
                continue;
            }

            allPages.push(
                createSkeletonPage(
                    ctx,
                    sectionBreakConfig,
                    skeletonResourceReference,
                    _getNextPageNumber(allPages[allPages.length - 1]),
                    BreakType.PAGE
                )
            );
            paragraphNonInlineSkeDrawings.clear();
            paragraphInlineSkeDrawings.clear();
            continue;
        }

        if (token === DataStreamTreeTokenType.COLUMN_BREAK) {
            if (remainingColumnBreaks > 0) {
                remainingColumnBreaks -= 1;
                continue;
            }

            const lastPage = allPages[allPages.length - 1];
            const columnInfo = getLastNotFullColumnInfo(lastPage);

            if (columnInfo && !columnInfo.isLast) {
                setColumnFullState(columnInfo.column, true);
            } else {
                allPages.push(
                    createSkeletonPage(
                        ctx,
                        sectionBreakConfig,
                        skeletonResourceReference,
                        _getNextPageNumber(lastPage),
                        BreakType.COLUMN
                    )
                );
            }
        }
    }

    return allPages;
}
