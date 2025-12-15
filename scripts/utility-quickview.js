// ==================================================================
// ===== QUICK VIEW UTILITY (Clarity Mode) ===========================
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

  // token.id -> { token, overlay, mask? }
  static _tokenOverlays = new Map();

  // token.id -> { originalVisible, originalRenderable, originalAlpha }
  static _tokenVisibilityOverrides = new Map();

  /**
   * Toggle clarity mode on/off
   * @returns {boolean} New active state
   */
  static toggle() {
    if (this._isActive) this.deactivate();
    else this.activate();
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

      // Increase brightness by 50% (cap at 1.0)
      const currentBrightness = canvas.scene.brightness || 0;
      const newBrightness = Math.min(currentBrightness * 1.5, 1.0);
      canvas.scene.update({ brightness: newBrightness });

      // Reveal / soften fog (best-effort)
      if (canvas.fog) {
        try {
          // Method 1: Try fog.explore if available
          if (typeof canvas.fog.explore === 'function') {
            const bounds = canvas.dimensions;
            const gridSize = canvas.grid.size;
            const step = Math.max(gridSize * 2, 100);

            for (let x = 0; x < bounds.width; x += step) {
              for (let y = 0; y < bounds.height; y += step) {
                try { canvas.fog.explore({ x, y }); } catch (err) {}
              }
            }
          }

          // Method 2: Reduce fog layer opacity
          if (canvas.fog.layer && canvas.fog.layer.alpha !== undefined) {
            if (this._originalFogOpacity === undefined) this._originalFogOpacity = canvas.fog.layer.alpha;
            canvas.fog.layer.alpha = 0.1;
          }
        } catch (error) {
          // Fog manipulation is optional
        }
      }

      // Show all tokens with overlay
      this._showAllTokens();

      this._isActive = true;
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Clarity mode activated', '', true, false);
    } catch (error) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error activating clarity mode', error, false, true);
    }
  }

  /**
   * Deactivate clarity mode
   */
  static deactivate() {
    if (!this._isActive) return;

    try {
      // Restore original brightness
      if (this._originalBrightness !== null && canvas.scene) {
        canvas.scene.update({ brightness: this._originalBrightness });
        this._originalBrightness = null;
      }

      // Restore fog opacity if modified
      if (this._originalFogOpacity !== undefined && canvas.fog && canvas.fog.layer) {
        canvas.fog.layer.alpha = this._originalFogOpacity;
        this._originalFogOpacity = undefined;
      }

      // Remove overlays and restore visibility
      this._hideAllTokens();

      this._isActive = false;
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Clarity mode deactivated', '', true, false);
    } catch (error) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error deactivating clarity mode', error, false, true);
    }
  }

  // ==================================================================
  // ===== TOKEN OVERLAY ==============================================
  // ==================================================================

  /**
   * Show all tokens with hatched overlay.
   * When a token is selected, show ALL tokens with hatches, even if the selected token can't see them.
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

    for (const token of tokens) {
      if (!token?.mesh) {
        console.log('Clarity debug — token has no mesh:', token?.name);
        continue;
      }

      console.log('Clarity debug — calling _addTokenOverlay for:', token.name);

      postConsoleAndNotification(
        MODULE.NAME,
        `Clarity: Adding overlay for ${token.name}`,
        token.mesh,
        true,
        false
      );

      const opts = {
        image: 'modules/coffee-pub-blacksmith/images/overlays/overlay-pattern-03.webp',
        above: true,
        rotate: false,
        blendMode: 'multiply',
        fixedPatternScale: true,
        alpha: 0.9,
        // NOTE: This is now "safe": it will only apply when conditions are correct.
        maskToArt: true
      };

      console.log('Clarity debug — overlay opts:', {
        token: token.name,
        ...opts
      });

      const p = QuickViewUtility._addTokenOverlay(token, opts).catch(err => {
        console.error('Clarity debug — _addTokenOverlay error:', err);
      });

      console.log('Clarity debug — overlay promise created?', !!p);
    }
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
   * @param {number|string} opts.blendMode PIXI.BLEND_MODES.* or string alias ('multiply', etc.)
   * @param {boolean} opts.rotate If true, overlay rotates with token; if false, counter-rotate to stay upright
   * @param {boolean} opts.maskToArt If true, attempts to mask to token art alpha (advanced, safe-guarded)
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
      maskToArt: true
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

    // IMPORTANT: Token container coordinates (matches orange selection box)
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
    // - rotate=true: inherits token rotation (child of token)
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

    // Ensure child ordering is stable even when Foundry uses zIndex sorting
    token.sortableChildren = true;

    // Try to place relative to mesh if mesh is a direct child of token container.
    const meshIndex = token.children?.indexOf(mesh) ?? -1;

    // IMPORTANT: With sortableChildren=true, addChildAt alone is not reliable.
    // Set zIndex explicitly so it lands where we expect.
    const meshZ = Number.isFinite(mesh?.zIndex) ? mesh.zIndex : 0;
    overlay.zIndex = o.above ? (meshZ + 1) : (meshZ - 1);

    if (o.above) {
      if (meshIndex >= 0) token.addChildAt(overlay, meshIndex + 1);
      else token.addChild(overlay);
    } else {
      if (meshIndex >= 0) token.addChildAt(overlay, Math.max(0, meshIndex));
      else token.addChildAt(overlay, 0);
    }

    // === Safe maskToArt ===
    // The rule: masking must never blank the overlay, and must never affect the token art itself.
    // In v13, token.mesh is not always a direct child of the token container (meshIndex can be -1).
    // When that happens, using mesh as a mask is a common way to get 'nothing shows' or worse.
    //
    // So: only apply a mask when we can prove the mesh is a direct child and looks usable.
    // Otherwise, we skip masking and keep the overlay visible in the selection bounds.
    let maskApplied = false;
    try {
      if (o.maskToArt && meshIndex >= 0 && mesh?.texture) {
        // Use a *clone* of the art sprite as the mask so we never mutate the real mesh.
        const mask = new PIXI.Sprite(mesh.texture);
        mask.name = 'clarity-token-overlay-mask';

        // Mirror transform-ish properties so the mask aligns with the art.
        // These are the ones that typically matter for alignment in Foundry's token container.
        if (mask.anchor && mesh.anchor) mask.anchor.copyFrom(mesh.anchor);
        mask.position.set(mesh.position.x, mesh.position.y);
        mask.rotation = mesh.rotation;
        mask.scale.set(mesh.scale.x, mesh.scale.y);
        mask.skew.set(mesh.skew?.x ?? 0, mesh.skew?.y ?? 0);
        mask.pivot.set(mesh.pivot?.x ?? 0, mesh.pivot?.y ?? 0);

        // Make the mask invisible but still usable as a mask.
        // For PIXI's sprite mask, visibility can be unreliable; alpha=0 is safer than visible=false.
        mask.alpha = 0.0;
        mask.eventMode = 'none';
        mask.zIndex = overlay.zIndex - 0.5;

        token.addChild(mask);
        overlay.mask = mask;

        maskApplied = true;

        // Track for cleanup
        this._tokenOverlays.set(token.id, { token, overlay, mask });

      } else {
        // No mask (bounds-only overlay)
        overlay.mask = null;
        this._tokenOverlays.set(token.id, { token, overlay });
      }
    } catch (err) {
      // Absolute fallback: no mask, keep overlay visible.
      try { overlay.mask = null; } catch (e) {}
      this._tokenOverlays.set(token.id, { token, overlay });
      maskApplied = false;
      console.warn('Clarity debug — maskToArt failed, falling back to unmasked overlay:', token.name, err);
    }

    console.log('Clarity debug — maskToArt applied?', maskApplied);

    console.log('Clarity debug — overlay ADDED OK:', {
      token: token.name,
      tokenChildren: token.children?.length ?? 0,
      meshIndex,
      overlayIndex: token.children?.indexOf?.(overlay),
      overlayZ: overlay.zIndex,
      meshZ
    });

    // If you ever need a sanity check that the overlay is actually rendering:
    // overlay.blendMode = PIXI.BLEND_MODES.NORMAL;
    // overlay.alpha = 1.0;
  }

  /**
   * Remove hatched overlay from a token.
   */
  static _removeTokenOverlay(token) {
    const mesh = token?.mesh;
    if (!mesh) return;

    // Overlay + optional mask are tracked in the map for safe cleanup.
    const tracked = this._tokenOverlays.get(token.id);
    if (tracked?.overlay) {
      try { tracked.overlay.destroy({ children: true }); } catch (e) {}
    } else {
      // Fallback: name lookup
      try {
        const overlay = token.getChildByName?.('clarity-token-overlay');
        if (overlay) overlay.destroy({ children: true });
      } catch (e) {}
    }

    if (tracked?.mask) {
      try { tracked.mask.destroy({ children: true }); } catch (e) {}
    } else {
      // Fallback: name lookup
      try {
        const mask = token.getChildByName?.('clarity-token-overlay-mask');
        if (mask) mask.destroy({ children: true });
      } catch (e) {}
    }

    this._tokenOverlays.delete(token.id);
  }

  /**
   * Remove all token overlays and restore original visibility.
   */
  static _hideAllTokens() {
    // Remove overlays
    for (const [tokenId, overlayData] of this._tokenOverlays.entries()) {
      try {
        const token = overlayData.token;
        if (token) this._removeTokenOverlay(token);
      } catch (error) {}
    }

    // Restore original token visibility
    for (const [tokenId, originalState] of this._tokenVisibilityOverrides.entries()) {
      try {
        const token = canvas.tokens.get(tokenId);
        if (token && token.mesh) {
          if (originalState.originalVisible !== undefined) token.mesh.visible = originalState.originalVisible;
          if (originalState.originalRenderable !== undefined) token.mesh.renderable = originalState.originalRenderable;
          if (originalState.originalAlpha !== undefined) token.mesh.alpha = originalState.originalAlpha;
        }
      } catch (error) {}
    }

    this._tokenOverlays.clear();
    this._tokenVisibilityOverrides.clear();
  }

  // ==================================================================
  // ===== HELPERS =====================================================
  // ==================================================================

  /**
   * Normalize blendMode to a PIXI.BLEND_MODES number.
   * Accepts:
   * - number (already a blend mode)
   * - string alias ('multiply', 'normal', ...)
   */
  static _normalizeBlendMode(blendMode) {
    if (typeof blendMode === 'number') return blendMode;

    if (typeof blendMode === 'string') {
      const key = blendMode.trim().toUpperCase();
      const modes = PIXI?.BLEND_MODES;
      if (modes && key in modes) return modes[key];

      // Common aliases
      const alias = {
        MULTIPLY: PIXI.BLEND_MODES.MULTIPLY,
        NORMAL: PIXI.BLEND_MODES.NORMAL,
        SCREEN: PIXI.BLEND_MODES.SCREEN,
        OVERLAY: PIXI.BLEND_MODES.OVERLAY,
        ADD: PIXI.BLEND_MODES.ADD,
        ADDITIVE: PIXI.BLEND_MODES.ADD,
        LIGHTEN: PIXI.BLEND_MODES.LIGHTEN,
        DARKEN: PIXI.BLEND_MODES.DARKEN
      };

      return alias[key] ?? PIXI.BLEND_MODES.NORMAL;
    }

    return PIXI.BLEND_MODES.NORMAL;
  }

  /**
   * Load a texture reliably across Foundry / PIXI versions.
   */
  static async _loadTexture(src) {
    // Foundry's TextureLoader path (preferred)
    try {
      if (foundry?.utils?.TextureLoader) {
        return await foundry.utils.TextureLoader.loadTexture(src);
      }
    } catch (e) {}

    // PIXI v7 Assets loader
    try {
      if (PIXI?.Assets?.load) {
        return await PIXI.Assets.load(src);
      }
    } catch (e) {}

    // PIXI v5 fallback
    try {
      return await new Promise((resolve, reject) => {
        const base = PIXI.BaseTexture.from(src);
        const tex = new PIXI.Texture(base);
        if (base.valid) resolve(tex);
        else base.once('loaded', () => resolve(tex));
      });
    } catch (e) {}

    // Last resort
    return PIXI.Texture.from(src);
  }

  /**
   * Get the world scale of a token container.
   * (Used to keep pattern density consistent when tokens are scaled.)
   */
  static _getWorldScale(token) {
    const wt = token?.worldTransform;
    if (!wt) return { sx: 1, sy: 1 };

    // Scale magnitude from transform matrix
    const sx = Math.sqrt((wt.a * wt.a) + (wt.b * wt.b));
    const sy = Math.sqrt((wt.c * wt.c) + (wt.d * wt.d));
    return { sx, sy };
  }

  // ==================================================================
  // ===== LIFECYCLE ===================================================
  // ==================================================================

  /**
   * Handle scene changes - deactivate clarity mode when scene changes
   */
  static onSceneChange() {
    if (this._isActive) this.deactivate();
  }

  /**
   * Initialize quick view utility
   */
  static initialize() {
    Hooks.on('canvasReady', () => {
      if (this._isActive) {
        this._isActive = false;
        this._originalBrightness = null;
        this._originalFogExplored = null;
        this._tokenOverlays.clear();
      }
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
        this._hideAllTokens();
        this._showAllTokens();
      }
    });

    Hooks.on('canvasReady', () => {
      if (this._isActive) {
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
    return this._isActive ? 'Clarity Mode: ON' : 'Clarity Mode: OFF';
  }
}
