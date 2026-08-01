import { MODULE } from './const.js';
import { getSettingSafely, postConsoleAndNotification, formatTime, playSound, getPortraitImage } from './api-core.js';
import { RoundTimer } from './timer-round.js';
import { CombatTracker } from './ui-combat-tracker.js';
import { UIContextMenu } from './ui-context-menu.js';
import { HookManager } from './manager-hooks.js';
import { broadcastToast, ToastAPI } from './api-toast.js';
import { EncounterManager } from './manager-encounter.js';
import { getActorHP } from './utility-health.js';
import { EffectsAPI } from './api-effects.js';
import { BlacksmithToolWindowBaseV2 } from './window-tool-base.js';

class CombatantCardToolWindow extends BlacksmithToolWindowBaseV2 {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            classes: ['blacksmith-window-tool', 'blacksmith-combatant-tool-window'],
            position: { width: 300, height: 'auto' },
            window: {
                title: 'Combatant',
                resizable: false,
                minimizable: true
            },
            windowSizeConstraints: {
                minWidth: 260,
                maxWidth: 420,
                maxHeight: 'calc(100vh - 16px)'
            }
        }
    );

    constructor({ popoutId, menuBar, combatantId, followCombat = false, position = {} } = {}) {
        super({
            id: popoutId,
            rememberPosition: false,
            position: {
                width: 300,
                height: 'auto',
                ...position
            }
        });
        this.popoutId = popoutId;
        this.menuBar = menuBar;
        this.combatantId = combatantId;
        this.followCombat = Boolean(followCombat);
        this.renderVersion = 0;
    }

    get title() {
        return game.combats?.active?.combatants?.get(this.combatantId)?.name
            ?? super.title;
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    getToolHeaderActions() {
        return [{
            id: 'follow-combat',
            icon: 'fa-solid fa-crosshairs',
            label: `${MODULE.ID}.CombatHoverPopoutFollow`,
            active: this.followCombat,
            onClick: async () => {
                this.followCombat = !this.followCombat;
                if (this.followCombat) await CombatBarManager.syncFollowingCombatPopouts(this.menuBar);
                else await this.render(false);
            }
        }];
    }

    async getData() {
        const combatantId = this.combatantId;
        const renderVersion = ++this.renderVersion;
        const combatant = game.combats?.active?.combatants?.get(combatantId);
        if (!combatant) {
            queueMicrotask(() => { void this.close({ animate: false }); });
            return {
                appId: this.id,
                bodyContent: ''
            };
        }

        const hoverData = CombatBarManager.getCombatantHoverData(combatant);
        if (!hoverData) return { appId: this.id, bodyContent: '' };
        try {
            hoverData.effects = await CombatBarManager.getCombatantHoverEffects(combatant, hoverData);
        } catch (error) {
            console.warn(`${MODULE.NAME} | Unable to build combatant tool window`, error);
            hoverData.effects = [];
        }
        if (renderVersion !== this.renderVersion || combatantId !== this.combatantId) {
            return { appId: this.id, bodyContent: '' };
        }

        const content = CombatBarManager.buildCombatantHoverCardHtml(hoverData);
        return {
            appId: this.id,
            bodyContent: `<div class="blacksmith-combat-hover-card blacksmith-combat-tool-card is-visible">${content}</div>`
        };
    }

    _onClose(options) {
        super._onClose?.(options);
        CombatBarManager._combatantPopoutCards.delete(this.popoutId);
    }
}

export class CombatBarManager {
    static playUiSound(soundPath, volume = window.COFFEEPUB?.SOUNDVOLUMENORMAL ?? 0.7) {
        try {
            if (!soundPath) return;
            playSound(soundPath, volume, false, false);
        } catch (_error) {
            // Non-blocking UI feedback only.
        }
    }

    /**
     * Smooth horizontal scroll with easing for predictable per-click movement.
     * @param {HTMLElement} element
     * @param {number} deltaX
     * @param {number} durationMs
     * @param {() => void} [onUpdate]
     */
    static easeHorizontalScroll(element, deltaX, durationMs = 220, onUpdate) {
        if (!element || !Number.isFinite(deltaX) || deltaX === 0) return;
        const start = element.scrollLeft || 0;
        const max = Math.max(0, element.scrollWidth - element.clientWidth);
        const target = Math.min(max, Math.max(0, start + deltaX));
        if (Math.abs(target - start) < 0.5) return;

        if (element._blacksmithScrollRafId) {
            cancelAnimationFrame(element._blacksmithScrollRafId);
            element._blacksmithScrollRafId = null;
        }

        const t0 = performance.now();
        const easeInOutCubic = (t) => (t < 0.5)
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;

        const tick = (now) => {
            const elapsed = now - t0;
            const progress = Math.min(1, elapsed / durationMs);
            const eased = easeInOutCubic(progress);
            element.scrollLeft = start + ((target - start) * eased);
            if (typeof onUpdate === 'function') onUpdate();
            if (progress < 1) {
                element._blacksmithScrollRafId = requestAnimationFrame(tick);
            } else {
                element._blacksmithScrollRafId = null;
            }
        };

        element._blacksmithScrollRafId = requestAnimationFrame(tick);
    }

    static initialize(menuBar) {
        if (menuBar.__combatBarManagerInitialized) return;
        menuBar.__combatBarManagerInitialized = true;
        menuBar.__combatBarUserClosed = false;

        this._installMenuBarPatches(menuBar);
        menuBar.secondaryBarToolMapping.set('combat', 'combat-bar');
        this.registerCombatHooks(menuBar);
        this.registerCombatBarEvents(menuBar);
        this.openCombatBarOnLoad(menuBar);
        this.registerCombatPartial().catch((error) => {
            postConsoleAndNotification(MODULE.NAME, "Menubar: Error registering combat partial", error?.message || error, true, false);
        });
        this.registerCombatMenubarTool();
        const ensureCombatType = async () => {
            try {
                await CombatBarManager.registerCombatBarType(menuBar);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "Menubar: Error registering combat secondary bar type", error?.message || error, true, false);
            }
        };
        if (game.ready) {
            ensureCombatType();
        } else {
            Hooks.once('ready', ensureCombatType);
        }
    }

    static _installMenuBarPatches(menuBar) {
        if (menuBar.__combatBarPatchesInstalled) return;
        menuBar.__combatBarPatchesInstalled = true;

        const originalRegisterSecondaryBarTypes = menuBar.registerSecondaryBarTypes.bind(menuBar);
        menuBar.registerSecondaryBarTypes = async function (...args) {
            await originalRegisterSecondaryBarTypes(...args);
            if (!menuBar.secondaryBarTypes?.has?.('combat')) {
                await CombatBarManager.registerCombatBarType(menuBar);
            }
        };

        const originalOpenSecondaryBar = menuBar.openSecondaryBar.bind(menuBar);
        menuBar.openSecondaryBar = function (typeId, options = {}) {
            if (typeId === 'combat') {
                // Do not block manual opens here: __combatBarUserClosed is enforced in openCombatBar() only
                // (hook-driven auto-open). Otherwise the menubar button can fail when toggleSecondaryBar
                // is not the patched wrapper (e.g. stale api binding) and the flag is never cleared.
                const combat = CombatBarManager.getActiveCombat();
                // Height first, data second: the ring geometry is read from the
                // height variable while getCombatData runs.
                //
                // The height must also ride along in the options on every open.
                // Without it the base method falls back to `barType.height`,
                // which was frozen at registration from the CSS default — so the
                // size setting moved only the health rings while the bar, and
                // every screen element the menubar offsets below it, stayed put.
                const combatHeight = CombatBarManager.applyBarHeight(menuBar, !!combat);
                const data = CombatBarManager.getCombatData(combat);
                const result = originalOpenSecondaryBar(typeId, { height: combatHeight, ...options, data });
                if (result) menuBar.__combatBarUserClosed = false;
                return result;
            }
            return originalOpenSecondaryBar(typeId, options);
        };

        const originalCloseSecondaryBar = menuBar.closeSecondaryBar.bind(menuBar);
        menuBar.closeSecondaryBar = function (userInitiated = false, syncButtons = true) {
            if (userInitiated && menuBar.secondaryBar.type === 'combat') {
                menuBar.__combatBarUserClosed = true;
            }
            CombatBarManager.hideCombatantHoverCard(menuBar);
            return originalCloseSecondaryBar(userInitiated, syncButtons);
        };

        const originalToggleSecondaryBar = menuBar.toggleSecondaryBar.bind(menuBar);
        menuBar.toggleSecondaryBar = function (typeId, options = {}) {
            if (typeId === 'combat' && (!menuBar.secondaryBar.isOpen || menuBar.secondaryBar.type !== 'combat')) {
                menuBar.__combatBarUserClosed = false;
            }
            return originalToggleSecondaryBar(typeId, options);
        };

        const originalUpdateSecondaryBar = menuBar.updateSecondaryBar.bind(menuBar);
        menuBar.updateSecondaryBar = function (data) {
            if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                menuBar.secondaryBar.data = data;
                menuBar.renderMenubar(true);
                return true;
            }
            return originalUpdateSecondaryBar(data);
        };

        const originalPrepareSecondaryBarData = menuBar._prepareSecondaryBarData.bind(menuBar);
        menuBar._prepareSecondaryBarData = function () {
            const data = originalPrepareSecondaryBarData();
            // The base method assigns `data.data = {}` for custom templates
            // before this runs, so testing `!data.data` never fired and a bar
            // whose payload had gone missing rendered from an empty object —
            // no isGM, no isInCombat, and therefore a tray with nothing in it.
            // Treat an empty object as missing.
            const payload = data?.data;
            const isMissing = !payload || Object.keys(payload).length === 0;
            if (data?.isOpen && data.type === 'combat' && isMissing) {
                const combat = game.combats?.active ?? game.combat;
                data.data = CombatBarManager.getCombatData(combat);
            }
            return data;
        };

        const originalRenderMenubar = menuBar.renderMenubar.bind(menuBar);
        menuBar.renderMenubar = async function (...args) {
            const result = await originalRenderMenubar(...args);
            if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                requestAnimationFrame(() => {
                    CombatBarManager.updateCombatPortraitScrollArrows(menuBar);
                    CombatBarManager.attachCombatPortraitScrollListener(menuBar);
                    CombatBarManager.ensureCurrentCombatantVisible(menuBar);
                    setTimeout(() => CombatBarManager.updateCombatPortraitScrollArrows(menuBar), 100);
                });
            }
            return result;
        };
    }
    static async registerCombatPartial() {
        const combatBarTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partials/menubar-combat.hbs')
            .then(response => response.text());
        Handlebars.registerPartial('menubar-combat', combatBarTemplate);
    }

    static async registerCombatBarType(menuBar) {
        const api = game.modules.get(MODULE.ID)?.api;
        if (!api?.registerSecondaryBarType) return;
        await api.registerSecondaryBarType('combat', {
            height: menuBar.getSecondaryBarHeight('combat'),
            persistence: 'manual',
            autoCloseDelay: 10000,
            templatePath: 'modules/coffee-pub-blacksmith/templates/partials/menubar-combat.hbs',
            // Bespoke markup for the portrait strip, registered items for the
            // readouts. The strip is the only thing here the item vocabulary
            // cannot express; challenge rating, health, balance, and timers
            // are all info/progressbar/balancebar and belong as items.
            hybridItems: true,
            // Banners match the other secondary bars in the suite (Broadcast,
            // Cartographer): grouped, labelled sections rather than loose icons.
            // No group banners: those caption a cluster of otherwise unlabelled
            // buttons, which is what the Broadcast and Cartographer bars need.
            // These items carry their own labels, so a banner would only repeat
            // them. Groups still earn their keep as divider boundaries.
            groupBannerEnabled: false,
            groups: {
                'encounter': { mode: 'default', order: 0 },
                'health': { mode: 'default', order: 5 },
                'challenge': { mode: 'default', order: 10 }
            }
        });
        api.registerSecondaryBarTool?.('combat', 'combat-bar');
        CombatBarManager.registerReadoutItems(api);
    }

    /**
     * Readout items for the bar's right-hand zone. GM-only: challenge rating
     * tells a player how dangerous the fight they are in was designed to be.
     */
    static registerReadoutItems(api) {
        if (!api?.registerSecondaryBarItem) return;
        const gmOnly = () => game.user.isGM;
        const inCombat = () => !!CombatBarManager.getActiveCombat();

        // Round and turn are readouts, so they live in the data row with the
        // rest rather than in an endcap beside the portraits. Everyone sees
        // these; only the challenge rating below is GM information.
        api.registerSecondaryBarItem('combat', 'round', {
            kind: 'info',
            zone: 'left',
            group: 'encounter',
            order: 0,
            icon: 'fa-solid fa-hourglass-half',
            label: 'Round',
            value: '0',
            tooltip: 'Current round',
            visible: inCombat
        });
        api.registerSecondaryBarItem('combat', 'turn', {
            kind: 'info',
            zone: 'left',
            group: 'encounter',
            order: 1,
            icon: 'fa-solid fa-user-clock',
            label: 'Turn',
            value: '0 of 0',
            tooltip: 'Current turn',
            visible: inCombat
        });

        // Health. Party is everyone's business; monster totals are not, in the
        // same way the challenge rating is not.
        const health = CombatBarManager.getHealthSummaries();
        api.registerSecondaryBarItem('combat', 'party-health', {
            kind: 'progressbar',
            zone: 'right',
            group: 'health',
            order: 0,
            width: 150,
            // 40% of the row would be 12px; a health bar wants more presence.
            height: 18,
            icon: '',
            title: '',
            borderColor: 'rgba(0,0,0,0.5)',
            barColor: '#2d5016',
            progressColor: '#4a7c23',
            leftIcon: 'fa-solid fa-shield-halved',
            percentProgress: health.party.percent,
            leftLabel: String(health.party.current),
            rightLabel: String(health.party.max),
            tooltip: 'Party total HP'
        });
        api.registerSecondaryBarItem('combat', 'monster-health', {
            kind: 'progressbar',
            zone: 'right',
            group: 'health',
            order: 1,
            width: 150,
            height: 18,
            icon: '',
            title: '',
            borderColor: 'rgba(0,0,0,0.5)',
            barColor: '#4a0a0a',
            progressColor: '#a02020',
            leftIcon: 'fa-solid fa-dragon',
            percentProgress: health.monster.percent,
            leftLabel: String(health.monster.current),
            rightLabel: String(health.monster.max),
            tooltip: 'Monster total HP',
            visible: gmOnly
        });

        api.registerSecondaryBarItem('combat', 'party-cr', {
            kind: 'info',
            zone: 'right',
            group: 'challenge',
            order: 0,
            icon: 'fas fa-helmet-battle',
            label: 'Party',
            value: '0',
            tooltip: 'Party challenge rating',
            visible: gmOnly
        });
        api.registerSecondaryBarItem('combat', 'monster-cr', {
            kind: 'info',
            zone: 'right',
            group: 'challenge',
            order: 1,
            icon: 'fas fa-dragon',
            label: 'Monster',
            value: '0',
            tooltip: 'Monster challenge rating',
            visible: gmOnly
        });
        api.registerSecondaryBarItem('combat', 'difficulty', {
            kind: 'info',
            zone: 'right',
            group: 'challenge',
            order: 2,
            icon: 'fa-solid fa-swords',
            label: '',
            value: 'None',
            tooltip: 'Encounter difficulty',
            visible: gmOnly
        });

        CombatBarManager.refreshReadoutItems();
    }

    /**
     * Total HP across a set of tokens or combatants, via the shared
     * `getActorHP` rather than another local copy of the HP shape lookup.
     *
     * Linked tokens are counted once per actor: five goblins from an unlinked
     * prototype are five separate HP pools, but two tokens of the same linked
     * PC are one, and summing per token would double that character's health.
     *
     * @param {Array<{actor: Actor|null, linked: boolean}>} entries
     */
    static _sumHealth(entries) {
        let current = 0;
        let max = 0;
        const seenLinked = new Set();
        for (const { actor, linked } of entries) {
            if (!actor) continue;
            if (linked) {
                if (seenLinked.has(actor.id)) continue;
                seenLinked.add(actor.id);
            }
            const hp = getActorHP(actor);
            if (!hp) continue;
            current += hp.value;
            max += hp.max;
        }
        const percent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
        return { current, max, percent: Math.round(percent) };
    }

    /**
     * Party and monster health, scoped to match what the bar is answering.
     * Out of combat that is "is the fight in front of me winnable", so it reads
     * the canvas — the same scope the challenge rating uses. In combat it is
     * "how is this fight going", so it reads the tracker.
     */
    static getHealthSummaries() {
        const combat = CombatBarManager.getActiveCombat();
        const party = [];
        const monsters = [];

        if (combat) {
            const combatants = Array.isArray(combat.turns) && combat.turns.length
                ? combat.turns
                : Array.from(combat.combatants);
            for (const c of combatants) {
                const entry = { actor: c.actor || null, linked: !!c.token?.actorLink };
                (c.isNPC ? monsters : party).push(entry);
            }
        } else {
            for (const token of (canvas?.tokens?.placeables ?? [])) {
                const actor = token.actor;
                if (!actor) continue;
                const entry = { actor, linked: !!token.document?.actorLink };
                (actor.hasPlayerOwner ? party : monsters).push(entry);
            }
        }

        return {
            party: CombatBarManager._sumHealth(party),
            monster: CombatBarManager._sumHealth(monsters)
        };
    }

    static _readoutRefreshTimer = null;

    /**
     * Debounced refresh. Dropping a dozen tokens fires a dozen hooks, and the
     * assessment walks every placeable each time.
     */
    static scheduleReadoutRefresh(menuBar) {
        if (CombatBarManager._readoutRefreshTimer) {
            clearTimeout(CombatBarManager._readoutRefreshTimer);
        }
        CombatBarManager._readoutRefreshTimer = setTimeout(() => {
            CombatBarManager._readoutRefreshTimer = null;
            // updateCombatBar refreshes the readouts itself before rendering.
            CombatBarManager.updateCombatBar(menuBar);
        }, 250);
    }

    /**
     * Recompute the challenge rating readouts. Canvas-scoped, matching what
     * the numbers have always meant: they answer whether the fight in front of
     * you is fair, not who is currently in the tracker.
     */
    static refreshReadoutItems() {
        try {
            const api = game.modules.get(MODULE.ID)?.api;
            if (!api?.updateSecondaryBarItemInfo) return;

            // Round and turn are everyone's; the challenge rating below is not.
            const combat = CombatBarManager.getActiveCombat();
            if (combat) {
                const totalTurns = Array.isArray(combat.turns) ? combat.turns.length : combat.combatants.size;
                const currentTurn = Math.min((typeof combat.turn === 'number' ? combat.turn : 0) + 1, Math.max(totalTurns, 1));
                api.updateSecondaryBarItemInfo('combat', 'round', { value: String(combat.round || 0) });
                api.updateSecondaryBarItemInfo('combat', 'turn', { value: `${currentTurn} of ${totalTurns}` });
            }

            const health = CombatBarManager.getHealthSummaries();
            api.updateSecondaryBarItemInfo('combat', 'party-health', {
                percentProgress: health.party.percent,
                leftLabel: String(health.party.current),
                rightLabel: String(health.party.max)
            });
            api.updateSecondaryBarItemInfo('combat', 'monster-health', {
                percentProgress: health.monster.percent,
                leftLabel: String(health.monster.current),
                rightLabel: String(health.monster.max)
            });

            if (!game.user.isGM) return;
            const assessment = EncounterManager.getCombatAssessment({});
            api.updateSecondaryBarItemInfo('combat', 'party-cr', { value: assessment.partyCRDisplay });
            api.updateSecondaryBarItemInfo('combat', 'monster-cr', { value: assessment.monsterCRDisplay });
            api.updateSecondaryBarItemInfo('combat', 'difficulty', {
                value: assessment.difficulty,
                label: '',
                iconColor: EncounterManager.getDifficultyBorderColor(assessment.difficultyClass),
                borderColor: null
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error refreshing challenge rating', error?.message || error, false, false);
        }
    }

    static registerCombatMenubarTool() {
        const api = game.modules.get(MODULE.ID)?.api;
        if (!api?.registerMenubarTool) return;
        if (api.isMenubarToolRegistered?.('combat-bar')) return;
        api.registerMenubarTool('combat-bar', {
            icon: "fas fa-swords",
            name: "combat-bar",
            title: () => "Combat Bar",
            tooltip: "Show combat tracker secondary bar",
            onClick: () => api.toggleSecondaryBar('combat'),
            zone: "middle",
            group: "combat",
            groupOrder: 1,
            order: 2,
            moduleId: "blacksmith-core",
            gmOnly: false,
            leaderOnly: false,
            // Always available. Gating this on an active combat took the only
            // control that reopens the bar away for exactly the stretch the bar
            // is now meant to cover, so a bar dismissed out of combat could not
            // be brought back until someone started an encounter.
            visible: true,
            toggleable: true,
            active: false,
            iconColor: null,
            buttonNormalTint: "rgba(88, 15, 4, 0.5)",
            buttonSelectedTint: "rgba(88, 15, 4, 0.9)"
        });
    }

    static registerCombatHooks(menuBar) {
        const combatUpdateHookId = HookManager.registerHook({
            name: 'updateCombat',
            description: 'MenuBar: Update combat bar on combat changes',
            context: 'menubar-combat-update',
            priority: 3,
            callback: (_combat, updateData) => {
                const shouldUpdate = updateData.turn !== undefined ||
                    updateData.round !== undefined ||
                    updateData.combatants !== undefined;
                if (shouldUpdate) CombatBarManager.updateCombatBar(menuBar);
                if (updateData.turn !== undefined || updateData.round !== undefined) {
                    void CombatBarManager.syncFollowingCombatPopouts(menuBar);
                }
            }
        });

        const combatCreateHookId = HookManager.registerHook({
            name: 'createCombat',
            description: 'MenuBar: Open combat bar when combat is created',
            context: 'menubar-combat-create',
            priority: 3,
            callback: () => {
                const shouldShowCombatBar = game.settings.get(MODULE.ID, 'menubarCombatShow');
                if (shouldShowCombatBar) CombatBarManager.openCombatBar(menuBar);
            }
        });

        const combatantCreateHookId = HookManager.registerHook({
            name: 'createCombatant',
            description: 'MenuBar: Open combat bar when combatants are added',
            context: 'menubar-combatant-create',
            priority: 3,
            callback: (combatant) => {
                if (combatant.combat.combatants.size === 1) {
                    const shouldShowCombatBar = game.settings.get(MODULE.ID, 'menubarCombatShow');
                    if (shouldShowCombatBar) CombatBarManager.openCombatBar(menuBar);
                } else if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                    CombatBarManager.updateCombatBar(menuBar);
                }
            }
        });

        const combatantUpdateHookId = HookManager.registerHook({
            name: 'updateCombatant',
            description: 'MenuBar: Update combat bar when combatants are updated',
            context: 'menubar-combatant-update',
            priority: 3,
            callback: (_combatant, updateData) => {
                const initiativeUpdated = updateData.initiative !== undefined;
                if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                    CombatBarManager.updateCombatBar(menuBar);
                    if (initiativeUpdated) menuBar.renderMenubar();
                }
                void CombatBarManager.refreshCombatantPopoutCardsForCombatant(menuBar, _combatant?.id);
            }
        });

        const combatantDeleteHookId = HookManager.registerHook({
            name: 'deleteCombatant',
            description: 'MenuBar: Update combat bar when combatants are removed',
            context: 'menubar-combatant-delete',
            priority: 3,
            callback: (combatant) => {
                CombatBarManager.handleDeletedCombatantPopouts(menuBar, combatant?.id);
                if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                    CombatBarManager.updateCombatBar(menuBar);
                }
            }
        });

        // Challenge rating is canvas-derived, so it follows token changes, not
        // combat events. These are the bar's own hooks rather than a reuse of
        // EncounterToolbar's: those are registered only when
        // `enableJournalEncounterToolbarRealTimeUpdates` is on, and a readout
        // on a permanently visible bar must not go stale because a setting
        // named after journal toolbars was switched off.
        for (const hookName of ['createToken', 'updateToken', 'deleteToken']) {
            HookManager.registerHook({
                name: hookName,
                description: `MenuBar: Refresh combat bar challenge rating on ${hookName}`,
                context: 'menubar-combat-cr',
                priority: 3,
                callback: () => CombatBarManager.scheduleReadoutRefresh(menuBar)
            });
        }

        const combatDeleteHookId = HookManager.registerHook({
            name: 'deleteCombat',
            description: 'MenuBar: Close combat bar when combat is deleted',
            context: 'menubar-combat-delete',
            priority: 3,
            callback: () => {
                CombatBarManager.closeAllCombatantPopoutCards();
                // Ending an encounter empties the bar; it does not remove it.
                CombatBarManager.updateCombatBar(menuBar);
            }
        });

        const combatTrackerRenderHookId = HookManager.registerHook({
            name: 'renderApplication',
            description: 'MenuBar: Update combat tracker button when combat tracker window opens',
            context: 'menubar-combat-tracker-render',
            priority: 3,
            callback: (app) => {
                if (app && app.appId === 'combat') menuBar.renderMenubar(true);
            }
        });

        const combatTrackerCloseHookId = HookManager.registerHook({
            name: 'closeApplication',
            description: 'MenuBar: Update combat tracker button when combat tracker window closes',
            context: 'menubar-combat-tracker-close',
            priority: 3,
            callback: (app) => {
                if (app && app.appId === 'combat') menuBar.renderMenubar(true);
            }
        });

        const updateActorHookId = HookManager.registerHook({
            name: 'updateActor',
            description: 'MenuBar: Update combat bar when actor HP changes',
            context: 'menubar-actor-update',
            priority: 3,
            callback: (actor, updateData) => {
                if (CombatBarManager.isCombatBarActive(menuBar)) CombatBarManager.handleActorHpChange(menuBar, actor, updateData);
                void CombatBarManager.refreshCombatantPopoutCardsForActor(menuBar, actor);
                // The health readouts cover the canvas out of combat, so they
                // follow any actor's HP and not only a combatant's.
                CombatBarManager.scheduleReadoutRefresh(menuBar);
                if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'party') {
                    menuBar._refreshPartyBarInfo();
                }
            }
        });

        const updateTokenHookId = HookManager.registerHook({
            name: 'updateToken',
            description: 'MenuBar: Update combat bar when token HP changes',
            context: 'menubar-token-update',
            priority: 3,
            callback: (token, updateData) => {
                if (CombatBarManager.isCombatBarActive(menuBar)) CombatBarManager.handleTokenHpChange(menuBar, token, updateData);
                CombatBarManager.scheduleReadoutRefresh(menuBar);
            }
        });

        const activeEffectChangedHookId = HookManager.registerHook({
            name: EffectsAPI.HOOKS.changed,
            description: 'MenuBar: Refresh combat hover card when Active Effects change',
            context: 'menubar-active-effect-change',
            priority: 3,
            callback: ({ actor }) => {
                void CombatBarManager.refreshVisibleCombatantHoverCard(menuBar, actor);
                void CombatBarManager.refreshCombatantPopoutCardsForActor(menuBar, actor);
            }
        });

        const combatSizeSettingHookId = HookManager.registerSettingChangeCallback({
            description: 'MenuBar: Refresh combat bar when either bar size changes',
            context: 'menubar-combat-size-change',
            priority: 3,
            callback: (module, key) => {
                if (module !== MODULE.ID) return;
                if (key !== 'menubarCombatSize' && key !== 'menubarCombatSizeIdle') return;
                // updateCombatBar resolves and applies the height for the
                // current combat state, so changing whichever size is not in
                // force right now correctly leaves the bar alone.
                if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                    CombatBarManager.updateCombatBar(menuBar);
                }
            }
        });

        const combatHideDeadSettingHookId = HookManager.registerSettingChangeCallback({
            description: 'MenuBar: Refresh combat bar when dead combatant visibility changes',
            context: 'menubar-combat-hide-dead-change',
            priority: 3,
            callback: (module, key) => {
                if (module !== MODULE.ID || key !== 'menubarCombatHideDead') return;
                if (game.combat && menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                    CombatBarManager.updateCombatBar(menuBar);
                }
            }
        });

        const combatShowEffectsSettingHookId = HookManager.registerSettingChangeCallback({
            description: 'MenuBar: Refresh combat hover card when effect visibility changes',
            context: 'menubar-combat-show-effects-change',
            priority: 3,
            callback: (module, key) => {
                if (module !== MODULE.ID || key !== 'menubarCombatShowEffects') return;
                CombatBarManager.refreshVisibleCombatantHoverCard(menuBar);
                void CombatBarManager.refreshAllCombatantPopoutCards(menuBar);
            }
        });

        menuBar._registeredHooks = {
            combatUpdateHookId,
            combatCreateHookId,
            combatantCreateHookId,
            combatantUpdateHookId,
            combatantDeleteHookId,
            combatDeleteHookId,
            combatTrackerRenderHookId,
            combatTrackerCloseHookId,
            updateActorHookId,
            updateTokenHookId,
            activeEffectChangedHookId,
            combatSizeSettingHookId,
            combatHideDeadSettingHookId,
            combatShowEffectsSettingHookId
        };

        postConsoleAndNotification(MODULE.NAME, "MenuBar: Combat hooks registered", "", true, false);
    }

    static updateCombatPortraitScrollArrows(_menuBar) {
        const wrapper = document.querySelector('.combat-portraits-scroll-wrapper');
        if (!wrapper) return;
        const portraits = wrapper.querySelector('.combat-portraits');
        const leftBtn = wrapper.querySelector('.combat-scroll-arrow[data-control="scrollCombatantsLeft"]');
        const rightBtn = wrapper.querySelector('.combat-scroll-arrow[data-control="scrollCombatantsRight"]');
        if (!portraits || !leftBtn || !rightBtn) return;

        const contentWidth = portraits.scrollWidth;
        const visibleWidth = portraits.clientWidth;
        const overflowing = contentWidth > visibleWidth + 1 || (visibleWidth < 80 && contentWidth > 0);
        wrapper.classList.toggle('combat-portraits-overflowing', overflowing);

        if (!overflowing) {
            leftBtn.disabled = false;
            rightBtn.disabled = false;
            return;
        }

        const tolerance = 2;
        const maxScrollLeft = Math.max(0, contentWidth - visibleWidth);
        const currentScrollLeft = portraits.scrollLeft || 0;
        leftBtn.disabled = currentScrollLeft <= tolerance;
        rightBtn.disabled = currentScrollLeft >= (maxScrollLeft - tolerance);
    }

    static ensureCurrentCombatantVisible(menuBar) {
        const wrapper = document.querySelector('.combat-portraits-scroll-wrapper');
        const portraits = wrapper?.querySelector('.combat-portraits');
        if (!portraits) return;

        const currentPortrait = portraits.querySelector('.combat-portrait-container.current');
        if (!currentPortrait) return;

        const portRect = portraits.getBoundingClientRect();
        const currentRect = currentPortrait.getBoundingClientRect();
        let delta = 0;

        // Only scroll when the current combatant is actually clipped off-screen.
        if (currentRect.left < portRect.left) {
            delta = currentRect.left - portRect.left;
        } else if (currentRect.right > portRect.right) {
            delta = currentRect.right - portRect.right;
        }

        if (Math.abs(delta) > 1) {
            CombatBarManager.easeHorizontalScroll(
                portraits,
                delta,
                220,
                () => CombatBarManager.updateCombatPortraitScrollArrows(menuBar)
            );
        }
    }

    static attachCombatPortraitScrollListener(menuBar) {
        const wrapper = document.querySelector('.combat-portraits-scroll-wrapper');
        const portraits = wrapper?.querySelector('.combat-portraits');
        if (!portraits || portraits.dataset.scrollListenerAttached === 'true') return;
        portraits.dataset.scrollListenerAttached = 'true';
        portraits.addEventListener('scroll', () => CombatBarManager.updateCombatPortraitScrollArrows(menuBar), { passive: true });
        if (wrapper) {
            menuBar._combatBarResizeObserver?.disconnect();
            const ro = new ResizeObserver(() => {
                requestAnimationFrame(() => CombatBarManager.updateCombatPortraitScrollArrows(menuBar));
            });
            ro.observe(wrapper);
            menuBar._combatBarResizeObserver = ro;
        }
    }

    static cleanupCombatBarEvents(menuBar) {
        menuBar._combatBarResizeObserver?.disconnect();
        menuBar._combatBarResizeObserver = null;
        if (menuBar._combatHoverMoveRaf != null) {
            cancelAnimationFrame(menuBar._combatHoverMoveRaf);
            menuBar._combatHoverMoveRaf = null;
        }
        menuBar._combatHoverMoveEvent = null;
        if (menuBar._combatBarClickHandler) {
            document.removeEventListener('click', menuBar._combatBarClickHandler);
            menuBar._combatBarClickHandler = null;
        }
        if (menuBar._combatBarDblClickHandler) {
            document.removeEventListener('dblclick', menuBar._combatBarDblClickHandler);
            menuBar._combatBarDblClickHandler = null;
        }
        if (menuBar._combatBarHoverMoveHandler) {
            document.removeEventListener('mousemove', menuBar._combatBarHoverMoveHandler);
            menuBar._combatBarHoverMoveHandler = null;
        }
        if (menuBar._combatBarContextMenuHandler) {
            document.removeEventListener('contextmenu', menuBar._combatBarContextMenuHandler);
            menuBar._combatBarContextMenuHandler = null;
        }
        if (menuBar._combatBarPointerDownHandler) {
            document.removeEventListener('pointerdown', menuBar._combatBarPointerDownHandler);
            menuBar._combatBarPointerDownHandler = null;
        }
        if (menuBar._combatBarPointerMoveHandler) {
            document.removeEventListener('pointermove', menuBar._combatBarPointerMoveHandler);
            menuBar._combatBarPointerMoveHandler = null;
        }
        if (menuBar._combatBarPointerUpHandler) {
            document.removeEventListener('pointerup', menuBar._combatBarPointerUpHandler);
            menuBar._combatBarPointerUpHandler = null;
        }
        if (menuBar._combatBarKeyDownHandler) {
            document.removeEventListener('keydown', menuBar._combatBarKeyDownHandler);
            menuBar._combatBarKeyDownHandler = null;
        }
        CombatBarManager._teardownInitiativeDrag();

        CombatBarManager.hideCombatantHoverCard(menuBar);
        // These live on document.body, so tearing down the bar does not take
        // them with it — they have to be closed explicitly.
        UIContextMenu.close('blacksmith-combat-portrait-context-menu');
        UIContextMenu.close('blacksmith-combat-initiative-menu');
        UIContextMenu.close('blacksmith-combat-encounter-menu');
        UIContextMenu.close('blacksmith-combat-tokens-menu');
        UIContextMenu.close('blacksmith-combat-graveyard-menu');
        menuBar.removeClickHandlers();
        menuBar._stopTimerUpdates();
        postConsoleAndNotification(MODULE.NAME, "MenuBar: Combat bar event handlers and timer intervals cleaned up", "", true, false);
    }

    /**
     * Open the bar at startup when the setting allows it, whether or not a
     * combat exists. Previously this only fired for a combat that already had
     * combatants, which is why the bar was absent for the part of a session
     * where you most want Create Combat.
     */
    static openCombatBarOnLoad(menuBar) {
        try {
            setTimeout(async () => {
                const shouldShowCombatBar = getSettingSafely(MODULE.ID, 'menubarCombatShow', false);
                if (!shouldShowCombatBar) return;
                if (!menuBar.secondaryBarTypes?.has?.('combat')) {
                    await CombatBarManager.registerCombatBarType(menuBar);
                }
                CombatBarManager.openCombatBar(menuBar);
            }, 500);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error opening combat bar on load", { error }, false, false);
        }
    }

    static updateCombatBar(menuBar, combatData = null) {
        try {
            // A rebuild mid-drag would yank the portrait out from under the
            // pointer — defer; the drag's end applies it (or the initiative
            // write triggers its own).
            if (CombatBarManager._initiativeDrag?.active) {
                CombatBarManager._initiativeDrag.refreshPending = true;
                return false;
            }
            if (menuBar._isUserExcluded(game.user)) return false;
            if (!menuBar.secondaryBar.isOpen || menuBar.secondaryBar.type !== 'combat') return false;

            // No combat is a content state, not a reason to close. The bar
            // falls back to its idle shape and keeps the Encounter and Tokens
            // menus reachable, which is the whole point of them living here.
            const combat = CombatBarManager.getActiveCombat();
            // Every combat-state transition already routes through here, so
            // resizing here is what keeps the two sizes in step — and it has to
            // happen before the data is built, since portrait rings are sized
            // from the height variable as getCombatData runs.
            CombatBarManager.applyBarHeight(menuBar, !!combat);
            // Readout values are item state, not template data, so they have to
            // be pushed before the render that reads them.
            CombatBarManager.refreshReadoutItems();
            const data = combatData || CombatBarManager.getCombatData(combat);
            CombatBarManager.hideCombatantHoverCard(menuBar);
            return menuBar.updateSecondaryBar(data);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error updating combat bar", { error }, false, false);
            return false;
        }
    }

    /**
     * The one combat the bar reflects. Height and contents must agree on this,
     * so both ask the same question rather than each testing for themselves.
     */
    static getActiveCombat() {
        return game.combats?.active ?? game.combat ?? null;
    }

    /**
     * The data row's height. Deliberately a constant and not a setting: the
     * whole reason the row exists is that the item vocabulary sizes itself
     * from the bar height, and the combat row has to scale for portraits.
     * A slider here would reintroduce exactly the problem the row solves.
     */
    static DATA_ROW_HEIGHT = 30;

    /**
     * The combat row's height — portraits, controls, the part the user scales.
     * Two settings because that row carries portraits during an encounter and
     * only the menus between them.
     */
    static resolveCombatRowHeight(isInCombat) {
        return isInCombat
            ? getSettingSafely(MODULE.ID, 'menubarCombatSize', 60)
            : getSettingSafely(MODULE.ID, 'menubarCombatSizeIdle', 40);
    }

    /**
     * Size the bar. Three variables, three consumers:
     *
     * - `--blacksmith-combatbar-data-height` sizes the data row, and the row's
     *   CSS shadows `--blacksmith-menubar-secondary-height` to it so every
     *   registered item inside re-bases without the shared partial or the item
     *   JS knowing anything about rows.
     * - `--blacksmith-combatbar-combat-height` sizes the combat row, and every
     *   portrait and button dimension derives from it rather than the total.
     * - `--blacksmith-menubar-secondary-height` is the total, which the layout
     *   and `--blacksmith-menubar-total-height` work from, so the Foundry UI
     *   beneath the menubar follows without a second write.
     *
     * `--blacksmith-menubar-secondary-combat-height` stays the combat row's
     * height: getCombatData reads it for ring geometry.
     *
     * Call this BEFORE building bar data — the ring geometry is read from that
     * variable as getCombatData runs, so setting it afterwards sizes the rings
     * from the previous state.
     */
    static applyBarHeight(menuBar, isInCombat) {
        const combatRow = CombatBarManager.resolveCombatRowHeight(isInCombat);
        const dataRow = CombatBarManager.DATA_ROW_HEIGHT;
        const total = combatRow + dataRow;
        const root = document.documentElement.style;
        root.setProperty('--blacksmith-combatbar-data-height', `${dataRow}px`);
        root.setProperty('--blacksmith-combatbar-combat-height', `${combatRow}px`);
        root.setProperty('--blacksmith-menubar-secondary-combat-height', `${combatRow}px`);
        if (menuBar?.secondaryBar?.isOpen && menuBar.secondaryBar.type === 'combat') {
            menuBar.secondaryBar.height = total;
            root.setProperty('--blacksmith-menubar-secondary-height', `${total}px`);
        }
        return total;
    }

    /**
     * The bar's shape with no combat running. The bar itself is no longer tied
     * to a combat existing — combat state decides what it *contains*, not
     * whether it is there — so every path that used to close the bar or hand
     * back an empty object renders this instead.
     */
    static getIdleBarData() {
        return {
            combatants: [],
            graveyard: [],
            hasGraveyard: false,
            graveyardCount: 0,
            actionButton: null,
            currentRound: 0,
            currentTurn: 0,
            totalTurns: 0,
            currentCombatant: '',
            totalCombatDuration: formatTime(0, 'hh:mm:ss'),
            currentRoundDuration: formatTime(0, 'hh:mm:ss'),
            isGM: game.user.isGM,
            isActive: false,
            isInCombat: false
        };
    }

    static getCombatData(combat) {
        try {
            if (!combat) return CombatBarManager.getIdleBarData();

            const hideNpcHealthSetting = game.settings.get(MODULE.ID, 'menubarCombatHideHealthBars');
            const hideDeadCombatants = game.settings.get(MODULE.ID, 'menubarCombatHideDead');
            const hideNpcHealth = hideNpcHealthSetting && !game.user.isGM;
            const isGM = game.user.isGM;

            // Turn order is the combat tracker's, never ours. combat.turns is the
            // sequence Foundry itself advances through (and the system may override
            // its tiebreak), so reading it is the only way equal initiatives resolve
            // the same way in the bar as in the tracker. Do not re-sort the result.
            const orderedCombatants = Array.isArray(combat.turns) && combat.turns.length
                ? combat.turns
                : Array.from(combat.combatants);

            const visibleCombatants = orderedCombatants.map(combatant => {
                const token = combatant.token;
                const actor = combatant.actor;
                const isHidden = combatant.hidden || token?.hidden;
                if (!isGM && isHidden) return null;

                let currentHP = 0;
                let maxHP = 0;
                let healthPercentage = 100;
                let healthCircumference = 0;
                let healthDashOffset = 0;
                let healthClass = 'combat-portrait-ring-healthy';
                let healthRingHidden = false;

                const secondaryHeightStr = getComputedStyle(document.documentElement).getPropertyValue('--blacksmith-menubar-secondary-combat-height');
                const secondaryHeight = parseInt(secondaryHeightStr, 10) || 50;
                const size = Math.floor(secondaryHeight * 0.8);
                const strokeWidth = Math.max(2, Math.floor(size * 0.05));
                const radius = (size / 2) - (strokeWidth / 2);

                if (actor) {
                    const isNpc = !actor.hasPlayerOwner;
                    if (hideNpcHealth && isNpc) healthRingHidden = true;
                    if (actor.system?.attributes?.hp) {
                        currentHP = actor.system.attributes.hp.value || 0;
                        maxHP = actor.system.attributes.hp.max || 1;
                    } else if (actor.system?.hitPoints) {
                        currentHP = actor.system.hitPoints.value || 0;
                        maxHP = actor.system.hitPoints.max || 1;
                    }
                    if (maxHP > 0) healthPercentage = Math.max(0, Math.min(100, (currentHP / maxHP) * 100));
                    const circumference = 2 * Math.PI * radius;
                    const dashOffset = currentHP <= 0 ? 0 : circumference - (healthPercentage / 100) * circumference;
                    healthCircumference = circumference;
                    healthDashOffset = dashOffset;
                    if (currentHP <= 0) healthClass = 'combat-portrait-ring-dead';
                    else if (healthPercentage >= 75) healthClass = 'combat-portrait-ring-healthy';
                    else if (healthPercentage >= 50) healthClass = 'combat-portrait-ring-injured';
                    else if (healthPercentage >= 25) healthClass = 'combat-portrait-ring-bloodied';
                    else healthClass = 'combat-portrait-ring-critical';
                }

                const isActuallyDead = CombatBarManager.isCombatantDead(combatant);

                return {
                    id: combatant.id,
                    name: token?.name || actor?.name || 'Unknown',
                    portrait: actor?.img || token?.img || 'modules/coffee-pub-blacksmith/images/portraits/portrait-noimage.webp',
                    initiative: combatant.initiative || 0,
                    isCurrent: combatant.id === combat.current.combatantId,
                    isDefeated: isActuallyDead,
                    needsInitiative: combatant.initiative === null,
                    canRollInitiative: combatant.initiative === null && combatant.isOwner && !isActuallyDead,
                    currentHP,
                    maxHP,
                    healthPercentage,
                    healthCircumference,
                    healthDashOffset: healthRingHidden ? 0 : healthDashOffset,
                    healthClass: healthRingHidden ? 'combat-portrait-ring-hidden' : healthClass,
                    healthRingHidden,
                    svgSize: size,
                    svgCenter: size / 2,
                    svgRadius: radius,
                    svgStrokeWidth: strokeWidth,
                    isHidden
                };
            }).filter(combatant => combatant !== null);

            // "Hide dead" moves the dead out of the strip rather than dropping
            // them: they come back under the Graveyard button, which is the
            // only way to reach a hidden combatant's actions. With the setting
            // off they stay in the strip and the graveyard is empty.
            const graveyard = hideDeadCombatants ? visibleCombatants.filter(c => c.isDefeated) : [];
            const combatants = hideDeadCombatants
                ? visibleCombatants.filter(c => !c.isDefeated)
                : visibleCombatants;

            let actionButton = null;
            if (game.user.isGM) {
                actionButton = !combat.started
                    ? { control: 'beginCombat', label: 'Begin Combat', tooltip: 'Begin Combat', icon: 'fa-play', text: 'Begin Combat', type: 'begin' }
                    : { control: 'endCombat', label: 'End Combat', tooltip: 'End Combat', icon: 'fa-stop', text: 'End Combat', type: 'end' };
            } else {
                const currentCombatant = combat.combatants.get(combat.current.combatantId);
                const isPlayerTurn = currentCombatant && currentCombatant.isOwner;
                if (combat.started && isPlayerTurn) {
                    actionButton = { control: 'endTurn', label: 'End Turn', tooltip: 'End Turn', icon: 'fa-flag-checkered', text: 'End Turn', type: 'turn' };
                }
            }

            const currentRound = combat.round || 0;
            const totalTurns = Array.isArray(combat.turns) ? combat.turns.length : combat.combatants.size;
            const currentTurnIndex = typeof combat.turn === 'number' ? combat.turn : 0;
            const currentTurn = Math.min(currentTurnIndex + 1, Math.max(totalTurns, 1));
            const currentCombatantName = combat.combatant?.name || 'No Active Turn';
            const totalCombatDurationBase = combat.getFlag(MODULE.ID, 'totalCombatDuration') || 0;
            // Round timing is owned by RoundTimer; ask it rather than reading combat flags here.
            const currentRoundDurationMs = RoundTimer?.getCurrentRoundDuration?.() ?? 0;
            const totalCombatDurationMs = totalCombatDurationBase + currentRoundDurationMs;

            return {
                combatants,
                graveyard,
                hasGraveyard: graveyard.length > 0,
                graveyardCount: graveyard.length,
                actionButton,
                currentRound,
                currentTurn,
                totalTurns,
                currentCombatant: currentCombatantName,
                totalCombatDuration: formatTime(totalCombatDurationMs || 0, 'hh:mm:ss'),
                currentRoundDuration: formatTime(currentRoundDurationMs || 0, 'hh:mm:ss'),
                isGM: game.user.isGM,
                isActive: combat.started || false,
                isInCombat: true
            };
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error gathering combat data", { error }, false, false);
            // Idle rather than empty: an exception here used to blank the bar
            // into an unrecoverable shell with no buttons at all.
            return CombatBarManager.getIdleBarData();
        }
    }

    static isCombatBarActive(menuBar) {
        return menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat';
    }

    static didHpChange(updateData) {
        if (!updateData) return false;
        const targets = [
            'system.attributes.hp.value',
            'system.attributes.hp.temp',
            'system.attributes.hp.max',
            'system.attributes.hp.base',
            'system.attributes.hp.bonus',
            'system.vitals.hp.value',
            'system.vitals.hp.temp',
            'system.vitals.hp.max',
            'system.hitPoints.value',
            'system.hitPoints.max',
            'system.hp.value',
            'system.hp.max',
            'actorData.system.attributes.hp.value',
            'actorData.system.attributes.hp.temp',
            'actorData.system.attributes.hp.max',
            'actorData.system.hitPoints.value',
            'actorData.system.hitPoints.max',
            'actorData.system.hp.value',
            'actorData.system.hp.max'
        ];
        const flat = foundry.utils.flattenObject(updateData || {});
        const changed = targets.some(path => flat[path] !== undefined);
        if (changed) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: HP change detected in update data', { paths: targets.filter(path => flat[path] !== undefined), values: flat }, true, false);
        }
        return changed;
    }

    static handleActorHpChange(menuBar, actor, updateData) {
        try {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: updateActor received', { actorId: actor?.id, updateData }, true, false);
            if (!CombatBarManager.isCombatBarActive(menuBar)) return;
            if (!CombatBarManager.didHpChange(updateData)) return;
            const combat = game.combats?.active;
            if (!combat) return;
            const isCombatant = combat.combatants.some(combatant => combatant.actor?.id === actor?.id);
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Actor HP change evaluated', { isCombatant }, true, false);
            if (!isCombatant) return;
            CombatBarManager.updateCombatBar(menuBar);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Failed to process actor HP change', { actorId: actor?.id, error }, true, false);
        }
    }

    static handleTokenHpChange(menuBar, token, updateData) {
        try {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: updateToken received', { tokenId: token?.id, updateData }, true, false);
            if (!CombatBarManager.isCombatBarActive(menuBar)) return;
            const hpChanged = CombatBarManager.didHpChange(updateData);
            const hiddenChanged = 'hidden' in updateData;
            if (!hpChanged && !hiddenChanged) return;
            const combat = game.combats?.active;
            if (!combat) return;
            const tokenId = token?.id;
            const actorId = token?.actor?.id;
            const isCombatant = combat.combatants.some(combatant => combatant.token?.id === tokenId || combatant.actor?.id === actorId);
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Token change evaluated', { isCombatant, hpChanged, hiddenChanged }, true, false);
            if (!isCombatant) return;
            CombatBarManager.updateCombatBar(menuBar);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Failed to process token change', { tokenId: token?.id, error }, true, false);
        }
    }

    static openCombatBar(menuBar, combatData = null) {
        try {
            if (menuBar._isUserExcluded(game.user)) return false;
            // Respect "user dismissed" for automatic opens only; menubar button uses openSecondaryBar directly.
            if (menuBar.__combatBarUserClosed) return false;
            // Opens with or without a combat — getCombatData falls back to the
            // idle shape, and the bar is meant to be present either way.
            const combat = CombatBarManager.getActiveCombat();
            CombatBarManager.applyBarHeight(menuBar, !!combat);
            const data = combatData || CombatBarManager.getCombatData(combat);
            return menuBar.openSecondaryBar('combat', { data, persistence: 'manual' });
        } catch (_error) {
            return false;
        }
    }

    static closeCombatBar(menuBar) {
        try {
            if (menuBar._isUserExcluded(game.user)) return true;
            if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                menuBar.__combatBarUserClosed = false;
                CombatBarManager.hideCombatantHoverCard(menuBar);
                return menuBar.closeSecondaryBar();
            }
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error closing combat bar", { error }, false, false);
            return false;
        }
    }

    static async toggleCombatTracker() {
        try {
            if (CombatTracker.isCombatTrackerOpen()) {
                await CombatTracker.closeCombatTracker();
            } else {
                CombatTracker.openCombatTracker();
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error toggling combat tracker", error, false, false);
        }
    }

    static async rollInitiativeForCombatant(_menuBar, combatant, _event = null) {
        try {
            if (!combatant?.actor) return;

            if (!combatant.isOwner && !game.user.isGM) {
                ToastAPI.show({
                    title: 'Roll Initiative',
                    subtitle: `You do not have permission to roll for ${combatant.name}.`,
                    icon: 'fa-solid fa-triangle-exclamation',
                    duration: 4,
                    moduleId: 'blacksmith-core',
                    stackKey: 'blacksmith-roll-initiative'
                });
                return;
            }

            postConsoleAndNotification(MODULE.NAME, `Combat Bar: Rolling initiative for ${combatant.name}`, "", true, false);

            if (ui.combat) {
                try {
                    const el = ui.combat.element.querySelector(`[data-combatant-id="${combatant.id}"] .combatant-control[data-control="rollInitiative"]`);
                    if (el) {
                        el.click();
                        return;
                    }
                } catch (_trackerError) { /* fallback below */ }
            }

            if (game.dnd5e && combatant.actor.rollInitiative) {
                const rollMethod = combatant.actor.rollInitiative.toString();
                if (rollMethod.includes('dialog') || rollMethod.includes('Dialog')) {
                    await combatant.actor.rollInitiative();
                } else {
                    await combatant.actor.rollInitiative({});
                }
            } else {
                await combatant.rollInitiative();
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Combat Bar: Error rolling initiative for ${combatant?.name || 'combatant'}`, error, true, false);
        }
    }

    static registerCombatBarEvents(menuBar) {
        if (menuBar._combatBarClickHandler) return;

        menuBar._combatBarClickHandler = async (event) => {
            // The click that follows an initiative drag's pointerup is not a
            // click — eat it so it can't pan the canvas.
            if (CombatBarManager._suppressNextCombatClick) {
                CombatBarManager._suppressNextCombatClick = false;
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const initiativeMenuBtn = event.target.closest('.combatbar-button[data-control="initiativeMenu"]');
            if (initiativeMenuBtn) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                CombatBarManager.showInitiativeMenu(menuBar, initiativeMenuBtn);
                return;
            }

            const encounterMenuBtn = event.target.closest('.combatbar-button[data-control="encounterMenu"]');
            if (encounterMenuBtn) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                CombatBarManager.showEncounterMenu(menuBar, encounterMenuBtn);
                return;
            }

            const tokensMenuBtn = event.target.closest('.combatbar-button[data-control="tokensMenu"]');
            if (tokensMenuBtn) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                CombatBarManager.showTokensMenu(menuBar, tokensMenuBtn);
                return;
            }

            const graveyardMenuBtn = event.target.closest('.combatbar-button[data-control="graveyardMenu"]');
            if (graveyardMenuBtn) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                CombatBarManager.showGraveyardMenu(menuBar, graveyardMenuBtn);
                return;
            }

            const combatPortrait = event.target.closest('[data-combatant-id]');
            if (combatPortrait) {
                const isInitiativeDice = event.target.closest('.combat-portrait-initiative-dice');
                const isDeadOverlay = event.target.closest('.combat-portrait-dead-overlay');
                const isInteractiveElement = event.target.closest('a, button, .combatant-control');
                if (!isInitiativeDice && !isDeadOverlay && !isInteractiveElement) {
                    const combatantId = combatPortrait.getAttribute('data-combatant-id');
                    if (combatantId) {
                        event.preventDefault();
                        event.stopPropagation();
                        CombatBarManager.panToCombatant(menuBar, combatantId, { selectToken: game.user.isGM });
                        return;
                    }
                }
            }

            if (event.target.closest('.combatbar-button[data-control="previousRound"]')) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.previousRound();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Previous round", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error going to previous round", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="nextRound"]')) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.nextRound();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Next round", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error going to next round", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="previousTurn"]')) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.previousTurn();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Previous turn", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error going to previous-turn turn", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="nextTurn"]')) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.nextTurn();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Next turn", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error going to next turn", error, true, false);
                }
                return;
            }

            const scrollLeftBtn = event.target.closest('.combat-scroll-arrow[data-control="scrollCombatantsLeft"]');
            const scrollRightBtn = event.target.closest('.combat-scroll-arrow[data-control="scrollCombatantsRight"]');
            if (scrollLeftBtn || scrollRightBtn) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDBUTTON09, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                const bar = event.target.closest('.combat-tracker-bar');
                const portraits = bar?.querySelector('.combat-portraits');
                if (portraits) {
                    const first = portraits.querySelector('.combat-portrait-container');
                    const step = first ? first.offsetWidth + (parseInt(getComputedStyle(portraits).gap, 10) || 2) : Math.floor(portraits.clientWidth * 0.4);
                    const delta = scrollLeftBtn ? -step : step;
                    CombatBarManager.easeHorizontalScroll(portraits, delta, 220, () => CombatBarManager.updateCombatPortraitScrollArrows(menuBar));
                    setTimeout(() => CombatBarManager.updateCombatPortraitScrollArrows(menuBar), 400);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="beginCombat"]')) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.startCombat();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Combat started", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error starting combat", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="endCombat"]')) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.endCombat();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Combat ended", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error ending combat", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="endTurn"]')) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.nextTurn();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Turn ended", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error ending turn", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="rollInitiative"]')) {
                event.preventDefault();
                event.stopPropagation();
                try {
                    const combat = game.combat;
                    if (!combat) {
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: No active combat found", "", true, false);
                        return;
                    }
                    const autoRollEnabled = game.settings.get(MODULE.ID, 'combatTrackerRollInitiativePlayer');
                    const ownedPCsNeedingInitiative = combat.combatants.filter(c =>
                        c?.actor && c.actor.type === "character" && c.isOwner && c.initiative === null
                    );
                    if (ownedPCsNeedingInitiative.length === 0) {
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: No owned characters need initiative", "", true, false);
                        return;
                    }
                    if (autoRollEnabled) {
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Using core auto-roll functionality", "", true, false);
                        const CT = await import('./ui-combat-tracker.js');
                        await CT.CombatTracker._rollInitiativeForPlayerCharacters(combat);
                    } else {
                        const nextCombatant = ownedPCsNeedingInitiative[0];
                        await CombatBarManager.rollInitiativeForCombatant(menuBar, nextCombatant, event);
                        postConsoleAndNotification(MODULE.NAME, `Combat Bar: Rolled initiative for ${nextCombatant.name}`, "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error rolling initiative", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combat-portrait-initiative-dice a[data-control="rollInitiative"]')) {
                event.preventDefault();
                event.stopPropagation();
                const button = event.target.closest('a');
                const combatantId = button?.dataset?.combatantId;
                if (!combatantId) return;
                try {
                    const combat = game.combat;
                    if (!combat) return;
                    const combatant = combat.combatants.get(combatantId);
                    if (!combatant) return;
                    await CombatBarManager.rollInitiativeForCombatant(menuBar, combatant, event);
                    CombatBarManager.updateCombatBar(menuBar);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Combat Bar: Error rolling initiative for combatant ${combatantId}`, error, true, false);
                }
            }
        };

        menuBar._combatBarDblClickHandler = async (event) => {
            if (!game.user.isGM) return;
            const portrait = event.target.closest('[data-combatant-id]');
            if (!portrait) return;
            const isInitiativeDice = event.target.closest('.combat-portrait-initiative-dice');
            const isDeadOverlay = event.target.closest('.combat-portrait-dead-overlay');
            const isInteractiveElement = event.target.closest('a, button, .combatant-control');
            if (isInitiativeDice || isDeadOverlay || isInteractiveElement) return;
            const combatantId = portrait.getAttribute('data-combatant-id');
            if (!combatantId) return;
            event.preventDefault();
            event.stopPropagation();
            await CombatBarManager.setCurrentCombatant(menuBar, combatantId);
        };

        document.addEventListener('click', menuBar._combatBarClickHandler);
        document.addEventListener('dblclick', menuBar._combatBarDblClickHandler);

        menuBar._combatBarHoverMoveHandler = (event) => {
            menuBar._combatHoverMoveEvent = {
                target: event.target,
                clientX: event.clientX,
                clientY: event.clientY
            };
            if (menuBar._combatHoverMoveRaf != null) return;
            menuBar._combatHoverMoveRaf = requestAnimationFrame(() => {
                menuBar._combatHoverMoveRaf = null;
                const latest = menuBar._combatHoverMoveEvent;
                menuBar._combatHoverMoveEvent = null;
                if (!latest) return;
                if (CombatBarManager._initiativeDrag?.active || !CombatBarManager.isCombatBarActive(menuBar)) {
                    CombatBarManager.hideCombatantHoverCard(menuBar);
                    return;
                }
                if (latest.target?.closest?.('#blacksmith-combat-hover-card')) return;
                const portrait = latest.target?.closest?.('.blacksmith-menubar-secondary .combat-portrait-container[data-combatant-id]');
                if (!portrait) {
                    CombatBarManager.hideCombatantHoverCard(menuBar);
                    return;
                }
                const combatantId = portrait.getAttribute('data-combatant-id');
                if (!combatantId) {
                    CombatBarManager.hideCombatantHoverCard(menuBar);
                    return;
                }
                menuBar._combatHoverCardPointer = { clientX: latest.clientX, clientY: latest.clientY };
                if (menuBar._combatHoverCardCombatantId !== combatantId || !menuBar._combatHoverCardEl) {
                    void CombatBarManager.showCombatantHoverCard(menuBar, combatantId, latest);
                } else {
                    CombatBarManager.positionCombatantHoverCard(menuBar, latest);
                }
            });
        };
        document.addEventListener('mousemove', menuBar._combatBarHoverMoveHandler);

        menuBar._combatBarContextMenuHandler = (event) => {
            const portrait = event.target?.closest?.('.blacksmith-menubar-secondary .combat-portrait-container[data-combatant-id]');
            if (!portrait || !CombatBarManager.isCombatBarActive(menuBar)) return;
            const combatantId = portrait.getAttribute('data-combatant-id');
            if (!combatantId) return;
            event.preventDefault();
            event.stopPropagation();
            CombatBarManager.hideCombatantHoverCard(menuBar);
            CombatBarManager.showCombatantPortraitContextMenu(menuBar, combatantId, event.clientX, event.clientY);
        };
        document.addEventListener('contextmenu', menuBar._combatBarContextMenuHandler);

        // Initiative drag-to-reorder (GM only) — pointer trio + Escape cancel.
        menuBar._combatBarPointerDownHandler = (event) => CombatBarManager.onInitiativeDragStart(menuBar, event);
        menuBar._combatBarPointerMoveHandler = (event) => CombatBarManager.onInitiativeDragMove(menuBar, event);
        menuBar._combatBarPointerUpHandler = (event) => { void CombatBarManager.onInitiativeDragEnd(menuBar, event); };
        menuBar._combatBarKeyDownHandler = (event) => {
            if (event.key === 'Escape' && CombatBarManager._initiativeDrag?.active) {
                CombatBarManager.cancelInitiativeDrag(menuBar);
            }
        };
        document.addEventListener('pointerdown', menuBar._combatBarPointerDownHandler);
        document.addEventListener('pointermove', menuBar._combatBarPointerMoveHandler);
        document.addEventListener('pointerup', menuBar._combatBarPointerUpHandler);
        document.addEventListener('keydown', menuBar._combatBarKeyDownHandler);

        postConsoleAndNotification(MODULE.NAME, "MenuBar: Combat bar event handlers registered", "", true, false);
    }

    static async showCombatantHoverCard(menuBar, combatantId, event) {
        if (menuBar._combatHoverCardPendingId === combatantId) return;
        const combat = game.combats?.active;
        const combatant = combat?.combatants?.get(combatantId);
        if (!combatant) {
            CombatBarManager.hideCombatantHoverCard(menuBar);
            return;
        }

        const requestId = (menuBar._combatHoverCardRequestId ?? 0) + 1;
        menuBar._combatHoverCardRequestId = requestId;
        menuBar._combatHoverCardPendingId = combatantId;
        menuBar._combatHoverCardPointer = { clientX: event.clientX, clientY: event.clientY };

        const hoverData = CombatBarManager.getCombatantHoverData(combatant);
        if (!hoverData) {
            CombatBarManager.hideCombatantHoverCard(menuBar);
            return;
        }
        try {
            hoverData.effects = await CombatBarManager.getCombatantHoverEffects(combatant, hoverData);
        } catch (error) {
            console.warn(`${MODULE.NAME} | Unable to build combatant effect display`, error);
            hoverData.effects = [];
        }
        if (menuBar._combatHoverCardRequestId !== requestId) return;

        if (!menuBar._combatHoverCardEl) {
            const card = document.createElement('div');
            card.id = 'blacksmith-combat-hover-card';
            card.className = 'blacksmith-combat-hover-card';
            document.body.appendChild(card);
            menuBar._combatHoverCardEl = card;
        }

        menuBar._combatHoverCardEl.innerHTML = CombatBarManager.buildCombatantHoverCardHtml(hoverData);
        menuBar._combatHoverCardEl.classList.add('is-visible');
        menuBar._combatHoverCardCombatantId = combatantId;
        menuBar._combatHoverCardPendingId = null;
        CombatBarManager.positionCombatantHoverCard(menuBar, menuBar._combatHoverCardPointer);
    }

    static positionCombatantHoverCard(menuBar, event) {
        if (!menuBar._combatHoverCardEl || !event) return;
        const card = menuBar._combatHoverCardEl;
        const offset = 16;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = card.getBoundingClientRect();

        let x = event.clientX + offset;
        let y = event.clientY + offset;

        if (x + rect.width + 8 > vw) x = event.clientX - rect.width - offset;
        if (y + rect.height + 8 > vh) y = vh - rect.height - 8;
        if (x < 8) x = 8;
        if (y < 8) y = 8;

        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
    }

    static hideCombatantHoverCard(menuBar) {
        if (menuBar._combatHoverCardEl) {
            menuBar._combatHoverCardEl.remove();
            menuBar._combatHoverCardEl = null;
        }
        menuBar._combatHoverCardRequestId = (menuBar._combatHoverCardRequestId ?? 0) + 1;
        menuBar._combatHoverCardPendingId = null;
        menuBar._combatHoverCardCombatantId = null;
    }

    static async getCombatantHoverEffects(combatant, hoverData) {
        if (hoverData?.limitedForPlayer) return [];
        if (!getSettingSafely(MODULE.ID, 'menubarCombatShowEffects', true)) return [];
        return EffectsAPI.getDisplayEffects(combatant?.actor, {
            includeDescriptions: 'auto',
            enrichDescriptions: true
        });
    }

    static async refreshVisibleCombatantHoverCard(menuBar, changedActor = null) {
        const combatantId = menuBar?._combatHoverCardCombatantId;
        const card = menuBar?._combatHoverCardEl;
        if (!combatantId || !card) return;
        const combatant = game.combats?.active?.combatants?.get(combatantId);
        if (!combatant) return;
        if (changedActor && combatant.actor?.uuid !== changedActor?.uuid && combatant.actor?.id !== changedActor?.id) return;

        const hoverData = CombatBarManager.getCombatantHoverData(combatant);
        if (!hoverData) return;
        try {
            hoverData.effects = await CombatBarManager.getCombatantHoverEffects(combatant, hoverData);
        } catch (error) {
            console.warn(`${MODULE.NAME} | Unable to refresh combatant effect display`, error);
            hoverData.effects = [];
        }
        if (menuBar._combatHoverCardCombatantId !== combatantId || !menuBar._combatHoverCardEl) return;
        menuBar._combatHoverCardEl.innerHTML = CombatBarManager.buildCombatantHoverCardHtml(hoverData);
        CombatBarManager.positionCombatantHoverCard(menuBar, menuBar._combatHoverCardPointer);
    }

    static _combatantPopoutCards = new Map();
    static _combatantPopoutSequence = 0;

    static async showCombatantPopoutCard(menuBar, combatantId, x = 120, y = 120) {
        const existing = Array.from(CombatBarManager._combatantPopoutCards.values())
            .find((windowInstance) => windowInstance.combatantId === combatantId && !windowInstance.followCombat);
        if (existing?.rendered) {
            existing.bringToFront();
            return existing;
        }

        const combatant = game.combats?.active?.combatants?.get(combatantId);
        if (!combatant) return null;
        const popoutId = `blacksmith-combatant-card-${++CombatBarManager._combatantPopoutSequence}`;
        const windowInstance = new CombatantCardToolWindow({
            popoutId,
            menuBar,
            combatantId,
            position: {
                left: Math.max(8, Number(x) || 120),
                top: Math.max(8, Number(y) || 120)
            }
        });
        CombatBarManager._combatantPopoutCards.set(popoutId, windowInstance);
        await windowInstance.render(true);
        return windowInstance;
    }

    static closeCombatantPopoutCard(popoutId) {
        if (!popoutId) return;
        const windowInstance = CombatBarManager._combatantPopoutCards.get(popoutId);
        if (windowInstance) void windowInstance.close({ animate: false });
    }

    static closeAllCombatantPopoutCards() {
        for (const windowInstance of CombatBarManager._combatantPopoutCards.values()) {
            void windowInstance.close({ animate: false });
        }
        CombatBarManager._combatantPopoutCards.clear();
    }

    static async refreshCombatantPopoutCard(_menuBar, popoutId) {
        const windowInstance = CombatBarManager._combatantPopoutCards.get(popoutId);
        if (!windowInstance?.rendered) return;
        await windowInstance.render(false);
    }

    static async refreshCombatantPopoutCardsForActor(menuBar, actor) {
        if (!actor) return;
        const refreshes = [];
        for (const [popoutId, windowInstance] of CombatBarManager._combatantPopoutCards) {
            const combatant = game.combats?.active?.combatants?.get(windowInstance.combatantId);
            if (combatant?.actor?.uuid === actor.uuid || combatant?.actor?.id === actor.id) {
                refreshes.push(CombatBarManager.refreshCombatantPopoutCard(menuBar, popoutId));
            }
        }
        await Promise.all(refreshes);
    }

    static async refreshCombatantPopoutCardsForCombatant(menuBar, combatantId) {
        if (!combatantId) return;
        await Promise.all(
            Array.from(CombatBarManager._combatantPopoutCards.entries())
                .filter(([, windowInstance]) => windowInstance.combatantId === combatantId)
                .map(([popoutId]) => CombatBarManager.refreshCombatantPopoutCard(menuBar, popoutId))
        );
    }

    static async refreshAllCombatantPopoutCards(menuBar) {
        await Promise.all(
            Array.from(CombatBarManager._combatantPopoutCards.keys())
                .map((popoutId) => CombatBarManager.refreshCombatantPopoutCard(menuBar, popoutId))
        );
    }

    static async syncFollowingCombatPopouts(menuBar) {
        const activeCombatantId = game.combats?.active?.combatant?.id ?? game.combat?.combatant?.id;
        if (!activeCombatantId) return;
        const refreshes = [];
        for (const [popoutId, windowInstance] of CombatBarManager._combatantPopoutCards) {
            if (!windowInstance.followCombat) continue;
            windowInstance.combatantId = activeCombatantId;
            refreshes.push(CombatBarManager.refreshCombatantPopoutCard(menuBar, popoutId));
        }
        await Promise.all(refreshes);
    }

    static handleDeletedCombatantPopouts(menuBar, combatantId) {
        if (!combatantId) return;
        for (const [popoutId, windowInstance] of Array.from(CombatBarManager._combatantPopoutCards.entries())) {
            if (windowInstance.combatantId !== combatantId) continue;
            if (windowInstance.followCombat) continue;
            CombatBarManager.closeCombatantPopoutCard(popoutId);
        }
        setTimeout(() => { void CombatBarManager.syncFollowingCombatPopouts(menuBar); }, 0);
    }

    static getCombatantHoverData(combatant) {
        const token = combatant?.token;
        const actor = combatant?.actor;
        if (!actor && !token) return null;

        let currentHP = 0;
        let maxHP = 0;
        if (actor?.system?.attributes?.hp) {
            currentHP = Number(actor.system.attributes.hp.value ?? 0);
            maxHP = Number(actor.system.attributes.hp.max ?? 0);
        } else if (actor?.system?.hitPoints) {
            currentHP = Number(actor.system.hitPoints.value ?? 0);
            maxHP = Number(actor.system.hitPoints.max ?? 0);
        }
        const hpPercent = maxHP > 0 ? Math.max(0, Math.min(100, (currentHP / maxHP) * 100)) : 0;
        const damagePercent = maxHP > 0 ? Math.max(0, Math.min(100, 100 - hpPercent)) : 0;
        const bloodStep = Math.round(damagePercent / 5) * 5;
        const bloodValue = currentHP <= 0 ? 101 : Math.max(0, Math.min(100, bloodStep));
        const bloodOverlay = `modules/coffee-pub-blacksmith/images/portraits/blood/blood-${bloodValue}.webp`;

        const ownerUsers = (game.users?.contents || [])
            .filter((u) => actor?.testUserPermission?.(u, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
        const nonGmOwners = ownerUsers
            .filter((u) => !u?.isGM)
            .map((u) => u.name)
            .slice(0, 2);
        const hasGmOwner = ownerUsers.some((u) => !!u?.isGM);
        const ownerLabel = nonGmOwners.length
            ? nonGmOwners.join(', ')
            : (hasGmOwner ? 'NPC' : (actor?.type ? String(actor.type).toUpperCase() : 'COMBATANT'));
        const isNpc = !!actor && !actor.hasPlayerOwner;
        const limitedForPlayer = !game.user?.isGM && isNpc;

        return {
            name: token?.name || actor?.name || combatant?.name || 'Unknown',
            portrait: actor?.img || token?.img || 'modules/coffee-pub-blacksmith/images/portraits/portrait-noimage.webp',
            subtitle: ownerLabel,
            initiative: combatant?.initiative,
            currentHP,
            maxHP,
            hpPercent,
            stats: CombatBarManager.getCombatantPrimaryStats(actor),
            bloodOverlay,
            limitedForPlayer
        };
    }

    static getCombatantPrimaryStats(actor) {
        const stats = [];
        const pushStat = (label, rawValue) => {
            if (label == null || rawValue == null) return;
            const n = Number(rawValue);
            if (!Number.isFinite(n)) return;
            stats.push({ label: String(label).slice(0, 3).toUpperCase(), value: Math.round(n) });
        };

        const abilities = actor?.system?.abilities;
        if (abilities && typeof abilities === 'object') {
            Object.entries(abilities).forEach(([key, data]) => {
                const v = data?.value ?? data?.total ?? data?.score ?? data?.mod;
                pushStat(key, v);
            });
        }

        if (stats.length === 0) {
            const systemStats = actor?.system?.stats;
            if (systemStats && typeof systemStats === 'object') {
                Object.entries(systemStats).forEach(([key, data]) => {
                    const v = data?.value ?? data?.total ?? data?.score ?? data?.mod ?? data;
                    pushStat(key, v);
                });
            }
        }

        return stats.slice(0, 6);
    }

    static buildCombatantHoverCardHtml(data) {
        const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        const statsHtml = (data.stats || []).length
            ? data.stats.map((s) => `
                <div class="combat-hover-stat">
                    <span class="combat-hover-stat-label">${esc(s.label)}</span>
                    <span class="combat-hover-stat-value">${esc(s.value)}</span>
                </div>`).join('')
            : `<div class="combat-hover-stat-empty">No ability scores</div>`;

        const hpLabel = data.maxHP > 0 ? `${data.currentHP}/${data.maxHP}` : 'HP N/A';
        const initiativeLabel = Number.isFinite(data.initiative) ? String(data.initiative) : '-';
        const bloodOverlayHtml = data.bloodOverlay
            ? `<img class="combat-hover-blood" src="${esc(data.bloodOverlay)}" alt="" aria-hidden="true">`
            : '';
        const effectsHtml = (data.effects || []).length
            ? `
                <section class="combat-hover-effects" aria-label="${esc(game.i18n.localize(`${MODULE.ID}.ActiveEffectsGroup`))}">
                    <div class="combat-hover-effects-heading">${esc(game.i18n.localize(`${MODULE.ID}.ActiveEffectsGroup`))}</div>
                    <div class="combat-hover-effects-list">
                        ${data.effects.map((effect) => `
                            <div class="combat-hover-effect">
                                <img class="combat-hover-effect-image"
                                    src="${esc(effect.img)}"
                                    alt=""
                                    data-tooltip="${esc(effect.tooltipHtml)}"
                                    data-tooltip-direction="LEFT">
                                <div class="combat-hover-effect-copy">
                                    <div class="combat-hover-effect-name">${esc(effect.name)}</div>
                                    <div class="combat-hover-effect-detail">${esc(effect.detail)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </section>`
            : '';

        if (data.limitedForPlayer) {
            return `
                <div class="combat-hover-header">
                    <span class="combat-hover-name">${esc(data.name)}</span>
                </div>
                <div class="combat-hover-image-wrap">
                    <img class="combat-hover-image" src="${esc(data.portrait)}" alt="${esc(data.name)}">
                    ${bloodOverlayHtml}
                </div>
                <div class="combat-hover-hp-wrap">
                    <div class="combat-hover-row">
                        <span class="combat-hover-initiative">Init ${esc(initiativeLabel)}</span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="combat-hover-header">
                <span class="combat-hover-name">${esc(data.name)}</span>
            </div>
            <div class="combat-hover-image-wrap">
                <img class="combat-hover-image" src="${esc(data.portrait)}" alt="${esc(data.name)}">
                ${bloodOverlayHtml}
            </div>
            <div class="combat-hover-hp-wrap">
                <div class="combat-hover-hp-bar"><span class="combat-hover-hp-fill" style="width:${data.hpPercent}%"></span></div>
                <div class="combat-hover-row">
                    <span class="combat-hover-subtitle">${esc(data.subtitle)}</span>
                    <span class="combat-hover-initiative">Init ${esc(initiativeLabel)}</span>
                </div>
                <div class="combat-hover-hp-text">${esc(hpLabel)}</div>
            </div>
            <div class="combat-hover-stats">${statsHtml}</div>
            ${effectsHtml}
        `;
    }

    static panToCombatant(_menuBar, combatantId, options = {}) {
        try {
            const { selectToken = false } = options;
            const combat = game.combat;
            if (!combat) return;
            const combatant = combat.combatants.get(combatantId);
            if (!combatant) return;
            const token = combatant.token;
            if (!token) return;
            const canvasToken = canvas.tokens.get(token.id);
            if (!canvasToken) return;

            if (!game.user.isGM) {
                try {
                    const isHidden = canvasToken.document?.hidden || false;
                    if (isHidden) return;
                    if (!canvasToken.visible) return;
                    const tokenDocument = canvasToken.document || token;
                    if (tokenDocument?.testUserVisibility) {
                        const isVisible = tokenDocument.testUserVisibility(game.user);
                        if (!isVisible) return;
                    }
                } catch (_error) {
                    return;
                }
            }

            canvas.animatePan({ x: canvasToken.x, y: canvasToken.y });
            if (selectToken && game.user.isGM) {
                try {
                    canvasToken.control({ releaseOthers: true });
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, 'Menubar: Failed to select token after pan', error?.message || error, true, false);
                }
            }

            if (canvasToken.visible && typeof canvasToken.setHighlight === 'function') {
                canvasToken.setHighlight();
                setTimeout(() => {
                    if (canvasToken.clearHighlight && typeof canvasToken.clearHighlight === 'function') {
                        canvasToken.clearHighlight();
                    }
                }, 2000);
            } else if (canvasToken.visible && canvasToken.emit) {
                canvasToken.emit('hoverIn');
                setTimeout(() => {
                    if (canvasToken.emit) {
                        canvasToken.emit('hoverOut');
                    }
                }, 2000);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error panning to combatant", error, false, false);
        }
    }

    /**
     * Canvas-wide token actions, moved here from the encounter bar. These act
     * on the canvas rather than on the encounter, so they are useful whether or
     * not a combat is running — Reveal Hidden especially, which is a mid-combat
     * action. Loaded on demand to keep this module off the encounter graph.
     */
    static showTokensMenu(_menuBar, anchorEl) {
        if (!game.user.isGM) return;

        const { x, y } = CombatBarManager._anchorPointFor(anchorEl);

        const run = async (label, fn) => {
            try {
                await fn();
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Combat Bar: Error running ${label}`, error?.message || error, false, false);
            }
        };

        const gm = [
            {
                name: 'Reveal Hidden',
                icon: 'fa-solid fa-eye',
                callback: () => run('Reveal Hidden', async () => {
                    const { EncounterManager } = await import('./manager-encounter.js');
                    await EncounterManager.revealHiddenTokens();
                })
            },
            { separator: true },
            {
                name: 'Remove Party from Canvas',
                icon: 'fa-solid fa-users-slash',
                callback: () => run('Remove Party from Canvas', async () => {
                    const { clearPartyFromCanvas } = await import('./utility-party.js');
                    await clearPartyFromCanvas();
                })
            },
            {
                name: 'Remove Monsters from Canvas',
                icon: 'fa-solid fa-dragon',
                callback: () => run('Remove Monsters from Canvas', async () => {
                    const { EncounterManager } = await import('./manager-encounter.js');
                    await EncounterManager.clearMonstersFromCanvas();
                })
            },
            {
                name: 'Remove NPCs from Canvas',
                icon: 'fa-solid fa-people-line',
                callback: () => run('Remove NPCs from Canvas', async () => {
                    const { EncounterManager } = await import('./manager-encounter.js');
                    await EncounterManager.clearNpcsFromCanvas();
                })
            }
        ];

        UIContextMenu.show({
            id: 'blacksmith-combat-tokens-menu',
            x,
            y,
            zones: { gm }
        });
    }

    /**
     * Whether a combatant counts as dead for the bar's purposes. PCs are dead
     * only when marked defeated (three failed death saves), NPCs when their HP
     * hits zero. Shared by the strip and the Graveyard so the two can never
     * disagree about who is dead — a disagreement would drop someone from both.
     */
    static isCombatantDead(combatant) {
        const actor = combatant?.actor;
        if (!actor) return false;
        if (actor.type === 'character') return combatant.isDefeated || false;
        return (actor.system?.attributes?.hp?.value || 0) <= 0;
    }

    /**
     * The dead who are currently hidden from the strip. Empty unless the
     * "hide dead" setting is on, since otherwise they are still on the bar.
     */
    static getGraveyardCombatants() {
        const combat = game.combat;
        if (!combat) return [];
        if (!getSettingSafely(MODULE.ID, 'menubarCombatHideDead', false)) return [];
        const isGM = game.user.isGM;
        const ordered = Array.isArray(combat.turns) && combat.turns.length
            ? combat.turns
            : Array.from(combat.combatants);
        return ordered.filter(c => {
            if (!isGM && (c.hidden || c.token?.hidden)) return false;
            return CombatBarManager.isCombatantDead(c);
        });
    }

    /**
     * The Graveyard list. Each row stands in for a portrait that is not on the
     * bar, so clicking one opens that combatant's own menu — the same menu a
     * right-click on its portrait would give, Pan to Token included.
     */
    static showGraveyardMenu(menuBar, anchorEl) {
        const dead = CombatBarManager.getGraveyardCombatants();
        if (!dead.length) return;

        const { x, y } = CombatBarManager._anchorPointFor(anchorEl);
        const core = dead.map(combatant => {
            const actor = combatant.actor;
            const portrait = actor?.img || combatant.token?.texture?.src
                || 'modules/coffee-pub-blacksmith/images/portraits/portrait-noimage.webp';
            return {
                name: combatant.token?.name || actor?.name || 'Unknown',
                icon: `<img class="context-menu-item-portrait" src="${portrait}" alt="">`,
                callback: async () => {
                    CombatBarManager.showCombatantPortraitContextMenu(menuBar, combatant.id, x, y);
                }
            };
        });

        UIContextMenu.show({
            id: 'blacksmith-combat-graveyard-menu',
            x,
            y,
            zones: { core }
        });
    }

    static getCombatantContext(combatantId) {
        const combat = game.combat;
        if (!combat) return null;
        const combatant = combat.combatants.get(combatantId);
        if (!combatant) return null;
        const tokenDoc = combatant.token || null;
        const canvasToken = tokenDoc ? canvas.tokens.get(tokenDoc.id) : null;
        const actor = combatant.actor || null;
        return { combat, combatant, tokenDoc, canvasToken, actor };
    }

    static canOpenCombatantSheet(actor) {
        if (!actor) return false;
        if (game.user?.isGM) return true;
        try {
            return actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
        } catch (_error) {
            return !!actor.isOwner;
        }
    }

    static async pingCombatant(_menuBar, combatantId) {
        try {
            const context = CombatBarManager.getCombatantContext(combatantId);
            if (!context?.canvasToken) return;
            const token = context.canvasToken;
            const center = token.center || { x: token.x + (token.w / 2), y: token.y + (token.h / 2) };
            if (typeof canvas?.ping === 'function') {
                try { await canvas.ping(center, { broadcast: true, style: 'alert' }); return; } catch (_e1) { /* noop */ }
                try { await canvas.ping(center, { broadcast: true }); return; } catch (_e2) { /* noop */ }
                try { await canvas.ping(center); return; } catch (_e3) { /* noop */ }
            }
            if (typeof game.user?.broadcastActivity === 'function') {
                game.user.broadcastActivity({ ping: center });
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Error pinging combatant token', error?.message || error, false, false);
        }
    }

    static async sendHurryUp(_menuBar, combatantId, scope = 'direct') {
        try {
            const context = CombatBarManager.getCombatantContext(combatantId);
            if (!context?.combatant) return;
            // Nudge routing (toast/chat/both, scope, sound) lives in the
            // shared helper — see notifyHurryUp in the Notifications settings.
            const { sendHurryUpNudge } = await import('./timer-notifications.js');
            await sendHurryUpNudge(context.combatant.name || 'Unknown', context.combatant.actor || null, scope);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Error sending Hurry Up message', error?.message || error, false, false);
        }
    }

    /**
     * Open Foundry's own combatant sheet (CombatantConfig) — name, image,
     * initiative, hidden/defeated. Same document the tracker's "Update
     * Combatant" opens, so edits made here are edits the tracker agrees with.
     */
    static async openCombatantConfig(_menuBar, combatantId) {
        try {
            const context = CombatBarManager.getCombatantContext(combatantId);
            if (!context?.combatant) return;
            const sheet = context.combatant.sheet;
            if (sheet) {
                sheet.render(true);
                return;
            }
            // Fallback if the document has no registered sheet for some reason.
            new foundry.applications.sheets.CombatantConfig({ document: context.combatant }).render(true);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Error opening combatant sheet', error?.message || error, false, false);
        }
    }

    static async clearCombatantInitiative(_menuBar, combatantId) {
        try {
            const context = CombatBarManager.getCombatantContext(combatantId);
            if (!context?.combatant) return;
            await context.combatant.update({ initiative: null });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Error clearing combatant initiative', error?.message || error, false, false);
        }
    }

    static async rerollCombatantInitiative(_menuBar, combatantId) {
        try {
            const context = CombatBarManager.getCombatantContext(combatantId);
            if (!context?.combat) return;
            // updateTurn: false — rerolling reorders the list, and moving the
            // active turn along with it is not what "reroll this one" means.
            await context.combat.rollInitiative([combatantId], { updateTurn: false });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Error rerolling combatant initiative', error?.message || error, false, false);
        }
    }

    /**
     * Mirror the core tracker's defeated toggle: the combatant flag AND the
     * actor's defeated status effect. Setting only the flag leaves the token
     * without its overlay, which is the half-state players actually see.
     */
    static async toggleCombatantDefeated(_menuBar, combatantId) {
        try {
            const context = CombatBarManager.getCombatantContext(combatantId);
            if (!context?.combatant) return;
            const { combatant, actor } = context;
            const isDefeated = !combatant.isDefeated;
            await combatant.update({ defeated: isDefeated });

            const statusId = CONFIG.specialStatusEffects?.DEFEATED;
            if (!statusId || !actor) return;
            const existing = actor.effects.find(e => e.statuses?.has(statusId));
            if (isDefeated && !existing) {
                await actor.toggleStatusEffect(statusId, { overlay: true, active: true });
            } else if (!isDefeated && existing) {
                await existing.delete();
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Error toggling defeated status', error?.message || error, false, false);
        }
    }

    /**
     * Anchor a dropdown under a bar button rather than at the pointer, so the
     * menu reads as belonging to the button that opened it.
     * @returns {{x: number, y: number}}
     */
    static _anchorPointFor(anchorEl) {
        const rect = anchorEl?.getBoundingClientRect?.();
        if (!rect) return { x: 0, y: 0 };
        return { x: rect.left, y: rect.bottom + 4 };
    }

    /**
     * Initiative actions, mirroring the combat tracker's header buttons plus
     * Reset from its overflow menu. Every entry is GM-only, so the whole menu
     * uses the tinted `gm` zone.
     */
    static showInitiativeMenu(_menuBar, anchorEl) {
        const combat = game.combat;
        if (!combat || !game.user.isGM) return;

        const { x, y } = CombatBarManager._anchorPointFor(anchorEl);
        const unrolled = combat.combatants.filter(c => c.initiative === null).length;

        const gm = [
            {
                name: 'Roll All',
                icon: 'fa-solid fa-dice',
                disabled: !unrolled,
                callback: async () => {
                    try {
                        await combat.rollAll();
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error rolling all initiatives', error?.message || error, false, false);
                    }
                }
            },
            {
                name: 'Roll Remaining',
                icon: 'fa-solid fa-users-medical',
                disabled: !unrolled,
                callback: async () => {
                    try {
                        const CT = await import('./ui-combat-tracker.js');
                        await CT.CombatTracker._rollRemainingInitiatives();
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error rolling remaining initiatives', error?.message || error, false, false);
                    }
                }
            },
            {
                // The mirror of core's rollNPC: everything it excludes. There
                // is no core rollPC, so the id list is built the same way.
                name: 'Roll Party',
                icon: 'fa-solid fa-users',
                disabled: !combat.combatants.some(c => !c.isNPC && c.initiative === null),
                callback: async () => {
                    try {
                        const ids = combat.combatants.reduce((ids, c) => {
                            if (c.isOwner && !c.isNPC && (c.initiative === null)) ids.push(c.id);
                            return ids;
                        }, []);
                        if (ids.length) await combat.rollInitiative(ids);
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error rolling party initiatives', error?.message || error, false, false);
                    }
                }
            },
            {
                name: 'Roll NPCs',
                icon: 'fa-solid fa-dragon',
                disabled: !combat.combatants.some(c => c.isNPC && c.initiative === null),
                callback: async () => {
                    try {
                        await combat.rollNPC();
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error rolling NPC initiatives', error?.message || error, false, false);
                    }
                }
            },
            { separator: true },
            {
                name: 'Reset Initiative',
                icon: 'fa-solid fa-arrow-rotate-left',
                disabled: !combat.turns?.length,
                callback: async () => {
                    try {
                        await combat.resetAll();
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error resetting initiative', error?.message || error, false, false);
                    }
                }
            }
        ];

        UIContextMenu.show({
            id: 'blacksmith-combat-initiative-menu',
            x,
            y,
            zones: { gm }
        });
    }

    /**
     * Encounter-level actions from the tracker's overflow menu. Delete goes
     * through combat.endCombat() rather than combat.delete() because that is
     * the path carrying core's confirmation prompt.
     */
    static showEncounterMenu(_menuBar, anchorEl) {
        if (!game.user.isGM) return;
        // No early return on a missing combat: Create Combat is precisely the
        // row you want when there is not one yet. Rows that need a combat drop
        // out instead, so the menu shrinks to what currently applies.
        const combat = game.combat;

        const { x, y } = CombatBarManager._anchorPointFor(anchorEl);
        const api = game.modules.get(MODULE.ID)?.api;

        const gm = [
            {
                name: CombatTracker.isCombatTrackerOpen() ? 'Hide Combat Tracker' : 'Show Combat Tracker',
                icon: 'fa-solid fa-list',
                callback: async () => {
                    await CombatBarManager.toggleCombatTracker();
                }
            }
        ];

        if (combat) {
            const isLinked = !!combat.scene;
            gm.push({ separator: true });
            gm.push({
                name: 'Clear Movement Histories',
                icon: 'fa-solid fa-shoe-prints',
                disabled: !combat.combatants.size,
                callback: async () => {
                    try {
                        await combat.clearMovementHistories();
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error clearing movement histories', error?.message || error, false, false);
                    }
                }
            });
            gm.push({
                // One toggle, two truths — an unlinked encounter needs the
                // inverse label or the row lies about what it will do.
                name: isLinked ? 'Unlink from Scene' : 'Link to Scene',
                icon: isLinked ? 'fa-solid fa-unlink' : 'fa-solid fa-link',
                callback: async () => {
                    try {
                        await combat.toggleSceneLink();
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error toggling scene link', error?.message || error, false, false);
                    }
                }
            });
        }

        gm.push({ separator: true });

        gm.push({
            // One handler for both labels: MenuBar.createCombat already creates
            // an encounter when there is none and otherwise folds the tokens
            // into the running one, skipping those already in the tracker. The
            // label changes because the outcome does, not the code path.
            name: combat ? 'Add to Combat' : 'Create Combat',
            icon: 'fa-solid fa-swords',
            callback: async () => {
                try {
                    await api?.createCombat?.();
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error creating combat', error?.message || error, false, false);
                }
            }
        });

        if (api?.hasQuickEncounterTool?.()) {
            gm.push({
                name: 'Quick Encounter',
                icon: 'fa-solid fa-dice',
                callback: async () => {
                    try {
                        await api.openQuickEncounterWindow?.();
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error opening Quick Encounter', error?.message || error, false, false);
                    }
                }
            });
        }

        if (combat) {
            gm.push({ separator: true });
            gm.push({
                name: 'Delete Encounter',
                icon: 'fa-solid fa-trash',
                callback: async () => {
                    try {
                        await combat.endCombat();
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error deleting encounter', error?.message || error, false, false);
                    }
                }
            });
        }

        UIContextMenu.show({
            id: 'blacksmith-combat-encounter-menu',
            x,
            y,
            zones: { gm }
        });
    }

    static showCombatantPortraitContextMenu(menuBar, combatantId, x, y) {
        const context = CombatBarManager.getCombatantContext(combatantId);
        if (!context?.combatant) return;

        const { combat, combatant, canvasToken, actor } = context;
        const canViewSheet = CombatBarManager.canOpenCombatantSheet(actor);
        const isGM = game.user.isGM;

        // Two zones (author layout 2026-07-31): everyday actions in `core`,
        // and everything that edits the encounter in `gm`, which the shared
        // menu tints red. Grouped actions are submenus rather than flat rows —
        // the flat list had grown past the point where it read at a glance.
        const core = [];
        const gm = [];

        // Locating someone else's monster is a GM action; a player pinging one
        // announces a token they may not be meant to know about.
        const canLocate = isGM || !!actor?.hasPlayerOwner;

        if (canLocate) {
            core.push({
                name: 'Pan to Token',
                icon: 'fa-solid fa-location-crosshairs',
                disabled: !canvasToken,
                callback: async () => {
                    CombatBarManager.panToCombatant(menuBar, combatantId, { selectToken: game.user.isGM });
                }
            });

            core.push({
                name: 'Ping Token',
                icon: 'fa-solid fa-signal-stream',
                disabled: !canvasToken,
                callback: async () => {
                    await CombatBarManager.pingCombatant(menuBar, combatantId);
                }
            });
        }

        core.push({
            name: 'Pop Out Combatant Card',
            icon: 'fa-solid fa-up-right-from-square',
            callback: async () => {
                await CombatBarManager.showCombatantPopoutCard(menuBar, combatantId, x + 12, y + 12);
            }
        });

        core.push({
            name: 'Hurry Up',
            icon: 'fa-solid fa-rabbit-running',
            submenu: [
                {
                    name: 'Send to Player',
                    icon: 'fa-solid fa-user-clock',
                    callback: async () => {
                        await CombatBarManager.sendHurryUp(menuBar, combatantId, 'direct');
                    }
                },
                {
                    name: 'Send to Party',
                    icon: 'fa-solid fa-bullhorn',
                    callback: async () => {
                        await CombatBarManager.sendHurryUp(menuBar, combatantId, 'blast');
                    }
                }
            ]
        });

        const portraitSrc = actor?.img || canvasToken?.document?.texture?.src || null;
        const characterItems = [
            {
                name: 'View Character Sheet',
                icon: 'fa-solid fa-user',
                disabled: !canViewSheet,
                callback: async () => {
                    if (!canViewSheet || !actor?.sheet) return;
                    actor.sheet.render(true);
                }
            },
            {
                name: 'View Portrait',
                icon: 'fa-solid fa-image-portrait',
                disabled: !portraitSrc,
                callback: async () => {
                    if (!portraitSrc) return;
                    new foundry.applications.apps.ImagePopout({
                        src: portraitSrc,
                        window: { title: combatant.name || 'Portrait' }
                    }).render(true);
                }
            }
        ];

        if (isGM) {
            characterItems.push({
                name: 'Update Participant',
                icon: 'fa-solid fa-pen-to-square',
                callback: async () => {
                    await CombatBarManager.openCombatantConfig(menuBar, combatantId);
                }
            });

            // Curator supplies its own image-replacement rows; we only decide
            // where they sit. However many it returns, they land here.
            const curatorApi = game.modules.get('coffee-pub-curator')?.api;
            if (curatorApi?.getCombatContextMenuItems) {
                const curatorContext = { combat, combatantId, canvasToken, x, y };
                const curatorItems = curatorApi.getCombatContextMenuItems(curatorContext);
                if (Array.isArray(curatorItems)) {
                    characterItems.push(...curatorItems);
                }
            }
        }

        core.push({
            name: 'Character',
            icon: 'fa-solid fa-address-card',
            submenu: characterItems
        });

        if (isGM) {
            gm.push({
                name: 'Initiative',
                icon: 'fa-solid fa-dice-d20',
                submenu: [
                    {
                        name: 'Clear Initiative',
                        icon: 'fa-solid fa-eraser',
                        disabled: combatant.initiative === null,
                        callback: async () => {
                            await CombatBarManager.clearCombatantInitiative(menuBar, combatantId);
                        }
                    },
                    {
                        name: 'Reroll Initiative',
                        icon: 'fa-solid fa-rotate',
                        callback: async () => {
                            await CombatBarManager.rerollCombatantInitiative(menuBar, combatantId);
                        }
                    }
                ]
            });

            // Two distinct hides, which is why they share a submenu rather than
            // one row: the token on canvas (the one that actually conceals them
            // from players) vs the combatant's tracker entry.
            gm.push({
                name: 'Visibility',
                icon: 'fa-solid fa-eye',
                submenu: [
                    {
                        name: 'Toggle Canvas Visibility',
                        icon: 'fa-solid fa-ghost',
                        disabled: !canvasToken,
                        callback: async () => {
                            const tokenDoc = canvasToken?.document;
                            if (tokenDoc) await tokenDoc.update({ hidden: !tokenDoc.hidden });
                        }
                    },
                    {
                        name: 'Toggle Combat Visibility',
                        icon: combatant.hidden ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash',
                        callback: async () => {
                            await combatant.update({ hidden: !combatant.hidden });
                        }
                    }
                ]
            });

            gm.push({
                name: 'Set As Current Combatant',
                icon: 'fa-solid fa-crosshairs',
                callback: async () => {
                    await CombatBarManager.setCurrentCombatant(menuBar, combatantId);
                }
            });

            gm.push({
                name: 'Toggle Defeated',
                icon: 'fa-solid fa-skull',
                callback: async () => {
                    await CombatBarManager.toggleCombatantDefeated(menuBar, combatantId);
                }
            });

            // v13 combatant groups: the bar deliberately never renders a group
            // row (portraits are always individual combatants); this is the
            // escape hatch for members the tracker has folded into one.
            if (combatant.group) {
                gm.push({
                    name: 'Remove from Group',
                    icon: 'fa-solid fa-object-ungroup',
                    callback: async () => {
                        await combatant.update({ group: null });
                    }
                });
            }

            gm.push({
                name: 'Remove from Combat',
                icon: 'fa-solid fa-trash',
                callback: async () => {
                    await combat.deleteEmbeddedDocuments('Combatant', [combatantId]);
                }
            });
        }

        UIContextMenu.show({
            id: 'blacksmith-combat-portrait-context-menu',
            x,
            y,
            zones: { core, gm }
        });
    }

    static async setCurrentCombatant(_menuBar, combatantId) {
        try {
            const combat = game.combat;
            if (!combat || !game.combats.has(combat.id)) return;
            const combatant = combat.combatants.get(combatantId);
            if (!combatant) return;
            const turnIndex = combat.turns.findIndex(turn => turn.id === combatantId);
            if (turnIndex === -1) return;
            await combat.update({ turn: turnIndex });
            postConsoleAndNotification(MODULE.NAME, `Set current combatant to ${combatant.name}`, "", true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error setting current combatant", error, false, false);
        }
    }

    // ===== INITIATIVE DRAG (GM) =====
    // Drag a portrait left/right to rewrite its initiative between its new
    // neighbors, mirroring the native tracker's reordering. Pointer-based:
    // a press only becomes a drag past DRAG_THRESHOLD (same disambiguation
    // the pins renderer uses), so portrait clicks/double-clicks stay intact.
    // While a drag is live, updateCombatBar() defers re-renders (a mid-drag
    // rebuild would yank the element out from under the pointer) and the
    // hover card stays hidden; the initiative write's own re-render is the
    // natural drag end.

    static _initiativeDrag = null;          // { combatantId, element, startX, startY, active, refreshPending }
    static _suppressNextCombatClick = false; // eat the click that follows a drag's pointerup
    static DRAG_THRESHOLD = 8;               // px before a press commits to dragging

    static onInitiativeDragStart(menuBar, event) {
        if (!game.user.isGM || event.button !== 0) return;
        if (this._initiativeDrag) return;
        if (!CombatBarManager.isCombatBarActive(menuBar)) return;
        const portrait = event.target?.closest?.('.blacksmith-menubar-secondary .combat-portrait-container[data-combatant-id]');
        if (!portrait) return;
        if (event.target.closest('a, button, .combatant-control, .combat-portrait-initiative-dice')) return;
        this._initiativeDrag = {
            combatantId: portrait.getAttribute('data-combatant-id'),
            element: portrait,
            startX: event.clientX,
            startY: event.clientY,
            active: false,
            refreshPending: false
        };
    }

    static onInitiativeDragMove(menuBar, event) {
        const drag = this._initiativeDrag;
        if (!drag) return;
        if (!drag.active) {
            const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
            if (distance < this.DRAG_THRESHOLD) return;
            drag.active = true;
            drag.element.classList.add('initiative-dragging');
            const container = drag.element.closest('.combat-portraits');
            container?.classList.add('initiative-drag-active');
            CombatBarManager.hideCombatantHoverCard(menuBar);
            // Tracker-style affordances: a ghost of the portrait rides the
            // pointer, and dropzones injected between the portraits spread
            // the row apart (safe mid-render — updateCombatBar defers while
            // a drag is live) with the nearest one lighting up.
            this._createInitiativeDragGhost(drag);
            this._buildInitiativeDropzones(drag);
        }
        event.preventDefault();
        this._positionInitiativeDragGhost(drag, event);
        this._setActiveInitiativeDropzone(event.clientX);
    }

    static async onInitiativeDragEnd(menuBar, event) {
        const drag = this._initiativeDrag;
        if (!drag) return;
        if (!drag.active) {
            // Never crossed the threshold — it's a click; let it proceed.
            this._initiativeDrag = null;
            return;
        }

        // Eat the click that follows this pointerup — it would pan the canvas.
        this._suppressNextCombatClick = true;
        setTimeout(() => { this._suppressNextCombatClick = false; }, 250);

        const portraits = this._portraitList();
        const others = portraits.filter(el => el !== drag.element);
        const next = portraits[portraits.indexOf(drag.element) + 1] ?? null;
        // rightEl = the portrait the chosen dropzone precedes (null = past the end).
        const rightEl = drag.activeZone ? drag.activeZone.rightEl : undefined;
        const refreshPending = drag.refreshPending;
        this._teardownInitiativeDrag();

        try {
            const combat = game.combat;
            const combatant = combat?.combatants?.get(drag.combatantId);
            if (combat && combatant && others.length && rightEl !== undefined) {
                const leftEl = rightEl ? (others[others.indexOf(rightEl) - 1] ?? null) : others[others.length - 1];
                // The zones flanking the dragged portrait are its own slot — no write.
                const sameSlot = rightEl === drag.element || rightEl === next;
                if (!sameSlot) {
                    const getInit = (el) => {
                        const c = combat.combatants.get(el?.getAttribute?.('data-combatant-id'));
                        return typeof c?.initiative === 'number' ? c.initiative : 0;
                    };
                    let newInitiative;
                    if (leftEl && rightEl) newInitiative = (getInit(leftEl) + getInit(rightEl)) / 2;
                    else if (rightEl) newInitiative = getInit(rightEl) + 1;  // far left: above the current top
                    else newInitiative = getInit(leftEl) - 1;                 // far right: below the current bottom
                    newInitiative = Math.round(newInitiative * 100) / 100;
                    await combat.setInitiative(drag.combatantId, newInitiative);
                    postConsoleAndNotification(MODULE.NAME, `Combat Bar: ${combatant.name} initiative set to ${newInitiative} via drag`, "", true, false);
                    // Announce the reorder to every client — the order change
                    // is table-visible, so the toast is too.
                    const position = combat.turns.findIndex(turn => turn.id === drag.combatantId) + 1;
                    if (position > 0) {
                        await broadcastToast({
                            title: `${combatant.name} moved to position ${position} of ${combat.turns.length}`,
                            subtitle: `Initiative ${newInitiative}`,
                            icon: 'fa-solid fa-list-ol',
                            image: combatant.actor ? (getPortraitImage(combatant.actor) || null) : null,
                            duration: 3,
                            stackKey: 'blacksmith-initiative-drag',
                            moduleId: 'blacksmith-core'
                        });
                    }
                    return; // setInitiative's own update re-renders the bar
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error applying initiative drag', error, false, false);
        }
        // No write happened — apply any re-render deferred during the drag.
        if (refreshPending) CombatBarManager.updateCombatBar(menuBar);
    }

    static cancelInitiativeDrag(menuBar) {
        const drag = this._initiativeDrag;
        if (!drag) return;
        const wasActive = drag.active;
        const refreshPending = drag.refreshPending;
        this._teardownInitiativeDrag();
        if (wasActive) {
            this._suppressNextCombatClick = true;
            setTimeout(() => { this._suppressNextCombatClick = false; }, 250);
            if (refreshPending) CombatBarManager.updateCombatBar(menuBar);
        }
    }

    static _teardownInitiativeDrag() {
        const drag = this._initiativeDrag;
        if (!drag) return;
        drag.element?.classList?.remove('initiative-dragging');
        document.querySelector('.blacksmith-menubar-secondary .combat-portraits')?.classList.remove('initiative-drag-active');
        drag.ghost?.remove();
        for (const zone of drag.zones ?? []) zone.el.remove();
        this._initiativeDrag = null;
    }

    static _portraitList() {
        return [...document.querySelectorAll('.blacksmith-menubar-secondary .combat-portrait-container[data-combatant-id]')];
    }

    /**
     * The floating portrait that rides the pointer — what you are dragging.
     * Sized to the real portrait, showing its image.
     */
    static _createInitiativeDragGhost(drag) {
        const rect = drag.element.getBoundingClientRect();
        const img = drag.element.querySelector('.combat-portrait-image img');
        const ghost = document.createElement('div');
        ghost.className = 'combat-initiative-drag-ghost';
        const size = Math.round(Math.min(rect.width, rect.height)) || 44;
        ghost.style.width = `${size}px`;
        ghost.style.height = `${size}px`;
        if (img?.src) ghost.style.backgroundImage = `url("${img.src}")`;
        document.body.appendChild(ghost);
        drag.ghost = ghost;
    }

    static _positionInitiativeDragGhost(drag, event) {
        if (!drag.ghost) return;
        drag.ghost.style.left = `${event.clientX}px`;
        drag.ghost.style.top = `${event.clientY}px`;
    }

    /**
     * One dropzone before every portrait plus one after the last, injected as
     * flex children so the row visibly spreads apart (tracker-style). Each
     * zone records the portrait it precedes (null = past the end); the zones
     * flanking the dragged portrait exist too — dropping there is a no-op,
     * which makes "release where you picked it up" do nothing.
     */
    static _buildInitiativeDropzones(drag) {
        drag.zones = [];
        const portraits = this._portraitList();
        const makeZone = (rightEl) => {
            const el = document.createElement('div');
            el.className = 'combat-initiative-dropzone';
            drag.zones.push({ el, rightEl });
            return el;
        };
        for (const portrait of portraits) portrait.before(makeZone(portrait));
        portraits[portraits.length - 1]?.after(makeZone(null));
    }

    /** Light up the dropzone nearest the pointer; that zone is the drop target. */
    static _setActiveInitiativeDropzone(pointerX) {
        const drag = this._initiativeDrag;
        if (!drag?.zones?.length) return;
        let best = null;
        let bestDistance = Infinity;
        for (const zone of drag.zones) {
            const rect = zone.el.getBoundingClientRect();
            const distance = Math.abs(pointerX - (rect.left + rect.width / 2));
            if (distance < bestDistance) {
                bestDistance = distance;
                best = zone;
            }
        }
        if (drag.activeZone && drag.activeZone !== best) drag.activeZone.el.classList.remove('active');
        best?.el.classList.add('active');
        drag.activeZone = best;
    }
}
