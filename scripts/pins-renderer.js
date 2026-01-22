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
        this._isHovered = false;
        this._build();
        this._setupEventListeners();
    }

    /**
     * Build the pin graphics (circle + icon)
     * @private
     */
    _build() {
        this.removeChildren();
        const { size, style, image } = this.pinData;
        const radius = Math.min(size.w, size.h) / 2;

        // Circle base
        this._circle = new PIXI.Graphics();
        const fillColor = style.fill || '#000000';
        const strokeColor = style.stroke || '#ffffff';
        const strokeWidth = style.strokeWidth || 2;
        const alpha = typeof style.alpha === 'number' ? style.alpha : 1;
        
        // Convert hex string to number if needed
        const fillColorNum = typeof fillColor === 'string' && fillColor.startsWith('#')
            ? parseInt(fillColor.slice(1), 16)
            : (typeof fillColor === 'number' ? fillColor : 0x000000);
        const strokeColorNum = typeof strokeColor === 'string' && strokeColor.startsWith('#')
            ? parseInt(strokeColor.slice(1), 16)
            : (typeof strokeColor === 'number' ? strokeColor : 0xFFFFFF);
        
        // Draw circle with fill
        this._circle.beginFill(fillColorNum, alpha);
        this._circle.drawCircle(0, 0, radius);
        this._circle.endFill();
        
        // Draw stroke
        this._circle.lineStyle(strokeWidth, strokeColorNum, alpha);
        this._circle.drawCircle(0, 0, radius);
        
        this.addChild(this._circle);

        // Icon/image if provided (load async, don't block)
        if (image) {
            // Fire and forget - icon will load asynchronously
            this._loadIcon(image).catch(err => {
                // Icon loading failed, but pin should still be visible (circle only)
                console.error('BLACKSMITH | PINS Icon load error (non-fatal):', err);
            });
        }

        // Set position
        this.position.set(this.pinData.x, this.pinData.y);

        // Set hit area (circle)
        this.hitArea = new PIXI.Circle(0, 0, radius);
        this.eventMode = 'static';
        this.cursor = 'pointer';
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
        // Create a temporary HTML element to render the Font Awesome icon
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        tempDiv.style.width = `${size}px`;
        tempDiv.style.height = `${size}px`;
        tempDiv.style.display = 'flex';
        tempDiv.style.alignItems = 'center';
        tempDiv.style.justifyContent = 'center';
        tempDiv.style.fontSize = `${size * 0.8}px`;
        tempDiv.style.color = '#ffffff';
        tempDiv.style.lineHeight = '1';
        tempDiv.innerHTML = `<i class="${faClasses}"></i>`;
        
        document.body.appendChild(tempDiv);
        
        // Wait for Font Awesome font to load and render
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Get the icon element
        const iconElement = tempDiv.querySelector('i');
        if (!iconElement) {
            document.body.removeChild(tempDiv);
            throw new Error('Font Awesome icon element not found');
        }
        
        // Try to get the ::before pseudo-element content (where FA icons are rendered)
        let iconChar = '';
        try {
            const beforeStyle = window.getComputedStyle(iconElement, '::before');
            const content = beforeStyle.content;
            
            // Extract Unicode from content (e.g., "\f005" or '"\\f005"')
            if (content && content !== 'none' && content !== '""') {
                const match = content.match(/["']?\\([0-9a-fA-F]{4})["']?/);
                if (match) {
                    const codePoint = parseInt(match[1], 16);
                    iconChar = String.fromCharCode(codePoint);
                }
            }
        } catch (e) {
            // ::before access might fail in some browsers
        }
        
        // Create canvas to render the icon
        const canvas = document.createElement('canvas');
        const padding = 4;
        canvas.width = size + (padding * 2);
        canvas.height = size + (padding * 2);
        const ctx = canvas.getContext('2d');
        
        if (iconChar) {
            // Get Font Awesome font family
            const computedStyle = window.getComputedStyle(iconElement);
            const fontFamily = computedStyle.fontFamily;
            const fontSize = size * 0.8;
            
            // Draw icon as text
            ctx.fillStyle = '#ffffff';
            ctx.font = `${fontSize}px ${fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(iconChar, (size + padding * 2) / 2, (size + padding * 2) / 2);
        } else {
            // Fallback: Use html2canvas if available, or draw placeholder
            if (typeof html2canvas !== 'undefined') {
                try {
                    const canvas2 = await html2canvas(tempDiv, {
                        width: size,
                        height: size,
                        backgroundColor: null,
                        scale: 2,
                        logging: false,
                        useCORS: true
                    });
                    document.body.removeChild(tempDiv);
                    return PIXI.Texture.from(canvas2);
                } catch (e) {
                    // html2canvas failed, fall through to placeholder
                }
            }
            
            // Last resort: draw a simple star placeholder
            ctx.strokeStyle = '#ffffff';
            ctx.fillStyle = '#ffffff';
            ctx.lineWidth = 2;
            const centerX = (size + padding * 2) / 2;
            const centerY = (size + padding * 2) / 2;
            const radius = size * 0.3;
            
            // Draw a simple 5-pointed star
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const angle = (i * 4 * Math.PI / 5) - Math.PI / 2;
                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
        }
        
        document.body.removeChild(tempDiv);
        
        // Create texture from canvas
        return PIXI.Texture.from(canvas);
    }

    /**
     * Resolve icon to Font Awesome classes. Pins use Font Awesome only; legacy paths (e.g. icons/svg/star.svg) map to default star.
     * @param {string} [imagePathOrHtml]
     * @returns {string} Font Awesome classes, e.g. "fa-solid fa-star"
     * @private
     */
    _resolveFontAwesomeClasses(imagePathOrHtml) {
        if (this._isFontAwesomeIcon(imagePathOrHtml)) {
            const fa = this._extractFontAwesomeClasses(imagePathOrHtml);
            if (fa) return fa;
        }
        return 'fa-solid fa-star';
    }

    /**
     * Load icon. Uses Font Awesome only; legacy image paths are mapped to default star (no URL loading).
     * @param {string} [imagePathOrHtml] - Font Awesome HTML or legacy path (ignored, we use default)
     * @private
     */
    async _loadIcon(imagePathOrHtml) {
        try {
            if (this._icon) {
                this.removeChild(this._icon);
                this._icon.destroy();
            }
            
            const { size } = this.pinData;
            const iconSize = Math.min(size.w, size.h) * 0.6;
            const faClasses = this._resolveFontAwesomeClasses(imagePathOrHtml);
            const texture = await this._createFontAwesomeTexture(faClasses, iconSize);
            
            this._icon = PIXI.Sprite.from(texture);
            this._icon.width = iconSize;
            this._icon.height = iconSize;
            this._icon.anchor.set(0.5);
            this._icon.position.set(0, 0);
            this.addChild(this._icon);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Failed to load icon: ${error?.message ?? error}`, '', false, false);
        }
    }

    /**
     * Update pin data and refresh graphics
     * @param {PinData} newData
     */
    update(newData) {
        const needsRebuild = 
            newData.size.w !== this.pinData.size.w ||
            newData.size.h !== this.pinData.size.h ||
            newData.image !== this.pinData.image;
        
        this.pinData = foundry.utils.deepClone(newData);
        
        if (needsRebuild) {
            this._build();
        } else {
            // Update existing graphics
            const { size, style } = this.pinData;
            const radius = Math.min(size.w, size.h) / 2;
            
            const fillColor = style.fill || '#000000';
            const strokeColor = style.stroke || '#ffffff';
            const strokeWidth = style.strokeWidth || 2;
            const alpha = typeof style.alpha === 'number' ? style.alpha : 1;
            
            const fillColorNum = typeof fillColor === 'string' && fillColor.startsWith('#')
                ? parseInt(fillColor.slice(1), 16)
                : (typeof fillColor === 'number' ? fillColor : 0x000000);
            const strokeColorNum = typeof strokeColor === 'string' && strokeColor.startsWith('#')
                ? parseInt(strokeColor.slice(1), 16)
                : (typeof strokeColor === 'number' ? strokeColor : 0xFFFFFF);
            
            this._circle.clear();
            this._circle.beginFill(fillColorNum, alpha);
            this._circle.drawCircle(0, 0, radius);
            this._circle.endFill();
            this._circle.lineStyle(strokeWidth, strokeColorNum, alpha);
            this._circle.drawCircle(0, 0, radius);
            
            this.position.set(this.pinData.x, this.pinData.y);
            this.hitArea = new PIXI.Circle(0, 0, radius);
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
            console.error('BLACKSMITH | PINS Error invoking hoverIn handler:', err);
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
            console.error('BLACKSMITH | PINS Error invoking hoverOut handler:', err);
        });
    }

    /**
     * Handle pointer down (clicks)
     * @param {PIXI.FederatedPointerEvent} event
     * @private
     */
    _onPointerDown(event) {
        const originalEvent = event.data?.originalEvent || event.nativeEvent || {};
        const button = originalEvent.button !== undefined ? originalEvent.button : event.button;
        const modifiers = this._extractModifiers(event);
        const sceneId = canvas?.scene?.id || '';
        const userId = game.user?.id || '';
        
        let eventType = null;
        
        // Determine event type based on button
        if (button === 0) {
            // Left click
            eventType = 'click';
        } else if (button === 2) {
            // Right click
            eventType = 'rightClick';
            // Prevent default context menu - we'll show our own
            if (originalEvent.preventDefault) {
                originalEvent.preventDefault();
            }
        } else if (button === 1) {
            // Middle click
            eventType = 'middleClick';
        }
        
        if (eventType) {
            // Dynamically import PinManager to avoid circular dependency
            import('./manager-pins.js').then(({ PinManager }) => {
                PinManager._invokeHandlers(eventType, this.pinData, sceneId, userId, modifiers, event);
                
                // Show context menu for right-click
                if (eventType === 'rightClick') {
                    this._showContextMenu(event, modifiers);
                }
            }).catch(err => {
                console.error(`BLACKSMITH | PINS Error invoking ${eventType} handler:`, err);
            });
        }
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
        
        // Remove context menu if it exists
        const existing = document.getElementById('blacksmith-pin-context-menu');
        if (existing) {
            existing.remove();
        }
        
        super.destroy();
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
        if (this._currentSceneId === sceneId && this._pins.size > 0 && !pins) {
            return; // Already loaded, no new data provided
        }

        this.clear();
        this._currentSceneId = sceneId;

        if (!this._container) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | PINS Container not initialized', '', false, true);
            return;
        }

        if (!pins || pins.length === 0) {
            return;
        }

        try {
            for (const pinData of pins) {
                await this._addPin(pinData);
            }

            postConsoleAndNotification(MODULE.NAME, `BLACKSMITH | PINS Loaded ${pins.length} pin(s) for scene`, sceneId, true, false);
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
            // Reload icon if image changed
            if (pinData.image && pinData.image !== existing.pinData.image) {
                await existing._loadIcon(pinData.image);
            }
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
    }
}
