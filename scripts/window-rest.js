// ==================================================================
// ===== WINDOW-REST – the GM's rest window =========================
// ==================================================================
//
// Where a rest starts. The GM chooses the kind of rest, who is taking it, and
// whether food and water are tracked for this one; pressing the button posts one
// pre-rest card per character and this window is done.
//
// IT STARTS A REST AND NOTHING ELSE. No rules run here: the card's Rest button calls
// `actor.longRest()` and dnd5e does every calculation, exactly as it does when a
// player rests from their own sheet. This window replaces the system's rest *dialog*,
// which is a question, not a mechanic.
//
// WHY IT EXISTS RATHER THAN THE SYSTEM'S. dnd5e's party rest posts a request card and
// offers no way to say "and track rations tonight", because rations are not its
// concern. Ours is the one place a GM sets up a night, so it is also the only place
// those choices can be made per rest rather than per world.
//
// It renders `window-template.hbs` -- the shared frame -- deliberately. The window
// framework not owning the frame is the CRITICAL item on TODO.md, and of 15 windows
// only 4 use the shared template. A new window that hand-rolled its own would be a
// fifth copy to migrate later; this one is not.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';
import { registerWindow } from './api-windows.js';
import { postBeforeCard } from './cards-rest.js';

const APP_ID = 'blacksmith-rest-window';

export class RestWindow extends BlacksmithWindowBaseV2 {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: APP_ID,
            classes: ['blacksmith-rest-window'],
            position: { width: 460, height: 'auto' },
            window: { title: 'Rest', resizable: true, minimizable: true, icon: 'fa-solid fa-campground' },
            // Width is fixed because the roster rows are a list, not a table -- there
            // is nothing to gain by widening. Height is the axis worth dragging when a
            // large party pushes the roster past the fold.
            windowSizeConstraints: { minWidth: 460, maxWidth: 460, minHeight: 380 }
        }
    );

    static PARTS = {
        body: { template: `modules/${MODULE.ID}/templates/window-template.hbs` }
    };

    // Stated rather than inherited, as every other window rendering the shared frame
    // does — it is what `_getRoot()` falls back to.
    static ROOT_CLASS = 'blacksmith-window-template-root';

    /** The single instance, so reopening does not stack windows. */
    static _ref = null;

    // Handlers receive the instance as their third argument, so they never resolve a
    // shared static reference. See window-base.js.
    static ACTION_HANDLERS = {
        'rest-begin': (_event, _target, win) => win?._begin(),
        'rest-cancel': (_event, _target, win) => win?.close(),
        'rest-select-all': (_event, _target, win) => win?._setAllSelected(true),
        'rest-select-none': (_event, _target, win) => win?._setAllSelected(false)
    };

    /**
     * Who could be resting.
     *
     * The primary party when there is one, because that is the roster a GM has already
     * curated and the one dnd5e's own party rest uses. Falling back to every
     * player-owned character means a world that has not set a primary party still gets
     * a usable window rather than an empty one.
     *
     * @returns {Array<Actor>}
     */
    static getCandidates() {
        const members = game.actors?.party?.system?.members;
        const fromParty = Array.isArray(members)
            ? members.map((m) => m?.actor).filter((a) => a?.type === 'character')
            : [];

        const roster = fromParty.length
            ? fromParty
            : (game.actors?.contents ?? []).filter((a) => a?.type === 'character' && a.hasPlayerOwner);

        // A SELECTED TOKEN IS AN INSTRUCTION. A GM who has picked tokens out on the
        // canvas has already said who this rest is for, so anything they selected joins
        // the roster even when the party list does not know about it -- an NPC ally
        // resting with the group is exactly the case the primary party misses.
        //
        // Vehicles are excluded because dnd5e refuses to rest them outright
        // (`initiateRest` returns immediately for one), so offering it would be a
        // control that does nothing.
        const seen = new Set(roster.map((a) => a.uuid));
        for (const actor of this.getSelectedActors()) {
            if (seen.has(actor.uuid)) continue;
            seen.add(actor.uuid);
            roster.push(actor);
        }

        return roster;
    }

    /**
     * The actors behind the currently selected tokens, minus the ones that cannot rest.
     * @returns {Array<Actor>}
     */
    static getSelectedActors() {
        const actors = [];
        const seen = new Set();

        for (const token of canvas?.tokens?.controlled ?? []) {
            const actor = token?.actor;
            if (!actor || actor.system?.isVehicle || seen.has(actor.uuid)) continue;
            seen.add(actor.uuid);
            actors.push(actor);
        }

        return actors;
    }

    async getData() {
        const esc = foundry.utils.escapeHTML;
        const candidates = RestWindow.getCandidates();

        // Defaults come from the world settings, so the window opens saying what the
        // table has already decided and the GM only touches what is different tonight.
        const trackFood = getSettingSafely(MODULE.ID, 'restTrackFood', false);
        const trackWater = getSettingSafely(MODULE.ID, 'restTrackWater', false);

        // NEW DAY DEFAULTS TO WHAT THE SYSTEM DOES, read from its own configuration
        // rather than assumed. `restTypes.long.newDay` is true (`dnd5e.mjs:46457`) and
        // `initiateRest` defaults to it (`dnd5e.mjs:38152`), so an unticked box here
        // was not a neutral default -- it sent `newDay: false` and OVERRODE the
        // system, silently skipping every daily, dawn and dusk item use
        // (`dnd5e.mjs:38542`) on an ordinary night.
        // Every one of these is read from the system's own long-rest configuration
        // rather than assumed, for the reason given above: this window sends its config
        // explicitly, so a box left unticked by our own default silently OVERRIDES what
        // dnd5e would have done.
        //
        // All three are long-rest only -- `restTypes.short` declares none of them
        // (`dnd5e.mjs:46434`) -- which is why `_onRender` hides them for a short rest
        // rather than sending values dnd5e would ignore.
        const restConfig = CONFIG.DND5E?.restTypes?.long ?? {};
        const newDay = restConfig.newDay === true;
        const recoverTemp = restConfig.recoverTemp === true;
        const recoverTempMax = restConfig.recoverTempMax === true;

        // AUTO SPEND IS THE SHORT REST'S OPTION, and the system leaves it off
        // (`restTypes.short` declares no `autoHD`, so `initiateRest` defaults it to
        // false at `dnd5e.mjs:38154`). Off is also the interesting default here: it is
        // what hands the choice to the player, one die at a time, on their own card.
        const autoHD = CONFIG.DND5E?.restTypes?.short?.autoHD === true;

        // WHAT THE GM SELECTED WINS. With tokens picked out on the canvas, only those
        // start ticked; with none, everybody does. Selecting nobody is not a request to
        // rest nobody -- it is the ordinary case of not having touched the canvas.
        const selected = new Set(RestWindow.getSelectedActors().map((a) => a.uuid));
        const preselect = (uuid) => (selected.size === 0) || selected.has(uuid);

        const roster = candidates.length
            ? candidates.map((actor) => {
                const hp = actor.system?.attributes?.hp ?? {};
                const value = Number(hp.value ?? 0);
                const max = Number(hp.max ?? 0);
                const hurt = max > 0 && value < max;

                return `
                    <label class="blacksmith-rest-member">
                        <input type="checkbox" name="rest-member" value="${esc(actor.uuid)}" ${preselect(actor.uuid) ? 'checked' : ''}>
                        <img src="${esc(actor.img ?? 'icons/svg/mystery-man.svg')}" alt="">
                        <span class="blacksmith-rest-member-name">${esc(actor.name)}</span>
                        <span class="blacksmith-rest-member-hp${hurt ? ' is-hurt' : ''}">${max > 0 ? `${value} / ${max}` : ''}</span>
                    </label>`;
            }).join('')
            : '<div class="blacksmith-rest-empty">No player characters were found to rest.</div>';

        const bodyContent = `
            <div class="blacksmith-rest-form">
                <div class="blacksmith-window-section">
                    <div class="blacksmith-window-section-header">
                        <i class="fa-solid fa-campground"></i>
                        <span>Rest</span>
                    </div>
                    <div class="blacksmith-field">
                        <select class="blacksmith-input" name="rest-type">
                            <option value="long" selected>Long Rest</option>
                            <option value="short">Short Rest</option>
                        </select>
                    </div>
                    <label class="blacksmith-rest-option blacksmith-rest-new-day">
                        <input type="checkbox" name="rest-new-day" ${newDay ? 'checked' : ''}>
                        <i class="fa-solid fa-sun"></i>
                        <span>Begin a new day</span>
                    </label>
                </div>

                <div class="blacksmith-window-section blacksmith-rest-shortrest">
                    <div class="blacksmith-window-section-header">
                        <i class="fa-solid fa-heart-pulse"></i>
                        <span>Hit Dice</span>
                    </div>
                    <label class="blacksmith-rest-option">
                        <input type="checkbox" name="rest-auto-hd" ${autoHD ? 'checked' : ''}>
                        <i class="fa-solid fa-dice-d6"></i>
                        <span>Auto Spend HD</span>
                    </label>
                    <div class="blacksmith-rest-note">Automatically spend hit dice until they run out or health is
                        full. Leave it off and each character chooses their own dice, one at a time, from their card.</div>
                </div>

                <div class="blacksmith-window-section blacksmith-rest-hitpoints">
                    <div class="blacksmith-window-section-header">
                        <i class="fa-solid fa-heart"></i>
                        <span>Hit Points</span>
                    </div>
                    <label class="blacksmith-rest-option">
                        <input type="checkbox" name="rest-recover-temp" ${recoverTemp ? 'checked' : ''}>
                        <i class="fa-solid fa-shield-halved"></i>
                        <span>Remove Temp HP</span>
                    </label>
                    <label class="blacksmith-rest-option">
                        <input type="checkbox" name="rest-recover-temp-max" ${recoverTempMax ? 'checked' : ''}>
                        <i class="fa-solid fa-heart-circle-plus"></i>
                        <span>Recover Max HP</span>
                    </label>
                    <div class="blacksmith-rest-note">Remove any adjustments to a character's maximum Hit Points.</div>
                </div>

                <div class="blacksmith-window-section">
                    <div class="blacksmith-window-section-header">
                        <i class="fa-solid fa-users"></i>
                        <span>Who is resting</span>
                        <span class="blacksmith-rest-roster-tools">
                            <button type="button" class="blacksmith-window-btn-secondary" data-action="rest-select-all"
                                data-tooltip="Select everyone">All</button>
                            <button type="button" class="blacksmith-window-btn-secondary" data-action="rest-select-none"
                                data-tooltip="Select nobody">None</button>
                        </span>
                    </div>
                    ${roster}
                </div>

                <div class="blacksmith-window-section blacksmith-rest-provisions">
                    <div class="blacksmith-window-section-header">
                        <i class="fa-solid fa-drumstick-bite"></i>
                        <span>Provisions</span>
                    </div>
                    <label class="blacksmith-rest-option">
                        <input type="checkbox" name="rest-track-food" ${trackFood ? 'checked' : ''}>
                        <i class="fa-solid fa-drumstick-bite"></i>
                        <span>Track food</span>
                    </label>
                    <label class="blacksmith-rest-option">
                        <input type="checkbox" name="rest-track-water" ${trackWater ? 'checked' : ''}>
                        <i class="fa-solid fa-droplet"></i>
                        <span>Track water</span>
                    </label>
                    <div class="blacksmith-rest-note">Applies to this rest only. A character with nothing to eat or
                        drink rolls Survival to forage, from their own card.</div>
                </div>
            </div>`;

        return {
            appId: APP_ID,
            showOptionBar: false,
            showHeader: true,
            headerIcon: 'fa-solid fa-campground',
            windowTitle: 'Rest',
            subtitle: 'Post a rest card to everyone who is resting',
            showTools: false,
            showActionBar: true,
            bodyContent,
            actionBarLeft: '<button type="button" class="blacksmith-window-btn-secondary" data-action="rest-cancel"><i class="fa-solid fa-xmark"></i> Cancel</button>',
            actionBarRight: '<button type="button" class="blacksmith-window-btn-primary" data-action="rest-begin"><i class="fa-solid fa-campground"></i> Begin Rest</button>'
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);

        const root = this._getRoot();
        if (!root) return;

        // A SHORT REST HAS NO NEW DAY, NO HIT POINT OPTIONS AND NO RATIONS, so those
        // controls must not sit there looking live -- `restTypes.short` declares none
        // of them. Leaving them visible-but-ignored is the kind of small lie that
        // makes a GM distrust the rest of the form: they tick a box, watch nothing
        // happen, and are right to wonder what else does nothing.
        const type = root.querySelector('[name="rest-type"]');
        const LONG_REST_ONLY = ['.blacksmith-rest-provisions', '.blacksmith-rest-hitpoints'];
        // And the reverse: hit dice are the SHORT rest's business. A long rest restores
        // hit points outright, so spending dice on one burns a resource for nothing.
        const SHORT_REST_ONLY = ['.blacksmith-rest-shortrest'];

        // NEW DAY BELONGS TO BOTH RESTS, with a different default for each: dnd5e sets
        // it for a long rest and not for a short one (`restTypes.long.newDay`, and no
        // such key on `short`). A short rest can still start a new day -- an all-night
        // watch broken by an hour's rest at dawn -- so the control stays; only its
        // default changes.
        //
        // Reset on a type CHANGE rather than on every sync, so the GM's own tick
        // survives an unrelated re-render.
        const newDayBox = root.querySelector('[name="rest-new-day"]');
        let lastType = type?.value ?? 'long';

        const sync = () => {
            const isLong = type?.value !== 'short';
            for (const selector of LONG_REST_ONLY) {
                root.querySelector(selector)?.classList.toggle('is-hidden', !isLong);
            }
            for (const selector of SHORT_REST_ONLY) {
                root.querySelector(selector)?.classList.toggle('is-hidden', isLong);
            }
        };

        const onTypeChange = () => {
            if (type?.value !== lastType) {
                lastType = type?.value;
                if (newDayBox) {
                    newDayBox.checked = CONFIG.DND5E?.restTypes?.[lastType]?.newDay === true;
                }
            }
            sync();
        };

        // Rebound on every render, and the element is new each time, so listeners
        // cannot stack on the old one.
        type?.addEventListener('change', onTypeChange);
        sync();
    }

    _setAllSelected(selected) {
        const root = this._getRoot();
        for (const box of root?.querySelectorAll('input[name="rest-member"]') ?? []) {
            box.checked = selected;
        }
    }

    /**
     * Post one pre-rest card per selected character.
     *
     * PROVISIONS ARE ONLY MEANINGFUL FOR A LONG REST -- a short rest is an hour by the
     * tea, not a day's rations -- so the choices are recorded as `false` on a short
     * rest rather than carried and ignored. The card would otherwise say it was
     * tracking food for a rest that never consumes any.
     */
    async _begin() {
        const root = this._getRoot();
        if (!root) return;

        const uuids = [...root.querySelectorAll('input[name="rest-member"]:checked')].map((box) => box.value);
        if (!uuids.length) {
            ui.notifications?.warn('Nobody is selected to rest.');
            return;
        }

        const restType = root.querySelector('[name="rest-type"]')?.value === 'short' ? 'short' : 'long';
        const isLong = restType === 'long';

        const ticked = (name) => isLong && root.querySelector(`[name="${name}"]`)?.checked === true;

        const restOptions = {
            // NOT gated on the rest type: a short rest may start a new day too, so this
            // is read exactly as the GM left it.
            newDay: root.querySelector('[name="rest-new-day"]')?.checked === true,
            recoverTemp: ticked('rest-recover-temp'),
            recoverTempMax: ticked('rest-recover-temp-max'),
            trackFood: ticked('rest-track-food'),
            trackWater: ticked('rest-track-water'),
            // The one option that belongs to the OTHER kind of rest, so it is read
            // under the opposite condition.
            autoHD: !isLong && root.querySelector('[name="rest-auto-hd"]')?.checked === true
        };

        // ONE ID FOR THE WHOLE REST, stamped on every card. It is what lets the clock
        // wait for the last sleeper: without it each acceptance looks like a lone
        // character resting, and a five-character night moves the clock five times.
        // See the grouping note in `manager-rest.js`.
        const restId = foundry.utils.randomID();

        let posted = 0;
        for (const uuid of uuids) {
            const actor = await fromUuid(uuid).catch(() => null);
            if (!actor) continue;

            try {
                if (await postBeforeCard({ actor, restType, restOptions, restId })) posted++;
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Rest: Could not post a rest card for ${actor.name}`, error, false, false);
            }
        }

        if (!posted) {
            ui.notifications?.warn('No rest cards could be posted.');
            return;
        }

        postConsoleAndNotification(MODULE.NAME, `Rest: Posted ${posted} rest card(s)`, '', true, false);
        this.close();
    }

    /** Open the window, reusing the instance if it is already up. */
    static open() {
        if (!game.user?.isGM) {
            ui.notifications?.warn('Only a GM can start a rest.');
            return null;
        }

        RestWindow._ref ??= new RestWindow();
        RestWindow._ref.render(true);
        return RestWindow._ref;
    }

}

/**
 * Called from `blacksmith.js` rather than at import time, so the window registry is
 * guaranteed to exist. A top-level call would run whenever this module first happened
 * to be imported, which is an ordering nobody controls -- and the clock imports it
 * lazily, on a click.
 */
export function registerRestWindow() {
    registerWindow(APP_ID, {
        moduleId: MODULE.ID,
        title: 'Rest',
        open: () => RestWindow.open()
    });
}

export { APP_ID as REST_WINDOW_ID };
