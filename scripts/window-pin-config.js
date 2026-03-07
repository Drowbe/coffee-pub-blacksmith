// ==================================================================
// ===== WINDOW-PIN-CONFIG – Pin Configuration Window ===============
// ==================================================================
// Application V2 window for configuring pin properties.
// Ported from Squire's NoteIconPicker with Blacksmith integration.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { normalizeTextLayout } from './pins-schema.js';

/**
 * PinConfigWindow - Application V2 window for configuring pins
 * Supports both direct API updates and callback pattern for modules
 */
export class PinConfigWindow extends Application {
    constructor(pinId, options = {}) {
        super(options);
        this.pinId = pinId;
        // Only set sceneId if explicitly provided; undefined allows PinManager.get() to check unplaced first
        this.sceneId = options.sceneId !== undefined ? options.sceneId : undefined;
        this.onSelect = options.onSelect || null;
        this.useAsDefault = options.useAsDefault || false;
        this.defaultSettingKey = options.defaultSettingKey || null;
        this.moduleId = options.moduleId || null;
        this.pinType = null; // Set from pin in getData (pin.type || 'default')
        
        // Will be populated from pin data
        this.selected = null; // { type: 'fa'|'img', value: string } or null
        this.iconMode = 'icon'; // 'icon' or 'image'
        this.lastIconSelection = null;
        this.pinSize = { w: 32, h: 32 };
        this.lockProportions = true;
        this.pinShape = 'circle';
        this.pinStyle = { fill: '#000000', stroke: '#ffffff', strokeWidth: 2, iconColor: '#ffffff' };
        this.dropShadow = true;
        this.pinTextLayout = 'under';
        this.pinTextDisplay = 'always';
        this.pinTextColor = '#ffffff';
        this.pinTextSize = 12;
        this.pinTextMaxLength = 0;
        this.pinTextMaxWidth = 0;
        this.pinTextScaleWithPin = true;
        this._pinRatio = 1;
        this.allowDuplicatePins = false;
    }

    static get defaultOptions() {
        let saved = {};
        try {
            if (game.settings?.get) {
                saved = game.settings.get(MODULE.ID, 'pinConfigWindowBounds') || {};
            }
        } catch {
            saved = {};
        }
        const width = saved.width ?? 700;
        const height = saved.height ?? 600;
        const top = typeof saved.top === 'number' ? saved.top : undefined;
        const left = typeof saved.left === 'number' ? saved.left : undefined;
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'blacksmith-pin-config',
            title: 'Configure Pin',
            template: `modules/${MODULE.ID}/templates/window-pin-config.hbs`,
            width,
            height,
            ...(top != null && { top }),
            ...(left != null && { left }),
            resizable: true,
            classes: ['blacksmith-window', 'blacksmith-pin-config-window']
        });
    }

    /**
     * Save window position and size to client setting when moved or resized.
     */
    setPosition(options = {}) {
        const pos = super.setPosition(options);
        if (this.rendered && game.settings?.set) {
            const { top, left, width, height } = this.position;
            game.settings.set(MODULE.ID, 'pinConfigWindowBounds', { top, left, width, height });
        }
        return pos;
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
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Failed to load pin icons.', error?.message || error, false, true);
            this.iconCategories = [];
            return this.iconCategories;
        }
    }

    static formatIconLabel(iconClass) {
        if (!iconClass) return '';
        const name = iconClass.split(' ').find(cls => cls.startsWith('fa-')) || iconClass;
        return name.replace(/^fa-/, '').replace(/-/g, ' ');
    }

    /**
     * Convert pin image string to icon format { type, value }
     * @param {string} imageString - Pin image string (Font Awesome HTML, class string, or image URL)
     * @returns {{ type: 'fa'|'img', value: string }|null}
     */
    static convertPinImageToIcon(imageString) {
        if (!imageString || typeof imageString !== 'string') return null;
        const trimmed = imageString.trim();
        if (!trimmed) return null;
        
        // Check for Font Awesome HTML
        const faHtmlMatch = trimmed.match(/<i\s+[^>]*class=["']([^"']+)["']/i);
        if (faHtmlMatch?.[1]) {
            const classes = faHtmlMatch[1].split(/\s+/).filter(c => c.startsWith('fa-'));
            if (classes.length > 0) {
                return { type: 'fa', value: classes.join(' ') };
            }
        }
        
        // Check for Font Awesome class string
        if (trimmed.includes('fa-')) {
            const classes = trimmed.split(/\s+/).filter(c => c.startsWith('fa-'));
            if (classes.length > 0) {
                return { type: 'fa', value: classes.join(' ') };
            }
        }
        
        // Check for image URL or <img> tag
        const imgMatch = trimmed.match(/<img\s+[^>]*src=["']([^"']+)["']/i);
        if (imgMatch?.[1]) {
            return { type: 'img', value: imgMatch[1] };
        }
        
        // Check if it's a URL
        if (/^(https?:\/\/|\/|data:)/i.test(trimmed)) {
            return { type: 'img', value: trimmed };
        }
        
        // Assume it's an image path
        if (trimmed.startsWith('modules/')) {
            return { type: 'img', value: `/${trimmed}` };
        }
        
        return { type: 'img', value: trimmed };
    }

    /**
     * Convert icon format to pin image string (for display/preview only).
     * Do not use for storage — use iconToStoredImage() when saving to pin data.
     * @param {{ type: 'fa'|'img', value: string }} icon - Icon object
     * @returns {string} - HTML for FA, URL for img (preview use)
     */
    static convertIconToPinImage(icon) {
        if (!icon || typeof icon !== 'object') return '';
        if (icon.type === 'fa') {
            return `<i class="${icon.value}"></i>`;
        }
        if (icon.type === 'img') {
            return icon.value;
        }
        return '';
    }

    /**
     * Return storage format for pin.image: FA as class string, image as URL only. No HTML.
     * @param {{ type: 'fa'|'img', value: string }|null} icon - Icon object from picker
     * @returns {string|undefined} - "fa-solid fa-book-open" or "icons/svg/…", or undefined if empty
     */
    static iconToStoredImage(icon) {
        if (!icon || typeof icon !== 'object') return undefined;
        const v = (icon.value || '').trim();
        if (!v) return undefined;
        if (icon.type === 'fa') return v; // class string only
        if (icon.type === 'img') return v; // URL only
        return undefined;
    }

    /**
     * Build icon HTML for preview
     * @param {{ type: 'fa'|'img', value: string }|null} iconData - Icon object
     * @param {string} imgClass - CSS class for image
     * @returns {string} - HTML string
     */
    static buildIconHtml(iconData, imgClass = '') {
        if (!iconData) return `<i class="fa-solid fa-location-dot"></i>`;
        if (iconData.type === 'fa') {
            return `<i class="${iconData.value}"></i>`;
        }
        const classAttr = imgClass ? ` class="${imgClass}"` : '';
        return `<img src="${iconData.value}"${classAttr} alt="Pin icon">`;
    }

    async getData() {
        // Load pin data
        // If sceneId is undefined, PinManager.get() will check unplaced store first, then all scenes
        const { PinManager } = await import('./manager-pins.js');
        const pin = PinManager.get(this.pinId, this.sceneId !== undefined ? { sceneId: this.sceneId } : {});
        
        if (!pin) {
            throw new Error(`Pin not found: ${this.pinId}`);
        }

        // Check permissions
        const userId = game.user?.id || '';
        if (!PinManager._canEdit(pin, userId)) {
            throw new Error('Permission denied: you cannot edit this pin.');
        }

        // Convert pin data to window format
        this.selected = PinConfigWindow.convertPinImageToIcon(pin.image);
        this.iconMode = this.selected?.type === 'img' ? 'image' : 'icon';
        this.lastIconSelection = this.selected?.type === 'fa' ? this.selected : null;
        this.pinSize = pin.size || { w: 32, h: 32 };
        this.lockProportions = true; // Default, could be stored in pin.config if needed
        this.pinShape = pin.shape || 'circle';
        this.pinStyle = {
            fill: pin.style?.fill || '#000000',
            stroke: pin.style?.stroke || '#ffffff',
            strokeWidth: pin.style?.strokeWidth || 2,
            alpha: pin.style?.alpha ?? 1,
            iconColor: pin.style?.iconColor ?? '#ffffff'
        };
        this.dropShadow = pin.dropShadow !== false;
        const normalizedLayout = normalizeTextLayout(pin.textLayout);
        this.pinTextLayout = normalizedLayout || 'under';
        this.pinTextDisplay = pin.textDisplay || 'always';
        this.pinTextColor = pin.textColor || '#ffffff';
        this.pinTextSize = pin.textSize || 12;
        this.pinTextMaxLength = pin.textMaxLength ?? 0;
        this.pinTextMaxWidth = pin.textMaxWidth ?? 0;
        this.pinTextScaleWithPin = pin.textScaleWithPin !== false;
        this._pinRatio = this.pinSize.h ? this.pinSize.w / this.pinSize.h : 1;

        const validImageFit = ['fill', 'contain', 'cover', 'none', 'scale-down', 'zoom'];
        this.pinImageFit = (pin.imageFit && validImageFit.includes(pin.imageFit)) ? pin.imageFit : 'cover';
        const zoomNum = typeof pin.imageZoom === 'number' && Number.isFinite(pin.imageZoom) ? Math.max(1, Math.min(2, pin.imageZoom)) : 1;
        this.pinImageZoom = zoomNum;
        const pinImageZoomPercent = Math.round(zoomNum * 100);

        this.allowDuplicatePins = pin.allowDuplicatePins === true;

        // Event animations (hover, click, double-click, delete, add) with optional sound
        const ev = pin.eventAnimations && typeof pin.eventAnimations === 'object' ? pin.eventAnimations : {};
        const eventAnimations = {
            hover: { animation: ev.hover?.animation ?? '', sound: ev.hover?.sound ?? '' },
            click: { animation: ev.click?.animation ?? '', sound: ev.click?.sound ?? '' },
            doubleClick: { animation: ev.doubleClick?.animation ?? '', sound: ev.doubleClick?.sound ?? '' },
            delete: { animation: ev.delete?.animation ?? '', sound: ev.delete?.sound ?? '' },
            add: { animation: ev.add?.animation ?? '', sound: ev.add?.sound ?? '' }
        };
        const interactionAnimList = [
            { value: '', label: 'None' },
            { value: 'ping', label: 'Ping' },
            { value: 'pulse', label: 'Pulse' },
            { value: 'ripple', label: 'Ripple' },
            { value: 'flash', label: 'Flash' },
            { value: 'glow', label: 'Glow' },
            { value: 'bounce', label: 'Bounce' },
            { value: 'scale-small', label: 'Scale small' },
            { value: 'scale-medium', label: 'Scale medium' },
            { value: 'scale-large', label: 'Scale large' },
            { value: 'rotate', label: 'Rotate' },
            { value: 'shake', label: 'Shake' }
        ];
        const animationOptions = interactionAnimList.map((opt) => ({
            ...opt,
            hoverSelected: eventAnimations.hover.animation === opt.value,
            clickSelected: eventAnimations.click.animation === opt.value,
            doubleClickSelected: eventAnimations.doubleClick.animation === opt.value,
            addSelected: eventAnimations.add.animation === opt.value
        }));
        const deleteAnimationOptions = [
            { value: '', label: 'None', selected: eventAnimations.delete.animation === '' },
            { value: 'fade', label: 'Fade', selected: eventAnimations.delete.animation === 'fade' },
            { value: 'dissolve', label: 'Dissolve', selected: eventAnimations.delete.animation === 'dissolve' },
            { value: 'scale-small', label: 'Scale small', selected: eventAnimations.delete.animation === 'scale-small' }
        ];

        // Sound dropdown options from pins API (Blacksmith sound list)
        const { PinsAPI } = await import('./api-pins.js');
        const rawSoundOptions = PinsAPI.getSoundOptions();
        const soundOptions = rawSoundOptions.map((opt) => ({
            value: opt.value,
            label: opt.label,
            hoverSelected: eventAnimations.hover.sound === opt.value,
            clickSelected: eventAnimations.click.sound === opt.value,
            doubleClickSelected: eventAnimations.doubleClick.sound === opt.value,
            deleteSelected: eventAnimations.delete.sound === opt.value,
            addSelected: eventAnimations.add.sound === opt.value
        }));

        // Permissions (GM only): three clear options mapped to Foundry ownership levels
        const NONE = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE : 0;
        const OBSERVER = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : 2;
        const OWNER = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER : 3;
        const isGM = !!game.user?.isGM;
        const rawDefault = typeof pin.ownership?.default === 'number' ? pin.ownership.default : NONE;
        // Map LIMITED (1) to OBSERVER (2) for display so legacy pins show "View"
        const ownershipDefault = rawDefault === 1 ? OBSERVER : rawDefault;
        this._pinOwnership = pin.ownership && typeof pin.ownership === 'object' && !Array.isArray(pin.ownership)
            ? { ...pin.ownership }
            : { default: NONE };
        const ownershipOptions = [
            { value: NONE, label: 'Hidden: GM Only', selected: ownershipDefault === NONE },
            { value: OBSERVER, label: 'Visible: View & Click', selected: ownershipDefault === OBSERVER },
            { value: OWNER, label: 'Editable: Full Edit & Configure Control', selected: ownershipDefault === OWNER }
        ];

        // Load icon categories
        const categories = await PinConfigWindow.loadIconCategories();
        const iconCategories = (categories || []).map(category => {
            const icons = (category.icons || []).map(iconClass => ({
                value: iconClass,
                label: PinConfigWindow.formatIconLabel(iconClass),
                isSelected: this.selected?.type === 'fa' && this.selected.value === iconClass
            }));
            return {
                category: category.category || 'Icons',
                description: category.description || '',
                icons
            };
        });
        const iconCategoryOptions = Array.from(new Set(iconCategories.map(cat => cat.category))).filter(Boolean);

        const imageValue = this.selected?.type === 'img' ? this.selected.value : '';

        const pinTypeLabel = PinManager.getPinTypeLabel(pin.moduleId, pin.type) || '';

        this.pinType = pin.type || 'default';
        if (!this.moduleId) this.moduleId = pin.moduleId || null;

        return {
            isGM,
            pinTypeLabel,
            ownershipOptions,
            previewHtml: PinConfigWindow.buildIconHtml(this.selected, 'window-note-header-image'),
            imageValue,
            iconCategories,
            iconCategoryOptions,
            pinWidth: this.pinSize.w,
            pinHeight: this.pinSize.h,
            lockProportions: this.lockProportions,
            pinShape: this.pinShape,
            pinStroke: this.pinStyle.stroke,
            pinStrokeWidth: this.pinStyle.strokeWidth,
            pinFill: this.pinStyle.fill,
            pinIconColor: this.pinStyle.iconColor ?? '#ffffff',
            pinDropShadow: this.dropShadow,
            pinTextLayout: this.pinTextLayout,
            pinTextDisplay: this.pinTextDisplay,
            pinTextColor: this.pinTextColor,
            pinTextSize: this.pinTextSize,
            pinTextMaxLength: this.pinTextMaxLength,
            pinTextMaxWidth: this.pinTextMaxWidth,
            pinTextMaxLengthDisplay: (this.pinTextMaxLength === 0 || this.pinTextMaxLength == null) ? '' : this.pinTextMaxLength,
            pinTextMaxWidthDisplay: (this.pinTextMaxWidth === 0 || this.pinTextMaxWidth == null) ? '' : this.pinTextMaxWidth,
            pinTextScaleWithPin: this.pinTextScaleWithPin,
            iconMode: this.iconMode,
            showUseAsDefault: true, // Always show toggle - modules can handle saving defaults themselves
            pinAllowDuplicatePins: this.allowDuplicatePins,
            pinImageFit: this.pinImageFit,
            pinImageZoom: this.pinImageZoom,
            pinImageZoomPercent,
            showImageZoomSlider: this.pinImageFit === 'zoom',
            animationOptions,
            deleteAnimationOptions,
            soundOptions,
            eventAnimations
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        const nativeHtml = html?.[0] || html;

        const root = nativeHtml?.classList?.contains('blacksmith-pin-config')
            ? nativeHtml
            : nativeHtml.querySelector('.blacksmith-pin-config');
        // Preview element is optional - may not exist in template
        const preview = nativeHtml.querySelector('.window-note-header-icon') || null;
        const imageInput = nativeHtml.querySelector('.blacksmith-pin-config-image-input');
        const imageRow = nativeHtml.querySelector('.blacksmith-pin-config-image-row');
        const imageFitSelect = nativeHtml.querySelector('.blacksmith-pin-config-image-fit');
        const imageZoomRow = nativeHtml.querySelector('.blacksmith-pin-config-image-zoom-row');
        const imageZoomInput = nativeHtml.querySelector('.blacksmith-pin-config-image-zoom');
        const imageZoomValueEl = nativeHtml.querySelector('.blacksmith-pin-config-zoom-value');
        const imagePreview = nativeHtml.querySelector('.blacksmith-pin-config-image-preview');
        const iconSearchInput = nativeHtml.querySelector('.blacksmith-pin-config-icon-search');
        const iconCategoryFilter = nativeHtml.querySelector('.blacksmith-pin-config-icon-category-filter');
        const widthInput = nativeHtml.querySelector('.blacksmith-pin-config-width');
        const heightInput = nativeHtml.querySelector('.blacksmith-pin-config-height');
        const lockInput = nativeHtml.querySelector('.blacksmith-pin-config-lock');
        const shapeInput = nativeHtml.querySelector('.blacksmith-pin-config-shape');
        const strokeInput = nativeHtml.querySelector('.blacksmith-pin-config-stroke');
        const strokeTextInput = nativeHtml.querySelector('.blacksmith-pin-config-stroke-text');
        const strokeWidthInput = nativeHtml.querySelector('.blacksmith-pin-config-stroke-width');
        const fillInput = nativeHtml.querySelector('.blacksmith-pin-config-fill');
        const fillTextInput = nativeHtml.querySelector('.blacksmith-pin-config-fill-text');
        const iconColorInput = nativeHtml.querySelector('.blacksmith-pin-config-icon-color');
        const iconColorTextInput = nativeHtml.querySelector('.blacksmith-pin-config-icon-color-text');
        const shadowInput = nativeHtml.querySelector('.blacksmith-pin-config-shadow');
        const textLayoutInput = nativeHtml.querySelector('.blacksmith-pin-config-text-layout');
        const textDisplayInput = nativeHtml.querySelector('.blacksmith-pin-config-text-display');
        const textColorInput = nativeHtml.querySelector('.blacksmith-pin-config-text-color');
        const textColorTextInput = nativeHtml.querySelector('.blacksmith-pin-config-text-color-text');
        const textSizeInput = nativeHtml.querySelector('.blacksmith-pin-config-text-size');
        const textMaxLengthInput = nativeHtml.querySelector('.blacksmith-pin-config-text-max-length');
        const textMaxWidthInput = nativeHtml.querySelector('.blacksmith-pin-config-text-max-width');
        const textScaleInput = nativeHtml.querySelector('.blacksmith-pin-config-text-scale');
        const defaultInput = nativeHtml.querySelector('.blacksmith-pin-config-default');
        const allowDuplicateInput = nativeHtml.querySelector('.blacksmith-pin-config-allow-duplicate');
        const sourceToggle = nativeHtml.querySelector('.blacksmith-pin-config-source-toggle-input');
        const shapeNoneNote = nativeHtml.querySelector('.blacksmith-pin-config-shape-none-note');
        const iconModeNote = nativeHtml.querySelector('.blacksmith-pin-config-icon-mode-note');

        const applyIconFilter = () => {
            const query = (iconSearchInput?.value || '').trim().toLowerCase();
            const category = iconCategoryFilter?.value || 'all';
            const iconButtons = nativeHtml.querySelectorAll('.blacksmith-pin-config-icon-option');
            iconButtons.forEach(button => {
                const label = (button.dataset.label || '').toLowerCase();
                const value = (button.dataset.value || '').toLowerCase();
                const iconCategory = (button.dataset.category || '').toLowerCase();
                const matchesQuery = !query || label.includes(query) || value.includes(query);
                const matchesCategory = category === 'all' || iconCategory === category.toLowerCase();
                button.style.display = (matchesQuery && matchesCategory) ? '' : 'none';
            });

            nativeHtml.querySelectorAll('.blacksmith-pin-config-icon-category').forEach(section => {
                const anyVisible = Array.from(section.querySelectorAll('.blacksmith-pin-config-icon-option'))
                    .some(button => button.style.display !== 'none');
                section.style.display = anyVisible ? '' : 'none';
            });
        };

        iconSearchInput?.addEventListener('input', applyIconFilter);
        iconCategoryFilter?.addEventListener('change', applyIconFilter);

        const applyIconModeState = () => {
            const isIconMode = (this.iconMode || 'icon') === 'icon';
            if (iconColorInput) iconColorInput.disabled = !isIconMode;
            if (iconColorTextInput) iconColorTextInput.disabled = !isIconMode;
            if (iconModeNote) iconModeNote.style.display = isIconMode ? 'none' : 'block';
        };

        const applyShapeState = () => {
            const isNone = (this.pinShape || 'circle') === 'none';
            if (fillInput) fillInput.disabled = isNone;
            if (fillTextInput) fillTextInput.disabled = isNone;
            if (strokeInput) strokeInput.disabled = isNone;
            if (strokeTextInput) strokeTextInput.disabled = isNone;
            if (strokeWidthInput) strokeWidthInput.disabled = isNone;
            if (shapeNoneNote) shapeNoneNote.style.display = isNone ? 'block' : 'none';
        };

        const updatePreview = () => {
            if (preview) {
                preview.innerHTML = PinConfigWindow.buildIconHtml(this.selected, 'window-note-header-image');
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
                    this.selected = { type: 'fa', value: 'fa-solid fa-location-dot' };
                }
            }
            if (root) {
                root.dataset.iconMode = mode;
            }
            if (sourceToggle) {
                sourceToggle.checked = mode === 'icon';
            }
            updatePreview();
            if (mode === 'icon') {
                applyIconFilter();
            }
            applyIconModeState();
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
            if (value === '' || value == null || (typeof value === 'string' && value.trim() === '')) return 0;
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return 0;
            return Math.max(0, Math.round(parsed));
        };

        const clampTextMaxWidth = (value, fallback) => {
            if (value === '' || value == null || (typeof value === 'string' && value.trim() === '')) return 0;
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return 0;
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

        nativeHtml.querySelectorAll('.blacksmith-pin-config-icon-option').forEach(button => {
            button.addEventListener('click', () => {
                const value = button.dataset.value;
                this.selected = { type: 'fa', value };
                this.lastIconSelection = this.selected;
                nativeHtml.querySelectorAll('.blacksmith-pin-config-icon-option').forEach(btn => btn.classList.remove('selected'));
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
                nativeHtml.querySelectorAll('.blacksmith-pin-config-icon-option').forEach(btn => btn.classList.remove('selected'));
                updateMode('image');
            }
        });

        imageFitSelect?.addEventListener('change', () => {
            const fit = imageFitSelect.value;
            if (['fill', 'contain', 'cover', 'none', 'scale-down', 'zoom'].includes(fit)) {
                this.pinImageFit = fit;
            }
            if (imageZoomRow) {
                imageZoomRow.classList.toggle('is-hidden', fit !== 'zoom');
            }
        });

        imageZoomInput?.addEventListener('input', () => {
            const pct = Number(imageZoomInput.value);
            if (Number.isFinite(pct)) {
                this.pinImageZoom = pct / 100;
                if (imageZoomValueEl) imageZoomValueEl.textContent = `${Math.round(pct)}%`;
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
            const shape = shapeInput.value;
            if (shape === 'circle' || shape === 'square' || shape === 'none') {
                this.pinShape = shape;
            }
            applyShapeState();
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
        iconColorTextInput?.addEventListener('input', () => {
            const value = iconColorTextInput.value.trim();
            if (value) {
                this.pinStyle.iconColor = value;
                if (iconColorInput) {
                    iconColorInput.value = value;
                }
            }
        });
        iconColorInput?.addEventListener('input', () => {
            const value = iconColorInput.value.trim();
            if (value) {
                this.pinStyle.iconColor = value;
                if (iconColorTextInput) {
                    iconColorTextInput.value = value;
                }
            }
        });
        strokeWidthInput?.addEventListener('change', () => {
            const width = clampStrokeWidth(strokeWidthInput.value, this.pinStyle.strokeWidth);
            this.pinStyle.strokeWidth = width;
            if (strokeWidthInput) strokeWidthInput.value = String(width);
        });
        shadowInput?.addEventListener('change', () => {
            this.dropShadow = !!shadowInput.checked;
        });
        const aroundNote = nativeHtml.querySelector('.blacksmith-pin-config-text-around-note');
        const arcLayouts = ['arc-above', 'arc-below'];
        const applyTextLayoutState = () => {
            if (!textLayoutInput) return;
            const layout = textLayoutInput.value;
            const isArc = arcLayouts.includes(layout);
            if (textSizeInput) textSizeInput.disabled = isArc;
            if (textScaleInput) textScaleInput.disabled = isArc;
            if (aroundNote) aroundNote.style.display = isArc ? 'block' : 'none';
        };
        applyTextLayoutState();

        textLayoutInput?.addEventListener('change', () => {
            const layout = textLayoutInput.value;
            if (['under', 'over', 'above', 'right', 'left', 'arc-above', 'arc-below'].includes(layout)) {
                this.pinTextLayout = layout;
            }
            applyTextLayoutState();
        });
        textDisplayInput?.addEventListener('change', () => {
            const display = textDisplayInput.value;
            if (display === 'always' || display === 'hover' || display === 'never' || display === 'gm') {
                this.pinTextDisplay = display;
            }
        });
        textColorTextInput?.addEventListener('input', () => {
            const value = textColorTextInput.value.trim();
            if (value) {
                this.pinTextColor = value;
                if (textColorInput) {
                    textColorInput.value = value;
                }
            }
        });
        textColorInput?.addEventListener('input', () => {
            const value = textColorInput.value.trim();
            if (value) {
                this.pinTextColor = value;
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
            if (this.pinTextMaxLength === 0 && textMaxLengthInput) textMaxLengthInput.value = '';
        });
        textMaxWidthInput?.addEventListener('input', () => {
            this.pinTextMaxWidth = clampTextMaxWidth(textMaxWidthInput.value, this.pinTextMaxWidth);
            if (this.pinTextMaxWidth === 0 && textMaxWidthInput) textMaxWidthInput.value = '';
        });
        textScaleInput?.addEventListener('change', () => {
            this.pinTextScaleWithPin = !!textScaleInput.checked;
        });
        sourceToggle?.addEventListener('change', () => {
            updateMode(sourceToggle.checked ? 'icon' : 'image');
        });

        applyShapeState();
        applyIconModeState();

        nativeHtml.querySelector('.blacksmith-pin-config-browse')?.addEventListener('click', async () => {
            const picker = new FilePicker({
                type: 'image',
                callback: (path) => {
                    if (!imageInput) return;
                    imageInput.value = path;
                    this.selected = { type: 'img', value: path };
                    nativeHtml.querySelectorAll('.blacksmith-pin-config-icon-option').forEach(btn => btn.classList.remove('selected'));
                    updateMode('image');
                }
            });
            picker.browse();
        });

        nativeHtml.querySelector('button.cancel')?.addEventListener('click', () => this.close());

        nativeHtml.querySelector('.blacksmith-pin-config-save')?.addEventListener('click', async () => {
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
                    : { type: 'fa', value: 'fa-solid fa-location-dot' };
            }

            // Read text layout from DOM at save time so selection is never lost (e.g. if change didn't fire)
            const allowedLayouts = ['under', 'over', 'above', 'right', 'left', 'arc-above', 'arc-below'];
            const rawLayout = textLayoutInput?.value ?? this.pinTextLayout ?? 'under';
            const normalizedLayout = normalizeTextLayout(rawLayout);
            const savedTextLayout = (normalizedLayout && allowedLayouts.includes(normalizedLayout))
                ? normalizedLayout
                : 'under';

            // Prepare config data for callback
            const configData = {
                icon: finalSelection,
                pinSize: { w: this.pinSize.w, h: this.pinSize.h },
                pinShape: this.pinShape,
                pinStyle: (() => {
                    const style = { ...this.pinStyle };
                    if (strokeWidthInput) style.strokeWidth = clampStrokeWidth(strokeWidthInput.value, style.strokeWidth);
                    return style;
                })(),
                pinDropShadow: this.dropShadow,
                pinTextConfig: {
                    textLayout: savedTextLayout,
                    textDisplay: this.pinTextDisplay,
                    textColor: this.pinTextColor,
                    textSize: this.pinTextSize,
                    textMaxLength: this.pinTextMaxLength,
                    textMaxWidth: this.pinTextMaxWidth,
                    textScaleWithPin: this.pinTextScaleWithPin
                }
            };

            // Convert to pin API format — store FA as class string, image as URL only (no HTML)
            const pinUpdateData = {
                size: configData.pinSize,
                shape: configData.pinShape,
                style: {
                    fill: configData.pinStyle.fill,
                    stroke: configData.pinStyle.stroke,
                    strokeWidth: configData.pinStyle.strokeWidth,
                    alpha: configData.pinStyle.alpha ?? 1,
                    iconColor: configData.pinStyle.iconColor ?? '#ffffff'
                },
                dropShadow: configData.pinDropShadow,
                image: PinConfigWindow.iconToStoredImage(finalSelection),
                textLayout: configData.pinTextConfig.textLayout,
                textDisplay: configData.pinTextConfig.textDisplay,
                textColor: configData.pinTextConfig.textColor,
                textSize: configData.pinTextConfig.textSize,
                textMaxLength: configData.pinTextConfig.textMaxLength,
                textMaxWidth: configData.pinTextConfig.textMaxWidth,
                textScaleWithPin: configData.pinTextConfig.textScaleWithPin,
                imageFit: imageFitSelect ? imageFitSelect.value : this.pinImageFit,
                imageZoom: (imageFitSelect?.value === 'zoom' && imageZoomInput) ? Number(imageZoomInput.value) / 100 : this.pinImageZoom,
                allowDuplicatePins: !!allowDuplicateInput?.checked
            };

            // GM-only: include ownership default from Permissions section
            if (game.user?.isGM) {
                const ownershipSelect = nativeHtml.querySelector('.blacksmith-pin-config-ownership-default');
                if (ownershipSelect) {
                    const defaultLevel = Number(ownershipSelect.value);
                    if (Number.isInteger(defaultLevel)) {
                        pinUpdateData.ownership = {
                            ...this._pinOwnership,
                            default: defaultLevel
                        };
                    }
                }
            }

            // Event animations (hover, click, double-click, delete, add) with optional sound
            const hoverAnim = nativeHtml.querySelector('.blacksmith-pin-config-event-hover-animation')?.value ?? '';
            const clickAnim = nativeHtml.querySelector('.blacksmith-pin-config-event-click-animation')?.value ?? '';
            const doubleClickAnim = nativeHtml.querySelector('.blacksmith-pin-config-event-doubleclick-animation')?.value ?? '';
            const deleteAnim = nativeHtml.querySelector('.blacksmith-pin-config-event-delete-animation')?.value ?? '';
            const addAnim = nativeHtml.querySelector('.blacksmith-pin-config-event-add-animation')?.value ?? '';
            const hoverSound = (nativeHtml.querySelector('.blacksmith-pin-config-event-hover-sound')?.value ?? '').trim();
            const clickSound = (nativeHtml.querySelector('.blacksmith-pin-config-event-click-sound')?.value ?? '').trim();
            const doubleClickSound = (nativeHtml.querySelector('.blacksmith-pin-config-event-doubleclick-sound')?.value ?? '').trim();
            const deleteSound = (nativeHtml.querySelector('.blacksmith-pin-config-event-delete-sound')?.value ?? '').trim();
            const addSound = (nativeHtml.querySelector('.blacksmith-pin-config-event-add-sound')?.value ?? '').trim();
            pinUpdateData.eventAnimations = {
                hover: { animation: hoverAnim || null, sound: hoverSound || null },
                click: { animation: clickAnim || null, sound: clickSound || null },
                doubleClick: { animation: doubleClickAnim || null, sound: doubleClickSound || null },
                delete: { animation: deleteAnim || null, sound: deleteSound || null },
                add: { animation: addAnim || null, sound: addSound || null }
            };

            try {
                // Always update pin via API
                const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                if (!pinsAPI) {
                    throw new Error('Pins API not available');
                }

                await pinsAPI.update(this.pinId, pinUpdateData, { sceneId: this.sceneId });

                // If "Use as Default" checked, save to client-scope store (each player can have their own default)
                const makeDefault = !!defaultInput?.checked;
                if (makeDefault && this.moduleId) {
                    try {
                        const design = {
                            size: configData.pinSize,
                            lockProportions: this.lockProportions,
                            shape: configData.pinShape,
                            style: configData.pinStyle,
                            dropShadow: configData.pinDropShadow,
                            ...configData.pinTextConfig,
                            allowDuplicatePins: !!allowDuplicateInput?.checked,
                            eventAnimations: pinUpdateData.eventAnimations
                        };
                        const typeKey = this.pinType || 'default';
                        const compoundKey = `${this.moduleId}|${typeKey}`;
                        const cur = game.settings.get(MODULE.ID, 'clientPinDefaultDesigns') || {};
                        await game.settings.set(MODULE.ID, 'clientPinDefaultDesigns', { ...cur, [compoundKey]: design });
                    } catch (defaultErr) {
                        postConsoleAndNotification(MODULE.NAME, 'Use as Default not saved', defaultErr?.message || defaultErr, false, false);
                    }
                }

                // If callback provided, call it with configData (e.g. notes module may sync flags)
                if (this.onSelect) {
                    try {
                        const result = this.onSelect(configData);
                        if (result != null && typeof result.then === 'function') {
                            await result;
                        }
                    } catch (callbackErr) {
                        // Callback may try to write world settings (player lacks permission); don't fail the save
                        postConsoleAndNotification(MODULE.NAME, 'Pin config callback error', callbackErr?.message || callbackErr, false, false);
                    }
                }

                ui.notifications.info('Pin configuration updated.');
                this.close();
            } catch (err) {
                postConsoleAndNotification(MODULE.NAME, 'Error updating pin configuration', err?.message || err, false, true);
                ui.notifications.error(`Failed to update pin: ${err.message}`);
            }
        });

        updatePreview();
        updateMode(this.iconMode);
    }

    /**
     * Static method to open configuration window for a pin
     * @param {string} pinId - Pin ID to configure
     * @param {Object} [options] - Options
     * @param {string} [options.sceneId] - Scene ID (defaults to active scene)
     * @param {Function} [options.onSelect] - Callback when config is saved
     * @param {boolean} [options.useAsDefault] - Show "Use as Default" toggle
     * @param {string} [options.defaultSettingKey] - Module setting key for defaults
     * @param {string} [options.moduleId] - Calling module ID (for defaults)
     * @returns {Promise<PinConfigWindow>} - The opened window instance
     */
    static async open(pinId, options = {}) {
        const window = new PinConfigWindow(pinId, options);
        await window.render(true);
        return window;
    }
}
