// ==================================================================
// ===== QUICK VIEW UTILITY (Clarity Mode) ===========================
// ==================================================================

import { MODULE } from './const.js';
import { MenuBar } from './api-menubar.js';
import { postConsoleAndNotification, getSettingSafely, setSettingSafely } from './api-core.js';

/**
 * Quick View Utility - Clarity Mode for GMs
 * Provides enhanced visibility: increased brightness, fog reveal, and token visibility
 */
export class QuickViewUtility {
  static _quickViewKeybindingRegistered = false;

  /** Prevents duplicate hook / keybinding registration if `initialize()` is ever called twice. */
  static _moduleInitialized = false;

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

  /** Parent on `canvas.interface` for sight highlights (not darkened with token meshes). */
  static _sightHighlightLayer = null;

  /** Token IDs that should show the hatch (obscured by vision/fog for the scene view, or sheet-hidden). */
  static _tokenIdsNeedingHatch = new Set();

  /** Collapses multiple visibility updates into one post-pipeline pass (outer + inner rAF). */
  static _tokenRevealOuterRaf = null;
  static _tokenRevealInnerRaf = null;

  /** Debounce `refreshToken` storms (e.g. hover) before re-applying GM visibility. */
  static _refreshTokenDebounceTid = null;

  static _darknessAlphaTarget() {
    const v = getSettingSafely(MODULE.ID, 'quickViewDarknessAlpha', 0.5);
    if (typeof v !== 'number' || Number.isNaN(v)) return 0.5;
    return Math.min(1, Math.max(0.2, v));
  }

  /** Hex string (e.g. #ffcc33) to packed RGB for PIXI lineStyle. */
  static _sightHighlightColorNumber() {
    const raw = getSettingSafely(MODULE.ID, 'quickViewSightHighlightColor', '#ffcc33');
    let s = typeof raw === 'string' ? raw.trim() : '';
    if (!s.startsWith('#')) s = `#${s}`;
    const n = Number.parseInt(s.slice(1, 7), 16);
    return Number.isFinite(n) && s.length >= 4 ? n : 0xffcc33;
  }

  /**
   * Mirrors the **Quickview on** client setting (`quickViewEnabled`: menubar, hotkey, settings sheet).
   */
  static async _onQuickViewEnabledSettingChange(value) {
    if (!game.user.isGM) return;
    if (value) {
      if (!canvas?.scene) {
        await setSettingSafely(MODULE.ID, 'quickViewEnabled', false);
        postConsoleAndNotification(MODULE.NAME, 'Quick View: No active scene', '', false, false);
        try {
          MenuBar.renderMenubar();
        } catch {
          /* ignore */
        }
        return;
      }
      if (!this._isActive) await this.activate();
    } else {
      await this.deactivate({ syncSetting: false });
    }
    try {
      MenuBar.renderMenubar();
    } catch {
      /* ignore */
    }
  }

  /**
   * Toggle clarity mode on/off
   * @returns {boolean} New active state
   */
  static async toggle() {
    if (!game.user.isGM) return this._isActive;
    if (!getSettingSafely(MODULE.ID, 'enableQuickViewFeature', true)) return this._isActive;
    const next = !getSettingSafely(MODULE.ID, 'quickViewEnabled', false);
    const saved = await setSettingSafely(MODULE.ID, 'quickViewEnabled', next);
    if (saved) {
      try {
        // Idempotent with the settings `onChange` handler; ensures canvas matches even if core `set` does not await `onChange`.
        await this._onQuickViewEnabledSettingChange(!!next);
      } catch {
        /* module cycling */
      }
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
  static async activate() {
    if (this._isActive) return;

    if (!getSettingSafely(MODULE.ID, 'enableQuickViewFeature', true)) return;

    if (!game.user.isGM) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Only GMs can use clarity mode', '', false, false);
      return;
    }

    if (!canvas.scene) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: No active scene', '', false, false);
      await setSettingSafely(MODULE.ID, 'quickViewEnabled', false);
      return;
    }

    try {
      // Fresh baseline + slider: user may have changed Darkness overlay strength while Quickview was off.
      this._priorIlluminationUniformValue = undefined;
      this._originalDarknessFilterAlpha = undefined;

      this._applyLightingBoost();

      // Allow GM to see the whole scene (disable token-only vision)
      this._applyTokenVisionOverride();

      // Make fog more transparent
      this._applyFogTransparency();

      this._isActive = true;
      this._syncVisibilityReveal();
      try {
        canvas.visibility?.restrictVisibility?.();
      } catch {
        /* ignore */
      }
      this._scheduleQuickViewTokens();
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Clarity mode activated', '', true, false);
      try {
        MenuBar.renderMenubar();
      } catch {
        /* ignore */
      }
    } catch (error) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error activating clarity mode', error, false, true);
    }
  }

  /**
   * Deactivate clarity mode
   * @param {{ syncSetting?: boolean }} [options] - When `syncSetting` is true (default), clears `quickViewEnabled` if still on.
   */
  static async deactivate({ syncSetting = true } = {}) {
    if (!this._isActive) return;

    try {
      this._restoreLightingBoost();

      // Restore token vision requirement
      this._restoreTokenVisionOverride();

      // Restore fog opacity
      this._restoreFogTransparency();

      // Remove token overlays
      this._hideAllTokens();

      this._tokenIdsNeedingHatch.clear();
      if (this._tokenRevealOuterRaf !== null) {
        cancelAnimationFrame(this._tokenRevealOuterRaf);
        this._tokenRevealOuterRaf = null;
      }
      if (this._tokenRevealInnerRaf !== null) {
        cancelAnimationFrame(this._tokenRevealInnerRaf);
        this._tokenRevealInnerRaf = null;
      }
      if (this._refreshTokenDebounceTid !== null) {
        clearTimeout(this._refreshTokenDebounceTid);
        this._refreshTokenDebounceTid = null;
      }
      this._isActive = false;
      this._syncVisibilityReveal();
      try {
        canvas.visibility?.refreshVisibility?.();
      } catch {
        /* ignore */
      }
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Clarity mode deactivated', '', true, false);
    } catch (error) {
      postConsoleAndNotification(MODULE.NAME, 'Quick View: Error deactivating clarity mode', error, false, true);
    }

    if (syncSetting && game.user.isGM && getSettingSafely(MODULE.ID, 'quickViewEnabled', false)) {
      await setSettingSafely(MODULE.ID, 'quickViewEnabled', false);
    }
    try {
      MenuBar.renderMenubar();
    } catch {
      /* ignore */
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
   * Let GM see the whole scene by disabling token-only vision when the legacy sight layer exists.
   * v13+ often has no `canvas.sight`; token hiding is undone in `_syncQuickViewHatchAfterRestrict` instead.
   */
  static _applyTokenVisionOverride() {
    try {
      const sight = canvas.sight;
      if (!sight || typeof sight.tokenVision !== 'boolean') return;
      if (this._originalTokenVision === null) {
        this._originalTokenVision = sight.tokenVision;
      }
      sight.tokenVision = false;
    } catch (error) {
      console.error('Clarity debug — error applying token vision override:', error);
    }
  }

  /**
   * Restore original token-only vision behavior
   */
  static _restoreTokenVisionOverride() {
    try {
      const sight = canvas.sight;
      if (!sight || typeof sight.tokenVision !== 'boolean') {
        this._originalTokenVision = null;
        return;
      }
      if (this._originalTokenVision !== null) {
        sight.tokenVision = this._originalTokenVision;
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
   * Run after the visibility pipeline finishes (double rAF) so core finishes culling before we un-hide.
   */
  static _scheduleQuickViewTokens() {
    if (!game.user.isGM || !this._isActive || !canvas?.tokens) return;
    if (this._tokenRevealOuterRaf !== null) cancelAnimationFrame(this._tokenRevealOuterRaf);
    if (this._tokenRevealInnerRaf !== null) cancelAnimationFrame(this._tokenRevealInnerRaf);
    this._tokenRevealOuterRaf = requestAnimationFrame(() => {
      this._tokenRevealOuterRaf = null;
      this._tokenRevealInnerRaf = requestAnimationFrame(() => {
        this._tokenRevealInnerRaf = null;
        this._reapplyGmTokenVisibilityAndOverlays();
      });
    });
  }

  static _debouncedScheduleQuickViewTokens() {
    if (!game.user.isGM || !this._isActive) return;
    if (this._refreshTokenDebounceTid !== null) clearTimeout(this._refreshTokenDebounceTid);
    this._refreshTokenDebounceTid = setTimeout(() => {
      this._refreshTokenDebounceTid = null;
      this._scheduleQuickViewTokens();
    }, 16);
  }

  /**
   * Only touch the token container and its primary mesh. Do not recurse into children or force
   * `alpha` / `renderable` on the whole subtree — that corrupts Foundry’s token draw pipeline and
   * produces the global “mystery token” / missing-art fallback.
   */
  static _forceTokenVisibleForGM(token) {
    if (!token) return;
    try {
      token.visible = true;
      const mesh = token.mesh;
      if (mesh) mesh.visible = true;
    } catch {
      /* ignore */
    }
  }

  /**
   * True when a token should be visually flagged in Clarity mode: sheet-hidden, or its center lies
   * outside the current vision polygon. GMs often keep `token.visible === true` after
   * `restrictVisibility`, so we use `CanvasVisibility#testVisibility` instead of `token.visible`.
   */
  static _needsSightHighlight(token) {
    if (!token?.document || token.isPreview) return false;
    if (token.document.hidden) return true;

    const cv = canvas?.visibility;
    if (cv?.tokenVision === false) return false;

    const center = token.center;
    if (cv && typeof cv.testVisibility === 'function' && center) {
      try {
        return !cv.testVisibility(center, { object: token, tolerance: 4 });
      } catch {
        /* fall through */
      }
    }

    try {
      return token.isVisible === false;
    } catch {
      return false;
    }
  }

  /**
   * Run synchronously right after core `restrictVisibility` (libWrapper). Evaluate sight before
   * forcing GM visibility so `testVisibility` / `isVisible` still match the core pass.
   */
  static _syncQuickViewHatchAfterRestrict() {
    if (!getSettingSafely(MODULE.ID, 'enableQuickViewFeature', true)) return;
    if (!game.user.isGM || !this._isActive || !canvas.tokens) return;

    const needHatch = new Set();
    for (const token of canvas.tokens.placeables) {
      if (!token?.document || token.isPreview) continue;

      const markHatch = this._needsSightHighlight(token);

      this._forceTokenVisibleForGM(token);

      if (markHatch) needHatch.add(token.id);
    }
    this._setTokenHatchIds(needHatch);
  }

  /**
   * After hover / refresh: keep existing hatch IDs; only re-force GM visibility and redraw highlights.
   */
  static _reapplyGmTokenVisibilityAndOverlays() {
    if (!game.user.isGM || !this._isActive || !canvas.tokens) return;

    for (const token of canvas.tokens.placeables) {
      if (!token?.document || token.isPreview) continue;
      this._forceTokenVisibleForGM(token);
    }
    this._showAllTokens();
  }

  /**
   * Stores which token IDs get the sight highlight (sync pass after `restrictVisibility`).
   */
  static _setTokenHatchIds(ids) {
    this._tokenIdsNeedingHatch.clear();
    for (const id of ids) this._tokenIdsNeedingHatch.add(id);
    if (this._isActive) this._showAllTokens();
  }

  static _ensureSightHighlightLayer() {
    const iface = canvas?.interface;
    if (!iface) return null;

    if (
      this._sightHighlightLayer
      && !this._sightHighlightLayer.destroyed
      && this._sightHighlightLayer.parent === iface
    ) {
      return this._sightHighlightLayer;
    }

    const layer = new PIXI.Container();
    layer.name = 'coffee-pub-blacksmith-quickview-sight-highlights';
    layer.eventMode = 'none';
    layer.interactiveChildren = false;
    layer.sortableChildren = true;
    layer.zIndex = 7;
    iface.sortableChildren = true;
    iface.addChild(layer);
    this._sightHighlightLayer = layer;
    return layer;
  }

  static _destroySightHighlightLayer() {
    const layer = this._sightHighlightLayer;
    if (!layer || layer.destroyed) {
      this._sightHighlightLayer = null;
      return;
    }
    try {
      if (layer.parent) layer.parent.removeChild(layer);
      layer.destroy({ children: true });
    } catch {
      /* ignore */
    }
    this._sightHighlightLayer = null;
  }

  /**
   * Rounded rect in scene space on `canvas.interface` so it is not dimmed with the token mesh.
   */
  static _addTokenSightHighlight(token) {
    if (!token?.mesh) return;

    this._removeTokenOverlay(token);

    const w = token.w;
    const h = token.h;
    const c = token.center;
    if (!w || !h || !c) return;

    const layer = this._ensureSightHighlightLayer();
    if (!layer) return;

    const corner = Math.min(8, Math.min(w, h) * 0.12);
    const g = new PIXI.Graphics();
    g.name = 'clarity-token-sight-highlight';
    g.lineStyle(4, this._sightHighlightColorNumber(), 1);
    g.drawRoundedRect(-w / 2, -h / 2, w, h, corner);
    g.position.set(c.x, c.y);
    g.rotation = token.rotation;
    g.eventMode = 'none';
    g.interactive = false;
    g.zIndex = 1;

    layer.addChild(g);
    this._tokenOverlays.set(token.id, { token, overlay: g });
  }

  /**
   * Outline tokens in `_tokenIdsNeedingHatch` (outside controlled sight or hidden from players).
   */
  static _showAllTokens() {
    if (!this._isActive || !canvas.tokens) return;

    for (const token of canvas.tokens.placeables) {
      if (!token?.document) continue;

      this._removeTokenOverlay(token);

      if (this._tokenIdsNeedingHatch.has(token.id)) {
        this._addTokenSightHighlight(token);
      }
    }
  }

  /**
   * Remove hatched overlay from a token
   */
  static _removeTokenOverlay(token) {
    if (!token) return;

    // First try direct lookup from map
    const tracked = this._tokenOverlays.get(token.id);
    if (tracked?.overlay) {
      try {
        if (tracked.overlay.parent) tracked.overlay.parent.removeChild(tracked.overlay);
        tracked.overlay.destroy({ children: true });
      } catch (e) {
        // ignore
      }
      this._tokenOverlays.delete(token.id);
      return;
    }

    // Fallback: legacy child on the token container
    const overlay = token.getChildByName?.('clarity-token-overlay');
    if (!overlay) return;

    try {
      overlay.destroy({ children: true });
    } catch (e) {
      // ignore
    }
  }

  /**
   * Remove a tracked overlay by token id (used when a token is deleted from the canvas).
   * @param {string} tokenId
   */
  static _removeTokenOverlayById(tokenId) {
    if (!tokenId) return;
    const tracked = this._tokenOverlays.get(tokenId);
    if (!tracked?.overlay) return;
    try {
      if (tracked.overlay.parent) tracked.overlay.parent.removeChild(tracked.overlay);
      if (!tracked.overlay.destroyed) tracked.overlay.destroy({ children: true });
    } catch {
      /* ignore */
    }
    this._tokenOverlays.delete(tokenId);
  }

  /**
   * Remove all token overlays
   */
  static _hideAllTokens() {
    for (const data of this._tokenOverlays.values()) {
      try {
        const o = data?.overlay;
        if (o) {
          if (o.parent) o.parent.removeChild(o);
          if (!o.destroyed) o.destroy({ children: true });
        }
      } catch {
        /* ignore */
      }
    }
    this._tokenOverlays.clear();
    this._destroySightHighlightLayer();
  }

  /**
   * Handle scene changes - deactivate clarity mode when scene changes
   */
  static onSceneChange() {
    if (this._isActive) void this.deactivate({ syncSetting: true });
  }

  /**
   * Apply persisted `quickViewEnabled` when the canvas is (or becomes) ready. Runs on `canvasReady` and once after
   * registration so a late `initialize()` (e.g. dynamic import after the first `canvasReady`) does not miss activation.
   * No-ops if `game.user` is not ready yet (can happen during very early `ready`).
   */
  static async _syncCanvasWithQuickViewSetting() {
    if (!game?.user?.isGM || !getSettingSafely(MODULE.ID, 'enableQuickViewFeature', true)) return;
    try {
      if (getSettingSafely(MODULE.ID, 'quickViewEnabled', false) && !this._isActive && canvas?.ready && canvas?.scene) {
        await this.activate();
      }
      this._resyncAfterCanvasReady();
    } catch (e) {
      console.error('Coffee Pub Blacksmith | Quick View canvas sync failed', e);
    }
  }

  static _resyncAfterCanvasReady() {
    if (!this._isActive || !game?.user?.isGM) return;

    this._originalFogOpacity = undefined;
    this._originalTokenVision = null;
    this._priorIlluminationUniformValue = undefined;
    this._originalDarknessFilterAlpha = undefined;
    this._hideAllTokens();

    this._applyLightingBoost();
    this._applyTokenVisionOverride();
    this._applyFogTransparency();
    if (canvas.visibility) this._onDrawCanvasVisibility(canvas.visibility);
    this._syncVisibilityReveal();
    try {
      canvas.visibility?.restrictVisibility?.();
    } catch {
      /* ignore */
    }
    this._scheduleQuickViewTokens();
  }

  static _onVisibilityRefresh(visibility) {
    if (!game.user.isGM || !visibility) return;
    if (!visibility.getChildByName?.(this._REVEAL_CHILD_NAME)) {
      this._onDrawCanvasVisibility(visibility);
    } else {
      const g = visibility.getChildByName(this._REVEAL_CHILD_NAME);
      if (g) g.visible = this._isActive;
    }
    if (this._isActive) this._scheduleQuickViewTokens();
  }

  /**
   * Register hooks and keybinding. Quickview is toggled from the left start menu (hamburger), not a main-bar tool.
   * Call only when `enableQuickViewFeature` is true (see `blacksmith.js`); idempotent.
   */
  static initialize() {
    if (!getSettingSafely(MODULE.ID, 'enableQuickViewFeature', true)) return;
    if (this._moduleInitialized) return;
    this._moduleInitialized = true;

    Hooks.on('canvasReady', () => {
      void this._syncCanvasWithQuickViewSetting();
    });
    void this._syncCanvasWithQuickViewSetting();

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
      if (this._isActive) this._scheduleQuickViewTokens();
    });

    Hooks.on('createToken', () => {
      if (!this._isActive) return;
      try {
        canvas.visibility?.restrictVisibility?.();
      } catch {
        /* ignore */
      }
    });

    Hooks.on('updateToken', () => {
      if (!this._isActive) return;
      try {
        canvas.visibility?.restrictVisibility?.();
      } catch {
        /* ignore */
      }
    });

    Hooks.on('deleteToken', (_scene, tokenData) => {
      if (!this._isActive || !game.user.isGM) return;
      const tokenId = tokenData?.id ?? tokenData?._id;
      if (!tokenId) return;

      this._tokenIdsNeedingHatch.delete(tokenId);
      this._removeTokenOverlayById(tokenId);

      try {
        canvas.visibility?.restrictVisibility?.();
      } catch {
        /* ignore */
      }
      this._debouncedScheduleQuickViewTokens();
    });

    Hooks.on('controlToken', () => {
      if (!this._isActive) return;
      this._applyLightingBoost();
      this._applyTokenVisionOverride();
      this._sightRefreshReveal(canvas?.visibility);
      try {
        canvas.visibility?.restrictVisibility?.();
      } catch {
        /* ignore */
      }
    });

    Hooks.on('hoverToken', () => {
      if (!this._isActive || !game.user.isGM) return;
      this._scheduleQuickViewTokens();
    });

    Hooks.on('refreshToken', () => {
      if (!this._isActive || !game.user.isGM) return;
      this._debouncedScheduleQuickViewTokens();
    });

    postConsoleAndNotification(MODULE.NAME, 'Quick View Utility: Initialized', '', true, false);
    this._registerQuickViewKeybinding();
  }

  /**
   * Foundry expects keybindings during `init`; registering only in `ready` can omit them from Configure Controls.
   * Safe to call multiple times (e.g. init + ready + initialize fallback for late loads).
   */
  static _registerQuickViewKeybinding() {
    if (this._quickViewKeybindingRegistered || !game?.keybindings?.register) return;
    const controlMod = typeof KeyboardManager !== 'undefined' && KeyboardManager?.MODIFIER_KEYS?.CONTROL;
    const modifiers = controlMod != null ? [controlMod] : ['Control'];
    try {
      const precedence =
        typeof CONST !== 'undefined' && CONST.KEYBINDING_PRECEDENCE_NORMAL !== undefined
          ? CONST.KEYBINDING_PRECEDENCE_NORMAL
          : undefined;
      game.keybindings.register(MODULE.ID, 'toggleQuickView', {
        name: MODULE.ID + '.keybindingQuickViewToggle-Name',
        hint: MODULE.ID + '.keybindingQuickViewToggle-Hint',
        editable: [{ key: 'KeyQ', modifiers }],
        restricted: true,
        ...(precedence !== undefined ? { precedence } : {}),
        onDown: () => {
          if (!game.user?.isGM) return;
          if (!getSettingSafely(MODULE.ID, 'enableQuickViewFeature', true)) return;
          void QuickViewUtility.toggle();
        }
      });
      this._quickViewKeybindingRegistered = true;
    } catch (e) {
      console.error('Coffee Pub Blacksmith | Quick View keybinding registration failed', e);
    }
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

}
