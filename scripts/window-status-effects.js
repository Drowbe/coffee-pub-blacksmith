// ==================================================================
// ===== STATUS EFFECTS WINDOW ======================================
// ==================================================================
//
// Conditions and Active Effects for one actor: toggle a condition, remove an
// effect, and read the enriched description of whichever row is selected.
//
// Adopted from Squire. It lives here because it is generic over Foundry and
// dnd5e data rather than over a character sheet -- and because Blacksmith's own
// Health window wants a conditions button, which previously meant the hub
// advertising a slot and waiting for a satellite to fill it.
//
// Effect enumeration and condition labels go through EffectsAPI so this window
// and the rest of the suite agree on what an effect is called. It deliberately
// does NOT use `EffectsAPI.getDisplayEffects` -- see the note on _getEffectRows.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';
import { HookManager } from './manager-hooks.js';
import { registerWindow } from './api-windows.js';
import { MenuBar } from './api-menubar.js';
import { EffectsAPI } from './api-effects.js';

/**
 * Registry id. Blacksmith's Health window opens this for its per-row conditions
 * button; before the window moved here that id was a capability another module
 * had to claim.
 */
export const STATUS_EFFECTS_WINDOW_ID = 'blacksmith-status-effects';

/** Display name for a configured status, preferring the shared condition index. */
function getStatusName(id, status) {
    // getConditionLabel returns the id unchanged when the index does not know it,
    // which is the signal to fall back to whatever the status object carries.
    const fromIndex = EffectsAPI.getConditionLabel(id);
    if (fromIndex && fromIndex !== String(id)) return fromIndex;
    const label = status?.name || status?.label || id;
    return game.i18n?.has?.(label) ? game.i18n.localize(label) : label;
}

function getStatusIcon(status) {
    return status?.img
        || status?.icon
        || status?.image
        || 'icons/svg/unknown.svg';
}

/** Foundry moved TextEditor under applications.ux; the globals are the older shapes. */
function getTextEditor() {
    const ns = foundry?.applications?.ux?.TextEditor;
    return ns?.implementation ?? ns ?? globalThis.TextEditor;
}

export class StatusEffectsWindow extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'status-effects-window';

    /**
     * The open instance, assigned in the constructor -- before any render is
     * awaited, which is what makes it a real guard. See architecture-window.md
     * section 2b for why `foundry.applications.instances` is not usable here.
     *
     * This window needs more than "is one open": reopening compares the existing
     * window's actor against the requested one and either retargets the
     * description or closes and rebuilds. Foundry's registry would report that a
     * window exists but not who it is showing.
     */
    static activeWindow = null;

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'blacksmith-status-effects-window',
            classes: ['status-effects-window'],
            position: { width: 900, height: 680 },
            window: { title: 'Status Effects', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 780, minHeight: 420 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-status-effects.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? StatusEffectsWindow.DEFAULT_OPTIONS.id;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, StatusEffectsWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, StatusEffectsWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        this.actorUuid = opts.actorUuid || opts.actor?.uuid || null;
        this.actor = opts.actor || null;
        this._pendingConditionIds = new Set();
        this._pendingEffectIds = new Set();
        // Public options, not implementation detail: both deep-link the window to a
        // particular row's description. `descriptionEffectId` names an ActiveEffect
        // already on the actor; `descriptionStatusId` names a configured status that
        // may not be applied yet. Callers use either. Enumerated in api-window.md
        // because a caller reading only other call sites would never find the second.
        this.descriptionEffectId = opts.descriptionEffectId || null;
        this.descriptionStatusId = opts.descriptionStatusId || null;
        this._actionRoot = null;
        this._actionHandler = null;
        this._hookContext = `status-effects:${this.id}`;
        StatusEffectsWindow.activeWindow = this;
    }

    async _resolveActor() {
        if (this.actor?.uuid === this.actorUuid || (!this.actorUuid && this.actor)) return this.actor;
        this.actor = this.actorUuid ? await foundry.utils.fromUuid(this.actorUuid) : null;
        return this.actor;
    }

    // ==============================================================
    // ===== RENDER =================================================
    // ==============================================================

    /**
     * Every effect on the actor, including disabled and suppressed ones, since this
     * window is the place you go to see and remove them.
     *
     * Goes through `EffectsAPI.getActiveEffects` rather than reading `actor.effects`
     * directly, so the whole suite shares one accessor and this window follows if it
     * grows a permission or ownership rule.
     *
     * `getDisplayEffects` is deliberately not used. It enriches every effect's
     * description, and this window enriches only the one selected row -- so it would
     * do N enrichments per render to display N names. That mismatch is worth naming:
     * the API's richest method does not fit its most obvious consumer, which is a
     * finding about the API rather than about this window.
     */
    _getEffectRows() {
        return EffectsAPI.getActiveEffects(this.actor, {
            includeDisabled: true,
            includeSuppressed: true,
            qualifyingOnly: false
        });
    }

    async getData() {
        await this._resolveActor();
        const exhaustionLevel = Number(this.actor?.system?.attributes?.exhaustion || 0);
        const configuredStatuses = (CONFIG.statusEffects || [])
            .map(status => {
                const id = status?.id;
                const name = getStatusName(id, status);
                const isExhaustion = id === 'exhaustion';
                return {
                    id,
                    name,
                    icon: getStatusIcon(status),
                    isActive: this.actor?.statuses?.has?.(id) ?? false,
                    levelLabel: isExhaustion && exhaustionLevel > 0
                        ? `Level ${exhaustionLevel}`
                        : ''
                };
            })
            .filter(condition => condition.id && condition.name)
            .sort((a, b) => a.name.localeCompare(b.name));

        // An effect that merely restates a configured condition is already shown in
        // the conditions grid, so it is filtered out of the effects list rather than
        // listed twice. Matched on status id AND name so a differently-named effect
        // carrying the same status still appears.
        const canonicalStatusKeys = new Set(
            configuredStatuses.map(status => `${status.id}:${status.name.toLocaleLowerCase()}`)
        );
        const otherEffects = this._getEffectRows()
            .filter(effect => {
                const effectName = String(effect.name || effect.label || '').toLocaleLowerCase();
                const statuses = effect.statuses instanceof Set
                    ? effect.statuses
                    : new Set(effect.statuses || []);
                return !Array.from(statuses).some(
                    statusId => canonicalStatusKeys.has(`${statusId}:${effectName}`)
                );
            })
            .map(effect => ({
                id: effect.id,
                name: effect.name || effect.label || 'Unnamed Effect',
                icon: effect.img || 'icons/svg/aura.svg',
                duration: effect.duration?.type === 'none' ? '' : (effect.duration?.label || ''),
                isDisabled: !!effect.disabled,
                isSuppressed: !!effect.isSuppressed
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        // With no row requested, open on something rather than an empty pane: the
        // first active condition, else the first condition, else the first effect.
        if (!this.descriptionEffectId && !this.descriptionStatusId) {
            const defaultCondition = configuredStatuses.find(status => status.isActive)
                || configuredStatuses[0];
            if (defaultCondition) this.descriptionStatusId = defaultCondition.id;
            else if (otherEffects[0]) this.descriptionEffectId = otherEffects[0].id;
        }
        for (const status of configuredStatuses) {
            status.isSelected = status.id === this.descriptionStatusId;
        }
        for (const effect of otherEffects) {
            effect.isSelected = effect.id === this.descriptionEffectId;
        }
        const selectedDescription = await this._getSelectedDescription(configuredStatuses);

        const canManage = !!this.actor?.isOwner;
        return {
            appId: this.id,
            actorName: this.actor?.name || 'Unknown Actor',
            actorImg: this.actor?.img || 'icons/svg/mystery-man.svg',
            canManage,
            canRemoveAll: canManage && configuredStatuses.some(condition => condition.isActive),
            conditions: configuredStatuses,
            otherEffects,
            hasOtherEffects: otherEffects.length > 0,
            selectedDescription
        };
    }

    /**
     * The description pane for the selected row.
     *
     * A row can be selected as an effect or as a configured status, and the two
     * resolve to each other where possible: an effect carrying a status id borrows
     * that condition's rules text when it has none of its own, and a status resolves
     * to the effect applying it so the actor's own copy wins.
     */
    async _getSelectedDescription(configuredStatuses) {
        let effect = this.descriptionEffectId
            ? this.actor?.effects?.get?.(this.descriptionEffectId)
            : null;
        let statusId = this.descriptionStatusId;

        if (effect && !statusId) {
            const configuredIds = new Set(configuredStatuses.map(status => status.id));
            statusId = Array.from(effect.statuses || []).find(id => configuredIds.has(id)) || null;
        }
        if (!effect && statusId) {
            const statusName = configuredStatuses
                .find(status => status.id === statusId)
                ?.name
                ?.toLocaleLowerCase();
            effect = this.actor?.effects?.find?.(candidate => {
                const statuses = candidate.statuses instanceof Set
                    ? candidate.statuses
                    : new Set(candidate.statuses || []);
                const name = String(candidate.name || candidate.label || '').toLocaleLowerCase();
                return statuses.has(statusId) && (!statusName || name === statusName);
            }) || null;
        }

        const configuredStatus = configuredStatuses.find(status => status.id === statusId);
        if (!effect && !configuredStatus) return null;

        let rawDescription = effect?.description || '';
        const relativeTo = effect || this.actor;
        if (!rawDescription && statusId) {
            const condition = CONFIG.DND5E?.conditionTypes?.[statusId];
            rawDescription = condition?.description || '';
            // dnd5e 4+ moved most condition text into journal pages, so an entry may
            // carry only a reference. Embedding it inline is what renders the rules.
            if (!rawDescription && condition?.reference) {
                rawDescription = `@Embed[${condition.reference} inline]`;
            }
        }

        let html = '<p>No description is available for this effect.</p>';
        if (rawDescription) {
            try {
                if (game.i18n?.has?.(rawDescription)) {
                    rawDescription = game.i18n.localize(rawDescription);
                }
                const TextEditorImpl = getTextEditor();
                html = await TextEditorImpl.enrichHTML(rawDescription, {
                    relativeTo,
                    rollData: this.actor?.getRollData?.() || {}
                });
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Status Effects: could not enrich an effect description', error?.message ?? error, true, false);
                html = rawDescription;
            }
        }

        return {
            name: effect?.name || effect?.label || configuredStatus?.name || 'Effect',
            icon: effect?.img || configuredStatus?.icon || 'icons/svg/aura.svg',
            html
        };
    }

    async _showDescription({ effectId = null, statusId = null } = {}) {
        this.descriptionEffectId = effectId;
        this.descriptionStatusId = statusId;
        await this.render({ force: true });
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachActionListeners();
        this._registerEffectHooks();
    }

    // ==============================================================
    // ===== LISTENERS ==============================================
    // ==============================================================

    /**
     * One delegated listener on the content root rather than per-control listeners,
     * because the body is re-rendered on every effect change and per-control
     * listeners would have to be reattached each time.
     */
    _attachActionListeners() {
        const root = this.element?.querySelector?.('.status-effects-window[data-app-id]');
        if (!root || root === this._actionRoot) return;
        if (this._actionRoot && this._actionHandler) {
            this._actionRoot.removeEventListener('click', this._actionHandler, true);
        }

        this._actionRoot = root;
        this._actionHandler = async (event) => {
            const target = event.target?.closest?.('[data-action]');
            if (!target || !root.contains(target)) return;
            const action = target.dataset.action;
            if (!['toggleEffect', 'removeAll', 'removeEffect', 'showDescription', 'close'].includes(action)) return;
            event.preventDefault();

            if (action === 'toggleEffect') {
                const conditionId = target.dataset.conditionId;
                if (conditionId) await this._toggleCondition(conditionId);
            } else if (action === 'removeAll') {
                await this._removeAllConditions();
            } else if (action === 'removeEffect') {
                const effectId = target.dataset.effectId;
                if (effectId) await this._removeEffect(effectId);
            } else if (action === 'showDescription') {
                event.stopPropagation();
                await this._showDescription({
                    effectId: target.dataset.effectId || null,
                    statusId: target.dataset.conditionId || null
                });
            } else {
                await this.close();
            }
        };
        root.addEventListener('click', this._actionHandler, true);
    }

    /**
     * Redraw when this actor's effects change, whoever changed them -- this window,
     * the token HUD, or a character sheet.
     */
    _registerEffectHooks() {
        const refreshEffect = (effect) => {
            // --- BEGIN - HOOKMANAGER CALLBACK ---
            if (effect?.parent?.uuid !== this.actorUuid) return;
            this.render({ force: true });
            // --- END - HOOKMANAGER CALLBACK ---
        };

        for (const name of ['createActiveEffect', 'deleteActiveEffect', 'updateActiveEffect']) {
            HookManager.registerHook({
                name,
                description: 'Status Effects: redraw when this actor gains or loses an effect',
                priority: 4,
                context: this._hookContext,
                callback: refreshEffect
            });
        }

        // Exhaustion is a numeric attribute rather than a stack of effects, so it
        // changes without any effect hook firing.
        HookManager.registerHook({
            name: 'updateActor',
            description: 'Status Effects: redraw when this actor exhaustion level changes',
            priority: 4,
            context: this._hookContext,
            callback: (actor, changes) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                const exhaustionChanged = foundry.utils.hasProperty(changes, 'system.attributes.exhaustion')
                    || Object.hasOwn(changes || {}, 'system.attributes.exhaustion');
                if (actor?.uuid !== this.actorUuid || !exhaustionChanged) return;
                this.render({ force: true });
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });
    }

    // ==============================================================
    // ===== OPERATIONS =============================================
    // ==============================================================

    /** Shared precondition for every mutating action. */
    async _canMutate() {
        await this._resolveActor();
        if (!this.actor) {
            ui.notifications.error('The actor for this status-effects window is no longer available.');
            return false;
        }
        if (!this.actor.isOwner) {
            ui.notifications.warn('You do not have permission to change effects on this actor.');
            return false;
        }
        return true;
    }

    async _toggleCondition(conditionId) {
        if (!await this._canMutate()) return;
        // Toggling is a round trip to the server; a second click before it lands
        // would read the pre-toggle state and undo the first.
        if (this._pendingConditionIds.has(conditionId)) return;

        const status = CONFIG.statusEffects?.find(entry => entry.id === conditionId);
        if (!status) {
            ui.notifications.error('That condition is no longer available.');
            return;
        }

        const name = getStatusName(conditionId, status);
        const isActive = this.actor.statuses?.has?.(conditionId) ?? false;

        this._pendingConditionIds.add(conditionId);
        try {
            await this.actor.toggleStatusEffect(conditionId, { active: !isActive });
            ui.notifications.info(`${isActive ? 'Removed' : 'Added'} ${name} ${isActive ? 'from' : 'to'} ${this.actor.name}`);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Status Effects: could not toggle a condition', { conditionId, error: error?.message ?? error }, false, false);
            ui.notifications.error(`Could not ${isActive ? 'remove' : 'add'} ${name}`);
        } finally {
            this._pendingConditionIds.delete(conditionId);
        }
    }

    async _removeAllConditions() {
        if (!await this._canMutate()) return;

        const activeStatusIds = (CONFIG.statusEffects || [])
            .map(status => status?.id)
            .filter(id => id && this.actor.statuses?.has?.(id));
        if (!activeStatusIds.length) return;

        try {
            for (const statusId of activeStatusIds) {
                await this.actor.toggleStatusEffect(statusId, { active: false });
            }
            ui.notifications.info(`Removed all conditions from ${this.actor.name}`);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Status Effects: could not remove all conditions', error?.message ?? error, false, false);
            ui.notifications.error(`Could not remove all conditions from ${this.actor.name}`);
        }
    }

    async _removeEffect(effectId) {
        if (!await this._canMutate()) return;
        if (!effectId || this._pendingEffectIds.has(effectId)) return;

        const effect = this.actor.effects.get(effectId);
        if (!effect) return;

        this._pendingEffectIds.add(effectId);
        try {
            const name = effect.name || effect.label || 'Effect';
            // Clear the selection first: the description pane would otherwise be
            // pointing at an effect that no longer exists when the re-render lands.
            if (this.descriptionEffectId === effectId) this.descriptionEffectId = null;
            await effect.delete();
            ui.notifications.info(`Removed ${name} from ${this.actor.name}`);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Status Effects: could not remove an effect', { effectId, error: error?.message ?? error }, false, false);
            ui.notifications.error(`Could not remove ${effect.name || effect.label || 'effect'}`);
        } finally {
            this._pendingEffectIds.delete(effectId);
        }
    }

    // ==============================================================
    // ===== LIFECYCLE ==============================================
    // ==============================================================

    async close(options = {}) {
        HookManager.disposeByContext(this._hookContext);
        if (this._actionRoot && this._actionHandler) {
            this._actionRoot.removeEventListener('click', this._actionHandler, true);
        }
        this._actionRoot = null;
        this._actionHandler = null;
        if (StatusEffectsWindow.activeWindow === this) StatusEffectsWindow.activeWindow = null;
        return super.close(options);
    }
}

/**
 * Open the Status Effects window for an actor.
 *
 * @param {object} options
 * @param {Actor} [options.actor] The actor to show. Either this or actorUuid.
 * @param {string} [options.actorUuid] Resolved to an Actor when `actor` is absent.
 * @param {string} [options.descriptionEffectId] Open with this ActiveEffect's description shown.
 * @param {string} [options.descriptionStatusId] Open with this configured status's description shown.
 * @returns {Promise<StatusEffectsWindow|null>} null when no actor could be resolved
 */
export async function openStatusEffectsWindow(options = {}) {
    const actor = options.actor
        || (options.actorUuid ? await foundry.utils.fromUuid(options.actorUuid) : null);
    if (!actor) {
        ui.notifications.warn('Select a character before opening Status Effects.');
        return null;
    }

    // Reopening for the SAME actor retargets the description rather than rebuilding,
    // so clicking a second condition icon does not flash the window. A different
    // actor rebuilds, because the actor is bound at construction.
    const existing = StatusEffectsWindow.activeWindow;
    if (existing?.actorUuid === actor.uuid) {
        if (options.descriptionEffectId || options.descriptionStatusId) {
            existing.descriptionEffectId = options.descriptionEffectId || null;
            existing.descriptionStatusId = options.descriptionStatusId || null;
        }
        existing.bringToFront?.();
        await existing.render({ force: true });
        return existing;
    }
    if (existing) await existing.close();

    const windowInstance = new StatusEffectsWindow({ ...options, actor, actorUuid: actor.uuid });
    await windowInstance.render(true);
    return windowInstance;
}

/**
 * The actor a context-free open acts on.
 *
 * The window is per-actor, but the menubar is not: it has no row to have been
 * clicked. Canvas selection with the user's own character as the fallback is the
 * same rule the Dice Tray, Macros, and Health tools use, so the four behave alike.
 *
 * @returns {Actor|null}
 */
function getCurrentActor() {
    return canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
}

/** Register the window and its menubar tool. */
export function registerStatusEffectsWindow() {
    registerWindow(STATUS_EFFECTS_WINDOW_ID, {
        moduleId: MODULE.ID,
        title: 'Status Effects',
        open: async (options = {}) => openStatusEffectsWindow(options)
    });

    MenuBar.registerMenubarTool('status-effects', {
        icon: 'fa-solid fa-sparkles',
        name: 'status-effects',
        title: null,
        tooltip: 'Status Effects for the selected token',
        // No actor in the options: the opener resolves it at click time rather than
        // at registration, so the tool follows the selection instead of freezing
        // whatever was selected when the menubar was built.
        onClick: () => openStatusEffectsWindow({ actor: getCurrentActor() }),
        zone: 'left',
        group: 'general',
        order: 203,
        moduleId: MODULE.ID,
        gmOnly: false,
        leaderOnly: false,
        visible: true
    });
}
