// ==================================================================
// ===== QUICK VIEW UTILITY (Clarity Mode) ===========================
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/**
 * Quick View Utility - Clarity Mode for GMs
 *
 * Key behavior:
 * - Overlay is sized/positioned in *token container* space (matches the orange selection bounds)
 * - Optional 'maskToArt' clips the overlay to token art, but is implemented so it can never
 *   blank the overlay or hide the token (we never mutate the mesh).
 */
export class QuickViewUtility {
  static _isActive = false;
  static _originalBrightness = null;
  static _originalFogExplored = null;
  static _originalFogOpacity = undefined;

  // tokenId -> { token, overlay }
  static _tokenOverlays = new Map();

  // tokenId -> { originalVisible, originalRenderable, originalAlpha }
  static _tokenVisibilityOverrides = new Map();

  // ------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------

  /**
   * Toggle clarity mode on/off.
   * @returns {boolean} New active state
   */
  static toggle() {
    if (this._isActive) this.deactivate();
    else this.activate();
    return this._isActive;
  }

  /**
   * @returns {boolean}
   */
  static isActive() {
    return this._isActive;
  }

  /** Activate clarity mode. */
  static activate() {
    if (!game.user.isGM) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Only GMs can use clarity mode', '', false, false);
      return;
    }

    if (!canvas.scene) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: No active scene', '', false, false);
      return;
    }

    try {
      // Store original values
      this._originalBrightness = canvas.scene.brightness;
      this._originalFogExplored = canvas.scene.fogExplored;

      // Increase brightness by 50% (cap 1.0)
      const currentBrightness = canvas.scene.brightness || 0;
      const newBrightness = Math.min(currentBrightness * 1.5, 1.0);
      canvas.scene.update({ brightness: newBrightness });

      // Fog manipulation is optional, do not block activation
      if (canvas.fog) {
        try {
          if (canvas.fog.layer && canvas.fog.layer.alpha !== undefined) {
            if (this._originalFogOpacity === undefined) this._originalFogOpacity = canvas.fog.layer.alpha;
            canvas.fog.layer.alpha = 0.1;
          }
        } catch (e) {
          // ignore
        }
      }

      this._showAllTokens();
      this._isActive = true;

      postConsoleAndNotification(MODULE.NAME, 'Quick View: Clarity mode activated', '', true, false);
    } catch (error) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error activating clarity mode', error, false, true);
    }
  }

  /** Deactivate clarity mode. */
  static deactivate() {
    if (!this._isActive) return;

    try {
      // Restore brightness
      if (this._originalBrightness !== null && canvas.scene) {
        canvas.scene.update({ brightness: this._originalBrightness });
        this._originalBrightness = null;
      }

      // Restore fog opacity
      if (this._originalFogOpacity !== undefined && canvas.fog && canvas.fog.layer) {
        canvas.fog.layer.alpha = this._originalFogOpacity;
        this._originalFogOpacity = undefined;
      }

      this._hideAllTokens();
      this._isActive = false;

      postConsoleAndNotification(MODULE.NAME, 'Quick View: Clarity mode deactivated', '', true, false);
    } catch (error) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error deactivating clarity mode', error, false, true);
    }
  }

  // ------------------------------------------------------------
  // Token overlay
  // ------------------------------------------------------------

  /**
   * Show hatched overlays for all tokens.
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

    console.log('Clarity debug — tokens count:', tokens.length, 'selected tokens:', selectedTokens.length, 'hasSelectedToken:', hasSelectedToken);

    if (!hasSelectedToken) {
      console.log('Clarity debug — returning early, no token selected');
      return;
    }

    console.log('Clarity debug — processing tokens, will call _addTokenOverlay');

    // Keep opts explicit so your console always tells a coherent story.
    const opts = {
      image: 'modules/coffee-pub-blacksmith/images/overlays/overlay-pattern-01.webp',
      above: true,
      rotate: false,
      blendMode: 'multiply',
      fixedPatternScale: true,
      alpha: 0.9,
      maskToArt: true
    };

    tokens.forEach((token) => {
      if (!token?.mesh) {
        console.log('Clarity debug — token has no mesh:', token?.name);
        return;
      }

      console.log('Clarity debug — calling _addTokenOverlay for:', token.name);

      postConsoleAndNotification(MODULE.NAME, `Clarity: Adding overlay for ${token.name}`, '', true, false);

      console.log('Clarity debug — overlay opts:', { token: token.name, ...opts });

      const p = QuickViewUtility._addTokenOverlay(token, opts).catch((err) => {
        console.error('Clarity debug — _addTokenOverlay error:', err);
      });

      console.log('Clarity debug — overlay promise created?', !!p);
    });
  }

  /**
   * Add a hatched overlay to a token matching the token selection bounds.
   *
   * @param {Token} token
   * @param {object} opts
   * @param {string} opts.image Overlay texture path
   * @param {boolean} opts.above If true, draw above token art; else below
   * @param {boolean} opts.fixedPatternScale If true, keep pattern density fixed (screen/world-space feel)
   * @param {number} opts.alpha Overlay alpha
   * @param {number|string} opts.blendMode PIXI.BLEND_MODES.* or string alias ('multiply', etc.)
   * @param {boolean} opts.rotate If true, overlay rotates with token; if false, counter-rotate to stay upright
   * @param {boolean} opts.maskToArt If true, attempt to clip to token art alpha. Implemented safely.
   */
  static async _addTokenOverlay(token, opts = {}) {
    const mesh = token?.mesh;
    if (!token || !mesh) return;

    const defaults = {
      image: '',
      above: true,
      fixedPatternScale: true,
      alpha: 0.9,
      blendMode: PIXI.BLEND_MODES.MULTIPLY,
      rotate: true,
      maskToArt: false
    };

    const o = { ...defaults, ...opts };
    o.blendMode = this._normalizeBlendMode(o.blendMode);

    // Prevent stacking
    this._removeTokenOverlay(token);

    console.log('Clarity debug — _addTokenOverlay START:', token.name, {
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

    // Token container coordinates (matches orange selection box)
    const w = token.w;
    const h = token.h;

    if (!w || !h) {
      console.warn('Clarity debug — token w/h invalid:', token.name, { w, h });
      return;
    }

    const overlay = new PIXI.TilingSprite(texture, w, h);
    overlay.name = 'clarity-token-overlay';
    overlay.alpha = o.alpha;
    overlay.blendMode = o.blendMode;

    // Token local space: top-left is (0,0)
    overlay.position.set(0, 0);

    // Rotation behavior
    // - rotate=true: inherit token rotation as a child
    // - rotate=false: counter-rotate so hatch stays upright
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

    // Ensure stable sort behavior
    token.sortableChildren = true;

    // Insert overlay relative to the token art
    // Note: In v13, token.mesh may not be a direct child of token in some cases.
    // If it isn't, we still add overlay and rely on zIndex to keep it near the top.
    const children = token.children ?? [];
    const meshIndex = children.indexOf(mesh);

    if (o.above) {
      if (meshIndex >= 0) token.addChildAt(overlay, meshIndex + 1);
      else token.addChild(overlay);
      overlay.zIndex = (mesh?.zIndex ?? 0) + 1;
    } else {
      if (meshIndex >= 0) token.addChildAt(overlay, Math.max(0, meshIndex));
      else token.addChildAt(overlay, 0);
      overlay.zIndex = (mesh?.zIndex ?? 0) - 1;
    }

    // Safe mask: we never touch the mesh. We only set overlay.mask, and only
    // if the mesh looks usable. If not, we skip the mask.
    overlay._maskToArtRequested = !!o.maskToArt;
    const maskApplied = this._safeApplyMaskToArt(overlay, mesh, token);

    console.log('Clarity debug — maskToArt applied?', maskApplied);

    // Track for cleanup
    this._tokenOverlays.set(token.id, { token, overlay });

    console.log('Clarity debug — overlay ADDED OK:', {
      token: token.name,
      tokenChildren: token.children?.length ?? 0,
      meshIndex,
      overlayIndex: token.children?.indexOf?.(overlay) ?? -1,
      overlayZ: overlay.zIndex
    });
  }

  /**
   * Apply mask in a way that cannot blank the overlay.
   *
   * Why this is tricky:
   * - Pixi sprite-mask uses the rendered mask alpha.
   * - If you clone a sprite and set its alpha to 0, you can accidentally mask everything out.
   *
   * Strategy:
   * - Prefer using the existing mesh as the mask (no clone, no alpha games).
   * - Only apply if mesh is visible/renderable and has meaningful worldAlpha.
   */
  static _safeApplyMaskToArt(overlay, mesh, token) {
    try {
      // If the caller didn't request it, do nothing.
      // NOTE: overlay doesn't know 'o', so we infer from a marker property.
      // We set this marker by reading opts in _addTokenOverlay.
      // If not present, assume false.
      //
      // Implementation detail: we'll use a private flag on the overlay.
      // But since we can't depend on that, this method should be called
      // only when maskToArt was requested.

      // Only apply when requested: we detect it by whether overlay._maskToArtRequested was set.
      // If not, skip.
      if (!overlay?._maskToArtRequested) return false;

      // Mesh must exist and be a DisplayObject.
      if (!mesh || typeof mesh !== 'object') return false;

      // If mesh is hidden, don't apply.
      // (worldAlpha can be undefined; be defensive)
      const visible = mesh.visible !== false;
      const renderable = mesh.renderable !== false;
      const worldAlpha = Number.isFinite(mesh.worldAlpha) ? mesh.worldAlpha : 1;

      if (!visible || !renderable || worldAlpha <= 0.001) return false;

      // Apply the mesh itself as the mask (no cloning).
      overlay.mask = mesh;

      return true;
    } catch (e) {
      // Never let mask failures prevent the overlay from rendering.
      try {
        overlay.mask = null;
      } catch (_) {
        // ignore
      }
      return false;
    }
  }

  /**
   * Remove hatched overlay from a token.
   */
  static _removeTokenOverlay(token) {
    if (!token) return;

    const overlay = token.getChildByName?.('clarity-token-overlay');
    if (!overlay) return;

    // Safety: ensure we aren't holding a mask reference that could be destroyed elsewhere.
    try {
      overlay.mask = null;
    } catch (e) {
      // ignore
    }

    overlay.destroy({ children: true });
  }

  /**
   * Remove all token overlays and restore original visibility.
   */
  static _hideAllTokens() {
    // Remove visual indicators
    this._tokenOverlays.forEach((overlayData) => {
      try {
        const token = overlayData.token;
        if (token) this._removeTokenOverlay(token);
      } catch (e) {
        // ignore
      }
    });

    // Restore original visibility
    this._tokenVisibilityOverrides.forEach((originalState, tokenId) => {
      try {
        const token = canvas.tokens.get(tokenId);
        if (token?.mesh) {
          if (originalState.originalVisible !== undefined) token.mesh.visible = originalState.originalVisible;
          if (originalState.originalRenderable !== undefined) token.mesh.renderable = originalState.originalRenderable;
          if (originalState.originalAlpha !== undefined) token.mesh.alpha = originalState.originalAlpha;
        }
      } catch (e) {
        // ignore
      }
    });

    this._tokenOverlays.clear();
    this._tokenVisibilityOverrides.clear();
  }

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------

  /**
   * Normalize a blend mode, accepting PIXI constants or string aliases.
   * @param {number|string} blendMode
   * @returns {number}
   */
  static _normalizeBlendMode(blendMode) {
    if (typeof blendMode === 'number') return blendMode;
    if (typeof blendMode !== 'string') return PIXI.BLEND_MODES.MULTIPLY;

    const v = blendMode.toLowerCase().trim();
    switch (v) {
      case 'normal':
        return PIXI.BLEND_MODES.NORMAL;
      case 'add':
      case 'additive':
        return PIXI.BLEND_MODES.ADD;
      case 'multiply':
        return PIXI.BLEND_MODES.MULTIPLY;
      case 'screen':
        return PIXI.BLEND_MODES.SCREEN;
      case 'overlay':
        return PIXI.BLEND_MODES.OVERLAY;
      case 'darken':
        return PIXI.BLEND_MODES.DARKEN;
      case 'lighten':
        return PIXI.BLEND_MODES.LIGHTEN;
      default:
        return PIXI.BLEND_MODES.MULTIPLY;
    }
  }

  /**
   * Load a texture with caching.
   * @param {string} src
   * @returns {Promise<PIXI.Texture>}
   */
  static async _loadTexture(src) {
    console.log('Clarity debug — loading texture:', src);

    // Foundry v13 uses PIXI.Assets; Texture.from is synchronous but may yield a 1x1 until loaded.
    // Using Assets.load ensures it is ready.
    if (PIXI?.Assets?.load) {
      const tex = await PIXI.Assets.load(src);
      console.log('Clarity debug — texture loaded:', tex);
      return tex;
    }

    // Fallback
    const tex = PIXI.Texture.from(src);
    console.log('Clarity debug — texture loaded (fallback):', tex);
    return tex;
  }

  /**
   * World scale helper.
   * @param {Token} token
   * @returns {{sx:number, sy:number}}
   */
  static _getWorldScale(token) {
    try {
      // token.worldTransform is a PIXI.Matrix; a and d correspond to scale with rotation.
      // We approximate scale magnitude.
      const wt = token.worldTransform;
      if (!wt) return { sx: 1, sy: 1 };

      const sx = Math.sqrt(wt.a * wt.a + wt.b * wt.b) || 1;
      const sy = Math.sqrt(wt.c * wt.c + wt.d * wt.d) || 1;
      return { sx, sy };
    } catch (e) {
      return { sx: 1, sy: 1 };
    }
  }

  // ------------------------------------------------------------
  // Lifecycle hooks
  // ------------------------------------------------------------

  /** Handle scene changes. */
  static onSceneChange() {
    if (this._isActive) this.deactivate();
  }

  /** Initialize the utility and hooks. */
  static initialize() {
    // Reset state on canvas ready
    Hooks.on('canvasReady', () => {
      if (this._isActive) {
        // Refresh overlays when canvas is ready
        this._hideAllTokens();
        this._showAllTokens();
      }
    });

    Hooks.on('createToken', () => {
      if (this._isActive) {
        this._hideAllTokens();
        this._showAllTokens();
      }
    });

    Hooks.on('updateToken', () => {
      if (this._isActive) {
        this._hideAllTokens();
        this._showAllTokens();
      }
    });

    Hooks.on('controlToken', () => {
      if (this._isActive) {
        this._hideAllTokens();
        this._showAllTokens();
      }
    });

    postConsoleAndNotification(MODULE.NAME, 'Quick View Utility: Initialized', '', true, false);
  }

  /**
   * Get icon for the menubar button (changes based on active state)
   * @returns {string}
   */
  static getIcon() {
    return this._isActive ? 'fa-solid fa-lightbulb' : 'fa-regular fa-lightbulb';
  }

  /**
   * Get title/tooltip for the menubar button
   * @returns {string}
   */
  static getTitle() {
    return this._isActive ? 'Clarity Mode: ON' : 'Clarity Mode: OFF';
  }
}
