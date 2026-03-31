// ==================================================================
// ===== QUICK VIEW UTILITY (Clarity Mode) ===========================
// ==================================================================

import { MODULE } from './const.js';
import { MenuBar } from './api-menubar.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';

/**
 * Quick View Utility - Clarity Mode for GMs
 * Provides enhanced visibility: increased brightness, fog reveal, and token visibility
 */
export class QuickViewUtility {
  static _isActive = false;
  static _originalFogExplored = null;
  static _originalFogOpacity = undefined;
  static _originalTokenVision = null;
  /** Prior value of the core illumination shader reveal flag (see `uniforms` on the illumination effects filter) */
  static _priorIlluminationUniformValue = undefined;
  /** Captured darkness filter alpha before Quick View */
  static _originalDarknessFilterAlpha = undefined;

  static _REVEAL_CHILD_NAME = 'coffee-pub-blacksmith-quickview-reveal';

  static _tokenOverlays = new Map();

  static _darknessAlphaTarget() {
    const v = getSettingSafely(MODULE.ID, 'quickViewDarknessAlpha', 0.5);
    if (typeof v !== 'number' || Number.isNaN(v)) return 0.5;
    return Math.min(1, Math.max(0.2, v));
  }

  /**
   * Toggle clarity mode on/off
   * @returns {boolean} New active state
   */
  static async toggle() {
    if (this._isActive) await this.deactivate();
    else await this.activate();
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
  static async activate() {
    if (!game.user.isGM) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Only GMs can use clarity mode', '', false, false);
      return;
    }

    if (!canvas.scene) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: No active scene', '', false, false);
      return;
    }

    try {
      this._applyLightingBoost();

      // Allow GM to see the whole scene (disable token-only vision)
      this._applyTokenVisionOverride();

      // Make fog more transparent
      this._applyFogTransparency();

      // Show overlays (only if token is selected)
      this._showAllTokens();

      this._isActive = true;
      this._syncVisibilityReveal();
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Clarity mode activated', '', true, false);
    } catch (error) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error activating clarity mode', error, false, true);
    }
  }

  /**
   * Deactivate clarity mode
   */
  static async deactivate() {
    if (!this._isActive) return;

    try {
      this._restoreLightingBoost();

      // Restore token vision requirement
      this._restoreTokenVisionOverride();

      // Restore fog opacity
      this._restoreFogTransparency();

      // Remove token overlays
      this._hideAllTokens();

      this._isActive = false;
      this._syncVisibilityReveal();
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Clarity mode deactivated', '', true, false);
    } catch (error) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error deactivating clarity mode', error, false, true);
    }
  }

  // ==================================================================
  // ===== LIGHTING / BRIGHTNESS (core effects pipeline, GM-only) =======
  // ==================================================================

  /**
   * Boost local GM view using the core lighting pipeline (illumination shader + darkness layer).
   * Requires `drawCanvasDarknessEffects` to swap in an alpha filter so darkness strength applies.
   * Does not change scene data.
   */
  static _applyLightingBoost() {
    if (!canvas?.ready) return;

    try {
      const illumination = canvas.effects?.illumination;
      const uniforms = illumination?.filter?.uniforms;
      if (uniforms && 'gmVision' in uniforms) {
        if (this._priorIlluminationUniformValue === undefined) {
          this._priorIlluminationUniformValue = uniforms.gmVision;
        }
        uniforms.gmVision = true;
      }

      const darknessFx = canvas.effects?.darkness;
      const dFilter = darknessFx?.filter;
      if (dFilter && 'alpha' in dFilter) {
        if (this._originalDarknessFilterAlpha === undefined) {
          this._originalDarknessFilterAlpha = dFilter.alpha;
        }
        dFilter.alpha = this._darknessAlphaTarget();
      }
    } catch (error) {
      console.error('Clarity debug — error applying lighting boost:', error);
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error applying lighting boost', error, false, false);
    }
  }

  /**
   * Restore illumination/darkness effects to pre–Quick View values.
   */
  static _restoreLightingBoost() {
    if (!canvas?.ready) return;

    try {
      const illumination = canvas.effects?.illumination;
      const uniforms = illumination?.filter?.uniforms;
      if (uniforms && this._priorIlluminationUniformValue !== undefined && 'gmVision' in uniforms) {
        uniforms.gmVision = this._priorIlluminationUniformValue;
      }

      const darknessFx = canvas.effects?.darkness;
      const dFilter = darknessFx?.filter;
      if (dFilter && this._originalDarknessFilterAlpha !== undefined && 'alpha' in dFilter) {
        dFilter.alpha = this._originalDarknessFilterAlpha;
      }
    } catch (error) {
      console.error('Clarity debug — error restoring lighting boost:', error);
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error restoring lighting boost', error, false, false);
    } finally {
      this._priorIlluminationUniformValue = undefined;
      this._originalDarknessFilterAlpha = undefined;
    }
  }

  /**
   * Full-scene reveal mesh for the visibility group: shows unexplored areas dimly for the GM
   * when Quick View is active. Hook: `drawCanvasVisibility` (see core CanvasGroup draw hook naming).
   */
  static _onDrawCanvasVisibility(visibility) {
    if (!game.user.isGM || !visibility || !canvas?.dimensions?.rect) return;

    try {
      const RectGraphics = PIXI.LegacyGraphics ?? PIXI.Graphics;
      let g = visibility.getChildByName?.(this._REVEAL_CHILD_NAME);
      if (!g) {
        g = new RectGraphics();
        g.name = this._REVEAL_CHILD_NAME;
        visibility.addChild(g);
      }
      g.clear();
      g.beginFill(0xffffff);
      g.drawShape(canvas.dimensions.rect);
      g.endFill();
      g.eventMode = 'none';
      g.visible = this._isActive;
    } catch (error) {
      console.error('Clarity debug — drawCanvasVisibility reveal:', error);
    }
  }

  /**
   * Core darkness layer uses a filter whose alpha is not always adjustable; swap to AlphaFilter for GMs.
   */
  static _onDrawCanvasDarknessEffects(layer) {
    if (!game.user.isGM || !layer) return;

    try {
      const prev = layer.filter;
      const idx = layer.filters?.indexOf(prev) ?? -1;
      const keepAlpha = typeof prev?.alpha === 'number' ? prev.alpha : 1;
      layer.filter = new PIXI.AlphaFilter(keepAlpha);
      if (idx >= 0 && layer.filters) layer.filters[idx] = layer.filter;
    } catch (error) {
      console.error('Clarity debug — drawCanvasDarknessEffects:', error);
    }
  }

  static _syncVisibilityReveal() {
    this._sightRefreshReveal(canvas?.visibility);
  }

  static _sightRefreshReveal(visibility) {
    const v = visibility ?? canvas?.visibility;
    if (!game.user.isGM || !canvas?.ready || !v) return;

    let g = v.getChildByName?.(this._REVEAL_CHILD_NAME);
    if (!g && canvas.dimensions?.rect) {
      this._onDrawCanvasVisibility(v);
      g = v.getChildByName?.(this._REVEAL_CHILD_NAME);
    }
    if (g) g.visible = this._isActive;
  }

  // ==================================================================
  // ===== FOG MANAGEMENT ============================================
  // ==================================================================

  /**
   * Make fog of war more transparent (10% opacity)
   */
  static _applyFogTransparency() {
    if (!canvas.fog) return;

    try {
      if (canvas.fog.layer && canvas.fog.layer.alpha !== undefined) {
        // Store original opacity if not already stored
        if (this._originalFogOpacity === undefined) {
          this._originalFogOpacity = canvas.fog.layer.alpha;
        }
        // Make fog nearly transparent
        canvas.fog.layer.alpha = 0.1;
        console.log('Clarity debug — fog opacity set to 0.1 (original:', this._originalFogOpacity, ')');
      }
    } catch (error) {
      console.error('Clarity debug — error applying fog transparency:', error);
      // Don't block activation if fog manipulation fails
    }
  }

  /**
   * Restore original fog opacity
   */
  static _restoreFogTransparency() {
    if (this._originalFogOpacity === undefined || !canvas.fog || !canvas.fog.layer) return;

    try {
      canvas.fog.layer.alpha = this._originalFogOpacity;
      console.log('Clarity debug — fog opacity restored to:', this._originalFogOpacity);
      this._originalFogOpacity = undefined;
    } catch (error) {
      console.error('Clarity debug — error restoring fog transparency:', error);
    }
  }

  // ==================================================================
  // ===== TOKEN VISION OVERRIDE =====================================
  // ==================================================================

  /**
   * Let GM see the whole scene by disabling token-only vision
   */
  static _applyTokenVisionOverride() {
    try {
      if (!canvas.sight) return;
      if (this._originalTokenVision === null) {
        this._originalTokenVision = canvas.sight.tokenVision;
      }
      canvas.sight.tokenVision = false;
      // No explicit refresh call to avoid deprecation warnings; rely on perception updates elsewhere
    } catch (error) {
      console.error('Clarity debug — error applying token vision override:', error);
    }
  }

  /**
   * Restore original token-only vision behavior
   */
  static _restoreTokenVisionOverride() {
    try {
      if (!canvas.sight) return;
      if (this._originalTokenVision !== null) {
        canvas.sight.tokenVision = this._originalTokenVision;
      }
      this._originalTokenVision = null;
    } catch (error) {
      console.error('Clarity debug — error restoring token vision override:', error);
    }
  }

  // ==================================================================
  // ===== TOKEN OVERLAY ==============================================
  // ==================================================================

  /**
   * Show all tokens with hatched overlay
   * When a token is selected, show ALL tokens with hatches.
   */
  static _showAllTokens() {
    console.log('Clarity debug — _showAllTokens called');

    if (!canvas.tokens) {
      console.log('Clarity debug — no canvas.tokens');
      return;
    }

    const tokens = canvas.tokens.placeables;
    const selectedTokens = canvas.tokens.controlled;
    const hasSelectedToken = selectedTokens.length > 0;

    console.log(
      'Clarity debug — tokens count:',
      tokens.length,
      'selected tokens:',
      selectedTokens.length,
      'hasSelectedToken:',
      hasSelectedToken
    );

    if (!hasSelectedToken) {
      console.log('Clarity debug — returning early, no token selected');
      return;
    }

    console.log('Clarity debug — processing tokens, will call _addTokenOverlay');

    tokens.forEach(token => {
      if (!token) return;

      console.log('Clarity debug — calling _addTokenOverlay for:', token.name);

      const opts = {
        image: 'modules/coffee-pub-blacksmith/images/overlays/overlay-pattern-04.webp',
        // FOR NOW: below the art is the indicator
        above: false,
        rotate: false,
        blendMode: 'normal', // normal, overlay, multiply, screen, darken, lighten
        fixedPatternScale: true,
        alpha: 0.7
      };

      console.log('Clarity debug — overlay opts:', { token: token.name, ...opts });

      QuickViewUtility._addTokenOverlay(token, opts).catch(err => {
        console.error('Clarity debug — _addTokenOverlay error:', err);
      });
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
   */
  static async _addTokenOverlay(token, opts = {}) {
    const mesh = token?.mesh;
    if (!token || !mesh) return;

    const defaults = {
      image: '',
      above: false,                 // <- FOR NOW: below art
      fixedPatternScale: true,
      alpha: 0.9,
      blendMode: 'multiply',
      rotate: false                 // <- FOR NOW: keep pattern upright
    };

    const o = { ...defaults, ...opts };
    const blendMode = this._normalizeBlendMode(o.blendMode);

    // Prevent stacking
    this._removeTokenOverlay(token);

    console.log('Clarity debug — _addTokenOverlay START:', token.name, {
      image: o.image,
      above: o.above,
      rotate: o.rotate,
      blendMode,
      fixedPatternScale: o.fixedPatternScale,
      alpha: o.alpha
    });

    if (!o.image) return;

    const texture = await this._loadTexture(o.image);

    // IMPORTANT: token container coords match selection bounds
    const w = token.w;
    const h = token.h;

    if (!w || !h) {
      console.warn('Clarity debug — token w/h invalid:', token.name, { w, h });
      return;
    }

    const overlay = new PIXI.TilingSprite(texture, w, h);
    overlay.name = 'clarity-token-overlay';
    overlay.alpha = o.alpha;
    overlay.blendMode = blendMode;

    // Fill bounding box in token local space
    overlay.position.set(0, 0);

    // Keep hatch upright by counter-rotating if requested
    if (o.rotate === false) overlay.rotation = -token.rotation;

    // Fixed pattern density (neutralize world scale)
    if (o.fixedPatternScale) {
      const { sx, sy } = this._getWorldScale(token);
      const invX = sx > 0.0001 ? 1 / sx : 1;
      const invY = sy > 0.0001 ? 1 / sy : 1;
      overlay.tileScale.set(invX, invY);

      console.log('Clarity debug — fixedPatternScale ON:', { sx, sy, tileScaleX: invX, tileScaleY: invY });
    }

    // Never intercept pointer events
    overlay.eventMode = 'none';

    // Never mask. Ever. (This is what was blanking/disappearing things.)
    overlay.mask = null;

    // Insert below the art reliably
    token.sortableChildren = true;

    // token.mesh might not be a direct child; we still prefer below a known mesh index if we find it
    const meshIndex = token.children?.indexOf(mesh) ?? -1;

    if (o.above) {
      if (meshIndex >= 0) token.addChildAt(overlay, meshIndex + 1);
      else token.addChild(overlay);
    } else {
      // Below
      if (meshIndex >= 0) token.addChildAt(overlay, Math.max(0, meshIndex));
      else token.addChildAt(overlay, 0);
    }

    this._tokenOverlays.set(token.id, { token, overlay });

    console.log('Clarity debug — overlay ADDED OK:', {
      token: token.name,
      tokenChildren: token.children?.length ?? 0,
      meshIndex,
      overlayIndex: token.children?.indexOf?.(overlay) ?? -1
    });
  }

  /**
   * Remove hatched overlay from a token
   */
  static _removeTokenOverlay(token) {
    const mesh = token?.mesh;
    if (!mesh || !token) return;

    // First try direct lookup from map
    const tracked = this._tokenOverlays.get(token.id);
    if (tracked?.overlay) {
      try {
        tracked.overlay.destroy({ children: true });
      } catch (e) {
        // ignore
      }
      this._tokenOverlays.delete(token.id);
      return;
    }

    // Fallback: search by name
    const overlay = token.getChildByName?.('clarity-token-overlay');
    if (!overlay) return;

    try {
      overlay.destroy({ children: true });
    } catch (e) {
      // ignore
    }
  }

  /**
   * Remove all token overlays
   */
  static _hideAllTokens() {
    this._tokenOverlays.forEach((overlayData, tokenId) => {
      try {
        const token = overlayData.token;
        if (token) this._removeTokenOverlay(token);
      } catch (e) {
        // ignore
      }
    });
    this._tokenOverlays.clear();
  }

  /**
   * Handle scene changes - deactivate clarity mode when scene changes
   */
  static onSceneChange() {
    if (this._isActive) this.deactivate();
  }

  /**
   * After a full canvas rebuild, cached effect overrides and overlay state are invalid — reapply.
   */
  static _resyncAfterCanvasReady() {
    if (!this._isActive || !game.user.isGM) return;

    this._originalFogOpacity = undefined;
    this._originalTokenVision = null;
    this._priorIlluminationUniformValue = undefined;
    this._originalDarknessFilterAlpha = undefined;
    this._tokenOverlays.clear();

    this._applyLightingBoost();
    this._applyTokenVisionOverride();
    this._applyFogTransparency();
    if (canvas.visibility) this._onDrawCanvasVisibility(canvas.visibility);
    this._syncVisibilityReveal();
    this._hideAllTokens();
    this._showAllTokens();
  }

  static _onVisibilityRefresh(visibility) {
    if (!game.user.isGM || !visibility) return;
    if (!visibility.getChildByName?.(this._REVEAL_CHILD_NAME)) {
      this._onDrawCanvasVisibility(visibility);
    } else {
      const g = visibility.getChildByName(this._REVEAL_CHILD_NAME);
      if (g) g.visible = this._isActive;
    }
  }

  /**
   * Initialize quick view utility
   */
  static initialize() {
    Hooks.on('canvasReady', () => {
      this._resyncAfterCanvasReady();
    });

    const drawVis = (group) => {
      this._onDrawCanvasVisibility(group);
    };
    Hooks.on('drawCanvasVisibility', drawVis);
    Hooks.on('drawCanvasVisibilityGroup', drawVis);

    Hooks.on('initializeVisionMode', (visibility) => {
      this._onDrawCanvasVisibility(visibility);
    });

    Hooks.on('visibilityRefresh', (visibility) => {
      this._onVisibilityRefresh(visibility);
    });

    Hooks.on('drawCanvasDarknessEffects', (layer) => {
      this._onDrawCanvasDarknessEffects(layer);
    });

    Hooks.on('sightRefresh', (visibility) => {
      if (this._isActive) this._applyLightingBoost();
      this._sightRefreshReveal(visibility);
    });

    Hooks.on('createToken', () => {
      if (this._isActive) this._showAllTokens();
    });

    Hooks.on('updateToken', () => {
      if (this._isActive) {
        this._hideAllTokens();
        this._showAllTokens();
      }
    });

    Hooks.on('controlToken', () => {
      if (this._isActive) {
        this._applyLightingBoost();
        this._applyTokenVisionOverride();
        this._sightRefreshReveal(canvas?.visibility);
        this._hideAllTokens();
        this._showAllTokens();
      }
    });

    postConsoleAndNotification(MODULE.NAME, 'Quick View Utility: Initialized', '', true, false);
  }

  /**
   * Get icon for the menubar button (changes based on active state)
   * @returns {string} Font Awesome icon class
   */
  static getIcon() {
    return this._isActive ? 'fa-solid fa-lightbulb' : 'fa-regular fa-lightbulb';
  }

  /**
   * Get title/tooltip for the menubar button
   * @returns {string} Button title
   */
  static getTitle() {
    return this._isActive ? 'ON' : 'OFF';
  }

  // ==================================================================
  // ===== Helpers =====================================================
  // ==================================================================

  static _normalizeBlendMode(blendMode) {
    if (typeof blendMode === 'number') return blendMode;

    const s = String(blendMode || '').toLowerCase().trim();
    const map = {
      normal: PIXI.BLEND_MODES.NORMAL,
      add: PIXI.BLEND_MODES.ADD,
      multiply: PIXI.BLEND_MODES.MULTIPLY,
      screen: PIXI.BLEND_MODES.SCREEN,
      overlay: PIXI.BLEND_MODES.OVERLAY,
      darken: PIXI.BLEND_MODES.DARKEN,
      lighten: PIXI.BLEND_MODES.LIGHTEN
    };

    return map[s] ?? PIXI.BLEND_MODES.MULTIPLY;
  }

  static async _loadTexture(path) {
    // Foundry’s TextureLoader is stable, but PIXI.Assets also works in many setups.
    // This approach is intentionally conservative.
    try {
      if (foundry?.canvas?.TextureLoader) return await foundry.canvas.TextureLoader.loadTexture(path);
    } catch (e) {
      // fall through
    }

    // Fallback
    return await PIXI.Assets.load(path);
  }

  static _getWorldScale(displayObject) {
    // PIXI v7: worldTransform exists and contains scale components in a/b/c/d.
    // We'll derive approximate scale magnitude on X/Y.
    const wt = displayObject?.worldTransform;
    if (!wt) return { sx: 1, sy: 1 };

    // sx = sqrt(a^2 + b^2), sy = sqrt(c^2 + d^2)
    const a = wt.a ?? 1;
    const b = wt.b ?? 0;
    const c = wt.c ?? 0;
    const d = wt.d ?? 1;

    const sx = Math.sqrt(a * a + b * b) || 1;
    const sy = Math.sqrt(c * c + d * d) || 1;

    return { sx, sy };
  }
}

// Register Menubar Tool for Quick View
Hooks.once('ready', () => {
    MenuBar.registerMenubarTool('quickview', {
        icon: () => {
            return QuickViewUtility.getIcon();
        },
        name: "quickview",
        title: () => {
            return QuickViewUtility.getTitle();
        },
        tooltip: "Toggle Clarity Mode: Increase brightness, reveal fog, show all tokens",
        onClick: async () => {
            await QuickViewUtility.toggle();
            // Trigger menubar re-render
            MenuBar.renderMenubar();
        },
        zone: "left",
        group: "general",
        groupOrder: 100, // GENERAL group
        order: 5,
        moduleId: "blacksmith-core",
        gmOnly: true,
        leaderOnly: false,
        visible: false, // Settings-driven visibility handled elsewhere/dynamically if needed
        toggleable: true,
        active: () => {
            return QuickViewUtility.isActive();
        },
        iconColor: null,
        buttonNormalTint: null,
        buttonSelectedTint: null
    });
});
