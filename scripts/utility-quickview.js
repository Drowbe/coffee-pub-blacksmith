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
          if (!token?.mesh) {
            console.log("Clarity debug — token has no mesh:", token?.name);
            return;
          }
      
          console.log("Clarity debug — calling _addTokenOverlay for:", token.name);
      
          postConsoleAndNotification(
            MODULE.NAME,
            `Clarity: Adding overlay for ${token.name}`,
            token.mesh,
            true,
            false
          );
      
          // Keep your explicit debug opts, but pass them as opts (not inside an object with token)
          const opts = {
            image: "modules/coffee-pub-blacksmith/images/overlays/overlay-pattern-01.webp",
            above: true,
            rotate: false,
            blendMode: "multiply",
            fixedPatternScale: true,
            alpha: 0.55,      // bring back alpha
            maskToArt: true   // bring back maskToArt (best-effort)
          };
      
          console.log("Clarity debug — overlay opts:", { token: token.name, ...opts });
      
          const p = QuickViewUtility._addTokenOverlay(token, opts).catch(err => {
            console.error("Clarity debug — _addTokenOverlay error:", err);
          });
      
          console.log("Clarity debug — overlay promise created?", !!p);
        });
      }
      
  





  
  
  

/**
 * Add a hatched overlay to a token that matches the token's selection bounds.
 *
 * @param {Token} token
 * @param {object} opts
 * @param {string} opts.image Overlay texture path
 * @param {boolean} opts.above If true, draw above token art; else below
 * @param {boolean} opts.fixedPatternScale If true, keep pattern density fixed (screen/world-space feel)
 * @param {number} opts.alpha Overlay alpha
 * @param {number|string} opts.blendMode PIXI.BLEND_MODES.* or string alias ("multiply", etc.)
 * @param {boolean} opts.rotate If true, overlay rotates with token; if false, counter-rotate to stay upright
 * @param {boolean} opts.maskToArt If true, attempts to mask to token art alpha (advanced)
 */
static async _addTokenOverlay(token, opts = {}) {
    const mesh = token?.mesh;
    if (!token || !mesh) return;
  
    const defaults = {
      image: "",
      above: true,
      fixedPatternScale: true,
      alpha: 0.9,
      blendMode: PIXI.BLEND_MODES.MULTIPLY,
      rotate: true,
      maskToArt: true
    };
  
    const o = { ...defaults, ...opts };
    o.blendMode = this._normalizeBlendMode(o.blendMode);
  
    // Prevent stacking
    this._removeTokenOverlay(token);
  
    console.log("Clarity debug — _addTokenOverlay START:", token.name, {
      image: o.image,
      above: o.above,
      rotate: o.rotate,
      blendMode: o.blendMode,
      fixedPatternScale: o.fixedPatternScale,
      alpha: o.alpha,
      maskToArt: o.maskToArt
    });
  
    if (!o.image) return;
  
    const texture = await this._loadTexture(o.image);
  
    // IMPORTANT: Use token container coordinates (matches orange selection box)
    const w = token.w;
    const h = token.h;
  
    if (!w || !h) {
      console.warn("Clarity debug — token w/h invalid:", token.name, { w, h });
      return;
    }
  
    const overlay = new PIXI.TilingSprite(texture, w, h);
    overlay.name = "clarity-token-overlay";
    overlay.alpha = o.alpha;
    overlay.blendMode = o.blendMode;
  
    // Token container local space: top-left is (0,0)
    overlay.position.set(0, 0);
  
    // Rotation behavior
    // - rotate=true: let it inherit token rotation (since it's a child of token container)
    // - rotate=false: counter-rotate so hatch stays “upright”
    if (o.rotate === false) overlay.rotation = -token.rotation;
  
    // Fixed pattern density (neutralize world scale)
    if (o.fixedPatternScale) {
      const { sx, sy } = this._getWorldScale(token);
      const invX = sx > 0.0001 ? 1 / sx : 1;
      const invY = sy > 0.0001 ? 1 / sy : 1;
      overlay.tileScale.set(invX, invY);
  
      console.log("Clarity debug — fixedPatternScale ON:", { sx, sy, tileScaleX: invX, tileScaleY: invY });
    }
  
    // Make sure it never intercepts pointer events
    overlay.eventMode = "none";
  
    // Insert overlay as sibling of mesh (visible in token stack)
    token.sortableChildren = true;
  
    const meshIndex = token.children?.indexOf(mesh) ?? -1;
  
    if (o.above) {
      // Above the art
      if (meshIndex >= 0) token.addChildAt(overlay, meshIndex + 1);
      else token.addChild(overlay);
    } else {
      // Below the art
      if (meshIndex >= 0) token.addChildAt(overlay, Math.max(0, meshIndex));
      else token.addChildAt(overlay, 0);
    }
  
    // TEMP: disable masking until we confirm visibility
    // Once you see it, we can reintroduce maskToArt safely.
    overlay.mask = null;
  
    // Track for cleanup
    this._tokenOverlays.set(token.id, { token, overlay });
  
    console.log("Clarity debug — overlay ADDED OK:", {
      token: token.name,
      tokenChildren: token.children?.length ?? 0,
      meshIndex,
      overlayIndex: token.children?.indexOf?.(overlay)
    });
  
    // DEBUG: if you still see nothing, force an obvious mode for one run
    // overlay.blendMode = PIXI.BLEND_MODES.NORMAL;
    // overlay.alpha = 1.0;
  }
  
  
      














    
    /**
     * Remove hatched overlay from a token
     * Based on the provided code pattern
     */
    


    /**
     * Remove hatched overlay from a token
     */
    static _removeTokenOverlay(token) {
        if (!token) return;
      
        const overlay = token.getChildByName?.("clarity-token-overlay");
        if (overlay) {
          try {
            token.removeChild(overlay);
            overlay.destroy({ children: true, texture: false, baseTexture: false });
          } catch (e) {}
        }
      
        const mask = token.getChildByName?.("clarity-token-overlay-mask");
        if (mask) {
          try {
            token.removeChild(mask);
            mask.destroy({ children: true, texture: false, baseTexture: false });
          } catch (e) {}
        }
      
        this._tokenOverlays.delete(token.id);
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
    







    static _normalizeBlendMode(blendMode) {
        if (typeof blendMode === "number") return blendMode;
      
        if (typeof blendMode === "string") {
          const key = blendMode.trim().toLowerCase();
          const map = {
            multiply: PIXI.BLEND_MODES.MULTIPLY,
            normal: PIXI.BLEND_MODES.NORMAL,
            screen: PIXI.BLEND_MODES.SCREEN,
            overlay: PIXI.BLEND_MODES.OVERLAY,
            add: PIXI.BLEND_MODES.ADD
          };
          return map[key] ?? PIXI.BLEND_MODES.MULTIPLY;
        }
      
        return PIXI.BLEND_MODES.MULTIPLY;
      }
      
      static async _loadTexture(src) {
        // Foundry-friendly texture loading
        return await loadTexture(src);
      }
      
      static _getWorldScale(obj) {
        const wt = obj.worldTransform;
        const sx = Math.hypot(wt.a, wt.b);
        const sy = Math.hypot(wt.c, wt.d);
        return { sx, sy };
      }
      
      static _createBoundsMask(mesh, b) {
        const g = new PIXI.Graphics();
        g.beginFill(0xffffff, 1);
        g.drawRect(b.x, b.y, b.width, b.height);
        g.endFill();
        mesh.addChild(g);
        return g;
      }
      
      /**
       * Best-effort art alpha mask.
       * This can’t be perfect across every token mesh setup, so it falls back to bounds.
       */
      static _tryCreateArtAlphaMask(mesh, b) {
        // Try a few common places to find a sprite/texture
        const tex =
          mesh.texture ??
          mesh?.primary?.texture ??
          mesh?.children?.find?.(c => c?.texture)?.texture ??
          null;
      
        if (!tex) return null;
      
        const s = new PIXI.Sprite(tex);
        s.position.set(b.x, b.y);
        s.width = b.width;
        s.height = b.height;
      
        // Keep it from drawing while still usable as a mask (implementation varies, but this is safe enough)
        s.renderable = false;
      
        mesh.addChild(s);
        return s;
      }
      











/**
 * Best-effort: create a sprite mask that matches the token art as-rendered.
 * Never throws outward. Returns the mask sprite, or null if we should skip masking.
 *
 * Why this is safe:
 * - If we can't confidently build a mask, we return null and leave overlay unmasked.
 * - We use transform math (world -> local) so rotation/scale/parenting don't matter.
 */
static _buildArtMaskSprite({ token, mesh, overlay }) {
    try {
      // Mesh must have a usable texture
      const tex = mesh?.texture;
      const base = tex?.baseTexture;
      if (!tex || !base || base.valid !== true) return null;
  
      // Clone art texture into a sprite to use as the alpha mask
      const maskSprite = new PIXI.Sprite(tex);
      maskSprite.name = "clarity-token-overlay-mask";
  
      // IMPORTANT: masks need to be rendered into the stencil.
      // So don't set visible=false or renderable=false.
      // Keep it effectively invisible but still renderable.
      maskSprite.alpha = 0.001;
  
      // Prevent interaction just in case
      maskSprite.eventMode = "none";
  
      // ---- Transform alignment (the important part) ----
      // We want the mask sprite to match the mesh exactly in *overlay's local space*.
      // Compute: overlayLocal = inverse(overlayWorld) * meshWorld
      const ow = overlay.worldTransform;
      const mw = mesh.worldTransform;
  
      if (!ow || !mw) return null;
  
      const m = ow.clone().invert().append(mw);
      maskSprite.transform.setFromMatrix(m);
  
      return maskSprite;
    } catch (err) {
      console.warn("Clarity: maskToArt skipped (mask build failed)", err);
      return null;
    }
  }
  
  /**
   * Best-effort: apply an art mask to the overlay.
   * Never blanks the overlay: if mask can't be created, overlay remains unmasked.
   */
  static _applyMaskToOverlay({ token, mesh, overlay }) {
    try {
      // Clean up any existing mask first
      const existing = overlay.getChildByName("clarity-token-overlay-mask");
      if (existing) existing.destroy({ children: true });
  
      overlay.mask = null;
  
      const maskSprite = this._buildArtMaskSprite({ token, mesh, overlay });
      if (!maskSprite) return false;
  
      overlay.addChild(maskSprite);
      overlay.mask = maskSprite;
  
      return true;
    } catch (err) {
      console.warn("Clarity: maskToArt skipped (apply failed)", err);
      overlay.mask = null;
      return false;
    }
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


