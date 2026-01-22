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

import type { DocumentDataModel, ICommand, ICommandInfo, IDocumentBody } from '@univerjs/core';
import type { IRichTextEditingMutationParams } from '@univerjs/docs';
import type { ITextRangeWithStyle } from '@univerjs/engine-render';
import { BuildTextUtils, CommandType, ICommandService, IUniverInstanceService, JSONX, SHEET_EDITOR_UNITS, TextX, TextXActionType, UniverInstanceType } from '@univerjs/core';
import { RichTextEditingMutation } from '@univerjs/docs';
import { IRenderManagerService } from '@univerjs/engine-render';
import { getCustomDecorationAtPosition, getCustomRangeAtPosition, getTextRunAtPosition } from '../../basics/paragraph';
import { DocIMEInputManagerService } from '../../services/doc-ime-input-manager.service';
import { DocMenuStyleService } from '../../services/doc-menu-style.service';
import { getRichTextEditPath } from '../util';

export interface IIMEInputCommandParams {
    unitId: string;
    newText: string;
    oldTextLen: number;
    isCompositionStart: boolean;
    isCompositionEnd: boolean;
}

export const IMEInputCommand: ICommand<IIMEInputCommandParams> = {
    id: 'doc.command.ime-input',

    type: CommandType.COMMAND,

    // eslint-disable-next-line max-lines-per-function
    handler: async (accessor, params: IIMEInputCommandParams) => {
        const { unitId, newText, oldTextLen, isCompositionEnd, isCompositionStart } = params;
        const commandService = accessor.get(ICommandService);
        const renderManagerService = accessor.get(IRenderManagerService);
        const univerInstanceService = accessor.get(IUniverInstanceService);
        const docMenuStyleService = accessor.get(DocMenuStyleService);

        const imeInputManagerService = renderManagerService.getRenderById(unitId)?.with(DocIMEInputManagerService);
        const docDataModel = univerInstanceService.getUnit<DocumentDataModel>(unitId, UniverInstanceType.UNIVER_DOC);

        if (docDataModel == null || imeInputManagerService == null) {
            return false;
        }

        const previousActiveRange = imeInputManagerService.getActiveRange();
        if (previousActiveRange == null) {
            return false;
        }

        const { style, segmentId } = previousActiveRange;
        const body = docDataModel.getSelfOrHeaderFooterModel(segmentId).getBody();

        if (body == null) {
            return false;
        }

        const insertRange = previousActiveRange;
        Object.assign(previousActiveRange, insertRange);
        const { startOffset, endOffset } = previousActiveRange;

        const len = newText.length;

        const textRanges: ITextRangeWithStyle[] = [
            {
                startOffset: startOffset + len,
                endOffset: startOffset + len,
                collapsed: true,
                style,
            },
        ];

        const doMutation: ICommandInfo<IRichTextEditingMutationParams> = {
            id: RichTextEditingMutation.id,
            params: {
                unitId,
                actions: [],
                textRanges,
            },
        };

        const defaultTextStyle = docMenuStyleService.getDefaultStyle();
        const styleCache = docMenuStyleService.getStyleCache();
        const curCustomRange = getCustomRangeAtPosition(body.customRanges ?? [], startOffset + oldTextLen, SHEET_EDITOR_UNITS.includes(unitId));
        const stylePos = isCompositionStart ? startOffset : (oldTextLen > 0 ? startOffset : Math.max(0, startOffset - 1));
        let curTextRun = getTextRunAtPosition(
            body,
            stylePos,
            defaultTextStyle,
            styleCache,
            SHEET_EDITOR_UNITS.includes(unitId)
        );

        // 🔥 1st Principle: Capture style at START and reuse it.
        if (isCompositionStart) {
            imeInputManagerService.setStartStyle(curTextRun?.ts);
        } else {
            const startStyle = imeInputManagerService.getStartStyle();
            if (startStyle) {
                curTextRun = { ...curTextRun, ts: startStyle };
            }
        }

        const customDecorations = getCustomDecorationAtPosition(body.customDecorations ?? [], startOffset + oldTextLen);
        const textX = new TextX();
        const jsonX = JSONX.getInstance();

        if (!previousActiveRange.collapsed && isCompositionStart) {
            const dos = BuildTextUtils.selection.delete([previousActiveRange], body, 0, null, false);
            textX.push(...dos);
            doMutation.params!.textRanges = [{
                startOffset: startOffset + len,
                endOffset: startOffset + len,
                collapsed: true,
            }];
        } else {
            textX.push({
                t: TextXActionType.RETAIN,
                len: startOffset,
            });
        }

        if (oldTextLen > 0) {
            textX.push({
                t: TextXActionType.DELETE,
                len: oldTextLen,
            });
        }

        // 🔥🔥🔥 Custom Helper for Slicing Text Runs
        const sliceTextRuns = (body: IDocumentBody, start: number, length: number) => {
            const runs: any[] = [];
            const end = start + length;
            const { textRuns = [] } = body;

            for (const run of textRuns) {
                const runStart = run.st;
                const runEnd = run.ed;

                if (runEnd > start && runStart < end) {
                    const intersectStart = Math.max(start, runStart);
                    const intersectEnd = Math.min(end, runEnd);
                    runs.push({
                        st: intersectStart - start,
                        ed: intersectEnd - start,
                        ts: { ...run.ts },
                    });
                }
            }
            return runs;
        };

        // 🔥🔥🔥 Logic to decide runs
        let runsToApply: any[] = [];

        // 1. Try to preserve existing runs
        if (oldTextLen > 0) {
            // IME replaces [startOffset, startOffset + oldTextLen]
            // But existing styles are in body.textRuns relative to the whole doc.
            // We need to extract them.

            // Check if we are updating existing text (Composition Update)
            // The range to be replaced starts at 'startOffset'.
            const existingRuns = sliceTextRuns(body, startOffset, oldTextLen);

            if (existingRuns.length > 0) {
                let currentPos = 0;
                for (const run of existingRuns) {
                    const runLen = run.ed - run.st;
                    const applyLen = Math.min(len - currentPos, runLen);

                    if (applyLen <= 0) break;

                    runsToApply.push({
                        st: currentPos,
                        ed: currentPos + applyLen,
                        ts: run.ts,
                    });

                    currentPos += applyLen;
                }

                // Remaining part gets the last style or cursor style
                if (currentPos < len) {
                    const lastStyle = runsToApply.length > 0 ? runsToApply[runsToApply.length - 1].ts : curTextRun?.ts;
                    runsToApply.push({
                        st: currentPos,
                        ed: len,
                        ts: lastStyle || {},
                    });
                }
            }
        }

        // 2. Fallback to style at position
        if (runsToApply.length === 0) {
            runsToApply = [{
                st: 0,
                ed: len,
                ts: curTextRun?.ts || {},
            }];
        }

        textX.push({
            t: TextXActionType.INSERT,
            body: {
                dataStream: newText,
                textRuns: runsToApply,
                customRanges: curCustomRange
                    ? [{
                        ...curCustomRange,
                        startIndex: 0,
                        endIndex: newText.length - 1,
                    }]
                    : [],
                customDecorations: customDecorations.map((customDecoration) => ({
                    ...customDecoration,
                    startIndex: 0,
                    endIndex: newText.length - 1,
                })),
            },
            len: newText.length,
        });

        const path = getRichTextEditPath(docDataModel, segmentId);
        doMutation.params!.actions = jsonX.editOp(textX.serialize(), path);

        doMutation.params!.noHistory = !isCompositionEnd;

        doMutation.params!.isCompositionEnd = isCompositionEnd;

        const result = commandService.syncExecuteCommand<
            IRichTextEditingMutationParams,
            IRichTextEditingMutationParams
        >(doMutation.id, doMutation.params);

        imeInputManagerService.pushUndoRedoMutationParams(result, doMutation.params!);

        return Boolean(result);
    },
};
