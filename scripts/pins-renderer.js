// ==================================================================
// ===== PINS-RENDERER – Visual rendering of pins on canvas ========
// ==================================================================
// Pure DOM approach: All pins rendered as HTML divs (circle + icon)
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { UIContextMenu } from './ui-context-menu.js';

/** @typedef {import('./manager-pins.js').PinData} PinData */

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
        const pinSizeScene = Math.min(pinData.size.w, pinData.size.h);
        const pinSizeScreen = pinSizeScene * scale;
        
        // Icon (FA symbol) size uses CSS variable --blacksmith-pin-icon-size-ratio (default 0.6 to match note panel)
        const ratioStr = typeof document !== 'undefined'
            ? getComputedStyle(document.documentElement).getPropertyValue('--blacksmith-pin-icon-size-ratio').trim()
            : '';
        const iconRatio = (parseFloat(ratioStr) || 0.6);
        const iconSizeScene = pinSizeScene * iconRatio;
        const iconSizeScreen = iconSizeScene * scale;
        
        // Center pin on screen coordinates
        const left = Math.round(screen.x - pinSizeScreen / 2);
        const top = Math.round(screen.y - pinSizeScreen / 2);
        
        return { left, top, width: pinSizeScreen, height: pinSizeScreen, iconSizeScreen, screen, scale };
    }

    /**
     * Create or update a pin DOM element
     * @param {string} pinId
     * @param {PinData} pinData
     */
    static createOrUpdatePin(pinId, pinData) {
        if (!this._isInitialized) this.initialize();
        
        let pinElement = this._pins.get(pinId);
        const { image, size, style = {} } = pinData;
        
        // Create new pin element if doesn't exist (base styles in pins.css)
        if (!pinElement) {
            pinElement = document.createElement('div');
            pinElement.className = 'blacksmith-pin';
            pinElement.dataset.pinId = pinId;
            // Start with correct opacity (will be positioned immediately)
            pinElement.style.opacity = String(pinData.style?.alpha ?? 1);
            
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
        
        // Update text layout for CSS
        const textLayout = pinData.textLayout || 'under';
        pinElement.dataset.textLayout = textLayout;
        
        // Update pin styling (background and border)
        // Support hex colors (#000000), RGBA (rgba(0, 0, 0, 0.5)), rgb, hsl, named colors, etc.
        // CSS natively accepts all these formats
        const fillColor = style?.fill || '#000000';
        const strokeColor = style?.stroke || '#ffffff';
        const strokeWidth = typeof style?.strokeWidth === 'number' ? style.strokeWidth : 2;
        const alpha = typeof style?.alpha === 'number' ? style.alpha : 1;
        
        // Apply colors - CSS supports: hex, rgb, rgba, hsl, hsla, named colors
        // For 'none' shape, don't apply background or border (icon only)
        if (shape !== 'none') {
            pinElement.style.backgroundColor = fillColor;
            pinElement.style.border = `${strokeWidth}px solid ${strokeColor}`;
        } else {
            pinElement.style.backgroundColor = 'transparent';
            pinElement.style.border = 'none';
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
        pinElement.style.opacity = String(alpha);
        
        // Update icon content (base styles in pins.css)
        // Get existing icon element and check current type
        let iconElement = pinElement.querySelector('.blacksmith-pin-icon');
        const currentIconType = iconElement?.dataset.iconType; // 'fa', 'image', or undefined
        
        // Determine new icon type
        const isFontAwesome = this._isFontAwesomeIcon(image);
        const newIconType = image 
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
        
        // Apply new icon/image based on type
        if (isFontAwesome && image) {
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
                // Image styles (background-size, cover, center) handled by CSS
                // Border radius not needed - image is clipped to pin shape by parent container
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
            
            // Check if screen coordinates are valid
            if (screen.x === 0 && screen.y === 0 && (pinData.x !== 0 || pinData.y !== 0)) {
                console.warn(`BLACKSMITH | PINS updatePosition: Invalid screen coordinates for ${pinId}`);
            }
            
            // Set position and size
            pinElement.style.left = `${left}px`;
            pinElement.style.top = `${top}px`;
            pinElement.style.width = `${width}px`;
            pinElement.style.height = `${height}px`;
            
            // Update icon size
            const iconElement = pinElement.querySelector('.blacksmith-pin-icon');
            if (iconElement) {
                // Check pinData to determine if it's Font Awesome or image
                const isFontAwesome = this._isFontAwesomeIcon(pinData.image);
                if (isFontAwesome && pinData.image) {
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
                    // Don't set width/height here - CSS handles it (100% fill)
                    iconElement.style.borderRadius = ''; // No border radius - pin shape handles clipping
                    iconElement.style.overflow = ''; // Not needed - parent clips
                }
            }
            
            // Update border width to scale with zoom
            const baseStrokeWidth = typeof pinData.style?.strokeWidth === 'number' ? pinData.style.strokeWidth : 2;
            const scaledStrokeWidth = baseStrokeWidth * scale;
            const strokeColor = pinData.style?.stroke || '#ffffff';
            const shape = pinData.shape || 'circle';
            if (shape !== 'none') {
                pinElement.style.border = `${scaledStrokeWidth}px solid ${strokeColor}`;
            }
            
            // Update text size based on scale setting
            const textElement = pinElement.querySelector('.blacksmith-pin-text');
            if (textElement) {
                const textLayout = pinData.textLayout || 'under';
                const baseTextSize = parseFloat(textElement.dataset.baseTextSize) || pinData.textSize || 12;
                
                // "around" layout always scales with pin
                if (textLayout === 'around') {
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
                        // Pass the pinElement to get current screen size, not just pinData
                        this._createCurvedText(textElement, originalText, pinData, pinElement);
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
            
            // Update opacity to match style
            pinElement.style.opacity = String(pinData.style?.alpha ?? 1);
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
                pinElement.style.opacity = String(pinData.style?.alpha ?? 1);
                
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
                    pinElement.style.opacity = String(pinData.style?.alpha ?? 1);
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
        
        // GM zone: bulk delete options (only when user is GM)
        if (game.user?.isGM) {
            const allPins = PinManager.list({ sceneId: canvas?.scene?.id });
            const pinTypes = new Set();
            for (const pin of allPins) {
                pinTypes.add(pin.type || 'default');
            }
            const currentPinType = pinData.type || 'default';
            if (pinTypes.size > 0) {
                gmItems.push({
                    name: `Delete All "${currentPinType}" Pins`,
                    icon: '<i class="fa-solid fa-trash-can"></i>',
                    callback: async () => {
                        try {
                            const confirmed = await Dialog.confirm({
                                title: 'Delete All Pins of Type',
                                content: `<p>Are you sure you want to delete all pins of type "<strong>${currentPinType}</strong>" on this scene?</p><p>This action cannot be undone.</p>`,
                                yes: () => true,
                                no: () => false,
                                defaultYes: false
                            });
                            if (confirmed) {
                                const { PinManager } = await import('./manager-pins.js');
                                const count = await PinManager.deleteAllByType(currentPinType);
                                ui.notifications.info(`Deleted ${count} pin${count !== 1 ? 's' : ''} of type "${currentPinType}".`);
                            }
                        } catch (err) {
                            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error deleting pins by type', err?.message || err, false, true);
                        }
                    }
                });
            }
            gmItems.push({
                name: 'Delete All Pins',
                icon: '<i class="fa-solid fa-trash"></i>',
                callback: async () => {
                    try {
                        const confirmed = await Dialog.confirm({
                            title: 'Delete All Pins',
                            content: '<p>Are you sure you want to delete <strong>ALL</strong> pins on this scene?</p><p>This action cannot be undone.</p>',
                            yes: () => true,
                            no: () => false,
                            defaultYes: false
                        });
                        if (confirmed) {
                            const { PinManager } = await import('./manager-pins.js');
                            const count = await PinManager.deleteAll();
                            ui.notifications.info(`Deleted ${count} pin${count !== 1 ? 's' : ''}.`);
                        }
                    } catch (err) {
                        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error deleting all pins', err?.message || err, false, true);
                    }
                }
            });
        }
        
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
            
            // For "around" layout, create curved text using individual characters
            if (textLayout === 'around') {
                // Store original text for recalculation on zoom/scroll
                textElement.dataset.originalText = displayText;
                // Pass pinElement to ensure we use current screen size
                this._createCurvedText(textElement, displayText, pinData, pinElement);
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
        // Exception: "around" layout always uses fixed size (ignores scale setting)
        const textScaleWithPin = (textLayout === 'around') ? true : (pinData.textScaleWithPin !== false); // Default to true; "around" always scales
        textElement.dataset.textScaleWithPin = String(textScaleWithPin);
        
        if (textScaleWithPin) {
            // Will be scaled in updatePosition based on zoom level
            // For now, use base size (will be updated on next position update)
            textElement.style.fontSize = `${textSize}px`;
        } else {
            // Fixed size - don't scale (used for "around" layout and when textScaleWithPin is false)
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
  
    // Clear existing content
    textElement.innerHTML = "";
  
    // Get current pin size in screen pixels (for accurate positioning)
    if (!pinElement) pinElement = textElement.closest(".blacksmith-pin");
    if (!pinElement) return;
  
    // Always use the current screen size from the pin element (not pinData which has scene coordinates)
    const pinWidth = parseFloat(pinElement.style.width) || Math.min(pinData.size.w, pinData.size.h);
    const pinHeight = parseFloat(pinElement.style.height) || Math.min(pinData.size.w, pinData.size.h);
    const pinSize = Math.min(pinWidth, pinHeight);
  
    // Get border width to position text just outside
    const borderWidth = parseFloat(pinElement.style.borderWidth) || (pinData.style?.strokeWidth || 2);
  
    // Use current rendered text size so "around" scales with zoom
    const computedFontSize = parseFloat(window.getComputedStyle(textElement).fontSize);
    const textSize =
      Number.isFinite(computedFontSize) && computedFontSize > 0
        ? computedFontSize
        : (parseFloat(textElement.dataset.baseTextSize) || pinData.textSize || 12);
  
    // Create a temporary element to measure text width and height
    const measureEl = document.createElement("span");
    measureEl.style.position = "absolute";
    measureEl.style.visibility = "hidden";
    measureEl.style.whiteSpace = "nowrap";
    measureEl.style.fontSize = `${textSize}px`;
    measureEl.style.fontWeight = "bold";
  
    // Match font family if possible
    const computedStyle = window.getComputedStyle(textElement);
    measureEl.style.fontFamily = computedStyle.fontFamily;
    document.body.appendChild(measureEl);
  
    // Measure text height to position baseline correctly
    measureEl.textContent = "M";
    const textHeight = measureEl.offsetHeight;
    const lineGap = 2;
    const lineOffset = textHeight + lineGap; // Per-line vertical step for multi-line "around"
    const offset = textHeight; // Offset from pin edge by roughly one line height
  
    // Chars per line for "around": break into lines; each line gets its own arc (outer radius increases per line)
    const textMaxWidth = Number(pinData?.textMaxWidth) || 0;
    const lines = textMaxWidth > 0 ? this._breakTextIntoLines(text, textMaxWidth) : [text];
  
    // Spacing
    const letterSpacing = 2; // px between letters
    const wordSpacing = 8;   // px for spaces
  
    // In DOM coords: 0° = right, 90° = down, 180° = left, 270° = up
    const centerAngle = position === "above" ? 270 : 90;
  
    // For LTR reading:
    // - Bottom arc (center 90): must DECREASE angle to go left->right.
    // - Top arc (center 270): must INCREASE angle to go left->right.
    const direction = position === "above" ? +1 : -1;
  
    lines.forEach((line, lineIndex) => {
      const chars = line.split("");
      if (chars.length === 0) return;
  
      // Radius for this line: first line at base, each additional line further out
      const radius = (pinSize / 2) + borderWidth + offset + (lineIndex * lineOffset);
  
      // Measure total text width with spacing (for centering)
      let totalTextWidth = 0;
      chars.forEach((char, index) => {
        if (char === " ") {
          totalTextWidth += wordSpacing;
        } else {
          measureEl.textContent = char;
          totalTextWidth += measureEl.offsetWidth;
        }
        if (index < chars.length - 1) totalTextWidth += letterSpacing;
      });
  
      const totalArcAngle = (totalTextWidth / radius) * (180 / Math.PI);
      const anglePerPixel = 180 / (Math.PI * radius);
  
      // Start on the left side of the arc and walk to the right.
      // Left edge is center - totalArc/2 for increasing traversal,
      // or center + totalArc/2 for decreasing traversal.
      const startAngle = direction === +1
        ? (centerAngle - (totalArcAngle / 2))
        : (centerAngle + (totalArcAngle / 2));
  
      let currentAngle = startAngle;
  
      chars.forEach((char, index) => {
        let charWidth = 0;
        let charAngleSpan = 0;
  
        if (char === " ") {
          charWidth = wordSpacing;
          charAngleSpan = wordSpacing * anglePerPixel;
        } else {
          measureEl.textContent = char;
          charWidth = measureEl.offsetWidth;
          charAngleSpan = charWidth * anglePerPixel;
        }
  
        // Midpoint for the glyph on the arc, respecting traversal direction
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
  
          // Push glyph outward from the arc a bit
          const radialOffset = charHeight / 2;
          const xAdjusted = x - Math.cos(angleRad) * radialOffset;
          const yAdjusted = y - Math.sin(angleRad) * radialOffset;
  
          // Tangent rotation should follow traversal direction:
          // - If direction is +1 (increasing angles), tangent is angle + 90
          // - If direction is -1 (decreasing angles), tangent is angle - 90
          const rotationDeg = charAngle + (direction * 90);
  
          span.style.transform = `
            translate(calc(-50% + ${xAdjusted}px), calc(-50% + ${yAdjusted}px))
            rotate(${rotationDeg}deg)
          `.trim();
  
          span.style.transformOrigin = "center center";
  
          textElement.appendChild(span);
        }
  
        // Advance along the arc
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
     * Play standard animation (pulse, flash, glow, bounce, scale, rotate, shake)
     * @param {HTMLElement} pinElement
     * @param {string} animation
     * @param {number} loops
     * @private
     */
    static async _pingStandard(pinElement, animation, loops) {
        const className = `blacksmith-pin-animate-${animation}`;
        
        // Get animation duration from CSS (computed style after class is applied)
        pinElement.classList.add(className);
        const style = window.getComputedStyle(pinElement);
        const animationDuration = parseFloat(style.animationDuration) || 0.8; // fallback to 0.8s
        const durationMs = animationDuration * 1000;
        pinElement.classList.remove(className);
        
        for (let i = 0; i < loops; i++) {
            // Add animation class
            pinElement.classList.add(className);
            
            // Wait for animation to complete
            await new Promise(resolve => setTimeout(resolve, durationMs));
            
            // Remove animation class
            pinElement.classList.remove(className);
            
            // Small delay between loops
            if (i < loops - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    /**
     * Play ripple animation (creates expanding circle element)
     * @param {HTMLElement} pinElement
     * @param {number} loops
     * @private
     */
    static async _pingRipple(pinElement, loops) {
        const pinRect = pinElement.getBoundingClientRect();
        const centerX = pinRect.left + pinRect.width / 2;
        const centerY = pinRect.top + pinRect.height / 2;
        const pinSize = Math.max(pinRect.width, pinRect.height); // Use larger dimension
        
        // Get pin color for ripple
        const pinColor = pinElement.style.borderColor || pinElement.style.backgroundColor || '#ffffff';
        
        const durationMs = 1000; // ripple animation is 1s
        
        for (let i = 0; i < loops; i++) {
            // Create ripple element
            const ripple = document.createElement('div');
            ripple.className = 'blacksmith-pin-ripple';
            ripple.style.left = `${centerX}px`;
            ripple.style.top = `${centerY}px`;
            ripple.style.transform = 'translate(-50%, -50%)';
            ripple.style.borderColor = pinColor;
            ripple.style.color = pinColor;
            // Set initial size to match pin size (start at edge)
            ripple.style.setProperty('--pin-size', `${pinSize}px`);
            
            // Add to pin's parent container
            if (this._container) {
                this._container.appendChild(ripple);
            }
            
            // Wait for animation to complete
            await new Promise(resolve => setTimeout(resolve, durationMs));
            
            // Remove ripple element
            ripple.remove();
            
            // Small delay between loops
            if (i < loops - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
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
                
                if (!pinData || !PinManager._canView(pinData, userId)) {
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
                    
                    if (!pinData || !PinManager._canView(pinData, userId)) {
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
            const visiblePins = pins.filter(pin => PinManager._canView(pin, userId));

            for (const pinData of visiblePins) {
                await this._addPin(pinData);
            }
            
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
    }

    /**
     * Update an existing pin
     * @param {PinData} pinData
     */
    static async updatePin(pinData) {
        // Check visibility before updating
        const { PinManager } = await import('./manager-pins.js');
        const userId = game.user?.id || '';
        
        if (PinManager._canView(pinData, userId)) {
            // User can see the pin - create or update it
            PinDOMElement.createOrUpdatePin(pinData.id, pinData);
        } else {
            // User can no longer see the pin - remove it if it exists
            if (PinDOMElement._pins.has(pinData.id)) {
                PinDOMElement.removePin(pinData.id);
            }
        }
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
     * @param {string} options.animation - Animation type (pulse, ripple, flash, glow, bounce, scale-small, scale-medium, scale-large, rotate, shake)
     * @param {number} [options.loops=1] - Number of times to loop animation
     * @param {boolean} [options.broadcast=false] - If true, show to all users (not yet implemented)
     * @param {string} [options.sound] - Sound path (full path or blacksmith sound name like 'interface-ping-01')
     * @returns {Promise<void>}
     */
    static async ping(pinId, options = {}) {
        const { animation, loops = 1, broadcast = false, sound } = options;
        
        // Validate animation type
        const validAnimations = [
            'ping', 'pulse', 'ripple', 'flash', 'glow', 'bounce',
            'scale-small', 'scale-medium', 'scale-large',
            'rotate', 'shake'
        ];
        
        if (!animation || !validAnimations.includes(animation)) {
            console.warn(`BLACKSMITH | PINS Invalid animation type: ${animation}. Valid types: ${validAnimations.join(', ')}`);
            return;
        }
        
        // Handle 'ping' as a special combo animation
        if (animation === 'ping') {
            // Execute combo: scale-large with sound, then ripple
            await this.ping(pinId, { 
                animation: 'scale-large', 
                loops: 1,
                sound: sound || 'interface-ping-01',
                broadcast
            });
            await this.ping(pinId, { 
                animation: 'ripple', 
                loops: 1,
                broadcast
            });
            return;
        }
        
        // Handle broadcast to all users
        if (broadcast) {
            // Check if user can see the pin (required for broadcast)
            const { PinManager } = await import('./manager-pins.js');
            const userId = game.user?.id || '';
            const pinData = PinManager.get(pinId);
            
            if (!pinData || !PinManager._canView(pinData, userId)) {
                console.warn(`BLACKSMITH | PINS Cannot broadcast ping for pin ${pinId}: user cannot view pin`);
                return;
            }
            
            // Emit socket event to all other users
            const { SocketManager } = await import('./manager-sockets.js');
            const socket = SocketManager.getSocket();
            
            if (socket) {
                // Use executeForOthers directly since handler is registered with SocketLib directly
                socket.executeForOthers('pingPin', {
                    pinId,
                    animation,
                    loops,
                    sound: sound || null
                });
            } else {
                console.warn('BLACKSMITH | PINS Socket not ready, broadcast ping not sent');
            }
            
            // Also animate locally for the sender
            // Fall through to local animation (don't return)
        }
        
        // Play sound if provided
        if (sound) {
            try {
                const soundPath = PinRenderer._resolveSoundPath(sound);
                await AudioHelper.play({ src: soundPath, volume: 0.8, loop: false }, false);
            } catch (err) {
                console.warn(`BLACKSMITH | PINS Failed to play sound: ${sound}`, err);
            }
        }
        
        // Get pin element
        const pinElement = PinDOMElement._pins.get(pinId);
        if (!pinElement) {
            console.warn(`BLACKSMITH | PINS Cannot ping pin ${pinId}: pin element not found`);
            return;
        }
        
        // Ripple is special - creates a separate element
        if (animation === 'ripple') {
            await PinDOMElement._pingRipple(pinElement, loops);
        } else {
            await PinDOMElement._pingStandard(pinElement, animation, loops);
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
