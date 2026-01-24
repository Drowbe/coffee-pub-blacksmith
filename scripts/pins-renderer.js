// ==================================================================
// ===== PINS-RENDERER – Visual rendering of pins on canvas ========
// ==================================================================
// Pure DOM approach: All pins rendered as HTML divs (circle + icon)
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

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
        
        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS DOM overlay container created', `z-index: ${container.style.zIndex}, parent: ${container.parentElement?.tagName}`, true, false);

        // Hook into canvas pan to update positions
        Hooks.on('canvasPan', () => {
            this._scheduleUpdate();
        });
        
        Hooks.on('updateScene', () => {
            // When scene changes, load pins for the new scene
            this._scheduleSceneLoad();
        });
        Hooks.on('canvasReady', () => {
            // When canvas becomes ready, load pins for current scene and update positions
            this._scheduleSceneLoad();
        });
        
        // Update on window resize
        window.addEventListener('resize', () => this._scheduleUpdate());
        
        this._isInitialized = true;
        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS DOM pin system initialized', '', true, false);
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
            
            // Use PIXI's coordinate conversion: create a point in scene space and convert to global (screen) space
            const scenePoint = new PIXI.Point(sceneX, sceneY);
            const globalPoint = stage.toGlobal(scenePoint);
            
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
        
        // Icon size is 60% of pin size
        const iconSizeScene = pinSizeScene * 0.6;
        const iconSizeScreen = iconSizeScene * scale;
        
        // Center pin on screen coordinates
        const left = Math.round(screen.x - pinSizeScreen / 2);
        const top = Math.round(screen.y - pinSizeScreen / 2);
        
        return { left, top, width: pinSizeScreen, height: pinSizeScreen, iconSizeScreen, screen };
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
        const iconElement = pinElement.querySelector('.blacksmith-pin-icon') || document.createElement('div');
        if (!pinElement.contains(iconElement)) {
            iconElement.className = 'blacksmith-pin-icon';
            pinElement.appendChild(iconElement);
        }
        
        // Check if it's Font Awesome or an image URL
        const isFontAwesome = this._isFontAwesomeIcon(image);
        
        if (isFontAwesome && image) {
            // Font Awesome icon
            const faClasses = this._extractFontAwesomeClasses(image);
            if (faClasses) {
                iconElement.innerHTML = `<i class="${faClasses}"></i>`;
                iconElement.style.color = '#ffffff';
                iconElement.style.background = 'none';
                iconElement.style.border = 'none';
                iconElement.style.backgroundImage = 'none'; // Clear any previous image
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
                iconElement.innerHTML = ''; // Clear Font Awesome icon
                iconElement.style.backgroundImage = `url(${imageUrl})`;
                // Image styles (background-size, border-radius, overflow) handled by CSS
                // But we need to ensure the class selector matches
                iconElement.style.color = ''; // Clear Font Awesome color
                // Border radius for images - use CSS variable (handled by CSS)
                iconElement.style.borderRadius = '50%';
                iconElement.style.overflow = 'hidden';
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
        
        postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Pin DOM element created for pin ${pinId}`, `Image: ${image || 'none'}, Canvas ready: ${canvas?.ready}`, true, false);
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
            console.log(`BLACKSMITH | PINS updatePosition: Canvas not ready for ${pinId}`);
            return;
        }

        try {
            // Use unified calculation function
            const { left, top, width, height, iconSizeScreen, screen } = this._calculatePinPosition(pinElement, pinData);
            
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
                    // Image URL - size controlled by CSS variable --icon-size-ratio
                    // CSS handles width/height via calc(100% * var(--icon-size-ratio))
                    iconElement.style.fontSize = '';
                    // Don't set width/height here - let CSS handle it via the variable
                    iconElement.style.borderRadius = '50%'; // Circular clipping for images
                    iconElement.style.overflow = 'hidden'; // Clip to circle
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

        console.log(`BLACKSMITH | PINS updateAllPositions: Updating ${this._pins.size} pin(s) using unified calculation`);

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
            console.log(`BLACKSMITH | PINS updateAllPositions: Updated ${updated} pin(s) using unified calculation`);
        }).catch(err => {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error updating pin positions', err?.message || String(err), false, false);
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
            PinManager._invokeHandlers('hoverIn', freshPinData, sceneId, userId, modifiers, e);
        });
        
        pinElement.addEventListener('mouseleave', async (e) => {
            const { PinManager } = await import('./manager-pins.js');
            const freshPinData = PinManager.get(pinId) || pinData;
            const modifiers = this._extractModifiers(e);
            const sceneId = canvas?.scene?.id || '';
            const userId = game.user?.id || '';
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
        const startSceneFromScreen = canvas.stage.toLocal(new PIXI.Point(startScreenRelative.x, startScreenRelative.y));
        
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
                const currentSceneFromScreen = canvas.stage.toLocal(new PIXI.Point(currentScreenRelative.x, currentScreenRelative.y));
                
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
                    finalScene = canvas.stage.toLocal(new PIXI.Point(currentScreenRelative.x, currentScreenRelative.y));
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
        
        const menuItems = [];
        
        // Get registered context menu items (filtered by moduleId, visible, etc.)
        const registeredItems = PinManager.getContextMenuItems(pinData, userId);
        for (const item of registeredItems) {
            menuItems.push({
                name: item.name,
                icon: item.icon,
                callback: item.onClick
            });
        }
        
        // Add separator if module commands exist
        if (registeredItems.length > 0) {
            menuItems.push({ separator: true });
        }
        
        // Add default universal items (after registered items)
        
        // Bring Players Here (available to all users) - pan all players and ping
        menuItems.push({
            name: 'Bring Players Here',
            icon: '<i class="fa-solid fa-users-viewfinder"></i>',
            callback: async () => {
                try {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) {
                        // Pan all players to this pin with ping animation (broadcast)
                        await pinsAPI.panTo(pinData.id, { 
                            broadcast: true,
                            ping: { animation: 'ping', loops: 1 }
                        });
                    } else {
                        console.warn('BLACKSMITH | PINS Ping API not available');
                    }
                } catch (err) {
                    postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error bringing players to pin', err?.message || err, false, true);
                }
            }
        });
        
        // Ping Pin (available to all users) - local ping only
        menuItems.push({
            name: 'Ping Pin',
            icon: '<i class="fa-solid fa-bell"></i>',
            callback: async () => {
                try {
                    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                    if (pinsAPI) {
                        // Use 'ping' animation type (combo of scale-large + ripple with sound)
                        await pinsAPI.ping(pinData.id, { animation: 'ping', loops: 1 });
                    } else {
                        console.warn('BLACKSMITH | PINS Ping API not available');
                    }
                } catch (err) {
                    postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error pinging pin', err?.message || err, false, true);
                }
            }
        });
        
        // Delete pin (if user can delete)
        if (canDelete) {
            menuItems.push({
                name: 'Delete Pin',
                icon: '<i class="fa-solid fa-trash"></i>',
                callback: async () => {
                    try {
                        const { PinManager } = await import('./manager-pins.js');
                        await PinManager.delete(pinData.id);
                        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Pin deleted', pinData.id, true, false);
                    } catch (err) {
                        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error deleting pin', err?.message || err, false, true);
                    }
                }
            });
        }
        
        // Ping animations (for testing - all animation types)
        const animations = [
            { name: 'Bounce', animation: 'bounce', icon: '<i class="fa-solid fa-arrow-up-short-wide"></i>' },
            { name: 'Pulse', animation: 'pulse', icon: '<i class="fa-solid fa-heart-pulse"></i>' },
            { name: 'Ripple', animation: 'ripple', icon: '<i class="fa-solid fa-water"></i>' },
            { name: 'Flash', animation: 'flash', icon: '<i class="fa-solid fa-bolt"></i>' },
            { name: 'Glow', animation: 'glow', icon: '<i class="fa-solid fa-sun"></i>' },
            { name: 'Scale Small', animation: 'scale-small', icon: '<i class="fa-solid fa-magnifying-glass"></i>' },
            { name: 'Scale Medium', animation: 'scale-medium', icon: '<i class="fa-solid fa-magnifying-glass-plus"></i>' },
            { name: 'Scale Large', animation: 'scale-large', icon: '<i class="fa-solid fa-expand"></i>' },
            { name: 'Rotate', animation: 'rotate', icon: '<i class="fa-solid fa-rotate"></i>' },
            { name: 'Shake', animation: 'shake', icon: '<i class="fa-solid fa-shake"></i>' }
        ];
        
        for (const anim of animations) {
            menuItems.push({
                name: anim.name,
                icon: anim.icon,
                callback: async () => {
                    try {
                        const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
                        if (pinsAPI) {
                            await pinsAPI.ping(pinData.id, { 
                                animation: anim.animation
                            });
                        } else {
                            console.warn('BLACKSMITH | PINS Ping API not available');
                        }
                    } catch (err) {
                        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error pinging pin', err?.message || err, false, true);
                    }
                }
            });
        }
        
        if (menuItems.length > 0) {
            this._renderContextMenu(menuItems, menuX, menuY);
        }
    }

    /**
     * Render context menu at screen coordinates
     * @param {Array} menuItems
     * @param {number} x
     * @param {number} y
     * @private
     */
    static _renderContextMenu(menuItems, x, y) {
        const existing = document.getElementById('blacksmith-pin-context-menu');
        if (existing) {
            existing.remove();
        }
        
        const menu = document.createElement('div');
        menu.id = 'blacksmith-pin-context-menu';
        menu.className = 'context-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.zIndex = '10000';
        menu.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        menu.style.border = '1px solid #666';
        menu.style.borderRadius = '4px';
        menu.style.padding = '4px';
        menu.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.5)';
        menu.style.minWidth = '150px';
        
        menuItems.forEach(item => {
            // Handle separator
            if (item.separator) {
                const separator = document.createElement('div');
                separator.style.height = '1px';
                separator.style.backgroundColor = '#666';
                separator.style.margin = '4px 0';
                menu.appendChild(separator);
                return;
            }
            
            const menuItem = document.createElement('div');
            menuItem.className = 'context-menu-item';
            menuItem.style.padding = '6px 12px';
            menuItem.style.cursor = 'pointer';
            menuItem.style.color = '#fff';
            menuItem.style.display = 'flex';
            menuItem.style.alignItems = 'center';
            menuItem.style.gap = '8px';
            menuItem.innerHTML = `${item.icon} ${item.name}`;
            
            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            });
            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.backgroundColor = 'transparent';
            });
            menuItem.addEventListener('click', () => {
                item.callback();
                menu.remove();
            });
            
            menu.appendChild(menuItem);
        });
        
        document.body.appendChild(menu);
        
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
                document.removeEventListener('keydown', closeOnEscape);
            }
        };
        
        const closeOnEscape = (e) => {
            if (e.key === 'Escape') {
                menu.remove();
                document.removeEventListener('click', closeMenu);
                document.removeEventListener('keydown', closeOnEscape);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
            document.addEventListener('keydown', closeOnEscape);
        }, 10);
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
        this.clear();
        if (this._container) {
            this._container.remove();
            this._container = null;
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
        
        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Renderer initialized', '', true, false);
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
                await PinDOMElement.ping(pinId, {
                    animation,
                    loops: loops || 1,
                    sound: sound || null,
                    broadcast: false // Prevent infinite loop
                });
                
                postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Received broadcast ping from ${senderId}`, { pinId, animation }, true, false);
            });
            
            // Register handler for receiving broadcast panTo (Bring Players Here)
            socket.register('panToPin', async (data, senderId) => {
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
                
                postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Received broadcast panTo from ${senderId}`, { pinId }, true, false);
            });
            
            this._socketRegistered = true;
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Socket handlers registered', '', true, false);
            
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

            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Loading ${visiblePins.length}/${pins.length} visible pin(s) for scene`, sceneId, true, false);

            for (const pinData of visiblePins) {
                await this._addPin(pinData);
            }

            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Loaded ${visiblePins.length} pin(s) for scene`, sceneId, true, false);
            
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
                postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Pin ${pinData.id} removed (no longer visible)`, '', true, false);
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
                socket.emit('pingPin', {
                    pinId,
                    animation,
                    loops,
                    sound: sound || null
                });
                postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Broadcast ping to all users`, { pinId, animation }, true, false);
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




