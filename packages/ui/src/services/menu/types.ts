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

export enum MenuManagerPosition {
    RIBBON = 'ribbon',
    CONTEXT_MENU = 'contextMenu',
}

export enum RibbonPosition {
    START = 'ribbon.start', // Home Tab
    INSERT = 'ribbon.insert',
    PAGE_LAYOUT = 'ribbon.pageLayout', // MS Office Page Layout
    FORMULAS = 'ribbon.formulas',
    DATA = 'ribbon.data',
    REVIEW = 'ribbon.review', // MS Office Review
    VIEW = 'ribbon.view',
    OTHERS = 'ribbon.others',
}

export enum RibbonStartGroup {
    UNDO = 'ribbon.start.undo',
    CLIPBOARD = 'ribbon.start.clipboard',
    FONT = 'ribbon.start.font',
    ALIGNMENT = 'ribbon.start.alignment',
    NUMBER = 'ribbon.start.number',
    STYLES = 'ribbon.start.styles',
    CELLS = 'ribbon.start.cells',
    EDITING = 'ribbon.start.editing',
    OTHERS = 'ribbon.start.others',
}

export enum RibbonInsertGroup {
    EDIT = 'ribbon.insert.edit',
    MEDIA = 'ribbon.insert.media',
    OTHERS = 'ribbon.insert.others',
}

export enum RibbonFormulasGroup {
    BASIC = 'ribbon.formulas.basic',
    OTHERS = 'ribbon.formulas.others',
}

export enum RibbonDataGroup {
    FORMULAS = 'ribbon.data.formulas',
    RULES = 'ribbon.data.rules',
    ORGANIZATION = 'ribbon.data.organization',
    OTHERS = 'ribbon.data.others',
}

export enum RibbonViewGroup {
    DISPLAY = 'ribbon.view.display',
    VISIBILITY = 'ribbon.view.Visibility',
    OTHERS = 'ribbon.view.others',
}

export enum RibbonPageLayoutGroup {
    THEMES = 'ribbon.pageLayout.themes',
    PAGE_SETUP = 'ribbon.pageLayout.pageSetup',
    SCALE_TO_FIT = 'ribbon.pageLayout.scaleToFit',
    SHEET_OPTIONS = 'ribbon.pageLayout.sheetOptions',
    ARRANGE = 'ribbon.pageLayout.arrange',
}

export enum RibbonReviewGroup {
    PROOFING = 'ribbon.review.proofing',
    COMMENTS = 'ribbon.review.comments',
    CHANGES = 'ribbon.review.changes',
    PROTECT = 'ribbon.review.protect',
}

export enum RibbonOthersGroup {
    OTHERS = 'ribbon.others.others',
}

export enum ContextMenuPosition {
    MAIN_AREA = 'contextMenu.mainArea',
    COL_HEADER = 'contextMenu.colHeader',
    ROW_HEADER = 'contextMenu.rowHeader',
    FOOTER_TABS = 'contextMenu.footerTabs',
    FOOTER_MENU = 'contextMenu.footerMenu',
    /**
     * paragraph context menu in doc
     */
    PARAGRAPH = 'contextMenu.paragraph',
}

export enum ContextMenuGroup {
    /**
     * quick context menu, displayed as icon
     */
    QUICK = 'contextMenu.quick',
    FORMAT = 'contextMenu.format',
    LAYOUT = 'contextMenu.layout',
    DATA = 'contextMenu.data',
    OTHERS = 'contextMenu.others',
}
