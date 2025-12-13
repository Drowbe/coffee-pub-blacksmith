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
     * Show all tokens with a visual indicator (different from hatch pattern)
     * Uses a subtle glow/outline effect instead
     * When a token is selected, show tokens in dark areas that would be visible to that token
     */
    static _showAllTokens() {
        if (!canvas.tokens) return;
        
        const tokens = canvas.tokens.placeables;
        const selectedTokens = canvas.tokens.controlled;
        
        tokens.forEach(token => {
            // Always add overlay to all tokens in clarity mode
            if (token.mesh) {
                this._addTokenOverlay(token);
            }
            
            // If clarity mode is on and a token is selected:
            // Make tokens in dark areas visible (they'll have outlines from the overlay above)
            if (selectedTokens.length > 0 && selectedTokens[0]) {
                try {
                    // Check if token is in a dark area (not currently visible due to lighting/vision)
                    // We need to check if the token would be visible to the selected token
                    const isCurrentlyHidden = !token.visible || !token.renderable;
                    
                    if (isCurrentlyHidden) {
                        // Store original visibility state if not already stored
                        if (!this._tokenVisibilityOverrides.has(token.id)) {
                            this._tokenVisibilityOverrides.set(token.id, {
                                originalVisible: token.visible,
                                originalRenderable: token.renderable
                            });
                        }
                        
                        // Temporarily make token visible so it shows in dark areas
                        // The outline overlay will make it clear it's in clarity mode
                        if (token.mesh) {
                            token.mesh.visible = true;
                            token.mesh.renderable = true;
                            // Also update the token's visible property if possible
                            if (token.visible !== undefined) {
                                token.visible = true;
                            }
                        }
                    }
                } catch (error) {
                    // Continue if visibility check fails
                }
            }
        });
    }
    
    /**
     * Add visual overlay to a token to indicate it's visible in clarity mode
     * Uses a PIXI graphics outline/glow effect (v13 tokens are PIXI sprites, not DOM elements)
     */
    static _addTokenOverlay(token) {
        if (!token.mesh || this._tokenOverlays.has(token.id)) {
            return;
        }
        
        try {
            // Check if token already has a clarity overlay
            if (token.mesh.children) {
                const existingIndicator = token.mesh.children.find(child => child.name === 'clarity-indicator');
                if (existingIndicator) {
                    return; // Already has indicator
                }
            }
            
            // Create a PIXI Graphics overlay for the outline/glow effect
            // v13: Tokens are PIXI sprites, so we need to use PIXI graphics, not DOM elements
            const graphics = new PIXI.Graphics();
            graphics.name = 'clarity-indicator';
            
            // Get token dimensions (use document dimensions for accuracy)
            const width = token.w || token.document?.width || 100;
            const height = token.h || token.document?.height || 100;
            const radius = Math.max(width, height) / 2;
            
            // Draw a blue outline/glow around the token
            // Outer glow (softer, wider)
            graphics.lineStyle(6, 0x64C8FF, 0.5); // Blue, semi-transparent, thicker
            graphics.drawCircle(0, 0, radius + 6);
            
            // Middle glow
            graphics.lineStyle(4, 0x64C8FF, 0.6); // Blue, more opaque
            graphics.drawCircle(0, 0, radius + 3);
            
            // Inner outline (sharper, more visible)
            graphics.lineStyle(2, 0x64C8FF, 0.9); // Blue, very opaque
            graphics.drawCircle(0, 0, radius + 1);
            
            // Position the graphics overlay at the token center (0,0 is center in token's local space)
            graphics.x = 0;
            graphics.y = 0;
            graphics.visible = true;
            graphics.renderable = true;
            
            // Ensure graphics is on top by setting a high z-index or adding last
            if (token.mesh.addChild) {
                token.mesh.addChild(graphics);
                // Move to top of children
                if (token.mesh.children) {
                    const index = token.mesh.children.indexOf(graphics);
                    if (index >= 0 && index < token.mesh.children.length - 1) {
                        token.mesh.removeChild(graphics);
                        token.mesh.addChild(graphics);
                    }
                }
            }
            
            // Store reference for cleanup
            this._tokenOverlays.set(token.id, {
                token: token,
                graphics: graphics,
                addedAt: Date.now()
            });
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Quick View: Error adding overlay to token ${token.name}`, error, true, false);
        }
    }
    
    /**
     * Remove all token overlays and restore original visibility
     */
    static _hideAllTokens() {
        // Remove visual indicators from all tokens
        this._tokenOverlays.forEach((overlay, tokenId) => {
            try {
                const token = overlay.token;
                const graphics = overlay.graphics;
                
                // Remove PIXI graphics overlay
                if (token && token.mesh && graphics) {
                    if (token.mesh.removeChild) {
                        token.mesh.removeChild(graphics);
                    }
                    // Destroy the graphics object
                    if (graphics.destroy) {
                        graphics.destroy();
                    }
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

