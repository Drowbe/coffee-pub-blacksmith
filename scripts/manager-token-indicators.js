import { MODULE } from './const.js';
import { getSettingSafely, postConsoleAndNotification, playSound } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { getActorHP, getHealthPercent, getHealthSeverity } from './utility-health.js';
import { resolveAttackMessage } from './utility-message-resolution.js';

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

    /** @type {Map<string, string>} userId -> tokenId of the last token they controlled on this client */
    static _sourceTokenByUser = new Map();

    /** @type {Map<string, {mesh: PrimarySpriteMesh, severity: string}>} tokenId -> ground blood splatter under the token */
    static _bloodMeshes = new Map();

    /** Cached gate for the hot refreshToken path — recomputed by _rebuildAllBlood(), never per-frame */
    static _bloodActive = false;

    /** Cached gate for hit bursts — recomputed by _rebuildAllBlood() */
    static _bloodHitActive = false;

    /** Cached hit-trigger mode ('damage' | 'attack') — recomputed by _rebuildAllBlood() */
    static _bloodHitTrigger = 'damage';

    /** Cached hit-burst sound ('sound-none' = silent) — recomputed by _rebuildAllBlood() */
    static _bloodHitSound = 'sound-none';

    /** Attack-mode dedupe: message ids that already produced a burst (bounded FIFO) */
    static _bloodHitProcessedMessages = new Set();

    /** Token ids cleared by "Remove All Blood" — blood stays gone until the token next takes damage */
    static _bloodSuppressed = new Set();

    /** @type {Map<string, number>} actor uuid -> last known HP, for detecting damage vs healing */
    static _lastHpByActor = new Map();

    /** @type {Set<Function>} cancel functions for in-flight hit-burst animations */
    static _activeBloodBursts = new Set();

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
            callback: (tokenDocument) => {
                this._onTokenDeleted(tokenDocument);
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

        // dnd5e 5.x creates the attack card first and fills in rolls/target flags via a
        // later update, so the attack lane must watch BOTH hooks (same pattern as
        // CombatStats._onChatMessage); _onChatMessageForBloodHit dedupes per message.
        this._hookIds.createChatMessage = HookManager.registerHook({
            name: 'createChatMessage',
            description: 'Token indicators: blood hit burst on successful attack rolls',
            context: 'token-indicators',
            priority: 3,
            callback: (message) => {
                this._onChatMessageForBloodHit(message);
            }
        });

        this._hookIds.updateChatMessage = HookManager.registerHook({
            name: 'updateChatMessage',
            description: 'Token indicators: blood hit burst when attack rolls arrive via message update',
            context: 'token-indicators',
            priority: 3,
            callback: (message) => {
                this._onChatMessageForBloodHit(message);
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
                this._syncBloodOnRefresh(token);
            }
        });

        this._hookIds.updateActor = HookManager.registerHook({
            name: 'updateActor',
            description: 'Token indicators: update blood splatter when HP changes',
            context: 'token-indicators',
            priority: 3,
            callback: (actor, changes) => {
                if (!this._bloodActive && !this._bloodHitActive) return;
                const hpChanged = foundry.utils.getProperty(changes, 'system.attributes.hp') !== undefined
                    || foundry.utils.getProperty(changes, 'system.vitals.hp') !== undefined
                    || foundry.utils.getProperty(changes, 'system.hp') !== undefined;
                if (!hpChanged) return;

                // Keyed by uuid, not id: unlinked tokens share the base actor's id but not its uuid
                const hp = getActorHP(actor);
                const uuid = actor?.uuid;
                const prev = uuid ? this._lastHpByActor.get(uuid) : undefined;
                if (uuid && hp) this._lastHpByActor.set(uuid, hp.value);
                const damageFraction = (hp && prev !== undefined && hp.value < prev)
                    ? (prev - hp.value) / hp.max
                    : 0;

                postConsoleAndNotification(MODULE.NAME, 'Token blood | HP change', { uuid, prev, now: hp?.value, damageFraction, hitActive: this._bloodHitActive }, true, false);
                for (const token of actor?.getActiveTokens?.() ?? []) {
                    if (damageFraction > 0) {
                        // New damage re-blooms a token cleared by "Remove All Blood"
                        this._bloodSuppressed.delete(token.id);
                        if (this._bloodHitActive && this._bloodHitTrigger === 'damage') this._spawnHitBurst(token, damageFraction, hp?.value ?? 0);
                    }
                    if (this._bloodActive) {
                        this._updateBloodForToken(token);
                        // New damage restarts the cleanup countdown even within the same tier
                        if (damageFraction > 0) this._scheduleBloodCleanup(token.id);
                    }
                }
            }
        });

        this._hookIds.controlToken = HookManager.registerHook({
            name: 'controlToken',
            description: 'Token indicators: track last controlled token for portrait display',
            context: 'token-indicators',
            priority: 3,
            callback: (token, isControlled) => {
                if (isControlled && token?.id) {
                    this._sourceTokenByUser.set(game.user.id, token.id);
                }
            }
        });

        this._hookIds.settingChange = HookManager.registerSettingChangeCallback({
            description: 'Token indicators: refresh when indicator settings change',
            context: 'token-indicators',
            priority: 3,
            callback: (module, key) => {
                if (module !== MODULE.ID) return;
                // Clear-request relay: the GM's "Remove All Blood" button writes a world
                // setting, which lands here on EVERY client — clear locally on each
                if (key === 'tokenBloodClearRequest') {
                    this._clearAllBloodAndSuppress();
                    return;
                }
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
                    'targetedPortraitsShape',
                    'targetedPortraitsPortraitType',
                    'tokenBloodEnabled',
                    'tokenBloodHitEnabled',
                    'tokenBloodHitTrigger',
                    'tokenBloodHitSound',
                    'tokenBloodVisibility',
                    'tokenBloodCleanupSeconds'
                ]);
                if (!watchedKeys.has(key)) return;
                this.refreshAll();
            }
        });

    }

    static refreshAll() {
        if (!getSettingSafely(MODULE.ID, 'generalIndicatorsEnabled', true)) {
            this._stopHideTargetIndicatorsLoop();
            this._removeTurnIndicator();
            this._removeAllTargetedIndicators();
            this._removeAllBlood();
            this._bloodActive = false;
            return;
        }
        this._refreshDefaultTargetIndicatorHiding();
        this._updateTurnIndicator();
        this._seedTargetsFromUserTargets();
        this._rebuildTargetedIndicatorGraphics();
        this._rebuildAllBlood();
    }

    static cleanup() {
        this._removeTurnIndicator();
        this._removeAllTargetedIndicators();
        this._removeAllBlood();
        this._cancelAllHitBursts();
        this._stopHideTargetIndicatorsLoop();
        this._targetsByUser.clear();
        this._sourceTokenByUser.clear();
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

        // Blood splatter: size changes need a rebuilt texture; elevation changes re-sort in canvas.primary
        if (this._bloodMeshes.has(tokenId)
            && (changes.width !== undefined || changes.height !== undefined || changes.elevation !== undefined)) {
            const token = canvas.tokens?.get(tokenId);
            if (token) {
                this._removeBloodForToken(tokenId);
                this._updateBloodForToken(token);
            }
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
        this._removeBloodForToken(tokenId);

        for (const set of this._targetsByUser.values()) {
            set?.delete?.(tokenId);
        }

        for (const [userId, srcId] of this._sourceTokenByUser.entries()) {
            if (srcId === tokenId) this._sourceTokenByUser.delete(userId);
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

        const portraitType = getSettingSafely(MODULE.ID, 'targetedPortraitsPortraitType', 'portrait');
        for (let i = 0; i < userIds.length; i++) {
            const user = game.users.get(userIds[i]);
            const srcTokenId = this._sourceTokenByUser.get(user?.id);
            const sourceToken = (srcTokenId ? canvas.tokens?.get(srcTokenId) : null)
                ?? canvas.tokens?.placeables?.find(t => t.document?.actorId === user?.character?.id);
            let imageUrl;
            if (portraitType === 'character') {
                imageUrl = sourceToken?.document?.texture?.src || user?.character?.img || user?.avatar || 'icons/svg/mystery-man.svg';
            } else if (portraitType === 'player') {
                imageUrl = user?.avatar || user?.character?.img || 'icons/svg/mystery-man.svg';
            } else {
                imageUrl = sourceToken?.actor?.img || user?.character?.img || user?.avatar || 'icons/svg/mystery-man.svg';
            }

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

    // ===== TOKEN BLOOD (ground splatter under tokens) =====

    /**
     * Splatter parameters per severity tier (tiers from utility-health.js).
     * `pool` is the central pool radius in token-size units (0.5 = the token's
     * edge, so pools past 0.5 ring visibly around the token). `spread` is the
     * max distance small splats land from center; splats always start outside
     * the pool so they read as separate droplets, not pool lumps.
     */
    static _BLOOD_TIERS = {
        injured:  { pool: 0.42, splats: 5,  spread: 0.70, splatRadius: 0.050, alpha: 0.55, color: 0x7a0f0f },
        bloodied: { pool: 0.58, splats: 8,  spread: 0.85, splatRadius: 0.060, alpha: 0.65, color: 0x7a0f0f },
        critical: { pool: 0.72, splats: 11, spread: 1.05, splatRadius: 0.070, alpha: 0.72, color: 0x6b0c0c },
        dead:     { pool: 0.90, splats: 12, spread: 1.10, splatRadius: 0.080, alpha: 0.80, color: 0x520909 }
    };

    /** Splatter field size as a multiple of token size: a 1x1 token bleeds over a 3x3 area. */
    static _BLOOD_FIELD_SCALE = 3;

    /** Renders above tiles (500) and drawings (600), under all token meshes (700). */
    static _BLOOD_SORT_LAYER = 650;

    static _isBloodVisibleToUser() {
        if (!getSettingSafely(MODULE.ID, 'generalIndicatorsEnabled', true)) return false;
        if (!getSettingSafely(MODULE.ID, 'tokenBloodEnabled', true)) return false;
        if (game.user?.isGM) return true;
        return getSettingSafely(MODULE.ID, 'tokenBloodVisibility', 'everyone') === 'everyone';
    }

    static _rebuildAllBlood() {
        this._removeAllBlood();
        this._bloodActive = this._isBloodVisibleToUser();
        this._bloodHitActive = this._isBloodHitVisibleToUser();
        this._bloodHitTrigger = getSettingSafely(MODULE.ID, 'tokenBloodHitTrigger', 'damage');
        this._bloodHitSound = getSettingSafely(MODULE.ID, 'tokenBloodHitSound', 'sound-none');
        if (!canvas?.tokens) return;
        // Seed the last-HP cache so the first hit after load computes a real delta
        for (const token of canvas.tokens.placeables) {
            const hp = getActorHP(token.actor);
            if (hp && token.actor?.uuid) this._lastHpByActor.set(token.actor.uuid, hp.value);
            if (this._bloodActive) this._updateBloodForToken(token);
        }
    }

    static _updateBloodForToken(token) {
        const tokenId = token?.id;
        if (!tokenId || !token.document) return;
        if (!this._bloodActive) {
            this._removeBloodForToken(tokenId);
            return;
        }
        if (this._bloodSuppressed.has(tokenId)) return;
        const severity = getHealthSeverity(getHealthPercent(token.actor));
        if (!severity || severity === 'healthy') {
            this._removeBloodForToken(tokenId);
            return;
        }
        const existing = this._bloodMeshes.get(tokenId);
        if (existing && existing.severity === severity && !existing.mesh.destroyed) {
            this._positionBloodMesh(existing.mesh, token);
            return;
        }
        this._removeBloodForToken(tokenId);
        try {
            const mesh = this._buildBloodMesh(token, severity);
            if (!mesh) return;
            this._bloodMeshes.set(tokenId, { mesh, severity, cleanupTimeout: null });
            this._scheduleBloodCleanup(tokenId);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Token indicators | Failed to build blood splatter', error?.message || error, true, false);
        }
    }

    static _buildBloodMesh(token, severity) {
        if (!canvas?.primary || !canvas.app?.renderer) return null;
        const tier = this._BLOOD_TIERS[severity];
        if (!tier) return null;

        const texture = this._generateBloodTexture(token, severity, tier);
        if (!texture) return null;

        const mesh = new foundry.canvas.primary.PrimarySpriteMesh({ name: `blacksmith-blood-${token.id}`, texture });
        mesh.anchor.set(0.5, 0.5);
        mesh.sortLayer = this._BLOOD_SORT_LAYER;
        mesh.sort = 0;
        mesh.alpha = tier.alpha;
        mesh.eventMode = 'none';
        this._positionBloodMesh(mesh, token);
        canvas.primary.addChild(mesh);
        return mesh;
    }

    /**
     * Procedural splatter, seeded from the token id so every client (and every
     * redraw) produces the identical pattern for the same token and tier.
     */
    static _generateBloodTexture(token, severity, tier) {
        const size = Math.max(token.w || 0, token.h || 0);
        if (!size) return null;

        const rand = this._seededRandom(`${token.id}:${severity}`);
        const area = size * this._BLOOD_FIELD_SCALE;
        const half = area / 2;
        const g = new PIXI.Graphics();

        // Central pool that grows with damage: a main ellipse plus a few offset
        // lobes for an organic edge. Past 0.5 token-size it rings around the art.
        const poolR = size * tier.pool;
        g.beginFill(tier.color, 1);
        g.drawEllipse(half, half, poolR, poolR * 0.85);
        const lobes = 3;
        for (let i = 0; i < lobes; i++) {
            const angle = rand() * Math.PI * 2;
            const off = poolR * (0.35 + rand() * 0.35);
            g.drawEllipse(half + Math.cos(angle) * off, half + Math.sin(angle) * off, poolR * (0.45 + rand() * 0.25), poolR * (0.35 + rand() * 0.25));
        }
        g.endFill();

        // Small splats scattered outside the pool
        for (let i = 0; i < tier.splats; i++) {
            const angle = rand() * Math.PI * 2;
            const dist = size * (tier.pool + 0.08 + rand() * Math.max(0.1, tier.spread - tier.pool));
            const x = half + Math.cos(angle) * dist;
            const y = half + Math.sin(angle) * dist;
            const r = size * tier.splatRadius * (0.5 + rand() * 0.9);
            g.beginFill(tier.color, 0.7 + rand() * 0.3);
            g.drawEllipse(x, y, r, r * (0.7 + rand() * 0.5));
            g.endFill();
            // One tiny trailing droplet per splat, flung outward from center
            g.beginFill(tier.color, 0.6 + rand() * 0.3);
            g.drawCircle(x + Math.cos(angle) * r * 2, y + Math.sin(angle) * r * 2, r * (0.2 + rand() * 0.2));
            g.endFill();
        }

        // Explicit region keeps the texture frame fixed and centered regardless of
        // where blobs landed, so the anchor-0.5 mesh stays aligned to token center
        const texture = canvas.app.renderer.generateTexture(g, {
            resolution: 1,
            region: new PIXI.Rectangle(0, 0, area, area)
        });
        g.destroy();
        return texture;
    }

    /** Deterministic PRNG (mulberry32) seeded from a string. */
    static _seededRandom(seedString) {
        let h = 1779033703;
        for (let i = 0; i < seedString.length; i++) {
            h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }
        let state = h >>> 0;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = Math.imul(state ^ (state >>> 15), 1 | state);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    static _positionBloodMesh(mesh, token) {
        if (!mesh || mesh.destroyed) return;
        const center = token.center ?? { x: (token.document?.x ?? 0) + (token.w ?? 0) / 2, y: (token.document?.y ?? 0) + (token.h ?? 0) / 2 };
        mesh.position.set(center.x, center.y);
        mesh.elevation = token.document?.elevation ?? 0;
        mesh.visible = token.visible !== false;
    }

    /**
     * Runs on every refreshToken: follows drag animation, mirrors visibility
     * (hidden tokens must not leak position through their blood), and lazily
     * creates blood for freshly dropped tokens.
     */
    static _syncBloodOnRefresh(token) {
        if (!this._bloodActive) return;
        const tokenId = token?.id;
        if (!tokenId) return;
        const entry = this._bloodMeshes.get(tokenId);
        if (entry) {
            this._positionBloodMesh(entry.mesh, token);
            return;
        }
        // Lazy creation path (e.g. a token dropped after canvasReady)
        if (token.actor) this._updateBloodForToken(token);
    }

    /**
     * Attack-mode lane, called from createChatMessage AND updateChatMessage.
     * Only marks a message processed once it actually resolves with hit targets,
     * so a create-time miss (rolls not yet populated) can succeed on the update.
     */
    static _onChatMessageForBloodHit(message) {
        if (!this._bloodHitActive || this._bloodHitTrigger !== 'attack') return;
        if (!message?.id || this._bloodHitProcessedMessages.has(message.id)) return;
        let resolved = null;
        try {
            resolved = resolveAttackMessage(message);
        } catch (error) {
            return;
        }
        if (!resolved?.hitTargets?.length) return;
        this._bloodHitProcessedMessages.add(message.id);
        // Bounded FIFO: Sets iterate in insertion order, so evict the oldest
        while (this._bloodHitProcessedMessages.size > 100) {
            this._bloodHitProcessedMessages.delete(this._bloodHitProcessedMessages.values().next().value);
        }
        postConsoleAndNotification(MODULE.NAME, 'Token blood | Attack hit', { message: message.id, hitTargets: resolved.hitTargets }, true, false);
        for (const uuid of resolved.hitTargets) {
            const token = this._resolveTokenFromTargetUuid(uuid);
            // Fixed mid-weight burst: no damage number exists yet at attack time
            if (token) this._spawnHitBurst(token, 0.35, message.id);
        }
    }

    /**
     * Resolve a dnd5e attack-card target uuid (TokenDocument or Actor, including
     * synthetic actors on unlinked tokens) to a canvas Token.
     */
    static _resolveTokenFromTargetUuid(uuid) {
        if (!uuid) return null;
        try {
            const doc = fromUuidSync(uuid);
            if (!doc) return null;
            if (doc.documentName === 'Token') return doc.object ?? null;
            if (doc.documentName === 'Actor') return doc.getActiveTokens?.()[0] ?? null;
        } catch (error) {
            // Unresolvable uuid (cross-scene target, deleted document) — no burst
        }
        return null;
    }

    /**
     * Blood Cleanup: after the configured number of seconds since the token's
     * last damage, remove its pool and suppress redraws until it bleeds again.
     * 0 means never. Each client runs its own timer from the same update event.
     */
    static _scheduleBloodCleanup(tokenId) {
        const entry = this._bloodMeshes.get(tokenId);
        if (!entry) return;
        if (entry.cleanupTimeout) {
            clearTimeout(entry.cleanupTimeout);
            entry.cleanupTimeout = null;
        }
        const seconds = Number(getSettingSafely(MODULE.ID, 'tokenBloodCleanupSeconds', 0)) || 0;
        if (seconds <= 0) return;
        entry.cleanupTimeout = setTimeout(() => {
            // Suppress so the lazy refresh path does not immediately redraw from HP state
            this._bloodSuppressed.add(tokenId);
            this._removeBloodForToken(tokenId);
        }, seconds * 1000);
    }

    static _removeBloodForToken(tokenId) {
        const entry = this._bloodMeshes.get(tokenId);
        if (!entry) return;
        if (entry.cleanupTimeout) clearTimeout(entry.cleanupTimeout);
        const { mesh } = entry;
        if (mesh && !mesh.destroyed) {
            const texture = mesh.texture;
            if (mesh.parent) mesh.parent.removeChild(mesh);
            mesh.destroy();
            texture?.destroy(true);
        }
        this._bloodMeshes.delete(tokenId);
    }

    static _removeAllBlood() {
        for (const tokenId of Array.from(this._bloodMeshes.keys())) {
            this._removeBloodForToken(tokenId);
        }
    }

    static _isBloodHitVisibleToUser() {
        if (!getSettingSafely(MODULE.ID, 'generalIndicatorsEnabled', true)) return false;
        if (!getSettingSafely(MODULE.ID, 'tokenBloodHitEnabled', true)) return false;
        if (game.user?.isGM) return true;
        return getSettingSafely(MODULE.ID, 'tokenBloodVisibility', 'everyone') === 'everyone';
    }

    /**
     * GM "Remove All Blood" toolbar action. Writes a world-setting nonce; the
     * settingChange relay fires on every client, so each one clears locally.
     */
    static requestClearAllBlood() {
        if (!game.user?.isGM) return;
        game.settings.set(MODULE.ID, 'tokenBloodClearRequest', Date.now()).catch(error => {
            postConsoleAndNotification(MODULE.NAME, 'Token indicators | Failed to broadcast blood clear', error?.message || error, false, false);
        });
    }

    /**
     * Clear all splatter and suppress each cleared token until it next takes
     * damage — without suppression the lazy refreshToken path would redraw the
     * blood immediately, since it derives from HP.
     */
    static _clearAllBloodAndSuppress() {
        for (const tokenId of this._bloodMeshes.keys()) {
            this._bloodSuppressed.add(tokenId);
        }
        this._removeAllBlood();
    }

    /**
     * Transient "you hit it" burst: a brighter splatter above the token that
     * expands and fades over ~0.9s. Size scales with damage as % of max HP.
     */
    static _spawnHitBurst(token, damageFraction, seedValue = 0) {
        if (!canvas?.app?.ticker || !canvas.interface || !token?.center) return;
        if (token.visible === false) return;
        try {
            // Seeding with the token's NEW HP value makes every hit draw a different
            // burst while still matching across all clients (same update, same seed)
            const rand = this._seededRandom(`${token.id}:hit:${seedValue}:${Math.round(Math.min(1, damageFraction) * 1000)}`);
            const texture = this._generateHitBurstTexture(token, damageFraction, rand);
            if (!texture) return;
            const sprite = new PIXI.Sprite(texture);
            sprite.anchor.set(0.5, 0.5);
            sprite.position.set(token.center.x, token.center.y);
            sprite.eventMode = 'none';
            sprite.scale.set(0.55);
            sprite.alpha = 0.95;
            // Random rotation is a cheap second axis of variety on the radial pattern
            sprite.rotation = rand() * Math.PI * 2;
            // High zIndex pins the burst above other interface-layer children (rings, portraits)
            sprite.zIndex = 100;
            canvas.interface.addChild(sprite);
            postConsoleAndNotification(MODULE.NAME, 'Token blood | Hit burst spawned', { token: token.id, damageFraction }, true, false);

            // Local playback (broadcast: false): every client spawns its own burst
            // from the same event, so broadcasting would double the sound
            const sound = this._bloodHitSound;
            if (sound && sound !== 'sound-none' && sound !== 'none') {
                void playSound(sound, window.COFFEEPUB?.SOUNDVOLUMENORMAL ?? 0.7, false, false);
            }

            const duration = 1100 + rand() * 400;
            const expansion = 0.7 + rand() * 0.3;
            let elapsed = 0;
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                canvas.app?.ticker?.remove(tick);
                this._activeBloodBursts.delete(finish);
                if (!sprite.destroyed) {
                    sprite.parent?.removeChild(sprite);
                    sprite.destroy();
                }
                texture.destroy(true);
            };
            const tick = (delta) => {
                elapsed += delta * 16.67;
                const progress = Math.min(elapsed / duration, 1);
                if (!sprite.destroyed) {
                    const eased = 1 - Math.pow(1 - progress, 2);
                    sprite.scale.set(0.55 + eased * expansion);
                    // Hold near-full alpha for the first third, then fade
                    sprite.alpha = progress < 0.33 ? 0.95 : 0.95 * (1 - (progress - 0.33) / 0.67);
                }
                if (progress >= 1 || sprite.destroyed) finish();
            };
            this._activeBloodBursts.add(finish);
            canvas.app.ticker.add(tick);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Token indicators | Failed to spawn hit burst', error?.message || error, true, false);
        }
    }

    static _generateHitBurstTexture(token, damageFraction, rand) {
        if (!canvas?.app?.renderer) return null;
        const size = Math.max(token.w || 0, token.h || 0);
        if (!size) return null;

        // Fresh-blood red, brighter than the ground tiers; blob count scales with the hit
        const color = 0x9c1414;
        const darkColor = 0x6e0d0d;
        const frac = Math.max(0.02, Math.min(1, damageFraction));
        const blobs = 10 + Math.round(frac * 14);
        const area = size * 3;
        const half = area / 2;
        const g = new PIXI.Graphics();

        for (let i = 0; i < blobs; i++) {
            const angle = rand() * Math.PI * 2;
            const dist = size * rand() * (0.4 + frac * 0.6);
            const x = half + Math.cos(angle) * dist;
            const y = half + Math.sin(angle) * dist;
            const r = size * (0.08 + rand() * 0.12) * (0.8 + frac * 0.9);
            g.beginFill(rand() < 0.7 ? color : darkColor, 0.75 + rand() * 0.25);
            g.drawEllipse(x, y, r, r * (0.55 + rand() * 0.7));
            g.endFill();
        }

        // Arterial streaks: chains of shrinking droplets flung radially outward,
        // reaching well past the token edge. Count and length scale with the hit.
        const streaks = 3 + Math.round(frac * 5);
        for (let s = 0; s < streaks; s++) {
            const angle = rand() * Math.PI * 2;
            const startDist = size * (0.15 + rand() * 0.2);
            const reach = size * (0.5 + rand() * 0.5 + frac * 0.4);
            const steps = 4 + Math.floor(rand() * 3);
            let r = size * (0.05 + rand() * 0.05) * (0.8 + frac * 0.7);
            for (let step = 0; step < steps; step++) {
                const t = step / steps;
                const d = startDist + reach * t;
                // Slight wobble off the axis so streaks are not laser-straight
                const wobble = (rand() - 0.5) * size * 0.08;
                const px = half + Math.cos(angle) * d + Math.cos(angle + Math.PI / 2) * wobble;
                const py = half + Math.sin(angle) * d + Math.sin(angle + Math.PI / 2) * wobble;
                g.beginFill(rand() < 0.8 ? color : darkColor, 0.65 + rand() * 0.3);
                g.drawEllipse(px, py, r, r * (0.6 + rand() * 0.5));
                g.endFill();
                r *= 0.78;
            }
        }

        // Fine mist: tiny droplets peppered in all directions, thickest near the
        // body and thinning with distance, so the spray reads as 360-degree
        const mist = 18 + Math.round(frac * 24);
        for (let m = 0; m < mist; m++) {
            const angle = rand() * Math.PI * 2;
            // Square the roll to bias droplets toward the center
            const dist = size * (0.15 + Math.pow(rand(), 1.6) * (1.0 + frac * 0.3));
            const r = size * (0.012 + rand() * 0.028);
            g.beginFill(rand() < 0.75 ? color : darkColor, 0.5 + rand() * 0.4);
            g.drawCircle(half + Math.cos(angle) * dist, half + Math.sin(angle) * dist, r);
            g.endFill();
        }

        const texture = canvas.app.renderer.generateTexture(g, {
            resolution: 1,
            region: new PIXI.Rectangle(0, 0, area, area)
        });
        g.destroy();
        return texture;
    }

    static _cancelAllHitBursts() {
        for (const finish of Array.from(this._activeBloodBursts)) {
            finish();
        }
        this._activeBloodBursts.clear();
    }
}
