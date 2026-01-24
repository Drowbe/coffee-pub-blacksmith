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

        // Hook into canvas pan/zoom to update positions
        // Hide all pins during pan/zoom for performance, show at end
        let panZoomTimeout = null;
        Hooks.on('canvasPan', () => {
            // Hide all pins immediately when panning starts
            this._hideAllPins();
            // Clear any pending update
            if (this._updateThrottle) {
                cancelAnimationFrame(this._updateThrottle);
                this._updateThrottle = null;
            }
            // Clear any pending show timeout
            if (panZoomTimeout) {
                clearTimeout(panZoomTimeout);
            }
            // Show and update after pan stops (debounce with delay to let canvas settle)
            panZoomTimeout = setTimeout(() => {
                this._showAllPins();
                // Additional small delay before updating positions to ensure canvas is fully settled
                setTimeout(() => {
                    this._scheduleUpdate();
                }, 50);
                panZoomTimeout = null;
            }, 150);
        });
        
        // Also handle zoom (canvasPan might not fire for zoom)
        Hooks.on('canvasInit', () => {
            if (canvas?.controls) {
                const originalZoomIn = canvas.controls.zoomIn;
                const originalZoomOut = canvas.controls.zoomOut;
                if (originalZoomIn) {
                    canvas.controls.zoomIn = function(...args) {
                        PinDOMElement._hideAllPins();
                        if (panZoomTimeout) clearTimeout(panZoomTimeout);
                        panZoomTimeout = setTimeout(() => {
                            PinDOMElement._showAllPins();
                            setTimeout(() => {
                                PinDOMElement._scheduleUpdate();
                            }, 50);
                            panZoomTimeout = null;
                        }, 150);
                        return originalZoomIn.apply(this, args);
                    };
                }
                if (originalZoomOut) {
                    canvas.controls.zoomOut = function(...args) {
                        PinDOMElement._hideAllPins();
                        if (panZoomTimeout) clearTimeout(panZoomTimeout);
                        panZoomTimeout = setTimeout(() => {
                            PinDOMElement._showAllPins();
                            setTimeout(() => {
                                PinDOMElement._scheduleUpdate();
                            }, 50);
                            panZoomTimeout = null;
                        }, 150);
                        return originalZoomOut.apply(this, args);
                    };
                }
            }
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
     * Hide all pins (for performance during pan/zoom) - just hide, no fade
     */
    static _hideAllPins() {
        for (const pin of this._pins.values()) {
            pin.style.visibility = 'hidden';
            pin.style.opacity = '0';
        }
    }

    /**
     * Show all pins (after pan/zoom) - show immediately, no fade
     */
    static _showAllPins() {
        // Pins will be shown when updatePosition is called
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
        
        // Create new pin element if doesn't exist
        if (!pinElement) {
            pinElement = document.createElement('div');
            pinElement.className = 'blacksmith-pin';
            pinElement.dataset.pinId = pinId;
            pinElement.style.position = 'absolute';
            pinElement.style.pointerEvents = 'auto';
            pinElement.style.display = 'flex'; // Always flex for layout
            pinElement.style.alignItems = 'center';
            pinElement.style.justifyContent = 'center';
            pinElement.style.transformOrigin = 'center center';
            pinElement.style.visibility = 'hidden'; // Start hidden - will fade in after correct position is calculated
            pinElement.style.opacity = '0'; // Start transparent for fade-in
            pinElement.style.borderRadius = '50%';
            pinElement.style.boxSizing = 'border-box';
            pinElement.style.transition = 'opacity 0.2s ease-in-out, visibility 0.2s ease-in-out'; // Smooth fade transition
            pinElement.style.cursor = 'pointer'; // Show pointer cursor on hover
            
            // Set up event listeners
            this._setupEventListeners(pinElement, pinData);
            
            this._container.appendChild(pinElement);
            this._pins.set(pinId, pinElement);
        } else {
            // Existing pin - keep visible, will update position smoothly
        }

        // Update pin styling (circle background)
        // Support hex colors (#000000), RGBA (rgba(0, 0, 0, 0.5)), rgb, hsl, named colors, etc.
        // CSS natively accepts all these formats
        const fillColor = style?.fill || '#000000';
        const strokeColor = style?.stroke || '#ffffff';
        const strokeWidth = typeof style?.strokeWidth === 'number' ? style.strokeWidth : 2;
        const alpha = typeof style?.alpha === 'number' ? style.alpha : 1;
        
        // Apply colors - CSS supports: hex, rgb, rgba, hsl, hsla, named colors
        pinElement.style.backgroundColor = fillColor;
        pinElement.style.border = `${strokeWidth}px solid ${strokeColor}`;
        
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
            
            // Force a reflow to ensure position is applied
            void pinElement.offsetWidth;
            
            // Fade in the pin if it's currently hidden (only on first creation)
            if (pinElement.style.visibility === 'hidden' || pinElement.style.opacity === '0') {
                pinElement.style.visibility = 'visible';
                // Use requestAnimationFrame to ensure smooth fade-in transition
                requestAnimationFrame(() => {
                    pinElement.style.opacity = String(pinData.style?.alpha ?? 1);
                });
            } else {
                // Already visible - just update opacity to match style (no fade)
                pinElement.style.opacity = String(pinData.style?.alpha ?? 1);
            }
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
        // Hover events (transform handled by CSS :hover)
        pinElement.addEventListener('mouseenter', (e) => {
            import('./manager-pins.js').then(({ PinManager }) => {
                const modifiers = this._extractModifiers(e);
                const sceneId = canvas?.scene?.id || '';
                const userId = game.user?.id || '';
                PinManager._invokeHandlers('hoverIn', pinData, sceneId, userId, modifiers, e);
            }).catch(() => {});
        });
        
        pinElement.addEventListener('mouseleave', (e) => {
            import('./manager-pins.js').then(({ PinManager }) => {
                const modifiers = this._extractModifiers(e);
                const sceneId = canvas?.scene?.id || '';
                const userId = game.user?.id || '';
                PinManager._invokeHandlers('hoverOut', pinData, sceneId, userId, modifiers, e);
            }).catch(() => {});
        });
        
        // Click events
        pinElement.addEventListener('mousedown', (e) => {
            const button = e.button;
            const modifiers = this._extractModifiers(e);
            const sceneId = canvas?.scene?.id || '';
            const userId = game.user?.id || '';
            
            if (button === 0) {
                // Left click - check if it's a drag or click
                import('./manager-pins.js').then(({ PinManager }) => {
                    if (PinManager._canEdit(pinData, userId)) {
                        this._startPotentialDrag(pinElement, pinData, e);
                    } else {
                        PinManager._invokeHandlers('click', pinData, sceneId, userId, modifiers, e);
                    }
                }).catch(() => {});
            } else if (button === 2) {
                // Right click
                e.preventDefault();
                import('./manager-pins.js').then(({ PinManager }) => {
                    PinManager._invokeHandlers('rightClick', pinData, sceneId, userId, modifiers, e);
                    this._showContextMenu(pinElement, pinData, e);
                }).catch(() => {});
            } else if (button === 1) {
                // Middle click
                import('./manager-pins.js').then(({ PinManager }) => {
                    PinManager._invokeHandlers('middleClick', pinData, sceneId, userId, modifiers, e);
                }).catch(() => {});
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
     * @param {PinData} pinData
     * @param {MouseEvent} event
     * @private
     */
    static _startPotentialDrag(pinElement, pinData, event) {
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
        const DRAG_THRESHOLD = 5; // pixels in scene space
        
        // Prevent Foundry selection box
        if (canvas.controls) {
            canvas.controls.activeControl = null;
        }
        
        const onDragMove = (e) => {
            if (signal.aborted) return;
            
            const currentScreenX = e.clientX;
            const currentScreenY = e.clientY;
            const currentScreenRelative = {
                x: currentScreenX - canvasRect.left,
                y: currentScreenY - canvasRect.top
            };
            const currentSceneFromScreen = canvas.stage.toLocal(new PIXI.Point(currentScreenRelative.x, currentScreenRelative.y));
            
            const deltaX = currentSceneFromScreen.x - startSceneFromScreen.x;
            const deltaY = currentSceneFromScreen.y - startSceneFromScreen.y;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            if (!dragStarted && distance > DRAG_THRESHOLD) {
                dragStarted = true;
                pinElement.style.opacity = '0.7';
                
                import('./manager-pins.js').then(({ PinManager }) => {
                    const modifiers = this._extractModifiers(e);
                    const sceneId = canvas?.scene?.id || '';
                    const userId = game.user?.id || '';
                    PinManager._invokeHandlers('dragStart', pinData, sceneId, userId, modifiers, e);
                }).catch(() => {});
            }
            
            if (dragStarted) {
                const newX = startScenePos.x + deltaX;
                const newY = startScenePos.y + deltaY;
                
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
            
            if (dragStarted) {
                pinElement.style.opacity = String(pinData.style?.alpha ?? 1);
                
                // Get final position from pin element
                const finalScreen = this._sceneToScreen(pinData.x, pinData.y);
                const canvasElement = canvas.app?.renderer?.view || canvas.app?.canvas || canvas.canvas;
                const canvasRect = canvasElement.getBoundingClientRect();
                const finalScreenRelative = {
                    x: finalScreen.x - canvasRect.left,
                    y: finalScreen.y - canvasRect.top
                };
                const finalScene = canvas.stage.toLocal(new PIXI.Point(finalScreenRelative.x, finalScreenRelative.y));
                
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
                import('./manager-pins.js').then(({ PinManager }) => {
                    const modifiers = this._extractModifiers(e);
                    const sceneId = canvas?.scene?.id || '';
                    const userId = game.user?.id || '';
                    PinManager._invokeHandlers('click', pinData, sceneId, userId, modifiers, e);
                }).catch(() => {});
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
        
        if (canEdit) {
            menuItems.push({
                name: 'Edit',
                icon: '<i class="fa-solid fa-edit"></i>',
                callback: () => {
                    postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Edit pin (not yet implemented)', pinData.id, true, false);
                }
            });
        }
        
        if (canDelete) {
            menuItems.push({
                name: 'Delete',
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
        
        menuItems.push({
            name: 'Properties',
            icon: '<i class="fa-solid fa-info-circle"></i>',
            callback: () => {
                const pinInfo = `ID: ${pinData.id}\nModule: ${pinData.moduleId}\nPosition: (${pinData.x}, ${pinData.y})\nText: ${pinData.text || 'None'}`;
                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Pin properties', pinInfo, true, false);
            }
        });
        
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

    /**
     * Initialize the pins system (no longer needs layer parameter)
     */
    static initialize() {
        // Initialize DOM pin system
        PinDOMElement.initialize();
        
        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Renderer initialized', '', true, false);
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
            for (const pinData of pins) {
                await this._addPin(pinData);
            }

            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Loaded ${pins.length} pin(s) for scene`, sceneId, true, false);
            
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
        PinDOMElement.createOrUpdatePin(pinData.id, pinData);
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
     * Cleanup on module unload
     */
    static cleanup() {
        this.clear();
        PinDOMElement.cleanup();
    }
}
