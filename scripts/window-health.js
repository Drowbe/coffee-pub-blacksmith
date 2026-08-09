// ==================================================================
// ===== HEALTH WINDOW ==============================================
// ==================================================================
//
// Hit points for the current token selection, with bulk damage, healing, and
// death controls for the GM. Adopted from Squire, where a panel held the state
// and eight-plus call sites pushed the selection into it. Here the window reads
// the selection itself through a `controlToken` hook, so nothing outside has to
// remember to tell it.
//
// The one thing selection cannot express is "show me these tokens without
// selecting them", which two Squire call sites needed. That is served by the
// `{ tokens }` option on the opener rather than a public method on the instance,
// which keeps the surface a registry call.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { BlacksmithToolWindowBaseV2 } from './window-tool-base.js';
import { HookManager } from './manager-hooks.js';
import { registerWindow, openWindow, isWindowRegistered } from './api-windows.js';
import { MenuBar } from './api-menubar.js';
import { getHealthSeverityForHP } from './utility-health.js';
import { setToolWindowState } from './manager-tool-windows.js';
import { EncounterManager } from './manager-encounter.js';

export const HEALTH_WINDOW_ID = 'blacksmith-health';

/**
 * The window id another module may register to provide a conditions editor.
 *
 * Blacksmith has no such window. Naming a capability rather than a module is the
 * same rule the `party-health` menubar intent follows: if nobody provides it the
 * button does not render, which is the correct behaviour for an optional
 * integration and avoids offering a click that would do nothing.
 */
const STATUS_EFFECTS_WINDOW_ID = 'blacksmith-status-effects';

/** Every token on the scene that has readable hit points. */
function getSceneHealthTokens() {
    return canvas?.tokens?.placeables?.filter((token) => token.actor?.system?.attributes?.hp) ?? [];
}

/** Token name preferred over actor name, since that is what the GM sees on the canvas. */
function getTokenDisplayName(token, actor) {
    return token?.document?.name
        || token?.name
        || actor?.prototypeToken?.name
        || actor?.name
        || token?.actor?.name
        || '';
}

export class HealthWindow extends BlacksmithToolWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-tool-root';

    /** The open instance, so the menubar tool raises it rather than opening a second one. */
    static activeWindow = null;

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'blacksmith-health-window',
            classes: ['blacksmith-health-tool-window'],
            position: {
                width: 400,
                height: 'auto'
            },
            window: {
                title: 'Health',
                resizable: false,
                minimizable: true
            },
            windowSizeConstraints: {
                minWidth: 300,
                maxWidth: 520,
                maxHeight: 'calc(100vh - 16px)'
            },
            toolTitlebar: 'micro',
            rememberPosition: true,
            windowPositionKey: 'blacksmith-health-tool-position'
        }
    );

    static PARTS = {
        body: {
            template: 'modules/coffee-pub-blacksmith/templates/window-tool-template.hbs'
        }
    };

    constructor({ tokens = null, ...options } = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? HealthWindow.DEFAULT_OPTIONS.id;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, HealthWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, HealthWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        // An explicit token list pins the window; otherwise it follows the canvas.
        this.tokens = tokens ?? (canvas?.tokens?.controlled ?? []).filter(Boolean);
        this.selectedHealthTarget = null;

        // The unregister list, and it is not merely a convenience. With nothing
        // selected the window registers against EVERY token on the scene that has
        // HP, so that damage anywhere refreshes the aggregate rows. Without this
        // set those entries cannot be found again, and closing the window would
        // leave `apps` references across the whole scene pointing at a dead window.
        this._registeredActors = new Set();
        this._hookContext = `health:${this.id}`;

        HookManager.registerHook({
            name: 'controlToken',
            description: 'Health: follow the token selection',
            priority: 4,
            context: this._hookContext,
            callback: () => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                // Deferred a tick: control() fires per token, so a multi-select
                // would otherwise re-render once per token in the selection.
                clearTimeout(this._selectionTimer);
                this._selectionTimer = setTimeout(() => {
                    void this.updateTokens((canvas?.tokens?.controlled ?? []).filter(Boolean));
                }, 0);
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });
    }

    get actors() {
        return this.tokens.map((token) => token.actor).filter(Boolean);
    }

    get title() {
        const actors = this.actors;
        if (actors.length > 1) return `Health: ${actors.length} Selected`;
        return `Health: ${actors[0]?.name || 'None Selected'}`;
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    // ==============================================================
    // ===== RENDER =================================================
    // ==============================================================

    async getData() {
        const hasConditionsProvider = isWindowRegistered(STATUS_EFFECTS_WINDOW_ID);

        const individualEntries = this.tokens.map((token) => {
            const actor = token.actor;
            const hp = actor?.system?.attributes?.hp;
            const effectCount = actor?.effects?.size ?? actor?.effects?.length ?? 0;
            return {
                name: getTokenDisplayName(token, actor),
                img: actor?.img,
                current: hp?.value || 0,
                max: hp?.max || 0,
                healthbarStatus: this._statusClass(hp),
                fillPercent: this._fillPercent(hp?.value, hp?.max),
                target: `actor:${actor?.id}`,
                actorUuid: actor?.uuid,
                effectCount,
                showEffectCount: effectCount > 1,
                showConditions: hasConditionsProvider,
                isSelected: this.selectedHealthTarget === `actor:${actor?.id}`,
                isAggregate: false
            };
        }).filter((entry) => entry.max > 0 || entry.current > 0);

        const healthEntries = [
            ...await this._buildAggregateEntries(individualEntries.length),
            ...individualEntries
        ];

        const content = await foundry.applications.handlebars.renderTemplate(
            'modules/coffee-pub-blacksmith/templates/window-health.hbs',
            {
                healthEntries,
                healthAdjustmentAmount: game.settings.get(MODULE.ID, 'healthAdjustmentAmount') || 1,
                isGM: game.user.isGM
            }
        );

        return {
            appId: this.id,
            bodyContent: content
        };
    }

    /**
     * Party and NPC summary rows.
     *
     * Shown when nothing is selected (summarising the scene) or when more than one
     * token is, since a single selection is already its own summary.
     */
    async _buildAggregateEntries(individualCount) {
        const showSceneDefaults = individualCount === 0;
        if (!showSceneDefaults && individualCount <= 1) return [];

        let combatAssessment = null;
        try {
            combatAssessment = EncounterManager.getCombatAssessment({});
        } catch (_) {
            // Actor counts below stand in when the CR assessment cannot resolve.
        }

        const aggregateActors = showSceneDefaults
            ? getSceneHealthTokens().map((token) => token.actor)
            : this.actors;

        const groups = [
            {
                name: 'Party',
                icon: 'fas fa-helmet-battle',
                actors: aggregateActors.filter((actor) => actor.hasPlayerOwner),
                cr: combatAssessment?.partyCRDisplay
            },
            {
                name: 'NPCs',
                icon: 'fas fa-dragon',
                actors: aggregateActors.filter((actor) => !actor.hasPlayerOwner),
                cr: combatAssessment?.monsterCRDisplay
            }
        ];

        const entries = [];
        for (const group of groups) {
            if (!showSceneDefaults && !group.actors.length) continue;
            const current = group.actors.reduce((total, actor) => total + (Number(actor.system?.attributes?.hp?.value) || 0), 0);
            const max = group.actors.reduce((total, actor) => total + (Number(actor.system?.attributes?.hp?.max) || 0), 0);
            entries.push({
                name: group.name,
                icon: group.icon,
                current,
                max,
                healthbarStatus: this._statusClass({ value: current, max }),
                fillPercent: this._fillPercent(current, max),
                target: group.name.toLowerCase(),
                aggregateStat: group.cr != null ? String(group.cr) : String(group.actors.length),
                aggregateStatLabel: group.cr != null
                    ? `${group.name} challenge rating ${group.cr}`
                    : `${group.actors.length} ${group.name}`,
                isSelected: this.selectedHealthTarget === group.name.toLowerCase(),
                isAggregate: true
            });
        }
        return entries;
    }

    /** Severity comes from utility-health; only the class prefix belongs to this window. */
    _statusClass(hp) {
        const severity = getHealthSeverityForHP(hp);
        return `blacksmith-healthbar-${severity ?? 'healthy'}`;
    }

    /**
     * Bar fill percentage.
     *
     * Computed here rather than as `divide` in the template, because a group with no
     * members has max 0 and the template arithmetic yielded NaN -- which Handlebars
     * prints into the style attribute, giving a bar of undefined width.
     */
    _fillPercent(current, max) {
        const value = Number(current) || 0;
        const total = Number(max) || 0;
        if (total <= 0) return 0;
        return Math.max(0, Math.min(100, (value / total) * 100));
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        this._registerCurrentActors();
        this._activateHealthListeners(this.element);
    }

    // ==============================================================
    // ===== LISTENERS ==============================================
    // ==============================================================

    _activateHealthListeners(root) {
        if (!root) return;
        const panel = root.querySelector?.('#blacksmith-health-content');
        if (!panel) return;

        if (game.user.isGM) {
            const bind = (selector, callback) => {
                const button = panel.querySelector(selector);
                if (!button) return;
                button.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    callback();
                });
            };

            bind('.select-party', () => this._selectTokenGroup(true));
            bind('.death-toggle', () => this._onDeathToggle());
            bind('.hp-down-ten', () => this._onHPChange(-1, 10));
            bind('.hp-down', () => this._onHPChange(-1));
            bind('.hp-up', () => this._onHPChange(1));
            bind('.hp-up-ten', () => this._onHPChange(1, 10));
            bind('.hp-full', () => this._onFullHeal());
            bind('.select-npcs', () => this._selectTokenGroup(false));
        }

        const hpAmount = panel.querySelector('.hp-amount');
        if (hpAmount) {
            const selectText = () => hpAmount.select();
            hpAmount.addEventListener('focus', selectText);
            hpAmount.addEventListener('click', selectText);
            hpAmount.addEventListener('change', async () => {
                const amount = Math.max(1, parseInt(hpAmount.value || '1') || 1);
                hpAmount.value = String(amount);
                await game.settings.set(MODULE.ID, 'healthAdjustmentAmount', amount);
            });
        }

        panel.querySelectorAll('.health-conditions[data-actor-uuid]').forEach((button) => {
            button.addEventListener('click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();

                const actorUuid = button.dataset.actorUuid;
                const actor = actorUuid ? await foundry.utils.fromUuid(actorUuid) : null;
                if (!actor) {
                    ui.notifications.warn('That character is no longer available.');
                    return;
                }
                openWindow(STATUS_EFFECTS_WINDOW_ID, { actor, actorUuid });
            });
        });

        // Clicking a row narrows the bulk controls to that row; clicking it again widens back.
        panel.querySelectorAll('.health-row[data-health-target]').forEach((row) => {
            row.addEventListener('click', async (ev) => {
                ev.preventDefault();
                const target = row.dataset.healthTarget;
                this.selectedHealthTarget = this.selectedHealthTarget === target ? null : target;
                await this.render(false);
            });
        });
    }

    // ==============================================================
    // ===== OPERATIONS =============================================
    // ==============================================================

    /**
     * The tokens a bulk control acts on: the selection, narrowed by the clicked row.
     * With nothing selected it falls back to the whole scene, which is what makes
     * the Party and NPC summary rows actionable.
     */
    _getOperationTokens() {
        const tokens = this.tokens.length ? this.tokens : getSceneHealthTokens();
        const target = this.selectedHealthTarget;
        if (!target) return tokens;
        if (target === 'party') return tokens.filter((token) => token.actor?.hasPlayerOwner);
        if (target === 'npcs') return tokens.filter((token) => !token.actor?.hasPlayerOwner);
        if (target.startsWith('actor:')) {
            const actorId = target.slice('actor:'.length);
            return tokens.filter((token) => token.actor?.id === actorId);
        }
        return tokens;
    }

    async _onHPChange(direction, fixedAmount = null) {
        const hpAmountInput = this.element?.querySelector?.('.hp-amount');
        const amount = fixedAmount ?? (parseInt(hpAmountInput?.value || '1') || 1);
        if (fixedAmount == null) {
            void game.settings.set(MODULE.ID, 'healthAdjustmentAmount', Math.max(1, amount));
        }

        for (const token of this._getOperationTokens()) {
            const hp = token.actor?.system?.attributes?.hp;
            if (!hp) continue;
            const newValue = Math.clamp(hp.value + (amount * direction), 0, hp.max);
            await token.actor.update({ 'system.attributes.hp.value': newValue });
        }
    }

    async _onFullHeal() {
        for (const token of this._getOperationTokens()) {
            const hp = token.actor?.system?.attributes?.hp;
            if (!hp) continue;
            await token.actor.update({ 'system.attributes.hp.value': hp.max });
        }
    }

    async _onDeathToggle() {
        for (const token of this._getOperationTokens()) {
            if (!token.actor?.system?.attributes?.hp) continue;
            await token.actor.update({ 'system.attributes.hp.value': 0 });
        }
    }

    /**
     * Select every party or non-party token on the scene.
     *
     * Controls the tokens rather than pushing a list into the window: the window
     * follows selection, so selecting is the whole operation.
     */
    _selectTokenGroup(selectParty) {
        const tokens = getSceneHealthTokens().filter((token) => (
            selectParty ? token.actor.hasPlayerOwner : !token.actor.hasPlayerOwner
        ));

        if (!tokens.length) {
            ui.notifications.info(selectParty
                ? 'No party tokens are available on this scene.'
                : 'No non-party tokens are available on this scene.');
            return;
        }

        tokens.forEach((token, index) => token.control({ releaseOthers: index === 0 }));
    }

    // ==============================================================
    // ===== ACTOR TRACKING =========================================
    // ==============================================================

    _registerActors(actors = []) {
        for (const actor of actors.filter(Boolean)) {
            actor.apps[this.id] = this;
            this._registeredActors.add(actor);
        }
    }

    /** With nothing selected, watch the whole scene so the aggregate rows stay live. */
    _registerCurrentActors() {
        const actors = this.actors.length
            ? this.actors
            : getSceneHealthTokens().map((token) => token.actor);
        this._registerActors(actors);
    }

    _unregisterActors() {
        for (const actor of this._registeredActors) {
            delete actor.apps[this.id];
        }
        this._registeredActors.clear();
    }

    /** Drop a stale row selection when the token it referred to is no longer shown. */
    _validateSelectedHealthTarget(tokens) {
        const target = this.selectedHealthTarget;
        if (!target) return;
        if (target === 'party' && tokens.length > 1 && tokens.some((t) => t.actor?.hasPlayerOwner)) return;
        if (target === 'npcs' && tokens.length > 1 && tokens.some((t) => !t.actor?.hasPlayerOwner)) return;
        if (target.startsWith('actor:')) {
            const actorId = target.slice('actor:'.length);
            if (tokens.some((t) => t.actor?.id === actorId)) return;
        }
        this.selectedHealthTarget = null;
    }

    /**
     * Show a specific set of tokens. Called by the selection hook, and by the
     * opener when a caller pins a list explicitly.
     */
    async updateTokens(tokens) {
        const nextTokens = (tokens || []).filter(Boolean);
        this._validateSelectedHealthTarget(nextTokens);
        this._unregisterActors();
        this.tokens = nextTokens;
        await this.render(false);
    }

    // ==============================================================
    // ===== LIFECYCLE ==============================================
    // ==============================================================

    _onClose(options) {
        clearTimeout(this._selectionTimer);
        this._unregisterActors();
        HookManager.disposeByContext(this._hookContext);
        HealthWindow.activeWindow = null;
        void setToolWindowState('health', false);
        super._onClose?.(options);
    }
}

/**
 * Open the health window, or raise it if it is already open.
 *
 * @param {object} [options]
 * @param {Token[]} [options.tokens] Show these tokens instead of the current selection.
 *   For callers that want a set shown without changing what the GM has selected.
 * @returns {Promise<HealthWindow>}
 */
export async function openHealthWindow({ tokens = null } = {}) {
    try {
        if (HealthWindow.activeWindow) {
            HealthWindow.activeWindow.bringToFront?.();
            if (tokens) await HealthWindow.activeWindow.updateTokens(tokens);
            return HealthWindow.activeWindow;
        }

        const window = new HealthWindow({ tokens });
        HealthWindow.activeWindow = window;
        await window.render(true);
        await setToolWindowState('health', true);
        return window;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Health: failed to open', error?.message ?? error, false, false);
        ui.notifications.error('Failed to open health');
    }
}

/** Register the window and its menubar tool. */
export function registerHealth() {
    BlacksmithToolWindowBaseV2.migratePositionKey('squire-health-tool-position', 'blacksmith-health-tool-position');

    registerWindow(HEALTH_WINDOW_ID, {
        moduleId: MODULE.ID,
        title: 'Health',
        open: async (options = {}) => openHealthWindow(options)
    });

    MenuBar.registerMenubarTool('health', {
        icon: 'fa-solid fa-heart-pulse',
        name: 'health',
        title: null,
        tooltip: 'Health',
        onClick: () => openHealthWindow(),
        zone: 'left',
        group: 'general',
        order: 201,
        // Claimed so the combat bar's party health bars stay clickable. The bar asks
        // for the capability, not for this tool by name -- see api-menubar.js.
        intents: ['party-health'],
        moduleId: MODULE.ID,
        gmOnly: false,
        leaderOnly: false,
        visible: () => {
            try {
                return game.settings.get(MODULE.ID, 'showHealthMenubarTool');
            } catch (_) {
                return true;
            }
        }
    });

    return true;
}
