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

  static _tokenOverlays = new Map();

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
      // Apply brightness increase (always-on, regardless of token selection)
      await this._applyBrightness();

      // Make fog more transparent
      this._applyFogTransparency();

      // Show overlays (only if token is selected)
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
  static async deactivate() {
    if (!this._isActive) return;

    try {
      // Restore original brightness
      await this._restoreBrightness();

      // Restore fog opacity
      this._restoreFogTransparency();

      // Remove token overlays
      this._hideAllTokens();

      this._isActive = false;
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Clarity mode deactivated', '', true, false);
    } catch (error) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error deactivating clarity mode', error, false, true);
    }
  }

  // ==================================================================
  // ===== BRIGHTNESS MANAGEMENT ======================================
  // ==================================================================

  /**
   * Apply brightness increase to the scene
   * Increases brightness by 50% (capped at 1.0) and refreshes perception
   */
  static async _applyBrightness() {
    if (!canvas.scene) return;

    try {
      // Store original darkness if not already stored (scene darkness: 0 = bright, 1 = dark)
      const currentDarkness = canvas.scene.darkness ?? 0;
      if (this._originalBrightness === null) {
        this._originalBrightness = currentDarkness;
      }

      // Reduce darkness by 0.5 (clamped to [0, 1]) for a noticeable lift
      const newDarkness = Math.max(0, Math.min(currentDarkness - 0.5, 1));

      console.log('Clarity debug — applying brightness:', {
        original: this._originalBrightness,
        current: currentDarkness,
        new: newDarkness
      });

      // Update scene darkness (await to ensure it completes)
      await canvas.scene.update({ darkness: newDarkness });

      // Refresh perception to apply the brightness change
      // Use a safe call without unsupported render flags
      if (canvas.perception) {
        if (typeof canvas.perception.refresh === 'function') {
          await canvas.perception.refresh();
        } else if (typeof canvas.perception.update === 'function') {
          await canvas.perception.update();
        }
      }

      // Verify the change took effect
      const actualDarkness = canvas.scene.darkness;
      console.log('Clarity debug — darkness after update:', actualDarkness);

      if (Math.abs(actualDarkness - newDarkness) > 0.01) {
        console.warn('Clarity debug — darkness update may not have taken effect. Expected:', newDarkness, 'Got:', actualDarkness);
      }
    } catch (error) {
      console.error('Clarity debug — error applying brightness:', error);
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error applying brightness', error, false, false);
    }
  }

  /**
   * Restore original scene brightness
   */
  static async _restoreBrightness() {
    if (this._originalBrightness === null || !canvas.scene) return;

    try {
      console.log('Clarity debug — restoring darkness:', this._originalBrightness);

      // Restore original darkness
      await canvas.scene.update({ darkness: this._originalBrightness });

      // Refresh perception to apply the change
      if (canvas.perception) {
        if (typeof canvas.perception.refresh === 'function') {
          await canvas.perception.refresh();
        } else if (typeof canvas.perception.update === 'function') {
          await canvas.perception.update();
        }
      }

      this._originalBrightness = null;
    } catch (error) {
      console.error('Clarity debug — error restoring brightness:', error);
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error restoring brightness', error, false, false);
    }
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
        image: 'modules/coffee-pub-blacksmith/images/overlays/overlay-pattern-03.webp',
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
