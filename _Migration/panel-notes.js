import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { trackModuleTimeout, clearTrackedTimeout } from './timer-utils.js';
import { getNativeElement, renderTemplate } from './helpers.js';
import {
    PERMISSION_LEVELS,
    userCanAccessPage,
    showJournalPicker,
    showPagePicker,
    renderJournalContent,
    getJournalPageContent,
    enrichJournalContent
} from './utility-journal.js';
import { NotesParser } from './utility-notes-parser.js';
import { UsersWindow } from './window-users.js';
import { NotesForm } from './window-note.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

function getPinsApi() {
    const blacksmith = getBlacksmith();
    return blacksmith?.pins || null;
}

function isPermissionDeniedError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('permission denied');
}

function isPinsApiAvailable(pins) {
    if (!pins) return false;
    if (typeof pins.isAvailable === 'function') {
        return pins.isAvailable();
    }
    return true;
}

const NOTE_PIN_ICON = 'fa-note-sticky';
const NOTE_PIN_CURSOR_CLASS = 'squire-notes-pin-placement';
const NOTE_PIN_CANVAS_CURSOR_CLASS = 'squire-notes-pin-placement-canvas';
const NOTE_PIN_SIZE = { w: 60, h: 60 };
const NOTE_PIN_DEFAULT_SETTING = 'notesPinDefaultDesign';
const NOTE_PIN_TYPE = 'coffee-pub-squire-sticky-notes';

// Export helper functions for use in window-note.js
export function normalizePinSize(size) {
    const w = Number(size?.w);
    const h = Number(size?.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return { w: Math.round(w), h: Math.round(h) };
}

export function normalizePinShape(shape) {
    if (shape === 'circle' || shape === 'square' || shape === 'none') return shape;
    return null;
}

export function normalizePinStyle(style) {
    if (!style || typeof style !== 'object') return null;
    const fill = typeof style.fill === 'string' ? style.fill : null;
    const stroke = typeof style.stroke === 'string' ? style.stroke : null;
    const strokeWidth = Number(style.strokeWidth);
    const normalized = {};
    if (fill) normalized.fill = fill;
    if (stroke) normalized.stroke = stroke;
    if (Number.isFinite(strokeWidth) && strokeWidth >= 0) {
        normalized.strokeWidth = Math.round(strokeWidth);
    }
    return Object.keys(normalized).length ? normalized : null;
}

function normalizePinText(value) {
    if (typeof value === 'string') return value;
    return '';
}

export function normalizePinTextLayout(layout) {
    if (layout === 'under' || layout === 'over' || layout === 'around') return layout;
    return null;
}

export function normalizePinTextDisplay(display) {
    if (display === 'always' || display === 'hover' || display === 'never' || display === 'gm') return display;
    return null;
}

export function normalizePinTextColor(color) {
    if (typeof color === 'string' && color.trim()) return color.trim();
    return null;
}

export function normalizePinTextSize(size) {
    const parsed = Number(size);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed);
}

export function normalizePinTextMaxLength(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed);
}

export function normalizePinTextScaleWithPin(value) {
    if (typeof value === 'boolean') return value;
    return null;
}

export function getDefaultNotePinDesign() {
    let stored = null;
    try {
        stored = game.settings.get(MODULE.ID, NOTE_PIN_DEFAULT_SETTING);
    } catch (error) {
        stored = null;
    }
    const normalized = normalizePinSize(stored?.size);
    const lockProportions = typeof stored?.lockProportions === 'boolean' ? stored.lockProportions : true;
    return {
        size: normalized || { ...NOTE_PIN_SIZE },
        lockProportions,
        shape: normalizePinShape(stored?.shape) || 'circle',
        style: normalizePinStyle(stored?.style) || { stroke: '#ffffff', strokeWidth: 2 },
        dropShadow: typeof stored?.dropShadow === 'boolean' ? stored.dropShadow : true,
        text: normalizePinText(stored?.text),
        textLayout: normalizePinTextLayout(stored?.textLayout) || 'under',
        textDisplay: normalizePinTextDisplay(stored?.textDisplay) || 'always',
        textColor: normalizePinTextColor(stored?.textColor) || '#ffffff',
        textSize: normalizePinTextSize(stored?.textSize) || 12,
        textMaxLength: normalizePinTextMaxLength(stored?.textMaxLength) ?? 0,
        textScaleWithPin: normalizePinTextScaleWithPin(stored?.textScaleWithPin) ?? true
    };
}

function getNotePinSizeForPage(page) {
    return normalizePinSize(page?.getFlag(MODULE.ID, 'notePinSize')) || getDefaultNotePinDesign().size;
}

export function getNotePinSizeForNote(note) {
    return normalizePinSize(note?.notePinSize) || getDefaultNotePinDesign().size;
}

function getNotePinShapeForPage(page) {
    return normalizePinShape(page?.getFlag(MODULE.ID, 'notePinShape')) || getDefaultNotePinDesign().shape;
}

export function getNotePinShapeForNote(note) {
    return normalizePinShape(note?.notePinShape) || getDefaultNotePinDesign().shape;
}

function getNotePinStyleForPage(page) {
    return mergeNotePinStyle(page?.getFlag(MODULE.ID, 'notePinStyle'));
}

export function getNotePinStyleForNote(note) {
    return mergeNotePinStyle(note?.notePinStyle);
}

function getNotePinDropShadowForPage(page) {
    const stored = page?.getFlag(MODULE.ID, 'notePinDropShadow');
    return typeof stored === 'boolean' ? stored : getDefaultNotePinDesign().dropShadow;
}

export function getNotePinDropShadowForNote(note) {
    const stored = note?.notePinDropShadow;
    return typeof stored === 'boolean' ? stored : getDefaultNotePinDesign().dropShadow;
}

function getNotePinTextForPage(page) {
    return normalizePinText(page?.name);
}

function getNotePinTextForNote(note) {
    return normalizePinText(note?.title);
}

function getNotePinTextLayoutForPage(page) {
    return normalizePinTextLayout(page?.getFlag(MODULE.ID, 'notePinTextLayout')) || getDefaultNotePinDesign().textLayout;
}

export function getNotePinTextLayoutForNote(note) {
    return normalizePinTextLayout(note?.notePinTextLayout) || getDefaultNotePinDesign().textLayout;
}

function getNotePinTextDisplayForPage(page) {
    return normalizePinTextDisplay(page?.getFlag(MODULE.ID, 'notePinTextDisplay')) || getDefaultNotePinDesign().textDisplay;
}

export function getNotePinTextDisplayForNote(note) {
    return normalizePinTextDisplay(note?.notePinTextDisplay) || getDefaultNotePinDesign().textDisplay;
}

function getNotePinTextColorForPage(page) {
    return normalizePinTextColor(page?.getFlag(MODULE.ID, 'notePinTextColor')) || getDefaultNotePinDesign().textColor;
}

export function getNotePinTextColorForNote(note) {
    return normalizePinTextColor(note?.notePinTextColor) || getDefaultNotePinDesign().textColor;
}

function getNotePinTextSizeForPage(page) {
    return normalizePinTextSize(page?.getFlag(MODULE.ID, 'notePinTextSize')) || getDefaultNotePinDesign().textSize;
}

export function getNotePinTextSizeForNote(note) {
    return normalizePinTextSize(note?.notePinTextSize) || getDefaultNotePinDesign().textSize;
}

function getNotePinTextMaxLengthForPage(page) {
    const stored = normalizePinTextMaxLength(page?.getFlag(MODULE.ID, 'notePinTextMaxLength'));
    return stored ?? getDefaultNotePinDesign().textMaxLength;
}

export function getNotePinTextMaxLengthForNote(note) {
    const stored = normalizePinTextMaxLength(note?.notePinTextMaxLength);
    return stored ?? getDefaultNotePinDesign().textMaxLength;
}

function getNotePinTextScaleWithPinForPage(page) {
    const stored = normalizePinTextScaleWithPin(page?.getFlag(MODULE.ID, 'notePinTextScaleWithPin'));
    return stored ?? getDefaultNotePinDesign().textScaleWithPin;
}

export function getNotePinTextScaleWithPinForNote(note) {
    const stored = normalizePinTextScaleWithPin(note?.notePinTextScaleWithPin);
    return stored ?? getDefaultNotePinDesign().textScaleWithPin;
}

function logPinPackage(label, payload) {
    const logger = getBlacksmith()?.utils?.postConsoleAndNotification;
    if (typeof logger !== 'function') return;
    let serialized = payload;
    try {
        serialized = JSON.stringify(payload);
    } catch (error) {
        serialized = String(payload);
    }
    logger(`NOTE | PINS PIN PACKAGE ${label}`, serialized);
}

let notePinClickDisposer = null;
let notePinHandlerController = null;
let notePinContextMenuRegistered = false;
let notePinContextMenuDisposers = [];
let notePinSceneSyncHookId = null;

async function syncNotesForDeletedPins(sceneId) {
    if (!game.user?.isGM) return;
    const pins = getPinsApi();
    if (!sceneId || !pins) return;

    const journalId = game.settings.get(MODULE.ID, 'notesJournal');
    if (!journalId || journalId === 'none') return;

    const journal = game.journal.get(journalId);
    if (!journal?.pages) return;

    const pages = journal.pages.contents || journal.pages;
    if (!pages?.length) return;

    let changed = false;
    for (const page of pages) {
        const pinId = page.getFlag(MODULE.ID, 'pinId');
        if (!pinId) continue;
        const pageSceneId = page.getFlag(MODULE.ID, 'sceneId');
        if (pageSceneId && pageSceneId !== sceneId) continue;

        const pinExists = typeof pins.exists === 'function'
            ? pins.exists(pinId, { sceneId })
            : !!pins.get?.(pinId, { sceneId });

        if (!pinExists) {
            await page.setFlag(MODULE.ID, 'pinId', null);
            await page.setFlag(MODULE.ID, 'sceneId', null);
            await page.setFlag(MODULE.ID, 'x', null);
            await page.setFlag(MODULE.ID, 'y', null);
            changed = true;
        }
    }

    if (changed) {
        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.notesPanel && panelManager.element) {
            await panelManager.notesPanel._refreshData();
            panelManager.notesPanel.render(panelManager.element);
        }
    }
}

function toHexColor(color) {
    if (typeof color === 'number') {
        return `#${color.toString(16).padStart(6, '0')}`;
    }
    return color;
}

export function extractFirstImageSrc(content) {
    if (!content) return null;
    const match = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    return match?.[1] || null;
}

export function normalizeNoteIconFlag(iconFlag) {
    if (!iconFlag) return null;
    if (typeof iconFlag === 'string') {
        const type = iconFlag.includes('fa-') ? 'fa' : 'img';
        return { type, value: iconFlag };
    }
    if (typeof iconFlag === 'object') {
        const type = iconFlag.type || iconFlag.kind;
        const value = iconFlag.value || iconFlag.icon || iconFlag.src;
        if (type && value) {
            return { type, value };
        }
    }
    return null;
}

export function buildNoteIconHtml(iconData, imgClass = '') {
    if (!iconData) return `<i class="fa-solid ${NOTE_PIN_ICON}"></i>`;
    if (iconData.type === 'fa') {
        return `<i class="fa-solid ${iconData.value}"></i>`;
    }
    const classAttr = imgClass ? ` class="${imgClass}"` : '';
    return `<img src="${iconData.value}"${classAttr}>`;
}

function normalizePinImageSource(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const imgMatch = trimmed.match(/<img\s+[^>]*src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) return imgMatch[1];
    if (/^(https?:\/\/|\/|data:)/i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('modules/')) return `/${trimmed}`;
    return trimmed;
}

function resolveNoteIconHtmlFromPage(page, imgClass = '') {
    const iconFlag = normalizeNoteIconFlag(page?.getFlag(MODULE.ID, 'noteIcon'));
    if (iconFlag) {
        return buildNoteIconHtml(iconFlag, imgClass);
    }
    const content = page?.text?.content || '';
    const imageSrc = extractFirstImageSrc(content);
    if (imageSrc) {
        return buildNoteIconHtml({ type: 'img', value: imageSrc }, imgClass);
    }
    return buildNoteIconHtml(null, imgClass);
}

export function resolveNoteIconHtmlFromContent(content, imgClass = '') {
    const imageSrc = extractFirstImageSrc(content);
    if (imageSrc) {
        return buildNoteIconHtml({ type: 'img', value: imageSrc }, imgClass);
    }
    return buildNoteIconHtml(null, imgClass);
}

function resolveNotePinImageValueFromPage(page) {
    const iconFlag = normalizeNoteIconFlag(page?.getFlag(MODULE.ID, 'noteIcon'));
    if (iconFlag) {
        if (iconFlag.type === 'img') {
            const src = normalizePinImageSource(iconFlag.value);
            return src ? `<img src="${src}">` : '';
        }
        return buildNoteIconHtml(iconFlag);
    }
    const content = page?.text?.content || '';
    const imageSrc = extractFirstImageSrc(content);
    if (imageSrc) {
        const src = normalizePinImageSource(imageSrc);
        return src ? `<img src="${src}">` : '';
    }
    return buildNoteIconHtml(null);
}

function focusNoteCardInDom(noteUuid) {
    const card = document.querySelector(`.note-card[data-note-uuid="${noteUuid}"]`);
    if (!card) {
        return false;
    }
    card.classList.add('note-card-highlight');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    trackModuleTimeout(() => {
        card.classList.remove('note-card-highlight');
    }, 3200);
    return true;
}

function createPinPreviewElement(iconHtml, pinSize, pinStyle, pinShape, dropShadow) {
    const size = normalizePinSize(pinSize) || getDefaultNotePinDesign().size;
    const style = mergeNotePinStyle(pinStyle);
    const shape = normalizePinShape(pinShape) || getDefaultNotePinDesign().shape;
    const shadow = typeof dropShadow === 'boolean' ? dropShadow : getDefaultNotePinDesign().dropShadow;
    const preview = document.createElement('div');
    preview.className = 'notes-pin-preview';
    preview.dataset.shape = shape;
    preview.style.setProperty('--pin-width', `${size.w}px`);
    preview.style.setProperty('--pin-height', `${size.h}px`);
    preview.style.setProperty('--pin-fill', style.fill);
    preview.style.setProperty('--pin-stroke', style.stroke);
    preview.style.setProperty('--pin-stroke-width', `${style.strokeWidth}px`);
    preview.style.setProperty('--pin-drop-shadow', shadow ? '0 0 10px rgba(0, 0, 0, 0.4)' : 'none');
    preview.innerHTML = `
        <div class="notes-pin-preview-inner">
            ${iconHtml}
        </div>
    `;
    return preview;
}

export class NoteIconPicker extends Application {
    constructor(noteIcon, { onSelect, pinSize, pinStyle, pinShape, pinDropShadow, pinTextConfig } = {}) {
        super();
        this.onSelect = onSelect;
        this.selected = noteIcon;
        const defaultDesign = getDefaultNotePinDesign();
        this.iconMode = this.selected?.type === 'img' ? 'image' : 'icon';
        this.lastIconSelection = this.selected?.type === 'fa' ? this.selected : null;
        this.pinSize = normalizePinSize(pinSize) || defaultDesign.size;
        this.lockProportions = defaultDesign.lockProportions;
        this.pinShape = normalizePinShape(pinShape) || defaultDesign.shape;
        this.pinStyle = mergeNotePinStyle(pinStyle);
        this.dropShadow = typeof pinDropShadow === 'boolean' ? pinDropShadow : defaultDesign.dropShadow;
        this.pinTextLayout = normalizePinTextLayout(pinTextConfig?.textLayout) || defaultDesign.textLayout;
        this.pinTextDisplay = normalizePinTextDisplay(pinTextConfig?.textDisplay) || defaultDesign.textDisplay;
        this.pinTextColor = normalizePinTextColor(pinTextConfig?.textColor) || defaultDesign.textColor;
        this.pinTextSize = normalizePinTextSize(pinTextConfig?.textSize) || defaultDesign.textSize;
        const maxLength = normalizePinTextMaxLength(pinTextConfig?.textMaxLength);
        this.pinTextMaxLength = maxLength ?? defaultDesign.textMaxLength;
        this.pinTextScaleWithPin = normalizePinTextScaleWithPin(pinTextConfig?.textScaleWithPin) ?? defaultDesign.textScaleWithPin;
        this._pinRatio = this.pinSize.h ? this.pinSize.w / this.pinSize.h : 1;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'notes-icon-picker',
            title: ' ',
            template: TEMPLATES.NOTES_ICON_PICKER,
            width: 700,
            height: 600,
            resizable: true,
            classes: ['squire-window', 'notes-icon-picker-window']
        });
    }

    static iconCategories = null;

    static async loadIconCategories() {
        if (this.iconCategories) {
            return this.iconCategories;
        }
        try {
            const response = await fetch(`modules/${MODULE.ID}/resources/pin-icons.json`);
            if (!response.ok) {
                throw new Error(`Failed to load pin icons: ${response.status}`);
            }
            this.iconCategories = await response.json();
            return this.iconCategories;
        } catch (error) {
            const logger = getBlacksmith()?.utils?.postConsoleAndNotification;
            if (typeof logger === 'function') {
                logger('NOTE | PINS Failed to load pin icons.', error.message);
            }
            this.iconCategories = [];
            return this.iconCategories;
        }
    }

    static formatIconLabel(iconClass) {
        if (!iconClass) return '';
        const name = iconClass.split(' ').find(cls => cls.startsWith('fa-')) || iconClass;
        return name.replace(/^fa-/, '').replace(/-/g, ' ');
    }

    async getData() {
        const selected = this.selected || null;
        const previewHtml = buildNoteIconHtml(selected, 'window-note-header-image');
        const imageValue = selected?.type === 'img' ? selected.value : '';
        const categories = await NoteIconPicker.loadIconCategories();
        const iconCategories = (categories || []).map(category => {
            const icons = (category.icons || []).map(iconClass => ({
                value: iconClass,
                label: NoteIconPicker.formatIconLabel(iconClass),
                isSelected: selected?.type === 'fa' && selected.value === iconClass
            }));
            return {
                category: category.category || 'Icons',
                description: category.description || '',
                icons
            };
        });
        return {
            previewHtml,
            imageValue,
            iconCategories,
            pinWidth: this.pinSize?.w ?? NOTE_PIN_SIZE.w,
            pinHeight: this.pinSize?.h ?? NOTE_PIN_SIZE.h,
            lockProportions: this.lockProportions,
            pinShape: this.pinShape,
            pinStroke: this.pinStyle.stroke,
            pinStrokeWidth: this.pinStyle.strokeWidth,
            pinFill: this.pinStyle.fill,
            pinDropShadow: this.dropShadow,
            pinTextLayout: this.pinTextLayout,
            pinTextDisplay: this.pinTextDisplay,
            pinTextColor: this.pinTextColor,
            pinTextSize: this.pinTextSize,
            pinTextMaxLength: this.pinTextMaxLength,
            pinTextScaleWithPin: this.pinTextScaleWithPin,
            iconMode: this.iconMode
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        const nativeHtml = html?.[0] || html;

        const root = nativeHtml?.classList?.contains('notes-icon-picker')
            ? nativeHtml
            : nativeHtml.querySelector('.notes-icon-picker');
        const preview = nativeHtml.querySelector('.window-note-header-icon');
        const imageInput = nativeHtml.querySelector('.notes-icon-image-input');
        const imageRow = nativeHtml.querySelector('.notes-icon-image-row');
        const imagePreview = nativeHtml.querySelector('.notes-icon-image-preview');
        const widthInput = nativeHtml.querySelector('.notes-pin-width');
        const heightInput = nativeHtml.querySelector('.notes-pin-height');
        const lockInput = nativeHtml.querySelector('.notes-pin-lock');
        const shapeInput = nativeHtml.querySelector('.notes-pin-shape');
        const strokeInput = nativeHtml.querySelector('.notes-pin-stroke');
        const strokeTextInput = nativeHtml.querySelector('.notes-pin-stroke-text');
        const strokeWidthInput = nativeHtml.querySelector('.notes-pin-stroke-width');
        const fillInput = nativeHtml.querySelector('.notes-pin-fill');
        const fillTextInput = nativeHtml.querySelector('.notes-pin-fill-text');
        const shadowInput = nativeHtml.querySelector('.notes-pin-shadow');
        const textLayoutInput = nativeHtml.querySelector('.notes-pin-text-layout');
        const textDisplayInput = nativeHtml.querySelector('.notes-pin-text-display');
        const textColorInput = nativeHtml.querySelector('.notes-pin-text-color');
        const textColorTextInput = nativeHtml.querySelector('.notes-pin-text-color-text');
        const textSizeInput = nativeHtml.querySelector('.notes-pin-text-size');
        const textMaxLengthInput = nativeHtml.querySelector('.notes-pin-text-max-length');
        const textScaleInput = nativeHtml.querySelector('.notes-pin-text-scale');
        const defaultInput = nativeHtml.querySelector('.notes-pin-default');
        const sourceToggle = nativeHtml.querySelector('.notes-icon-source-toggle-input');

        const updatePreview = () => {
            if (preview) {
                preview.innerHTML = buildNoteIconHtml(this.selected, 'window-note-header-image');
            }
            if (imageRow) {
                imageRow.classList.toggle('selected', this.selected?.type === 'img');
            }
            if (imagePreview) {
                const src = imageInput?.value?.trim() || '';
                imagePreview.src = src;
                imagePreview.classList.toggle('is-hidden', !src);
            }
        };
        const updateMode = (mode) => {
            this.iconMode = mode;
            if (mode === 'image') {
                if (this.selected?.type === 'fa') {
                    this.lastIconSelection = this.selected;
                }
                const imgValue = imageInput?.value?.trim() || '';
                if (imgValue) {
                    this.selected = { type: 'img', value: imgValue };
                }
            } else {
                if (this.lastIconSelection) {
                    this.selected = this.lastIconSelection;
                } else if (this.selected?.type !== 'fa') {
                    this.selected = { type: 'fa', value: NOTE_PIN_ICON };
                }
            }
            if (root) {
                root.dataset.iconMode = mode;
            }
            if (sourceToggle) {
                sourceToggle.checked = mode === 'icon';
            }
            updatePreview();
        };

        const clampDimension = (value, fallback) => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.max(8, Math.round(parsed));
        };

        const clampStrokeWidth = (value, fallback) => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.max(0, Math.round(parsed));
        };
        const clampTextSize = (value, fallback) => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.max(6, Math.round(parsed));
        };
        const clampTextMaxLength = (value, fallback) => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.max(0, Math.round(parsed));
        };

        const syncPinSize = (source) => {
            if (!widthInput || !heightInput) return;
            let width = clampDimension(widthInput.value, this.pinSize.w);
            let height = clampDimension(heightInput.value, this.pinSize.h);

            if (lockInput?.checked) {
                if (source === 'width') {
                    height = clampDimension(Math.round(width / (this._pinRatio || 1)), height);
                    heightInput.value = height;
                } else if (source === 'height') {
                    width = clampDimension(Math.round(height * (this._pinRatio || 1)), width);
                    widthInput.value = width;
                }
            } else {
                this._pinRatio = height ? width / height : this._pinRatio;
            }

            this.pinSize = { w: width, h: height };
        };

        nativeHtml.querySelectorAll('.notes-icon-option').forEach(button => {
            button.addEventListener('click', () => {
                const value = button.dataset.value;
                this.selected = { type: 'fa', value };
                this.lastIconSelection = this.selected;
                nativeHtml.querySelectorAll('.notes-icon-option').forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');
                if (imageInput) {
                    imageInput.value = '';
                }
                updateMode('icon');
            });
        });

        imageInput?.addEventListener('input', () => {
            const value = imageInput.value.trim();
            if (value) {
                this.selected = { type: 'img', value };
                nativeHtml.querySelectorAll('.notes-icon-option').forEach(btn => btn.classList.remove('selected'));
                updateMode('image');
            }
        });

        widthInput?.addEventListener('input', () => syncPinSize('width'));
        heightInput?.addEventListener('input', () => syncPinSize('height'));
        lockInput?.addEventListener('change', () => {
            if (widthInput && heightInput) {
                const width = clampDimension(widthInput.value, this.pinSize.w);
                const height = clampDimension(heightInput.value, this.pinSize.h);
                this._pinRatio = height ? width / height : this._pinRatio;
            }
            this.lockProportions = !!lockInput.checked;
            syncPinSize('width');
        });
        shapeInput?.addEventListener('change', () => {
            this.pinShape = normalizePinShape(shapeInput.value) || this.pinShape;
        });
        strokeTextInput?.addEventListener('input', () => {
            const value = strokeTextInput.value.trim();
            if (value) {
                this.pinStyle.stroke = value;
                if (strokeInput) {
                    strokeInput.value = value;
                }
            }
        });
        strokeInput?.addEventListener('input', () => {
            const value = strokeInput.value.trim();
            if (value) {
                this.pinStyle.stroke = value;
                if (strokeTextInput) {
                    strokeTextInput.value = value;
                }
            }
        });
        fillTextInput?.addEventListener('input', () => {
            const value = fillTextInput.value.trim();
            if (value) {
                this.pinStyle.fill = value;
                if (fillInput) {
                    fillInput.value = value;
                }
            }
        });
        fillInput?.addEventListener('input', () => {
            const value = fillInput.value.trim();
            if (value) {
                this.pinStyle.fill = value;
                if (fillTextInput) {
                    fillTextInput.value = value;
                }
            }
        });
        strokeWidthInput?.addEventListener('input', () => {
            const width = clampStrokeWidth(strokeWidthInput.value, this.pinStyle.strokeWidth);
            this.pinStyle.strokeWidth = width;
        });
        shadowInput?.addEventListener('change', () => {
            this.dropShadow = !!shadowInput.checked;
        });
        textLayoutInput?.addEventListener('change', () => {
            this.pinTextLayout = normalizePinTextLayout(textLayoutInput.value) || this.pinTextLayout;
        });
        textDisplayInput?.addEventListener('change', () => {
            this.pinTextDisplay = normalizePinTextDisplay(textDisplayInput.value) || this.pinTextDisplay;
        });
        textColorTextInput?.addEventListener('input', () => {
            const value = textColorTextInput.value.trim();
            if (value) {
                this.pinTextColor = normalizePinTextColor(value) || this.pinTextColor;
                if (textColorInput) {
                    textColorInput.value = value;
                }
            }
        });
        textColorInput?.addEventListener('input', () => {
            const value = textColorInput.value.trim();
            if (value) {
                this.pinTextColor = normalizePinTextColor(value) || this.pinTextColor;
                if (textColorTextInput) {
                    textColorTextInput.value = value;
                }
            }
        });
        textSizeInput?.addEventListener('input', () => {
            this.pinTextSize = clampTextSize(textSizeInput.value, this.pinTextSize);
        });
        textMaxLengthInput?.addEventListener('input', () => {
            this.pinTextMaxLength = clampTextMaxLength(textMaxLengthInput.value, this.pinTextMaxLength);
        });
        textScaleInput?.addEventListener('change', () => {
            this.pinTextScaleWithPin = !!textScaleInput.checked;
        });
        sourceToggle?.addEventListener('change', () => {
            updateMode(sourceToggle.checked ? 'icon' : 'image');
        });

        nativeHtml.querySelector('.notes-icon-browse')?.addEventListener('click', async () => {
            const picker = new FilePicker({
                type: 'image',
                callback: (path) => {
                    if (!imageInput) return;
                    imageInput.value = path;
                    this.selected = { type: 'img', value: path };
                    nativeHtml.querySelectorAll('.notes-icon-option').forEach(btn => btn.classList.remove('selected'));
                    updateMode('image');
                }
            });
            picker.browse();
        });

        nativeHtml.querySelector('button.cancel')?.addEventListener('click', () => this.close());

        nativeHtml.querySelector('.notes-icon-use')?.addEventListener('click', async () => {
            const mode = this.iconMode === 'image' ? 'image' : 'icon';
            let finalSelection = null;
            if (mode === 'image') {
                const value = imageInput?.value?.trim() || '';
                if (!value) {
                    ui.notifications?.warn('Select an image for the pin.');
                    return;
                }
                finalSelection = { type: 'img', value };
            } else {
                finalSelection = this.selected?.type === 'fa'
                    ? this.selected
                    : { type: 'fa', value: NOTE_PIN_ICON };
            }
            const makeDefault = !!defaultInput?.checked;
            const pinSize = normalizePinSize(this.pinSize) || { ...NOTE_PIN_SIZE };
            const pinShape = normalizePinShape(this.pinShape) || 'circle';
            const pinStyle = normalizePinStyle(this.pinStyle) || { fill: '#000000', stroke: '#ffffff', strokeWidth: 2 };
            const pinTextConfig = {
                textLayout: normalizePinTextLayout(this.pinTextLayout) || 'under',
                textDisplay: normalizePinTextDisplay(this.pinTextDisplay) || 'always',
                textColor: normalizePinTextColor(this.pinTextColor) || '#ffffff',
                textSize: normalizePinTextSize(this.pinTextSize) || 12,
                textMaxLength: normalizePinTextMaxLength(this.pinTextMaxLength) ?? 0,
                textScaleWithPin: normalizePinTextScaleWithPin(this.pinTextScaleWithPin) ?? true
            };
            if (makeDefault) {
                await game.settings.set(MODULE.ID, NOTE_PIN_DEFAULT_SETTING, {
                    size: pinSize,
                    lockProportions: !!lockInput?.checked,
                    shape: pinShape,
                    style: pinStyle,
                    dropShadow: !!shadowInput?.checked,
                    ...pinTextConfig
                });
            }
            if (this.onSelect) {
                this.onSelect({
                    icon: finalSelection,
                    pinSize,
                    pinShape,
                    pinStyle,
                    pinDropShadow: !!shadowInput?.checked,
                    pinTextConfig
                });
            }
            this.close();
        });

        updatePreview();
        updateMode(this.iconMode);
    }
}

function getNotePinStyle() {
    return {
        fill: '#000000',
        stroke: '#ffffff',
        strokeWidth: 2,
        alpha: 0.9
    };
}

function mergeNotePinStyle(override) {
    const base = getNotePinStyle();
    const normalized = normalizePinStyle(override);
    if (!normalized) return base;
    return {
        ...base,
        ...normalized
    };
}

function getNotePinOwnershipForPage(page) {
    if (!page) {
        return {
            default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
            users: {}
        };
    }

    // Use the same logic as buildNoteOwnership to ensure pin ownership matches page ownership
    const visibility = page?.getFlag(MODULE.ID, 'visibility') || 'private';
    const authorId = page?.getFlag(MODULE.ID, 'authorId') || game.user.id;
    
    // Build ownership using the same rules as buildNoteOwnership
    // PRIVATE: GM + author are OWNERS, everyone else is NONE
    // PARTY: GM + all party members (non-GM players) are OWNERS
    const users = {};

    if (visibility === 'party') {
        // PARTY NOTE: GM and all party members (non-GM players) are OWNERS
        game.users.forEach(user => {
            if (!user.isGM) {
                users[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            }
        });
        // Ensure author is included (in case they're a GM)
        if (authorId && !users[authorId]) {
            users[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
    } else {
        // PRIVATE NOTE: Only GM and author are OWNERS
        if (authorId) {
            users[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
    }

    // Always include GMs as owners
    game.users.forEach(user => {
        if (user.isGM) {
            users[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
    });

    return {
        default: visibility === 'party'
            ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
            : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
        users
    };
}

export function buildNoteOwnership(visibility, authorId) {
    const ownership = {
        default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
    };

    if (visibility === 'party') {
        game.users.forEach(user => {
            if (!user.isGM) {
                ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            }
        });
        if (authorId && !ownership[authorId]) {
            ownership[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
    } else if (authorId) {
        ownership[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }
    game.users.forEach(user => {
        if (user.isGM) {
            ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
    });

    return ownership;
}

export async function syncNoteOwnership(page, visibility, authorId) {
    if (!page) return;
    if (game.user.isGM) {
        const ownership = buildNoteOwnership(visibility, authorId);
        await page.update({ ownership });
        return;
    }

    const blacksmith = getBlacksmith();
    if (blacksmith?.sockets?.emit) {
        await blacksmith.sockets.emit('squire:updateNoteOwnership', {
            pageUuid: page.uuid,
            visibility,
            authorId
        });
    } else {
        ui.notifications.warn('Socket manager is not ready. Ownership sync will occur when a GM saves.');
    }
}

function generateNotePinId() {
    return globalThis.crypto?.randomUUID?.() || foundry.utils.randomID();
}

function buildNoteDataFromPage(page) {
    if (!page) return null;

    const tags = page.getFlag(MODULE.ID, 'tags') || [];
    const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
    const authorId = page.getFlag(MODULE.ID, 'authorId');
    const sceneId = page.getFlag(MODULE.ID, 'sceneId');
    const x = page.getFlag(MODULE.ID, 'x');
    const y = page.getFlag(MODULE.ID, 'y');
    const timestamp = page.getFlag(MODULE.ID, 'timestamp') || null;
    const authorName = authorId
        ? (game.users.get(authorId)?.name || game.users.find(u => u.id === authorId)?.name || authorId)
        : 'Unknown';

    return {
        pageId: page.id,
        pageUuid: page.uuid,
        title: page.name || 'Untitled Note',
        content: page.text?.content || '',
        noteIcon: page.getFlag(MODULE.ID, 'noteIcon') || null,
        notePinSize: getNotePinSizeForPage(page),
        notePinShape: getNotePinShapeForPage(page),
        notePinStyle: page.getFlag(MODULE.ID, 'notePinStyle') || null,
        notePinDropShadow: getNotePinDropShadowForPage(page),
        notePinTextLayout: getNotePinTextLayoutForPage(page),
        notePinTextDisplay: getNotePinTextDisplayForPage(page),
        notePinTextColor: getNotePinTextColorForPage(page),
        notePinTextSize: getNotePinTextSizeForPage(page),
        notePinTextMaxLength: getNotePinTextMaxLengthForPage(page),
        notePinTextScaleWithPin: getNotePinTextScaleWithPinForPage(page),
        iconHtml: resolveNoteIconHtmlFromPage(page, 'window-note-header-image'),
        authorName: authorName,
        timestamp: timestamp,
        tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : []),
        visibility: visibility,
        sceneId: sceneId,
        x: x,
        y: y,
        authorId: authorId,
        editorIds: page.getFlag(MODULE.ID, 'editorIds') || []
    };
}

function registerNotePinContextMenuItems(pins) {
    if (notePinContextMenuRegistered || !pins?.registerContextMenuItem) return;

    const makeOpenHandler = (viewMode) => async (pinData) => {
        const noteUuid = pinData?.config?.noteUuid;
        if (!noteUuid) return;
        const page = await foundry.utils.fromUuid(noteUuid);
        if (!page) {
            ui.notifications.error('Note not found.');
            return;
        }

        if (!viewMode && !page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
            ui.notifications.warn('You do not have permission to edit this note.');
            return;
        }

        const noteData = buildNoteDataFromPage(page);
        if (!noteData) return;
        const form = new NotesForm(noteData, { viewMode });
        form.render(true);
    };

    const configureHandler = async (pinData) => {
        const noteUuid = pinData?.config?.noteUuid;
        if (!noteUuid) return;
        const page = await foundry.utils.fromUuid(noteUuid);
        if (!page) {
            ui.notifications.error('Note not found.');
            return;
        }
        const pinSceneId = pinData?.sceneId || pinData?.scene || null;
        if (pinSceneId && page.getFlag(MODULE.ID, 'sceneId') !== pinSceneId) {
            await page.setFlag(MODULE.ID, 'sceneId', pinSceneId);
        }
        if (pinData?.id && page.getFlag(MODULE.ID, 'pinId') !== pinData.id) {
            await page.setFlag(MODULE.ID, 'pinId', pinData.id);
        }

        if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
            ui.notifications.warn('You do not have permission to configure this note.');
            return;
        }

        let currentIcon = normalizeNoteIconFlag(page.getFlag(MODULE.ID, 'noteIcon'));
        if (!currentIcon) {
            const imageSrc = extractFirstImageSrc(page.text?.content || '');
            if (imageSrc) {
                currentIcon = { type: 'img', value: imageSrc };
            }
        }

        const picker = new NoteIconPicker(currentIcon, {
            pinSize: getNotePinSizeForPage(page),
            pinStyle: page.getFlag(MODULE.ID, 'notePinStyle'),
            pinShape: getNotePinShapeForPage(page),
            pinDropShadow: getNotePinDropShadowForPage(page),
            pinTextConfig: {
                textLayout: getNotePinTextLayoutForPage(page),
                textDisplay: getNotePinTextDisplayForPage(page),
                textColor: getNotePinTextColorForPage(page),
                textSize: getNotePinTextSizeForPage(page),
                textMaxLength: getNotePinTextMaxLengthForPage(page),
                textScaleWithPin: getNotePinTextScaleWithPinForPage(page)
            },
            onSelect: async ({ icon, pinSize, pinShape, pinStyle, pinDropShadow, pinTextConfig }) => {
                await page.setFlag(MODULE.ID, 'noteIcon', icon || null);
                await page.setFlag(MODULE.ID, 'notePinSize', normalizePinSize(pinSize) || getDefaultNotePinDesign().size);
                await page.setFlag(MODULE.ID, 'notePinShape', normalizePinShape(pinShape) || getDefaultNotePinDesign().shape);
                await page.setFlag(MODULE.ID, 'notePinStyle', normalizePinStyle(pinStyle) || getDefaultNotePinDesign().style);
                await page.setFlag(MODULE.ID, 'notePinDropShadow', typeof pinDropShadow === 'boolean' ? pinDropShadow : getDefaultNotePinDesign().dropShadow);
                await page.setFlag(MODULE.ID, 'notePinTextLayout', normalizePinTextLayout(pinTextConfig?.textLayout) || getDefaultNotePinDesign().textLayout);
                await page.setFlag(MODULE.ID, 'notePinTextDisplay', normalizePinTextDisplay(pinTextConfig?.textDisplay) || getDefaultNotePinDesign().textDisplay);
                await page.setFlag(MODULE.ID, 'notePinTextColor', normalizePinTextColor(pinTextConfig?.textColor) || getDefaultNotePinDesign().textColor);
                await page.setFlag(MODULE.ID, 'notePinTextSize', normalizePinTextSize(pinTextConfig?.textSize) || getDefaultNotePinDesign().textSize);
                await page.setFlag(MODULE.ID, 'notePinTextMaxLength', normalizePinTextMaxLength(pinTextConfig?.textMaxLength) ?? getDefaultNotePinDesign().textMaxLength);
                await page.setFlag(MODULE.ID, 'notePinTextScaleWithPin', normalizePinTextScaleWithPin(pinTextConfig?.textScaleWithPin) ?? getDefaultNotePinDesign().textScaleWithPin);

                await updateNotePinForPage(page);

                const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
                if (panelManager?.notesPanel && panelManager.element) {
                    await panelManager.notesPanel._refreshData();
                    panelManager.notesPanel.render(panelManager.element);
                }
            }
        });
        picker.render(true);
    };

    const deleteHandler = async (pinData) => {
        const noteUuid = pinData?.config?.noteUuid;
        if (!noteUuid) return;
        const page = await foundry.utils.fromUuid(noteUuid);
        if (!page) {
            ui.notifications.error('Note not found.');
            return;
        }

        if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
            ui.notifications.warn('You do not have permission to delete this note.');
            return;
        }

        const confirmed = await Dialog.confirm({
            title: 'Delete Note',
            content: '<p>Delete this note and its pin?</p>',
            yes: () => true,
            no: () => false,
            defaultYes: false
        });
        if (!confirmed) return;

        await deleteNotePinForPage(page);
        await page.delete();

        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.notesPanel && panelManager.element) {
            await panelManager.notesPanel._refreshData();
            panelManager.notesPanel.render(panelManager.element);
        }
    };

    notePinContextMenuDisposers = [
        pins.registerContextMenuItem(`${MODULE.ID}-view-note`, {
            name: 'View Note',
            icon: '<i class="fa-solid fa-eye"></i>',
            moduleId: MODULE.ID,
            order: 10,
            onClick: makeOpenHandler(true)
        }),
        pins.registerContextMenuItem(`${MODULE.ID}-edit-note`, {
            name: 'Edit Note',
            icon: '<i class="fa-solid fa-pen"></i>',
            moduleId: MODULE.ID,
            order: 20,
            onClick: makeOpenHandler(false)
        }),
        pins.registerContextMenuItem(`${MODULE.ID}-configure-pin`, {
            name: 'Configure Pin',
            icon: '<i class="fa-solid fa-gear"></i>',
            moduleId: MODULE.ID,
            order: 30,
            onClick: configureHandler
        }),
        pins.registerContextMenuItem(`${MODULE.ID}-delete-note`, {
            name: 'Delete Pin and Note',
            icon: '<i class="fa-solid fa-trash"></i>',
            moduleId: MODULE.ID,
            order: 40,
            onClick: deleteHandler
        })
    ];
    notePinContextMenuRegistered = true;
}

function registerNotePinHandlers() {
    const pins = getPinsApi();
    if (!pins?.on || !isPinsApiAvailable(pins)) {
        return;
    }
    if (!notePinSceneSyncHookId) {
        notePinSceneSyncHookId = Hooks.on('updateScene', (scene, changes) => {
            if (!scene || scene.id !== canvas?.scene?.id) return;
            if (!changes?.flags) return;
            syncNotesForDeletedPins(scene.id);
        });
    }
    registerNotePinContextMenuItems(pins);
    if (notePinClickDisposer) return;

    notePinHandlerController = new AbortController();
    notePinClickDisposer = pins.on('click', async (evt) => {
        const noteUuid = evt?.pin?.config?.noteUuid;
        if (!noteUuid) return;
        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (!panelManager) {
            return;
        }
        panelManager?.notesPanel?.showNote?.(noteUuid);
        if (!panelManager?.notesPanel?.showNote) {
            if (panelManager?.setViewMode) {
                await panelManager.setViewMode('notes');
            }
            if (panelManager?.element && !panelManager.element.classList.contains('expanded')) {
                panelManager.element.classList.add('expanded');
            }
            if (panelManager?.notesPanel?.render && panelManager.element) {
                await panelManager.notesPanel.render(panelManager.element);
            }
        }

        const tryFocus = () => focusNoteCardInDom(noteUuid);
        tryFocus();
        trackModuleTimeout(tryFocus, 200);
        trackModuleTimeout(tryFocus, 500);
        trackModuleTimeout(tryFocus, 1000);
    }, { moduleId: MODULE.ID, signal: notePinHandlerController.signal });

    pins.on('doubleClick', async (evt) => {
        const noteUuid = evt?.pin?.config?.noteUuid;
        if (!noteUuid) return;
        const page = await foundry.utils.fromUuid(noteUuid);
        if (!page) return;

        const noteData = buildNoteDataFromPage(page);
        if (!noteData) return;

        const form = new NotesForm(noteData, { viewMode: true });
        form.render(true);
    }, { moduleId: MODULE.ID, signal: notePinHandlerController.signal });
}

export async function createNotePinForPage(page, sceneId, x, y) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) {
        throw new Error('Pins API not available.');
    }

    // Check if user has permission on the page before attempting to create pin
    if (!game.user.isGM && !page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
        throw new Error('Permission denied: You do not have Owner permission on this note.');
    }

    if (pins.create) {
        if (typeof pins.whenReady === 'function') {
            await pins.whenReady();
        }

        const pinPayload = {
            id: generateNotePinId(),
            x,
            y,
            moduleId: MODULE.ID,
            type: NOTE_PIN_TYPE,
            image: resolveNotePinImageValueFromPage(page),
            text: getNotePinTextForPage(page),
            size: getNotePinSizeForPage(page),
            shape: getNotePinShapeForPage(page),
            dropShadow: getNotePinDropShadowForPage(page),
            style: getNotePinStyleForPage(page),
            textLayout: getNotePinTextLayoutForPage(page),
            textDisplay: getNotePinTextDisplayForPage(page),
            textColor: getNotePinTextColorForPage(page),
            textSize: getNotePinTextSizeForPage(page),
            textMaxLength: getNotePinTextMaxLengthForPage(page),
            textScaleWithPin: getNotePinTextScaleWithPinForPage(page),
            ownership: getNotePinOwnershipForPage(page),
            config: {
                noteUuid: page.uuid,
                visibility: page.getFlag(MODULE.ID, 'visibility') || 'private',
                authorId: page.getFlag(MODULE.ID, 'authorId') || game.user.id
            }
        };
        logPinPackage('CREATE', pinPayload);

        let pinData;
        try {
            pinData = await pins.create(pinPayload, { sceneId });
        } catch (error) {
            if (!game.user.isGM && isPermissionDeniedError(error) && typeof pins.requestGM === 'function') {
                pinData = await pins.requestGM('create', {
                    sceneId,
                    payload: pinPayload
                });
            } else {
                throw error;
            }
        }

        if (typeof pins.reload === 'function') {
            await pins.reload({ sceneId });
        }

        return pinData?.id || null;
    }

    throw new Error('Pins API does not support create.');
}

export async function deleteNotePinForPage(page) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;

    const pinId = page.getFlag(MODULE.ID, 'pinId');
    if (pins.delete) {
        const sceneId = page.getFlag(MODULE.ID, 'sceneId') || canvas?.scene?.id;
        const deletePin = async (id) => {
            try {
                await pins.delete(id, { sceneId });
            } catch (error) {
                if (!game.user.isGM && isPermissionDeniedError(error) && typeof pins.requestGM === 'function') {
                    await pins.requestGM('delete', { sceneId, pinId: id });
                } else {
                    throw error;
                }
            }
        };

        if (pinId) {
            await deletePin(pinId);
        } else if (pins.list) {
            const matches = pins.list({ moduleId: MODULE.ID, type: NOTE_PIN_TYPE, sceneId })
                .filter(pin => pin?.config?.noteUuid === page.uuid);
            for (const pin of matches) {
                if (pin?.id) {
                    await deletePin(pin.id);
                }
            }
        }
        return;
    }

    return;
}

export async function updateNotePinForPage(page) {
    const pins = getPinsApi();
    if (!isPinsApiAvailable(pins)) return;
    if (!pins.update) return;

    const pinId = page.getFlag(MODULE.ID, 'pinId');
    if (!pinId) return;

    let sceneId = page.getFlag(MODULE.ID, 'sceneId');
    if (!sceneId && typeof pins.findScene === 'function') {
        sceneId = pins.findScene(pinId);
    }
    if (!sceneId) {
        sceneId = canvas?.scene?.id || null;
    }
    if (!sceneId) return;

    const patch = {
        image: resolveNotePinImageValueFromPage(page),
        text: getNotePinTextForPage(page),
        size: getNotePinSizeForPage(page),
        shape: getNotePinShapeForPage(page),
        dropShadow: getNotePinDropShadowForPage(page),
        style: getNotePinStyleForPage(page),
        textLayout: getNotePinTextLayoutForPage(page),
        textDisplay: getNotePinTextDisplayForPage(page),
        textColor: getNotePinTextColorForPage(page),
        textSize: getNotePinTextSizeForPage(page),
        textMaxLength: getNotePinTextMaxLengthForPage(page),
        textScaleWithPin: getNotePinTextScaleWithPinForPage(page),
        type: NOTE_PIN_TYPE,
        ownership: getNotePinOwnershipForPage(page),
        config: {
            noteUuid: page.uuid,
            visibility: page.getFlag(MODULE.ID, 'visibility') || 'private',
            authorId: page.getFlag(MODULE.ID, 'authorId') || game.user.id
        }
    };
    logPinPackage('UPDATE', { pinId, sceneId, ...patch });

    try {
        let updated;
        try {
            updated = await pins.update(pinId, patch, { sceneId });
        } catch (error) {
            if (!game.user.isGM && isPermissionDeniedError(error) && typeof pins.requestGM === 'function') {
                updated = await pins.requestGM('update', {
                    sceneId,
                    pinId,
                    patch
                });
            } else {
                throw error;
            }
        }
        if (updated === null) {
            const logger = getBlacksmith()?.utils?.postConsoleAndNotification;
            const pinExists = typeof pins.exists === 'function'
                ? pins.exists(pinId, { sceneId })
                : !!pins.get?.(pinId, { sceneId });

            if (pinExists) {
                if (typeof logger === 'function') {
                    logger('NOTE | PINS Pin update returned null but pin still exists. Keeping note flags.', {
                        pinId,
                        sceneId,
                        noteUuid: page.uuid
                    });
                }
                return;
            }

            if (typeof logger === 'function') {
                logger('NOTE | PINS Pin update returned null (pin missing). Clearing note flags.', {
                    pinId,
                    sceneId,
                    noteUuid: page.uuid
                });
            }
            await page.setFlag(MODULE.ID, 'pinId', null);
            await page.setFlag(MODULE.ID, 'sceneId', null);
            await page.setFlag(MODULE.ID, 'x', null);
            await page.setFlag(MODULE.ID, 'y', null);

            const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
            if (panelManager?.notesPanel && panelManager.element) {
                await panelManager.notesPanel._refreshData();
                panelManager.notesPanel.render(panelManager.element);
            }
            return;
        }
    } catch (error) {
        const message = String(error?.message || error || '');
        // If it's a permission error, provide more context
        if (message.toLowerCase().includes('permission denied') || message.toLowerCase().includes('cannot update')) {
            // Check if user actually has permission on the page
            const hasPagePermission = page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
            if (hasPagePermission) {
                // User has permission on page but not on pin - this suggests ownership sync issue
                // The fix above should resolve this, but provide helpful error
                throw new Error(`Permission denied: Pin ownership may be out of sync. Try unpinning and re-pinning the note.`);
            } else {
                // User doesn't have permission on page either
                throw new Error(`Permission denied: You do not have Owner permission on this note.`);
            }
        }
        throw error;
    }
}

export class NotesPanel {
    constructor() {
        this.element = null;
        this.notes = [];
        this.filters = {
            search: '',
            tags: [],
            scene: 'all',
            visibility: 'all' // all, private, party
        };
        this.filtersOpen = false;
        this.allTags = new Set();
        this.scenes = new Set();
        this._pinPlacement = null;
        registerNotePinHandlers();
        // Hooks are now managed centrally by HookManager
    }





    /**
     * Clean up when the panel is destroyed
     * @public
     */
    destroy() {
        this._clearNotePinPlacement();
        this.element = null;
    }

    async render(element) {
        // If no element is provided, exit early
        if (!element) return;
        
        // v13: Convert jQuery to native DOM if needed
        this.element = getNativeElement(element);
        const notesContainer = this.element?.querySelector('[data-panel="panel-notes"]');
        if (!notesContainer) return;
        const previousScrollTop = notesContainer.querySelector('.notes-content')?.scrollTop;

        // Refresh data (load notes)
        await this._refreshData();

        // Get the selected journal ID
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        const journal = journalId !== 'none' ? game.journal.get(journalId) : null;
        const canViewJournal = journal ? (game.user.isGM || journal.testUserPermission(game.user, PERMISSION_LEVELS.OBSERVER)) : false;

        // If journal ID exists but journal doesn't, reset to 'none'
        if (journalId !== 'none' && !journal && game.user.isGM) {
            await game.settings.set(MODULE.ID, 'notesJournal', 'none');
            ui.notifications.warn("The previously selected notes journal no longer exists. Please select a new one.");
        }

        // Render template with notes data
        const cardTheme = (await game.user?.getFlag(MODULE.ID, 'notesCardTheme')) || 'dark';
        const viewMode = (await game.user?.getFlag(MODULE.ID, 'notesViewMode')) || 'cards';
        const stripHtml = (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const html = await renderTemplate(TEMPLATES.PANEL_NOTES, { 
            hasJournal: !!journal && canViewJournal,
            journal: journal,
            journalName: journal?.name || 'No Journal Selected',
            notes: this.notes.map(note => ({
                ...note,
                tags: note.tags || [], // Ensure tags is always an array
                tagsCsv: (note.tags || []).map(tag => String(tag).toUpperCase()).join(','),
                searchText: [
                    note.name,
                    stripHtml(note.content),
                    (note.tags || []).join(' ')
                ].filter(Boolean).join(' ')
            })),
            allTags: Array.from(this.allTags).sort(),
            scenes: Array.from(this.scenes).sort(),
            filters: this.filters,
            filtersOpen: this.filtersOpen,
            isGM: game.user.isGM,
            currentUserId: game.user.id,
            cardTheme,
            viewMode,
            position: "left"
        });
        // v13: Use native DOM innerHTML instead of jQuery html()
        notesContainer.innerHTML = html;
        const newContent = notesContainer.querySelector('.notes-content');
        if (newContent && typeof previousScrollTop === 'number') {
            newContent.scrollTop = previousScrollTop;
        }

        this.activateListeners(notesContainer);
    }

    /**
     * Refresh data from the journal - load all notes using NotesParser
     * @private
     */
    async _refreshData() {
        // Clear existing data
        this.notes = [];
        this.allTags.clear();
        this.scenes.clear();

        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        const journal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;

        if (!journal) return;

        // Check if user can view this journal
        const canViewJournal = game.user.isGM || journal.testUserPermission(game.user, PERMISSION_LEVELS.OBSERVER);
        if (!canViewJournal) return;

        // Process all pages in the journal
        for (const page of journal.pages.contents) {
            try {
                // Check if this is a note (has noteType flag)
                const noteType = page.getFlag(MODULE.ID, 'noteType');
                if (noteType !== 'sticky') {
                    // Not a note, skip it
                    continue;
                }

                // Check visibility - filter private notes
                const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
                if (visibility === 'private' && !game.user.isGM) {
                    // Private notes: only show to author or GM
                    const authorId = page.getFlag(MODULE.ID, 'authorId');
                    if (authorId !== game.user.id) {
                        continue; // Skip this note
                    }
                }

                // Get page content
                const content = await getJournalPageContent(page);
                
                // Enrich content
                const enriched = await enrichJournalContent(content, {
                    secrets: game.user.isGM,
                    documents: true,
                    links: true,
                    rolls: true
                });

                // Parse the note
                const note = await NotesParser.parseSinglePage(page, enriched);
                
                if (note) {
                    // Ensure authorName is always set (fallback to user ID if name lookup failed)
                    if (!note.authorName && note.authorId) {
                        note.authorName = note.authorId;
                    }

                    if (!Array.isArray(note.editorIds)) {
                        note.editorIds = [];
                    }

                    const editorIds = [...new Set(note.editorIds.length ? note.editorIds : (note.authorId ? [note.authorId] : []))];
                    note.editorAvatars = editorIds.map(id => {
                        const user = game.users.get(id) || game.users.find(u => u.id === id);
                        return {
                            id,
                            name: user?.name || id || 'Unknown',
                            img: user?.avatar || user?.img || 'icons/svg/mystery-man.svg'
                        };
                    });
                    
                    // Ensure tags is always an array (even if empty)
                    if (!Array.isArray(note.tags)) {
                        note.tags = [];
                    }
                    note.tags = note.tags.map(tag => String(tag).toUpperCase());
                    note.pinId = page.getFlag(MODULE.ID, 'pinId') || null;
                    note.iconHtml = resolveNoteIconHtmlFromPage(page, 'note-icon-image');
                    this.notes.push(note);
                    
                    // Collect tags
                    if (note.tags && Array.isArray(note.tags)) {
                        note.tags.forEach(tag => this.allTags.add(tag));
                    }
                    
                    // Collect scenes
                    if (note.sceneId && note.sceneName) {
                        this.scenes.add(note.sceneName);
                    }
                }
            } catch (error) {
                console.error(`Error processing note page ${page.id}:`, error);
                // Continue processing other notes
            }
        }

        // Sort notes by timestamp (newest first)
        this.notes.sort((a, b) => {
            if (!a.timestamp && !b.timestamp) return 0;
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        if (game.user.isGM) {
            await this._syncPinnedNotesOwnership();
        }
    }

    async _syncPinnedNotesOwnership() {
        const pins = getPinsApi();
        if (!isPinsApiAvailable(pins) || !pins?.update) return;
        if (typeof pins.whenReady === 'function') {
            await pins.whenReady();
        }

        let updated = 0;
        for (const note of this.notes) {
            if (!note?.uuid) continue;
            const page = await foundry.utils.fromUuid(note.uuid);
            if (!page) continue;
            const pinId = page.getFlag(MODULE.ID, 'pinId');
            const sceneId = page.getFlag(MODULE.ID, 'sceneId');
            if (!pinId || !sceneId) continue;
            await updateNotePinForPage(page);
            updated += 1;
        }

        if (updated > 0) {
        }
    }

    async _cleanupMissingPins() {
        if (!game.user?.isGM) return;

        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        const journal = journalId && journalId !== 'none' ? game.journal.get(journalId) : null;
        if (!journal) return;

        const pins = getPinsApi();
        if (!isPinsApiAvailable(pins)) {
            ui.notifications.warn('Blacksmith Pins API not available.');
            return;
        }

        if (typeof pins.whenReady === 'function') {
            await pins.whenReady();
        }

        const sceneIds = new Set();
        for (const page of journal.pages.contents) {
            const sceneId = page.getFlag(MODULE.ID, 'sceneId');
            if (sceneId) {
                sceneIds.add(sceneId);
            }
        }

        if (!sceneIds.size && canvas?.scene?.id) {
            sceneIds.add(canvas.scene.id);
        }

        const pinIndex = new Map();
        for (const sceneId of sceneIds) {
            const scenePins = pins.list ? (pins.list({ moduleId: MODULE.ID, type: NOTE_PIN_TYPE, sceneId }) || []) : [];
            for (const pin of scenePins) {
                const noteUuid = pin?.config?.noteUuid;
                if (!noteUuid) continue;
                pinIndex.set(noteUuid, { pin, sceneId });
            }
        }

        for (const sceneId of sceneIds) {
            await syncNotesForDeletedPins(sceneId);
        }

        for (const page of journal.pages.contents) {
            const match = pinIndex.get(page.uuid);
            if (!match) continue;
            const { pin, sceneId } = match;
            const pinId = pin?.id || null;
            if (!pinId) continue;

            const storedPinId = page.getFlag(MODULE.ID, 'pinId');
            const storedSceneId = page.getFlag(MODULE.ID, 'sceneId');
            const needsUpdate = storedPinId !== pinId || storedSceneId !== sceneId;

            if (needsUpdate) {
                await page.setFlag(MODULE.ID, 'pinId', pinId);
                await page.setFlag(MODULE.ID, 'sceneId', sceneId);
                await page.setFlag(MODULE.ID, 'x', typeof pin.x === 'number' ? pin.x : page.getFlag(MODULE.ID, 'x'));
                await page.setFlag(MODULE.ID, 'y', typeof pin.y === 'number' ? pin.y : page.getFlag(MODULE.ID, 'y'));
            }
        }

        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.notesPanel && panelManager.element) {
            await panelManager.notesPanel._refreshData();
            panelManager.notesPanel.render(panelManager.element);
        }
    }

    async _deleteAllPins(scope) {
        if (!game.user?.isGM) return;
        const pins = getPinsApi();
        if (!isPinsApiAvailable(pins) || !pins?.deleteAllByType) {
            ui.notifications.warn('Blacksmith Pins API not available.');
            return;
        }

        const sceneIds = [];
        if (scope === 'scene') {
            if (!canvas?.scene?.id) {
                ui.notifications.warn('No active scene.');
                return;
            }
            sceneIds.push(canvas.scene.id);
        } else {
            game.scenes?.forEach(scene => {
                if (scene?.id) sceneIds.push(scene.id);
            });
        }

        if (!sceneIds.length) return;

        for (const sceneId of sceneIds) {
            await pins.deleteAllByType(NOTE_PIN_TYPE, { sceneId, moduleId: MODULE.ID });
        }

        await this._cleanupMissingPins();

        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.notesPanel && panelManager.element) {
            await panelManager.notesPanel._refreshData();
            panelManager.notesPanel.render(panelManager.element);
        }
    }

    activateListeners(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Set journal button (GM only)
        nativeHtml.querySelectorAll('.set-journal-button, .set-journal-button-large').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                if (game.user.isGM) {
                    showJournalPicker({
                        title: 'Select Journal for Notes',
                        getCurrentId: () => game.settings.get(MODULE.ID, 'notesJournal'),
                        onSelect: async (journalId) => {
                            await game.settings.set(MODULE.ID, 'notesJournal', journalId);
                            if (journalId && journalId !== 'none') {
                                const journal = game.journal.get(journalId);
                                if (journal) {
                                    const defaultPerm = journal.ownership.default;
                                    if (defaultPerm < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
                                        ui.notifications.warn(`Warning: Notes journal "${journal.name}" should have "All Players = Observer" ownership to allow players to create notes.`);
                                    } else {
                                        ui.notifications.info(`Notes journal "${journal.name}" selected.`);
                                    }
                                }
                            } else {
                                ui.notifications.info('Notes journal selection cleared.');
                            }
                        },
                        reRender: () => this.render(this.element),
                        infoHtml: '<p style="margin-bottom: 5px; color: #ddd;"><i class="fa-solid fa-info-circle" style="color: #88f;"></i> This journal will be used for all player notes. Players can create notes if they have Observer access or better.</p><p style="color: #ddd;">Make sure the journal has "All Players = Observer" ownership to allow players to create notes.</p>',
                        showRefreshButton: true
                    });
                }
            });
        });

        // New Note button - opens NotesForm window
        nativeHtml.querySelectorAll('.new-note-button, .new-note-button-large').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const form = new NotesForm();
                form.render(true);
            });
        });

        // Refresh button
        const refreshButton = nativeHtml.querySelector('.refresh-notes-button');
        if (refreshButton) {
            const newButton = refreshButton.cloneNode(true);
            refreshButton.parentNode?.replaceChild(newButton, refreshButton);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                await this._refreshData();
                this.render(this.element);
            });
        }

        const cleanupButton = nativeHtml.querySelector('.cleanup-notes-pins-button');
        if (cleanupButton) {
            const newButton = cleanupButton.cloneNode(true);
            cleanupButton.parentNode?.replaceChild(newButton, cleanupButton);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const confirmed = await Dialog.confirm({
                    title: 'Clean Up Missing Pins',
                    content: '<p>Scan notes and clear pin flags when the pin no longer exists?</p>',
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });
                if (!confirmed) return;
                await this._cleanupMissingPins();
                ui.notifications.info('Pin cleanup complete.');
            });
        }

        const deleteAllPinsButton = nativeHtml.querySelector('.delete-all-notes-pins-button');
        if (deleteAllPinsButton) {
            const newButton = deleteAllPinsButton.cloneNode(true);
            deleteAllPinsButton.parentNode?.replaceChild(newButton, deleteAllPinsButton);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const choice = await Dialog.wait({
                    title: 'Delete Note Pins',
                    content: '<p>Delete note pins for this scene, or all scenes?</p>',
                    buttons: {
                        scene: {
                            label: 'This Scene',
                            callback: () => 'scene'
                        },
                        all: {
                            label: 'All Scenes',
                            callback: () => 'all'
                        },
                        cancel: {
                            label: 'Cancel',
                            callback: () => null
                        }
                    },
                    default: 'cancel',
                    close: () => null
                });
                if (!choice) return;
                const confirmed = await Dialog.confirm({
                    title: 'Confirm Deletion',
                    content: choice === 'scene'
                        ? '<p>Delete all note pins for this scene?</p>'
                        : '<p>Delete all note pins across all scenes?</p>',
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });
                if (!confirmed) return;
                await this._deleteAllPins(choice);
                ui.notifications.info('Note pins deleted.');
            });
        }

        const themeToggle = nativeHtml.querySelector('.notes-card-theme-toggle');
        if (themeToggle) {
            const newToggle = themeToggle.cloneNode(true);
            themeToggle.parentNode?.replaceChild(newToggle, themeToggle);
            newToggle.addEventListener('click', async (event) => {
                event.preventDefault();
                const current = newToggle.dataset.theme || 'dark';
                const next = current === 'light' ? 'dark' : 'light';
                await game.user?.setFlag(MODULE.ID, 'notesCardTheme', next);
                this.render(this.element);
            });
        }

        const viewToggle = nativeHtml.querySelector('.notes-view-toggle');
        if (viewToggle) {
            const newToggle = viewToggle.cloneNode(true);
            viewToggle.parentNode?.replaceChild(newToggle, viewToggle);
            newToggle.addEventListener('click', async (event) => {
                event.preventDefault();
                const current = newToggle.dataset.view || 'cards';
                const next = current === 'list' ? 'cards' : 'list';
                await game.user?.setFlag(MODULE.ID, 'notesViewMode', next);
                this.render(this.element);
            });
        }

        // Search filter
        const searchInput = nativeHtml.querySelector('.notes-search-input');
        if (searchInput) {
            const newInput = searchInput.cloneNode(true);
            searchInput.parentNode?.replaceChild(newInput, searchInput);
            newInput.addEventListener('input', (event) => {
                this.filters.search = event.target.value;
                this._applyFilters(nativeHtml);
                this._updateClearSearchState(nativeHtml);
            });
        }
        const clearSearchButton = nativeHtml.querySelector('.clear-notes-search');
        if (clearSearchButton) {
            const newClear = clearSearchButton.cloneNode(true);
            clearSearchButton.parentNode?.replaceChild(newClear, clearSearchButton);
            newClear.addEventListener('click', (event) => {
                event.preventDefault();
                this.filters.search = '';
                this.filters.tags = [];
                this.filters.scene = 'all';
                this.filters.visibility = 'all';
                const input = nativeHtml.querySelector('.notes-search-input');
                if (input) {
                    input.value = '';
                }
                this.render(this.element);
            });
        }

            // Tag filter
            nativeHtml.querySelectorAll('.tag-item').forEach(tag => {
                const newTag = tag.cloneNode(true);
                tag.parentNode?.replaceChild(newTag, tag);
                newTag.addEventListener('click', (event) => {
                    const tagName = event.currentTarget.dataset.tag?.toUpperCase();
                    if (!this.filters.tags) {
                        this.filters.tags = [];
                    }
                    const index = this.filters.tags.indexOf(tagName);
                if (index > -1) {
                    this.filters.tags.splice(index, 1);
                } else {
                    this.filters.tags.push(tagName);
                }
                this._applyFilters(nativeHtml);
                this._updateClearSearchState(nativeHtml);
            });
        });

        // Tag cloud toggle
        const toggleFiltersButton = nativeHtml.querySelector('.toggle-notes-filters-button');
        if (toggleFiltersButton) {
            const newToggle = toggleFiltersButton.cloneNode(true);
            toggleFiltersButton.parentNode?.replaceChild(newToggle, toggleFiltersButton);
            newToggle.addEventListener('click', (event) => {
                event.preventDefault();
                this.filtersOpen = !this.filtersOpen;
                this.render(this.element);
            });
        }

        // Scene filter
        const sceneFilter = nativeHtml.querySelector('.scene-filter-select');
        if (sceneFilter) {
            const newSelect = sceneFilter.cloneNode(true);
            sceneFilter.parentNode?.replaceChild(newSelect, sceneFilter);
            newSelect.addEventListener('change', (event) => {
                this.filters.scene = event.target.value;
                this._applyFilters(nativeHtml);
                this._updateClearSearchState(nativeHtml);
            });
        }

        nativeHtml.querySelectorAll('.notes-visibility-button').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', (event) => {
                event.preventDefault();
                const visibility = event.currentTarget.dataset.visibility || 'all';
                this.filters.visibility = visibility;
                this._applyFilters(nativeHtml);
                nativeHtml.querySelectorAll('.notes-visibility-button').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.visibility === visibility);
                });
                this._updateClearSearchState(nativeHtml);
            });
        });

        // Note actions
        nativeHtml.querySelectorAll('.note-edit').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                try {
                    const page = await foundry.utils.fromUuid(uuid);
                    if (!page) {
                        ui.notifications.error('Note not found.');
                        return;
                    }
                    
                    const noteData = buildNoteDataFromPage(page);
                    if (!noteData) return;

                    const form = new NotesForm(noteData, { viewMode: false });
                    form.render(true);
                } catch (error) {
                    console.error('Error opening note for editing:', error);
                    ui.notifications.error(`Failed to open note: ${error.message}`);
                }
            });
        });

        nativeHtml.querySelectorAll('.note-delete').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                const confirmed = await Dialog.confirm({
                    title: 'Delete Note',
                    content: '<p>Are you sure you want to delete this note?</p>',
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });
                    if (confirmed) {
                        const page = await foundry.utils.fromUuid(uuid);
                        if (page) {
                            const sceneId = page.getFlag(MODULE.ID, 'sceneId');
                            if (sceneId) {
                                await this._unpinNote(page);
                            }
                            await page.delete();
                            // Refresh the panel using panel manager's element
                            const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
                            if (panelManager && panelManager.element) {
                                await this._refreshData();
                                this.render(panelManager.element);
                            }
                        }
                    }
                });
            });

        nativeHtml.querySelectorAll('.note-pin, .note-unpin').forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode?.replaceChild(newButton, button);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const uuid = event.currentTarget.dataset.uuid;
                const isUnpin = event.currentTarget.classList.contains('note-unpin');
                if (!uuid) return;

                const page = await foundry.utils.fromUuid(uuid);
                if (!page) {
                    ui.notifications.error('Note not found.');
                    return;
                }

                if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
                    ui.notifications.warn('You do not have permission to pin this note.');
                    return;
                }

                if (isUnpin) {
                    await this._unpinNote(page);
                    return;
                }

                await this._beginNotePinPlacement(page);
            });
        });

        nativeHtml.querySelectorAll('.note-open-title').forEach(title => {
            const newTitle = title.cloneNode(true);
            title.parentNode?.replaceChild(newTitle, title);
            newTitle.addEventListener('click', async (event) => {
                event.preventDefault();
                const row = event.currentTarget.closest('[data-note-uuid]');
                const noteUuid = row?.dataset?.noteUuid;
                if (!noteUuid) return;

                const page = await foundry.utils.fromUuid(noteUuid);
                if (!page) {
                    ui.notifications.error('Note not found.');
                    return;
                }

                const noteData = buildNoteDataFromPage(page);
                if (!noteData) return;

                const form = new NotesForm(noteData, { viewMode: true });
                form.render(true);
            });
        });

        nativeHtml.querySelectorAll('.note-give').forEach(giveButton => {
            const newButton = giveButton.cloneNode(true);
            giveButton.parentNode?.replaceChild(newButton, giveButton);
            newButton.addEventListener('click', async (event) => {
                event.preventDefault();
                const noteUuid = newButton.dataset.uuid;
                if (!noteUuid) return;

                const page = await foundry.utils.fromUuid(noteUuid);
                if (!page) {
                    ui.notifications.error('Note not found.');
                    return;
                }

                const authorId = page.getFlag(MODULE.ID, 'authorId');
                if (!game.user.isGM && authorId !== game.user.id) {
                    ui.notifications.warn('You do not own this note.');
                    return;
                }
                const visibility = page.getFlag(MODULE.ID, 'visibility') || 'private';
                if (visibility !== 'private') {
                    ui.notifications.warn('Only private notes can be given to another player.');
                    return;
                }

                    const picker = new UsersWindow({
                        onUserSelected: async (user) => {
                            if (!user) return;
                            await page.setFlag(MODULE.ID, 'authorId', user.id);
                            await page.setFlag(MODULE.ID, 'editorIds', [user.id]);
                            await syncNoteOwnership(page, visibility, user.id);
                            await updateNotePinForPage(page);
                            this.render(this.element);
                        }
                    });
                picker.render(true);
            });
        });

        nativeHtml.querySelectorAll('.note-tag').forEach(tag => {
            const newTag = tag.cloneNode(true);
            tag.parentNode?.replaceChild(newTag, tag);
            newTag.addEventListener('click', (event) => {
                event.preventDefault();
                const tagName = event.currentTarget.dataset.tag?.toUpperCase();
                if (!tagName) return;
                this.filters.tags = [tagName];
                this._applyFilters(nativeHtml);
                this._updateClearSearchState(nativeHtml);
            });
        });

        nativeHtml.querySelectorAll('.note-location-section').forEach(location => {
            const newLocation = location.cloneNode(true);
            location.parentNode?.replaceChild(newLocation, location);
            newLocation.addEventListener('click', async (event) => {
                event.preventDefault();
                const pinId = event.currentTarget.dataset.pinId;
                if (!pinId) {
                    return;
                }
                const pins = getPinsApi();
                if (!pins?.panTo) {
                    return;
                }
                const success = await pins.panTo(pinId, {
                    ping: {
                        animation: 'ping',
                        sound: 'interface-ping-01'
                    }
                });
            });
        });

        // Apply initial filters
        this._applyFilters(nativeHtml);
        this._updateClearSearchState(nativeHtml);
    }

    async _beginNotePinPlacement(page) {
        if (!canvas?.scene || !canvas?.app?.view) {
            ui.notifications.warn('Canvas is not ready. Open a scene to place a note pin.');
            return;
        }

        const existingSceneId = page.getFlag(MODULE.ID, 'sceneId');
        if (existingSceneId) {
            ui.notifications.warn('This note is already pinned. Unpin it first to place a new pin.');
            return;
        }

        const pins = getPinsApi();
        if (!isPinsApiAvailable(pins)) {
            ui.notifications.warn('Blacksmith Pins API not available. Install or enable Coffee Pub Blacksmith.');
            return;
        }

        if (this._pinPlacement) {
            this._clearNotePinPlacement();
        }

        ui.notifications.info('Click on the map to place the note pin. Press Esc to cancel.');
        document.body.classList.add(NOTE_PIN_CURSOR_CLASS);
        document.documentElement.classList.add(NOTE_PIN_CURSOR_CLASS);
        document.body.style.cursor = 'crosshair';

        const view = canvas.app.view;
        view.classList.add(NOTE_PIN_CANVAS_CURSOR_CLASS);
        const previewEl = createPinPreviewElement(
            resolveNoteIconHtmlFromPage(page, 'notes-pin-preview-image'),
            getNotePinSizeForPage(page),
            getNotePinStyleForPage(page),
            getNotePinShapeForPage(page),
            getNotePinDropShadowForPage(page)
        );
        document.body.appendChild(previewEl);
        const onPointerMove = (event) => {
            previewEl.style.left = `${event.clientX}px`;
            previewEl.style.top = `${event.clientY}px`;
        };
        const onPointerDown = async (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();

            const rect = view.getBoundingClientRect();
            const globalX = event.clientX - rect.left;
            const globalY = event.clientY - rect.top;
            const localPos = canvas.squirePins?.toLocal({ x: globalX, y: globalY }) ||
                canvas.stage?.toLocal({ x: globalX, y: globalY });

            if (!localPos) {
                ui.notifications.warn('Unable to place pin: canvas position unavailable.');
                this._clearNotePinPlacement();
                return;
            }

            await this._createNotePin(page, canvas.scene.id, localPos.x, localPos.y);
            this._clearNotePinPlacement();
        };

        const onContextMenu = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._clearNotePinPlacement();
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this._clearNotePinPlacement();
            }
        };

        view.addEventListener('pointerdown', onPointerDown, true);
        view.addEventListener('contextmenu', onContextMenu, true);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('pointermove', onPointerMove);

        this._pinPlacement = {
            pageUuid: page.uuid,
            view,
            onPointerDown,
            onContextMenu,
            onKeyDown,
            onPointerMove,
            previewEl
        };
    }

    _clearNotePinPlacement() {
        if (!this._pinPlacement) return;
        const { view, onPointerDown, onContextMenu, onKeyDown, onPointerMove, previewEl } = this._pinPlacement;
        view?.removeEventListener('pointerdown', onPointerDown, true);
        view?.removeEventListener('contextmenu', onContextMenu, true);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('pointermove', onPointerMove);
        document.body.classList.remove(NOTE_PIN_CURSOR_CLASS);
        document.documentElement.classList.remove(NOTE_PIN_CURSOR_CLASS);
        document.body.style.cursor = '';
        view?.classList.remove(NOTE_PIN_CANVAS_CURSOR_CLASS);
        previewEl?.remove();
        this._pinPlacement = null;
    }

    async _createNotePin(page, sceneId, x, y) {
        try {
            const pinId = await createNotePinForPage(page, sceneId, x, y);
            if (pinId) {
                await page.setFlag(MODULE.ID, 'pinId', pinId);
            }
            await page.setFlag(MODULE.ID, 'sceneId', sceneId);
            await page.setFlag(MODULE.ID, 'x', x);
            await page.setFlag(MODULE.ID, 'y', y);
        } catch (error) {
            const message = String(error?.message || error || '');
            if (message.toLowerCase().includes('permission denied')) {
                // Check if user has permission on the page
                const hasPagePermission = page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
                if (hasPagePermission) {
                    ui.notifications.error('Permission denied: Unable to create pin. The pin ownership may need to be synced. Try again or contact your GM.');
                } else {
                    ui.notifications.error('Permission denied: You do not have Owner permission on this note.');
                }
            } else {
                ui.notifications.error(`Failed to create pin: ${message}`);
            }
            return;
        }

        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.notesPanel && panelManager.element) {
            await panelManager.notesPanel._refreshData();
            panelManager.notesPanel.render(panelManager.element);
        }
    }

    async _unpinNote(page) {
        try {
            await deleteNotePinForPage(page);
        } catch (error) {
        }

        await page.setFlag(MODULE.ID, 'sceneId', null);
        await page.setFlag(MODULE.ID, 'x', null);
        await page.setFlag(MODULE.ID, 'y', null);
        await page.setFlag(MODULE.ID, 'pinId', null);

        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.notesPanel && panelManager.element) {
            await panelManager.notesPanel._refreshData();
            panelManager.notesPanel.render(panelManager.element);
        }
    }

    async showNote(noteUuid) {
        const panelManager = game.modules.get(MODULE.ID)?.api?.PanelManager?.instance;
        if (panelManager?.setViewMode) {
            await panelManager.setViewMode('notes');
        }
        if (panelManager?.element && !panelManager.element.classList.contains('expanded')) {
            panelManager.element.classList.add('expanded');
        }

        let focused = false;
        const tryFocus = () => {
            if (focused) return true;
            focused = panelManager?.notesPanel?.scrollToNote?.(noteUuid, panelManager?.element) === true;
            return focused;
        };

        if (panelManager?.notesPanel && panelManager.element) {
            await panelManager.notesPanel.render(panelManager.element);
            tryFocus();
            trackModuleTimeout(tryFocus, 200);
            trackModuleTimeout(tryFocus, 500);
            trackModuleTimeout(tryFocus, 1000);
            trackModuleTimeout(() => {
                if (!focused) {
                } else {
                }
            }, 1200);
        }
    }

    scrollToNote(noteUuid, panelElement = null) {
        const root = panelElement ? getNativeElement(panelElement) : this.element;
        const notesContainer = root?.querySelector('[data-panel="panel-notes"]');
        let card = notesContainer?.querySelector(`.note-card[data-note-uuid="${noteUuid}"]`) || null;

        if (!card) {
            card = document.querySelector(`.note-card[data-note-uuid="${noteUuid}"]`);
        }

        if (!card) {
            return false;
        }

        card.classList.add('note-card-highlight');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        trackModuleTimeout(() => {
            card.classList.remove('note-card-highlight');
        }, 2000);
        return true;
    }

    /**
     * Apply filters to note cards (DOM-based filtering)
     * @private
     */
    _applyFilters(html) {
        const search = (this.filters.search || '').trim().toLowerCase();
        const selectedTags = (this.filters.tags || []).map(tag => tag.toUpperCase());
        const selectedScene = this.filters.scene || 'all';
        const selectedVisibility = this.filters.visibility || 'all';

        html.querySelectorAll('.note-card, .note-row').forEach(card => {
            let visible = true;

            // Search filter
            if (search) {
                const text = (card.dataset.search || card.textContent || '').toLowerCase();
                if (!text.includes(search)) {
                    visible = false;
                }
            }

            // Tag filter
            if (selectedTags.length > 0) {
                const cardTagsStr = card.dataset.tags || '';
                const cardTags = cardTagsStr ? cardTagsStr.split(',').map(t => t.trim().toUpperCase()) : [];
                const hasTag = selectedTags.some(tag => cardTags.includes(tag));
                if (!hasTag) {
                    visible = false;
                }
            }

            // Scene filter
            if (selectedScene !== 'all') {
                const cardScene = card.dataset.scene || 'none';
                if (cardScene !== selectedScene) {
                    visible = false;
                }
            }

            // Visibility filter
            if (selectedVisibility !== 'all') {
                const cardVisibility = card.dataset.visibility || 'private';
                if (cardVisibility !== selectedVisibility) {
                    visible = false;
                }
            }

            // Show/hide card
            card.style.display = visible ? '' : 'none';
        });

        // Update tag active states
        html.querySelectorAll('.tag-item').forEach(tag => {
            const tagName = tag.dataset.tag?.toUpperCase();
            if (tagName && selectedTags.includes(tagName)) {
                tag.classList.add('active');
            } else {
                tag.classList.remove('active');
            }
        });
    }

    _updateClearSearchState(html) {
        const clearButton = html.querySelector('.clear-notes-search');
        if (!clearButton) return;
        const hasSearch = !!(this.filters.search && this.filters.search.trim().length > 0);
        const hasTags = (this.filters.tags || []).length > 0;
        const hasScene = this.filters.scene && this.filters.scene !== 'all';
        const hasVisibility = this.filters.visibility && this.filters.visibility !== 'all';
        const shouldEnable = hasSearch || hasTags || hasScene || hasVisibility;
        clearButton.classList.toggle('disabled', !shouldEnable);
    }

    
    /**
     * Opens the native Foundry journal page for editing instead of embedding an editor
     * @param {jQuery} html - The panel HTML element
     * @param {JournalEntry} journal - The journal document
     * @param {JournalEntryPage} page - The journal page to edit
     * @private
     */
    async _embedEditor(html, journal, page) {
        try {
            if (!journal || !page) return null;
            
            // v13: Detect and convert jQuery to native DOM if needed
            let nativeHtml = html;
            if (html && (html.jquery || typeof html.find === 'function')) {
                nativeHtml = html[0] || html.get?.(0) || html;
            }
            
            // Get the content container
            const contentContainer = nativeHtml.querySelector('.journal-content');
            if (!contentContainer) return;
            
            // Open the native journal sheet directly to this page
            if (page.sheet) {
                page.sheet.render(true);
            } else {
                journal.sheet.render(true, {pageId: page.id});
            }
            
            // Note: Journal updates are now handled centrally by HookManager
            // No need to register local hooks here
            
            return true;
        } catch (error) {
            console.error('Error opening journal page:', error);
            ui.notifications.error("Error opening journal page: " + error.message);
            return null;
        }
    }
}

// NotesForm has been moved to window-note.js
