// ==================================================================
// ===== PINS-RENDERER – Visual rendering of pins on canvas ========
// ==================================================================
// Phase 2: Simple circle + icon rendering. Renders pins on BlacksmithLayer.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/** @typedef {import('./manager-pins.js').PinData} PinData */

/**
 * Simple pin graphics - circle with optional icon
 * Phase 2: Basic rendering only. Customization comes later.
 */
class PinGraphics extends PIXI.Container {
    /**
     * @param {PinData} pinData
     */
    constructor(pinData) {
        super();
        this.pinData = foundry.utils.deepClone(pinData);
        this._circle = null;
        this._icon = null;
        this._text = null;
        this._isHovered = false;
        this._isDragging = false;
        this._dragStartPos = null;
        this._dragAbortController = null;
        this._build();
        this._setupEventListeners();
    }

    /**
     * Build the pin graphics (circle + icon)
     * @private
     */
    _build() {
        this.removeChildren();
        const { size, style = {}, image, text } = this.pinData;
        const radius = Math.min(size.w, size.h) / 2;

        // Circle base
        this._circle = new PIXI.Graphics();
        // Ensure style object exists and has proper defaults
        const fillColor = style?.fill || '#000000';
        const strokeColor = style?.stroke || '#ffffff';
        const strokeWidth = typeof style?.strokeWidth === 'number' ? style.strokeWidth : 2;
        const alpha = typeof style?.alpha === 'number' ? style.alpha : 1;
        
        // Convert hex string to number if needed
        const fillColorNum = typeof fillColor === 'string' && fillColor.startsWith('#')
            ? parseInt(fillColor.slice(1), 16)
            : (typeof fillColor === 'number' ? fillColor : 0x000000);
        const strokeColorNum = typeof strokeColor === 'string' && strokeColor.startsWith('#')
            ? parseInt(strokeColor.slice(1), 16)
            : (typeof strokeColor === 'number' ? strokeColor : 0xFFFFFF);
        
        // Draw circle with both fill and stroke
        // In PIXI, lineStyle must be set before beginFill to get both fill and stroke
        this._circle.lineStyle(strokeWidth, strokeColorNum, alpha);
        this._circle.beginFill(fillColorNum, alpha);
        this._circle.drawCircle(0, 0, radius);
        this._circle.endFill();
        
        this.addChild(this._circle);

        // Icon/image if provided - use HTML overlay (hybrid approach)
        if (image) {
            // Create HTML overlay icon (Font Awesome or image URL)
            // createOrUpdateIcon will handle canvas readiness checks
            PinIconOverlay.createOrUpdateIcon(this.pinData.id, this.pinData);
        }

        // Text label if provided
        if (text) {
            this._buildText();
        }

        // Set position
        this.position.set(this.pinData.x, this.pinData.y);

        // Set hit area (will be updated after text is built if text exists)
        this._updateHitArea();
        
        this.eventMode = 'static';
        this.cursor = 'pointer';
    }

    /**
     * Build text label
     * @private
     */
    _buildText() {
        if (this._text) {
            this.removeChild(this._text);
            this._text.destroy();
        }

        const { text, size, style } = this.pinData;
        if (!text) return;

        // Create PIXI.Text for label
        const fontSize = Math.max(10, Math.min(size.w, size.h) * 0.4); // 40% of pin size, min 10px
        const textColor = style.stroke || '#ffffff'; // Use stroke color for text (usually white)
        
        // PIXI v7: Text constructor takes (text, style)
        this._text = new PIXI.Text(text, {
            fontFamily: 'Arial',
            fontSize: fontSize,
            fill: textColor,
            align: 'center',
            wordWrap: true,
            wordWrapWidth: size.w * 2, // Allow text to wrap if needed
            stroke: '#000000',
            strokeThickness: 2
        });

        // Position text below the circle
        const radius = Math.min(size.w, size.h) / 2;
        this._text.anchor.set(0.5, 0); // Center horizontally, top-aligned vertically
        this._text.position.set(0, radius + 4); // 4px gap below circle

        this.addChild(this._text);
    }

    /**
     * Update hit area to include circle and text bounds
     * @private
     */
    _updateHitArea() {
        const { size } = this.pinData;
        const radius = Math.min(size.w, size.h) / 2;
        
        // Start with circle bounds
        let minX = -radius;
        let maxX = radius;
        let minY = -radius;
        let maxY = radius;

        // Include text bounds if text exists
        if (this._text && this._text.visible) {
            const textBounds = this._text.getBounds();
            minX = Math.min(minX, textBounds.left);
            maxX = Math.max(maxX, textBounds.right);
            minY = Math.min(minY, textBounds.top);
            maxY = Math.max(maxY, textBounds.bottom);
        }

        // Create hit area as rectangle that includes all visible elements
        const width = maxX - minX;
        const height = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        this.hitArea = new PIXI.Rectangle(centerX - width / 2, centerY - height / 2, width, height);
    }

    /**
     * Check if image string is a Font Awesome icon HTML
     * @param {string} imageStr
     * @returns {boolean}
     * @private
     */
    _isFontAwesomeIcon(imageStr) {
        if (typeof imageStr !== 'string') return false;
        // Check for Font Awesome HTML pattern: <i class="fa-..."></i>
        return /<i\s+class=["']fa-/.test(imageStr);
    }

    /**
     * Extract Font Awesome classes from HTML string
     * @param {string} htmlStr
     * @returns {string | null}
     * @private
     */
    _extractFontAwesomeClasses(htmlStr) {
        const match = htmlStr.match(/class=["']([^"']+)["']/);
        return match ? match[1] : null;
    }

    /**
     * Create a texture from a Font Awesome icon
     * @param {string} faClasses - Font Awesome classes (e.g., "fa-solid fa-star")
     * @param {number} size - Size in pixels
     * @returns {Promise<PIXI.Texture>}
     * @private
     */
    async _createFontAwesomeTexture(faClasses, size) {
        // Simple placeholder - icon rendering disabled to prevent Foundry crashes
        // TODO: Implement proper icon rendering when html2canvas is available
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = 'transparent';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
        ctx.stroke();
        return PIXI.Texture.from(canvas);
    }

    /**
     * Resolve icon to Font Awesome classes. Pins use Font Awesome only; legacy paths (e.g. icons/svg/star.svg) map to default star.
     * @param {string} [imagePathOrHtml]
     * @returns {string} Font Awesome classes, e.g. "fa-solid fa-star"
     * @private
     */
    _resolveFontAwesomeClasses(imagePathOrHtml) {
        if (!imagePathOrHtml) return 'fa-solid fa-star';
        if (this._isFontAwesomeIcon(imagePathOrHtml)) {
            const fa = this._extractFontAwesomeClasses(imagePathOrHtml);
            if (fa) return fa;
        }
        return 'fa-solid fa-star';
    }

    /**
     * Load icon - now handled by HTML overlay system (hybrid approach)
     * This method is kept for compatibility but does nothing (icons are HTML overlays)
     * @param {string} [imagePathOrHtml] - Font Awesome HTML or image URL
     * @private
     */
    async _loadIcon(imagePathOrHtml) {
        // Icons are now handled by PinIconOverlay (HTML overlay system)
        // This method is kept for compatibility but no longer creates PIXI sprites
        PinIconOverlay.createOrUpdateIcon(this.pinData.id, this.pinData);
    }

    /**
     * Update pin data and refresh graphics
     * @param {PinData} newData
     */
    update(newData) {
        const oldText = this.pinData.text;
        const oldStroke = this.pinData.style?.stroke;
        const oldImage = this.pinData.image;
        const oldX = this.pinData.x;
        const oldY = this.pinData.y;
        const needsRebuild = 
            newData.size.w !== this.pinData.size.w ||
            newData.size.h !== this.pinData.size.h ||
            newData.image !== oldImage ||
            newData.text !== oldText;
        
        this.pinData = foundry.utils.deepClone(newData);
        
        // Update HTML icon overlay if image, position, or size changed
        if (newData.image !== oldImage || newData.x !== oldX || newData.y !== oldY || 
            newData.size.w !== this.pinData.size.w || newData.size.h !== this.pinData.size.h) {
            PinIconOverlay.createOrUpdateIcon(this.pinData.id, this.pinData);
        }
        
        if (needsRebuild) {
            this._build();
        } else {
            // Update existing graphics
            const { size, style = {} } = this.pinData;
            const radius = Math.min(size.w, size.h) / 2;
            
            // Ensure style object exists and has proper defaults
            const fillColor = style?.fill || '#000000';
            const strokeColor = style?.stroke || '#ffffff';
            const strokeWidth = typeof style?.strokeWidth === 'number' ? style.strokeWidth : 2;
            const alpha = typeof style?.alpha === 'number' ? style.alpha : 1;
            
            const fillColorNum = typeof fillColor === 'string' && fillColor.startsWith('#')
                ? parseInt(fillColor.slice(1), 16)
                : (typeof fillColor === 'number' ? fillColor : 0x000000);
            const strokeColorNum = typeof strokeColor === 'string' && strokeColor.startsWith('#')
                ? parseInt(strokeColor.slice(1), 16)
                : (typeof strokeColor === 'number' ? strokeColor : 0xFFFFFF);
            
            this._circle.clear();
            // In PIXI, lineStyle must be set before beginFill to get both fill and stroke
            this._circle.lineStyle(strokeWidth, strokeColorNum, alpha);
            this._circle.beginFill(fillColorNum, alpha);
            this._circle.drawCircle(0, 0, radius);
            this._circle.endFill();
            
            // Update text if it changed (but doesn't require rebuild)
            const textChanged = newData.text !== oldText;
            if (textChanged) {
                if (newData.text) {
                    this._buildText();
                } else if (this._text) {
                    this.removeChild(this._text);
                    this._text.destroy();
                    this._text = null;
                }
            }
            
            // Update text style if stroke color changed
            if (this._text && style.stroke !== oldStroke) {
                const textColor = style.stroke || '#ffffff';
                this._text.style.fill = textColor;
            }
            
            this.position.set(this.pinData.x, this.pinData.y);
            this._updateHitArea();
        }
    }

    /**
     * Get current pin data
     * @returns {PinData}
     */
    getPinData() {
        return foundry.utils.deepClone(this.pinData);
    }

    /**
     * Set up PIXI event listeners for this pin
     * @private
     */
    _setupEventListeners() {
        // Hover events
        this.on('pointerenter', this._onPointerEnter.bind(this));
        this.on('pointerleave', this._onPointerLeave.bind(this));
        
        // Click events
        this.on('pointerdown', this._onPointerDown.bind(this));
    }

    /**
     * Extract modifier keys from PIXI event
     * @param {PIXI.FederatedPointerEvent} event
     * @returns {Object} Modifier keys object
     * @private
     */
    _extractModifiers(event) {
        const originalEvent = event.data?.originalEvent || event.nativeEvent || {};
        return {
            ctrl: originalEvent.ctrlKey || false,
            alt: originalEvent.altKey || false,
            shift: originalEvent.shiftKey || false,
            meta: originalEvent.metaKey || false
        };
    }

    /**
     * Handle pointer enter (hover in)
     * @param {PIXI.FederatedPointerEvent} event
     * @private
     */
    _onPointerEnter(event) {
        if (this._isHovered) return;
        this._isHovered = true;
        this._updateHoverVisual(true);
        
        // Dynamically import PinManager to avoid circular dependency
        import('./manager-pins.js').then(({ PinManager }) => {
            const modifiers = this._extractModifiers(event);
            const sceneId = canvas?.scene?.id || '';
            const userId = game.user?.id || '';
            PinManager._invokeHandlers('hoverIn', this.pinData, sceneId, userId, modifiers, event);
        }).catch(err => {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error invoking hoverIn handler', err?.message || String(err), false, false);
        });
    }

    /**
     * Handle pointer leave (hover out)
     * @param {PIXI.FederatedPointerEvent} event
     * @private
     */
    _onPointerLeave(event) {
        if (!this._isHovered) return;
        this._isHovered = false;
        this._updateHoverVisual(false);
        
        // Dynamically import PinManager to avoid circular dependency
        import('./manager-pins.js').then(({ PinManager }) => {
            const modifiers = this._extractModifiers(event);
            const sceneId = canvas?.scene?.id || '';
            const userId = game.user?.id || '';
            PinManager._invokeHandlers('hoverOut', this.pinData, sceneId, userId, modifiers, event);
        }).catch(err => {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error invoking hoverOut handler', err?.message || String(err), false, false);
        });
    }

    /**
     * Handle pointer down (clicks and drag start)
     * @param {PIXI.FederatedPointerEvent} event
     * @private
     */
    _onPointerDown(event) {
        const originalEvent = event.data?.originalEvent || event.nativeEvent || {};
        const button = originalEvent.button !== undefined ? originalEvent.button : event.button;
        const modifiers = this._extractModifiers(event);
        const sceneId = canvas?.scene?.id || '';
        const userId = game.user?.id || '';
        
        // Left click - check if it's a drag or click
        if (button === 0) {
            // Check if user can edit this pin
            import('./manager-pins.js').then(({ PinManager }) => {
                if (PinManager._canEdit(this.pinData, userId)) {
                    // Start potential drag (will become drag if mouse moves enough)
                    this._startPotentialDrag(event);
                } else {
                    // Just fire click event
                    PinManager._invokeHandlers('click', this.pinData, sceneId, userId, modifiers, event);
                }
            }).catch(err => {
                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error checking permissions for drag', err?.message || String(err), false, false);
            });
        } else if (button === 2) {
            // Right click
            import('./manager-pins.js').then(({ PinManager }) => {
                PinManager._invokeHandlers('rightClick', this.pinData, sceneId, userId, modifiers, event);
                this._showContextMenu(event, modifiers);
            }).catch(err => {
                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error invoking rightClick handler', err?.message || String(err), false, false);
            });
            // Prevent default context menu
            if (originalEvent.preventDefault) {
                originalEvent.preventDefault();
            }
        } else if (button === 1) {
            // Middle click
            import('./manager-pins.js').then(({ PinManager }) => {
                PinManager._invokeHandlers('middleClick', this.pinData, sceneId, userId, modifiers, event);
            }).catch(err => {
                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error invoking middleClick handler', err?.message || String(err), false, false);
            });
        }
    }

    /**
     * Start potential drag (becomes drag if mouse moves enough)
     * @param {PIXI.FederatedPointerEvent} event
     * @private
     */
    _startPotentialDrag(event) {
        if (this._isDragging) return;

        // Create AbortController for drag cleanup
        this._dragAbortController = new AbortController();
        const signal = this._dragAbortController.signal;

        // Store initial positions: global (screen) and scene (pin position)
        const startGlobal = { x: event.global.x, y: event.global.y };
        const startScenePos = { x: this.pinData.x, y: this.pinData.y };
        
        // Convert initial global to scene to establish baseline
        const stage = canvas.stage;
        const startGlobalAsScene = stage.toLocal(startGlobal);
        
        let dragStarted = false;
        const DRAG_THRESHOLD = 5; // pixels in scene space (minimum movement to start drag)

        // Prevent Foundry selection box
        if (canvas.controls) {
            canvas.controls.activeControl = null;
        }

        // Drag move handler
        const onDragMove = (e) => {
            if (signal.aborted) return;

            // Convert current global position to scene coordinates
            const currentGlobal = e.global;
            const currentScenePos = stage.toLocal(currentGlobal);
            
            // Calculate delta in scene coordinates
            const deltaX = currentScenePos.x - startGlobalAsScene.x;
            const deltaY = currentScenePos.y - startGlobalAsScene.y;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // Start drag if moved beyond threshold
            if (!dragStarted && distance > DRAG_THRESHOLD) {
                dragStarted = true;
                this._isDragging = true;
                
                // Visual feedback: slightly darker/translucent during drag
                this.alpha = 0.7;
                this.zIndex = 1000; // Bring to front

                // Fire dragStart event
                import('./manager-pins.js').then(({ PinManager }) => {
                    const modifiers = this._extractModifiers(e);
                    const sceneId = canvas?.scene?.id || '';
                    const userId = game.user?.id || '';
                    PinManager._invokeHandlers('dragStart', this.pinData, sceneId, userId, modifiers, e);
                }).catch(() => {});
            }

            // Only update position if drag has started
            if (dragStarted) {
                // Update pin position
                const newX = startScenePos.x + deltaX;
                const newY = startScenePos.y + deltaY;

                this.position.set(newX, newY);
                
                // Update HTML icon overlay position during drag
                const tempPinData = { ...this.pinData, x: newX, y: newY };
                PinIconOverlay.updatePosition(this.pinData.id, tempPinData);

                // Fire dragMove event
                import('./manager-pins.js').then(({ PinManager }) => {
                    const modifiers = this._extractModifiers(e);
                    const sceneId = canvas?.scene?.id || '';
                    const userId = game.user?.id || '';
                    PinManager._invokeHandlers('dragMove', { ...this.pinData, x: newX, y: newY }, sceneId, userId, modifiers, e);
                }).catch(() => {});
            }
        };

        // Drag end handler
        const onDragEnd = async (e) => {
            if (signal.aborted) return;

            if (dragStarted) {
                // Was a drag - update position
                this._isDragging = false;
                this.alpha = 1.0;
                this.zIndex = 0;

                // Get final position
                const finalX = this.position.x;
                const finalY = this.position.y;

                // Update pin data via API
                try {
                    const { PinManager } = await import('./manager-pins.js');
                    await PinManager.update(this.pinData.id, { x: finalX, y: finalY });
                    
                    // Fire dragEnd event
                    const modifiers = this._extractModifiers(e);
                    const sceneId = canvas?.scene?.id || '';
                    const userId = game.user?.id || '';
                    PinManager._invokeHandlers('dragEnd', { ...this.pinData, x: finalX, y: finalY }, sceneId, userId, modifiers, e);
                } catch (err) {
                    // Revert position on error
                    this.position.set(this.pinData.x, this.pinData.y);
                    postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error updating pin position', err?.message || err, false, true);
                }
            } else {
                // Was a click - fire click event
                import('./manager-pins.js').then(({ PinManager }) => {
                    const modifiers = this._extractModifiers(e);
                    const sceneId = canvas?.scene?.id || '';
                    const userId = game.user?.id || '';
                    PinManager._invokeHandlers('click', this.pinData, sceneId, userId, modifiers, e);
                }).catch(() => {});
            }

            // Cleanup
            this._cleanupDrag();
        };

        // Register global drag handlers
        stage.on('pointermove', onDragMove);
        stage.on('pointerup', onDragEnd);
        stage.on('pointerupoutside', onDragEnd);

        // Cleanup on abort
        signal.addEventListener('abort', () => {
            stage.off('pointermove', onDragMove);
            stage.off('pointerup', onDragEnd);
            stage.off('pointerupoutside', onDragEnd);
            if (this._isDragging) {
                this._isDragging = false;
                this.alpha = 1.0;
                this.zIndex = 0;
            }
        });
    }

    /**
     * Clean up drag handlers
     * @private
     */
    _cleanupDrag() {
        if (this._dragAbortController) {
            this._dragAbortController.abort();
            this._dragAbortController = null;
        }
        this._isDragging = false;
        this._dragStartPos = null;
    }

    /**
     * Update visual feedback for hover state
     * @param {boolean} isHovered
     * @private
     */
    _updateHoverVisual(isHovered) {
        // Phase 2: Simple visual feedback - scale slightly on hover
        // Phase 4: Can be enhanced with glow, color change, etc.
        if (isHovered) {
            this.scale.set(1.1);
        } else {
            this.scale.set(1.0);
        }
    }

    /**
     * Show context menu for right-click
     * @param {PIXI.FederatedPointerEvent} event
     * @param {Object} modifiers
     * @private
     */
    async _showContextMenu(event, modifiers) {
        // Get screen coordinates from PIXI event
        const globalPoint = event.global;
        const screenX = globalPoint.x;
        const screenY = globalPoint.y;
        
        // Convert canvas coordinates to screen coordinates
        const canvasRect = canvas.canvas.getBoundingClientRect();
        const menuX = canvasRect.left + screenX;
        const menuY = canvasRect.top + screenY;
        
        // Import PinManager to check permissions
        const { PinManager } = await import('./manager-pins.js');
        
        // Create context menu items
        const menuItems = [];
        
        // Check permissions using PinManager
        const userId = game.user?.id || '';
        const canEdit = PinManager._canEdit(this.pinData, userId);
        const canDelete = canEdit; // Same permission for delete
        
        // Edit option (if can edit)
        if (canEdit) {
            menuItems.push({
                name: 'Edit',
                icon: '<i class="fa-solid fa-edit"></i>',
                callback: () => {
                    // Phase 3: Basic implementation - just log for now
                    // Phase 4: Can add edit dialog
                    postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Edit pin (not yet implemented)', this.pinData.id, true, false);
                }
            });
        }
        
        // Delete option (if can delete)
        if (canDelete) {
            menuItems.push({
                name: 'Delete',
                icon: '<i class="fa-solid fa-trash"></i>',
                callback: async () => {
                    try {
                        const { PinManager } = await import('./manager-pins.js');
                        await PinManager.delete(this.pinData.id);
                        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Pin deleted', this.pinData.id, true, false);
                    } catch (err) {
                        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error deleting pin', err?.message || err, false, true);
                    }
                }
            });
        }
        
        // Properties option (always available)
        menuItems.push({
            name: 'Properties',
            icon: '<i class="fa-solid fa-info-circle"></i>',
            callback: () => {
                // Phase 3: Basic implementation - just log for now
                // Phase 4: Can add properties dialog
                const pinInfo = `ID: ${this.pinData.id}\nModule: ${this.pinData.moduleId}\nPosition: (${this.pinData.x}, ${this.pinData.y})\nText: ${this.pinData.text || 'None'}`;
                postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Pin properties', pinInfo, true, false);
            }
        });
        
        // Show context menu using FoundryVTT's context menu system
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
    _renderContextMenu(menuItems, x, y) {
        // Remove any existing context menu
        const existing = document.getElementById('blacksmith-pin-context-menu');
        if (existing) {
            existing.remove();
        }
        
        // Create menu element
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
        
        // Add menu items
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
        
        // Add to document
        document.body.appendChild(menu);
        
        // Close menu on click outside or escape key
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
        
        // Use setTimeout to avoid immediate close from the right-click event
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
            document.addEventListener('keydown', closeOnEscape);
        }, 10);
    }


    /**
     * Clean up event listeners
     */
    destroy() {
        this.off('pointerenter');
        this.off('pointerleave');
        this.off('pointerdown');
        
        // Cleanup drag
        this._cleanupDrag();
        
        // Remove HTML icon overlay
        PinIconOverlay.removeIcon(this.pinData.id);
        
        // Remove context menu if it exists
        const existing = document.getElementById('blacksmith-pin-context-menu');
        if (existing) {
            existing.remove();
        }
        
        super.destroy();
    }
}

/**
 * PinIconOverlay - Manages HTML overlays for pin icons (Font Awesome + images)
 * Hybrid approach: PIXI for circle, HTML for icons
 */
class PinIconOverlay {
    static _icons = new Map(); // pinId -> HTMLElement
    static _container = null; // Container div for all icons
    static _updateThrottle = null;
    static _isInitialized = false;

    /**
     * Initialize the overlay system and hooks
     */
    static initialize() {
        if (this._isInitialized) return;
        
        // Create container div for all pin icons
        const container = document.createElement('div');
        container.id = 'blacksmith-pins-icon-overlay';
        container.className = 'blacksmith-pins-icon-overlay';
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100vw';
        container.style.height = '100vh';
        container.style.pointerEvents = 'none';
        // Foundry's canvas is typically at z-index 100, but we need to be above it
        // Foundry's UI elements are usually 1000+, so we'll use 2000 to be safe
        container.style.zIndex = '2000';
        container.style.overflow = 'visible';
        container.style.visibility = 'visible';
        
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
        
        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Icon overlay container created', `z-index: ${container.style.zIndex}, parent: ${container.parentElement?.tagName}`, true, false);

        // Hook into canvas pan/zoom to update positions
        Hooks.on('canvasPan', () => this._scheduleUpdate());
        Hooks.on('updateScene', () => this._scheduleUpdate());
        Hooks.on('canvasReady', () => {
            // When canvas becomes ready, update all icon positions
            setTimeout(() => {
                this.updateAllPositions();
            }, 100);
        });
        
        // Update on window resize
        window.addEventListener('resize', () => this._scheduleUpdate());
        
        this._isInitialized = true;
        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Icon overlay system initialized', '', true, false);
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
            
            // Global point is relative to the stage, need to add canvas offset
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
     * Schedule a throttled update of all icon positions
     */
    static _scheduleUpdate() {
        if (this._updateThrottle) return;
        
        this._updateThrottle = requestAnimationFrame(() => {
            this.updateAllPositions();
            this._updateThrottle = null;
        });
    }

    /**
     * Create or update an icon overlay
     * @param {string} pinId
     * @param {PinData} pinData
     */
    static createOrUpdateIcon(pinId, pinData) {
        if (!this._isInitialized) this.initialize();
        
        let icon = this._icons.get(pinId);
        const { image, size } = pinData;
        
        if (!image) {
            // No image, remove if exists
            if (icon) {
                this.removeIcon(pinId);
            }
            return;
        }

        // Create new icon if doesn't exist
        if (!icon) {
            icon = document.createElement('div');
            icon.className = 'blacksmith-pin-icon';
            icon.dataset.pinId = pinId;
            icon.style.position = 'absolute';
            icon.style.pointerEvents = 'none';
            icon.style.display = 'none'; // Start hidden, will be shown when positioned
            icon.style.alignItems = 'center';
            icon.style.justifyContent = 'center';
            icon.style.transformOrigin = 'center center';
            icon.style.visibility = 'visible';
            icon.style.opacity = '1';
            this._container.appendChild(icon);
            this._icons.set(pinId, icon);
        }

        // Check if it's Font Awesome or an image URL
        const isFontAwesome = this._isFontAwesomeIcon(image);
        
        // Get current zoom level for size calculation
        const scale = canvas?.ready && canvas?.stage ? canvas.stage.scale.x : 1;
        const iconSizeScene = Math.min(size.w, size.h) * 0.6;
        const iconSizeScreen = iconSizeScene * scale;
        
        if (isFontAwesome) {
            // Font Awesome icon
            const faClasses = this._extractFontAwesomeClasses(image);
            icon.innerHTML = `<i class="${faClasses}"></i>`;
            icon.style.color = '#ffffff';
            icon.style.fontSize = `${iconSizeScreen}px`;
            icon.style.background = 'none';
            icon.style.border = 'none';
            icon.style.width = 'auto';
            icon.style.height = 'auto';
            icon.style.lineHeight = '1';
        } else {
            // Image URL
            icon.innerHTML = '';
            icon.style.backgroundImage = `url(${image})`;
            icon.style.backgroundSize = 'contain';
            icon.style.backgroundRepeat = 'no-repeat';
            icon.style.backgroundPosition = 'center';
            icon.style.width = `${iconSizeScreen}px`;
            icon.style.height = `${iconSizeScreen}px`;
        }
        
        // Ensure icon is visible
        icon.style.zIndex = '2001';

        // Always try to update position immediately, and schedule retry if needed
        // More lenient check - only require stage and app
        if (canvas?.stage && canvas?.app) {
            this.updatePosition(pinId, pinData);
        } else {
            // Canvas not ready yet - schedule position update with multiple retries
            const tryUpdate = () => {
                if (canvas?.stage && canvas?.app) {
                    this.updatePosition(pinId, pinData);
                } else {
                    // Retry after a short delay (max 10 retries)
                    const retryCount = (window[`_pin_retry_${pinId}`] || 0) + 1;
                    window[`_pin_retry_${pinId}`] = retryCount;
                    if (retryCount < 10) {
                        setTimeout(tryUpdate, 100);
                    } else {
                        console.warn(`BLACKSMITH | PINS Failed to update position for ${pinId} after 10 retries`);
                    }
                }
            };
            
            // Try immediately on next frame
            requestAnimationFrame(tryUpdate);
            
            // Also hook into canvasReady as backup
            Hooks.once('canvasReady', () => {
                setTimeout(() => {
                    this.updatePosition(pinId, pinData);
                }, 100);
            });
        }
        
        // Debug: Log icon creation
        postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Icon overlay created for pin ${pinId}`, `Image: ${image}, IsFA: ${isFontAwesome}, Canvas ready: ${canvas?.ready}`, true, false);
    }

    /**
     * Update icon position for a specific pin
     * @param {string} pinId
     * @param {PinData} pinData
     */
    static updatePosition(pinId, pinData) {
        const icon = this._icons.get(pinId);
        if (!icon || !pinData) {
            console.warn(`BLACKSMITH | PINS updatePosition: Missing icon or pinData for ${pinId}`);
            return;
        }

        // More lenient check - only require stage, canvas element can be accessed via app
        if (!canvas?.stage || !canvas?.app) {
            // Canvas not ready - don't hide, just return (will be called again when ready)
            console.log(`BLACKSMITH | PINS updatePosition: Canvas not ready for ${pinId}`, {
                ready: canvas?.ready,
                stage: !!canvas?.stage,
                app: !!canvas?.app,
                canvasElement: !!(canvas?.app?.renderer?.view || canvas?.app?.canvas || canvas?.canvas)
            });
            return;
        }

        try {
            const screen = this._sceneToScreen(pinData.x, pinData.y);
            
            // Check if screen coordinates are valid (not 0,0 which indicates error)
            if (screen.x === 0 && screen.y === 0 && (pinData.x !== 0 || pinData.y !== 0)) {
                // Likely an error in conversion - log it but still try to show
                console.warn(`BLACKSMITH | PINS updatePosition: Invalid screen coordinates for ${pinId}`, {
                    scene: { x: pinData.x, y: pinData.y },
                    screen: screen
                });
                // Don't return - try to show anyway with fallback position
            }
            
            const scale = canvas.stage.scale.x;
            // Icon size in scene units, converted to screen pixels
            const iconSizeScene = Math.min(pinData.size.w, pinData.size.h) * 0.6;
            const iconSizeScreen = iconSizeScene * scale;
            
            // Update icon size based on zoom
            const isFontAwesome = icon.innerHTML.includes('<i class=');
            if (isFontAwesome) {
                icon.style.fontSize = `${iconSizeScreen}px`;
            } else {
                icon.style.width = `${iconSizeScreen}px`;
                icon.style.height = `${iconSizeScreen}px`;
            }
            
            // Center icon over the circle
            const left = screen.x - iconSizeScreen / 2;
            const top = screen.y - iconSizeScreen / 2;
            icon.style.left = `${left}px`;
            icon.style.top = `${top}px`;
            
            // CRITICAL: Set display to flex to make icon visible
            icon.style.display = 'flex';
            icon.style.visibility = 'visible';
            icon.style.opacity = '1';
            icon.style.position = 'absolute';
            
            // Force a reflow to ensure styles are applied
            void icon.offsetHeight;
            
            // Debug: Always log first few position updates to diagnose
            const debugKey = `_pin_${pinId}_debug_count`;
            const debugCount = (window[debugKey] || 0) + 1;
            window[debugKey] = debugCount;
            
            if (debugCount <= 5) {
                const computed = window.getComputedStyle(icon);
                console.log(`BLACKSMITH | PINS Icon position for ${pinId} (update #${debugCount}):`, {
                    scene: { x: pinData.x, y: pinData.y },
                    screen: screen,
                    iconSize: iconSizeScreen,
                    finalPos: { left, top },
                    canvasRect: (canvas.app?.renderer?.view || canvas.app?.canvas || canvas.canvas)?.getBoundingClientRect(),
                    stageScale: scale,
                    displaySet: icon.style.display,
                    displayComputed: computed.display,
                    visibilityComputed: computed.visibility,
                    iconVisible: icon.offsetParent !== null,
                    iconInDOM: document.body.contains(icon)
                });
            }
        } catch (err) {
            // Don't hide on error - just log it
            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Error updating icon position for ${pinId}`, err?.message || String(err), false, false);
        }
    }

    /**
     * Update all icon positions (called on pan/zoom)
     */
    static updateAllPositions() {
        if (!this._isInitialized) {
            console.warn('BLACKSMITH | PINS updateAllPositions: Not initialized');
            return;
        }
        
        // More lenient check - only require stage and app, not ready flag
        if (!canvas?.stage || !canvas?.app) {
            // Canvas not ready - schedule retry
            console.log('BLACKSMITH | PINS updateAllPositions: Canvas not ready, scheduling retry', {
                ready: canvas?.ready,
                stage: !!canvas?.stage,
                app: !!canvas?.app,
                canvasElement: !!(canvas?.app?.renderer?.view || canvas?.app?.canvas || canvas?.canvas)
            });
            setTimeout(() => {
                if (canvas?.stage && canvas?.app) {
                    this.updateAllPositions();
                }
            }, 100);
            return;
        }

        console.log(`BLACKSMITH | PINS updateAllPositions: Updating ${this._icons.size} icon(s)`);

        // Import PinManager to get pin data
        import('./manager-pins.js').then(({ PinManager }) => {
            let updated = 0;
            for (const [pinId, icon] of this._icons.entries()) {
                const pinData = PinManager.get(pinId);
                if (pinData) {
                    this.updatePosition(pinId, pinData);
                    updated++;
                } else {
                    console.warn(`BLACKSMITH | PINS updateAllPositions: No pin data for ${pinId}`);
                }
            }
            console.log(`BLACKSMITH | PINS updateAllPositions: Updated ${updated} icon(s)`);
        }).catch(err => {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Error updating icon positions', err?.message || String(err), false, false);
        });
    }

    /**
     * Remove an icon overlay
     * @param {string} pinId
     */
    static removeIcon(pinId) {
        const icon = this._icons.get(pinId);
        if (icon) {
            icon.remove();
            this._icons.delete(pinId);
        }
    }

    /**
     * Remove all icon overlays
     */
    static clear() {
        for (const icon of this._icons.values()) {
            icon.remove();
        }
        this._icons.clear();
    }

    /**
     * Check if image string is a Font Awesome icon HTML
     * @param {string} imageStr
     * @returns {boolean}
     */
    static _isFontAwesomeIcon(imageStr) {
        if (typeof imageStr !== 'string') return false;
        // Check for Font Awesome HTML pattern or image URL pattern
        if (/<i\s+class=["']fa-/.test(imageStr)) return true;
        // If it starts with http/https or /, it's likely an image URL
        if (/^(https?:\/\/|\/)/.test(imageStr)) return false;
        // Default to Font Awesome if it contains HTML tags
        return /<[^>]+>/.test(imageStr);
    }

    /**
     * Extract Font Awesome classes from HTML string
     * @param {string} htmlStr
     * @returns {string | null}
     */
    static _extractFontAwesomeClasses(htmlStr) {
        const match = htmlStr.match(/class=["']([^"']+)["']/);
        return match ? match[1] : null;
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
 * PinRenderer - Manages pin graphics on the canvas
 */
export class PinRenderer {
    static _container = null;
    static _pins = new Map(); // pinId -> PinGraphics
    static _currentSceneId = null;

    /**
     * Initialize the pins container on BlacksmithLayer
     * @param {foundry.canvas.layers.CanvasLayer} layer
     */
    static initialize(layer) {
        if (this._container) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Container already initialized', '', true, false);
            return;
        }

        this._container = new PIXI.Container();
        this._container.sortableChildren = true;
        this._container.eventMode = 'static';
        this._container.name = 'blacksmith-pins-container';
        
        // Add to layer (layer is a PIXI.Container)
        layer.addChild(this._container);
        
        // Initialize HTML icon overlay system
        PinIconOverlay.initialize();
        
        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Renderer initialized', '', true, false);
    }

    /**
     * Get the pins container
     * @returns {PIXI.Container | null}
     */
    static getContainer() {
        return this._container;
    }

    /**
     * Load and render pins for a scene (called with pin data array)
     * @param {string} sceneId
     * @param {PinData[]} pins - Array of pin data to render
     */
    static async loadScenePins(sceneId, pins) {
        // Don't skip if we have pins to load (even if scene matches)
        if (this._currentSceneId === sceneId && this._pins.size > 0 && (!pins || pins.length === 0)) {
            return; // Already loaded, no new data provided
        }

        // Clear existing pins if scene changed
        if (this._currentSceneId !== sceneId) {
            this.clear();
        }
        this._currentSceneId = sceneId;

        if (!this._container) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Container not initialized - pins will load when container is ready', '', false, false);
            // Try to initialize if layer exists
            const layer = canvas?.['blacksmith-utilities-layer'];
            if (layer) {
                this.initialize(layer);
                if (!this._container) {
                    return; // Still not initialized
                }
            } else {
                return; // Layer doesn't exist yet
            }
        }

        if (!pins || pins.length === 0) {
            return;
        }

        try {
            for (const pinData of pins) {
                await this._addPin(pinData);
            }

            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Loaded ${pins.length} pin(s) for scene`, sceneId, true, false);
            
            // Force update all icon positions after loading
            if (canvas?.ready && canvas?.canvas && canvas?.stage) {
                setTimeout(() => {
                    PinIconOverlay.updateAllPositions();
                }, 200);
            } else {
                // Canvas not ready - hook into canvasReady
                Hooks.once('canvasReady', () => {
                    setTimeout(() => {
                        PinIconOverlay.updateAllPositions();
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
        if (this._pins.has(pinData.id)) {
            await this.updatePin(pinData);
            return;
        }

        try {
            const pinGraphics = new PinGraphics(pinData);
            this._pins.set(pinData.id, pinGraphics);
            if (this._container) {
                this._container.addChild(pinGraphics);
                // HTML icon overlay is created in _build() constructor
                postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Added pin to container: ${pinData.id} at (${pinData.x}, ${pinData.y})`, '', true, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Container not available when adding pin: ${pinData.id}`, '', false, true);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Error creating pin graphics: ${pinData.id}`, error?.message ?? error, false, true);
            throw error;
        }
    }

    /**
     * Update an existing pin
     * @param {PinData} pinData
     */
    static async updatePin(pinData) {
        const existing = this._pins.get(pinData.id);
        if (existing) {
            existing.update(pinData);
            // HTML icon overlay is updated in the update() method
        } else {
            await this._addPin(pinData);
        }
    }

    /**
     * Remove a pin from the renderer
     * @param {string} pinId
     */
    static removePin(pinId) {
        const pin = this._pins.get(pinId);
        if (pin) {
            if (this._container) {
                this._container.removeChild(pin);
            }
            pin.destroy();
            this._pins.delete(pinId);
        }
    }

    /**
     * Clear all pins
     */
    static clear() {
        if (this._container) {
            this._container.removeChildren();
        }
        for (const pin of this._pins.values()) {
            pin.destroy();
        }
        this._pins.clear();
        this._currentSceneId = null;
        
        // Clear HTML icon overlays
        PinIconOverlay.clear();
    }

    /**
     * Get pin graphics by ID
     * @param {string} pinId
     * @returns {PinGraphics | null}
     */
    static getPin(pinId) {
        return this._pins.get(pinId) || null;
    }

    /**
     * Cleanup on module unload
     */
    static cleanup() {
        this.clear();
        if (this._container) {
            this._container.destroy();
            this._container = null;
        }
        PinIconOverlay.cleanup();
    }
}
