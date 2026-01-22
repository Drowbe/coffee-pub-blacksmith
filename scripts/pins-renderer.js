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
        this._build();
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

        // Icon/image if provided
        if (image) {
            this._loadIcon(image);
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
     * Load icon/image or Font Awesome icon
     * @param {string} imagePathOrHtml - Image path or Font Awesome HTML string
     * @private
     */
    async _loadIcon(imagePathOrHtml) {
        try {
            if (this._icon) {
                this.removeChild(this._icon);
                this._icon.destroy();
            }
            
            const { size } = this.pinData;
            const iconSize = Math.min(size.w, size.h) * 0.6; // Icon is 60% of pin size
            
            let texture;
            
            // Check if it's a Font Awesome icon
            if (this._isFontAwesomeIcon(imagePathOrHtml)) {
                const faClasses = this._extractFontAwesomeClasses(imagePathOrHtml);
                if (faClasses) {
                    texture = await this._createFontAwesomeTexture(faClasses, iconSize);
                } else {
                    postConsoleAndNotification(MODULE.NAME, `Pins: Invalid Font Awesome format: ${imagePathOrHtml}`, '', false, false);
                    return;
                }
            } else {
                // Regular image path - use PIXI.Assets.load
                texture = await PIXI.Assets.load(imagePathOrHtml);
            }
            
            this._icon = PIXI.Sprite.from(texture);
            this._icon.width = iconSize;
            this._icon.height = iconSize;
            this._icon.anchor.set(0.5);
            this._icon.position.set(0, 0);
            this.addChild(this._icon);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Pins: Failed to load icon ${imagePathOrHtml}`, error?.message ?? error, false, false);
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
            postConsoleAndNotification(MODULE.NAME, 'Pins: Container already initialized', '', true, false);
            return;
        }

        this._container = new PIXI.Container();
        this._container.sortableChildren = true;
        this._container.eventMode = 'static';
        this._container.name = 'blacksmith-pins-container';
        
        // Add to layer (layer is a PIXI.Container)
        layer.addChild(this._container);
        
        postConsoleAndNotification(MODULE.NAME, 'Pins: Renderer initialized', '', true, false);
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
            postConsoleAndNotification(MODULE.NAME, 'Pins: Container not initialized', '', false, true);
            return;
        }

        if (!pins || pins.length === 0) {
            return;
        }

        try {
            for (const pinData of pins) {
                await this._addPin(pinData);
            }

            postConsoleAndNotification(MODULE.NAME, `Pins: Loaded ${pins.length} pin(s) for scene`, sceneId, true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Pins: Error loading scene pins', error?.message ?? error, false, true);
        }
    }

    /**
     * Add a pin to the renderer
     * @param {PinData} pinData
     * @private
     */
    static async _addPin(pinData) {
        if (this._pins.has(pinData.id)) {
            this.updatePin(pinData);
            return;
        }

        const pinGraphics = new PinGraphics(pinData);
        this._pins.set(pinData.id, pinGraphics);
        if (this._container) {
            this._container.addChild(pinGraphics);
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
