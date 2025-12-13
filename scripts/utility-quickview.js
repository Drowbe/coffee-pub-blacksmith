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
    console.log("Clarity debug — _showAllTokens called");
  
    if (!canvas.tokens) {
      console.log("Clarity debug — no canvas.tokens");
      return;
    }
  
    const tokens = canvas.tokens.placeables;
    const selectedTokens = canvas.tokens.controlled;
    const hasSelectedToken = selectedTokens.length > 0;
  
    console.log(
      "Clarity debug — tokens count:",
      tokens.length,
      "selected tokens:",
      selectedTokens.length,
      "hasSelectedToken:",
      hasSelectedToken
    );
  
    if (!hasSelectedToken) {
      console.log("Clarity debug — returning early, no token selected");
      return;
    }
  
    console.log("Clarity debug — processing tokens, will call _addTokenOverlay");
  
    tokens.forEach(token => {
      if (token.mesh) {
        console.log("Clarity debug — calling _addTokenOverlay for:", token.name);
        postConsoleAndNotification(
          MODULE.NAME,
          `Clarity: Adding overlay for ${token.name}`,
          token.mesh,
          true,
          false
        );
  
        // IMPORTANT: don't rely on `this` here. Call the class directly.
        const p = QuickViewUtility._addTokenOverlay(token).catch(err => {
          console.error("Clarity debug — _addTokenOverlay error:", err);
        });
  
        console.log("Clarity debug — overlay promise created?", !!p);
      } else {
        console.log("Clarity debug — token has no mesh:", token.name);
      }
    });
  }
  























/**
 * Apply a hatched overlay to a token using a TilingSprite.
 * - Attaches to token.mesh so it never "hatches the scene"
 * - Sizes using mesh local bounds (correct coordinate space)
 * - Optional screen-space density (pattern stays same density regardless of token size/scale)
 *
 * @param {Token} token
 * @param {object} opts
 * @param {string} opts.image Overlay texture path
 * @param {boolean} opts.above If true, draw above token art; else below
 * @param {boolean} opts.screenSpace If true, keep pattern density fixed in screen/world space
 * @param {number} opts.alpha Overlay alpha
 * @param {number} opts.blendMode PIXI.BLEND_MODES.*
 * @param {boolean} opts.maskToArt If true, attempts to mask to token art alpha (advanced)
 */
static async _addTokenOverlay(
    token,
    {
      image = "modules/coffee-pub-blacksmith/images/overlays/overlay-pattern-01.webp",
      above = true,
      screenSpace = true,
      alpha = 0.6,
      blendMode = PIXI.BLEND_MODES.MULTIPLY,
      maskToArt = false
    } = {}
  ) {
    console.log("Clarity debug — _addTokenOverlay START:", token?.name);
  
    const mesh = token?.mesh;
    if (!mesh) {
      console.warn("Clarity debug — no token.mesh:", token);
      return;
    }
  
    // Remove any existing overlay on THIS mesh (prevents duplicates, prevents scene-level overlays)
    const existing = mesh.getChildByName?.("clarity-token-overlay");
    if (existing) {
      console.log("Clarity debug — removing existing overlay from mesh:", token.name);
      existing.destroy({ children: true });
    }
    this._tokenOverlays?.delete(token.id);
  
    // --- Load texture ---
    console.log("Clarity debug — loading texture:", image);
    const texture = await loadTexture(image);
    console.log("Clarity debug — texture loaded:", texture);
  
    // --- Use mesh local bounds so sizing is correct in mesh space ---
    // This is the big win: no guessing token.w/h, no multiplying by grid size, no world->local confusion.
    const b = mesh.getLocalBounds();
    const w = Math.max(1, b.width);
    const h = Math.max(1, b.height);
  
    console.log("Clarity debug — mesh local bounds:", b);
    console.log("Clarity debug — overlay w/h (local):", w, h);
  
    // --- Create tiling overlay in mesh space ---
    const overlay = new PIXI.TilingSprite(texture, w, h);
    overlay.name = "clarity-token-overlay";
  
    // Position overlay to cover the mesh local bounds
    overlay.position.set(b.x, b.y);
  
    // Visuals
    overlay.alpha = alpha;
    overlay.blendMode = blendMode;
  
    // --- Screen-space density: cancel out mesh world scale so pattern density stays consistent ---
    // Without this: big tokens look like "bigger pattern"
    if (screenSpace) {
      // Compute world scale from worldTransform (handles uniform scale + rotation safely)
      const wt = mesh.worldTransform;
      const sx = Math.hypot(wt.a, wt.b);
      const sy = Math.hypot(wt.c, wt.d);
  
      // Avoid divide-by-zero
      const invX = sx ? 1 / sx : 1;
      const invY = sy ? 1 / sy : 1;
  
      overlay.tileScale.set(invX, invY);
  
      console.log("Clarity debug — screenSpace ON");
      console.log("Clarity debug — world scale sx/sy:", sx, sy);
      console.log("Clarity debug — tileScale set to:", overlay.tileScale.x, overlay.tileScale.y);
    } else {
      overlay.tileScale.set(1, 1);
      console.log("Clarity debug — screenSpace OFF (tileScale 1,1)");
    }
  
    // Add overlay to mesh (token space), and order it
    if (above) mesh.addChild(overlay);
    else mesh.addChildAt(overlay, 0);
  
    // Make sure it sorts above token art if needed
    overlay.zIndex = above ? 9999 : -9999;
    mesh.sortableChildren = true;
  
    // Optional: attempt mask-to-art alpha (see note below)
    if (maskToArt) {
      try {
        // Mask must be in the same display tree, and NOT be an ancestor.
        // Create a mask sprite from the same texture used by the token mesh.
        const maskSprite = new PIXI.Sprite(mesh.texture);
        maskSprite.anchor?.set?.(mesh.anchor?.x ?? 0.5, mesh.anchor?.y ?? 0.5);
  
        // Match overlay's bounds placement
        // We place it using the same local bounds box, so it aligns to the art area.
        maskSprite.position.set(b.x + w / 2, b.y + h / 2);
        maskSprite.width = w;
        maskSprite.height = h;
  
        // Mask sprite should not render
        maskSprite.renderable = false;
        maskSprite.name = "clarity-token-overlay-mask";
  
        mesh.addChild(maskSprite);
        overlay.mask = maskSprite;
  
        console.log("Clarity debug — maskToArt enabled, maskSprite added");
      } catch (e) {
        console.warn("Clarity debug — maskToArt failed, continuing without mask", e);
      }
    }
  
    // Store reference for cleanup
    this._tokenOverlays = this._tokenOverlays || new Map();
    this._tokenOverlays.set(token.id, { token, overlay, addedAt: Date.now() });
  
    console.log("Clarity debug — overlay added OK:", token.name);
    console.log("Clarity debug — mesh children:", mesh.children?.length);
    console.log("Clarity debug — overlay index:", mesh.getChildIndex?.(overlay));
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


