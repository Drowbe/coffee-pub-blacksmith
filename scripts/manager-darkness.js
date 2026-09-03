// ==================================================================
// ===== DARKNESS DRIVER ============================================
// ==================================================================
//
// Makes a scene's darkness follow the world clock: bright at midday, dark at
// night, with a smooth twilight either side.
//
// This is the one capability core does not have. `scene.environment.darknessLevel`
// exists and the canvas reacts to it, but nothing moves it as time passes -- so a
// world without a module doing this keeps whatever value each scene last had,
// frozen, forever.
//
// ONE-WAY. It reads settings and the world clock and writes scene darkness, and it
// imports nothing from the menubar. It borrows `WorldClockManager.getCurrentDayFraction()`
// and `getHorizons()` rather than computing its own, because two answers to "what time
// of day is it" that can disagree is exactly the bug this is trying not to have.
// The arrow runs darkness -> clock and never back.
//
// The Scene Config tab (`ui-scene-geography.js`) imports `FLAG` and `isEnabledForScene`
// so the checkbox it draws reads the same flag this file writes. That is the only
// inbound import, and it is deliberately read-only: the checkbox persists through
// Foundry's own form submission, not through a call into here.
//
// See documentation/architecture/architecture-worldclock.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { WorldClockManager } from './manager-worldclock.js';
import { DialogAPI } from './api-dialog.js';

class DarknessManager {

    /** Scene flag marking a scene as following the clock. */
    static FLAG = 'darknessFollowsClock';

    /**
     * How much the computed darkness must differ from the stored value before it is
     * worth a database write.
     *
     * Foundry's darkness is a 0..1 alpha, so 0.01 is a hundredth of the whole range
     * and far below what anyone can see. Without this gate a GM stepping through the
     * flat middle of the afternoon would issue a scene update per click that changed
     * nothing.
     */
    static EPSILON = 0.01;

    /**
     * How long the canvas takes to reach a new darkness, in milliseconds.
     *
     * Core's own default is 10000, which is right for the scene-controls buttons that
     * mean "it is day now" but far too slow for a clock step -- the GM would click
     * again long before the first transition finished. Consecutive updates terminate
     * the previous animation rather than queueing, so a rapid series of steps chases
     * the newest value instead of playing them all back.
     */
    static ANIMATE_MS = 2000;

    // ==============================================================
    // ===== LIFECYCLE ==============================================
    // ==============================================================

    static initialize() {
        HookManager.registerHook({
            name: 'updateWorldTime',
            description: 'Darkness: Move the active scene to match the world clock',
            context: 'worldclock-darkness',
            priority: 4,
            callback: () => this.applyToActiveScene()
        });

        // Darkness lives on the scene, so a world-level driver has to reassert itself
        // whenever the viewed scene changes. Only the active scene is ever driven --
        // updating every scene in the world on every time change would be a write per
        // scene for scenes nobody is looking at.
        HookManager.registerHook({
            name: 'canvasReady',
            description: 'Darkness: Re-apply the clock darkness after a scene change',
            context: 'worldclock-darkness',
            priority: 4,
            callback: () => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                void this.applyToActiveScene();
                // Asked here rather than at `ready` because the question is about the scene
                // in front of the GM, and asking it on load would mean asking about whichever
                // scene the world happened to open on. Not awaited: a modal the GM leaves
                // sitting must not hold up the rest of the canvas hook chain.
                void this.promptIfUndecided(game.scenes?.active ?? canvas?.scene);
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        // The Scene Config checkbox is persisted by Foundry's own form submission, so
        // nothing in this file runs when a GM ticks it -- and with the curve flat across
        // most of the day, the next clock step very often computes no change either. The
        // scene would then sit at its old darkness until the next twilight, which reads
        // as the checkbox not working. Reacting to the flag landing is what makes the
        // control take effect when it is used, whoever wrote it.
        HookManager.registerHook({
            name: 'updateScene',
            description: 'Darkness: Apply at once when a scene is set to follow the clock',
            context: 'worldclock-darkness',
            priority: 4,
            callback: (scene, changed) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                // Only when the OPT-IN itself moved. This driver's own writes are scene
                // updates too, so reacting to any scene change would re-enter on every
                // one it made.
                const flags = changed?.flags?.[MODULE.ID];
                if (!flags || !(this.FLAG in flags)) return;
                // Only the driven scene. A GM ticking the box on some OTHER scene's sheet
                // must not provoke a forced write to the one on screen -- `force` skips the
                // epsilon, so that would be a database write that changes nothing.
                if (scene?.id !== (game.scenes?.active ?? canvas?.scene)?.id) return;
                void this.applyToActiveScene({ force: true });
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        WorldClockManager.registerOptionProvider(() => this.getContextMenuItems());

        postConsoleAndNotification(MODULE.NAME, "Darkness: Driver registered", "", true, false);
    }

    // ==============================================================
    // ===== THE CURVE ==============================================
    // ==============================================================

    /**
     * How dark the world is at a given point in the day.
     *
     * Flat through the day, flat through the night, and a smoothed ramp across each
     * twilight. A straight line from sunrise to sunset was the obvious first shape
     * and is wrong: it would make two in the afternoon perceptibly dimmer than noon,
     * which reads as a fault rather than as time passing. Real light does almost
     * nothing for hours and then changes fast twice a day.
     *
     * The ramp is CENTRED on the horizon rather than starting at it, so with a
     * one-hour twilight and a 06:00 sunrise the change runs 05:30 to 06:30 and is
     * half done at 06:00 -- the same moment the sun sits on the horizon in the
     * menubar panel. A ramp starting at sunrise would leave the world pitch black at
     * the moment the panel shows dawn.
     *
     * @param {number} dayFraction 0..1
     * @returns {number} Darkness, 0..1.
     */
    static computeDarkness(dayFraction) {
        const day = this._clamp01(Number(getSettingSafely(MODULE.ID, 'worldClockDarknessDay', 0)));
        const night = this._clamp01(Number(getSettingSafely(MODULE.ID, 'worldClockDarknessNight', 0.85)));

        const { sunrise, sunset } = WorldClockManager.getHorizons();
        const half = this._halfTwilight();

        // Zero-length twilight is a legitimate setting -- night falls like a switch --
        // and it also removes the ramp's only division, so handle it before dividing.
        if (half <= 0) {
            const isDay = (dayFraction >= sunrise) && (dayFraction < sunset);
            return isDay ? day : night;
        }

        const toSunrise = this._circularDelta(dayFraction, sunrise);
        if (Math.abs(toSunrise) <= half) {
            return this._lerp(night, day, this._smoothstep((toSunrise + half) / (half * 2)));
        }

        const toSunset = this._circularDelta(dayFraction, sunset);
        if (Math.abs(toSunset) <= half) {
            return this._lerp(day, night, this._smoothstep((toSunset + half) / (half * 2)));
        }

        return ((dayFraction >= sunrise) && (dayFraction < sunset)) ? day : night;
    }

    /** Half the twilight, as a fraction of the day. */
    static _halfTwilight() {
        const minutes = Number(getSettingSafely(MODULE.ID, 'worldClockTwilightMinutes', 60));
        if (!Number.isFinite(minutes) || minutes <= 0) return 0;

        const days = game.time?.calendar?.days;
        if (!days) return 0;

        // The calendar's own minutes-per-day, not 1440 -- the same reason the clock
        // never hardcodes 86400.
        const minutesPerDay = days.minutesPerHour * days.hoursPerDay;
        if (!(minutesPerDay > 0)) return 0;

        // Capped at a quarter day each side, so that a twilight longer than the day
        // cannot make the two ramps overlap and fight over the same moment.
        return Math.min((minutes / minutesPerDay) / 2, 0.25);
    }

    /**
     * Shortest signed distance from `b` to `a` around a day that wraps at midnight.
     *
     * Needed because a twilight can straddle midnight: with a 00:20 sunrise and a
     * one-hour twilight, 23:55 is five minutes BEFORE dawn, not twenty-three hours
     * after it. A plain subtraction gets that exactly backwards.
     *
     * @returns {number} -0.5..0.5
     */
    static _circularDelta(a, b) {
        let delta = a - b;
        if (delta > 0.5) delta -= 1;
        if (delta < -0.5) delta += 1;
        return delta;
    }

    /** Ease in and out, so the ramp has no corners at either end. */
    static _smoothstep(t) {
        const x = this._clamp01(t);
        return x * x * (3 - (2 * x));
    }

    static _lerp(from, to, t) {
        return from + ((to - from) * t);
    }

    static _clamp01(value) {
        if (!Number.isFinite(value)) return 0;
        return Math.min(Math.max(value, 0), 1);
    }

    // ==============================================================
    // ===== PER-SCENE OPT-IN =======================================
    // ==============================================================

    /**
     * The GM's answer for a scene, or `undefined` when they have never been asked.
     *
     * THE FLAG IS THREE-VALUED AND THE THIRD VALUE IS THE USEFUL ONE. `undefined` is
     * "nobody has decided", which is not the same as `false`, "the GM decided no" --
     * and only the first of those is worth asking about. Reading the flag through a
     * `!!` coerces them together and throws that distinction away, which is why this
     * accessor exists alongside `isEnabledForScene` rather than being folded into it.
     *
     * @returns {boolean|undefined}
     */
    static getSceneSetting(scene) {
        const value = scene?.getFlag?.(MODULE.ID, this.FLAG);
        return typeof value === 'boolean' ? value : undefined;
    }

    /** Whether the GM has answered for this scene either way. */
    static isDecidedForScene(scene) {
        return this.getSceneSetting(scene) !== undefined;
    }

    /**
     * Whether a scene follows the clock.
     *
     * Opt-IN, not opt-out. Enabling this on every scene by default would black out
     * every dungeon, cellar and windowless tavern in the world the first time the
     * clock ticked past sunset, which is both wrong and alarming. So an undecided
     * scene is not driven -- but it is not *settled* either, and `promptIfUndecided`
     * is what closes that gap rather than leaving it to be discovered.
     */
    static isEnabledForScene(scene) {
        return this.getSceneSetting(scene) === true;
    }

    static async setEnabledForScene(scene, enabled) {
        if (!scene || !game.user?.isGM) return;

        try {
            await scene.setFlag(MODULE.ID, this.FLAG, !!enabled);
            if (enabled) await this.applyToActiveScene({ force: true });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Darkness: Failed to change scene darkness control", error, false, false);
        }
    }

    // ==============================================================
    // ===== SCENE PREREQUISITES ====================================
    // ==============================================================

    /**
     * Scene settings that have to be right for a driven scene to LOOK driven.
     *
     * Moving `darknessLevel` is necessary and not sufficient. A scene can accept every
     * write this driver makes and still show the players nothing, three different ways,
     * and each of them looks exactly like "the darkness feature is broken":
     *
     *   - **Darkness Level Lock** makes core delete `darknessLevel` from our update, so
     *     the write is discarded outright. This is the hard blocker.
     *   - **Global Illumination** off means daylight lights nothing: the scene sits dark
     *     all day and only token light sources show. Darkness moves, and midday looks
     *     like midnight.
     *   - **Token Vision** off means players see the whole scene regardless of darkness.
     *     Darkness moves and nobody can tell.
     *
     * Each entry says how to test whether a scene already satisfies it and what to write
     * if not. **Nothing here is applied without the GM ticking it** -- these are somebody
     * else's scene settings, and a module that quietly rewrites three of them because it
     * was switched on is a module that cannot be trusted with a world.
     */
    static PREREQUISITES = [
        {
            id: 'globalLight',
            label: 'Turn on Global Illumination',
            note: 'Without it the scene stays dark by day and only token lights show.',
            isSatisfied: (scene) => scene?.environment?.globalLight?.enabled === true,
            buildPatch: (scene) => {
                const patch = { 'environment.globalLight.enabled': true };

                // ENABLING GI ALONE IS WORSE THAN NOT ENABLING IT. The threshold
                // `globalLight.darkness.max` is the darkness above which core switches
                // global illumination off, and it defaults to 1 -- meaning "never switch
                // off". A scene with GI on and the default threshold is fully lit at
                // midnight, so the driver would move darkness all night and the players
                // would see essentially nothing change.
                //
                // The threshold is derived from OUR OWN curve rather than picked: halfway
                // between the configured day and night darkness is the middle of the
                // twilight ramp, so global light fades out as the sun goes down instead of
                // at some unrelated number. Only written when the threshold is still the
                // untouched default -- a GM who has set one has made a decision.
                const current = Number(scene?.environment?.globalLight?.darkness?.max);
                if (!Number.isFinite(current) || current >= 1) {
                    const day = this._clamp01(Number(getSettingSafely(MODULE.ID, 'worldClockDarknessDay', 0)));
                    const night = this._clamp01(Number(getSettingSafely(MODULE.ID, 'worldClockDarknessNight', 0.85)));
                    patch['environment.globalLight.darkness.max'] = this._clamp01((day + night) / 2);
                }
                return patch;
            }
        },
        {
            id: 'darknessLock',
            label: 'Turn off Darkness Level Lock',
            note: 'While it is on, the clock cannot change this scene at all.',
            isSatisfied: (scene) => !scene?.environment?.darknessLock,
            buildPatch: () => ({ 'environment.darknessLock': false })
        },
        {
            id: 'tokenVision',
            label: 'Turn on Token Vision',
            note: 'Without it players see the whole scene however dark it gets.',
            isSatisfied: (scene) => scene?.tokenVision === true,
            buildPatch: () => ({ tokenVision: true })
        }
    ];

    /** The prerequisites this scene does not already satisfy. */
    static getUnmetPrerequisites(scene) {
        if (!scene) return [];
        return this.PREREQUISITES.filter(item => !item.isSatisfied(scene));
    }

    // ==============================================================
    // ===== ASKING =================================================
    // ==============================================================

    /**
     * Scenes a dialog is already open for, so a second `canvasReady` cannot stack one.
     * @type {Set<string>}
     */
    static _asking = new Set();

    /**
     * Ask the GM, once per scene, whether this scene's light should follow the clock.
     *
     * WHY ASK AT ALL. The opt-in cannot be defaulted -- driving every scene blacks out
     * every cellar, and driving none leaves the feature switched off for everybody --
     * so it needs a decision per scene, and until now the only way to give one was a
     * control the author of this module could not himself find. An undecided scene is
     * a question nobody has been asked, so this asks it, at the one moment the answer
     * is obvious: the GM is looking at the scene.
     *
     * BOTH ANSWERS ARE WRITTEN. "No" stores `false` rather than leaving the flag
     * absent, which is the entire reason `getSceneSetting` is three-valued: a stored
     * `false` is a decision and is never asked about again. Dismissing the dialog
     * without answering stores nothing and is asked again next visit -- an unanswered
     * question is not an answer, and silently recording one would be the same
     * conflation this is here to remove.
     */
    static async promptIfUndecided(scene) {
        if (!game.user?.isGM) return;
        if (!scene?.id || !scene.setFlag) return;
        if (this.isDecidedForScene(scene)) return;
        if (!getSettingSafely(MODULE.ID, 'worldClockDarknessAskPerScene', true)) return;
        if (this._asking.has(scene.id)) return;

        this._asking.add(scene.id);
        try {
            const unmet = this.getUnmetPrerequisites(scene);
            const { action, result } = await DialogAPI.wait({
                title: 'Darkness Control',
                content: this._promptContent(scene, unmet),
                buttons: [
                    {
                        action: 'yes',
                        label: 'Yes, follow the clock',
                        icon: 'fa-solid fa-sun',
                        default: true,
                        // Reads the boxes from the form the helper hands back. Runs after the
                        // dialog has closed, so it must not touch the live dialog.
                        callback: (form) => unmet
                            .filter(item => form?.querySelector?.(`input[name="prereq-${item.id}"]`)?.checked)
                            .map(item => item.id)
                    },
                    { action: 'no', label: 'No, leave it alone', icon: 'fa-solid fa-ban' }
                ]
            });

            // Anything that is not one of the two answers is a dismissal, and a dismissal
            // writes nothing. DialogAPI resolves its own CLOSE action here.
            if (action !== 'yes' && action !== 'no') return;

            if (action === 'no') {
                // NOTHING BUT THE FLAG. "No" must not touch global illumination, the lock,
                // or token vision -- the GM declined the feature, which is not permission
                // to reconfigure their scene on the way out.
                await this.setEnabledForScene(scene, false);
                return;
            }

            await this._enableWithPrerequisites(scene, Array.isArray(result) ? result : []);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Darkness: Failed to ask about scene darkness control", error, false, false);
        } finally {
            this._asking.delete(scene.id);
        }
    }

    /**
     * The dialog body: the question, then a checkbox per unmet prerequisite.
     *
     * Only UNMET ones appear. A checkbox offering to turn on something already on is
     * noise, and worse, it invites the GM to read the list as "these are the things
     * this module is about to change" when most of them are already true.
     *
     * Every box is pre-ticked, because the honest default for "should this feature
     * work" is yes -- but each one is individually clearable, which is the difference
     * between offering and helping yourself.
     */
    static _promptContent(scene, unmet) {
        const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));

        const boxes = unmet.length
            ? `<hr />
               <p><strong>These scene settings would stop it working. Fix them?</strong></p>
               ${unmet.map(item => `
                   <label class="checkbox" style="display:block; margin-bottom:0.35rem;">
                       <input type="checkbox" name="prereq-${esc(item.id)}" checked />
                       ${esc(item.label)}
                       <span class="notes" style="display:block; margin-left:1.5rem;">${esc(item.note)}</span>
                   </label>`).join('')}`
            : '';

        return `
            <p>Should the light on <strong>${esc(scene.name)}</strong> follow the world clock?</p>
            <p class="notes">Sunrise and sunset will dim and brighten this scene as world time moves.
            Choose <strong>No</strong> for interiors and anywhere else that never sees the sky.
            You can change this later on the scene's Geography tab.</p>
            ${boxes}`;
    }

    /**
     * Turn the scene on, together with whichever prerequisites the GM left ticked.
     *
     * ONE update, not four. The flag and the scene settings land together, so there is a
     * single `updateScene` and therefore a single forced re-apply -- and no window in
     * which the scene is opted in but still locked, which would make the first apply a
     * write core silently discards.
     */
    static async _enableWithPrerequisites(scene, acceptedIds) {
        const accepted = new Set(acceptedIds);
        const update = { [`flags.${MODULE.ID}.${this.FLAG}`]: true };

        for (const item of this.PREREQUISITES) {
            if (!accepted.has(item.id)) continue;
            if (item.isSatisfied(scene)) continue;
            Object.assign(update, item.buildPatch(scene));
        }

        try {
            // The darkness itself is NOT written here. The `updateScene` hook sees the flag
            // land and calls applyToActiveScene({force: true}), which reads the scene after
            // this update -- so it sees the lock already cleared and animates properly.
            await scene.update(update);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Darkness: Failed to enable scene darkness control", error, false, true);
        }
    }

    // ==============================================================
    // ===== APPLYING ===============================================
    // ==============================================================

    /**
     * Move the active scene's darkness to match the clock.
     *
     * GM only. Updating a scene needs ownership, so the driver runs on one client and
     * every other client receives the change through the ordinary document broadcast
     * -- no sockets, and no second code path. Players must tolerate RECEIVING this
     * without trying to produce it, which the guard below is what guarantees.
     *
     * @param {object} [options]
     * @param {boolean} [options.force] Write even if the change is below the epsilon.
     */
    static async applyToActiveScene({ force = false } = {}) {
        if (!game.user?.isGM) return;

        const scene = game.scenes?.active ?? canvas?.scene;
        if (!scene || !this.isEnabledForScene(scene)) return;

        // Core DELETES darknessLevel from any update to a locked scene
        // (v13.351 `client/documents/scene.mjs:417`), so a write here would be silently
        // thrown away. Checking first turns that into "we deliberately did nothing", and
        // makes the lock a working override rather than a mystery. This is also why
        // the driver never SETS the lock: it would lock itself out.
        //
        // Verified on v14.364: the field is still `environment.darknessLock` and the
        // pre-update strip is still there. The LINE NUMBER above is a v13 line and has
        // moved -- the claim was re-checked, the pointer was not.
        if (scene.environment?.darknessLock) return;

        const dayFraction = WorldClockManager.getCurrentDayFraction();
        if (dayFraction === null) return;

        const target = this._clamp01(this.computeDarkness(dayFraction));
        const current = Number(scene.environment?.darknessLevel ?? 0);

        // The curve is flat across most of the day and most of the night, so the great
        // majority of clock steps compute no change at all and stop here. That is what
        // keeps a GM stepping through an afternoon from issuing a write per click.
        if (!force && Math.abs(target - current) < this.EPSILON) return;

        try {
            // The animation is core's, driven by an update OPTION rather than by us --
            // it plays on every client (v13.351 `client/documents/scene.mjs:606`) with no
            // socket and no code of ours. Omitting it would make darkness snap.
            //
            // Verified on v14.364: the option is still read on update and
            // `canvas.effects.animateDarkness` is still there. Line number is v13's.
            await scene.update(
                { environment: { darknessLevel: target } },
                { animateDarkness: this.ANIMATE_MS }
            );
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Darkness: Failed to update scene darkness", error, false, false);
        }
    }

    // ==============================================================
    // ===== THE CONTROL ============================================
    // ==============================================================

    /**
     * The clock's right-click entry, offered through the seam the clock exposes so
     * that this file and the menubar never have to know about each other.
     *
     * GM only, because the whole control is a scene write. The entry reports the
     * current state as well as toggling it, and it is the fast toggle mid-session --
     * but it is no longer the only way in. The same flag is on the scene's Geography
     * tab, which is where a GM configuring a scene will actually look; this menu was
     * the sole home for it and was, in practice, undiscoverable.
     *
     * The icon distinguishes all THREE states. An undecided scene showing an empty
     * checkbox would claim the GM had said no, which is the conflation this whole
     * flag was made three-valued to avoid -- so it gets its own mark.
     */
    static getContextMenuItems() {
        if (!game.user?.isGM) return [];

        const scene = game.scenes?.active ?? canvas?.scene;
        if (!scene) return [];

        const setting = this.getSceneSetting(scene);
        const enabled = setting === true;
        const locked = !!scene.environment?.darknessLock;

        const icon = setting === undefined
            ? 'fa-solid fa-square-question'
            : (enabled ? 'fa-solid fa-square-check' : 'fa-regular fa-square');

        const items = [{
            // Names the scene, because the menu is opened from the menubar rather than
            // from the scene, and "this scene" is ambiguous when several are open.
            name: setting === undefined
                ? `Darkness Control on ${scene.name} (not set)`
                : `Darkness Control on ${scene.name}`,
            icon,
            // UIContextMenu invokes `callback`. `onClick` is the MENUBAR adapter's
            // shape, and passing it here produces a menu whose entries silently do
            // nothing -- a mistake already made once in this repo.
            callback: () => this.setEnabledForScene(scene, !enabled)
        }];

        if (enabled && locked) {
            items.push({
                name: 'Darkness Level Lock is on, so the clock cannot change this scene',
                icon: 'fa-solid fa-lock',
                disabled: true,
                callback: () => {}
            });
        }

        return items;
    }
}

export { DarknessManager };
