import { MODULE } from './const.js';
import { getSettingSafely, postConsoleAndNotification, formatTime, playSound, getPortraitImage, isPlayerCharacter , fetchTemplateText} from './api-core.js';
import { RoundTimer } from './timer-round.js';
import { CombatTracker } from './ui-combat-tracker.js';
import { UIContextMenu } from './ui-context-menu.js';
import { HookManager } from './manager-hooks.js';
import { broadcastToast, ToastAPI } from './api-toast.js';
import { EncounterManager } from './manager-encounter.js';
import { DefeatedManager } from './manager-defeated.js';
import { getActorHP } from './utility-health.js';
// Static imports are safe here: neither timer module imports this one, so
// there is no cycle, and `visible` predicates run per render — too often to
// pay for a dynamic import each time.
import { PlanningTimer } from './timer-planning.js';
import { CombatTimer } from './timer-combat.js';
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
        return CombatBarManager.getActiveCombat()?.combatants?.get(this.combatantId)?.name
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
        const combatant = CombatBarManager.getActiveCombat()?.combatants?.get(combatantId);
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

// ==================================================================
// ===== CONTEXT MENU HELPERS =======================================
// ==================================================================
//
// Module-level on purpose. These serve the three context menus and nothing
// else, so they are deliberately NOT on CombatBarManager and NOT in
// getBarActions() -- that object is shared with the out-of-combat button row,
// and reaching into it to serve a menu is how the button row got changed once
// already. Nothing outside the menu builders below may call these.
// ==================================================================

/**
 * Canvas tokens with an actor, optionally narrowed to a side.
 *
 * PLACEABLES, not TokenDocuments: the health window reads `token.document.name`
 * and `canStillFight` reads `.actor`/`.id`, so the placeable is the one currency
 * every consumer here accepts.
 *
 * `npc` means everything that is not the party -- monsters and shopkeepers
 * alike. Deliberately NOT the monster/humanoid split the removals use, where
 * "clear the monsters but leave the merchant" is the actual intent.
 *
 * @param {'party'|'npc'|'all'} [side]
 * @returns {Token[]}
 */
function menuCanvasTokens(side = 'all') {
    const tokens = (canvas?.tokens?.placeables ?? []).filter((t) => !!t.actor);
    if (side === 'party') return tokens.filter((t) => isPlayerCharacter(t.actor));
    if (side === 'npc') return tokens.filter((t) => !isPlayerCharacter(t.actor));
    return tokens;
}

/** Toast on the same stack the other canvas token actions use. */
function menuToast(title, subtitle, icon = 'fa-solid fa-swords') {
    ToastAPI.show({
        title,
        subtitle,
        icon,
        duration: 4,
        moduleId: 'blacksmith-core',
        stackKey: 'blacksmith-encounter-tokens'
    });
}

/**
 * Add the canvas tokens of one side that are not already in the encounter.
 *
 * Creates the combat when there is none, which is why the Encounter menu no
 * longer needs a separate Create row: "add all remaining" with nothing to add
 * them to means "start the encounter with them".
 *
 * Ignores the current selection. "Remaining" is a statement about the canvas;
 * selection-first belongs to the Create Combat button, where choosing the
 * tokens first is the point.
 *
 * @param {'party'|'npc'|'all'} side
 * @param {string} label for the toast
 */
async function menuAddRemaining(side, label) {
    if (!game.user?.isGM) return;
    const scene = canvas?.scene;
    if (!scene) {
        menuToast(label, 'No active scene.', 'fa-solid fa-triangle-exclamation');
        return;
    }

    try {
        const combat = CombatBarManager.getActiveCombat();
        const present = new Set((combat?.combatants ?? []).map((c) => c.tokenId));
        // Yesterday's corpses are still on the canvas, so the same rules
        // asymmetry the encounter builder uses applies: a monster at zero is
        // out, a character at zero is dying and still belongs in the fight.
        const candidates = menuCanvasTokens(side)
            .filter((t) => !present.has(t.id))
            .filter((t) => EncounterManager.canStillFight(t));

        if (!candidates.length) {
            menuToast(label, 'Nothing left to add.', 'fa-solid fa-circle-info');
            return;
        }

        const target = combat ?? await Combat.create({
            scene: scene.id,
            name: 'Combat Encounter',
            active: true
        });
        await target.createEmbeddedDocuments('Combatant', candidates.map((t) => ({
            tokenId: t.id,
            actorId: t.actor.id,
            sceneId: scene.id
        })));
        menuToast(label, `${candidates.length} added.`);
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `Combat Bar: Error in ${label}`, error?.message || error, false, false);
        menuToast(label, 'Could not add them. See the console.', 'fa-solid fa-triangle-exclamation');
    }
}

/** Open the health window over a token set, without disturbing the selection. */
async function menuViewHealth(side, label) {
    try {
        const tokens = menuCanvasTokens(side);
        if (!tokens.length) {
            menuToast(label, 'No tokens to show.', 'fa-solid fa-circle-info');
            return;
        }
        const { openHealthWindow } = await import('./window-health.js');
        await openHealthWindow({ tokens });
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `Combat Bar: Error in ${label}`, error?.message || error, false, false);
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
     * THE PORTRAIT STRIP'S SCROLL POSITION BELONGS TO THIS MANAGER, NOT TO THE DOM.
     *
     * `renderMenubar` in api-menubar.js removes the whole menubar element and re-inserts it
     * whenever the structure fingerprint changes, and for a bar with its own template that
     * fingerprint is `JSON.stringify(secondaryBar.data)` (api-menubar.js `_secondaryBarStateSignature`)
     * -- which for this bar contains every combatant's health. A single point of damage therefore
     * hands back a BRAND NEW strip sitting at scrollLeft 0, and during a fight that happens
     * constantly: damage, effects, hidden state, disposition, timers.
     *
     * So the position is kept here and written back onto whatever element is current. Three values,
     * because a rebuild can land in the middle of an animation and all three have to survive it:
     * where we are, where we are going, and whose turn we went there for.
     * @type {number}
     */
    static _portraitScrollLeft = 0;

    /** Destination of the animation in flight, or null when the strip is at rest. @type {number|null} */
    static _portraitScrollTarget = null;

    /** rAF handle for the animation in flight. @type {number|null} */
    static _portraitScrollRaf = null;

    /**
     * Whether the reader has scrolled the strip themselves since the turn last changed.
     *
     * The strip corrects itself when the active combatant is off screen -- a first render measured
     * before layout settled leaves it that way, and an uncorrected strip is one where nobody can
     * tell whose turn it is. That correction must not fight somebody who deliberately scrolled off
     * to look at what is coming, so their scroll switches it off until the next turn.
     * @type {boolean}
     */
    static _userScrolledThisTurn = false;

    /**
     * Stands in for a combatant id in `_centredCombatantId` while the strip is parked at its right
     * end waiting for initiative. A sentinel rather than a second boolean, so that leaving the
     * state is the same comparison as any other change of anchor and cannot be forgotten.
     * @type {string}
     */
    static INITIATIVE_ANCHOR = '__awaiting-initiative__';

    /**
     * Whose turn the strip was last scrolled FOR.
     *
     * Only a genuine change of turn may move the strip on its own. Without this it re-centres on
     * every render, so a damage roll drags the view back from wherever the reader had scrolled it.
     * @type {string|null}
     */
    static _centredCombatantId = null;

    /** The strip as it exists RIGHT NOW. Never cached -- see `easePortraitScrollTo`. */
    static _portraitStrip() {
        return document.querySelector('.combat-portraits-scroll-wrapper .combat-portraits');
    }

    /**
     * Put the remembered scroll position back on a freshly rendered strip.
     *
     * Written directly rather than eased: this is not a movement, it is the absence of one. Called
     * from the post-render `requestAnimationFrame`, which runs before the frame is painted, so the
     * strip never appears at 0. Mid-animation this restores the animation's latest frame, which is
     * what lets the glide carry on across the rebuild without a seam.
     */
    static restorePortraitScroll() {
        const strip = CombatBarManager._portraitStrip();
        if (!strip) return;
        const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
        strip.scrollLeft = Math.min(max, Math.max(0, CombatBarManager._portraitScrollLeft));
    }

    /** Forget the strip's position. For when the fight it was measured against is over. */
    static resetPortraitScroll() {
        if (CombatBarManager._portraitScrollRaf != null) {
            cancelAnimationFrame(CombatBarManager._portraitScrollRaf);
            CombatBarManager._portraitScrollRaf = null;
        }
        CombatBarManager._portraitScrollTarget = null;
        CombatBarManager._portraitScrollLeft = 0;
        CombatBarManager._centredCombatantId = null;
        CombatBarManager._userScrolledThisTurn = false;
    }

    /**
     * Put the strip at an absolute scroll position NOW, cancelling anything in flight.
     *
     * For positions that were never a movement: the first paint after the bar opens, and the
     * silent correction when the active combatant turns out not to be on screen. Animating either
     * would be announcing a change that did not happen.
     *
     * @param {object} menuBar
     * @param {number} target Absolute scrollLeft; clamped to the scrollable range.
     */
    static jumpPortraitScrollTo(menuBar, target) {
        const strip = CombatBarManager._portraitStrip();
        if (!strip || !Number.isFinite(target)) return;
        if (CombatBarManager._portraitScrollRaf != null) {
            cancelAnimationFrame(CombatBarManager._portraitScrollRaf);
            CombatBarManager._portraitScrollRaf = null;
        }
        CombatBarManager._portraitScrollTarget = null;
        const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
        const dest = Math.min(max, Math.max(0, target));
        strip.scrollLeft = dest;
        CombatBarManager._portraitScrollLeft = dest;
        CombatBarManager.updateCombatPortraitScrollArrows(menuBar);
    }

    /**
     * Ease the portrait strip to an ABSOLUTE scroll position.
     *
     * TWO THINGS HERE ARE LOAD-BEARING, and the previous version of this helper got both wrong.
     *
     * It takes a DESTINATION, not a delta. A delta is only meaningful against the position it was
     * measured from, and by the time a later frame runs the strip may have been rebuilt underneath
     * it; an absolute position stays true because the content either side of it is the same.
     *
     * It RE-RESOLVES the element every frame instead of capturing it. The old helper held the node
     * it was given and wrote `scrollLeft` to it for the whole animation -- so the moment a render
     * replaced the strip, it went on animating an orphan that had been removed from the document
     * while the visible strip sat wherever it had been restored to. Since renders fire throughout a
     * turn, a single glide was routinely cut into pieces and restarted, which is what made turn
     * advancement stutter and appear to re-scroll from where it had already been.
     *
     * @param {object} menuBar
     * @param {number} target Absolute scrollLeft to settle on; clamped to the scrollable range.
     * @param {number} [durationMs]
     */
    static easePortraitScrollTo(menuBar, target, durationMs = 220) {
        const strip = CombatBarManager._portraitStrip();
        if (!strip || !Number.isFinite(target)) return;

        const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
        const dest = Math.min(max, Math.max(0, target));

        // ALREADY ON ITS WAY THERE: let it finish. A rebuild reaches this line every time the bar
        // redraws mid-animation, and restarting the ease on each one is the stutter itself.
        if (CombatBarManager._portraitScrollRaf != null
            && CombatBarManager._portraitScrollTarget != null
            && Math.abs(CombatBarManager._portraitScrollTarget - dest) < 1) return;

        if (CombatBarManager._portraitScrollRaf != null) {
            cancelAnimationFrame(CombatBarManager._portraitScrollRaf);
            CombatBarManager._portraitScrollRaf = null;
        }

        const start = strip.scrollLeft || 0;
        if (Math.abs(dest - start) < 0.5) {
            CombatBarManager._portraitScrollLeft = dest;
            CombatBarManager._portraitScrollTarget = null;
            return;
        }

        CombatBarManager._portraitScrollTarget = dest;
        const t0 = performance.now();
        const easeInOutCubic = (t) => (t < 0.5)
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;

        const tick = (now) => {
            const el = CombatBarManager._portraitStrip();
            if (!el) {
                CombatBarManager._portraitScrollRaf = null;
                CombatBarManager._portraitScrollTarget = null;
                return;
            }
            const progress = Math.min(1, (now - t0) / durationMs);
            const value = start + ((dest - start) * easeInOutCubic(progress));
            el.scrollLeft = value;
            // Recorded per frame, so a rebuild between any two frames restores to exactly here.
            CombatBarManager._portraitScrollLeft = value;
            CombatBarManager.updateCombatPortraitScrollArrows(menuBar);
            if (progress < 1) {
                CombatBarManager._portraitScrollRaf = requestAnimationFrame(tick);
            } else {
                CombatBarManager._portraitScrollLeft = dest;
                CombatBarManager._portraitScrollTarget = null;
                CombatBarManager._portraitScrollRaf = null;
            }
        };

        CombatBarManager._portraitScrollRaf = requestAnimationFrame(tick);
    }

    static initialize(menuBar) {
        if (menuBar.__combatBarManagerInitialized) return;
        menuBar.__combatBarManagerInitialized = true;
        menuBar.__combatBarUserClosed = false;

        this._installMenuBarPatches(menuBar);
        menuBar.secondaryBarToolMapping.set('combat', 'combat-bar');
        this.registerCombatHooks(menuBar);
        this.registerCombatBarEvents(menuBar);
        this.registerTimerReadoutHooks(menuBar);
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
                const combat = CombatBarManager.getActiveCombat();
                data.data = CombatBarManager.getCombatData(combat);
            }
            return data;
        };

        const originalRenderMenubar = menuBar.renderMenubar.bind(menuBar);
        menuBar.renderMenubar = async function (...args) {
            const result = await originalRenderMenubar(...args);
            if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                requestAnimationFrame(() => {
                    // ORDER MATTERS, and getting it wrong truncates the scroll position.
                    //
                    // updateCombatPortraitScrollArrows is what applies `combat-portraits-overflowing`,
                    // and that class changes the strip from `flex: 0 1 auto` to `flex: 1` and reveals
                    // the two arrows -- so it changes clientWidth, and with it the maximum scroll.
                    // Restoring before it ran clamped the remembered position against a maximum that
                    // was about to grow, and since the scroll listener writes the clamped result
                    // straight back, the loss was permanent rather than momentary.
                    //
                    // The restore still happens inside this rAF, which runs before the frame is
                    // painted, so a rebuild never shows the strip sitting at 0.
                    CombatBarManager.updateCombatPortraitScrollArrows(menuBar);
                    CombatBarManager.restorePortraitScroll();
                    CombatBarManager.attachCombatPortraitScrollListener(menuBar);
                    CombatBarManager.ensureCurrentCombatantVisible(menuBar);
                    // The timer bars are written per tick, so a fresh render
                    // starts empty until the next one — fill them immediately.
                    CombatBarManager.syncAllTimerReadouts();
                    CombatBarManager.syncDataRowState();
                    CombatBarManager.applyReadoutOverflow();
                    CombatBarManager.observeDataRowWidth();
                    setTimeout(() => CombatBarManager.updateCombatPortraitScrollArrows(menuBar), 100);
                });
            }
            return result;
        };
    }
    static async registerCombatPartial() {
        const combatBarTemplate = await fetchTemplateText('modules/coffee-pub-blacksmith/templates/partials/menubar-combat.hbs');
        Handlebars.registerPartial('menubar-combat', combatBarTemplate);
    }

    static async registerCombatBarType(menuBar) {
        const api = game.modules.get(MODULE.ID)?.api;
        if (!api?.registerSecondaryBarType) return;
        // No size: this is the one bar that sizes itself rather than taking a
        // preset. Its height is two rows summed per combat state, written by
        // applyBarHeight before every render and passed as the open-time
        // override, so anything registered here would be replaced unread.
        await api.registerSecondaryBarType('combat', {
            persistence: 'manual',
            autoCloseDelay: 10000,
            templatePath: 'modules/coffee-pub-blacksmith/templates/partials/menubar-combat.hbs',
            // Bespoke markup for the portrait strip, registered items for the
            // readouts. The strip is the only thing here the item vocabulary
            // cannot express; challenge rating, health, balance, and timers
            // are all info/progressbar/balancebar and belong as items.
            hybridItems: true,
            // No group banners: those caption a cluster of otherwise unlabelled
            // buttons, which is what the Broadcast and Cartographer bars need.
            // These items carry their own labels, so a banner would only repeat
            // them. Groups still earn their keep as divider boundaries.
            groupBannerEnabled: false,
            groups: {
                'encounter': { mode: 'default', order: 0 },
                'timer': { mode: 'default', order: 3 },
                'health': { mode: 'default', order: 5 },
                'stats': { mode: 'default', order: 7 },
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
        //
        // ONE BADGE, NOT TWO LABELLED PILLS. Between them the words "Round" and
        // "Turn" cost more of the row than the numbers they named -- on a bar
        // where the timer bar's width is pinned to the millimetre -- and two
        // separate boxes then spent the saving again on a second set of edges
        // and the gap between them. The scoreboard is the one readout nobody has
        // to be told the meaning of: its position never changes and the numbers
        // only ever count up. So it is a single box, round then turn, split by a
        // drawn seam rather than a word.
        //
        // The tooltip is the only place the meaning is stated, so it is rewritten
        // with the numbers on every turn -- it never reads "Round and turn" over
        // a badge saying 4.
        api.registerSecondaryBarItem('combat', 'round-turn', {
            emphasis: 'feature',
            kind: 'statchip',
            shape: 'split',
            tone: 'neutral',
            zone: 'left',
            group: 'encounter',
            order: 0,
            // TWO FIELDS, EQUAL WEIGHT. The round goes in the label slot -- which the
            // `split` shape typesets as a value, not a name -- so the darker field does
            // the separating and neither number is subordinate to the other.
            label: '0',
            valueParts: ['0', { text: ' of ', muted: true }, '0'],
            tooltip: 'Round and turn',
            visible: inCombat
        });

        // One timer slot, two items. The planning timer hands off to the turn
        // timer when it expires, so they are never both live — the `visible`
        // predicates express that and nothing has to switch identities.
        // Registered with non-empty labels on purpose: the partial renders the
        // label spans behind {{#if}}, and per-tick DOM writes need them to exist.
        const timerItem = (itemId, tooltip, visible) => ({
            kind: 'progressbar',
            zone: 'left',
            group: 'timer',
            order: 0,
            // BOTH TIMERS ARE THIS EXACT WIDTH, and it is not responsive.
            // They swap in and out of one slot, so a width that varied with the
            // viewport would make the bar twitch as the handover happened. The
            // number is the longest string either can hold -- "PLANNING TIMER
            // EXPIRED", 22 uppercase characters at the bar label size -- plus
            // 12px of breathing room each side.
            width: CombatBarManager.TIMER_BAR_WIDTH,
            height: 18,
            icon: '',
            title: '',
            borderColor: 'rgba(0,0,0,0.5)',
            barColor: 'rgba(0,0,0,0.45)',
            // Overridden per tick by a state class; the colours live with the
            // tracker's timer styles so the two surfaces cannot diverge.
            progressColor: 'transparent',
            percentProgress: 0,
            leftLabel: ' ',
            tooltip,
            visible
        });

        // Planning wins the slot while it is running; the turn timer takes it
        // afterwards. Each asks its own module's gate and nothing else:
        // CombatTimer.shouldDisplay() and PlanningTimer.verifyTimerConditions()
        // are the same tests the tracker renders behind.
        //
        // Neither may add `state.isActive`. Planning did, and it hid the bar
        // from every player. `isActive` is client-local and arrives on a player
        // only when the GM's syncPlanningTimerState lands — but an item
        // appearing is a STRUCTURAL change that needs a re-render, and there is
        // no "planning started" hook to trigger one. So the sync flipped the
        // flag, the per-tick hook wrote into an item that had never rendered,
        // and nothing ever made it appear. The GM saw it only because their bar
        // re-renders for other reasons around combat start.
        //
        // It was redundant as well as harmful: verifyTimerConditions() already
        // requires TURN 0 and not-expired, which is the whole of what the extra
        // condition was supposed to enforce. Visibility is a function of combat
        // state, which every client agrees on; timer internals are not.
        const planningVisible = () => !!PlanningTimer?.verifyTimerConditions?.();

        api.registerSecondaryBarItem('combat', 'planning-timer', timerItem(
            'planning-timer',
            'Planning timer',
            planningVisible
        ));
        api.registerSecondaryBarItem('combat', 'turn-timer', timerItem(
            'turn-timer',
            'Turn timer',
            () => !planningVisible() && CombatTimer.shouldDisplay()
        ));

        // Health. Party is everyone's business; monster totals are not, in the
        // same way the challenge rating is not.
        const health = CombatBarManager.getHealthSummaries();
        api.registerSecondaryBarItem('combat', 'party-health', {
            kind: 'progressbar',
            zone: 'right',
            group: 'health',
            order: 0,
            width: CombatBarManager.HEALTH_BAR_WIDTH,
            // 40% of the row would be 12px; a health bar wants more presence.
            height: 18,
            icon: '',
            title: '',
            borderColor: 'rgba(0,0,0,0.5)',
            barColor: '#2d5016',
            progressColor: '#4a7c23',
            leftIcon: 'fa-solid fa-helmet-battle',
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
            width: CombatBarManager.HEALTH_BAR_WIDTH,
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

        // The balance between the two sides. Positive means the party is
        // ahead, which the shared marker maths puts right of centre — so left
        // is the monsters' side and right is the party's.
        //
        // Visible to everyone, unlike monster health. It reports a relationship
        // ("you are ahead") rather than a quantity, so it gives the table the
        // boss-bar read without disclosing what a monster actually has left.
        api.registerSecondaryBarItem('combat', 'balance', {
            kind: 'balancebar',
            zone: 'right',
            group: 'health',
            order: 2,
            width: 'clamp(90px, 10vw, 170px)',
            height: 18,
            icon: '',
            title: '',
            borderColor: 'rgba(0,0,0,0.5)',
            barColorLeft: '#4a0a0a',
            barColorRight: '#2d5016',
            markerColor: 'rgba(240, 240, 224, 0.95)',
            leftIcon: 'fa-solid fa-dragon',
            rightIcon: 'fa-solid fa-helmet-battle',
            percentProgress: 0,
            // No labels: this is a measure of balance, not a second place to
            // read the health numbers. The two health bars carry those.
            tooltip: 'Encounter balance: health above, threat still standing below'
        });

        api.registerSecondaryBarItem('combat', 'party-cr', {
            kind: 'info',
            zone: 'right',
            group: 'challenge',
            order: 0,
            icon: 'fas fa-helmet-battle',
            // Icon only: the icon already says which side, and the row is tight.
            label: '',
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
            label: '',
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

        // ===== PARTY STATISTICS =====
        //
        // Two sets of three sharing the middle zone, swapped by combat state.
        // Between fights the bar shows the standings — figures that change only
        // when a combat ends. During one it shows the fight in progress.
        //
        // Everyone sees both sets. These exist for the table to enjoy — the
        // point of "biggest hit" is the player who landed it seeing it — so
        // they are the party's own record in both directions, and neither set
        // is GM information the way the challenge rating is.
        //
        // Lifetime figures reduce actor flags and the stored combat history, a
        // world setting, so they are on every client already. Running figures
        // read the accumulator the GM mirrors to a combat flag, which syncs the
        // same way; `CombatStats.getRunningCombatSource` covers why that works
        // without a socket.
        const liveStatsVisible = () => !!CombatBarManager.getActiveCombat();
        const lifetimeStatsVisible = () => !CombatBarManager.getActiveCombat();

        // The MVP plate is the loudest thing on the row, so an empty one is the loudest way to say
        // nothing. It stays hidden until there is a name to put in it.
        //
        // Both predicates read the SAME sources the plate's own values come from, so the plate can
        // never appear without content or linger without it. Both are also null-safe by necessity:
        // `getAggregateSync()` returns null while the party cache rebuilds, and `getRunningStats()`
        // is null for the first moments of a combat before the GM's first mirror lands -- in each
        // case "no data yet" and "no MVP" are the same answer here, which is to stay hidden.
        //
        // Appearing is a STRUCTURAL change and needs a re-render to take effect. A predicate
        // depending on state the bar does not re-render for would silently never appear; see the
        // planning timer note above for what that failure looks like.
        //
        // This comment used to claim the re-render was already covered, because the standings
        // change on `blacksmith.combatSummaryReady` and the running fight on the combat flag write.
        // That was true of what CHANGES the numbers and false of what makes this read return null.
        // The party cache is also invalidated by `updateActor`, `createActor` and `deleteActor`
        // (`stats-party.js:38`), and an actor update is not a re-render trigger -- so a hit point
        // change during a fight emptied every lifetime chip and nothing brought them back. The
        // invalidation set is wider than the re-render set; `refreshReadoutItems` closes the gap by
        // asking for a render when it has to rebuild the aggregate itself.
        const hasLifetimeMvp = () => {
            try {
                return !!game.modules.get(MODULE.ID)?.api?.stats?.party?.getAggregateSync()?.topMvp?.name;
            } catch (_) {
                return false;
            }
        };
        const hasLiveMvp = () => {
            try {
                return !!game.modules.get(MODULE.ID)?.api?.stats?.combat?.getRunningStats()?.notableMoments?.mvp?.name;
            } catch (_) {
                return false;
            }
        };

        // A READOUT WITH NOTHING TO REPORT DOES NOT APPEAR.
        //
        // The same argument as the MVP plate, applied to the rest: at the start of a fight the live
        // set was six chips all reading zero, which is a row of furniture saying nothing. The bar
        // now fills as the fight develops, and a chip arriving is itself information -- the first
        // kill puts Kills on the bar.
        //
        // Zero is treated as absence rather than as a reading. That is a judgement, and it is the
        // right one HERE because every one of these counters starts at zero and only rises: "0
        // kills" and "no kills yet" are the same statement, and the second needs no pixels. It
        // would be wrong for a figure that can genuinely rest at zero after being something else.
        //
        // None of these can flicker, for the same reason: within a combat and across a campaign
        // they are monotonic, so each crosses its threshold once and stays.
        const running = () => {
            try {
                return game.modules.get(MODULE.ID)?.api?.stats?.combat?.getRunningStats() ?? null;
            } catch (_) {
                return null;
            }
        };
        const lifetime = () => {
            try {
                return game.modules.get(MODULE.ID)?.api?.stats?.party?.getAggregateSync() ?? null;
            } catch (_) {
                return null;
            }
        };
        /** Compose a state predicate with a data predicate; either failing hides the item. */
        const withData = (stateVisible, hasData) => () => {
            if (!stateVisible()) return false;
            try {
                return !!hasData();
            } catch (_) {
                return false;
            }
        };
        const liveWhen = (hasData) => withData(liveStatsVisible, hasData);
        const lifetimeWhen = (hasData) => withData(lifetimeStatsVisible, hasData);
        const positive = (value) => (Number(value) || 0) > 0;

        api.registerSecondaryBarItem('combat', 'stat-biggest-hitter', {
            kind: 'portraitstat',
            zone: 'middle',
            group: 'stats',
            order: 0,
            icon: 'fa-solid fa-burst',
            label: 'Biggest Hit',
            value: '-',
            tooltip: 'Biggest hit on record',
            visible: lifetimeWhen(() => positive(lifetime()?.biggestHit?.amount))
        });
        api.registerSecondaryBarItem('combat', 'stat-most-fumbles', {
            kind: 'portraitstat',
            zone: 'middle',
            group: 'stats',
            order: 1,
            // A die showing one: a fumble is a natural 1, and it sits with the
            // other dice iconography already on the bar. Deliberately not one
            // of Font Awesome's emoji faces.
            icon: 'fa-solid fa-dice-one',
            label: 'Most Fumbles',
            value: '-',
            tooltip: 'Most fumbles on record',
            visible: lifetimeWhen(() => positive(lifetime()?.mostFumbles?.count))
        });
        // The MVP is the one readout meant to be looked AT rather than glanced past, so it gets a
        // plate in its own zone instead of competing for width in the middle. The two plates share
        // a group and are mutually exclusive through their predicates.
        api.registerSecondaryBarItem('combat', 'stat-top-mvp', {
            kind: 'nameplate',
            rank: 1,
            // FAR LEFT, out of combat only. That zone is empty between fights -- round, turn and
            // the timers all require a combat -- so the plate gets it to itself and the statistics
            // keep the middle. In combat the same zone is the clock, which is why the live plate
            // below sits with the statistics instead.
            zone: 'left',
            group: 'mvp',
            order: 0,
            icon: 'fa-solid fa-trophy',
            label: '',
            value: '-',
            tooltip: 'Top MVP on record',
            visible: () => lifetimeStatsVisible() && hasLifetimeMvp()
        });
        // Criticals and fumbles as ONE reading, which is how the Party Statistics window frames
        // them: a swing of luck rather than two unrelated counters. It also buys back the width the
        // window's longer labels cost. The per-person standings for each live in that window.
        api.registerSecondaryBarItem('combat', 'stat-finesse', {
            kind: 'statchip',
            tone: 'record',
            zone: 'middle',
            group: 'stats',
            order: 3,
            label: 'Finesse',
            // Three parts, two of them data. The unit letter belongs to its count -- "2C" is one
            // reading, not a number with a decoration -- so only the separator is muted. Declared
            // here as well as pushed so the part count is stable from the first render: the patch
            // path treats a change in count as structure, and a chip that starts as one string
            // would rebuild on its first update instead of patching.
            valueParts: ['0C', { text: ' | ', muted: true }, '0F'],
            tooltip: 'Criticals and fumbles on record',
            visible: lifetimeWhen(() => positive(lifetime()?.totalCriticals) || positive(lifetime()?.totalFumbles))
        });
        // Healing has no standing of its own anywhere else on the bar, which quietly made every
        // readout a damage readout -- a party's healer could play a whole campaign and never appear.
        api.registerSecondaryBarItem('combat', 'stat-total-healing', {
            kind: 'statchip',
            tone: 'good',
            zone: 'middle',
            group: 'stats',
            order: 4,
            label: 'Heals Given',
            value: '0',
            tooltip: 'Total healing given across every recorded combat',
            visible: lifetimeWhen(() => positive(lifetime()?.totalHealsGiven))
        });
        // The reliability pair. `mostMisses` is already ranked low-is-best by the
        // aggregate, so this is "who whiffs least", not "who whiffs most".
        api.registerSecondaryBarItem('combat', 'stat-most-hits', {
            kind: 'portraitstat',
            zone: 'middle',
            group: 'stats',
            order: 4,
            icon: 'fa-solid fa-crosshairs',
            label: 'Most Hits',
            value: '-',
            tooltip: 'Most hits on record',
            visible: lifetimeWhen(() => positive(lifetime()?.mostHits?.count))
        });
        api.registerSecondaryBarItem('combat', 'stat-most-misses', {
            kind: 'portraitstat',
            zone: 'middle',
            group: 'stats',
            order: 5,
            icon: 'fa-solid fa-ban',
            label: 'Most Misses',
            value: '-',
            tooltip: 'Fewest misses on record',
            visible: lifetimeWhen(() => positive(lifetime()?.mostMisses?.count))
        });
        // Campaign-scale totals rather than per-person standings, so no portrait:
        // these belong to the party, not to anyone in it.
        api.registerSecondaryBarItem('combat', 'stat-total-damage', {
            kind: 'sparkchip',
            tone: 'record',
            zone: 'middle',
            group: 'stats',
            order: 6,
            icon: 'fa-solid fa-swords',
            label: 'Damage Dealt',
            // Per-combat history behind the campaign total: the number says how much,
            // the columns say whether the party is trending up or coasting.
            series: [],
            sparkPoints: 14,
            value: '-',
            tooltip: 'Total damage dealt across every recorded combat',
            visible: lifetimeWhen(() => positive(lifetime()?.totalDamageGiven))
        });
        api.registerSecondaryBarItem('combat', 'stat-total-kills', {
            kind: 'statchip',
            tone: 'neutral',
            zone: 'middle',
            group: 'stats',
            order: 7,
            icon: 'fa-solid fa-skull',
            label: 'Kills',
            value: '-',
            tooltip: 'Total kills across every recorded combat',
            visible: lifetimeWhen(() => positive(lifetime()?.totalKills))
        });
        api.registerSecondaryBarItem('combat', 'stat-combats', {
            kind: 'statchip',
            tone: 'neutral',
            zone: 'middle',
            group: 'stats',
            order: 8,
            icon: 'fa-solid fa-flag-checkered',
            label: 'Encounters',
            value: '-',
            tooltip: 'Combats fought',
            visible: lifetimeWhen(() => positive(lifetime()?.totalCombats))
        });
        // The out-of-combat counterpart to the live hit-rate chip, so the same
        // measure appears in both states rather than only during a fight.
        api.registerSecondaryBarItem('combat', 'stat-avg-hit-rate', {
            kind: 'gaugechip',
            zone: 'middle',
            group: 'stats',
            order: 9,
            icon: 'fa-solid fa-percent',
            label: 'Accuracy',
            value: '-',
            tooltip: 'Average hit rate across every recorded combat',
            visible: lifetimeWhen(() => positive(lifetime()?.totalCombats))
        });

        // The live set is numbered from 10 so the two sets never interleave if both
        // are ever visible at once. They are mutually exclusive today, but ordering
        // that only works because of a predicate is ordering waiting to break.
        api.registerSecondaryBarItem('combat', 'stat-damage-dealt', {
            kind: 'sparkchip',
            // Same tone as the out-of-combat damage spark on purpose: it is the same statistic in a
            // different scope, and a reader who learns the shape of one should not have to learn the
            // other. The monsters' side is a tint of this rather than a colour of its own -- see
            // `menubar-widgets.css`.
            tone: 'record',
            zone: 'middle',
            group: 'stats',
            order: 10,
            icon: 'fa-solid fa-hand-fist',
            label: 'Damage',
            // Damage per round for the fight in progress, from the round summaries the
            // accumulator already mirrors to the combat flag.
            series: [],
            sparkPoints: 12,
            value: '0',
            tooltip: 'Party damage dealt this combat',
            visible: liveWhen(() => positive(running()?.totals?.damageDealt))
        });
        api.registerSecondaryBarItem('combat', 'stat-hit-rate', {
            kind: 'gaugechip',
            zone: 'middle',
            group: 'stats',
            order: 11,
            icon: 'fa-solid fa-bullseye',
            label: 'Accuracy',
            value: '0%',
            tooltip: 'Party hit rate this combat',
            visible: liveWhen(() => positive(running()?.totals?.hits) || positive(running()?.totals?.misses))
        });
        api.registerSecondaryBarItem('combat', 'stat-combat-biggest', {
            kind: 'portraitstat',
            zone: 'middle',
            group: 'stats',
            order: 12,
            icon: 'fa-solid fa-explosion',
            label: 'Biggest Hit',
            value: '-',
            tooltip: 'Biggest hit this combat',
            visible: liveWhen(() => positive(running()?.notableMoments?.biggestHit?.amount))
        });
        // The survival read. Damage dealt alone says how the party is doing TO the
        // fight; these say how the fight is doing to them.
        api.registerSecondaryBarItem('combat', 'stat-kills', {
            kind: 'statchip',
            tone: 'good',
            zone: 'middle',
            group: 'stats',
            order: 13,
            icon: 'fa-solid fa-skull-crossbones',
            label: 'Kills',
            value: '0',
            tooltip: 'Kills this combat',
            visible: liveWhen(() => positive(running()?.totals?.kills))
        });
        api.registerSecondaryBarItem('combat', 'stat-damage-taken', {
            kind: 'statchip',
            tone: 'bad',
            zone: 'middle',
            group: 'stats',
            order: 14,
            icon: 'fa-solid fa-shield-halved',
            label: 'Defense',
            value: '0',
            tooltip: 'Party damage taken this combat',
            visible: liveWhen(() => positive(running()?.totals?.damageTaken))
        });
        // Otherwise a healer's whole contribution is invisible until the fight ends.
        api.registerSecondaryBarItem('combat', 'stat-healing-given', {
            kind: 'statchip',
            tone: 'good',
            zone: 'middle',
            group: 'stats',
            order: 15,
            icon: 'fa-solid fa-kit-medical',
            label: 'Healing',
            value: '0',
            tooltip: 'Healing given this combat',
            visible: liveWhen(() => positive(running()?.totals?.healingGiven))
        });
        // Portrait, like the biggest-hit chips: a face is read instantly where a
        // truncated name is not, and the name stays in the tooltip.
        api.registerSecondaryBarItem('combat', 'stat-combat-mvp', {
            kind: 'nameplate',
            rank: 1,
            // Trailing the statistics rather than leading them: at the head of the group it read as
            // though every number after it were that person's, when they are the party's.
            zone: 'middle',
            group: 'stats',
            order: 91,
            icon: 'fa-solid fa-medal',
            label: '',
            value: '',
            tooltip: 'Leading MVP this combat',
            visible: () => liveStatsVisible() && hasLiveMvp()
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

    /**
     * Draw a timer's current state straight into its rendered bar.
     *
     * Deliberately NOT `updateSecondaryBarItemInfo` + a re-render: the timers
     * tick once a second, and rebuilding the menubar at that rate for the whole
     * of every combat is exactly the cost the menubar fingerprint exists to
     * avoid. The tracker's own timers write to cached DOM for the same reason.
     *
     * The fill's colour comes from a state class rather than an inline colour,
     * so it resolves against the same custom properties the tracker's bars use.
     *
     * @param {string} itemId 'planning-timer' | 'turn-timer'
     * @param {{percent: number, state: string, text: string}} display
     */
    static syncTimerReadout(itemId, display) {
        if (!display) return;
        const item = document.querySelector(
            `.combat-data-row .secondary-bar-item-progressbar[data-item-id="${itemId}"]`
        );
        if (!item) return;

        const fill = item.querySelector('.secondary-bar-item-progressbar-fill');
        if (fill) {
            // A re-rendered item is built from the registered percentProgress,
            // which is 0 — so the first write after any render is a jump from
            // 0 to the real value, and the 1s transition turns that jump into a
            // second of the bar sweeping up to where it should already be. The
            // tracker never shows this because its markup persists between
            // renders; ours is rebuilt by the menubar. Land the first write
            // without a transition, then restore it so subsequent ticks glide.
            // Bind the tracker's own click behaviour to this copy of the bar:
            // left toggles pause, right sets the remaining time from the click
            // position. Bound directly to the track rather than delegated,
            // because both handlers measure `event.currentTarget` — a delegated
            // listener would hand them the wrong element and scrub to a wrong
            // time. Re-bound per render, since the element is rebuilt.
            const track = item.querySelector('.secondary-bar-item-progressbar-bar');

            // Expired colours the whole track, not the fill — at zero the fill
            // has no width, so a fill-only colour leaves the bar reading as an
            // empty track. The tracker does the same thing via
            // `.combat-timer-progress.expired`; this mirrors it.
            //
            // The inline `background-color` the partial writes from `barColor`
            // has to go for the class to be able to colour anything: an inline
            // declaration beats the stylesheet. Same reason the fill clears
            // its own. CSS then owns both the normal and expired track colour.
            if (track) {
                if (track.style.backgroundColor) track.style.backgroundColor = '';
                track.classList.toggle('expired', !!display.isExpired);
            }

            if (track && track.dataset.blacksmithTimerBound !== '1') {
                const timer = itemId === 'planning-timer' ? PlanningTimer : CombatTimer;
                const onClick = itemId === 'planning-timer'
                    ? (event) => timer._onTimerClick(event)
                    : (event) => timer.handleTimerClick(event);
                const onContext = itemId === 'planning-timer'
                    ? (event) => { event.preventDefault(); timer._onTimerRightClick(event); }
                    : (event) => { event.preventDefault(); timer.handleRightClick(event); };
                track.addEventListener('click', onClick);
                track.addEventListener('contextmenu', onContext);
                track.style.cursor = game.user.isGM ? 'pointer' : '';
                track.dataset.blacksmithTimerBound = '1';
            }

            if (item.dataset.blacksmithTimerPrimed !== '1') {
                const previous = fill.style.transition;
                fill.style.transition = 'none';
                fill.style.width = `${display.percent}%`;
                void fill.offsetWidth; // force the value to settle before transitions resume
                fill.style.transition = previous;
                item.dataset.blacksmithTimerPrimed = '1';
            }
            fill.style.width = `${display.percent}%`;
            // The partial writes `background-color: {{progressColor}}` inline,
            // and an inline declaration beats the stylesheet — so the state
            // class could never colour the fill until the inline one is gone.
            // Clearing it hands the colour back to CSS, which is what lets the
            // band values live beside the tracker's rather than being repeated
            // here as hex.
            if (fill.style.backgroundColor) fill.style.backgroundColor = '';
            fill.classList.remove('high', 'medium', 'low', 'expired');
            if (display.state) fill.classList.add(display.state);
        }

        const label = item.querySelector('.secondary-bar-item-progressbar-left-label');
        if (label && label.textContent !== display.text) label.textContent = display.text;
    }

    /**
     * Difficulty chip colour for this bar. Deliberately not
     * `EncounterManager.getDifficultyBorderColor`, whose palette was chosen as
     * a border against the encounter bar's near-black background; used as text
     * on the combat bar's warm translucent row those read fluorescent,
     * the greens worst. Muted and warmed to sit on that row instead.
     */
    static getDifficultyChipColor(difficultyClass) {
        const colors = {
            trivial: '#9db89d',
            easy: '#a8c9a0',
            medium: '#c0a457',
            hard: '#e39a6a',
            deadly: '#e07070',
            impossible: '#c98f8f',
            none: 'rgba(240, 240, 224, 0.55)'
        };
        return colors[difficultyClass] ?? colors.none;
    }

    /**
     * Width of BOTH timer bars, in pixels.
     *
     * Sized to the longest string either timer can display -- "PLANNING TIMER EXPIRED", 22
     * uppercase characters at `--blacksmith-combatbar-bar-font-size` -- plus 12px each side.
     * Fixed rather than responsive because the two share one slot and hand off to each other: a
     * viewport-relative width would make the row twitch at the handover.
     */
    static TIMER_BAR_WIDTH = 168;

    /**
     * Width of BOTH health bars, in pixels.
     *
     * They are a matched pair read against each other -- party against monsters -- so unequal
     * widths make unequal fractions look equal. The balance bar beside them is deliberately a
     * different width, because it is a different measure and should not read as a third health bar.
     */
    static HEALTH_BAR_WIDTH = 150;

    /**
     * Mark the data row with the combat state its layout depends on.
     *
     * The row's own template cannot work this out: out of combat it is handed `getIdleBarData()`
     * and in combat the full payload, so there is no single flag in the context to test. The class
     * drives where the statistics sit -- beside the MVP plate out of combat, centred in it -- which
     * is a relationship between zones that CSS can only express if something names the state.
     */
    static syncDataRowState() {
        const row = document.querySelector('.combat-data-row');
        if (!row) return;
        row.classList.toggle('in-combat', !!CombatBarManager.getActiveCombat());
        // A health bar is clickable only when some module claims the `party-health` intent, so the
        // affordance is offered only when it is real. Blacksmith ships no health panel, so in a
        // world without one the bars stay inert readouts.
        let hasHealthTool = false;
        try {
            hasHealthTool = !!game.modules.get(MODULE.ID)?.api?.hasIntentHandler?.('party-health');
        } catch (_) {
            hasHealthTool = false;
        }
        row.classList.toggle('has-health-tool', hasHealthTool);
    }

    /**
     * Readouts dropped, in order, when the data row cannot fit them. Squeezing
     * them all makes every one unreadable; dropping the least urgent keeps the
     * rest legible. Party health goes first, then monster health, then the
     * timer — the timer is the one you are watching a clock on.
     */
    static READOUT_SUPPRESSION_ORDER = [
        // Statistics go first: they are the only readouts nothing depends on in
        // the moment. Within each set the least operational goes first, so what
        // survives longest is the biggest hit on record out of combat and the
        // damage total in one — the two anyone actually watches.
        //
        // The order within each set is now the whole design. Ten lifetime chips and
        // seven live ones cannot all fit on a normal bar, and they are not meant to:
        // suppression decides what a given width actually shows, so this list is the
        // ranking from "nice to have" to "the reason the zone exists". The campaign-
        // scale figures go first — they change once per combat and can be read in the
        // Party Statistics window any time — then the secondary standings, then the
        // three originals.
        'stat-combats', 'stat-avg-hit-rate', 'stat-total-kills', 'stat-total-damage',
        'stat-most-misses', 'stat-most-hits', 'stat-finesse', 'stat-total-healing',
        'stat-most-fumbles', 'stat-biggest-hitter',
        // Live: the MVP plate goes first of all. It is the widest thing in the zone
        // by some way, so dropping it buys back more than any two chips — and it is
        // the one readout that has a home elsewhere, since the same standing is in
        // the Party Statistics window the group opens. Then the flourish and the
        // support detail, then the survival pair, then the three originals.
        //
        // The LIFETIME plate is deliberately absent: out of combat it holds the left
        // zone alone and competes with nothing, so suppressing it would free width
        // in a zone that is not short of it.
        'stat-combat-mvp',
        'stat-healing-given', 'stat-kills', 'stat-damage-taken',
        'stat-hit-rate', 'stat-combat-biggest', 'stat-damage-dealt',
        'party-health', 'monster-health', 'planning-timer', 'turn-timer'
    ];

    /**
     * Re-measure the readouts whenever the data row changes width.
     *
     * Suppression used to run only after a render, which meant it was right at the moment it ran
     * and drifted from then on: the sidebar collapsing, the window resizing, or a Foundry UI change
     * narrows the row without anything re-rendering the menubar, and the row was left holding a
     * decision made at a width it no longer has. The visible result is a clipped chip that no
     * amount of waiting fixes.
     *
     * The observer is rebound per render because the row element is rebuilt with the bar, and the
     * previous one is disconnected first so a long session does not accumulate observers on
     * detached nodes.
     */
    static observeDataRowWidth() {
        const row = document.querySelector('.combat-data-row');
        if (!row) return;
        if (CombatBarManager._readoutResizeObserver?._row === row) return;

        CombatBarManager._readoutResizeObserver?.disconnect();
        const observer = new ResizeObserver(() => {
            // Measuring inside the callback that fired on a layout change is what produces
            // "ResizeObserver loop completed with undelivered notifications"; defer a frame.
            requestAnimationFrame(() => CombatBarManager.applyReadoutOverflow());
        });
        observer._row = row;
        observer.observe(row);
        CombatBarManager._readoutResizeObserver = observer;
    }

    /** @type {ResizeObserver|null} */
    static _readoutResizeObserver = null;

    /**
     * The biggest hit already celebrated with a burst, for the current fight.
     *
     * The same swing is pushed on every refresh for as long as it stands, so without this the
     * burst would replay several times a second for the rest of the fight. Only a HIGHER amount
     * fires again, which is what makes "a new best" the trigger rather than "is the best".
     */
    static _burstedBiggestHit = 0;

    /**
     * Hide readouts until the row fits. Measured rather than expressed in CSS,
     * because "hide this one first" is an ordering CSS cannot state — a media
     * query would also be guessing at the row's width rather than reading it.
     */
    static applyReadoutOverflow() {
        const row = document.querySelector('.combat-data-row');
        const toolbar = row?.querySelector('.secondary-bar-toolbar');
        if (!toolbar) return;

        const suppressed = [];
        for (const itemId of CombatBarManager.READOUT_SUPPRESSION_ORDER) {
            const el = toolbar.querySelector(`.secondary-bar-item[data-item-id="${itemId}"]`);
            if (el) suppressed.push(el);
        }
        // Start from everything visible so the row recovers as it widens.
        for (const el of suppressed) el.classList.remove('is-suppressed');

        // MEASURE THE ZONES, NOT ONLY THE TOOLBAR.
        //
        // The toolbar alone never reports overflow, so nothing was ever suppressed. The middle zone
        // is `flex: 1 1 0` with `min-width: 0`, which means it SHRINKS to absorb any shortfall
        // rather than pushing its parent wider -- so `toolbar.scrollWidth` stays equal to its
        // clientWidth however much content is crammed in, while the zone's own contents spill past
        // its edge and paint over the right zone. The visible symptom is readouts colliding with
        // the health bars; the measurable one was nowhere, because the thing being measured could
        // not overflow by construction.
        //
        // A zone can overflow, so ask the zones. One pixel of slack absorbs sub-pixel layout noise,
        // which otherwise leaves a chip suppressed for a rounding error.
        const zones = Array.from(toolbar.querySelectorAll('.secondary-bar-zone'));
        const overflows = () => toolbar.scrollWidth > toolbar.clientWidth + 1
            || zones.some((zone) => zone.scrollWidth > zone.clientWidth + 1);

        for (const el of suppressed) {
            if (!overflows()) break;
            el.classList.add('is-suppressed');
        }

        // NOTHING IS EVER SHOWN IN PART.
        //
        // The ranked pass decides WHAT to drop, and normally that is enough. It cannot promise
        // enough on its own: it stops when the overflow clears, it can run out of ranked items
        // while the row is still too narrow, and a zone with `overflow: hidden` answers a partial
        // chip by slicing it -- which is how "ACCURAC" ends up on the bar. A clipped readout is
        // worse than an absent one, because absent is a decision and clipped looks like damage.
        //
        // So this final pass guarantees the invariant the ranking cannot: any item whose box is not
        // wholly inside its zone is hidden outright. It walks from the END of each zone backwards,
        // because in a nowrap row the overflow is always at the trailing edge and the last item is
        // the one to give up first -- and it re-measures after each hide, since removing one item
        // pulls the rest back and the next may then fit whole.
        for (const zone of zones) {
            const items = Array.from(zone.querySelectorAll('.secondary-bar-item'))
                .filter((el) => !el.classList.contains('is-suppressed'));
            for (let index = items.length - 1; index >= 0; index--) {
                const bounds = zone.getBoundingClientRect();
                const item = items[index].getBoundingClientRect();
                // A pixel of slack, for the same sub-pixel noise the width check allows.
                if (item.right <= bounds.right + 1 && item.left >= bounds.left - 1) break;
                items[index].classList.add('is-suppressed');
            }
        }
    }

    /**
     * Push both timers' current state into a freshly rendered bar. Without
     * this the bar would show an empty track until the next tick, up to a
     * second after every render — most visibly right after the item appears.
     */
    static syncAllTimerReadouts() {
        try {
            // `state.isActive` belongs HERE and deliberately not in the item's
            // visible predicate. This pushes a VALUE, and getDisplayState() reads
            // `state.remaining`, which is 0 until the timer starts — so pushing
            // early would render "Planning Timer Expired" on a timer that has not
            // begun. Leaving it unpushed lets the item show its registered empty
            // track for the moment before the first tick, which is the truth.
            if (PlanningTimer?.verifyTimerConditions?.() && PlanningTimer?.state?.isActive) {
                CombatBarManager.syncTimerReadout('planning-timer', PlanningTimer.getDisplayState());
            }
            if (CombatTimer?.shouldDisplay?.()) {
                CombatBarManager.syncTimerReadout('turn-timer', CombatTimer.getDisplayState());
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error syncing timer readouts', error?.message || error, false, false);
        }
    }

    /**
     * Whichever timer is live changes which item is visible, and that is a
     * structural change the fingerprint has to see — so state transitions
     * rebuild once, while the per-second values do not.
     */
    static registerTimerReadoutHooks(menuBar) {
        HookManager.registerHook({
            name: 'blacksmithTimerDisplay',
            description: 'MenuBar: Draw timer state into the combat bar readout',
            context: 'menubar-combat-timer-readout',
            priority: 3,
            callback: (itemId, display) => CombatBarManager.syncTimerReadout(itemId, display)
        });

        for (const hookName of ['combatTimerStateChange', 'planningTimerExpired', 'endPlanningTimer']) {
            HookManager.registerHook({
                name: hookName,
                description: `MenuBar: Rebuild combat bar when the timer slot changes owner (${hookName})`,
                context: 'menubar-combat-timer-transition',
                priority: 3,
                callback: () => CombatBarManager.updateCombatBar(menuBar)
            });
        }
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
    static _lifetimeRenderPending = false;

    static refreshReadoutItems(menuBar = null) {
        try {
            const api = game.modules.get(MODULE.ID)?.api;
            if (!api?.updateSecondaryBarItemInfo) return;

            // Round and turn are everyone's; the challenge rating below is not.
            const combat = CombatBarManager.getActiveCombat();
            if (combat) {
                const totalTurns = Array.isArray(combat.turns) ? combat.turns.length : combat.combatants.size;
                const currentTurn = Math.min((typeof combat.turn === 'number' ? combat.turn : 0) + 1, Math.max(totalTurns, 1));
                // Both fields are pushed together with the tooltip that names them, so the
                // three can never disagree. "of" is scaffolding rather than a number: same
                // treatment as the Finesse separator.
                const currentRound = combat.round || 0;
                api.updateSecondaryBarItemInfo('combat', 'round-turn', {
                    label: String(currentRound),
                    valueParts: [
                        String(currentTurn),
                        { text: ' of ', muted: true },
                        String(totalTurns)
                    ],
                    tooltip: `Round ${currentRound} - turn ${currentTurn} of ${totalTurns}`
                });
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
            // Difference of the two percentages: 0 when both sides are equally
            // worn, +100 when the monsters are down and the party untouched.
            // Percentages rather than raw HP, so a big-pool boss and a swarm
            // are read on the same scale.
            // TWO NEEDLES, ONE SCALE.
            //
            // Health says how WORN each side is; remaining challenge rating says how much THREAT
            // each side still has, weighted by what that threat actually is -- killing the boss
            // moves it a long way, killing a goblin barely at all. Health cannot say that, because
            // it weights by hit point pool: a 300 HP boss dominates the reading whatever it is.
            // Body count cannot say it either, because it weights a goblin and a boss the same.
            //
            // They are two readings of one relationship, so they share the bar rather than getting
            // one each -- reading them against each other is the entire point, and separate bars
            // would hand that comparison back to the reader.
            const crSourceTokens = combat
                ? (Array.isArray(combat.turns) && combat.turns.length ? combat.turns : Array.from(combat.combatants))
                    .map((c) => c.token?.object).filter(Boolean)
                : (canvas?.tokens?.placeables ?? []);
            const standingPartyCR = parseFloat(EncounterManager.getPartyCR(crSourceTokens, { onlyStanding: true })) || 0;
            const standingMonsterCR = parseFloat(EncounterManager.getMonsterCR({}, crSourceTokens, { onlyStanding: true })) || 0;
            const crTotal = standingPartyCR + standingMonsterCR;
            // Expressed as each side's SHARE of the threat still on the field, so it lands on the
            // same -100..+100 scale the health reading uses and the two are directly comparable.
            const crBalance = crTotal > 0
                ? (((standingPartyCR - standingMonsterCR) / crTotal) * 100)
                : 0;

            api.updateSecondaryBarItemInfo('combat', 'balance', {
                percentProgress: health.party.percent - health.monster.percent,
                markers: [{
                    percent: crBalance,
                    from: 'bottom',
                    // No colour here on purpose: the stylesheet owns it, so the gold is defined
                    // once rather than restated in a module that cannot see the rest of the palette.
                    tooltip: `Threat still standing: party ${standingPartyCR} vs monsters ${standingMonsterCR}`
                }]
            });

            CombatBarManager.refreshStatReadouts(combat);

            if (!game.user.isGM) return;
            // Same scoping rule as health, and for the same reason. Out of
            // combat the rating is the fight as designed — everything on the
            // canvas. In combat it is the party against what is actually in
            // the encounter, so an encounter can be scaled while it runs by
            // adding or removing combatants and watching the number move.
            const crSource = combat
                ? (Array.isArray(combat.turns) && combat.turns.length ? combat.turns : Array.from(combat.combatants))
                : null;
            const assessment = EncounterManager.getCombatAssessment({}, crSource);
            api.updateSecondaryBarItemInfo('combat', 'party-cr', { value: assessment.partyCRDisplay });
            api.updateSecondaryBarItemInfo('combat', 'monster-cr', { value: assessment.monsterCRDisplay });
            api.updateSecondaryBarItemInfo('combat', 'difficulty', {
                value: assessment.difficulty,
                iconColor: CombatBarManager.getDifficultyChipColor(assessment.difficultyClass),
                borderColor: null
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error refreshing challenge rating', error?.message || error, false, false);
        }
    }

    /**
     * Thousands as "8.4k". Lifetime totals reach five and six digits over a
     * campaign, and a chip is about four characters wide before it starts pushing
     * its neighbours out of the bar. The exact figure stays in the tooltip where
     * there is room for it.
     */
    static compactNumber(value) {
        const number = Number(value) || 0;
        if (Math.abs(number) < 1000) return String(number);
        const thousands = number / 1000;
        // 8.4k below ten thousand, 84k above -- one decimal is noise at that scale.
        return `${Math.abs(thousands) < 10 ? thousands.toFixed(1) : Math.round(thousands)}k`;
    }

    /**
     * A portrait for an actor id, or null. Null rather than the mystery-man
     * placeholder on purpose: the template only renders the img when there is
     * one, so a missing portrait leaves the chip as icon-and-number instead of
     * adding a meaningless silhouette to a row that is short of width.
     */
    static actorPortrait(actorId) {
        if (!actorId) return null;
        const actor = game.actors.get(actorId);
        return actor ? (getPortraitImage(actor) || null) : null;
    }

    /**
     * A name short enough for a bar chip: the first word, so "Favia Gita"
     * reads as "Favia". The middle zone is `flex: 1 1 0`, so a long name
     * pushes the readouts either side of it around; the full name is in the
     * tooltip, where there is room for it.
     */
    static shortenName(name) {
        const trimmed = String(name ?? '').trim();
        if (!trimmed) return '-';
        const first = trimmed.split(/\s+/)[0];
        return first.length > 14 ? `${first.slice(0, 13)}...` : first;
    }

    /**
     * Draw the party statistics readouts.
     *
     * The bar never reduces anything here — it asks `stats.party` for the
     * standings and `stats.combat` for the fight in progress, both of which are
     * single reductions shared with the Party Statistics window and the
     * end-of-combat card. A figure on the bar that disagreed with the card
     * afterwards would be worse than no figure at all.
     */
    static refreshStatReadouts(combat) {
        const api = game.modules.get(MODULE.ID)?.api;
        if (!api?.updateSecondaryBarItemInfo || !api?.stats) return;

        if (combat) {
            // Null on a player client for the first moments of a combat, before
            // the GM's first mirror to the combat flag lands. The chips show
            // their registered placeholders until then and the next flag write
            // fires updateCombat, which brings the bar back through here.
            const running = api.stats.combat.getRunningStats();
            const totals = running?.totals;
            const biggest = running?.notableMoments?.biggestHit;
            api.updateSecondaryBarItemInfo('combat', 'stat-damage-dealt', {
                value: String(totals?.damageDealt ?? 0),
                // Per-round damage for this fight, party against monsters. `rounds` rides the
                // same combat flag the totals do, so this costs no extra read and no second
                // reduction. Both series share one scale, so the pair is the reading.
                series: running?.roundDamage ?? [],
                seriesB: running?.roundDamageTaken ?? []
            });
            api.updateSecondaryBarItemInfo('combat', 'stat-hit-rate', {
                // hitRate is already a one-decimal string, and is the number 0
                // rather than "0.0" before any attack has been rolled.
                value: `${totals?.hitRate ?? 0}%`,
                // The ring needs a number, not the formatted string beside it.
                percentProgress: Number(totals?.hitRate) || 0
            });
            // A RECORD IS SOMETHING ONLY THIS SIDE CAN KNOW.
            //
            // The bar can see a number rise; it cannot see that the rise passed a campaign best,
            // because the record lives in the lifetime tier and the value being pushed is from the
            // running fight. Comparing the two is a caller's job, and `burst` is the signal.
            //
            // Guarded against replaying: the same swing is pushed on every refresh for as long as
            // it stands as the biggest, so firing on "live >= record" would burst repeatedly.
            // `_burstedBiggestHit` remembers the amount already celebrated, and is cleared when a
            // combat ends so the next fight can beat the record again.
            const liveBiggest = Number(biggest?.amount) || 0;
            const standingBiggest = Number(
                game.modules.get(MODULE.ID)?.api?.stats?.party?.getAggregateSync()?.biggestHit?.amount
            ) || 0;

            // A new best FOR THIS FIGHT is the common tier, and it is what a player actually
            // watches for: the hardest hit of the evening changing hands several times over a
            // couple of rounds. `_burstedBiggestHit` holds the amount already celebrated, so only
            // a HIGHER swing fires again -- the same swing is pushed on every refresh for as long
            // as it stands, and an unlatched test would burst several times a second.
            const beatsFight = liveBiggest > 0 && liveBiggest > CombatBarManager._burstedBiggestHit;

            // Beating the CAMPAIGN standing on top of that is the rare tier.
            //
            // This deliberately requires a standing to exist. In a world with no lifetime history
            // the opening swing of the first fight is technically a record, but there is nothing to
            // have beaten, and firing the loud tier on it would spend the rarest animation on the
            // least remarkable moment. It still bursts -- as a new fight best, which it is.
            const holdsRecord = liveBiggest > 0 && standingBiggest > 0 && liveBiggest > standingBiggest;
            if (beatsFight) CombatBarManager._burstedBiggestHit = liveBiggest;

            api.updateSecondaryBarItemInfo('combat', 'stat-combat-biggest', {
                image: CombatBarManager.actorPortrait(biggest?.attackerId),
                value: biggest ? String(biggest.amount) : '-',
                ...(beatsFight && { burst: holdsRecord ? 'record' : true }),
                // Read from the standing rather than from the one-shot burst latch, so the tooltip
                // still says "a new record" a minute later when someone hovers it. Tying it to the
                // latch made the words true for a single refresh and false afterwards.
                tooltip: biggest
                    ? `Biggest hit this combat: ${biggest.attacker} hit ${biggest.target} for ${biggest.amount}`
                        + (holdsRecord ? ' — a new campaign record' : '')
                    : 'Biggest hit this combat'
            });
            api.updateSecondaryBarItemInfo('combat', 'stat-kills', {
                value: String(totals?.kills ?? 0)
            });
            api.updateSecondaryBarItemInfo('combat', 'stat-damage-taken', {
                value: String(totals?.damageTaken ?? 0)
            });
            api.updateSecondaryBarItemInfo('combat', 'stat-healing-given', {
                value: String(totals?.healingGiven ?? 0)
            });
            const mvp = running?.notableMoments?.mvp;
            api.updateSecondaryBarItemInfo('combat', 'stat-combat-mvp', {
                image: CombatBarManager.actorPortrait(mvp?.actorId ?? mvp?.id),
                label: mvp?.name ? CombatBarManager.shortenName(mvp.name) : '',
                // The score is a composite nobody reads at a glance, so the second line names the
                // standing instead of quoting it. The exact score stays in the tooltip.
                // No empty branch: the plate is hidden unless there is a name.
                value: 'Leading MVP',
                tooltip: mvp?.name
                    ? `Leading MVP this combat: ${mvp.name}${mvp.score != null ? ` (score ${mvp.score})` : ''}`
                    : 'Leading MVP this combat'
            });
            return;
        }

        // Out of combat. The cache is warm almost always — it only rebuilds
        // when a combat ends or an actor changes — so the synchronous read is
        // the normal path and the promise is the cold-start fallback rather
        // than the mechanism. Writing on both keeps this method synchronous
        // for its caller, which runs inside the render path.
        // A portrait instead of a name. Three chips reading "Kar-ahn 26",
        // "Favia 2", "Favia" are unreadable at a glance — two of them are the
        // same word meaning different things — and a face is recognised
        // instantly where a truncated first name is not. The name stays in the
        // tooltip, so nothing is lost for anyone who needs to be sure.
        const write = (aggregate) => {
            if (!aggregate) return;
            api.updateSecondaryBarItemInfo('combat', 'stat-biggest-hitter', {
                image: aggregate.biggestHit?.img || null,
                value: String(aggregate.biggestHit?.amount ?? 0),
                tooltip: `Biggest hit on record: ${aggregate.biggestHit?.name ?? 'nobody'} for ${aggregate.biggestHit?.amount ?? 0}`
            });
            api.updateSecondaryBarItemInfo('combat', 'stat-most-fumbles', {
                image: aggregate.mostFumbles?.img || null,
                value: String(aggregate.mostFumbles?.count ?? 0),
                tooltip: `Most fumbles on record: ${aggregate.mostFumbles?.name ?? 'nobody'} with ${aggregate.mostFumbles?.count ?? 0}`
            });
            // The plate has room for the name, which every other standing has to leave in its
            // tooltip. Shortened like the rest, so a long name cannot widen the zone.
            const topMvpEntry = aggregate.leaderboard?.[0] ?? null;
            api.updateSecondaryBarItemInfo('combat', 'stat-top-mvp', {
                image: aggregate.topMvp?.img || null,
                label: aggregate.topMvp?.name ? CombatBarManager.shortenName(aggregate.topMvp.name) : '',
                // No empty branch: the plate is hidden unless there is a name.
                value: `Top MVP${topMvpEntry?.mvp?.totalScore ? ` · ${topMvpEntry.mvp.totalScore}` : ''}`,
                tooltip: `Top MVP on record: ${aggregate.topMvp?.name ?? 'nobody'}`
            });
            api.updateSecondaryBarItemInfo('combat', 'stat-finesse', {
                valueParts: [
                    `${aggregate.totalCriticals ?? 0}C`,
                    { text: ' | ', muted: true },
                    `${aggregate.totalFumbles ?? 0}F`
                ],
                tooltip: `${aggregate.totalCriticals ?? 0} critical(s) and ${aggregate.totalFumbles ?? 0} fumble(s) on record`
            });
            api.updateSecondaryBarItemInfo('combat', 'stat-total-healing', {
                value: CombatBarManager.compactNumber(aggregate.totalHealsGiven),
                tooltip: `Total healing given across ${aggregate.totalCombats ?? 0} recorded combat(s): ${aggregate.totalHealsGiven ?? 0}`
            });
            api.updateSecondaryBarItemInfo('combat', 'stat-most-hits', {
                image: aggregate.mostHits?.img || null,
                value: String(aggregate.mostHits?.count ?? 0),
                tooltip: `Most hits on record: ${aggregate.mostHits?.name ?? 'nobody'} with ${aggregate.mostHits?.count ?? 0}`
            });
            api.updateSecondaryBarItemInfo('combat', 'stat-most-misses', {
                image: aggregate.mostMisses?.img || null,
                value: String(aggregate.mostMisses?.count ?? 0),
                // The aggregate ranks this low-is-best, so the winner is the most
                // reliable shot, not the least. The tooltip has to say so or the
                // number reads as an accusation.
                tooltip: `Fewest misses on record: ${aggregate.mostMisses?.name ?? 'nobody'} with ${aggregate.mostMisses?.count ?? 0}`
            });
            // Party-scale totals. No portrait — these belong to the party, not to
            // anyone in it, and a face here would claim otherwise.
            api.updateSecondaryBarItemInfo('combat', 'stat-total-damage', {
                value: CombatBarManager.compactNumber(aggregate.totalDamageGiven),
                series: aggregate.damageSeries ?? [],
                tooltip: `Total damage dealt across ${aggregate.totalCombats ?? 0} recorded combat(s): ${aggregate.totalDamageGiven ?? 0}`
            });
            api.updateSecondaryBarItemInfo('combat', 'stat-total-kills', {
                value: CombatBarManager.compactNumber(aggregate.totalKills)
            });
            api.updateSecondaryBarItemInfo('combat', 'stat-combats', {
                value: String(aggregate.totalCombats ?? 0),
                tooltip: `${aggregate.totalCombats ?? 0} combat(s) fought over ${aggregate.totalRounds ?? 0} round(s)`
            });
            api.updateSecondaryBarItemInfo('combat', 'stat-avg-hit-rate', {
                // averageHitRate is already a formatted string from the aggregate.
                value: `${aggregate.averageHitRate ?? 0}%`,
                // The ring wants the number, which the aggregate carries beside the
                // string for exactly this reason rather than being re-parsed here.
                percentProgress: aggregate.averageHitRateValue ?? 0
            });
        };

        const cached = api.stats.party.getAggregateSync();
        if (cached) {
            write(cached);
            return;
        }
        // COLD CACHE, and writing the values on arrival is not enough on its own. The `visible`
        // predicates above read the same synchronous accessor, so they have ALREADY resolved to
        // false for every lifetime chip, and appearing is a structural change that only a render
        // applies. Without the re-render below the standings stay hidden until some unrelated
        // render brings them back.
        //
        // This is not a rare cold start. `updateActor` invalidates the aggregate
        // (`stats-party.js:38`) and the same hook rebuilds this bar, in that order, so every hit
        // point change during a fight lands here.
        api.stats.party.getAggregate()
            .then((aggregate) => {
                write(aggregate);
                if (!aggregate || !menuBar || CombatBarManager._lifetimeRenderPending) return;
                // Guarded rather than trusted to terminate. The re-render calls this method again,
                // which takes the warm path and asks for nothing further -- unless another actor
                // update invalidates the cache in between, which is precisely the condition that
                // would otherwise make this chase itself.
                CombatBarManager._lifetimeRenderPending = true;
                try {
                    CombatBarManager.updateCombatBar(menuBar);
                } finally {
                    CombatBarManager._lifetimeRenderPending = false;
                }
            })
            .catch((error) => postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error reading party stats', error?.message || error, false, false));
    }

    static registerCombatMenubarTool() {
        const api = game.modules.get(MODULE.ID)?.api;
        if (!api?.registerMenubarTool) return;
        if (api.isMenubarToolRegistered?.('combat-bar')) return;
        api.registerMenubarTool('combat-bar', {
            icon: "fas fa-swords",
            name: "combat-bar",
            title: () => "Encounter",
            tooltip: "Show the encounter bar",
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

    /**
     * Re-render the bar once Foundry has re-sorted the turn order.
     *
     * `updateCombatant` fires from the per-document callback loop
     * (`client-backend.mjs:296-301`), and `Combat#setupTurns()` does not run until
     * `_onUpdateDescendantDocuments` -> `#onModifyCombatants` a few lines later
     * (`combat.mjs:689-720`) -- both in the same synchronous task, with no await
     * between them. So a handler that reads `combat.turns` during the hook sees the
     * order the combat had BEFORE the write, renders it, and nothing renders again
     * until the next turn change. That is why a drag-to-reorder on the bar and a
     * reorder made in the tracker both left the portraits in their old order until
     * a turn passed.
     *
     * A microtask is exactly the right amount of deferral: it runs once that
     * synchronous block yields, which is after `setupTurns()` and before any paint.
     * A timeout would work too and would also let a frame through.
     */
    static afterTurnOrder(callback) {
        queueMicrotask(() => {
            try {
                callback();
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error refreshing after turn order rebuild', error, false, false);
            }
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
                } else {
                    CombatBarManager.afterTurnOrder(() => {
                        if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                            CombatBarManager.updateCombatBar(menuBar);
                        }
                    });
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
                CombatBarManager.afterTurnOrder(() => {
                    if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                        CombatBarManager.updateCombatBar(menuBar);
                        if (initiativeUpdated) menuBar.renderMenubar();
                    }
                });
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
                CombatBarManager.afterTurnOrder(() => {
                    if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                        CombatBarManager.updateCombatBar(menuBar);
                    }
                });
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

        // The standings move exactly once per combat, when the summary is
        // stored and lifetime figures are written. `stats.party` invalidates on
        // the same hook, so this refresh is what makes the bar re-read the
        // rebuilt aggregate rather than keep whatever it drew before the fight.
        // Without it the bar would still correct itself on the next update,
        // which for a table that has just finished a combat is the wrong moment
        // to be showing the previous combat's standings.
        HookManager.registerHook({
            // Also where the burst latch clears. The latch is scoped to one fight, and this is the
            // hook that marks a fight ending -- clearing at combat START would leave it holding the
            // previous fight's best through the gap between combats, so the first swing of the next
            // one would have to beat a number from a fight that is over.
            name: 'blacksmith.combatSummaryReady',
            description: 'MenuBar: Refresh combat bar party statistics when a combat ends',
            context: 'menubar-combat-stats',
            priority: 3,
            callback: () => {
                CombatBarManager._burstedBiggestHit = 0;
                CombatBarManager.scheduleReadoutRefresh(menuBar);
            }
        });

        const combatDeleteHookId = HookManager.registerHook({
            name: 'deleteCombat',
            description: 'MenuBar: Close combat bar when combat is deleted',
            context: 'menubar-combat-delete',
            priority: 3,
            callback: () => {
                CombatBarManager.closeAllCombatantPopoutCards();
                // The strip is about to empty, so forget where it was scrolled to: a position
                // measured against this fight's combatants means nothing to the next fight's.
                CombatBarManager.resetPortraitScroll();
                // Ending an encounter empties the bar; it does not remove it.
                CombatBarManager.updateCombatBar(menuBar);
            }
        });

        // A combat belongs to a scene, so changing scene changes which combat the
        // bar should be reflecting -- or whether there is one at all.
        //
        // Nothing asked that question before. Every other trigger here is a combat
        // event (created, updated, deleted), and switching scenes is none of those:
        // the combat documents do not change, only which of them is in front of you.
        // So the bar kept showing the fight from the scene you left.
        //
        // `canvasReady` rather than a scene hook, because it fires once the new
        // scene is actually drawn -- `game.scenes.current` is settled by then, which
        // is what getActiveCombat() reads.
        const sceneChangeHookId = HookManager.registerHook({
            name: 'canvasReady',
            description: 'MenuBar: Point the combat bar at the newly viewed scene combat',
            context: 'menubar-combat-scene',
            priority: 3,
            callback: () => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                // Popouts belong to the combatants of the fight we are leaving.
                CombatBarManager.closeAllCombatantPopoutCards();
                // A scroll position measured against another scene's combatants
                // means nothing here.
                CombatBarManager.resetPortraitScroll();

                const combat = CombatBarManager.getActiveCombat();
                const shouldShow = getSettingSafely(MODULE.ID, 'menubarCombatShow', true);
                if (combat && shouldShow) CombatBarManager.openCombatBar(menuBar);
                else CombatBarManager.updateCombatBar(menuBar);
                // --- END - HOOKMANAGER CALLBACK ---
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
            }
        });

        const updateTokenHookId = HookManager.registerHook({
            name: 'updateToken',
            description: 'MenuBar: Update combat bar when token HP or disposition changes',
            context: 'menubar-token-update',
            priority: 3,
            callback: (token, updateData) => {
                if (CombatBarManager.isCombatBarActive(menuBar)) CombatBarManager.handleTokenChange(menuBar, token, updateData);
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
            description: 'MenuBar: Refresh combat bar when the combat size or portrait shape changes',
            context: 'menubar-combat-size-change',
            priority: 3,
            callback: (module, key) => {
                if (module !== MODULE.ID) return;
                // Portrait shape rides the same refresh: it is baked into the rendered SVG
                // (circle or rect) as well as the CSS, so a class toggle alone cannot apply it.
                if (key !== 'menubarCombatSize' && key !== 'menubarCombatPortraitShape') return;
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
                if (CombatBarManager.getActiveCombat() && menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
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

    /**
     * Where one statistic chip goes when it is clicked.
     *
     * The single seam between a chip and its destination, so that giving a chip somewhere of its
     * own to go is a branch here rather than another arm of the bar's click handler. Every chip
     * lands on the Party Statistics window today because that window explains all of them; the
     * `itemId` is dispatched on regardless, so the chips are already separate controls and it is
     * only their destinations that have yet to diverge.
     *
     * @param {object} menuBar
     * @param {string} itemId Registered id of the chip, e.g. `stat-total-kills`.
     */
    static openStatDestination(menuBar, itemId) {
        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Statistic clicked", itemId || "(unknown)", true, false);
        menuBar.openStatsWindow();
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
        // Content wider than the box it sits in, and nothing else. The old second
        // clause -- `visibleWidth < 80 && contentWidth > 0` -- fired on a SINGLE
        // combatant, because the strip is `flex: 0 1 auto` and so measures its own
        // content: one portrait is under 80px wide. Being marked overflowing then
        // applied `flex: 1; max-width: 70%; justify-content: flex-start`, which
        // stretched the strip across most of the bar, left-aligned the one portrait,
        // and pushed the action button to the far edge. A second combatant cleared
        // 80px and it corrected itself, which is what made it look like a width bug.
        // It was also redundant: an unlaid-out strip measures 0 and the first clause
        // already catches that.
        const overflowing = contentWidth > visibleWidth + 1;
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

    /**
     * Bring the combatant whose turn it is to the middle of the strip.
     *
     * @param {object} menuBar
     * @param {object} [options]
     * @param {boolean} [options.instant] Place it without animating.
     */
    static ensureCurrentCombatantVisible(menuBar, { instant = false } = {}) {
        const wrapper = document.querySelector('.combat-portraits-scroll-wrapper');
        const portraits = wrapper?.querySelector('.combat-portraits');
        if (!portraits) return;

        // UNTIL INITIATIVE IS ROLLED, THE RIGHT END IS THE END THAT MATTERS.
        //
        // A combatant with no initiative sorts to the end of the order, and its portrait carries
        // the die a player clicks to roll -- so the portraits nobody has acted on yet are exactly
        // the ones stacked off the right edge. Centring the active combatant there would hide the
        // only thing anyone is being asked to do. Checked before the active combatant is even
        // looked for, because initiative is normally owed before there is a current turn at all.
        //
        // scrollWidth is past the end by definition; jumpPortraitScrollTo clamps it to the end.
        if (portraits.querySelector('.combat-portrait-initiative-dice')) {
            const alreadyWaiting = CombatBarManager._centredCombatantId === CombatBarManager.INITIATIVE_ANCHOR;
            CombatBarManager._centredCombatantId = CombatBarManager.INITIATIVE_ANCHOR;
            if (!alreadyWaiting) CombatBarManager._userScrolledThisTurn = false;
            // A reader who scrolled off to look elsewhere keeps their position, exactly as during
            // a turn -- rolls keep arriving and each one would otherwise haul them back.
            if (!CombatBarManager._userScrolledThisTurn) {
                CombatBarManager.jumpPortraitScrollTo(menuBar, portraits.scrollWidth);
            }
            return;
        }

        const currentPortrait = portraits.querySelector('.combat-portrait-container.current');
        if (!currentPortrait) {
            CombatBarManager._centredCombatantId = null;
            return;
        }

        // Nothing to centre within: the strip fits, so every combatant is already on screen.
        if (portraits.scrollWidth <= portraits.clientWidth + 1) {
            CombatBarManager._centredCombatantId = currentPortrait.dataset.combatantId || null;
            return;
        }

        // CENTRED, not merely on screen. Scrolling by the overhang -- the original behaviour --
        // parks the active combatant hard against whichever edge it arrived from, and since turn
        // order runs left to right that edge is the right one. Everyone still to act was therefore
        // off screen, which makes "who is up next" a question you had to scroll to answer.
        //
        // Measured from rects rather than offsetLeft: the strip is not a positioned ancestor, so
        // offsetLeft would be relative to something further up and would not account for the scroll.
        // Rects also account for the scale the portraits carry, so this centres what is drawn.
        const portRect = portraits.getBoundingClientRect();
        const currentRect = currentPortrait.getBoundingClientRect();
        const delta = (currentRect.left + (currentRect.width / 2)) - (portRect.left + (portRect.width / 2));
        // Converted to an absolute destination before it is handed over: the animation outlives the
        // measurement, and a delta stops meaning anything once the strip has been rebuilt under it.
        // Both helpers clamp, so a combatant near either end settles against that end rather than
        // leaving dead space beside it.
        const target = (portraits.scrollLeft || 0) + delta;

        const combatantId = currentPortrait.dataset.combatantId || null;
        if (combatantId !== CombatBarManager._centredCombatantId) {
            // THE FIRST PLACEMENT DOES NOT ANIMATE. On a fresh client the strip starts at the far
            // left and the active combatant is routinely fifty portraits along; gliding there is a
            // long journey past fifty identical portraits that says nothing. It should simply
            // already be in the right place. After that a turn passing is a change worth showing,
            // so it eases.
            const firstPlacement = CombatBarManager._centredCombatantId === null;
            CombatBarManager._centredCombatantId = combatantId;
            CombatBarManager._userScrolledThisTurn = false;
            if (firstPlacement || instant) CombatBarManager.jumpPortraitScrollTo(menuBar, target);
            else CombatBarManager.easePortraitScrollTo(menuBar, target, 220);
            return;
        }

        // SAME TURN. A rebuild is not a turn, and this runs after every render -- damage, effects,
        // hidden state, disposition, timers -- so by default the strip stays where the reader left it.
        //
        // The one exception is a strip whose active combatant is not on screen at all. That is not a
        // preference to be respected, it is a bar nobody can read: with sixty combatants the turn
        // could be in either overflow and there is no way to tell which. It happens when a render
        // measured the strip before its layout had settled. Corrected silently, never animated, and
        // never against a reader who scrolled away deliberately.
        if (CombatBarManager._portraitScrollTarget != null) return;
        if (CombatBarManager._userScrolledThisTurn) return;
        const clipped = currentRect.left < (portRect.left - 1) || currentRect.right > (portRect.right + 1);
        if (!clipped) return;
        CombatBarManager.jumpPortraitScrollTo(menuBar, target);
    }

    static attachCombatPortraitScrollListener(menuBar) {
        const wrapper = document.querySelector('.combat-portraits-scroll-wrapper');
        const portraits = wrapper?.querySelector('.combat-portraits');
        if (!portraits || portraits.dataset.scrollListenerAttached === 'true') return;
        portraits.dataset.scrollListenerAttached = 'true';
        // A wheel over the strip is the other way a reader moves it deliberately. Taken from the
        // wheel rather than from the scroll event, which cannot tell a person from an animation.
        // Horizontal intent only. A plain vertical wheel over the bar is the page being scrolled
        // past it and moves this strip not at all, so counting it would switch the correction off
        // for the rest of the turn on the strength of a gesture aimed at something else.
        portraits.addEventListener('wheel', (event) => {
            if (Math.abs(event.deltaX) > 0) CombatBarManager._userScrolledThisTurn = true;
        }, { passive: true });
        // Every scroll is recorded, whoever caused it -- an arrow click, a wheel, or the easing
        // itself, which writes scrollLeft per frame and so leaves the final value here for free.
        portraits.addEventListener('scroll', () => {
            CombatBarManager._portraitScrollLeft = portraits.scrollLeft || 0;
            CombatBarManager.updateCombatPortraitScrollArrows(menuBar);
        }, { passive: true });
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
        CombatBarManager._readoutResizeObserver?.disconnect();
        CombatBarManager._readoutResizeObserver = null;
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
            // be pushed before the render that reads them. The bar is passed so a
            // cold party cache can ask for a second render once it has rebuilt --
            // visibility is decided here and cannot be patched in afterwards.
            CombatBarManager.refreshReadoutItems(menuBar);
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
        // SCENE-SCOPED, deliberately. A combat belongs to a scene, so the bar must
        // show the combat for the scene being LOOKED AT -- not whichever fight
        // happens to be running somewhere in the world.
        //
        // `game.combats.active` already answers exactly that: it matches only a
        // combat whose scene is the current one, or which has no scene at all
        // (combat-encounters.mjs:54). It was the `?? game.combat` fallback that
        // broke it, and that fallback was worse than doing nothing. `game.combat`
        // resolves to `ui.combat.viewed`, a STICKY field the tracker sets from
        // `#inferCombat()`, and that method returns the first ACTIVE combat in the
        // world regardless of scene (combat-tracker.mjs:730). So switching to a
        // quiet scene kept showing the previous scene's fight, complete with its
        // combatants.
        const active = game.combats?.active ?? null;
        if (active) return active;

        // No ACTIVE combat here, but this scene may still own a paused or
        // not-yet-started one. That is this scene's combat and worth showing; a
        // combat on any other scene is not.
        const sceneId = game.scenes?.current?.id ?? null;
        if (!sceneId) return null;
        return game.combats?.find((combat) => combat.scene?.id === sceneId) ?? null;
    }

    /**
     * The data row's height. Deliberately a constant and not a setting: the
     * whole reason the row exists is that the item vocabulary sizes itself
     * from the bar height, and the combat row has to scale for portraits.
     * A slider here would reintroduce exactly the problem the row solves.
     */
    static DATA_ROW_HEIGHT = 30;

    /**
     * Whether the combat row is rendered at all. Out of combat it holds only
     * the GM's menu buttons, so for a player it would be an empty strip — the
     * data row is the whole bar for them until a fight starts.
     */
    static showsCombatRow(isInCombat) {
        return isInCombat || game.user.isGM;
    }

    /**
     * The combat row's height — portraits, controls, the part the user scales.
     * Two settings because that row carries portraits during an encounter and
     * only the menus between them.
     */
    static resolveCombatRowHeight(isInCombat) {
        if (!CombatBarManager.showsCombatRow(isInCombat)) return 0;
        // Only the in-combat height is configurable, because only in combat
        // does this row contain anything that scales — the portraits. Out of
        // combat it is a strip of buttons, so it takes the house default for a
        // secondary bar and is not worth a setting. Read from CSS rather than
        // MenuBar.getSecondaryBarHeight because importing MenuBar here would
        // close a cycle; the stylesheet is the source either way.
        if (!isInCombat) {
            const houseDefault = parseInt(
                getComputedStyle(document.documentElement)
                    .getPropertyValue('--blacksmith-menubar-secondary-default-height'),
                10
            );
            return houseDefault || 30;
        }
        return getSettingSafely(MODULE.ID, 'menubarCombatSize', 60);
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
            isInCombat: false,
            showCombatRow: CombatBarManager.showsCombatRow(false),
            barActions: CombatBarManager.getOutOfCombatActions()
        };
    }

    /**
     * A token's disposition as a css-safe key and a localized word. The key becomes a class on
     * the portrait container, which colours the strip across its top; the word goes to the
     * hover card.
     *
     * Shown to everyone, not just the GM: Foundry already colors every visible token's border by
     * disposition on the canvas, so this exposes nothing a player cannot already read there — and
     * hidden combatants never reach a player's strip in the first place.
     *
     * Falls back to neutral for a combatant with no token document, which is what an unplaced
     * combatant effectively is.
     *
     * @param {Combatant|null} combatant
     * @returns {{key: string, label: string}}
     */
    static getCombatantDisposition(combatant) {
        const D = CONST.TOKEN_DISPOSITIONS;
        const raw = combatant?.token?.disposition;
        const value = Number.isFinite(Number(raw)) ? Number(raw) : D.NEUTRAL;
        const key = value === D.FRIENDLY ? 'friendly'
            : value === D.HOSTILE ? 'hostile'
            : value === D.SECRET ? 'secret'
            : 'neutral';
        return { key, label: game.i18n.localize(`TOKEN.DISPOSITION.${key.toUpperCase()}`) };
    }

    static getCombatData(combat) {
        try {
            if (!combat) return CombatBarManager.getIdleBarData();

            const hideNpcHealthSetting = game.settings.get(MODULE.ID, 'menubarCombatHideHealthBars');
            const hideDeadCombatants = game.settings.get(MODULE.ID, 'menubarCombatHideDead');
            const hideNpcHealth = hideNpcHealthSetting && !game.user.isGM;
            const isGM = game.user.isGM;
            // Personal, so read per render rather than cached: portrait shape is this client's
            // view of the bar and never leaves it.
            const isSquarePortrait = getSettingSafely(MODULE.ID, 'menubarCombatPortraitShape', 'round') === 'square';

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

                // SQUARE MODE DOES NOT DRAW A RING AT ALL — it draws a bar across the bottom of
                // the portrait, and the only geometry it needs is a percentage.
                //
                // A square ring was built first and abandoned (author call, 2026-08-06). It
                // worked -- stroke-dasharray divides a rounded rectangle's perimeter as happily
                // as a circumference -- but an SVG rect's path begins after its first corner
                // radius and runs clockwise, so it drained from the top-left CORNER with no
                // obvious start or direction. A circle has twelve o'clock; a rectangle has no
                // equivalent, and the fix would have been to hand-draw the outline as a <path>
                // starting at top-centre. A horizontal bar sidesteps the question entirely: left
                // to right needs no explaining, and it makes the two shapes genuinely different
                // readings rather than one reading in two costumes.

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
                const disposition = CombatBarManager.getCombatantDisposition(combatant);

                return {
                    id: combatant.id,
                    name: token?.name || actor?.name || 'Unknown',
                    // The same overlay the hover card composites, so a portrait
                    // reads the same whether or not the pointer is on it.
                    bloodOverlay: CombatBarManager.getBloodOverlay(actor),
                    dispositionKey: disposition.key,
                    dispositionLabel: disposition.label,
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
                    // Square mode's bar reads this instead of the dash offset. It mirrors that
                    // offset's two special cases rather than inventing its own: a suppressed
                    // ring and a dead combatant both show the track FULL, in the pale and the
                    // pulsing-red treatments respectively, so the shapes never disagree about
                    // what zero and hidden look like.
                    healthBarPercent: (healthRingHidden || currentHP <= 0) ? 100 : healthPercentage,
                    svgSize: size,
                    svgCenter: size / 2,
                    svgRadius: radius,
                    svgStrokeWidth: strokeWidth,
                    isSquarePortrait,
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
                isInCombat: true,
                showCombatRow: true
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
        // No logging here. This is a pure predicate called from both handlers before either knows
        // whether the change is relevant, so logging inside it reports on updates that are about to
        // be discarded -- the same noise, one layer down. The callers log once they have decided.
        return targets.some(path => flat[path] !== undefined);
    }

    /**
     * Log AFTER the guards, never before them.
     *
     * This used to log every arriving actor update, with the whole update payload, as its first
     * statement -- so with debug mode on, any bulk operation that touches actors buried the console.
     * An inventory transfer was enough to produce dozens of identical lines for one actor, none of
     * which said anything: the bar only cares about hit points changing on a tracked combatant, and
     * every other update was logged and then discarded one line later.
     *
     * The diagnostic that mattered is kept and sharpened. An update that does not touch hit points is
     * simply not this bar's business and says nothing by being silent. An update that DOES touch hit
     * points and is still rejected is the interesting case, and it now says why.
     */
    static handleActorHpChange(menuBar, actor, updateData) {
        try {
            if (!CombatBarManager.isCombatBarActive(menuBar)) return;
            if (!CombatBarManager.didHpChange(updateData)) return;
            const combat = CombatBarManager.getActiveCombat();
            if (!combat) {
                postConsoleAndNotification(MODULE.NAME, 'Menubar: actor HP changed with no active combat', { actorId: actor?.id }, true, false);
                return;
            }
            const isCombatant = combat.combatants.some(combatant => combatant.actor?.id === actor?.id);
            if (!isCombatant) {
                postConsoleAndNotification(MODULE.NAME, 'Menubar: actor HP changed for a non-combatant', { actorId: actor?.id }, true, false);
                return;
            }
            postConsoleAndNotification(MODULE.NAME, 'Menubar: rebuilding for a combatant HP change', { actorId: actor?.id }, true, false);
            CombatBarManager.updateCombatBar(menuBar);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Failed to process actor HP change', { actorId: actor?.id, error }, true, false);
        }
    }

    /**
     * A token document changed. Rebuild the bar only for the fields it draws: HP (health ring),
     * hidden (the dimmed state and, for a player, whether the portrait is there at all), and
     * disposition (the stripe under the portrait).
     *
     * Disposition gets a full rebuild rather than a patch because there is no targeted patch path
     * for a portrait's class the way there is for its health ring — and it changes rarely enough
     * that building one would cost more than it saves.
     */
    static handleTokenChange(menuBar, token, updateData) {
        try {
            // Guards first, then log -- see handleActorHpChange for why.
            if (!CombatBarManager.isCombatBarActive(menuBar)) return;
            const hpChanged = CombatBarManager.didHpChange(updateData);
            const hiddenChanged = 'hidden' in updateData;
            const dispositionChanged = 'disposition' in updateData;
            if (!hpChanged && !hiddenChanged && !dispositionChanged) return;
            const combat = CombatBarManager.getActiveCombat();
            if (!combat) return;
            const tokenId = token?.id;
            const actorId = token?.actor?.id;
            const isCombatant = combat.combatants.some(combatant => combatant.token?.id === tokenId || combatant.actor?.id === actorId);
            if (!isCombatant) {
                postConsoleAndNotification(MODULE.NAME, 'Menubar: token change for a non-combatant', { tokenId, hpChanged, hiddenChanged, dispositionChanged }, true, false);
                return;
            }
            postConsoleAndNotification(MODULE.NAME, 'Menubar: rebuilding for a combatant token change', { tokenId, hpChanged, hiddenChanged, dispositionChanged }, true, false);
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
            // THE HEALTH BARS OPEN A HEALTH PANEL -- if any module has one.
            //
            // Asked for as an INTENT rather than by tool id. Blacksmith has no health panel of its
            // own, and naming Squire's tool here would put a sibling's id in the hub, which is the
            // coupling the module boundaries forbid. Whichever module claims `party-health`
            // answers; if none does the click was never offered -- see `has-health-tool` below.
            const healthBar = event.target.closest(
                '.combat-data-row .secondary-bar-item-progressbar[data-item-id$="-health"]'
            );
            if (healthBar && menuBar.hasIntentHandler?.('party-health')) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                menuBar.invokeIntent('party-health', { source: 'combat-bar', itemId: healthBar.dataset.itemId });
                return;
            }

            // EACH STATISTIC IS ITS OWN CONTROL.
            //
            // This is the one interactive thing in a row of readouts, and it does not break the
            // no-affordance rule so much as clarify it. That rule exists to forbid a FALSE
            // affordance -- chrome that promises a click and delivers nothing. Here the click is
            // real, so what the rule demands is that it be signalled honestly, which the per-chip
            // hover in `menubar-combatbar.css` does.
            //
            // Answered PER CHIP. The selector always resolved to one item -- `data-group-id` sits
            // on each item, not on the group -- but the chip was then thrown away and the hover
            // wash covered the whole group, so the row presented and behaved as a single control.
            // That was true of the destinations as they are, and is about to stop being true:
            // these chips are being wired to experiences of their own. A reader who has learned
            // that the strip is one button has learned something we would have to take back, and
            // re-teaching one target as seventeen costs far more than teaching seventeen while
            // they happen to agree.
            const statChip = event.target.closest('.combat-data-row [data-group-id="stats"]');
            if (statChip) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                CombatBarManager.openStatDestination(menuBar, statChip.dataset.itemId);
                return;
            }

            // Out-of-combat action buttons: the same entries the menus use, so
            // they dispatch into the same definitions rather than duplicating.
            const barActionBtn = event.target.closest('[data-bar-action]');
            if (barActionBtn) {
                event.preventDefault();
                event.stopPropagation();
                const id = barActionBtn.getAttribute('data-bar-action');
                const action = CombatBarManager.getBarActions()[id];
                if (action?.run) {
                    CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                    await action.run();
                }
                return;
            }

            const toolsMenuBtn = event.target.closest('.combatbar-button[data-control="toolsMenu"]');
            if (toolsMenuBtn) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                CombatBarManager.showToolsMenu(menuBar, toolsMenuBtn);
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
                    const combat = CombatBarManager.getActiveCombat();
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
                    const combat = CombatBarManager.getActiveCombat();
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
                    const combat = CombatBarManager.getActiveCombat();
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
                    const combat = CombatBarManager.getActiveCombat();
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
                    // A PAGE, NOT A PORTRAIT. One portrait per click meant a twenty-combatant
                    // fight took twenty clicks to cross, so a click now moves nearly the whole
                    // visible strip and leaves ONE portrait of overlap as a visual anchor --
                    // you can see where you came from, which a clean page-flip loses.
                    //
                    // Derived from the measured widths rather than a fixed count of portraits,
                    // because both terms move: the bar is as wide as the user's screen and the
                    // portrait size is a setting. A fixed "three portraits" still crawls on a
                    // wide bar and overshoots on a narrow one.
                    const first = portraits.querySelector('.combat-portrait-container');
                    const gap = parseInt(getComputedStyle(portraits).gap, 10) || 2;
                    const portraitStep = first ? first.offsetWidth + gap : 0;
                    // Floor of one portrait: when only one fits, "a page minus one" is zero or
                    // negative and the button would do nothing at all.
                    const step = Math.max(portraitStep || Math.floor(portraits.clientWidth * 0.4), portraits.clientWidth - portraitStep);
                    // Measured from the destination of any glide already running, not from where the
                    // strip happens to be this instant -- otherwise a second click lands mid-animation
                    // and only advances a fraction of a page, so clicking twice quickly moves less
                    // than clicking twice slowly.
                    // Deliberate: the strip must stop correcting itself onto the active combatant
                    // until the turn passes, or it would drag the reader straight back.
                    CombatBarManager._userScrolledThisTurn = true;
                    const base = CombatBarManager._portraitScrollTarget ?? (portraits.scrollLeft || 0);
                    CombatBarManager.easePortraitScrollTo(menuBar, base + (scrollLeftBtn ? -step : step), 220);
                    setTimeout(() => CombatBarManager.updateCombatPortraitScrollArrows(menuBar), 400);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="beginCombat"]')) {
                event.preventDefault();
                event.stopPropagation();
                CombatBarManager.playUiSound(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
                try {
                    const combat = CombatBarManager.getActiveCombat();
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
                    const combat = CombatBarManager.getActiveCombat();
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
                    const combat = CombatBarManager.getActiveCombat();
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
                    const combat = CombatBarManager.getActiveCombat();
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
                    const combat = CombatBarManager.getActiveCombat();
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
        const combat = CombatBarManager.getActiveCombat();
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
        const combatant = CombatBarManager.getActiveCombat()?.combatants?.get(combatantId);
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

        const combatant = CombatBarManager.getActiveCombat()?.combatants?.get(combatantId);
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
            const combatant = CombatBarManager.getActiveCombat()?.combatants?.get(windowInstance.combatantId);
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
        const activeCombatantId = CombatBarManager.getActiveCombat()?.combatant?.id ?? null;
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
        const bloodOverlay = CombatBarManager.getBloodOverlay(actor);

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
        const disposition = CombatBarManager.getCombatantDisposition(combatant);

        return {
            name: token?.name || actor?.name || combatant?.name || 'Unknown',
            // On the limited card too: the stripe on the portrait says the same thing, and so
            // does the token's own border on the canvas.
            dispositionKey: disposition.key,
            dispositionLabel: disposition.label,
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
        // The portrait's stripe carries the colour; this carries the word. Both are shown to
        // players, because the token's own border already says it on the canvas.
        const dispositionHtml = data.dispositionLabel
            ? `<span class="combat-hover-disposition disposition-${esc(data.dispositionKey)}">${esc(data.dispositionLabel)}</span>`
            : '';
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
                        ${dispositionHtml}
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
                    ${dispositionHtml}
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
            const combat = CombatBarManager.getActiveCombat();
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
     * The blood overlay image for an actor's current wounds.
     *
     * Stepped to 5% so the strip is not swapping images on every point of damage,
     * and 101 is the dead sheet rather than a 100% one -- being at zero is a
     * different state from having taken all your hit points in damage.
     *
     * ONE definition: the hover card and the portrait strip must not disagree
     * about how bloodied somebody is, and they were separate arithmetic away from
     * exactly that.
     *
     * @param {Actor} actor
     * @returns {string|null} image path, or null when there is nothing to show
     */
    static getBloodOverlay(actor) {
        const hp = actor?.system?.attributes?.hp ?? actor?.system?.hitPoints;
        const currentHP = Number(hp?.value ?? 0);
        const maxHP = Number(hp?.max ?? 0);
        if (!maxHP) return null;

        const hpPercent = Math.max(0, Math.min(100, (currentHP / maxHP) * 100));
        const bloodStep = Math.round(Math.max(0, 100 - hpPercent) / 5) * 5;
        const bloodValue = currentHP <= 0 ? 101 : Math.max(0, Math.min(100, bloodStep));
        // Unwounded gets no element at all rather than a blank sheet to composite.
        if (bloodValue === 0) return null;
        return `modules/coffee-pub-blacksmith/images/portraits/blood/blood-${bloodValue}.webp`;
    }

    /**
     * The encounter and token actions, as one definition.
     *
     * In combat these are rows in the Encounter and Tokens context menus; out
     * of combat the same entries are pulled out and rendered as buttons
     * directly on the bar, where there is room for them. Both surfaces read
     * this map, so an action cannot behave differently depending on which one
     * you reached it through.
     *
     * The encounter actions are imported on demand rather than at module load, which is what
     * keeps this module off the encounter graph.
     *
     * @returns {Object<string, {name: string, icon: string, run: Function}>}
     */
    static getBarActions() {
        const run = async (label, fn) => {
            try {
                await fn();
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Combat Bar: Error running ${label}`, error?.message || error, false, false);
            }
        };

        // The removals delete tokens from the scene and there is no undo, so
        // each asks first. Reveal does not — it is reversible and used mid-turn.
        const confirmThenRun = (label, question, fn) => async () => {
            const ok = await foundry.applications.api.DialogV2.confirm({
                window: { title: label },
                content: `<p>${question}</p>`,
                modal: true
            });
            if (!ok) return;
            await run(label, fn);
        };

        const api = game.modules.get(MODULE.ID)?.api;

        return {
            createCombat: {
                name: CombatBarManager.getActiveCombat() ? 'Add to Combat' : 'Create Combat',
                icon: 'fa-solid fa-swords',
                run: () => run('Create Combat', async () => { await api?.createCombat?.(); })
            },
            quickEncounter: {
                name: 'Quick Encounter',
                icon: 'fa-solid fa-dice',
                available: () => !!api?.hasQuickEncounterTool?.(),
                run: () => run('Quick Encounter', async () => { await api?.openQuickEncounterWindow?.(); })
            },
            toggleTracker: {
                name: CombatTracker.isCombatTrackerOpen() ? 'Hide Combat Tracker' : 'Show Combat Tracker',
                icon: 'fa-solid fa-list',
                run: () => CombatBarManager.toggleCombatTracker()
            },
            revealHidden: {
                name: 'Reveal Hidden',
                icon: 'fa-solid fa-eye',
                run: () => run('Reveal Hidden', async () => {
                    const { EncounterManager } = await import('./manager-encounter.js');
                    await EncounterManager.revealHiddenTokens();
                })
            },
            // From the old party bar. Deploy sits next to the removal it undoes;
            // Clear Party was NOT brought across because `removeParty` below is
            // already that action, and two buttons calling clearPartyFromCanvas
            // would be the duplication this move exists to remove.
            deployParty: {
                name: 'Deploy Party',
                icon: 'fa-solid fa-map-marker-alt',
                run: () => run('Deploy Party', async () => {
                    const { deployParty } = await import('./utility-party.js');
                    await deployParty();
                })
            },
            experience: {
                name: 'Party Experience',
                icon: 'fa-solid fa-star',
                // Imported on demand for the window id, the same way the encounter
                // actions are: the id is taken from its owner rather than copied
                // here, where it would drift the first time it changed.
                run: () => run('Experience', async () => {
                    const { XP_WINDOW_ID } = await import('./manager-xp.js');
                    api?.openWindow?.(XP_WINDOW_ID);
                })
            },
            statistics: {
                name: 'Statistics',
                icon: 'fa-solid fa-chart-line',
                run: () => run('Statistics', async () => {
                    const { STATS_PARTY_WINDOW_ID } = await import('./window-stats-party.js');
                    api?.openWindow?.(STATS_PARTY_WINDOW_ID);
                })
            },
            // Reading hit points, which changes nothing. Shown on the bar out of
            // combat as well as in the Combatants menu, so the definition lives
            // here rather than staying menu-local.
            viewPartyHealth: {
                name: 'Party Health',
                icon: 'fa-solid fa-heart',
                run: () => menuViewHealth('party', 'Party Health')
            },
            viewNpcHealth: {
                name: 'NPC Health',
                icon: 'fa-solid fa-heart-crack',
                run: () => menuViewHealth('npc', 'NPC Health')
            },
            viewCanvasHealth: {
                name: 'Canvas Health',
                icon: 'fa-solid fa-heart-pulse',
                run: () => menuViewHealth('all', 'Canvas Health')
            },
            removeParty: {
                name: 'Remove Party',
                icon: 'fa-solid fa-users-slash',
                run: confirmThenRun(
                    'Remove Party',
                    'Delete every party token from this scene?',
                    async () => {
                        const { clearPartyFromCanvas } = await import('./utility-party.js');
                        await clearPartyFromCanvas();
                    }
                )
            },
            removeMonsters: {
                name: 'Remove Monsters',
                icon: 'fa-solid fa-dragon',
                run: confirmThenRun(
                    'Remove Monsters',
                    'Delete every monster token from this scene? Humanoid NPCs are left in place.',
                    async () => {
                        const { EncounterManager } = await import('./manager-encounter.js');
                        await EncounterManager.clearMonstersFromCanvas();
                    }
                )
            },
            removeNpcs: {
                name: 'Remove NPCs',
                icon: 'fa-solid fa-people-line',
                run: confirmThenRun(
                    'Remove NPCs',
                    'Delete every humanoid NPC token from this scene? Party and monsters are left in place.',
                    async () => {
                        const { EncounterManager } = await import('./manager-encounter.js');
                        await EncounterManager.clearNpcsFromCanvas();
                    }
                )
            }
        };
    }

    /**
     * The actions shown as buttons on the bar out of combat, in order.
     *
     * `null` is a divider. The bar reads left to right as: start the fight, then
     * what is on the canvas, then what those things are worth, then the record.
     *
     * No toggleTracker: the tracker is of no use with no encounter running, and
     * it remains in the Encounter menu for when there is one.
     */
    static OUT_OF_COMBAT_ACTIONS = [
        'createCombat', 'quickEncounter', 'deployParty',
        null,
        'revealHidden', 'removeParty', 'removeMonsters', 'removeNpcs',
        null,
        'viewCanvasHealth', 'viewPartyHealth', 'viewNpcHealth',
        null,
        'experience', 'statistics'
    ];

    /**
     * The out-of-combat actions as template rows. GM-only, since every one of
     * them is a GM action; a player's bar is the data row alone.
     */
    static getOutOfCombatActions() {
        if (!game.user.isGM) return [];
        const actions = CombatBarManager.getBarActions();
        const rows = CombatBarManager.OUT_OF_COMBAT_ACTIONS
            .map((id) => {
                if (id === null) return { divider: true };
                const action = actions[id];
                if (!action?.name) return null;
                if (action.available && !action.available()) return null;
                return { id, ...action };
            })
            .filter(Boolean);

        // Drop dividers that ended up with nothing to divide -- leading, trailing,
        // or doubled once a conditional action filtered out. Without this, a world
        // without the Quick Encounter tool would show a rule against the bar edge.
        return rows.filter((row, i) => {
            if (!row.divider) return true;
            const prev = rows.slice(0, i).findLast((r) => !r.divider);
            const next = rows.slice(i + 1).find((r) => !r.divider);
            return !!prev && !!next;
        });
    }

    /**
     * The TOOLS menu -- canvas tools everybody needs mid-fight.
     *
     * The one menu on this bar that is NOT GM-only: selecting, targeting and
     * measuring are things a player does on their own turn, and hunting for them
     * in the scene controls while the clock runs is the friction this removes.
     *
     * The first three switch Foundry's active tool rather than doing anything
     * themselves. `ui.controls.activate({control, tool})` is the supported way in
     * v13 (client/applications/ui/scene-controls.mjs) and the tool names are the
     * token layer's own: select, target, ruler (client/canvas/layers/tokens.mjs).
     */
    static showToolsMenu(_menuBar, anchorEl) {
        const { x, y } = CombatBarManager._anchorPointFor(anchorEl);

        const useTool = (tool, label) => async () => {
            try {
                await ui.controls?.activate?.({ control: 'tokens', tool });
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Combat Bar: Error activating ${label}`, error?.message || error, false, false);
            }
        };

        const core = [
            {
                name: 'Select Tokens',
                icon: 'fa-solid fa-expand',
                callback: useTool('select', 'Select Tokens')
            },
            {
                name: 'Select Targets',
                icon: 'fa-solid fa-bullseye',
                callback: useTool('target', 'Select Targets')
            },
            {
                name: 'Clear All Targets',
                // Same icon and the same one-liner as the toolbar tool of this
                // name (manager-toolbar.js), so the two cannot drift.
                icon: 'fa-regular fa-circle-xmark',
                callback: () => {
                    try {
                        canvas?.tokens?.setTargets?.([], { mode: 'replace' });
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error clearing targets', error?.message || error, false, false);
                    }
                }
            },
            {
                name: 'Measure Distance',
                icon: 'fa-solid fa-ruler',
                callback: useTool('ruler', 'Measure Distance')
            }
        ];

        UIContextMenu.show({
            id: 'blacksmith-combat-tools-menu',
            x,
            y,
            zones: { core }
        });
    }

    /**
     * The COMBATANTS menu -- what acts on the tokens rather than on the encounter
     * record. Reading hit points, then changing what is on the canvas.
     */
    static showTokensMenu(_menuBar, anchorEl) {
        if (!game.user.isGM) return;

        const { x, y } = CombatBarManager._anchorPointFor(anchorEl);
        const a = CombatBarManager.getBarActions();
        const combat = CombatBarManager.getActiveCombat();

        const gm = [
            { name: a.deployParty.name, icon: a.deployParty.icon, callback: a.deployParty.run }
        ];
        gm.push({
            // Moved here from the Encounter menu: it acts on tokens, not on the
            // encounter record.
            name: 'Clear Movement Histories',
            icon: 'fa-solid fa-shoe-prints',
            disabled: !combat?.combatants?.size,
            callback: async () => {
                try {
                    await combat.clearMovementHistories();
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error clearing movement histories', error?.message || error, false, false);
                }
            }
        });

        gm.push({ separator: true });
        // Shared names now: these are bar buttons as well as menu rows.
        gm.push({ name: a.viewPartyHealth.name, icon: a.viewPartyHealth.icon, callback: a.viewPartyHealth.run });
        gm.push({ name: a.viewNpcHealth.name, icon: a.viewNpcHealth.icon, callback: a.viewNpcHealth.run });
        gm.push({ name: a.viewCanvasHealth.name, icon: a.viewCanvasHealth.icon, callback: a.viewCanvasHealth.run });

        gm.push({ separator: true });
        // Menu-local label again; the button row keeps "Reveal Hidden".
        gm.push({ name: 'Reveal Hidden NPCs', icon: a.revealHidden.icon, callback: a.revealHidden.run });
        gm.push({ name: a.removeParty.name, icon: a.removeParty.icon, callback: a.removeParty.run });
        gm.push({ name: a.removeMonsters.name, icon: a.removeMonsters.icon, callback: a.removeMonsters.run });
        gm.push({ name: a.removeNpcs.name, icon: a.removeNpcs.icon, callback: a.removeNpcs.run });

        UIContextMenu.show({
            id: 'blacksmith-combat-tokens-menu',
            x,
            y,
            zones: { gm }
        });
    }

    /**
     * Whether a combatant counts as dead for the bar's purposes.
     *
     * Delegates rather than deciding. This used to hold its own copy of the rule, and
     * a copy is exactly how the bar came to draw a skull over a combatant the tracker
     * was still about to give a turn to. `DefeatedManager.isDead` is the module's one
     * definition -- see THE DEFINITION in `manager-defeated.js`. Kept as a method here
     * because the strip and the Graveyard both call it by this name.
     */
    static isCombatantDead(combatant) {
        return DefeatedManager.isDead(combatant);
    }

    /**
     * The dead who are currently hidden from the strip. Empty unless the
     * "hide dead" setting is on, since otherwise they are still on the bar.
     */
    static getGraveyardCombatants() {
        const combat = CombatBarManager.getActiveCombat();
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
     * bar, so clicking one opens that combatant's own menu - the same menu a
     * right-click on its portrait would give, Pan to Token included.
     */
    static showGraveyardMenu(menuBar, anchorEl) {
        const dead = CombatBarManager.getGraveyardCombatants();
        if (!dead.length) return;

        const { x, y } = CombatBarManager._anchorPointFor(anchorEl);
        const MENU_ID = 'blacksmith-combat-graveyard-menu';

        const core = dead.map(combatant => {
            const actor = combatant.actor;
            const portrait = actor?.img || combatant.token?.texture?.src
                || 'modules/coffee-pub-blacksmith/images/portraits/portrait-noimage.webp';
            return {
                name: combatant.token?.name || actor?.name || 'Unknown',
                icon: `<img class="context-menu-item-portrait" src="${portrait}" alt="">`,
                // Left-click pans, the same as clicking a portrait on the strip.
                // A graveyard row stands in for a portrait that is not on the bar,
                // so it should answer to the same two clicks.
                callback: async () => {
                    CombatBarManager.panToCombatant(menuBar, combatant.id, { selectToken: game.user.isGM });
                }
            };
        });

        UIContextMenu.show({
            id: MENU_ID,
            x,
            y,
            zones: { core }
        });

        // Right-click opens the combatant's own menu. Attached to the rendered
        // rows because UIContextMenu items carry a click callback and nothing
        // else -- there is no contextmenu hook to pass in. The portraits get this
        // from a delegated document handler, but that one is scoped to
        // `.blacksmith-menubar-secondary .combat-portrait-container`, and these
        // rows are in document.body.
        //
        // Index-mapped to `dead` because these rows are built from it one-for-one
        // with no separators between them; a separator would shift the mapping.
        const menuEl = document.getElementById(MENU_ID);
        const rows = menuEl ? [...menuEl.querySelectorAll('.context-menu-item')] : [];
        rows.forEach((row, i) => {
            const combatant = dead[i];
            if (!combatant) return;
            row.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation();
                // Close the graveyard first, or two menus sit open at once.
                UIContextMenu.close(MENU_ID);
                CombatBarManager.showCombatantPortraitContextMenu(
                    menuBar, combatant.id, event.clientX, event.clientY
                );
            });
        });
    }

    static getCombatantContext(combatantId) {
        const combat = CombatBarManager.getActiveCombat();
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
        const combat = CombatBarManager.getActiveCombat();
        if (!combat || !game.user.isGM) return;

        const { x, y } = CombatBarManager._anchorPointFor(anchorEl);
        const unrolled = combat.combatants.filter(c => c.initiative === null).length;

        // No Roll All: it and Roll Remaining both roll everything still unrolled,
        // so the pair was two labels for one outcome.
        const gm = [
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
        // No early return on a missing combat: Add All Remaining is precisely the
        // row you want when there is not one yet -- it creates the encounter with
        // whatever is standing. Rows needing a combat drop out instead.
        const combat = CombatBarManager.getActiveCombat();

        const { x, y } = CombatBarManager._anchorPointFor(anchorEl);
        const a = CombatBarManager.getBarActions();

        // Labels are given HERE rather than taken from the action, so the
        // out-of-combat button row keeps its own wording. getBarActions is shared;
        // renaming in it changes buttons nobody asked to change.
        const gm = [
            { name: a.toggleTracker.name, icon: a.toggleTracker.icon, callback: a.toggleTracker.run }
        ];
        if (a.quickEncounter.available()) {
            gm.push({ name: a.quickEncounter.name, icon: a.quickEncounter.icon, callback: a.quickEncounter.run });
        }
        gm.push({ name: 'View Current Statistics', icon: a.statistics.icon, callback: a.statistics.run });
        gm.push({ name: 'View Pending Experience', icon: a.experience.icon, callback: a.experience.run });

        gm.push({ separator: true });
        gm.push({
            name: 'Add Remaining Players',
            icon: 'fa-solid fa-users',
            callback: () => menuAddRemaining('party', 'Add Remaining Players')
        });
        gm.push({
            name: 'Add Remaining NPCs',
            icon: 'fa-solid fa-dragon',
            callback: () => menuAddRemaining('npc', 'Add Remaining NPCs')
        });
        gm.push({
            name: 'Add All Remaining',
            icon: 'fa-solid fa-swords',
            callback: () => menuAddRemaining('all', 'Add All Remaining')
        });

        if (combat) {
            const isLinked = !!combat.scene;
            gm.push({ separator: true });
            gm.push({
                name: 'Delete Encounter',
                icon: 'fa-solid fa-trash',
                callback: async () => {
                    try {
                        // endCombat, not delete: it is the path carrying core's
                        // confirmation prompt.
                        await combat.endCombat();
                    } catch (error) {
                        postConsoleAndNotification(MODULE.NAME, 'Combat Bar: Error deleting encounter', error?.message || error, false, false);
                    }
                }
            });
            gm.push({
                // One toggle, two truths -- an unlinked encounter needs the
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
            const combat = CombatBarManager.getActiveCombat();
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
            const combat = CombatBarManager.getActiveCombat();
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
        // The ghost is the portrait in flight, so it wears the portrait's shape. It lives on
        // <body>, outside the bar, so it cannot inherit the container's radius and is told
        // directly. A round ghost dragged off a square portrait reads as a rendering fault.
        ghost.className = `combat-initiative-drag-ghost ${drag.element.classList.contains('shape-square') ? 'shape-square' : 'shape-round'}`;
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
