import { MODULE } from './const.js';
import { getSettingSafely, postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';

export class TokenIndicatorManager {
    static _initialized = false;

    static _turnIndicator = null;
    static _currentTurnTokenId = null;
    static _turnAnimation = null;
    static _turnFadeAnimation = null;
    static _movementTimeout = null;
    static _isMoving = false;

    /** Composite key: `tokenId` (global colors) or `tokenId::userId` (per-player colors). */
    static _targetedIndicators = new Map();
    static _targetedAnimations = new Map();
    /** Token ids that have at least one targeting user (for movement / visibility updates). */
    static _targetedTokens = new Set();
    /** @type {Map<string, Set<string>>} userId -> set of targeted token document ids (all clients, not just game.user) */
    static _targetsByUser = new Map();

    static _hideTargetsAnimationId = null;

    /** @type {Map<string, PIXI.Container>} tokenId -> portrait stack container shown above targeted token */
    static _targetPortraits = new Map();

    static _hookIds = {};

    static initialize() {
        if (this._initialized) return;
        this._initialized = true;

        this._registerHooks();
        this.refreshAll();
    }

    static _registerHooks() {
        this._hookIds.updateCombat = HookManager.registerHook({
            name: 'updateCombat',
            description: 'Token indicators: refresh current turn indicator',
            context: 'token-indicators',
            priority: 3,
            callback: (_combat, changes) => {
                const combatTurnish = changes.turn !== undefined || changes.round !== undefined
                    || changes.combatantId !== undefined || changes.started !== undefined;
                if (!combatTurnish) return;
                this._updateTurnIndicator();
                this._clearTargetsForUsersWithSetting();
                if (getSettingSafely(MODULE.ID, 'targetedIndicatorUsePlayerColor', false)
                    && getSettingSafely(MODULE.ID, 'targetedIndicatorEnabled', true)
                    && getSettingSafely(MODULE.ID, 'generalIndicatorsEnabled', true)) {
                    this._rebuildTargetedIndicatorGraphics();
                }
            }
        });

        this._hookIds.deleteCombat = HookManager.registerHook({
            name: 'deleteCombat',
            description: 'Token indicators: clear turn indicator on combat delete',
            context: 'token-indicators',
            priority: 3,
            callback: () => {
                this._removeTurnIndicator();
                this._rebuildTargetedIndicatorGraphics();
            }
        });

        this._hookIds.updateToken = HookManager.registerHook({
            name: 'updateToken',
            description: 'Token indicators: track token movement and visibility',
            context: 'token-indicators',
            priority: 3,
            callback: (tokenDocument, changes) => {
                this._onTokenUpdate(tokenDocument, changes);
            }
        });

        this._hookIds.deleteToken = HookManager.registerHook({
            name: 'deleteToken',
            description: 'Token indicators: cleanup indicators for deleted tokens',
            context: 'token-indicators',
            priority: 3,
            callback: (_scene, tokenData) => {
                this._onTokenDeleted(tokenData);
            }
        });

        this._hookIds.targetToken = HookManager.registerHook({
            name: 'targetToken',
            description: 'Token indicators: update custom target indicators',
            context: 'token-indicators',
            priority: 3,
            callback: (user, token, targeted) => {
                this._onTargetingChange(user, token, targeted);
            }
        });

        this._hookIds.canvasReady = HookManager.registerHook({
            name: 'canvasReady',
            description: 'Token indicators: refresh after scene load',
            context: 'token-indicators',
            priority: 3,
            callback: () => {
                this.refreshAll();
            }
        });

        this._hookIds.updateUser = HookManager.registerHook({
            name: 'updateUser',
            description: 'Token indicators: clear target set when a user disconnects',
            context: 'token-indicators',
            priority: 3,
            callback: (user, changes) => {
                if (changes.active === false && user?.id) {
                    this._targetsByUser.delete(user.id);
                    this._syncTargetedIndicators();
                }
            }
        });

        this._hookIds.refreshToken = HookManager.registerHook({
            name: 'refreshToken',
            description: 'Token indicators: hide native target markers on refresh',
            context: 'token-indicators',
            priority: 3,
            callback: (token) => {
                this._hideTokenTargetIndicators(token);
            }
        });

        this._hookIds.settingChange = HookManager.registerHook({
            name: 'settingChange',
            description: 'Token indicators: refresh when indicator settings change',
            context: 'token-indicators',
            priority: 3,
            callback: (module, key) => {
                if (module !== MODULE.ID) return;
                const watchedKeys = new Set([
                    'generalIndicatorsEnabled',
                    'generalIndicatorsThickness',
                    'generalIndicatorsOffset',
                    'generalIndicatorsOpacityMin',
                    'generalIndicatorsOpacityMax',
                    'generalIndicatorsOpacityInner',
                    'turnIndicatorCurrentStyle',
                    'turnIndicatorCurrentAnimation',
                    'turnIndicatorCurrentAnimationSpeed',
                    'turnIndicatorCurrentBorderColor',
                    'turnIndicatorCurrentBackgroundColor',
                    'targetedIndicatorEnabled',
                    'targetedIndicatorStyle',
                    'targetedIndicatorAnimation',
                    'targetedIndicatorAnimationSpeed',
                    'targetedIndicatorBorderColor',
                    'targetedIndicatorBackgroundColor',
                    'hideDefaultTargetIndicators',
                    'targetedIndicatorUsePlayerColor',
                    'targetedIndicatorBorderThickness',
                    'targetedPortraitsEnabled',
                    'targetedPortraitsSize',
                    'targetedPortraitsShape'
                ]);
                if (!watchedKeys.has(key)) return;
                this.refreshAll();
            }
        });

        Hooks.once('ready', () => {
            HookManager.registerHook({
                name: 'unloadModule',
                description: 'Token indicators: cleanup on unload',
                context: 'token-indicators-cleanup',
                priority: 3,
                callback: (moduleId) => {
                    if (moduleId === MODULE.ID) this.cleanup();
                }
            });
        });
    }

    static refreshAll() {
        if (!getSettingSafely(MODULE.ID, 'generalIndicatorsEnabled', true)) {
            this._stopHideTargetIndicatorsLoop();
            this._removeTurnIndicator();
            this._removeAllTargetedIndicators();
            return;
        }
        this._refreshDefaultTargetIndicatorHiding();
        this._updateTurnIndicator();
        this._seedTargetsFromUserTargets();
        this._rebuildTargetedIndicatorGraphics();
    }

    static cleanup() {
        this._removeTurnIndicator();
        this._removeAllTargetedIndicators();
        this._stopHideTargetIndicatorsLoop();
        this._targetsByUser.clear();
    }

    static _getTurnSettings() {
        const borderHex = getSettingSafely(MODULE.ID, 'turnIndicatorCurrentBorderColor', '#03c602');
        const backgroundHex = getSettingSafely(MODULE.ID, 'turnIndicatorCurrentBackgroundColor', '#03c602');
        const animation = getSettingSafely(MODULE.ID, 'turnIndicatorCurrentAnimation', 'pulse');
        return {
            style: getSettingSafely(MODULE.ID, 'turnIndicatorCurrentStyle', 'solid'),
            animation,
            color: Number.parseInt(borderHex.replace('#', '0x')),
            innerColor: Number.parseInt(backgroundHex.replace('#', '0x')),
            thickness: getSettingSafely(MODULE.ID, 'generalIndicatorsThickness', 10),
            offset: getSettingSafely(MODULE.ID, 'generalIndicatorsOffset', 8),
            pulseMin: getSettingSafely(MODULE.ID, 'generalIndicatorsOpacityMin', 0.3),
            pulseMax: getSettingSafely(MODULE.ID, 'generalIndicatorsOpacityMax', 0.8),
            innerOpacity: getSettingSafely(MODULE.ID, 'generalIndicatorsOpacityInner', 0.3),
            pulseSpeed: this._mapSpeedToAnimationSpeed(getSettingSafely(MODULE.ID, 'turnIndicatorCurrentAnimationSpeed', 5), animation)
        };
    }

    static _getTargetedSettings(overrides = {}) {
        const borderRaw = getSettingSafely(MODULE.ID, 'targetedIndicatorBorderColor', '#a51214');
        const backgroundRaw = getSettingSafely(MODULE.ID, 'targetedIndicatorBackgroundColor', '#a51214');
        const borderHex = this._coerceColorSettingToHex(borderRaw, '#a51214');
        const backgroundHex = this._coerceColorSettingToHex(backgroundRaw, '#a51214');
        const animation = getSettingSafely(MODULE.ID, 'targetedIndicatorAnimation', 'pulse');
        const thickRaw = Number(getSettingSafely(MODULE.ID, 'targetedIndicatorBorderThickness', 3));
        const thickness = Math.min(10, Math.max(1, Number.isFinite(thickRaw) ? thickRaw : 3));
        const borderNum = Number.parseInt(borderHex.replace('#', '0x'), 16);
        const innerNum = Number.parseInt(backgroundHex.replace('#', '0x'), 16);
        const base = {
            style: getSettingSafely(MODULE.ID, 'targetedIndicatorStyle', 'solid'),
            animation,
            color: Number.isFinite(borderNum) ? borderNum : 0xa51214,
            innerColor: Number.isFinite(innerNum) ? innerNum : 0xa51214,
            thickness,
            offset: getSettingSafely(MODULE.ID, 'generalIndicatorsOffset', 8),
            pulseMin: getSettingSafely(MODULE.ID, 'generalIndicatorsOpacityMin', 0.3),
            pulseMax: getSettingSafely(MODULE.ID, 'generalIndicatorsOpacityMax', 0.8),
            innerOpacity: getSettingSafely(MODULE.ID, 'generalIndicatorsOpacityInner', 0.3),
            pulseSpeed: this._mapSpeedToAnimationSpeed(getSettingSafely(MODULE.ID, 'targetedIndicatorAnimationSpeed', 5), animation)
        };
        return { ...base, ...overrides };
    }

    /**
     * Normalize a setting value (string hex, {@link foundry.utils.Color}, number) to #RRGGBB for PIXI parsing.
     */
    static _coerceColorSettingToHex(raw, fallbackHex) {
        if (raw == null || raw === '') return fallbackHex;
        if (typeof raw === 'string') {
            const t = raw.trim();
            if (/^#[0-9a-fA-F]{3}$/.test(t) || /^#[0-9a-fA-F]{6}$/.test(t) || /^#[0-9a-fA-F]{8}$/.test(t)) {
                return t.length === 4 ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}` : t.slice(0, 7);
            }
            if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t}`;
            return fallbackHex;
        }
        try {
            const Color = globalThis.foundry?.utils?.Color;
            if (Color?.from) {
                const c = Color.from(raw);
                if (c != null) {
                    const n = Number(c);
                    if (Number.isFinite(n)) {
                        return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
                    }
                }
            }
        } catch (_e) {
            /* use fallback */
        }
        return fallbackHex;
    }

    /**
     * Users with OWNER on the active combatant's actor (whose "turn" it is for targeted fill).
     * @returns {Set<string>} user ids
     */
    static _getActiveCombatTurnOwnerUserIds() {
        const set = new Set();
        const combat = game.combats?.active;
        if (!combat?.started) return set;
        const combatant = combat.combatant;
        if (!combatant) return set;
        const OWN = typeof CONST !== 'undefined' && CONST.DOCUMENT_OWNERSHIP_LEVELS
            ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
            : 3;
        const actor = combatant.actor;
        if (actor) {
            for (const u of game.users) {
                if (!u.active) continue;
                try {
                    if (actor.testUserPermission(u, OWN)) set.add(u.id);
                } catch (_e) { /* */ }
            }
            return set;
        }
        const tokenDoc = combatant.token;
        if (tokenDoc?.actor) {
            const a = tokenDoc.actor;
            for (const u of game.users) {
                if (!u.active) continue;
                try {
                    if (a.testUserPermission(u, OWN)) set.add(u.id);
                } catch (_e) { /* */ }
            }
        }
        return set;
    }

    /** Remove all targeted ring graphics and redraw from `_targetsByUser` (e.g. turn changed, settings). */
    static _rebuildTargetedIndicatorGraphics() {
        for (const key of Array.from(this._targetedIndicators.keys())) {
            this._removeTargetedIndicatorByKey(key);
        }
        this._syncTargetedIndicators();
    }

    /**
     * Parse a hex string to PIXI-compatible 0xRRGGBB.
     * @param {string} hex
     * @returns {number|null}
     */
    static _hexStringToPixiColor(hex) {
        if (typeof hex !== 'string' || !hex.trim()) return null;
        const m = hex.trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
        if (!m) return null;
        let h = m[1];
        if (h.length === 3) {
            h = h.split('').map((c) => c + c).join('');
        }
        const n = Number.parseInt(h, 16);
        return Number.isFinite(n) ? n : null;
    }

    /**
     * Resolve Foundry `User#color` (ColorField: {@link foundry.utils.Color}, number, or CSS string) to PIXI 0xRRGGBB.
     * v13 does not expose player color as a plain string on `user.color` in all cases — string-only parsing missed it.
     * @param {User} user
     * @returns {number|null}
     */
    static _userPlayerColorToPixi(user) {
        if (!user) return null;
        const raw = user.color;
        if (raw == null || raw === '') return null;

        try {
            const Color = globalThis.foundry?.utils?.Color;
            if (Color?.from) {
                const c = Color.from(raw);
                if (c != null) {
                    const n = Number(c);
                    if (Number.isFinite(n)) return n >>> 0;
                }
            }
        } catch (_e) {
            /* fall through */
        }

        if (typeof raw === 'number' && Number.isFinite(raw)) {
            return raw >>> 0;
        }
        if (typeof raw === 'string') {
            return this._hexStringToPixiColor(raw);
        }
        const n = Number(raw);
        if (Number.isFinite(n)) {
            return n >>> 0;
        }
        return null;
    }

    /**
     * Target ring settings using a Foundry user's player color (border + inner fill).
     * @param {User} user
     * @returns {object} Same shape as _getTargetedSettings()
     */
    static _getTargetedSettingsForUserColor(user) {
        const base = this._getTargetedSettings();
        const pixi = this._userPlayerColorToPixi(user);
        if (pixi == null) return base;
        return {
            ...base,
            color: pixi,
            innerColor: pixi
        };
    }

    static _mapSpeedToAnimationSpeed(userSpeed, animationType) {
        switch (animationType) {
            case 'pulse': return 0.005 + (userSpeed - 1) * (0.095 / 9);
            case 'rotate': return 0.001 + (userSpeed - 1) * (0.049 / 9);
            case 'wobble': return 0.005 + (userSpeed - 1) * (0.075 / 9);
            default: return 0.005 + (userSpeed - 1) * (0.095 / 9);
        }
    }

    static _updateTurnIndicator() {
        this._removeTurnIndicator();

        if (!getSettingSafely(MODULE.ID, 'generalIndicatorsEnabled', true)) return;
        if (!game.combat?.started) return;

        const tokenId = game.combat.combatant?.token?.id;
        if (!tokenId) return;

        const token = canvas.tokens?.get(tokenId);
        if (!this._canUserSeeToken(token)) return;

        this._createTurnIndicator(token);
    }

    static _createTurnIndicator(token) {
        const settings = this._getTurnSettings();
        const graphics = new PIXI.Graphics();
        const ringRadius = this._getRingRadius(token, settings);
        this._drawIndicator(graphics, settings, ringRadius);

        const center = this._calculateTokenCenter(token);
        graphics.position.set(center.x, center.y);
        graphics.zIndex = 10;

        canvas.interface?.addChild(graphics);
        this._turnIndicator = graphics;
        this._currentTurnTokenId = token.id;

        this._createTurnAnimation(settings);
    }

    static _removeTurnIndicator() {
        if (this._turnAnimation) {
            canvas.app?.ticker?.remove(this._turnAnimation);
            this._turnAnimation = null;
        }
        if (this._turnFadeAnimation) {
            canvas.app?.ticker?.remove(this._turnFadeAnimation);
            this._turnFadeAnimation = null;
        }
        if (this._movementTimeout) {
            clearTimeout(this._movementTimeout);
            this._movementTimeout = null;
        }
        if (this._turnIndicator) {
            if (canvas.interface && this._turnIndicator.parent) {
                canvas.interface.removeChild(this._turnIndicator);
            }
            if (!this._turnIndicator.destroyed) {
                this._turnIndicator.destroy();
            }
        }
        this._turnIndicator = null;
        this._currentTurnTokenId = null;
        this._isMoving = false;
    }

    static _createTurnAnimation(settings) {
        if (!this._turnIndicator || settings.animation === 'fixed') return;

        let time = 0;
        this._turnAnimation = (delta) => {
            if (!this._turnIndicator || this._turnIndicator.destroyed) return;
            time += delta * settings.pulseSpeed;
            if (settings.animation === 'pulse') {
                const alpha = settings.pulseMin + ((Math.sin(time) + 1) / 2) * (settings.pulseMax - settings.pulseMin);
                this._turnIndicator.alpha = alpha;
            } else if (settings.animation === 'rotate') {
                this._turnIndicator.rotation = time;
            } else if (settings.animation === 'wobble') {
                const scaleFactor = 1 + (Math.sin(time) * 0.05);
                this._turnIndicator.scale.set(scaleFactor);
            }
        };
        canvas.app?.ticker?.add(this._turnAnimation);
    }

    static _onTokenUpdate(tokenDocument, changes) {
        const tokenId = tokenDocument?.id;
        if (!tokenId) return;

        if (changes.hidden !== undefined) {
            this._handleTokenVisibilityChange(tokenDocument);
        }

        if ((changes.x !== undefined || changes.y !== undefined) && tokenId === this._currentTurnTokenId) {
            const token = canvas.tokens?.get(tokenId);
            if (token) {
                if (!this._isMoving) this._startMovementFade();
                this._updateTurnIndicatorPosition(token, changes);
                this._scheduleMovementComplete();
            }
        }

        if ((changes.x !== undefined || changes.y !== undefined) && this._targetedTokens.has(tokenId)) {
            this._updateTargetedIndicatorPosition(tokenId, changes);
        }
    }

    static _onTokenDeleted(tokenData) {
        const tokenId = tokenData?.id ?? tokenData?._id;
        if (!tokenId) return;

        if (tokenId === this._currentTurnTokenId) {
            this._removeTurnIndicator();
        }

        this._removeTargetedRingsForToken(tokenId);
        this._targetedTokens.delete(tokenId);

        for (const set of this._targetsByUser.values()) {
            set?.delete?.(tokenId);
        }
    }

    static _startMovementFade() {
        if (!this._turnIndicator) return;
        this._isMoving = true;
        if (this._turnFadeAnimation) {
            canvas.app?.ticker?.remove(this._turnFadeAnimation);
        }

        const startAlpha = this._turnIndicator.alpha;
        const targetAlpha = 0.1;
        const duration = 150;
        let elapsed = 0;

        this._turnFadeAnimation = (delta) => {
            if (!this._turnIndicator) return;
            elapsed += delta * 16.67;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 2);
            this._turnIndicator.alpha = startAlpha + ((targetAlpha - startAlpha) * eased);
            if (progress >= 1) {
                canvas.app?.ticker?.remove(this._turnFadeAnimation);
                this._turnFadeAnimation = null;
            }
        };

        canvas.app?.ticker?.add(this._turnFadeAnimation);
    }

    static _scheduleMovementComplete() {
        if (this._movementTimeout) clearTimeout(this._movementTimeout);
        this._movementTimeout = setTimeout(() => this._completeMovementFade(), 1000);
    }

    static _completeMovementFade() {
        if (!this._turnIndicator) return;
        this._isMoving = false;

        const settings = this._getTurnSettings();
        if (this._turnFadeAnimation) {
            canvas.app?.ticker?.remove(this._turnFadeAnimation);
        }

        const startAlpha = this._turnIndicator.alpha;
        const targetAlpha = settings.pulseMax;
        const duration = 200;
        let elapsed = 0;

        this._turnFadeAnimation = (delta) => {
            if (!this._turnIndicator) return;
            elapsed += delta * 16.67;
            const progress = Math.min(elapsed / duration, 1);
            const eased = progress * progress;
            this._turnIndicator.alpha = startAlpha + ((targetAlpha - startAlpha) * eased);
            if (progress >= 1) {
                canvas.app?.ticker?.remove(this._turnFadeAnimation);
                this._turnFadeAnimation = null;
            }
        };

        canvas.app?.ticker?.add(this._turnFadeAnimation);
    }

    static _updateTurnIndicatorPosition(token, changes = null) {
        if (!this._turnIndicator || this._currentTurnTokenId !== token.id) return;
        const center = this._calculateTokenCenter(token, changes);
        this._turnIndicator.x = center.x;
        this._turnIndicator.y = center.y;
    }

    static _onTargetingChange(user, token, targeted) {
        if (!getSettingSafely(MODULE.ID, 'generalIndicatorsEnabled', true)) return;
        if (!getSettingSafely(MODULE.ID, 'targetedIndicatorEnabled', true)) return;

        const tokenId = token?.id;
        if (!user?.id || !tokenId) return;

        let set = this._targetsByUser.get(user.id);
        if (!set) {
            set = new Set();
            this._targetsByUser.set(user.id, set);
        }
        if (targeted) {
            set.add(tokenId);
        } else {
            set.delete(tokenId);
        }

        this._syncTargetedIndicators();
    }

    /**
     * Populate per-user target sets from Foundry's synced User#targets (all connected users).
     */
    static _seedTargetsFromUserTargets() {
        this._targetsByUser.clear();
        for (const u of game.users) {
            if (!u.active) continue;
            const set = new Set();
            const tg = u.targets;
            if (tg) {
                if (typeof tg.forEach === 'function') {
                    tg.forEach((t) => {
                        const id = t?.id ?? t?.document?.id;
                        if (id) set.add(id);
                    });
                } else if (Array.isArray(tg)) {
                    for (const t of tg) {
                        const id = t?.id ?? t?.document?.id;
                        if (id) set.add(id);
                    }
                }
            }
            this._targetsByUser.set(u.id, set);
        }
    }

    /**
     * Ring radius for targeted tokens; optional layer for concentric rings when multiple users target one token.
     */
    static _getRingRadiusForTargeted(token, settings, layerIndex = 0) {
        const tokenWidth = token.document.width * canvas.grid.size;
        const tokenHeight = token.document.height * canvas.grid.size;
        const base = (Math.max(tokenWidth, tokenHeight) / 2) + settings.offset;
        const step = Math.max(4, Math.floor(settings.thickness * 0.65)) + 2;
        return base + layerIndex * step;
    }

    /**
     * Union of Foundry targets → custom ring graphics (visible to everyone who can see the token).
     * With `targetedIndicatorUsePlayerColor`, each targeting user gets a ring in their User Configuration color (concentric if needed).
     */
    static _syncTargetedIndicators() {
        if (!getSettingSafely(MODULE.ID, 'generalIndicatorsEnabled', true)) {
            this._removeAllTargetedIndicators();
            return;
        }

        const usePlayerColor = getSettingSafely(MODULE.ID, 'targetedIndicatorUsePlayerColor', false);

        /** @type {Set<string>} */
        const desiredKeys = new Set();

        if (usePlayerColor) {
            const byToken = new Map();
            for (const [userId, set] of this._targetsByUser.entries()) {
                const u = game.users.get(userId);
                if (!u?.active) continue;
                for (const tokenId of set) {
                    if (!byToken.has(tokenId)) byToken.set(tokenId, []);
                    byToken.get(tokenId).push(userId);
                }
            }
            for (const [, userIds] of byToken) {
                userIds.sort();
            }
            for (const [tokenId, userIds] of byToken) {
                for (const uid of userIds) {
                    desiredKeys.add(`${tokenId}::${uid}`);
                }
            }
        } else {
            for (const s of this._targetsByUser.values()) {
                for (const id of s) {
                    desiredKeys.add(id);
                }
            }
        }

        this._targetedTokens.clear();
        for (const s of this._targetsByUser.values()) {
            for (const id of s) {
                this._targetedTokens.add(id);
            }
        }

        for (const key of Array.from(this._targetedIndicators.keys())) {
            if (!desiredKeys.has(key)) {
                this._removeTargetedIndicatorByKey(key);
            }
        }

        if (!getSettingSafely(MODULE.ID, 'targetedIndicatorEnabled', true)) {
            this._removeAllTargetedIndicators();
            return;
        }

        if (usePlayerColor) {
            const byToken = new Map();
            for (const [userId, set] of this._targetsByUser.entries()) {
                const u = game.users.get(userId);
                if (!u?.active) continue;
                for (const tokenId of set) {
                    if (!byToken.has(tokenId)) byToken.set(tokenId, []);
                    byToken.get(tokenId).push(userId);
                }
            }
            for (const [, userIds] of byToken) {
                userIds.sort();
            }
            for (const [tokenId, userIds] of byToken) {
                for (let layer = 0; layer < userIds.length; layer++) {
                    const userId = userIds[layer];
                    const key = `${tokenId}::${userId}`;
                    if (this._targetedIndicators.has(key)) continue;
                    const token = canvas.tokens?.get(tokenId);
                    const user = game.users.get(userId);
                    if (!token || !user) continue;
                    if (!this._canUserSeeToken(token)) continue;
                    this._addTargetedIndicatorRing(token, user, layer, true);
                }
            }
        } else {
            for (const tokenId of desiredKeys) {
                if (this._targetedIndicators.has(tokenId)) continue;
                const token = canvas.tokens?.get(tokenId);
                if (!token) continue;
                if (!this._canUserSeeToken(token)) continue;
                this._addTargetedIndicatorRing(token, null, 0, false);
            }
        }

        this._syncTargetPortraits();
    }

    /**
     * @param {Token} token
     * @param {User|null} user — required when `usePlayerColor` is true (colors from `user.color`)
     * @param {number} layerIndex — concentric offset when multiple users target the same token
     * @param {boolean} usePlayerColor
     */
    static _addTargetedIndicatorRing(token, user, layerIndex, usePlayerColor) {
        const tokenId = token.id;
        const key = usePlayerColor && user ? `${tokenId}::${user.id}` : tokenId;

        if (!this._canUserSeeToken(token)) {
            this._removeTargetedIndicatorByKey(key);
            return;
        }
        if (this._targetedIndicators.has(key)) return;

        let settings = usePlayerColor && user
            ? this._getTargetedSettingsForUserColor(user)
            : this._getTargetedSettings();

        if (usePlayerColor && user) {
            const activeTurnOwners = this._getActiveCombatTurnOwnerUserIds();
            if (!activeTurnOwners.has(user.id)) {
                settings = { ...settings, innerOpacity: 0 };
            }
        }

        const ringRadius = this._getRingRadiusForTargeted(token, settings, layerIndex);

        const graphics = new PIXI.Graphics();
        this._drawIndicator(graphics, settings, ringRadius);

        const center = this._calculateTokenCenter(token);
        graphics.position.set(center.x, center.y);
        graphics.zIndex = 9;

        canvas.interface?.addChild(graphics);
        this._targetedIndicators.set(key, graphics);
        this._createTargetedAnimation(key, graphics, settings);
    }

    static _removeTargetedIndicatorByKey(key) {
        const graphics = this._targetedIndicators.get(key);
        if (graphics) {
            if (canvas.interface && graphics.parent) {
                canvas.interface.removeChild(graphics);
            }
            if (!graphics.destroyed) {
                graphics.destroy();
            }
            this._targetedIndicators.delete(key);
        }

        const animation = this._targetedAnimations.get(key);
        if (animation) {
            canvas.app?.ticker?.remove(animation);
            this._targetedAnimations.delete(key);
        }
    }

    /** Remove every targeted ring associated with a token id (both global and per-user keys). */
    static _removeTargetedRingsForToken(tokenId) {
        for (const key of Array.from(this._targetedIndicators.keys())) {
            if (key === tokenId || key.startsWith(`${tokenId}::`)) {
                this._removeTargetedIndicatorByKey(key);
            }
        }
        this._removeTargetPortraitsForToken(tokenId);
    }

    static _removeAllTargetedIndicators() {
        for (const key of Array.from(this._targetedIndicators.keys())) {
            this._removeTargetedIndicatorByKey(key);
        }
        this._targetedTokens.clear();
        this._removeAllTargetPortraits();
        // Keep _targetsByUser as the mirror of Foundry User#targets; refreshAll re-seeds if needed.
    }

    static _createTargetedAnimation(compositeKey, graphics, settings) {
        let time = 0;
        if (settings.animation === 'fixed') return;

        const update = (delta) => {
            if (!graphics || graphics.destroyed) return;
            time += delta * settings.pulseSpeed;
            if (settings.animation === 'pulse') {
                const alpha = settings.pulseMin + ((Math.sin(time) + 1) / 2) * (settings.pulseMax - settings.pulseMin);
                graphics.alpha = alpha;
            } else if (settings.animation === 'rotate') {
                graphics.rotation = time;
            } else if (settings.animation === 'wobble') {
                const scaleFactor = 1 + (Math.sin(time) * 0.05);
                graphics.scale.set(scaleFactor);
            }
        };

        this._targetedAnimations.set(compositeKey, update);
        canvas.app?.ticker?.add(update);
    }

    static _updateTargetedIndicatorPosition(tokenId, changes = null) {
        const token = canvas.tokens?.get(tokenId);
        if (!token) return;
        const center = this._calculateTokenCenter(token, changes);

        for (const key of this._targetedIndicators.keys()) {
            if (key !== tokenId && !key.startsWith(`${tokenId}::`)) continue;
            const graphics = this._targetedIndicators.get(key);
            if (graphics) {
                graphics.x = center.x;
                graphics.y = center.y;
            }
        }

        this._updateTargetPortraitPosition(tokenId, changes);
    }

    static _refreshDefaultTargetIndicatorHiding() {
        if (getSettingSafely(MODULE.ID, 'hideDefaultTargetIndicators', false)) {
            this._hideAllTargetIndicators();
            if (!this._hideTargetsAnimationId) {
                const loop = () => {
                    this._hideAllTargetIndicators();
                    this._hideTargetsAnimationId = requestAnimationFrame(loop);
                };
                loop();
            }
            return;
        }

        this._stopHideTargetIndicatorsLoop();
        for (const token of canvas.tokens?.placeables ?? []) {
            if (token.targetArrows) token.targetArrows.visible = true;
            if (token.targetPips) token.targetPips.visible = true;
        }
    }

    static _stopHideTargetIndicatorsLoop() {
        if (this._hideTargetsAnimationId) {
            cancelAnimationFrame(this._hideTargetsAnimationId);
            this._hideTargetsAnimationId = null;
        }
    }

    static _hideAllTargetIndicators() {
        for (const token of canvas.tokens?.placeables ?? []) {
            this._hideTokenTargetIndicators(token);
        }
    }

    static _hideTokenTargetIndicators(token) {
        if (!getSettingSafely(MODULE.ID, 'hideDefaultTargetIndicators', false)) return;
        if (token?.targetArrows) token.targetArrows.visible = false;
        if (token?.targetPips) token.targetPips.visible = false;
    }

    static _clearTargetsForUsersWithSetting() {
        if (!getSettingSafely(MODULE.ID, 'clearTargetsAfterTurn', false)) return;
        game.user?.targets?.clear();
        this._seedTargetsFromUserTargets();
        this._syncTargetedIndicators();
    }

    static _handleTokenVisibilityChange(tokenDocument) {
        const token = canvas.tokens?.get(tokenDocument.id);
        const canSee = this._canUserSeeToken(token);

        if (!canSee) {
            if (tokenDocument.id === this._currentTurnTokenId) this._removeTurnIndicator();
            this._removeTargetedRingsForToken(tokenDocument.id);
            return;
        }

        if (tokenDocument.id === this._currentTurnTokenId && !this._turnIndicator) {
            this._createTurnIndicator(token);
        }

        if (this._targetedTokens.has(tokenDocument.id) && !this._tokenHasAnyTargetedRing(tokenDocument.id)) {
            this._syncTargetedIndicators();
        }
    }

    /** Whether any composite key exists for this token (global or `tokenId::userId`). */
    static _tokenHasAnyTargetedRing(tokenId) {
        if (this._targetedIndicators.has(tokenId)) return true;
        const prefix = `${tokenId}::`;
        for (const k of this._targetedIndicators.keys()) {
            if (k.startsWith(prefix)) return true;
        }
        return false;
    }

    static _canUserSeeToken(token) {
        if (!token) return false;
        try {
            if (token.document?.testUserVisibility) {
                return token.document.testUserVisibility(game.user);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Token indicators: visibility check failed', { token: token.name, error }, true, false);
        }
        return token.visible !== undefined ? token.visible : true;
    }

    static _calculateTokenCenter(token, changes = null) {
        const tokenWidth = token.document.width * canvas.grid.size;
        const tokenHeight = token.document.height * canvas.grid.size;
        const tokenX = changes?.x !== undefined ? changes.x : token.x;
        const tokenY = changes?.y !== undefined ? changes.y : token.y;
        return { x: tokenX + (tokenWidth / 2), y: tokenY + (tokenHeight / 2) };
    }

    static _getRingRadius(token, settings) {
        const tokenWidth = token.document.width * canvas.grid.size;
        const tokenHeight = token.document.height * canvas.grid.size;
        return (Math.max(tokenWidth, tokenHeight) / 2) + settings.offset;
    }

    static _drawIndicator(graphics, settings, ringRadius) {
        switch (settings.style) {
            case 'dashed':
                this._drawDashedCircle(graphics, settings, ringRadius);
                break;
            case 'spikes':
                this._drawSpikedCircle(graphics, settings, ringRadius);
                break;
            case 'spikesIn':
                this._drawInwardSpikedCircle(graphics, settings, ringRadius);
                break;
            case 'roundedSquare':
                this._drawRoundedSquare(graphics, settings, ringRadius);
                break;
            case 'solid':
            default:
                this._drawSolidCircle(graphics, settings, ringRadius);
                break;
        }
    }

    static _drawSolidCircle(graphics, settings, ringRadius) {
        graphics.beginFill(settings.innerColor, settings.innerOpacity);
        graphics.drawCircle(0, 0, ringRadius);
        graphics.endFill();
        graphics.lineStyle(settings.thickness, settings.color, settings.pulseMax);
        graphics.drawCircle(0, 0, ringRadius);
    }

    static _drawDashedCircle(graphics, settings, ringRadius) {
        graphics.beginFill(settings.innerColor, settings.innerOpacity);
        graphics.drawCircle(0, 0, ringRadius);
        graphics.endFill();
        graphics.lineStyle(settings.thickness, settings.color, settings.pulseMax, 0.5, true);
        const dashCount = 8;
        const dashAngle = (Math.PI * 2) / dashCount;
        const dashLength = dashAngle * 0.8;
        for (let i = 0; i < dashCount; i++) {
            const startAngle = i * dashAngle;
            const endAngle = startAngle + dashLength;
            const startX = Math.cos(startAngle) * ringRadius;
            const startY = Math.sin(startAngle) * ringRadius;
            graphics.moveTo(startX, startY);
            graphics.arc(0, 0, ringRadius, startAngle, endAngle);
        }
    }

    static _drawSpikedCircle(graphics, settings, ringRadius) {
        const spikeCount = 8;
        const spikeLength = settings.thickness * 2;
        const spikeWidth = settings.thickness * 1.6;
        graphics.beginFill(settings.innerColor, settings.innerOpacity);
        graphics.drawCircle(0, 0, ringRadius);
        graphics.endFill();
        graphics.lineStyle(settings.thickness, settings.color, settings.pulseMax);
        graphics.drawCircle(0, 0, ringRadius);
        graphics.lineStyle(0);
        graphics.beginFill(settings.color, settings.pulseMax);
        for (let i = 0; i < spikeCount; i++) {
            const angle = (i * Math.PI * 2) / spikeCount;
            const baseX = Math.cos(angle) * ringRadius;
            const baseY = Math.sin(angle) * ringRadius;
            const tipX = Math.cos(angle) * (ringRadius + spikeLength);
            const tipY = Math.sin(angle) * (ringRadius + spikeLength);
            const perpendicular = angle + (Math.PI / 2);
            const halfWidth = spikeWidth / 2;
            const leftX = baseX + (Math.cos(perpendicular) * halfWidth);
            const leftY = baseY + (Math.sin(perpendicular) * halfWidth);
            const rightX = baseX - (Math.cos(perpendicular) * halfWidth);
            const rightY = baseY - (Math.sin(perpendicular) * halfWidth);
            graphics.moveTo(leftX, leftY);
            graphics.lineTo(tipX, tipY);
            graphics.lineTo(rightX, rightY);
            graphics.lineTo(leftX, leftY);
        }
        graphics.endFill();
    }

    static _drawInwardSpikedCircle(graphics, settings, ringRadius) {
        const spikeCount = 8;
        const spikeLength = settings.thickness * 1.2;
        const spikeWidth = settings.thickness * 1.6;
        const innerRadius = ringRadius - settings.thickness;
        graphics.beginFill(settings.innerColor, settings.innerOpacity);
        graphics.drawCircle(0, 0, ringRadius);
        graphics.endFill();
        graphics.lineStyle(settings.thickness, settings.color, settings.pulseMax);
        graphics.drawCircle(0, 0, ringRadius);
        graphics.lineStyle(0);
        graphics.beginFill(settings.color, settings.pulseMax);
        for (let i = 0; i < spikeCount; i++) {
            const angle = (i * Math.PI * 2) / spikeCount;
            const baseX = Math.cos(angle) * ringRadius;
            const baseY = Math.sin(angle) * ringRadius;
            const tipX = Math.cos(angle) * (innerRadius - spikeLength);
            const tipY = Math.sin(angle) * (innerRadius - spikeLength);
            const perpendicular = angle + (Math.PI / 2);
            const halfWidth = spikeWidth / 2;
            const leftX = baseX + (Math.cos(perpendicular) * halfWidth);
            const leftY = baseY + (Math.sin(perpendicular) * halfWidth);
            const rightX = baseX - (Math.cos(perpendicular) * halfWidth);
            const rightY = baseY - (Math.sin(perpendicular) * halfWidth);
            graphics.moveTo(leftX, leftY);
            graphics.lineTo(tipX, tipY);
            graphics.lineTo(rightX, rightY);
            graphics.lineTo(leftX, leftY);
        }
        graphics.endFill();
    }

    static _drawRoundedSquare(graphics, settings, ringRadius) {
        const size = ringRadius * 2;
        const x = -(size / 2);
        const y = -(size / 2);
        const cornerRadius = Math.max(6, settings.thickness);
        graphics.beginFill(settings.innerColor, settings.innerOpacity);
        graphics.drawRoundedRect(x, y, size, size, cornerRadius);
        graphics.endFill();
        graphics.lineStyle(settings.thickness, settings.color, settings.pulseMax);
        graphics.drawRoundedRect(x, y, size, size, cornerRadius);
    }

    // -------------------------------------------------------------------------
    // Targeter portraits
    // -------------------------------------------------------------------------

    static _syncTargetPortraits() {
        if (!getSettingSafely(MODULE.ID, 'targetedPortraitsEnabled', true)
            || !getSettingSafely(MODULE.ID, 'generalIndicatorsEnabled', true)) {
            this._removeAllTargetPortraits();
            return;
        }

        const byToken = new Map();
        for (const [userId, set] of this._targetsByUser.entries()) {
            const u = game.users.get(userId);
            if (!u?.active) continue;
            for (const tokenId of set) {
                if (!byToken.has(tokenId)) byToken.set(tokenId, []);
                byToken.get(tokenId).push(userId);
            }
        }

        for (const tokenId of Array.from(this._targetPortraits.keys())) {
            if (!byToken.has(tokenId)) this._removeTargetPortraitsForToken(tokenId);
        }

        for (const [tokenId, userIds] of byToken) {
            const token = canvas.tokens?.get(tokenId);
            if (!token || !this._canUserSeeToken(token)) {
                this._removeTargetPortraitsForToken(tokenId);
                continue;
            }
            this._removeTargetPortraitsForToken(tokenId);
            this._addTargetPortraitsForToken(token, userIds);
        }
    }

    static _addTargetPortraitsForToken(token, userIds) {
        const gridSize = canvas.grid?.size ?? 100;
        const sizeScale = Number(getSettingSafely(MODULE.ID, 'targetedPortraitsSize', 5));
        const multiplier = 0.20 + (Math.min(10, Math.max(1, sizeScale)) - 1) * (0.40 / 9);
        const portraitSize = Math.min(80, Math.max(12, Math.round(gridSize * multiplier)));
        const radius = portraitSize / 2;
        const gap = 4;
        const stepX = portraitSize + gap;
        const totalWidth = userIds.length * portraitSize + (userIds.length - 1) * gap;

        const tokenWidth = token.document.width * gridSize;
        const tokenHeight = token.document.height * gridSize;
        const settings = this._getTargetedSettings();
        const center = this._calculateTokenCenter(token);

        const halfH = Math.max(tokenWidth, tokenHeight) / 2;
        const relY = -(halfH + settings.offset + 8 + radius);
        const startRelX = -(totalWidth / 2) + radius;

        const shape = getSettingSafely(MODULE.ID, 'targetedPortraitsShape', 'circle');
        const cornerRadius = Math.max(4, Math.round(radius * 0.35));

        const outerContainer = new PIXI.Container();
        outerContainer.position.set(center.x, center.y);
        outerContainer.zIndex = 15;

        for (let i = 0; i < userIds.length; i++) {
            const user = game.users.get(userIds[i]);
            const imageUrl = user?.character?.img || user?.avatar || 'icons/svg/mystery-man.svg';

            const portraitContainer = new PIXI.Container();
            portraitContainer.position.set(startRelX + i * stepX, relY);

            const sprite = PIXI.Sprite.from(imageUrl);
            sprite.width = portraitSize;
            sprite.height = portraitSize;
            sprite.anchor.set(0.5);

            const mask = new PIXI.Graphics();
            mask.beginFill(0xffffff);
            if (shape === 'roundedSquare') {
                mask.drawRoundedRect(-radius, -radius, portraitSize, portraitSize, cornerRadius);
            } else {
                mask.drawCircle(0, 0, radius);
            }
            mask.endFill();
            sprite.mask = mask;

            const border = new PIXI.Graphics();
            const borderColor = this._userPlayerColorToPixi(user) ?? 0xffffff;
            border.lineStyle(2, borderColor, 1);
            if (shape === 'roundedSquare') {
                border.drawRoundedRect(-radius, -radius, portraitSize, portraitSize, cornerRadius);
            } else {
                border.drawCircle(0, 0, radius + 1);
            }

            portraitContainer.addChild(mask);
            portraitContainer.addChild(sprite);
            portraitContainer.addChild(border);
            outerContainer.addChild(portraitContainer);
        }

        canvas.interface?.addChild(outerContainer);
        this._targetPortraits.set(token.id, outerContainer);
    }

    static _updateTargetPortraitPosition(tokenId, changes = null) {
        const container = this._targetPortraits.get(tokenId);
        if (!container || container.destroyed) return;
        const token = canvas.tokens?.get(tokenId);
        if (!token) return;
        const center = this._calculateTokenCenter(token, changes);
        container.x = center.x;
        container.y = center.y;
    }

    static _removeTargetPortraitsForToken(tokenId) {
        const container = this._targetPortraits.get(tokenId);
        if (!container) return;
        if (canvas.interface && container.parent) canvas.interface.removeChild(container);
        if (!container.destroyed) container.destroy({ children: true });
        this._targetPortraits.delete(tokenId);
    }

    static _removeAllTargetPortraits() {
        for (const tokenId of Array.from(this._targetPortraits.keys())) {
            this._removeTargetPortraitsForToken(tokenId);
        }
    }
}
