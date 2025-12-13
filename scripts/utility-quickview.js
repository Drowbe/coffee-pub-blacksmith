// ================================================================== 
// ===== QUICK VIEW UTILITY (Clarity Mode) ==========================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/**
 * Quick View Utility - Clarity Mode for GMs
 * Provides enhanced visibility: increased brightness, fog reveal, and token visibility
 */
export class QuickViewUtility {
    
    static _isActive = false;
    static _originalBrightness = null;
    static _originalFogExplored = null;
    static _originalFogOpacity = undefined;
    static _tokenOverlays = new Map();
    static _tokenVisibilityOverrides = new Map(); // Store original visibility states
    
    /**
     * Toggle clarity mode on/off
     * @returns {boolean} New active state
     */
    static toggle() {
        if (this._isActive) {
            this.deactivate();
        } else {
            this.activate();
        }
        return this._isActive;
    }
    
    /**
     * Check if clarity mode is currently active
     * @returns {boolean} Active state
     */
    static isActive() {
        return this._isActive;
    }
    
    /**
     * Activate clarity mode
     */
    static activate() {
        if (!game.user.isGM) {
            postConsoleAndNotification(MODULE.NAME, "Quick View: Only GMs can use clarity mode", "", false, false);
            return;
        }
        
        if (!canvas.scene) {
            postConsoleAndNotification(MODULE.NAME, "Quick View: No active scene", "", false, false);
            return;
        }
        
        try {
            // Store original values
            this._originalBrightness = canvas.scene.brightness;
            this._originalFogExplored = canvas.scene.fogExplored;
            
            // Increase brightness by 50% (not to maximum)
            // Goal: give GM a feel for what characters see but still see the map
            const currentBrightness = canvas.scene.brightness || 0;
            const newBrightness = Math.min(currentBrightness * 1.5, 1.0); // Increase by 50%, cap at 1.0
            canvas.scene.update({ brightness: newBrightness });
            
            // Reveal all fog of war
            // v13: Try multiple approaches to reveal fog
            if (canvas.fog) {
                try {
                    // Method 1: Try fog.explore if available
                    if (typeof canvas.fog.explore === 'function') {
                        const bounds = canvas.dimensions;
                        const gridSize = canvas.grid.size;
                        const step = Math.max(gridSize * 2, 100);
                        
                        // Explore fog in a grid pattern across the scene
                        for (let x = 0; x < bounds.width; x += step) {
                            for (let y = 0; y < bounds.height; y += step) {
                                try {
                                    canvas.fog.explore({ x, y });
                                } catch (err) {
                                    // Continue if individual explore fails
                                }
                            }
                        }
                    }
                    
                    // Method 2: Try to hide/reduce fog layer opacity (if fog layer exists)
                    if (canvas.fog.layer && canvas.fog.layer.alpha !== undefined) {
                        // Store original opacity
                        if (this._originalFogOpacity === undefined) {
                            this._originalFogOpacity = canvas.fog.layer.alpha;
                        }
                        // Make fog nearly transparent
                        canvas.fog.layer.alpha = 0.1;
                    }
                } catch (error) {
                    // Fog manipulation is optional - don't block activation
                    // GMs typically see through fog anyway, so this is a nice-to-have
                }
            }
            
            // Show all tokens with visual indicator
            this._showAllTokens();
            
            this._isActive = true;
            
            postConsoleAndNotification(MODULE.NAME, "Quick View: Clarity mode activated", "", true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Quick View: Error activating clarity mode", error, false, true);
        }
    }
    
    /**
     * Deactivate clarity mode
     */
    static deactivate() {
        if (!this._isActive) {
            return;
        }
        
        try {
            // Restore original brightness
            if (this._originalBrightness !== null && canvas.scene) {
                canvas.scene.update({ brightness: this._originalBrightness });
                this._originalBrightness = null;
            }
            
            // Restore fog opacity if we modified it
            if (this._originalFogOpacity !== undefined && canvas.fog && canvas.fog.layer) {
                canvas.fog.layer.alpha = this._originalFogOpacity;
                this._originalFogOpacity = undefined;
            }
            
            // Remove token overlays
            this._hideAllTokens();
            
            this._isActive = false;
            
            postConsoleAndNotification(MODULE.NAME, "Quick View: Clarity mode deactivated", "", true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Quick View: Error deactivating clarity mode", error, false, true);
        }
    }
    
    /**
     * Show all tokens with hatched overlay
     * When a token is selected, show ALL tokens with hatches, even if the selected token can't see them
     */
    static _showAllTokens() {
        if (!canvas.tokens) return;
        
        const tokens = canvas.tokens.placeables;
        const selectedTokens = canvas.tokens.controlled;
        const hasSelectedToken = selectedTokens.length > 0;
        
        if (!hasSelectedToken) return;
        
        tokens.forEach(token => {
            // Add hatched overlay to all tokens when a token is selected
            if (token.mesh) {
                // Use async but don't await - let it load in background
                this._addTokenOverlay(token).catch(err => {
                    // Silently handle errors - overlay is optional
                });
            }
        });
    }
    
    /**
     * Apply a hatched overlay to a token using a masked PIXI.Sprite
     * Based on the provided code pattern
     * @param {Token} token
     */
    static async _addTokenOverlay(token) {
        const mesh = token.mesh;
        if (!mesh) return;
        
        // Check if already has overlay
        if (this._tokenOverlays.has(token.id)) {
            return;
        }
        
        // Check if token already has a clarity overlay
        const existingOverlay = mesh.getChildByName("clarity-token-overlay");
        if (existingOverlay) {
            return;
        }
        
        try {
            // Load texture from the image file
            const strTokenMaskImage = 'modules/coffee-pub-blacksmith/images/overlays/overlay-crosshatch-01.webp';
            const texture = await loadTexture(strTokenMaskImage);
            
            // Create overlay sprite
            const overlay = new PIXI.Sprite(texture);
            overlay.name = "clarity-token-overlay";
            
            // Match token dimensions - ensure full coverage
            // Use actual mesh dimensions
            const tokenWidth = mesh.width || token.w * canvas.grid.size || 100;
            const tokenHeight = mesh.height || token.h * canvas.grid.size || 100;
            
            // Scale overlay to match token size exactly (no tiling needed)
            // Pattern should be large enough to cover largest tokens (4x4 grid = ~400px for 100px grid)
            // For now, scale the texture to match token dimensions
            overlay.width = tokenWidth;
            overlay.height = tokenHeight;
            
            // Position at center of token
            overlay.anchor.set(0.5);
            overlay.position.set(tokenWidth / 2, tokenHeight / 2);
            
            // Visual tuning - make it much more visible
            overlay.alpha = 0.9; // Increased for better visibility
            overlay.blendMode = PIXI.BLEND_MODES.NORMAL; // Use normal blend for maximum visibility, or try OVERLAY
            
            // Attach to token
            mesh.addChild(overlay);
            
            // Mask to token shape
            // TEMPORARILY DISABLED TO DEBUG: overlay.mask = mesh;
            // If tokens show without mask, we'll fix masking separately
            
            // Ensure it renders above the token art
            overlay.zIndex = (mesh.zIndex || 0) + 1;
            
            // GM-only visibility
            overlay.visible = game.user.isGM;
            
            // Store reference for cleanup
            this._tokenOverlays.set(token.id, {
                token: token,
                overlay: overlay,
                addedAt: Date.now()
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Quick View: Error adding overlay to token ${token.name}`, error, true, false);
        }
    }
    
    /**
     * Remove hatched overlay from a token
     * Based on the provided code pattern
     */
    static _removeTokenOverlay(token) {
        const mesh = token.mesh;
        if (!mesh) return;
        
        const overlay = mesh.getChildByName("clarity-token-overlay");
        if (!overlay) return;
        
        overlay.destroy({ children: true });
    }
    
    /**
     * Remove all token overlays and restore original visibility
     */
    static _hideAllTokens() {
        // Remove visual indicators from all tokens
        this._tokenOverlays.forEach((overlayData, tokenId) => {
            try {
                const token = overlayData.token;
                
                // Remove hatched overlay
                if (token && token.mesh) {
                    this._removeTokenOverlay(token);
                }
            } catch (error) {
                // Token may have been removed
            }
        });
        
        // Restore original token visibility
        this._tokenVisibilityOverrides.forEach((originalState, tokenId) => {
            try {
                const token = canvas.tokens.get(tokenId);
                if (token && token.mesh) {
                    // Restore original visibility state
                    if (originalState.originalVisible !== undefined) {
                        token.mesh.visible = originalState.originalVisible;
                    }
                    if (originalState.originalRenderable !== undefined) {
                        token.mesh.renderable = originalState.originalRenderable;
                    }
                    if (originalState.originalAlpha !== undefined) {
                        token.mesh.alpha = originalState.originalAlpha;
                    }
                }
            } catch (error) {
                // Token may have been removed
            }
        });
        
        this._tokenOverlays.clear();
        this._tokenVisibilityOverrides.clear();
    }
    
    /**
     * Handle scene changes - deactivate clarity mode when scene changes
     */
    static onSceneChange() {
        if (this._isActive) {
            this.deactivate();
        }
    }
    
    /**
     * Initialize quick view utility
     */
    static initialize() {
        // Listen for scene changes to reset clarity mode
        Hooks.on('canvasReady', () => {
            if (this._isActive) {
                // Reset state when scene changes
                this._isActive = false;
                this._originalBrightness = null;
                this._originalFogExplored = null;
                this._tokenOverlays.clear();
            }
        });
        
        // Listen for token updates to refresh overlays
        Hooks.on('createToken', () => {
            if (this._isActive) {
                this._showAllTokens();
            }
        });
        
        Hooks.on('updateToken', () => {
            if (this._isActive) {
                // Refresh overlays when tokens are updated
                this._hideAllTokens();
                this._showAllTokens();
            }
        });
        
        // Listen for token selection changes to refresh overlays
        // When a token is selected, show tokens in dark areas
        Hooks.on('controlToken', () => {
            if (this._isActive) {
                // Refresh overlays when token selection changes
                this._hideAllTokens();
                this._showAllTokens();
            }
        });
        
        // Also listen for canvas token updates
        Hooks.on('canvasReady', () => {
            if (this._isActive) {
                // Refresh overlays when canvas is ready
                this._hideAllTokens();
                this._showAllTokens();
            }
        });
        
        postConsoleAndNotification(MODULE.NAME, "Quick View Utility: Initialized", "", true, false);
    }
    
    /**
     * Get icon for the menubar button (changes based on active state)
     * @returns {string} Font Awesome icon class
     */
    static getIcon() {
        return this._isActive ? "fa-solid fa-lightbulb" : "fa-regular fa-lightbulb";
    }
    
    /**
     * Get title/tooltip for the menubar button
     * @returns {string} Button title
     */
    static getTitle() {
        return this._isActive ? "Clarity Mode: ON" : "Clarity Mode: OFF";
    }
}


