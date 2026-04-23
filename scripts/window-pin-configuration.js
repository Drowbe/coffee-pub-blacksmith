// ==================================================================
// ===== WINDOW-PIN-CONFIGURATION – Pin Configuration Window ========
// ==================================================================
// Application V2 window for configuring pin properties.
// Ported from Squire's NoteIconPicker with Blacksmith integration.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { normalizeTextLayout, normalizePinTags } from './pins-schema.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';

/**
 * PinConfigWindow - Application V2 window for configuring pins
 * Supports both direct API updates and callback pattern for modules
 */
export class PinConfigWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-pin-config';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'blacksmith-pin-config',
            classes: ['blacksmith-window', 'blacksmith-pin-config-window'],
            position: { width: 700, height: 600 },
            window: { title: 'Configure Pin', resizable: true, minimizable: true }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-pin-config.hbs`
        }
    };

    // No ACTION_HANDLERS — all listeners attached directly in _attachLocalListeners
    static ACTION_HANDLERS = null;

    constructor(pinId, options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        let saved = {};
        try {
            if (game.settings?.get) {
                saved = game.settings.get(MODULE.ID, 'pinConfigWindowBounds') || {};
            }
        } catch { saved = {}; }
        const posBounds = {};
        if (typeof saved.width === 'number') posBounds.width = saved.width;
        if (typeof saved.height === 'number') posBounds.height = saved.height;
        if (typeof saved.top === 'number') posBounds.top = saved.top;
        if (typeof saved.left === 'number') posBounds.left = saved.left;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, PinConfigWindow.DEFAULT_OPTIONS.position ?? {}),
            posBounds
        );
        super(opts);
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
        this.pinTags = [];
        this._updateAllMode = false;
    }

    _buildPinUpdateData({ widthInput, heightInput, lockInput, shapeInput, strokeWidthInput,
        fillInput, strokeInput, iconColorInput, shadowInput, textLayoutInput, textDisplayInput,
        textColorInput, textSizeInput, textMaxLengthInput, textMaxWidthInput, textScaleInput,
        imageInput, imageFitSelect, imageZoomInput, allowDuplicateInput, nativeHtml }) {
        const clampDim = (v, fb) => { const p = Number(v); return Number.isFinite(p) ? Math.max(8, Math.round(p)) : fb; };
        const clampSW  = (v, fb) => { const p = Number(v); return Number.isFinite(p) ? Math.max(0, Math.round(p)) : fb; };
        const clampTS  = (v, fb) => { const p = Number(v); return Number.isFinite(p) ? Math.max(6, Math.round(p)) : fb; };
        const clampLen = (v)     => { if (v === '' || v == null) return 0; const p = Number(v); return Number.isFinite(p) ? Math.max(0, Math.round(p)) : 0; };

        const mode = this.iconMode === 'image' ? 'image' : 'icon';
        const finalSelection = mode === 'image'
            ? { type: 'img', value: (imageInput?.value?.trim() || '') }
            : (this.selected?.type === 'fa' ? this.selected : { type: 'fa', value: 'fa-solid fa-location-dot' });

        const allowedLayouts = ['under', 'over', 'above', 'right', 'left', 'arc-above', 'arc-below'];
        const rawLayout = textLayoutInput?.value ?? this.pinTextLayout ?? 'under';
        const savedTextLayout = (() => { const n = normalizeTextLayout(rawLayout); return (n && allowedLayouts.includes(n)) ? n : 'under'; })();

        const w = clampDim(widthInput?.value, this.pinSize.w);
        const h = lockInput?.checked ? w : clampDim(heightInput?.value, this.pinSize.h);

        return {
            size: { w, h },
            shape: this.pinShape,
            style: {
                fill: this.pinStyle.fill,
                stroke: this.pinStyle.stroke,
                strokeWidth: clampSW(strokeWidthInput?.value, this.pinStyle.strokeWidth),
                alpha: this.pinStyle.alpha ?? 1,
                iconColor: this.pinStyle.iconColor ?? '#ffffff'
            },
            dropShadow: this.dropShadow,
            image: PinConfigWindow.iconToStoredImage(finalSelection),
            textLayout: savedTextLayout,
            textDisplay: this.pinTextDisplay,
            textColor: this.pinTextColor,
            textSize: clampTS(textSizeInput?.value, this.pinTextSize),
            textMaxLength: clampLen(textMaxLengthInput?.value),
            textMaxWidth: clampLen(textMaxWidthInput?.value),
            textScaleWithPin: this.pinTextScaleWithPin,
            imageFit: imageFitSelect ? imageFitSelect.value : this.pinImageFit,
            imageZoom: (imageFitSelect?.value === 'zoom' && imageZoomInput) ? Number(imageZoomInput.value) / 100 : this.pinImageZoom,
            allowDuplicatePins: !!allowDuplicateInput?.checked,
            eventAnimations: {
                hover:       { animation: nativeHtml.querySelector('.blacksmith-pin-config-event-hover-animation')?.value || null,       sound: nativeHtml.querySelector('.blacksmith-pin-config-event-hover-sound')?.value?.trim() || null },
                click:       { animation: nativeHtml.querySelector('.blacksmith-pin-config-event-click-animation')?.value || null,       sound: nativeHtml.querySelector('.blacksmith-pin-config-event-click-sound')?.value?.trim() || null },
                doubleClick: { animation: nativeHtml.querySelector('.blacksmith-pin-config-event-doubleclick-animation')?.value || null, sound: nativeHtml.querySelector('.blacksmith-pin-config-event-doubleclick-sound')?.value?.trim() || null },
                delete:      { animation: nativeHtml.querySelector('.blacksmith-pin-config-event-delete-animation')?.value || null,      sound: nativeHtml.querySelector('.blacksmith-pin-config-event-delete-sound')?.value?.trim() || null },
                add:         { animation: nativeHtml.querySelector('.blacksmith-pin-config-event-add-animation')?.value || null,         sound: nativeHtml.querySelector('.blacksmith-pin-config-event-add-sound')?.value?.trim() || null }
            }
        };
    }

    async _applyCheckedSectionsToAll(fullUpdateData, nativeHtml) {
        if (!game.user?.isGM) return;

        // Collect which sections are checked
        const checked = new Set();
        nativeHtml.querySelectorAll('.blacksmith-pin-config-section-check:checked').forEach(cb => {
            checked.add(cb.dataset.section);
        });
        if (checked.size === 0) return;

        const { PinManager } = await import('./manager-pins.js');
        const pin = PinManager.get(this.pinId, this.sceneId !== undefined ? { sceneId: this.sceneId } : {});
        if (!pin) return;
        const sceneId = this.sceneId ?? canvas?.scene?.id;
        if (!sceneId) return;

        const allPins = PinManager.list({ sceneId, includeHiddenByFilter: true }) || [];
        const peers = allPins.filter(p =>
            p.id !== this.pinId &&
            p.moduleId === pin.moduleId &&
            (p.type || 'default') === (pin.type || 'default')
        );
        if (peers.length === 0) { ui.notifications?.info('No other matching pins to update.'); return; }

        // Build partial update from only the checked sections
        const partial = {};
        if (checked.has('design')) {
            partial.size = fullUpdateData.size;
            partial.lockProportions = fullUpdateData.lockProportions;
            partial.shape = fullUpdateData.shape;
            partial.style = fullUpdateData.style;
            partial.dropShadow = fullUpdateData.dropShadow;
        }
        if (checked.has('text')) {
            partial.textLayout = fullUpdateData.textLayout;
            partial.textDisplay = fullUpdateData.textDisplay;
            partial.textColor = fullUpdateData.textColor;
            partial.textSize = fullUpdateData.textSize;
            partial.textMaxLength = fullUpdateData.textMaxLength;
            partial.textMaxWidth = fullUpdateData.textMaxWidth;
            partial.textScaleWithPin = fullUpdateData.textScaleWithPin;
        }
        if (checked.has('animations')) {
            partial.eventAnimations = fullUpdateData.eventAnimations;
        }
        if (checked.has('source')) {
            partial.image = fullUpdateData.image;
            partial.imageFit = fullUpdateData.imageFit;
            partial.imageZoom = fullUpdateData.imageZoom;
        }
        if (checked.has('classification')) {
            partial.tags = fullUpdateData.tags;
        }
        if (checked.has('permissions')) {
            partial.ownership = fullUpdateData.ownership;
            if (fullUpdateData.config !== undefined) partial.config = fullUpdateData.config;
        }

        const sectionNames = [...checked].join(', ');
        const confirmed = await Dialog.confirm({
            title: 'Update All Matching Pins',
            content: `<p>Apply <strong>${sectionNames}</strong> to <strong>${peers.length}</strong> other matching pin${peers.length !== 1 ? 's' : ''} on this scene?</p>`
        });
        if (!confirmed) return;

        const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
        if (!pinsAPI) return;
        let count = 0;
        for (const p of peers) {
            try {
                await pinsAPI.update(p.id, partial, { sceneId });
                count++;
            } catch (err) {
                console.warn(`BLACKSMITH | PINS Failed to update pin ${p.id}:`, err);
            }
        }
        ui.notifications?.info(`Updated ${count} pin${count !== 1 ? 's' : ''}.`);
    }

    async close(options) {
        try {
            const pos = this.position ?? {};
            if (game.settings?.set) {
                await game.settings.set(MODULE.ID, 'pinConfigWindowBounds', {
                    top: pos.top,
                    left: pos.left,
                    width: pos.width,
                    height: pos.height
                });
            }
        } catch {
            // Non-fatal UI preference write.
        }
        return super.close(options);
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
        const STYLE_PREFIXES = new Set(['fa-solid', 'fa-regular', 'fa-light', 'fa-thin', 'fa-duotone', 'fa-sharp', 'fa-brands', 'fa-kit']);
        const name = iconClass.split(' ').find(cls => cls.startsWith('fa-') && !STYLE_PREFIXES.has(cls)) || iconClass;
        return name.replace(/^fa-/, '');
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
        // Derive lock state: check saved design first, fall back to dimension equality
        const _savedDesigns = game.settings.get(MODULE.ID, 'clientPinDefaultDesigns') || {};
        const _designKey = `${this.moduleId}|${this.pinType || 'default'}`;
        const _savedLock = _savedDesigns[_designKey]?.lockProportions;
        this.lockProportions = _savedLock !== undefined ? _savedLock : (this.pinSize.w === this.pinSize.h);
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
        this.pinTags = normalizePinTags(pin.tags);

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

        await PinManager.ensureBuiltinTaxonomyLoaded();
        const pinTypeLabel = PinManager.getPinTypeLabel(pin.moduleId, pin.type) || '';
        const taxonomyChoices = PinManager.getPinTaxonomyChoices(pin.moduleId, pin.type);

        this.pinType = pin.type || 'default';
        if (!this.moduleId) this.moduleId = pin.moduleId || null;

        return {
            isGM,
            pinTypeLabel,
            pinName: pin.text || '',
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
            pinTagsCsv: this.pinTags.join(', '),
            pinSuggestedTags: [...new Set([...(taxonomyChoices.tags || []), ...PinManager.getTagRegistry()])].sort(),
            pinClassificationHelp: taxonomyChoices.label || pinTypeLabel || (this.pinType || 'Pin'),
            pinImageFit: this.pinImageFit,
            pinImageZoom: this.pinImageZoom,
            pinImageZoomPercent,
            showImageZoomSlider: this.pinImageFit === 'zoom',
            animationOptions,
            deleteAnimationOptions,
            soundOptions,
            eventAnimations,
            updateAllMode: this._updateAllMode,
            pinVisibilityVisible: (pin.config?.blacksmithVisibility ?? 'visible') !== 'hidden',
            pinVisibilityHidden: pin.config?.blacksmithVisibility === 'hidden'
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachLocalListeners();
    }

    _attachLocalListeners() {
        const nativeHtml = this.element;
        const root = nativeHtml.querySelector('.blacksmith-pin-config') ?? nativeHtml;

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
        const tagsInput = nativeHtml.querySelector('.blacksmith-pin-config-tags');
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
            let height;

            if (lockInput?.checked) {
                // Constrain proportions = square: height always mirrors width
                height = width;
                heightInput.value = height;
            } else {
                height = clampDimension(heightInput.value, this.pinSize.h);
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
        widthInput?.addEventListener('change', () => syncPinSize('width'));
        heightInput?.addEventListener('input', () => syncPinSize('height'));
        heightInput?.addEventListener('change', () => syncPinSize('height'));
        lockInput?.addEventListener('change', () => {
            this.lockProportions = !!lockInput.checked;
            if (this.lockProportions) {
                // Snap height to width and disable the field
                syncPinSize('width');
                if (heightInput) heightInput.disabled = true;
            } else {
                if (heightInput) heightInput.disabled = false;
            }
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

        // Tag chips — click to toggle a suggested tag on/off in the input
        const getTagsArray = () => (tagsInput?.value || '').split(',').map(t => t.trim()).filter(Boolean);
        const updateTagChips = () => {
            const current = getTagsArray();
            nativeHtml.querySelectorAll('.blacksmith-tags[data-chip-type="tag"] .blacksmith-tag').forEach(chip => {
                chip.classList.toggle('active', current.includes(chip.dataset.value));
            });
        };
        nativeHtml.querySelectorAll('.blacksmith-tags[data-chip-type="tag"] .blacksmith-tag').forEach(chip => {
            chip.addEventListener('click', () => {
                const tags = getTagsArray();
                const idx = tags.indexOf(chip.dataset.value);
                if (idx >= 0) tags.splice(idx, 1);
                else tags.push(chip.dataset.value);
                if (tagsInput) tagsInput.value = tags.join(', ');
                updateTagChips();
            });
        });
        tagsInput?.addEventListener('input', updateTagChips);
        updateTagChips();

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

        nativeHtml.querySelector('.blacksmith-pin-config-update-all-toggle')?.addEventListener('change', (e) => {
            this._updateAllMode = !!e.target.checked;
            this.render(true);
        });

        nativeHtml.querySelector('.blacksmith-pin-config-save')?.addEventListener('click', async () => {
            if (this.iconMode === 'image' && !(imageInput?.value?.trim())) {
                ui.notifications?.warn('Select an image for the pin.');
                return;
            }

            const pinUpdateData = this._buildPinUpdateData({ widthInput, heightInput, lockInput, shapeInput,
                strokeWidthInput, fillInput, strokeInput, iconColorInput, shadowInput, textLayoutInput,
                textDisplayInput, textColorInput, textSizeInput, textMaxLengthInput, textMaxWidthInput,
                textScaleInput, imageInput, imageFitSelect, imageZoomInput, allowDuplicateInput, nativeHtml });

            // GM-only: tags and ownership are per-pin, not part of bulk update
            if (game.user?.isGM) {
                pinUpdateData.tags = normalizePinTags(tagsInput?.value ?? this.pinTags ?? []);
                const ownershipSelect = nativeHtml.querySelector('.blacksmith-pin-config-ownership-default');
                if (ownershipSelect) {
                    const defaultLevel = Number(ownershipSelect.value);
                    if (Number.isInteger(defaultLevel)) {
                        pinUpdateData.ownership = { ...this._pinOwnership, default: defaultLevel };
                    }
                }
                const visSelect = nativeHtml.querySelector('.blacksmith-pin-config-player-visibility');
                if (visSelect) {
                    const { PinManager: PM } = await import('./manager-pins.js');
                    const currentPin = PM.get(this.pinId, this.sceneId !== undefined ? { sceneId: this.sceneId } : {});
                    pinUpdateData.config = {
                        ...(currentPin?.config && typeof currentPin.config === 'object' ? currentPin.config : {}),
                        blacksmithVisibility: visSelect.value === 'hidden' ? 'hidden' : 'visible'
                    };
                }
            }

            // For callback compat
            const configData = {
                icon: this.selected,
                pinSize: pinUpdateData.size,
                pinShape: pinUpdateData.shape,
                pinStyle: pinUpdateData.style,
                pinDropShadow: pinUpdateData.dropShadow,
                pinTextConfig: {
                    textLayout: pinUpdateData.textLayout,
                    textDisplay: pinUpdateData.textDisplay,
                    textColor: pinUpdateData.textColor,
                    textSize: pinUpdateData.textSize,
                    textMaxLength: pinUpdateData.textMaxLength,
                    textMaxWidth: pinUpdateData.textMaxWidth,
                    textScaleWithPin: pinUpdateData.textScaleWithPin
                }
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
                            image: pinUpdateData.image,
                            imageFit: pinUpdateData.imageFit,
                            imageZoom: pinUpdateData.imageZoom,
                            size: configData.pinSize,
                            lockProportions: this.lockProportions,
                            shape: configData.pinShape,
                            style: configData.pinStyle,
                            dropShadow: configData.pinDropShadow,
                            ...configData.pinTextConfig,
                            allowDuplicatePins: !!allowDuplicateInput?.checked,
                            eventAnimations: pinUpdateData.eventAnimations,
                            ...(pinUpdateData.ownership ? { ownership: foundry.utils.deepClone(pinUpdateData.ownership) } : {}),
                            ...(pinUpdateData.config ? { config: foundry.utils.deepClone(pinUpdateData.config) } : {})
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

                // If Update All mode is on, apply checked sections to matching pins
                if (this._updateAllMode) {
                    await this._applyCheckedSectionsToAll(pinUpdateData, nativeHtml);
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
