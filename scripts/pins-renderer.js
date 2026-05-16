// ==================================================================
// ===== PINS-RENDERER – Visual rendering of pins on canvas ========
// ==================================================================
// Pure DOM approach: All pins rendered as HTML divs (circle + icon)
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { UIContextMenu } from './ui-context-menu.js';
import {
    PIN_ACCESS_ICONS,
    PIN_ACCESS_SUBMENU_ICON,
    PIN_VISIBILITY_ICONS,
    pinIconTag
} from './pin-permission-icons.js';

/** @typedef {import('./manager-pins.js').PinData} PinData */

/** Border + GM-indicator stroke color; blank / missing uses white */
function _resolvePinStrokeColor(style) {
    const raw = style?.stroke;
    if (raw == null) return '#ffffff';
    const s = String(raw).trim();
    return s === '' ? '#ffffff' : s;
}

function _getPinBaseAlpha(pinData) {
    return typeof pinData?.style?.alpha === 'number' ? pinData.style.alpha : 1;
}

function _isPinHiddenFromPlayersByVisibility(pinData) {
    const raw = String(pinData?.config?.blacksmithVisibility || '').trim().toLowerCase();
    return raw === 'hidden';
}

function _getPinVisibilityMode(pinData) {
    const raw = String(pinData?.config?.blacksmithVisibility || '').trim().toLowerCase();
    return (raw === 'hidden' || raw === 'owner') ? raw : 'visible';
}

function _getPinAccessMode(pinData) {
    const raw = String(pinData?.config?.blacksmithAccess || '').trim().toLowerCase();
    return (raw === 'pin' || raw === 'full') ? raw : 'read';
}

/** Access preset "None: GM Only" — ownership default NONE (matches Configure Pin). */
function _isPinGmOnlyAccess(pinData) {
    const NONE = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE : 0;
    const rawDefault = pinData?.ownership?.default;
    if (typeof rawDefault !== 'number') return false;
    return rawDefault <= NONE;
}

function _getPinDisplayOpacity(pinData) {
    const baseAlpha = _getPinBaseAlpha(pinData);
    // Dim = "Not visible" to players; GM-only pins use the dot instead (full opacity for GM).
    if (game.user?.isGM && _isPinHiddenFromPlayersByVisibility(pinData) && !_isPinGmOnlyAccess(pinData)) {
        return Math.max(0, Math.min(1, baseAlpha * 0.5));
    }
    return baseAlpha;
}

/**
 * PinDOMElement - Manages complete pin DOM elements (circle + icon)
 * Pure DOM approach: Single div contains both circle (CSS) and icon (Font Awesome or image)
 */
class PinDOMElement {
    static _pins = new Map(); // pinId -> HTMLElement
    static _container = null; // Container div for all pins
    static _updateThrottle = null;
    static _isInitialized = false;
    static _hookIds = []; // Store hook IDs for cleanup
    static _resizeListener = null; // Store resize listener for cleanup
    static _reusablePoint = null; // Reusable PIXI.Point to avoid allocations (for coordinate conversion)
    static _reusableDragPoint = null; // Reusable PIXI.Point for drag operations

    /**
     * Initialize the DOM pin system and hooks
     */
    static initialize() {
        if (this._isInitialized) return;
        
        // Create container div for all pins (styles in pins.css)
        const container = document.createElement('div');
        container.id = 'blacksmith-pins-overlay';
        container.className = 'blacksmith-pins-overlay';
        
        // Find the canvas app element and insert after it (or at end of body)
        const canvasApp = document.getElementById('board') || document.querySelector('#board');
        if (canvasApp && canvasApp.parentElement) {
            // Insert after canvas app
            canvasApp.parentElement.insertBefore(container, canvasApp.nextSibling);
        } else {
            // Fallback: append to body
            document.body.appendChild(container);
        }
        this._container = container;

        // Hook into canvas pan to update positions (store hook IDs for cleanup)
        this._hookIds.push(
            Hooks.on('canvasPan', () => {
                this._scheduleUpdate();
            })
        );
        
        this._hookIds.push(
            Hooks.on('updateScene', () => {
                // When scene changes, load pins for the new scene
                this._scheduleSceneLoad();
            })
        );
        
        this._hookIds.push(
            Hooks.on('canvasReady', () => {
                // When canvas becomes ready, load pins for current scene and update positions
                this._scheduleSceneLoad();
            })
        );
        
        // Update on window resize (store listener for cleanup)
        this._resizeListener = () => this._scheduleUpdate();
        window.addEventListener('resize', this._resizeListener);
        
        // Initialize reusable PIXI.Point for coordinate conversion
        this._reusablePoint = new PIXI.Point(0, 0);
        this._reusableDragPoint = new PIXI.Point(0, 0);
        
        this._isInitialized = true;
    }

    /**
     * Convert scene coordinates to screen pixels
     * @param {number} sceneX
     * @param {number} sceneY
     * @returns {{x: number, y: number}}
     */
    static _sceneToScreen(sceneX, sceneY) {
        if (!canvas?.ready || !canvas?.stage) {
            return { x: 0, y: 0 };
        }

        try {
            // Get canvas element - Foundry uses canvas.app.renderer.view or canvas.app.canvas
            const canvasElement = canvas.app?.renderer?.view || canvas.app?.canvas || canvas.canvas;
            if (!canvasElement) {
                return { x: 0, y: 0 };
            }
            
            const canvasRect = canvasElement.getBoundingClientRect();
            const stage = canvas.stage;
            
            // Reuse PIXI.Point to avoid allocations (performance optimization)
            if (!this._reusablePoint) {
                this._reusablePoint = new PIXI.Point(0, 0);
            }
            this._reusablePoint.set(sceneX, sceneY);
            const globalPoint = stage.toGlobal(this._reusablePoint);
            
            // globalPoint is in screen coordinates relative to the stage container
            // Add the canvas element's position to get absolute screen coordinates
            const screenX = globalPoint.x + canvasRect.left;
            const screenY = globalPoint.y + canvasRect.top;
            
            return { x: screenX, y: screenY };
        } catch (err) {
            // Canvas not fully initialized, return default position
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error converting scene to screen', err?.message || String(err), false, false);
            return { x: 0, y: 0 };
        }
    }


    /**
     * Schedule a throttled update of all pin positions
     */
    static _scheduleUpdate() {
        if (this._updateThrottle) return;
        
        this._updateThrottle = requestAnimationFrame(() => {
            this.updateAllPositions();
            this._updateThrottle = null;
        });
    }

    /**
     * Schedule loading pins for the current scene
     * Note: PinRenderer is defined later in this file, so we reference it directly
     * @private
     */
    static _scheduleSceneLoad() {
        // Use a small delay to ensure scene is fully activated
        setTimeout(async () => {
            if (!canvas?.scene) return;
            
            try {
                const { PinManager } = await import('./manager-pins.js');
                const pins = PinManager.list({ sceneId: canvas.scene.id });
                
                // PinRenderer is in the same file, reference it directly
                if (pins.length > 0) {
                    await PinRenderer.loadScenePins(canvas.scene.id, pins);
                } else {
                    // No pins, but clear any existing ones
                    PinRenderer.clear();
                }
            } catch (err) {
                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error loading scene pins on scene change', err?.message || String(err), false, false);
            }
        }, 200);
    }

    /**
     * Calculate pin position and size - unified function used for both creation and updates
     * @param {HTMLElement} pinElement - The pin DOM element
     * @param {PinData} pinData - Pin data
     * @returns {{ left: number, top: number, width: number, height: number, iconSizeScreen: number, screen: {x: number, y: number} }}
     * @private
     */
    static _calculatePinPosition(pinElement, pinData) {
        // UNIFIED CALCULATION - Used by create, pan, zoom, and drag
        // Convert scene coordinates to screen coordinates
        const screen = this._sceneToScreen(pinData.x, pinData.y);
        const scale = canvas.stage.scale.x;
        
        // Pin size in scene units, converted to screen pixels
        const pinWScene = pinData.size.w;
        const pinHScene = pinData.size.h;
        const pinWScreen = pinWScene * scale;
        const pinHScreen = pinHScene * scale;

        // Icon size is based on the smaller dimension so it fits within non-square pins
        const ratioStr = typeof document !== 'undefined'
            ? getComputedStyle(document.documentElement).getPropertyValue('--blacksmith-pin-icon-size-ratio').trim()
            : '';
        const iconRatio = (parseFloat(ratioStr) || 0.6);
        const iconSizeScreen = Math.min(pinWScreen, pinHScreen) * iconRatio;

        // Center pin on screen coordinates
        const left = Math.round(screen.x - pinWScreen / 2);
        const top = Math.round(screen.y - pinHScreen / 2);

        return { left, top, width: pinWScreen, height: pinHScreen, iconSizeScreen, screen, scale };
    }

    /** GM corner glyph for **access** (GM-only preset); not driven by visibility. Color from `--pin-stroke-color` (#fff if stroke unset). */
    static _ensureGmIndicator(pinElement) {
        let el = pinElement.querySelector('.blacksmith-pin-gm-indicator');
        if (!el) {
            el = document.createElement('span');
            el.className = 'blacksmith-pin-gm-indicator';
            el.setAttribute('aria-hidden', 'true');
            const i = document.createElement('i');
            el.appendChild(i);
            pinElement.appendChild(el);
            el.hidden = true;
        }
        return el;
    }

    /**
     * Create or update a pin DOM element
     * @param {string} pinId
     * @param {PinData} pinData
     */
    static createOrUpdatePin(pinId, pinData) {
        if (!this._isInitialized) this.initialize();
        
        let pinElement = this._pins.get(pinId);
        const { image, iconText, size, style = {} } = pinData;
        
        // Create new pin element if doesn't exist (base styles in pins.css)
        if (!pinElement) {
            pinElement = document.createElement('div');
            pinElement.className = 'blacksmith-pin';
            pinElement.dataset.pinId = pinId;
            // Start with correct opacity (will be positioned immediately)
            pinElement.style.opacity = String(_getPinDisplayOpacity(pinData));
            
            // Set up event listeners
            this._setupEventListeners(pinElement, pinData);
            
            this._container.appendChild(pinElement);
            this._pins.set(pinId, pinElement);
        } else {
            // Existing pin - keep visible, will update position smoothly
        }

        // Update pin shape
        const shape = pinData.shape || 'circle';
        pinElement.dataset.shape = shape;
        if (pinData.moduleId) {
            pinElement.dataset.moduleId = pinData.moduleId;
        } else {
            delete pinElement.dataset.moduleId;
        }
        
        // Update text layout for CSS
        const textLayout = pinData.textLayout || 'under';
        pinElement.dataset.textLayout = textLayout;
        
        // Update pin styling (background and border)
        // Support hex colors (#000000), RGBA (rgba(0, 0, 0, 0.5)), rgb, hsl, named colors, etc.
        // CSS natively accepts all these formats
        const fillColor = style?.fill || '#000000';
        const strokeColor = _resolvePinStrokeColor(style);
        const strokeWidth = typeof style?.strokeWidth === 'number' ? style.strokeWidth : 2;
        const alpha = typeof style?.alpha === 'number' ? style.alpha : 1;
        
        // Apply colors - CSS supports: hex, rgb, rgba, hsl, hsla, named colors
        // For 'none' shape, don't apply background or border (icon only)
        if (shape !== 'none') {
            pinElement.style.backgroundColor = fillColor;
            pinElement.style.border = `${strokeWidth}px solid ${strokeColor}`;
            pinElement.style.setProperty('--pin-stroke-color', strokeColor);
        } else {
            pinElement.style.backgroundColor = 'transparent';
            pinElement.style.border = 'none';
            pinElement.style.setProperty('--pin-stroke-color', strokeColor);
        }
        
        // Add drop shadow via data attribute (default: true, controlled by CSS)
        if (pinData.dropShadow === false) {
            pinElement.dataset.noShadow = 'true';
        } else {
            delete pinElement.dataset.noShadow;
        }
        
        // Apply opacity - if color already has alpha (RGBA/HSLA), this multiplies with it
        // Example: rgba(255, 0, 0, 0.5) + opacity: 0.9 = final alpha of 0.45
        // To use RGBA alpha only, set style.alpha to 1.0
        pinElement.style.opacity = String(_getPinDisplayOpacity(pinData));
        
        // Update icon content (base styles in pins.css)
        // Get existing icon element and check current type
        let iconElement = pinElement.querySelector('.blacksmith-pin-icon');
        const currentIconType = iconElement?.dataset.iconType; // 'fa', 'image', or undefined
        
        // Determine new icon type (iconText takes precedence over image)
        const isFontAwesome = this._isFontAwesomeIcon(image);
        const newIconType = iconText && String(iconText).trim()
            ? 'text'
            : image
                ? (isFontAwesome ? 'fa' : 'image')
                : 'none';
        
        // If icon type changed, rebuild the icon element to avoid stale state
        const iconTypeChanged = currentIconType && currentIconType !== newIconType;
        if (iconTypeChanged && iconElement) {
            // Remove old icon element completely
            iconElement.remove();
            iconElement = null;
        }
        
        // Create new icon element if needed
        if (!iconElement) {
            iconElement = document.createElement('div');
            iconElement.className = 'blacksmith-pin-icon';
            pinElement.appendChild(iconElement);
        }
        
        // Store the new icon type for future comparisons
        if (newIconType !== 'none') {
            iconElement.dataset.iconType = newIconType;
        } else {
            delete iconElement.dataset.iconType;
        }
        
        // Clear all icon-related styles first to ensure clean state
        iconElement.style.color = '';
        iconElement.style.background = '';
        iconElement.style.backgroundImage = '';
        iconElement.style.border = '';
        iconElement.style.borderRadius = '';
        iconElement.style.overflow = '';
        iconElement.style.width = '';
        iconElement.style.height = '';
        iconElement.style.fontSize = '';
        iconElement.innerHTML = '';
        delete iconElement.dataset.imageFit;
        
        // Apply new icon/image/text based on type
        if (newIconType === 'text' && iconText) {
            // Text as pin center content - styled like FA icon (centered, iconColor)
            const textContent = String(iconText).trim();
            iconElement.textContent = textContent;
            const iconColor = pinData.style?.iconColor || '#ffffff';
            iconElement.style.color = iconColor;
            iconElement.style.background = 'none';
            iconElement.style.backgroundImage = 'none';
        } else if (isFontAwesome && image) {
            // Font Awesome icon
            const faClasses = this._extractFontAwesomeClasses(image);
            if (faClasses) {
                iconElement.innerHTML = `<i class="${faClasses}"></i>`;
                const iconColor = pinData.style?.iconColor || '#ffffff';
                iconElement.style.color = iconColor;
                const innerI = iconElement.querySelector('i');
                if (innerI) innerI.style.color = iconColor; // Override CSS .blacksmith-pin-icon[data-icon-type="fa"] i { color }
                iconElement.style.background = 'none';
                iconElement.style.border = 'none';
                iconElement.style.backgroundImage = 'none';
                iconElement.style.width = 'auto';
                iconElement.style.height = 'auto';
            } else {
                // Invalid Font Awesome format, treat as no icon
                iconElement.innerHTML = '';
                iconElement.style.backgroundImage = 'none';
            }
        } else if (image) {
            // Image URL or <img> tag - extract the URL
            const imageUrl = this._extractImageUrl(image);
            if (imageUrl) {
                iconElement.innerHTML = '';
                iconElement.style.backgroundImage = `url(${imageUrl})`;
                const imageFit = pinData.imageFit && ['fill', 'contain', 'cover', 'none', 'scale-down', 'zoom'].includes(pinData.imageFit)
                    ? pinData.imageFit
                    : 'cover';
                iconElement.dataset.imageFit = imageFit;
                if (imageFit === 'zoom') {
                    const zoom = typeof pinData.imageZoom === 'number' && Number.isFinite(pinData.imageZoom)
                        ? Math.max(1, Math.min(2, pinData.imageZoom))
                        : 1;
                    iconElement.style.setProperty('--image-zoom', String(zoom));
                } else {
                    iconElement.style.removeProperty('--image-zoom');
                }
                iconElement.style.color = '';
                iconElement.style.borderRadius = '';
                iconElement.style.overflow = '';
            } else {
                // Couldn't extract image URL, treat as no icon
                iconElement.innerHTML = '';
                iconElement.style.backgroundImage = 'none';
                iconElement.style.color = '';
            }
        } else {
            // No icon
            iconElement.innerHTML = '';
            iconElement.style.backgroundImage = 'none';
            iconElement.style.color = '';
        }
        
        // Update text content and display
        this._updatePinText(pinElement, pinData);
        this._ensureGmIndicator(pinElement);

        // Always try to update position immediately using unified calculation
        if (canvas?.stage && canvas?.app) {
            this.updatePosition(pinId, pinData);
        } else {
            // Canvas not ready yet - schedule position update with multiple retries
            const tryUpdate = () => {
                if (canvas?.stage && canvas?.app) {
                    this.updatePosition(pinId, pinData);
                } else {
                    const retryCount = (window[`_pin_retry_${pinId}`] || 0) + 1;
                    window[`_pin_retry_${pinId}`] = retryCount;
                    if (retryCount < 10) {
                        setTimeout(tryUpdate, 100);
                    } else {
                        console.warn(`BLACKSMITH | PINS Failed to update position for ${pinId} after 10 retries`);
                    }
                }
            };
            
            requestAnimationFrame(tryUpdate);
            
            Hooks.once('canvasReady', () => {
                setTimeout(() => {
                    this.updatePosition(pinId, pinData);
                }, 100);
            });
        }
    }

    /**
     * Update pin position for a specific pin
     * Uses unified _calculatePinPosition for consistent alignment
     * @param {string} pinId
     * @param {PinData} pinData
     */
    static updatePosition(pinId, pinData) {
        const pinElement = this._pins.get(pinId);
        if (!pinElement || !pinData) {
            console.warn(`BLACKSMITH | PINS updatePosition: Missing pin element or pinData for ${pinId}`);
            return;
        }

        if (!canvas?.stage || !canvas?.app) {
            return;
        }

        try {
            // Use unified calculation function
            const { left, top, width, height, iconSizeScreen, screen, scale } = this._calculatePinPosition(pinElement, pinData);
            const shape = pinData.shape || 'circle';
            const baseStrokeWidth = typeof pinData.style?.strokeWidth === 'number' ? pinData.style.strokeWidth : 2;
            const scaledStrokeWidth = baseStrokeWidth * scale;
            const strokeColor = _resolvePinStrokeColor(pinData.style || {});
            
            // Check if screen coordinates are valid
            if (screen.x === 0 && screen.y === 0 && (pinData.x !== 0 || pinData.y !== 0)) {
                console.warn(`BLACKSMITH | PINS updatePosition: Invalid screen coordinates for ${pinId}`);
            }
            
            // Set position and size (--pin-size-px scales GM indicator; stroke color set in createOrUpdatePin)
            pinElement.style.left = `${left}px`;
            pinElement.style.top = `${top}px`;
            pinElement.style.width = `${width}px`;
            pinElement.style.height = `${height}px`;
            pinElement.style.setProperty('--pin-size-px', `${width}px`);
            pinElement.style.setProperty('--pin-stroke-color', strokeColor);
            pinElement.style.setProperty(
                '--pin-stroke-px',
                shape === 'none' ? '0px' : `${Math.max(0, scaledStrokeWidth)}px`
            );

            // Update icon size
            const iconElement = pinElement.querySelector('.blacksmith-pin-icon');
            if (iconElement) {
                const iconType = iconElement.dataset.iconType;
                const isText = iconType === 'text';
                const isFontAwesome = this._isFontAwesomeIcon(pinData.image);
                if (isText && pinData.iconText) {
                    // Text - same sizing as FA icon (scale with pin)
                    iconElement.style.fontSize = `${iconSizeScreen}px`;
                    iconElement.style.width = 'auto';
                    iconElement.style.height = 'auto';
                    iconElement.style.borderRadius = '';
                    iconElement.style.overflow = '';
                } else if (isFontAwesome && pinData.image) {
                    // Font Awesome icon - use fontSize (size controlled dynamically)
                    iconElement.style.fontSize = `${iconSizeScreen}px`;
                    iconElement.style.width = 'auto';
                    iconElement.style.height = 'auto';
                    iconElement.style.borderRadius = ''; // No border radius for Font Awesome
                    iconElement.style.overflow = ''; // No overflow clipping for Font Awesome
                } else if (pinData.image) {
                    // Image URL - fills 100% of pin container, clipped by pin's border-radius
                    // CSS handles width/height (100%) and background-size: cover
                    iconElement.style.fontSize = '';
                    // Prevent clipping artifacts: image radius should match inner border radius.
                    if (shape === 'circle') {
                        iconElement.style.borderRadius = '50%';
                    } else if (shape === 'square') {
                        const squareRadiusPercentRaw = typeof document !== 'undefined'
                            ? getComputedStyle(document.documentElement).getPropertyValue('--blacksmith-pin-square-border-radius').trim()
                            : '';
                        const squareRadiusPercent = Number.parseFloat(squareRadiusPercentRaw);
                        const pct = Number.isFinite(squareRadiusPercent) ? squareRadiusPercent / 100 : 0.15;
                        const outerRadiusPx = Math.min(width, height) * pct;
                        const innerRadiusPx = Math.max(0, outerRadiusPx - scaledStrokeWidth);
                        iconElement.style.borderRadius = `${innerRadiusPx}px`;
                    } else {
                        iconElement.style.borderRadius = '0';
                    }
                    iconElement.style.overflow = 'hidden';
                }
            }
            
            // Update border width to scale with zoom
            if (shape !== 'none') {
                pinElement.style.border = `${scaledStrokeWidth}px solid ${strokeColor}`;
            }
            
            // Update text size based on scale setting
            const textElement = pinElement.querySelector('.blacksmith-pin-text');
            if (textElement) {
                const textLayout = pinData.textLayout || 'under';
                const baseTextSize = parseFloat(textElement.dataset.baseTextSize) || pinData.textSize || 12;
                
                // Arc layouts (arc-above, arc-below) always scale with pin
                const arcLayouts = ['arc-above', 'arc-below'];
                if (arcLayouts.includes(textLayout) || textLayout === 'around') {
                    const ratioStr = typeof document !== 'undefined'
                        ? getComputedStyle(document.documentElement).getPropertyValue('--blacksmith-pin-around-text-size-ratio').trim()
                        : '';
                    const ratio = parseFloat(ratioStr) || 0.28;
                    const pinSizeScreen = Math.min(width, height);
                    const scaledTextSize = pinSizeScreen * ratio;
                    textElement.style.fontSize = `${scaledTextSize}px`;
                    textElement.dataset.baseTextSize = String(scaledTextSize);
                    
                    // Recalculate character positions on every position update
                    // This ensures text stays centered when pin moves or canvas scrolls
                    const originalText = textElement.dataset.originalText || pinData.text || '';
                    if (originalText) {
                        const position = (textLayout === 'arc-above') ? 'above' : 'below';
                        this._createCurvedText(textElement, originalText, pinData, pinElement, { position });
                    }
                } else {
                    // For "under" and "over" layouts, respect scale setting
                    const textScaleWithPin = textElement.dataset.textScaleWithPin !== 'false'; // Default to true
                    
                    if (textScaleWithPin) {
                        // Scale text with zoom
                        const scaledTextSize = baseTextSize * scale;
                        textElement.style.fontSize = `${scaledTextSize}px`;
                    } else {
                        // Fixed size - use base size
                        textElement.style.fontSize = `${baseTextSize}px`;
                    }
                }
            }
            
            // Keep opacity synced with visibility state + style alpha.
            pinElement.style.opacity = String(_getPinDisplayOpacity(pinData));
        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Error updating pin position for ${pinId}`, err?.message || String(err), false, false);
        }
    }

    /**
     * Update all pin positions (called on pan/zoom)
     */
    static updateAllPositions() {
        if (!this._isInitialized) {
            console.warn('BLACKSMITH | PINS updateAllPositions: Not initialized');
            return;
        }
        
        if (!canvas?.stage || !canvas?.app) {
            setTimeout(() => {
                if (canvas?.stage && canvas?.app) {
                    this.updateAllPositions();
                }
            }, 100);
            return;
        }

        import('./manager-pins.js').then(({ PinManager }) => {
            let updated = 0;
            for (const [pinId, pinElement] of this._pins.entries()) {
                const pinData = PinManager.get(pinId);
                if (pinData) {
                    this.updatePosition(pinId, pinData);
                    updated++;
                } else {
                    console.warn(`BLACKSMITH | PINS updateAllPositions: No pin data for ${pinId}`);
                }
            }
        }).catch(err => {
            console.error('BLACKSMITH | PINS Error updating pin positions', err?.message || String(err));
        });
    }

    /**
     * Set up event listeners for a pin element
     * @param {HTMLElement} pinElement
     * @param {PinData} pinData
     * @private
     */
    static _setupEventListeners(pinElement, pinData) {
        const pinId = pinData.id; // Store pinId for fetching fresh data
        
        // Hover events (transform handled by CSS :hover)
        pinElement.addEventListener('mouseenter', async (e) => {
            const { PinManager } = await import('./manager-pins.js');
            const freshPinData = PinManager.get(pinId) || pinData;
            const modifiers = this._extractModifiers(e);
            const sceneId = canvas?.scene?.id || '';
            const userId = game.user?.id || '';
            
            // Show text on hover if display mode is 'hover'
            if (freshPinData.textDisplay === 'hover' && freshPinData.text) {
                const textElement = pinElement.querySelector('.blacksmith-pin-text');
                if (textElement) {
                    textElement.style.display = 'block';
                }
            }
            
            PinManager._invokeHandlers('hoverIn', freshPinData, sceneId, userId, modifiers, e);
            if (freshPinData.eventAnimations?.hover?.animation) {
                PinRenderer.ping(freshPinData.id, { animation: freshPinData.eventAnimations.hover.animation, sound: freshPinData.eventAnimations.hover.sound ?? null, loops: 1 });
            }
        });
        
        pinElement.addEventListener('mouseleave', async (e) => {
            const { PinManager } = await import('./manager-pins.js');
            const freshPinData = PinManager.get(pinId) || pinData;
            const modifiers = this._extractModifiers(e);
            const sceneId = canvas?.scene?.id || '';
            const userId = game.user?.id || '';
            
            // Hide text on hover leave if display mode is 'hover'
            if (freshPinData.textDisplay === 'hover') {
                const textElement = pinElement.querySelector('.blacksmith-pin-text');
                if (textElement) {
                    textElement.style.display = 'none';
                }
            }
            
            PinManager._invokeHandlers('hoverOut', freshPinData, sceneId, userId, modifiers, e);
        });
        
        // Click events and double-click detection
        let clickTimeout = null;
        let clickCount = 0;
        const clickState = { timeout: null, count: 0 };
        
        pinElement.addEventListener('mousedown', async (e) => {
            const button = e.button;
            const modifiers = this._extractModifiers(e);
            const sceneId = canvas?.scene?.id || '';
            const userId = game.user?.id || '';
            
            // Get fresh pin data - pinData in closure may be stale after previous drag
            const { PinManager } = await import('./manager-pins.js');
            const freshPinData = PinManager.get(pinData.id) || pinData;
            const canEdit = PinManager._canEdit(freshPinData, userId);
            const accessMode = _getPinAccessMode(freshPinData);
            if (accessMode === 'pin' && !canEdit) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            
            if (button === 0) {
                // Left click - set up drag detection IMMEDIATELY
                // We can't wait 300ms or the click will be missed
                
                const currentPinData = PinManager.get(pinData.id) || freshPinData;
                
                if (PinManager._canEdit(currentPinData, userId)) {
                    // Start potential drag immediately - it will decide if it's click or drag
                    await this._startPotentialDrag(pinElement, currentPinData, e, clickState);
                } else {
                    // Not editable - handle click/double-click
                    clickState.count++;
                    if (clickState.timeout) {
                        clearTimeout(clickState.timeout);
                    }
                    
                    clickState.timeout = setTimeout(() => {
                        if (clickState.count === 1) {
                            PinManager._invokeHandlers('click', currentPinData, sceneId, userId, modifiers, e);
                            if (currentPinData.eventAnimations?.click?.animation) {
                                PinRenderer.ping(currentPinData.id, { animation: currentPinData.eventAnimations.click.animation, sound: currentPinData.eventAnimations.click.sound ?? null, loops: 1 });
                            }
                        }
                        clickState.count = 0;
                        clickState.timeout = null;
                    }, 300);
                    
                    // Double-click detection
                    if (clickState.count === 2) {
                        clearTimeout(clickState.timeout);
                        clickState.count = 0;
                        clickState.timeout = null;
                        PinManager._invokeHandlers('doubleClick', currentPinData, sceneId, userId, modifiers, e);
                        if (currentPinData.eventAnimations?.doubleClick?.animation) {
                            PinRenderer.ping(currentPinData.id, { animation: currentPinData.eventAnimations.doubleClick.animation, sound: currentPinData.eventAnimations.doubleClick.sound ?? null, loops: 1 });
                        }
                    }
                }
            } else if (button === 2) {
                // Right click
                e.preventDefault();
                // Clear any pending click timeout
                if (clickState.timeout) {
                    clearTimeout(clickState.timeout);
                    clickState.count = 0;
                    clickState.timeout = null;
                }
                PinManager._invokeHandlers('rightClick', freshPinData, sceneId, userId, modifiers, e);
                this._showContextMenu(pinElement, freshPinData, e);
            } else if (button === 1) {
                // Middle click
                // Clear any pending click timeout
                if (clickState.timeout) {
                    clearTimeout(clickState.timeout);
                    clickState.count = 0;
                    clickState.timeout = null;
                }
                PinManager._invokeHandlers('middleClick', freshPinData, sceneId, userId, modifiers, e);
            }
        });
    }

    /**
     * Extract modifier keys from DOM event
     * @param {MouseEvent} event
     * @returns {Object}
     * @private
     */
    static _extractModifiers(event) {
        return {
            ctrl: event.ctrlKey || false,
            alt: event.altKey || false,
            shift: event.shiftKey || false,
            meta: event.metaKey || false
        };
    }

    /**
     * Start potential drag (becomes drag if mouse moves enough)
     * @param {HTMLElement} pinElement
     * @param {PinData} pinData - Initial pin data (may be stale, will fetch fresh)
     * @param {MouseEvent} event
     * @param {Object} clickState - Click state object to clear timeout when drag starts
     * @private
     */
    static async _startPotentialDrag(pinElement, pinData, event, clickState) {
        // Get fresh pin data to ensure we have the current position
        // This is important because pinData in the closure may be stale after a previous drag
        const { PinManager } = await import('./manager-pins.js');
        const freshPinData = PinManager.get(pinData.id);
        if (!freshPinData) {
            console.warn(`BLACKSMITH | PINS _startPotentialDrag: Pin ${pinData.id} not found`);
            return;
        }
        
        // Use fresh pin data
        pinData = freshPinData;
        
        const dragAbortController = new AbortController();
        const signal = dragAbortController.signal;
        
        // Store initial positions
        const startScreenX = event.clientX;
        const startScreenY = event.clientY;
        const startScenePos = { x: pinData.x, y: pinData.y };
        
        // Convert initial screen to scene
        const canvasElement = canvas.app?.renderer?.view || canvas.app?.canvas || canvas.canvas;
        const canvasRect = canvasElement.getBoundingClientRect();
        const startScreenRelative = {
            x: startScreenX - canvasRect.left,
            y: startScreenY - canvasRect.top
        };
        // Reuse PIXI.Point to avoid allocations (performance optimization)
        if (!PinDOMElement._reusableDragPoint) {
            PinDOMElement._reusableDragPoint = new PIXI.Point(0, 0);
        }
        PinDOMElement._reusableDragPoint.set(startScreenRelative.x, startScreenRelative.y);
        const startSceneFromScreen = canvas.stage.toLocal(PinDOMElement._reusableDragPoint);
        
        let dragStarted = false;
        let mouseMoved = false; // Track if mouse moved at all
        let lastDraggedPosition = null; // Track the last dragged position
        const DRAG_THRESHOLD = 10; // pixels in screen space (increased for better click detection)
        
        // Prevent Foundry selection box
        if (canvas.controls) {
            canvas.controls.activeControl = null;
        }
        
        const onDragMove = (e) => {
            if (signal.aborted) return;
            
            const currentScreenX = e.clientX;
            const currentScreenY = e.clientY;
            
            // Calculate distance in screen pixels (more reliable than scene coordinates)
            // This prevents accidental drags from tiny movements when zoomed out
            const screenDeltaX = currentScreenX - startScreenX;
            const screenDeltaY = currentScreenY - startScreenY;
            const screenDistance = Math.sqrt(screenDeltaX * screenDeltaX + screenDeltaY * screenDeltaY);
            
            // Track if mouse moved at all (even < threshold)
            if (screenDistance > 1) {
                mouseMoved = true;
            }
            
            // Only start visual drag if mouse moved more than threshold in screen space
            if (!dragStarted && screenDistance > DRAG_THRESHOLD) {
                dragStarted = true;
                
                // Clear click timeout since this is now a drag, not a click
                if (clickState?.timeout) {
                    clearTimeout(clickState.timeout);
                    clickState.count = 0;
                    clickState.timeout = null;
                }
                
                pinElement.style.opacity = '0.7';
                
                import('./manager-pins.js').then(({ PinManager }) => {
                    const modifiers = this._extractModifiers(e);
                    const sceneId = canvas?.scene?.id || '';
                    const userId = game.user?.id || '';
                    PinManager._invokeHandlers('dragStart', pinData, sceneId, userId, modifiers, e);
                }).catch(() => {});
            }
            
            if (dragStarted) {
                // Calculate scene coordinates for position update
                const currentScreenRelative = {
                    x: currentScreenX - canvasRect.left,
                    y: currentScreenY - canvasRect.top
                };
                // Reuse PIXI.Point to avoid allocations
                PinDOMElement._reusableDragPoint.set(currentScreenRelative.x, currentScreenRelative.y);
                const currentSceneFromScreen = canvas.stage.toLocal(PinDOMElement._reusableDragPoint);
                
                const deltaX = currentSceneFromScreen.x - startSceneFromScreen.x;
                const deltaY = currentSceneFromScreen.y - startSceneFromScreen.y;
                
                const newX = startScenePos.x + deltaX;
                const newY = startScenePos.y + deltaY;
                
                // Track the last dragged position
                lastDraggedPosition = { x: newX, y: newY };
                
                const tempPinData = { ...pinData, x: newX, y: newY };
                this.updatePosition(pinData.id, tempPinData);
                
                import('./manager-pins.js').then(({ PinManager }) => {
                    const modifiers = this._extractModifiers(e);
                    const sceneId = canvas?.scene?.id || '';
                    const userId = game.user?.id || '';
                    PinManager._invokeHandlers('dragMove', tempPinData, sceneId, userId, modifiers, e);
                }).catch(() => {});
            }
        };
        
        const onDragEnd = async (e) => {
            if (signal.aborted) return;
            
            // Calculate final distance to determine if this was really a drag or just a click
            const currentScreenX = e.clientX;
            const currentScreenY = e.clientY;
            const screenDeltaX = currentScreenX - startScreenX;
            const screenDeltaY = currentScreenY - startScreenY;
            const totalDistance = Math.sqrt(screenDeltaX * screenDeltaX + screenDeltaY * screenDeltaY);
            
            // Decide if this was a drag or a click based on total movement
            const wasActualDrag = totalDistance > DRAG_THRESHOLD;
            
            if (wasActualDrag) {
                pinElement.style.opacity = String(_getPinDisplayOpacity(pinData));
                
                // Use the last dragged position if available, otherwise calculate from mouse event
                let finalScene;
                if (lastDraggedPosition) {
                    // Use the tracked position from the last drag move
                    finalScene = lastDraggedPosition;
                } else {
                    // Calculate from final mouse position
                    const currentScreenRelative = {
                        x: currentScreenX - canvasRect.left,
                        y: currentScreenY - canvasRect.top
                    };
                    // Reuse PIXI.Point to avoid allocations
                    PinDOMElement._reusableDragPoint.set(currentScreenRelative.x, currentScreenRelative.y);
                    finalScene = canvas.stage.toLocal(PinDOMElement._reusableDragPoint);
                }
                
                try {
                    const { PinManager } = await import('./manager-pins.js');
                    await PinManager.update(pinData.id, { x: finalScene.x, y: finalScene.y });
                    
                    const modifiers = this._extractModifiers(e);
                    const sceneId = canvas?.scene?.id || '';
                    const userId = game.user?.id || '';
                    PinManager._invokeHandlers('dragEnd', { ...pinData, x: finalScene.x, y: finalScene.y }, sceneId, userId, modifiers, e);
                } catch (err) {
                    postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error updating pin position', err?.message || err, false, true);
                }
            } else {
                // No significant drag occurred - this was a click
                // Reset opacity if visual drag started
                if (dragStarted) {
                    pinElement.style.opacity = String(_getPinDisplayOpacity(pinData));
                }
                
                // Handle click/double-click for editable pins (we're in the drag system)
                clickState.count++;
                if (clickState.timeout) {
                    clearTimeout(clickState.timeout);
                }
                
                clickState.timeout = setTimeout(async () => {
                    if (clickState.count === 1) {
                        const { PinManager } = await import('./manager-pins.js');
                        const modifiers = this._extractModifiers(e);
                        const sceneId = canvas?.scene?.id || '';
                        const userId = game.user?.id || '';
                        PinManager._invokeHandlers('click', pinData, sceneId, userId, modifiers, e);
                        if (pinData.eventAnimations?.click?.animation) {
                            PinRenderer.ping(pinData.id, { animation: pinData.eventAnimations.click.animation, sound: pinData.eventAnimations.click.sound ?? null, loops: 1 });
                        }
                    }
                    clickState.count = 0;
                    clickState.timeout = null;
                }, 300);
                
                // Double-click detection
                if (clickState.count === 2) {
                    clearTimeout(clickState.timeout);
                    clickState.count = 0;
                    clickState.timeout = null;
                    
                    const { PinManager } = await import('./manager-pins.js');
                    const modifiers = this._extractModifiers(e);
                    const sceneId = canvas?.scene?.id || '';
                    const userId = game.user?.id || '';
                    PinManager._invokeHandlers('doubleClick', pinData, sceneId, userId, modifiers, e);
                    if (pinData.eventAnimations?.doubleClick?.animation) {
                        PinRenderer.ping(pinData.id, { animation: pinData.eventAnimations.doubleClick.animation, sound: pinData.eventAnimations.doubleClick.sound ?? null, loops: 1 });
                    }
                }
            }
            
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
        };
        
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        
        signal.addEventListener('abort', () => {
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
        });
    }

    /**
     * Show context menu for right-click
     * @param {HTMLElement} pinElement
     * @param {PinData} pinData
     * @param {MouseEvent} event
     * @private
     */
    static async _showContextMenu(pinElement, pinData, event) {
        const menuX = event.clientX;
        const menuY = event.clientY;
        
        const { PinManager } = await import('./manager-pins.js');
        const userId = game.user?.id || '';
        const canEdit = PinManager._canEdit(pinData, userId);
        const canDelete = canEdit;
        const isHiddenByVisibilityToggle = PinRenderer._isHiddenFromPlayersByVisibility(pinData);
        
        const moduleItems = [];
        const coreItems = [];
        const gmItems = [];
        
        // Module zone: registered context menu items (filtered by moduleId, visible, etc.)
        const registeredItems = PinManager.getContextMenuItems(pinData, userId);
        for (const item of registeredItems) {
            moduleItems.push({
                name: item.name,
                icon: item.icon,
                description: item.description,
                callback: item.callback,
                submenu: item.submenu || null
            });
        }

        // Core zone: Ping Pin, Bring Players Here, Animate, Configure Pin, Delete Pin
        coreItems.push({
            name: 'Ping Pin',
            icon: '<i class="fa-solid fa-signal-stream"></i>',
            callback: async () => {
                try {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) {
                        await pinsAPI.ping(pinData.id, { animation: 'ping', loops: 1, broadcast: true });
                    } else {
                        console.warn('BLACKSMITH | PINS API not available');
                    }
                } catch (err) {
                    postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error pinging pin', err?.message || err, false, true);
                }
            }
        });

        coreItems.push({
            name: 'Bring Players Here',
            icon: '<i class="fa-solid fa-location-crosshairs"></i>',
            callback: async () => {
                try {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) {
                        await pinsAPI.panTo(pinData.id, { broadcast: true, ping: { animation: 'ping', loops: 1 } });
                    } else {
                        console.warn('BLACKSMITH | PINS API not available');
                    }
                } catch (err) {
                    console.error('BLACKSMITH | PINS Error bringing players to pin', err);
                    postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error bringing players to pin', err?.message || err, false, true);
                }
            }
        });

        if (game.user?.isGM) {
            const NONE = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE : 0;
            const OBSERVER = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : 2;
            const OWNER = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER : 3;
            coreItems.push({
                name: 'Access',
                icon: pinIconTag(PIN_ACCESS_SUBMENU_ICON),
                submenu: [
                    {
                        name: 'None: GM Only',
                        icon: pinIconTag(PIN_ACCESS_ICONS.none),
                        callback: async () => {
                            try {
                                const nextConfig = {
                                    ...(pinData.config && typeof pinData.config === 'object' ? pinData.config : {}),
                                    blacksmithAccess: 'read',
                                    blacksmithVisibility: 'hidden'
                                };
                                const nextOwnership = {
                                    ...(pinData.ownership && typeof pinData.ownership === 'object' ? pinData.ownership : {}),
                                    default: NONE
                                };
                                await PinManager.update(pinData.id, { ownership: nextOwnership, config: nextConfig });
                            } catch (err) {
                                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error setting pin access (none)', err?.message || err, false, true);
                            }
                        }
                    },
                    {
                        name: 'Read Only: All open / GM Edit',
                        icon: pinIconTag(PIN_ACCESS_ICONS.read),
                        callback: async () => {
                            try {
                                const nextConfig = {
                                    ...(pinData.config && typeof pinData.config === 'object' ? pinData.config : {}),
                                    blacksmithAccess: 'read'
                                };
                                const nextOwnership = {
                                    ...(pinData.ownership && typeof pinData.ownership === 'object' ? pinData.ownership : {}),
                                    default: OBSERVER
                                };
                                await PinManager.update(pinData.id, { ownership: nextOwnership, config: nextConfig });
                            } catch (err) {
                                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error setting pin access (read)', err?.message || err, false, true);
                            }
                        }
                    },
                    {
                        name: 'Pin: All see pin / GM and Owner Edit',
                        icon: pinIconTag(PIN_ACCESS_ICONS.pin),
                        callback: async () => {
                            try {
                                const nextConfig = {
                                    ...(pinData.config && typeof pinData.config === 'object' ? pinData.config : {}),
                                    blacksmithAccess: 'pin'
                                };
                                const nextOwnership = {
                                    ...(pinData.ownership && typeof pinData.ownership === 'object' ? pinData.ownership : {}),
                                    default: OBSERVER
                                };
                                await PinManager.update(pinData.id, { ownership: nextOwnership, config: nextConfig });
                            } catch (err) {
                                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error setting pin access (pin)', err?.message || err, false, true);
                            }
                        }
                    },
                    {
                        name: 'Full: All view and edit',
                        icon: pinIconTag(PIN_ACCESS_ICONS.full),
                        callback: async () => {
                            try {
                                const nextConfig = {
                                    ...(pinData.config && typeof pinData.config === 'object' ? pinData.config : {}),
                                    blacksmithAccess: 'full'
                                };
                                const nextOwnership = {
                                    ...(pinData.ownership && typeof pinData.ownership === 'object' ? pinData.ownership : {}),
                                    default: OWNER
                                };
                                await PinManager.update(pinData.id, { ownership: nextOwnership, config: nextConfig });
                            } catch (err) {
                                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error setting pin access (full)', err?.message || err, false, true);
                            }
                        }
                    }
                ]
            });

            coreItems.push({
                name: 'Player Visibility',
                icon: pinIconTag(PIN_VISIBILITY_ICONS.visible),
                submenu: [
                    {
                        name: 'Visible',
                        icon: pinIconTag(PIN_VISIBILITY_ICONS.visible),
                        callback: async () => {
                            try {
                                const nextConfig = {
                                    ...(pinData.config && typeof pinData.config === 'object' ? pinData.config : {}),
                                    blacksmithVisibility: 'visible'
                                };
                                await PinManager.update(pinData.id, { config: nextConfig });
                            } catch (err) {
                                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error setting pin visibility (visible)', err?.message || err, false, true);
                            }
                        }
                    },
                    {
                        name: 'Owner',
                        icon: pinIconTag(PIN_VISIBILITY_ICONS.owner),
                        callback: async () => {
                            try {
                                const nextConfig = {
                                    ...(pinData.config && typeof pinData.config === 'object' ? pinData.config : {}),
                                    blacksmithVisibility: 'owner'
                                };
                                await PinManager.update(pinData.id, { config: nextConfig });
                            } catch (err) {
                                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error setting pin visibility (owner)', err?.message || err, false, true);
                            }
                        }
                    },
                    {
                        name: 'Not Visible',
                        icon: pinIconTag(PIN_VISIBILITY_ICONS.hidden),
                        callback: async () => {
                            try {
                                const nextConfig = {
                                    ...(pinData.config && typeof pinData.config === 'object' ? pinData.config : {}),
                                    blacksmithVisibility: 'hidden'
                                };
                                await PinManager.update(pinData.id, { config: nextConfig });
                            } catch (err) {
                                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error setting pin visibility (hidden)', err?.message || err, false, true);
                            }
                        }
                    }
                ]
            });
        }

        coreItems.push({
            name: 'Animate',
            icon: '<i class="fa-solid fa-wand-sparkles"></i>',
            submenu: [
                { name: 'Ping', icon: '<i class="fa-solid fa-bullseye"></i>', callback: async () => {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) await pinsAPI.ping(pinData.id, { animation: 'ping', loops: 1, broadcast: true });
                }},
                { name: 'Pulse', icon: '<i class="fa-solid fa-circle-dot"></i>', callback: async () => {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) await pinsAPI.ping(pinData.id, { animation: 'pulse', loops: 1, broadcast: true });
                }},
                { name: 'Ripple', icon: '<i class="fa-solid fa-water"></i>', callback: async () => {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) await pinsAPI.ping(pinData.id, { animation: 'ripple', loops: 1, broadcast: true });
                }},
                { name: 'Flash', icon: '<i class="fa-solid fa-bolt-lightning"></i>', callback: async () => {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) await pinsAPI.ping(pinData.id, { animation: 'flash', loops: 1, broadcast: true });
                }},
                { name: 'Glow', icon: '<i class="fa-solid fa-sun"></i>', callback: async () => {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) await pinsAPI.ping(pinData.id, { animation: 'glow', loops: 1, broadcast: true });
                }},
                { name: 'Bounce', icon: '<i class="fa-solid fa-arrow-up-from-line"></i>', callback: async () => {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) await pinsAPI.ping(pinData.id, { animation: 'bounce', loops: 1, broadcast: true });
                }},
                { name: 'Scale (Small)', icon: '<i class="fa-solid fa-down-left-and-up-right-to-center"></i>', callback: async () => {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) await pinsAPI.ping(pinData.id, { animation: 'scale-small', loops: 1, broadcast: true });
                }},
                { name: 'Scale (Medium)', icon: '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>', callback: async () => {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) await pinsAPI.ping(pinData.id, { animation: 'scale-medium', loops: 1, broadcast: true });
                }},
                { name: 'Scale (Large)', icon: '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>', callback: async () => {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) await pinsAPI.ping(pinData.id, { animation: 'scale-large', loops: 1, broadcast: true });
                }},
                { name: 'Rotate', icon: '<i class="fa-solid fa-rotate-right"></i>', callback: async () => {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) await pinsAPI.ping(pinData.id, { animation: 'rotate', loops: 1, broadcast: true });
                }},
                { name: 'Shake', icon: '<i class="fa-solid fa-hand"></i>', callback: async () => {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) await pinsAPI.ping(pinData.id, { animation: 'shake', loops: 1, broadcast: true });
                }}
            ]
        });
        
        if (canEdit) {
            coreItems.push({
                name: 'Configure Pin',
                icon: '<i class="fa-solid fa-cog"></i>',
                callback: async () => {
                    try {
                        const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                        if (pinsAPI) {
                            await pinsAPI.configure(pinData.id, { sceneId: canvas?.scene?.id });
                        } else {
                            console.warn('BLACKSMITH | PINS API not available');
                        }
                    } catch (err) {
                        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error opening pin configuration', err?.message || err, false, true);
                    }
                }
            });
        }
        
        if (canDelete) {
            coreItems.push({
                name: 'Delete Pin',
                icon: '<i class="fa-solid fa-trash"></i>',
                callback: async () => {
                    try {
                        const { PinManager } = await import('./manager-pins.js');
                        await PinManager.delete(pinData.id);
                    } catch (err) {
                        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error deleting pin', err?.message || err, false, true);
                    }
                }
            });
        }
        
        // GM zone reserved for future use
        
        const totalItems = moduleItems.length + coreItems.length + gmItems.length;
        if (totalItems > 0) {
            this._renderContextMenu({ module: moduleItems, core: coreItems, gm: gmItems }, menuX, menuY);
        }
    }

    /**
     * Render context menu at screen coordinates with module, core, and gm zones.
     * @param {{ module: Array, core: Array, gm: Array }} zones - Item arrays per zone
     * @param {number} x
     * @param {number} y
     * @private
     */
    static _renderContextMenu(zones, x, y) {
        UIContextMenu.show({
            id: 'blacksmith-pin-context-menu',
            x,
            y,
            zones
        });
    }

    /**
     * Check if image string is a Font Awesome icon HTML or class string
     * @param {string} imageStr
     * @returns {boolean}
     */
    static _isFontAwesomeIcon(imageStr) {
        if (typeof imageStr !== 'string') return false;
        // Check for Font Awesome icon pattern: <i class="fa-...">
        if (/<i\s+class=["']fa-/.test(imageStr)) return true;
        // Check for plain Font Awesome class string: "fa-solid fa-location-dot"
        if (/^fa-/.test(imageStr.trim())) return true;
        // If it's an <img> tag, it's not Font Awesome
        if (/<img\s+/i.test(imageStr)) return false;
        // If it starts with http/https or /, it's an image URL
        if (/^(https?:\/\/|\/)/.test(imageStr)) return false;
        // Other HTML tags might be Font Awesome (legacy support)
        return /<[^>]+>/.test(imageStr);
    }

    /**
     * Extract image URL from <img> tag or return the string if it's already a URL
     * @param {string} imageStr
     * @returns {string | null}
     */
    static _extractImageUrl(imageStr) {
        if (typeof imageStr !== 'string') return null;
        // Check if it's an <img> tag
        const imgMatch = imageStr.match(/<img\s+[^>]*src=["']([^"']+)["']/i);
        if (imgMatch) {
            return imgMatch[1];
        }
        // If it's already a URL (starts with http/https or /), return as-is
        if (/^(https?:\/\/|\/)/.test(imageStr)) {
            return imageStr;
        }
        // If it doesn't contain HTML tags, treat as relative URL
        if (!/<[^>]+>/.test(imageStr)) {
            return imageStr;
        }
        return null;
    }

    /**
     * Extract Font Awesome classes from HTML string or plain class string
     * @param {string} htmlStr - Can be HTML like '<i class="fa-solid fa-location-dot"></i>' or plain class string like 'fa-solid fa-location-dot'
     * @returns {string | null}
     */
    static _extractFontAwesomeClasses(htmlStr) {
        if (!htmlStr) return null;
        // If it starts with 'fa-', it's already a plain class string
        if (/^fa-/.test(htmlStr.trim())) {
            return htmlStr.trim();
        }
        // Otherwise, try to extract from HTML
        const match = htmlStr.match(/class=["']([^"']+)["']/);
        return match ? match[1] : null;
    }

    /**
     * Update pin text display
     * @param {HTMLElement} pinElement
     * @param {PinData} pinData
     * @private
     */
    static _updatePinText(pinElement, pinData) {
        // Get or create text element
        let textElement = pinElement.querySelector('.blacksmith-pin-text');
        if (!textElement) {
            textElement = document.createElement('div');
            textElement.className = 'blacksmith-pin-text';
            pinElement.appendChild(textElement);
        }

        const text = pinData.text || '';
        const textLayout = pinData.textLayout || 'under';
        const textDisplay = pinData.textDisplay || 'always';
        const textColor = pinData.textColor || '#ffffff';
        const textSize = pinData.textSize || 12;
        const rawMaxLength = pinData.textMaxLength ?? 0;
        const textMaxLength = Math.max(0, parseInt(String(rawMaxLength), 10) || 0);
        const rawMaxWidth = pinData.textMaxWidth ?? 0;
        const textMaxWidth = Math.max(0, parseInt(String(rawMaxWidth), 10) || 0);
        const isGM = game.user?.isGM || false;

        // Check if text should be visible
        let shouldShow = false;
        if (text && text.trim()) {
            if (textDisplay === 'always') {
                shouldShow = true;
            } else if (textDisplay === 'hover') {
                shouldShow = false; // Will be shown on hover via CSS
            } else if (textDisplay === 'gm') {
                shouldShow = isGM;
            } else if (textDisplay === 'never') {
                shouldShow = false;
            }
        }

        // Set text content. Max characters and chars per line are independent: either or both can be set.
        if (text && text.trim()) {
            let displayText = text.trim();
            // Max characters: truncate to N chars and add "..." (0 = no limit). Does not depend on chars per line.
            if (textMaxLength > 0 && displayText.length > textMaxLength) {
                displayText = displayText.substring(0, textMaxLength) + '...';
            }
            // Chars per line (linear layouts): normalize source newlines; browser wraps at word boundary within width (ch). Does not depend on max characters.
            const linearLayouts = ['under', 'over', 'above', 'right', 'left'];
            if (linearLayouts.includes(textLayout) && textMaxWidth > 0) {
                displayText = displayText.replace(/\s+/g, ' ').trim();
            }
            
            // For arc layouts (arc-above, arc-below), create curved text; pass position for above/below
            const arcLayouts = ['arc-above', 'arc-below'];
            if (arcLayouts.includes(textLayout) || textLayout === 'around') {
                textElement.dataset.originalText = displayText;
                const position = (textLayout === 'arc-above') ? 'above' : 'below';
                this._createCurvedText(textElement, displayText, pinData, pinElement, { position });
            } else {
                // For linear layouts (under, over, above, right, left), use simple text content
                textElement.textContent = displayText;
            }
        } else {
            textElement.textContent = '';
            shouldShow = false;
        }

        // Set text layout
        textElement.dataset.layout = textLayout;

        // Set text display mode on pin element (for CSS)
        pinElement.dataset.textDisplay = textDisplay;

        // Apply text styling
        textElement.style.color = textColor;
        
        // Store base text size as data attribute for scaling
        textElement.dataset.baseTextSize = String(textSize);
        
        // Apply initial text size (will be scaled in updatePosition if textScaleWithPin is true)
        // Exception: arc layouts always scale with pin (ignore scale setting)
        const arcLayouts = ['arc-above', 'arc-below'];
        const textScaleWithPin = (arcLayouts.includes(textLayout) || textLayout === 'around') ? true : (pinData.textScaleWithPin !== false);
        textElement.dataset.textScaleWithPin = String(textScaleWithPin);
        
        if (textScaleWithPin) {
            // Will be scaled in updatePosition based on zoom level
            // For now, use base size (will be updated on next position update)
            textElement.style.fontSize = `${textSize}px`;
        } else {
            // Fixed size - don't scale (used for arc layouts and when textScaleWithPin is false)
            textElement.style.fontSize = `${textSize}px`;
        }

        // Linear layouts (under, over, above, right, left): avoid CSS clipping so Max characters is the only truncation. Chars per line 0 = as wide as needed.
        const linearLayouts = ['under', 'over', 'above', 'right', 'left'];
        if (linearLayouts.includes(textLayout)) {
            if (textMaxWidth > 0) {
                textElement.style.width = `${textMaxWidth}ch`;
                textElement.style.maxWidth = 'none';
                textElement.style.whiteSpace = 'normal';
                textElement.style.overflowWrap = 'break-word';
                textElement.style.overflow = 'visible';
                textElement.style.textOverflow = '';
            } else {
                // Chars per line 0: label as wide as content (max-content) so CSS overflow:hidden + ellipsis don't clip; only Max characters truncates.
                textElement.style.width = 'max-content';
                textElement.style.maxWidth = 'none';
                textElement.style.whiteSpace = 'nowrap';
                textElement.style.overflowWrap = '';
                textElement.style.overflow = 'visible';
                textElement.style.textOverflow = '';
            }
        }

        // Apply drop shadow if pin has drop shadow
        if (pinData.dropShadow !== false) {
            textElement.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.8)';
        } else {
            textElement.style.textShadow = 'none';
        }

        // Show/hide text based on display mode
        if (shouldShow) {
            textElement.style.display = 'block';
        } else if (textDisplay === 'hover') {
            // Will be shown on hover via CSS/JavaScript
            textElement.style.display = 'none';
        } else {
            textElement.style.display = 'none';
        }
    }

    /**
     * Break text into lines of at most maxChPerLine characters, at word boundaries when possible.
     * @param {string} text
     * @param {number} maxChPerLine - Max characters per line (0 = no wrap, return single line).
     * @returns {string[]}
     * @private
     */
    static _breakTextIntoLines(text, maxChPerLine) {
        const maxCh = Number(maxChPerLine);
        if (!Number.isFinite(maxCh) || maxCh <= 0) return [text];
        const lines = [];
        const words = text.split(/\s+/).filter(Boolean);
        let current = '';
        for (const word of words) {
            const withSpace = current ? current + ' ' + word : word;
            if (withSpace.length <= maxCh) {
                current = withSpace;
            } else {
                if (current) lines.push(current);
                if (word.length > maxCh) {
                    for (let i = 0; i < word.length; i += maxCh) {
                        lines.push(word.slice(i, i + maxCh));
                    }
                    current = '';
                } else {
                    current = word;
                }
            }
        }
        if (current) lines.push(current);
        return lines.length ? lines : [text];
    }

    /**
     * Create curved text around the pin edge. Honors max characters (caller truncates) and chars per line (multi-line arcs).
     * @param {HTMLElement} textElement
     * @param {string} text
     * @param {PinData} pinData
     * @param {HTMLElement} [pinElement] - Optional pin element (will be found if not provided)
     * @param {object} [opts]
     * @param {"below"|"above"} [opts.position="below"] - Where to center the arc relative to the pin.
     * @private
     */
    static _createCurvedText(textElement, text, pinData, pinElement = null, opts = {}) {
        const position = opts?.position === "above" ? "above" : "below";
    
        textElement.innerHTML = "";
    
        if (!pinElement) pinElement = textElement.closest(".blacksmith-pin");
        if (!pinElement) return;
    
        const pinWidth = parseFloat(pinElement.style.width) || Math.min(pinData.size.w, pinData.size.h);
        const pinHeight = parseFloat(pinElement.style.height) || Math.min(pinData.size.w, pinData.size.h);
        const pinSize = Math.min(pinWidth, pinHeight);
    
        const borderWidth = parseFloat(pinElement.style.borderWidth) || (pinData.style?.strokeWidth || 2);
    
        const computedFontSize = parseFloat(window.getComputedStyle(textElement).fontSize);
        const textSize =
        Number.isFinite(computedFontSize) && computedFontSize > 0
            ? computedFontSize
            : (parseFloat(textElement.dataset.baseTextSize) || pinData.textSize || 12);
    
        const measureEl = document.createElement("span");
        measureEl.style.position = "absolute";
        measureEl.style.visibility = "hidden";
        measureEl.style.whiteSpace = "nowrap";
        measureEl.style.fontSize = `${textSize}px`;
        measureEl.style.fontWeight = "bold";
    
        const computedStyle = window.getComputedStyle(textElement);
        measureEl.style.fontFamily = computedStyle.fontFamily;
        document.body.appendChild(measureEl);
    
        // Height + line stepping
        measureEl.textContent = "M";
        const textHeight = measureEl.offsetHeight;
        const lineGap = 2;
        const lineOffset = textHeight + lineGap;
        const offset = textHeight;
    
        // Spacing
        const letterSpacing = 2;
        const wordSpacing = 8;
    
        // Arc orientation
        const centerAngle = position === "above" ? 270 : 90;
        const direction = position === "above" ? +1 : -1;
    
        // Base radius (closest possible line to pin)
        const baseRadius = (pinSize / 2) + borderWidth + offset;
    
        // User config (could be "chars" or "px")
        const textMaxWidth = Number(pinData?.textMaxWidth) || 0;
    
        const measureWidth = (str) => {
        let w = 0;
        const chars = String(str).split("");
        chars.forEach((ch, i) => {
            if (ch === " ") {
            w += wordSpacing;
            } else {
            measureEl.textContent = ch;
            w += measureEl.offsetWidth;
            }
            if (i < chars.length - 1) w += letterSpacing;
        });
        return w;
        };
    
        // Convert setting into a pixel budget (at some reference radius)
        const toPixelBudget = (val) => {
        if (!val) return 0;
    
        // Heuristic: small numbers are probably "chars"
        if (val <= 80) {
            measureEl.textContent = "M";
            const avgChar = measureEl.offsetWidth + letterSpacing;
            return Math.max(10, val * avgChar);
        }
    
        // Otherwise treat as px
        return val;
        };
    
        const basePixelBudget = toPixelBudget(textMaxWidth);
    
        // Compute stack index for a line, given total line count
        // - below: lineIndex 0 is closest, then outward
        // - above: lineIndex 0 is outermost, then inward
        const getStackIndex = (lineIndex, totalLines) => {
        return position === "above" ? (totalLines - 1 - lineIndex) : lineIndex;
        };
    
        // Radius for a given line index, given total line count
        const getRadius = (lineIndex, totalLines) => {
        const stackIndex = getStackIndex(lineIndex, totalLines);
        return baseRadius + (stackIndex * lineOffset);
        };
    
        // Break text into lines using per-line budgets that match the final radii
        const breakIntoArcLines = (fullText) => {
        if (!basePixelBudget) return [String(fullText)];
    
        const words = String(fullText).trim().split(/\s+/).filter(Boolean);
        if (!words.length) return [""];
    
        // Iteratively converge on line count so "above" can budget the outermost line correctly
        let lines = [];
        let guessLines = 1;
    
        for (let pass = 0; pass < 5; pass++) {
            lines = [];
            let idx = 0;
    
            while (idx < words.length && lines.length < 50) {
            const lineIndex = lines.length;
            const totalLinesAssumed = Math.max(guessLines, lineIndex + 1);
    
            // IMPORTANT: budget must be computed using the SAME radius mapping as rendering.
            // Use the assumed total line count to compute this line's radius.
            const radius = getRadius(lineIndex, totalLinesAssumed);
    
            // Scale pixel budget by radius relative to the reference radius for line 0.
            // For "above", line 0 is outermost, so reference should be its radius, not baseRadius.
            const refRadius = getRadius(0, totalLinesAssumed);
            const budget = basePixelBudget * (radius / refRadius);
    
            // Greedy fill line with whole words
            let line = words[idx];
            while (idx + 1 < words.length) {
                const candidate = `${line} ${words[idx + 1]}`;
                if (measureWidth(candidate) <= budget) {
                idx++;
                line = candidate;
                } else {
                break;
                }
            }
    
            lines.push(line);
            idx++;
            }
    
            // Converge: if our guess matches produced lines, stop
            if (lines.length === guessLines) break;
            guessLines = lines.length;
        }
    
        return lines;
        };
    
        const lines = breakIntoArcLines(text);
    
        // Render
        lines.forEach((line, lineIndex) => {
        const chars = line.split("");
        if (!chars.length) return;
    
        const radius = getRadius(lineIndex, lines.length);
    
        const totalTextWidth = measureWidth(line);
        const totalArcAngle = (totalTextWidth / radius) * (180 / Math.PI);
        const anglePerPixel = 180 / (Math.PI * radius);
    
        const startAngle = direction === +1
            ? (centerAngle - (totalArcAngle / 2))
            : (centerAngle + (totalArcAngle / 2));
    
        let currentAngle = startAngle;
    
        chars.forEach((char, index) => {
            let charAngleSpan = 0;
    
            if (char === " ") {
            charAngleSpan = wordSpacing * anglePerPixel;
            } else {
            measureEl.textContent = char;
            charAngleSpan = measureEl.offsetWidth * anglePerPixel;
            }
    
            const charAngle = currentAngle + direction * (charAngleSpan / 2);
            const angleRad = (charAngle * Math.PI) / 180;
    
            const x = Math.cos(angleRad) * radius;
            const y = Math.sin(angleRad) * radius;
    
            if (char !== " ") {
            measureEl.textContent = char;
            const charHeight = measureEl.offsetHeight;
    
            const span = document.createElement("span");
            span.className = "text-char";
            span.textContent = char;
    
            span.style.position = "absolute";
            span.style.whiteSpace = "nowrap";
            span.style.fontSize = `${textSize}px`;
            span.style.left = "50%";
            span.style.top = "50%";
    
            const radialOffset = charHeight / 2;
            const xAdjusted = x - Math.cos(angleRad) * radialOffset;
            const yAdjusted = y - Math.sin(angleRad) * radialOffset;
    
            const rotationDeg = charAngle + (direction * 90);
    
            span.style.transform = `
                translate(calc(-50% + ${xAdjusted}px), calc(-50% + ${yAdjusted}px))
                rotate(${rotationDeg}deg)
            `.trim();
    
            span.style.transformOrigin = "center center";
            textElement.appendChild(span);
            }
    
            currentAngle += direction * charAngleSpan;
            if (index < chars.length - 1) currentAngle += direction * (letterSpacing * anglePerPixel);
        });
        });
    
        document.body.removeChild(measureEl);
    }
    

    /**
     * Remove a pin DOM element
     * @param {string} pinId
     */
    static removePin(pinId) {
        const pinElement = this._pins.get(pinId);
        if (pinElement) {
            pinElement.remove();
            this._pins.delete(pinId);
        }
    }

    /**
     * Remove all pin DOM elements
     */
    static clear() {
        for (const pin of this._pins.values()) {
            pin.remove();
        }
        this._pins.clear();
    }

    /**
     * Wait for ms milliseconds or until signal is aborted (whichever first).
     * @param {number} ms
     * @param {AbortSignal} [signal]
     * @returns {Promise<void>}
     * @private
     */
    static _wait(ms, signal) {
        if (!signal) return new Promise((r) => setTimeout(r, ms));
        if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
        return new Promise((resolve, reject) => {
            const id = setTimeout(() => {
                signal.removeEventListener('abort', onAbort);
                resolve();
            }, ms);
            const onAbort = () => {
                clearTimeout(id);
                reject(new DOMException('Aborted', 'AbortError'));
            };
            signal.addEventListener('abort', onAbort);
        });
    }

    /**
     * Play standard animation (pulse, flash, glow, bounce, scale, rotate, shake)
     * @param {HTMLElement} pinElement
     * @param {string} animation
     * @param {number} loops - Number of loops, or use Infinity with signal to run until stopped
     * @param {AbortSignal} [signal] - When provided, loop until signal.aborted (loops ignored for "until stopped" behavior)
     * @private
     */
    static async _pingStandard(pinElement, animation, loops, signal) {
        const className = `blacksmith-pin-animate-${animation}`;
        
        pinElement.classList.add(className);
        const style = window.getComputedStyle(pinElement);
        const animationDuration = parseFloat(style.animationDuration) || 0.8;
        const durationMs = animationDuration * 1000;
        pinElement.classList.remove(className);
        
        const runOneLoop = async () => {
            void pinElement.offsetHeight; // force reflow so re-adding the class restarts the animation
            pinElement.classList.add(className);
            await this._wait(durationMs, signal);
            pinElement.classList.remove(className);
        };

        const loopUntilStopped = signal != null;
        let i = 0;
        try {
            while (loopUntilStopped ? !signal.aborted : i < loops) {
                await runOneLoop();
                if (loopUntilStopped && signal.aborted) break;
                i++;
            }
        } catch (e) {
            if (e?.name === 'AbortError') {
                pinElement.classList.remove(className);
            }
            throw e;
        }
    }

    /**
     * Play ripple animation (creates expanding circle element)
     * @param {HTMLElement} pinElement
     * @param {number} loops - Number of loops, or use with signal to run until stopped
     * @param {AbortSignal} [signal] - When provided, loop until signal.aborted
     * @private
     */
    static async _pingRipple(pinElement, loops, signal) {
        const durationMs = 1000;
        const loopUntilStopped = signal != null;
        let i = 0;

        const runOneRipple = async () => {
            const pinRect = pinElement.getBoundingClientRect();
            const centerX = pinRect.left + pinRect.width / 2;
            const centerY = pinRect.top + pinRect.height / 2;
            const pinSize = Math.max(pinRect.width, pinRect.height);
            const pinColor = pinElement.style.borderColor || pinElement.style.backgroundColor || '#ffffff';

            const ripple = document.createElement('div');
            ripple.className = 'blacksmith-pin-ripple';
            ripple.style.left = `${centerX}px`;
            ripple.style.top = `${centerY}px`;
            ripple.style.transform = 'translate(-50%, -50%)';
            ripple.style.borderColor = pinColor;
            ripple.style.color = pinColor;
            ripple.style.setProperty('--pin-size', `${pinSize}px`);

            if (this._container) this._container.appendChild(ripple);
            await this._wait(durationMs, signal);
            ripple.remove();
        };

        try {
            while (loopUntilStopped ? !signal.aborted : i < loops) {
                await runOneRipple();
                if (loopUntilStopped && signal.aborted) break;
                i++;
            }
        } catch (e) {
            if (e?.name === 'AbortError') { /* ripple already removed in runOneRipple */ }
            throw e;
        }
    }

    /**
     * Run a single animation step once (expands 'ping' to scale-large + ripple).
     * @param {HTMLElement} pinElement
     * @param {string} anim - Animation name (e.g. 'pulse', 'ping', 'ripple')
     * @param {AbortSignal} [signal]
     * @private
     */
    static async _runOneAnimationStep(pinElement, anim, signal) {
        if (anim === 'ping') {
            await PinDOMElement._pingStandard(pinElement, 'scale-large', 1, signal);
            await PinDOMElement._pingRipple(pinElement, 1, signal);
        } else if (anim === 'ripple') {
            await PinDOMElement._pingRipple(pinElement, 1, signal);
        } else {
            await PinDOMElement._pingStandard(pinElement, anim, 1, signal);
        }
    }

    /**
     * Cleanup on module unload
     */
    static cleanup() {
        // Remove all pins
        this.clear();
        
        // Remove container
        if (this._container) {
            this._container.remove();
            this._container = null;
        }
        
        // Remove window resize listener
        if (this._resizeListener) {
            window.removeEventListener('resize', this._resizeListener);
            this._resizeListener = null;
        }
        
        // Remove all hook listeners
        for (const hookId of this._hookIds) {
            Hooks.off(hookId);
        }
        this._hookIds = [];
        
        // Clear reusable points
        this._reusablePoint = null;
        this._reusableDragPoint = null;
        
        // Cancel any pending updates
        if (this._updateThrottle) {
            cancelAnimationFrame(this._updateThrottle);
            this._updateThrottle = null;
        }
        
        this._isInitialized = false;
    }
}

/**
 * PinRenderer - Manages pin rendering on the canvas
 * Pure DOM approach: All pins are HTML divs
 */
export class PinRenderer {
    static _currentSceneId = null;
    /** Monotonic run id so overlapping {@link applyVisibilityFilters} calls discard stale work (v13+). */
    static _visibilityFilterSyncGen = 0;
    static _socketRegistered = false;

    /**
     * Initialize the pins system (no longer needs layer parameter)
     */
    static initialize() {
        // Initialize DOM pin system
        PinDOMElement.initialize();
        
        // Register socket handlers for broadcast pings
        this._registerSocketHandlers();
    }
    
    /**
     * Register socket handlers for pin broadcasting
     * @private
     */
    static async _registerSocketHandlers() {
        if (this._socketRegistered) return;
        
        try {
            const { SocketManager } = await import('./manager-sockets.js');
            await SocketManager.waitForReady();
            
            const socket = SocketManager.getSocket();
            if (!socket) {
                console.warn('BLACKSMITH | PINS Socket not available, broadcast functionality disabled');
                return;
            }
            
            // Register handler for receiving broadcast pings
            socket.register('pingPin', async (data, senderId) => {
                const { pinId, animation, loops, sound } = data;
                
                // Check if this user can see the pin
                const { PinManager } = await import('./manager-pins.js');
                const userId = game.user?.id || '';
                const pinData = PinManager.get(pinId);
                
                if (!pinData || !this._canUserSeePin(pinData, userId, PinManager)) {
                    // User cannot see this pin, ignore the broadcast
                    return;
                }
                
                // Animate the pin locally (without broadcasting again)
                await PinRenderer.ping(pinId, {
                    animation,
                    loops: loops || 1,
                    sound: sound || null,
                    broadcast: false // Prevent infinite loop
                });
            });
            
            // Register handler for receiving broadcast panTo (Bring Players Here)
            socket.register('panToPin', async (data, senderId) => {
                try {
                    const { pinId, ping } = data;
                    
                    // Check if this user can see the pin
                    const { PinManager } = await import('./manager-pins.js');
                    const userId = game.user?.id || '';
                    const pinData = PinManager.get(pinId);
                    
                    if (!pinData || !this._canUserSeePin(pinData, userId, PinManager)) {
                        // User cannot see this pin, ignore the broadcast
                        return;
                    }
                    
                    // Pan to the pin locally (without broadcasting again)
                    const { PinsAPI } = await import('./api-pins.js');
                    await PinsAPI.panTo(pinId, {
                        ping: ping || null,
                        broadcast: false // Prevent infinite loop
                    });
                } catch (err) {
                    console.error('BLACKSMITH | PINS Error handling broadcast panTo', err);
                }
            });
            
            this._socketRegistered = true;
            
        } catch (error) {
            console.warn('BLACKSMITH | PINS Error registering socket handlers', error);
        }
    }

    /**
     * Get container status (for compatibility with old code)
     * Returns true if initialized, false otherwise
     * @returns {boolean}
     */
    static getContainer() {
        // For compatibility - return true if initialized
        return PinDOMElement._isInitialized;
    }

    /**
     * Load and render pins for a scene
     * @param {string} sceneId
     * @param {PinData[]} pins - Array of pin data to render
     */
    static async loadScenePins(sceneId, pins) {
        if (this._currentSceneId === sceneId && PinDOMElement._pins.size > 0 && (!pins || pins.length === 0)) {
            return;
        }

        if (this._currentSceneId !== sceneId) {
            this.clear();
        }
        this._currentSceneId = sceneId;

        if (!PinDOMElement._isInitialized) {
            PinDOMElement.initialize();
        }

        if (!pins || pins.length === 0) {
            return;
        }

        try {
            // Filter pins based on visibility permissions
            const { PinManager } = await import('./manager-pins.js');
            const userId = game.user?.id || '';
            const visiblePins = pins.filter((pin) => this._canUserSeePin(pin, userId, PinManager) && !PinManager._isHiddenByFilter(pin));

            for (const pinData of visiblePins) {
                await this._addPin(pinData);
            }
            await this.applyVisibilityFilters();
            
            if (canvas?.ready && canvas?.stage && canvas?.app) {
                setTimeout(() => {
                    PinDOMElement.updateAllPositions();
                }, 200);
            } else {
                Hooks.once('canvasReady', () => {
                    setTimeout(() => {
                        PinDOMElement.updateAllPositions();
                    }, 200);
                });
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error loading scene pins', error?.message ?? error, false, true);
        }
    }

    /**
     * Add a pin to the renderer
     * @param {PinData} pinData
     * @private
     */
    static async _addPin(pinData) {
        PinDOMElement.createOrUpdatePin(pinData.id, pinData);
        await this._applyVisibilityForPin(pinData);
    }

    /**
     * Update an existing pin
     * @param {PinData} pinData
     */
    static async updatePin(pinData) {
        // Check visibility before updating
        const { PinManager } = await import('./manager-pins.js');
        const userId = game.user?.id || '';
        
        if (this._canUserSeePin(pinData, userId, PinManager) && !PinManager._isHiddenByFilter(pinData)) {
            // User can see the pin - create or update it
            PinDOMElement.createOrUpdatePin(pinData.id, pinData);
            await this._applyVisibilityForPin(pinData);
        } else {
            // User can no longer see the pin - remove it if it exists
            if (PinDOMElement._pins.has(pinData.id)) {
                PinDOMElement.removePin(pinData.id);
            }
        }
    }

    static async _applyVisibilityForPin(pinData) {
        const pinElement = PinDOMElement._pins.get(pinData.id);
        if (!pinElement) return;
        const { PinManager } = await import('./manager-pins.js');
        const hiddenByFilter = PinManager._isHiddenByFilter(pinData);
        const visibilityMode = _getPinVisibilityMode(pinData);
        const hiddenByVisibilityToggle = visibilityMode === 'hidden';
        const userId = game.user?.id || '';
        const hiddenForUserByOwnerMode = !game.user?.isGM && visibilityMode === 'owner' && !PinManager._canEdit(pinData, userId);
        const accessMode = _getPinAccessMode(pinData);
        const canEdit = PinManager._canEdit(pinData, userId);
        pinElement.dataset.interaction = (accessMode === 'pin' && !canEdit) ? 'locked' : 'enabled';
        if (hiddenByFilter) {
            pinElement.dataset.hiddenByFilter = 'true';
            pinElement.style.display = 'none';
        } else {
            delete pinElement.dataset.hiddenByFilter;
            if (!game.user?.isGM && (hiddenByVisibilityToggle || hiddenForUserByOwnerMode)) {
                pinElement.style.display = 'none';
            } else {
                pinElement.style.display = '';
            }
        }

        const badge = pinElement.querySelector('.blacksmith-pin-gm-indicator');
        const badgeIcon = badge?.querySelector('i');
        if (badge && badgeIcon) {
            if (!game.user?.isGM) {
                badge.hidden = true;
            } else if (_isPinGmOnlyAccess(pinData)) {
                badgeIcon.className = PIN_ACCESS_ICONS.none;
                badge.hidden = false;
            } else {
                badge.hidden = true;
            }
        }
        pinElement.style.opacity = String(_getPinDisplayOpacity(pinData));
    }

    static _getVisibilityState(pinData) {
        return _getPinVisibilityMode(pinData);
    }

    static _isHiddenFromPlayersByVisibility(pinData) {
        return _isPinHiddenFromPlayersByVisibility(pinData);
    }

    static _canUserSeePin(pinData, userId, PinManager) {
        if (!pinData || !PinManager?._canView(pinData, userId)) return false;
        if (game.user?.isGM) return true;
        const visibilityMode = _getPinVisibilityMode(pinData);
        if (visibilityMode === 'hidden') return false;
        if (visibilityMode === 'owner') return PinManager._canEdit(pinData, userId);
        return true;
    }

    /**
     * Decide which scene to sync against the DOM overlay. Avoids applying one scene's pin list
     * while Foundry's active canvas scene has already changed (v13 / v14 migration-safe `canvas` usage).
     * @returns {{ mode: 'full', sceneId: string } | { mode: 'domOnly' } | { mode: 'skip' }}
     * @private
     */
    static _filterSyncContext() {
        const canvasSceneId = canvas?.ready && canvas.scene?.id ? canvas.scene.id : null;
        const loadedId = this._currentSceneId;
        if (loadedId && canvasSceneId && loadedId !== canvasSceneId) {
            return { mode: 'skip' };
        }
        const sceneId = loadedId || canvasSceneId || null;
        if (sceneId) return { mode: 'full', sceneId };
        return { mode: 'domOnly' };
    }

    static async applyVisibilityFilters() {
        if (!PinDOMElement._isInitialized) return;
        const gen = ++this._visibilityFilterSyncGen;
        const { PinManager } = await import('./manager-pins.js');
        if (gen !== this._visibilityFilterSyncGen) return;

        if (PinDOMElement._container) {
            if (PinManager.isGlobalHidden()) PinDOMElement._container.dataset.hidden = 'true';
            else delete PinDOMElement._container.dataset.hidden;
        }
        if (gen !== this._visibilityFilterSyncGen) return;

        const ctx = this._filterSyncContext();
        if (ctx.mode === 'skip') return;

        if (ctx.mode === 'full') {
            if (PinManager.isGlobalHidden()) {
                for (const pinId of [...PinDOMElement._pins.keys()]) {
                    if (gen !== this._visibilityFilterSyncGen) return;
                    PinDOMElement.removePin(pinId);
                }
                return;
            }

            const allPins = PinManager.list({ sceneId: ctx.sceneId, includeHiddenByFilter: true }) || [];
            if (gen !== this._visibilityFilterSyncGen) return;

            if (allPins.length === 0) {
                for (const pinId of [...PinDOMElement._pins.keys()]) {
                    if (gen !== this._visibilityFilterSyncGen) return;
                    PinDOMElement.removePin(pinId);
                }
                return;
            }

            const idsInScene = new Set(allPins.map(p => p?.id).filter(Boolean));
            for (const pinData of allPins) {
                if (!pinData?.id) continue;
                await this.updatePin(pinData);
                if (gen !== this._visibilityFilterSyncGen) return;
            }
            for (const pinId of [...PinDOMElement._pins.keys()]) {
                if (gen !== this._visibilityFilterSyncGen) return;
                if (!idsInScene.has(pinId)) PinDOMElement.removePin(pinId);
            }
        } else {
            for (const [pinId] of PinDOMElement._pins.entries()) {
                if (gen !== this._visibilityFilterSyncGen) return;
                const pinData = PinManager.get(pinId);
                if (pinData) {
                    await this._applyVisibilityForPin(pinData);
                }
            }
        }
    }

    /**
     * Play add-to-canvas animation (same as ping: bounce, pulse, etc.) and optional sound. Call after the pin is rendered (e.g. after place() or create() with placement).
     * @param {string} pinId
     * @param {{ animation?: string | null; sound?: string | null }} options
     * @returns {Promise<void>}
     */
    static async playAddAnimation(pinId, options = {}) {
        const { animation, sound } = options;
        if (!animation) return;
        const pinElement = PinDOMElement._pins.get(pinId);
        if (!pinElement) return;
        await this.ping(pinId, { animation, sound: sound ?? null, loops: 1 });
    }

    /**
     * Play delete animation (fade, dissolve, or scale-small) then resolve. Does not remove the pin; caller should call removePin after.
     * @param {string} pinId
     * @param {{ animation: string | null; sound?: string | null }} options - animation: 'fade' | 'dissolve' | 'scale-small', sound: optional
     * @returns {Promise<void>}
     */
    static async playDeleteAnimation(pinId, options = {}) {
        const { animation, sound } = options;
        const validDelete = ['fade', 'dissolve', 'scale-small'];
        if (!animation || !validDelete.includes(animation)) return;
        const pinElement = PinDOMElement._pins.get(pinId);
        if (!pinElement) return;
        if (sound) {
            try {
                const soundPath = this._resolveSoundPath(sound);
                if (soundPath) await foundry.audio.AudioHelper.play({ src: soundPath, volume: 0.8, loop: false }, false);
            } catch (err) {
                console.warn('BLACKSMITH | PINS Delete sound failed:', err);
            }
        }
        pinElement.classList.add(`blacksmith-pin-delete-${animation}`);
        await new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                pinElement.removeEventListener('animationend', onEnd);
                resolve();
            };
            const onEnd = () => finish();
            pinElement.addEventListener('animationend', onEnd);
            const duration = animation === 'scale-small' ? 400 : 350;
            setTimeout(finish, duration);
        });
    }

    /**
     * Remove a pin from the renderer
     * @param {string} pinId
     */
    static removePin(pinId) {
        PinDOMElement.removePin(pinId);
    }

    /**
     * Refresh/re-render a single pin by forcing a rebuild of its icon element.
     * Useful for edge cases where update() doesn't fully refresh the visual.
     * Note: This should rarely be needed as update() now handles icon/image type changes automatically.
     * @param {string} pinId - The pin ID to refresh
     * @param {import('./manager-pins.js').PinGetOptions} [options] - Optional sceneId
     * @returns {Promise<boolean>} - True if pin was refreshed, false if not found
     */
    static async refreshPin(pinId, options = {}) {
        const { PinManager } = await import('./manager-pins.js');
        const pinData = PinManager.get(pinId, options);
        
        if (!pinData) {
            return false;
        }
        
        // Force refresh by removing icon type tracking, then rebuilding
        const pinElement = PinDOMElement._pins.get(pinId);
        if (pinElement) {
            const iconElement = pinElement.querySelector('.blacksmith-pin-icon');
            if (iconElement) {
                // Remove icon type tracking to force rebuild
                delete iconElement.dataset.iconType;
            }
        }
        
        // Rebuild the pin with fresh data
        await this.updatePin(pinData);
        return true;
    }

    /**
     * Clear all pins
     */
    static clear() {
        PinDOMElement.clear();
        this._currentSceneId = null;
        this._visibilityFilterSyncGen++;
    }

    /**
     * Get pin element by ID (for compatibility)
     * @param {string} pinId
     * @returns {HTMLElement | null}
     */
    static getPin(pinId) {
        return PinDOMElement._pins.get(pinId) || null;
    }

    /**
     * Resolve sound path - accepts full path or blacksmith sound name
     * @param {string} sound - Full path or sound name (e.g., 'interface-ping-01' or 'modules/.../sound.mp3')
     * @returns {string} - Full sound path
     * @private
     */
    static _resolveSoundPath(sound) {
        if (!sound) return null;
        
        // If it's already a full path (starts with 'modules/' or 'http'), return as-is
        if (sound.startsWith('modules/') || sound.startsWith('http://') || sound.startsWith('https://') || sound.startsWith('/')) {
            return sound;
        }
        
        // Otherwise, treat as blacksmith sound name
        // Add .mp3 if not present
        const soundFile = sound.endsWith('.mp3') ? sound : `${sound}.mp3`;
        return `modules/${MODULE.ID}/sounds/${soundFile}`;
    }

    /**
     * Ping (animate) a pin to draw attention
     * @param {string} pinId
     * @param {Object} options
     * @param {string | string[]} options.animation - Animation type, or array of types to run in sequence (e.g. ['scale-large', 'ripple'] like built-in 'ping')
     * @param {number} [options.loops=1] - Number of times to loop animation (ignored when untilStopped is true)
     * @param {boolean} [options.broadcast=false] - If true, show to all users
     * @param {boolean} [options.untilStopped=false] - If true, run animation until controller.stop() is called; returns { stop, promise } instead of resolving when done
     * @param {string} [options.sound] - Sound path (full path or blacksmith sound name like 'interface-ping-01')
     * @returns {Promise<void> | Promise<{ stop: () => void, promise: Promise<void> }>}
     */
    static async ping(pinId, options = {}) {
        const { animation, loops = 1, broadcast = false, untilStopped = false, sound } = options;
        
        const validAnimations = [
            'ping', 'pulse', 'ripple', 'flash', 'glow', 'bounce',
            'scale-small', 'scale-medium', 'scale-large',
            'rotate', 'shake'
        ];
        
        const animations = Array.isArray(animation) ? animation : [animation];
        if (animations.length === 0 || !animations.every((a) => validAnimations.includes(a))) {
            const invalid = animations.find((a) => !validAnimations.includes(a));
            console.warn(`BLACKSMITH | PINS Invalid animation type: ${invalid ?? animation}. Valid types: ${validAnimations.join(', ')}`);
            return untilStopped ? Promise.resolve({ stop: () => {}, promise: Promise.resolve() }) : undefined;
        }
        
        const effectiveSound = sound ?? (animations.length === 1 && animations[0] === 'ping' ? 'interface-ping-01' : null);
        
        const pinElement = PinDOMElement._pins.get(pinId);
        if (!pinElement) {
            console.warn(`BLACKSMITH | PINS Cannot ping pin ${pinId}: pin element not found`);
            return untilStopped ? Promise.resolve({ stop: () => {}, promise: Promise.resolve() }) : undefined;
        }

        if (untilStopped) {
            const controller = new AbortController();
            const signal = controller.signal;
            const runLoop = async () => {
                try {
                    while (!signal.aborted) {
                        for (const anim of animations) {
                            if (signal.aborted) break;
                            await PinDOMElement._runOneAnimationStep(pinElement, anim, signal);
                        }
                    }
                } catch (e) {
                    if (e?.name !== 'AbortError') console.warn('BLACKSMITH | PINS Ping untilStopped error:', e);
                }
            };
            const promise = runLoop();
            if (effectiveSound && !signal.aborted) {
                try {
                    const soundPath = PinRenderer._resolveSoundPath(effectiveSound);
                    await foundry.audio.AudioHelper.play({ src: soundPath, volume: 0.8, loop: false }, false);
                } catch (err) {
                    console.warn(`BLACKSMITH | PINS Failed to play sound: ${effectiveSound}`, err);
                }
            }
            return Promise.resolve({
                stop: () => controller.abort(),
                promise
            });
        }
        
        // One-shot or fixed loops: run sequence loops times
        if (broadcast) {
            const { PinManager } = await import('./manager-pins.js');
            const userId = game.user?.id || '';
            const pinData = PinManager.get(pinId);
            
            if (!pinData || !this._canUserSeePin(pinData, userId, PinManager)) {
                console.warn(`BLACKSMITH | PINS Cannot broadcast ping for pin ${pinId}: user cannot view pin`);
            } else {
                const { SocketManager } = await import('./manager-sockets.js');
                const socket = SocketManager.getSocket();
                if (socket) {
                    socket.executeForOthers('pingPin', {
                        pinId,
                        animation: animations,
                        loops,
                        sound: effectiveSound || null
                    });
                } else {
                    console.warn('BLACKSMITH | PINS Socket not ready, broadcast ping not sent');
                }
            }
        }
        
        if (effectiveSound) {
            try {
                const soundPath = PinRenderer._resolveSoundPath(effectiveSound);
                await foundry.audio.AudioHelper.play({ src: soundPath, volume: 0.8, loop: false }, false);
            } catch (err) {
                console.warn(`BLACKSMITH | PINS Failed to play sound: ${effectiveSound}`, err);
            }
        }
        
        for (let L = 0; L < loops; L++) {
            for (const anim of animations) {
                await PinDOMElement._runOneAnimationStep(pinElement, anim, null);
            }
        }
    }

    /**
     * Cleanup on module unload
     */
    static cleanup() {
        this.clear();
        PinDOMElement.cleanup();
    }
}
