// ==================================================================
// ===== MANAGER-NOTE-REMINDERS - a note with a moment ==============
// ==================================================================
//
// A time-bound note is an ordinary note carrying a due flag: a moment it
// wants to be brought back at. Nothing else changes about it.
//
// TWO CLOCKS, one mechanism. A note can be bound to in-world time ("the
// 20th of Marpenoth") or to real time ("in twenty minutes"), or to both:
// they answer different questions and neither substitutes for the other.
//
//   world   dueAt      / firedAt       world time, in seconds
//   real    dueAtReal  / firedAtReal   wall clock, in epoch milliseconds
//
// They are separate FLAGS and separate indexes rather than one store with
// a "which clock" field. That is the same call the calendar plan makes and
// for the same reason: every read would otherwise have to filter, and two
// things that mean different things would share a code path.
//
// What they DO share is the machinery -- index, scan, stamp, announce --
// which is identical in shape and differs only in which flag it reads and
// what "now" means. That lives once here, parameterised by CLOCKS, because
// two copies would drift the first time one of them was fixed.
//
// This is NOT a calendar event. An event belongs to the world, recurs, and
// lives in a world setting; a reminder belongs to one person, never
// recurs, and lives on their own note. See architecture-calendar.md.
//
// WHY NOT `schedule()`, when events use it. Schedules are in-memory and
// nothing fires retroactively, so a reminder due while the world was closed
// would be silently gone. A missed festival is still visible on the calendar;
// a missed personal reminder is invisible. That asymmetry is the whole reason
// for a persisted moment scanned on crossing, and it is the one thing
// `schedule()` structurally cannot do.
//
// `firedAt` rather than a `done` flag is the scope line. It gives "recently
// fired" without inventing a status, an assignee, or a completion.
//
// The indexes are derived, exactly as the annotation index is: rebuilt at
// ready, maintained by the same page hooks, never consulted as truth.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { NotesManager } from './manager-notes.js';

/** The two clocks a note can be bound to. */
export const REMINDER_CLOCKS = Object.freeze({
    WORLD: 'world',
    REAL: 'real'
});

/**
 * How often the wall clock is checked, in milliseconds.
 *
 * World reminders need no timer -- `updateWorldTime` says exactly when to look.
 * Real ones have no such signal, so this is a poll, and the interval is the
 * worst case by which a reminder is late. Fifteen seconds is under the
 * granularity anybody sets a reminder at, and cheap: the scan is a walk of a
 * sorted array that is almost always empty at the head.
 */
const REAL_POLL_MS = 15000;

/**
 * Past this gap, a reminder is reported as LATE rather than as arriving now.
 *
 * Different per clock because the clocks fail differently. World time moves in
 * jumps, so an hour of world time is nothing -- it can pass in one tick of a
 * running time mode. Wall time only gets ahead of the poll if the client was
 * closed or asleep, so five minutes already means something went wrong.
 */
const REAL_LATE_GAP_MS = 5 * 60 * 1000;

/**
 * Everything that differs between the two clocks.
 *
 * Adding a third clock means adding an entry here, not a third copy of the
 * scan. `check-note-reminders.mjs` enforces that both entries stay complete.
 */
const CLOCKS = {
    [REMINDER_CLOCKS.WORLD]: {
        dueFlag: 'dueAt',
        firedFlag: 'firedAt',
        now: () => game.time?.worldTime ?? 0,
        // An in-world hour, from the calendar's own units -- an hour is not
        // 3600 seconds on a world that does not use sixty-minute hours.
        lateGap: () => {
            const days = game.time?.calendar?.days;
            return (Number(days?.secondsPerMinute) || 60) * (Number(days?.minutesPerHour) || 60);
        },
        format: (time) => NoteReminders.formatMoment(time)
    },
    [REMINDER_CLOCKS.REAL]: {
        dueFlag: 'dueAtReal',
        firedFlag: 'firedAtReal',
        now: () => Date.now(),
        lateGap: () => REAL_LATE_GAP_MS,
        format: (time) => NoteReminders.formatRealMoment(time)
    }
};

/** @returns {object|null} the clock spec, or null for a name that is not one. */
function spec(clock) {
    return CLOCKS[clock] ?? null;
}

export class NoteReminders {

    /**
     * Per clock, sorted ascending by due: `[{ dueAt, pageUuid, firedAt }]`.
     *
     * Derived. An array rather than the annotation index's Map because every
     * question asked of it is a range -- "what is due by now", "what falls in
     * this month" -- and a range over a sorted array is a slice, where a Map
     * would be a full scan and a sort per call.
     */
    static _index = { world: [], real: [] };

    /** Per clock, what the index looked like last time. See rebuildIndex. */
    static _fingerprint = { world: '', real: '' };

    /** Whether the indexes have been built. Reads build them on demand if not. */
    static _indexed = false;

    /** Handle for the wall-clock poll, so a second initialize cannot start a second one. */
    static _realTimer = null;

    // ==============================================================
    // ===== LIFECYCLE ==============================================
    // ==============================================================

    static initialize() {
        this.rebuildIndex();

        // The same three page hooks the annotation index uses, for the same
        // reason: an import creates pages rather than updating them, so create
        // is watched and not just update.
        for (const name of ['createJournalEntryPage', 'updateJournalEntryPage', 'deleteJournalEntryPage']) {
            HookManager.registerHook({
                name,
                description: 'Note reminders: keep the due indexes current',
                priority: 4,
                context: 'note-reminders',
                callback: () => {
                    // --- BEGIN - HOOKMANAGER CALLBACK ---
                    this.rebuildIndex();
                    // --- END - HOOKMANAGER CALLBACK ---
                }
            });
        }

        HookManager.registerHook({
            name: 'deleteJournalEntry',
            description: 'Note reminders: drop entries for a deleted journal',
            priority: 4,
            context: 'note-reminders',
            callback: () => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                this.rebuildIndex();
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // The world crossing. Registered on every client; `_isMine` decides
        // whether THIS client is the one that owes the reminder, so a note
        // shared with four people still resurfaces once, for its author.
        HookManager.registerHook({
            name: 'updateWorldTime',
            description: 'Note reminders: fire notes the world has moved past',
            priority: 3,
            context: 'note-reminders',
            callback: () => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                void this.fireDue();
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        this._startRealClock();

        // Anything that came due while this client was away, on either clock.
        // This is the case the persisted flags exist for, and it runs once at
        // startup rather than waiting for a clock to move -- world time might
        // not move for a whole session.
        void this.fireDue({ startup: true });
        void this.fireDueReal({ startup: true });

        postConsoleAndNotification(
            MODULE.NAME,
            `Note reminders: ${this._index.world.length} in-world, ${this._index.real.length} real-time`,
            '', true, false
        );
    }

    /**
     * Start the wall-clock poll.
     *
     * Guarded rather than unconditional: `initialize` runs once per load today,
     * but a second interval would double every real reminder's announcement and
     * leave no way to find the orphan.
     */
    static _startRealClock() {
        if (this._realTimer !== null) return;
        this._realTimer = setInterval(() => void this.fireDueReal(), REAL_POLL_MS);
    }

    /** Stop the wall-clock poll. Exposed for teardown and for the harness. */
    static stopRealClock() {
        if (this._realTimer === null) return;
        clearInterval(this._realTimer);
        this._realTimer = null;
    }

    /**
     * Rebuild both indexes from scratch.
     *
     * Cheap enough to be the answer whenever correctness is in doubt: one walk
     * of the journal serves both clocks, so doing them separately would cost two.
     */
    static rebuildIndex() {
        const built = { world: [], real: [] };

        for (const entry of game.journal ?? []) {
            for (const page of entry.pages ?? []) {
                if (!NotesManager.isNote(page)) continue;
                for (const clock of Object.keys(CLOCKS)) {
                    const dueAt = this._readFlag(page, clock, 'dueFlag');
                    if (dueAt === null) continue;
                    // firedAt rides along only for the fingerprint below -- reads
                    // go back to the page, so nothing here is consulted as truth.
                    built[clock].push({
                        dueAt,
                        pageUuid: page.uuid,
                        firedAt: this._readFlag(page, clock, 'firedFlag')
                    });
                }
            }
        }

        for (const clock of Object.keys(CLOCKS)) {
            built[clock].sort((a, b) => a.dueAt - b.dueAt);

            // Announce only a real change, not every page update. The page hooks
            // fire on any edit to any journal page -- typing in a note is one of
            // them -- and a surface that repainted on each would be repainting
            // while you type.
            const fingerprint = built[clock]
                .map((item) => `${item.pageUuid}@${item.dueAt}/${item.firedAt ?? ''}`)
                .join('|');
            const changed = this._indexed && fingerprint !== this._fingerprint[clock];

            this._index[clock] = built[clock];
            this._fingerprint[clock] = fingerprint;

            if (changed) Hooks.callAll('blacksmith.noteRemindersChanged', { clock });
        }

        this._indexed = true;
    }

    static _ensureIndexed() {
        if (!this._indexed) this.rebuildIndex();
    }

    // ==============================================================
    // ===== READING ================================================
    // ==============================================================

    /** The page, whether given a page or a uuid. */
    static _page(note) {
        return typeof note === 'string' ? fromUuidSync(note) : note ?? null;
    }

    /** One clock's flag off a note, as a number or null. */
    static _readFlag(note, clock, which) {
        const config = spec(clock);
        if (!config) return null;
        const value = this._page(note)?.getFlag?.(MODULE.ID, config[which]);
        return Number.isFinite(value) ? value : null;
    }

    /**
     * When a note is due in WORLD time, or null if it is not bound to one.
     * @returns {number|null} world time in seconds
     */
    static getDue(note) {
        return this._readFlag(note, REMINDER_CLOCKS.WORLD, 'dueFlag');
    }

    /** When a note actually resurfaced in world time, or null. @returns {number|null} */
    static getFired(note) {
        return this._readFlag(note, REMINDER_CLOCKS.WORLD, 'firedFlag');
    }

    /**
     * When a note is due in REAL time, or null if it is not bound to one.
     * @returns {number|null} epoch milliseconds
     */
    static getRealDue(note) {
        return this._readFlag(note, REMINDER_CLOCKS.REAL, 'dueFlag');
    }

    /** When a real-time reminder actually resurfaced, or null. @returns {number|null} */
    static getRealFired(note) {
        return this._readFlag(note, REMINDER_CLOCKS.REAL, 'firedFlag');
    }

    /**
     * Notes due within a window on one clock, in due order.
     *
     * Both bounds are inclusive and either may be omitted, so this answers
     * "what is due today" for a calendar day cell and "everything still
     * pending" for a list, with no second method.
     *
     * Resolves and re-reads each page rather than trusting the index, so a
     * stale index can cost a miss but cannot report something false.
     *
     * @param {string} clock one of REMINDER_CLOCKS
     * @param {object} [options]
     * @param {number} [options.from] earliest moment, inclusive
     * @param {number} [options.to] latest moment, inclusive
     * @param {boolean} [options.includeFired=false] keep notes that already resurfaced
     * @returns {Array<{note: JournalEntryPage, dueAt: number, firedAt: number|null}>}
     */
    static listFor(clock, { from = null, to = null, includeFired = false } = {}) {
        if (!spec(clock)) return [];
        this._ensureIndexed();
        const out = [];

        for (const { pageUuid } of this._index[clock]) {
            const page = fromUuidSync(pageUuid);
            if (!page || !NotesManager.isNote(page)) continue;
            // Permission, not flags: a reminder on a note you cannot read is
            // not yours to see, and ownership is what makes that true.
            if (!page.testUserPermission(game.user, 'OBSERVER')) continue;

            const dueAt = this._readFlag(page, clock, 'dueFlag');
            if (dueAt === null) continue;
            if (from !== null && dueAt < from) continue;
            if (to !== null && dueAt > to) continue;

            const firedAt = this._readFlag(page, clock, 'firedFlag');
            if (firedAt !== null && !includeFired) continue;

            out.push({ note: page, dueAt, firedAt });
        }

        return out.sort((a, b) => a.dueAt - b.dueAt);
    }

    /** World-time reminders in a window. See listFor. */
    static list(options) {
        return this.listFor(REMINDER_CLOCKS.WORLD, options);
    }

    /** Real-time reminders in a window, bounds in epoch milliseconds. See listFor. */
    static listReal(options) {
        return this.listFor(REMINDER_CLOCKS.REAL, options);
    }

    // ==============================================================
    // ===== WRITING ================================================
    // ==============================================================

    /**
     * Whether the current user may set a reminder on this note.
     *
     * The note's own ownership, exactly as annotating is: a reminder is a thing
     * you write on your note, not a claim about anything else. The same answer
     * for both clocks -- what differs is when it fires, not who may ask.
     */
    static canSet(note) {
        const page = this._page(note);
        return !!page && page.testUserPermission(game.user, 'OWNER');
    }

    /**
     * Bind a note to a moment on one clock.
     *
     * Clears that clock's fired stamp in the same write. Moving a reminder
     * forward is asking to be reminded again, and leaving the old stamp would
     * mean it never was. The OTHER clock is untouched: a note may want both.
     *
     * @param {string} clock one of REMINDER_CLOCKS
     * @param {JournalEntryPage|string} note
     * @param {number} dueAt world seconds, or epoch milliseconds for the real clock
     * @returns {Promise<boolean>}
     */
    static async setFor(clock, note, dueAt) {
        const config = spec(clock);
        const page = this._page(note);
        if (!config || !page || !Number.isFinite(dueAt)) return false;
        if (!this.canSet(page)) {
            postConsoleAndNotification(MODULE.NAME, 'Note reminders: no permission to set a reminder on that note', '', false, false);
            return false;
        }

        await page.update({
            [`flags.${MODULE.ID}.${config.dueFlag}`]: dueAt,
            [`flags.${MODULE.ID}.-=${config.firedFlag}`]: null
        });
        this.rebuildIndex();
        return true;
    }

    /**
     * Unbind a note from one clock's moment. It stays a note, and the other
     * clock's reminder stays with it.
     * @returns {Promise<boolean>}
     */
    static async clearFor(clock, note) {
        const config = spec(clock);
        const page = this._page(note);
        if (!config || !page || !this.canSet(page)) return false;

        await page.update({
            [`flags.${MODULE.ID}.-=${config.dueFlag}`]: null,
            [`flags.${MODULE.ID}.-=${config.firedFlag}`]: null
        });
        this.rebuildIndex();
        return true;
    }

    /** Bind a note to a world time. @returns {Promise<boolean>} */
    static set(note, dueAt) {
        return this.setFor(REMINDER_CLOCKS.WORLD, note, dueAt);
    }

    /** Unbind a note from its world time. @returns {Promise<boolean>} */
    static clear(note) {
        return this.clearFor(REMINDER_CLOCKS.WORLD, note);
    }

    /** Bind a note to a real moment, in epoch milliseconds. @returns {Promise<boolean>} */
    static setReal(note, dueAt) {
        return this.setFor(REMINDER_CLOCKS.REAL, note, dueAt);
    }

    /** Unbind a note from its real moment. @returns {Promise<boolean>} */
    static clearReal(note) {
        return this.clearFor(REMINDER_CLOCKS.REAL, note);
    }

    // ==============================================================
    // ===== FIRING =================================================
    // ==============================================================

    /**
     * Whether THIS client owes this reminder.
     *
     * The author's, because a reminder belongs to one person -- a note shared
     * with the party must not resurface on five screens. A note whose author
     * has no user left in the world falls to the GM rather than to nobody,
     * which is the difference between late and lost.
     *
     * This is why a real-time reminder needs no timezone handling: it is stored
     * as an absolute instant and fires on one person's own machine, so "7pm"
     * is 7pm where the person who asked for it is sitting.
     */
    static _isMine(page) {
        const authorId = page?.getFlag?.(MODULE.ID, 'authorId') ?? null;
        if (authorId) return authorId === game.user.id;
        return game.user.isGM;
    }

    /** Whether a firing pass is in flight, per clock. See fireDueFor. */
    static _firing = { world: false, real: false };

    /**
     * Fire everything one clock has moved past.
     *
     * Idempotent through the fired stamp, which is written before anything is
     * announced, so a second call during the same tick finds nothing to do.
     *
     * @returns {Promise<number>} how many fired
     */
    static async fireDueFor(clock, { startup = false } = {}) {
        if (!spec(clock)) return 0;
        // A running time mode ticks the clock several times a second, and stamping
        // is an await -- so without this a second pass starts while the first is
        // still writing, finds the same notes unstamped, and fires them twice.
        if (this._firing[clock]) return 0;
        this._firing[clock] = true;
        try {
            return await this._fireDue(clock, startup);
        } finally {
            this._firing[clock] = false;
        }
    }

    /** Fire world reminders the clock has moved past. @returns {Promise<number>} */
    static fireDue(options) {
        return this.fireDueFor(REMINDER_CLOCKS.WORLD, options);
    }

    /** Fire real-time reminders the wall clock has moved past. @returns {Promise<number>} */
    static fireDueReal(options) {
        return this.fireDueFor(REMINDER_CLOCKS.REAL, options);
    }

    static async _fireDue(clock, startup) {
        const config = spec(clock);
        const now = config.now();
        const owed = this.listFor(clock, { to: now }).filter(({ note }) => this._isMine(note));
        if (!owed.length) return 0;

        for (const { note } of owed) {
            try {
                await note.setFlag(MODULE.ID, config.firedFlag, now);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Note reminders: could not stamp "${note.name}"`, error, false, false);
            }
        }
        this.rebuildIndex();

        for (const entry of owed) {
            try {
                Hooks.callAll('blacksmith.noteReminderFired', {
                    note: entry.note,
                    clock,
                    dueAt: entry.dueAt,
                    firedAt: now,
                    late: this._isLate(clock, entry.dueAt, now, startup),
                    startup
                });
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Note reminders: a listener threw', error, false, false);
            }
        }

        void this._announce(clock, owed, now, startup);
        return owed.length;
    }

    /**
     * Whether this reminder is arriving LATE rather than arriving now.
     *
     * `firedAt > dueAt` is not the test, though it is the obvious one. Neither
     * clock is checked continuously -- world time moves in steps and the wall
     * clock is polled -- so a reminder is past its moment by construction the
     * instant it is found. Calling that late made every ordinary reminder
     * announce itself in the past tense, as though it had been missed.
     *
     * Late means one of two things actually worth saying:
     *
     *   - the startup scan found it, which is exactly the "you were away when
     *     this came due" case the persisted flags exist for, or
     *   - the clock is further past it than that clock's own tolerance. See
     *     `lateGap` on each entry in CLOCKS for why the two differ.
     */
    static _isLate(clock, dueAt, firedAt, startup) {
        if (startup) return true;
        const config = spec(clock);
        if (!config) return false;
        return (firedAt - dueAt) > config.lateGap();
    }

    /**
     * Say so.
     *
     * Collapsed into one toast past a single reminder: reopening a world after
     * an in-world month should not bury the screen in a stack of them, and the
     * count is the useful fact at that point anyway.
     */
    static async _announce(clock, owed, now, startup) {
        try {
            const config = spec(clock);
            const { ToastAPI } = await import('./api-toast.js');
            // The two clocks get different icons because they are different
            // promises. A bell is "at this point in the story"; a clock face is
            // "at this time, in the room".
            const icon = clock === REMINDER_CLOCKS.REAL ? 'fa-solid fa-clock' : 'fa-solid fa-bell';

            if (owed.length === 1) {
                const [{ note, dueAt }] = owed;
                const late = this._isLate(clock, dueAt, now, startup);
                ToastAPI.show({
                    title: note.name || 'Untitled Note',
                    // Present tense unless it really was missed. Wording this off
                    // `firedAt > dueAt` made every ordinary reminder read as
                    // something that had already been missed.
                    subtitle: late
                        ? `Was due ${config.format(dueAt)}`
                        : `Reminder for ${config.format(dueAt)}`,
                    icon,
                    // PERSISTENT. A reminder that times out is a reminder you can
                    // miss, which is the one thing it exists not to be -- and the
                    // likeliest moment for it to arrive is the moment you are
                    // looking at something else. It goes when it is acted on or
                    // dismissed, and nothing else evicts it: persistent toasts are
                    // exempt from the stack cap.
                    duration: 0,
                    moduleId: MODULE.ID,
                    // Keyed by clock as well as note, or a note carrying both
                    // reminders would have the second replace the first.
                    stackKey: `blacksmith-note-reminder-${clock}-${note.id}`,
                    // A reminder whose whole point is "look at this again" that
                    // cannot be clicked to look at it again is half a feature.
                    onClick: () => void this._open(note)
                });
                return;
            }

            ToastAPI.show({
                title: startup
                    ? `${owed.length} reminders were due while you were away`
                    : `${owed.length} reminders`,
                subtitle: owed.map(({ note }) => note.name || 'Untitled Note').join(', '),
                icon,
                // Persistent for the same reason as the single case. This is the
                // one that matters most: it is the "you were away" summary, so it
                // is announcing things already missed once.
                duration: 0,
                moduleId: MODULE.ID,
                stackKey: `blacksmith-note-reminder-batch-${clock}`
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Note reminders: could not announce', error, false, false);
        }
    }

    /** Open a note. Imported on demand so this file does not pull the window stack at load. */
    static async _open(note) {
        try {
            const { openNoteEditor } = await import('./window-note-editor.js');
            await openNoteEditor({ note });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Note reminders: could not open the note', error, false, false);
        }
    }

    // ==============================================================
    // ===== FORMATTING =============================================
    // ==============================================================

    /**
     * A world time as a date and clock, in the world's own calendar.
     *
     * Month names are LOCALIZATION KEYS in some calendars -- dnd5e's Harptos
     * stores `DND5E.CALENDAR.Harptos.Month.Hammer` -- so they are localized
     * before display. `localize` returns its argument unchanged when there is
     * no translation, so a calendar storing plain names needs no branch.
     *
     * Minutes are padded from `minutesPerHour` rather than to two digits: a
     * calendar declaring 100-minute hours needs three.
     */
    static formatMoment(time) {
        const calendar = game.time?.calendar;
        if (!calendar || !Number.isFinite(time)) return '';

        try {
            const parts = calendar.timeToComponents(time);
            const monthName = game.i18n?.localize(calendar.months?.values?.[parts.month]?.name ?? '') ?? '';
            const minutesPerHour = Number(calendar.days?.minutesPerHour) || 60;
            const width = String(Math.max(0, minutesPerHour - 1)).length;
            const clock = `${parts.hour}:${String(parts.minute).padStart(width, '0')}`;
            return `${monthName} ${parts.dayOfMonth + 1}, ${clock}`.trim();
        } catch (_) {
            return '';
        }
    }

    /**
     * A real moment as the reader's own local date and time.
     *
     * Rendered locally rather than in any fixed zone, which is the whole reason
     * the stored value is an absolute instant: two people at one table in two
     * countries each see their own wall clock, and neither has to do arithmetic.
     *
     * Today's reminders show the time alone. A date on something happening in
     * twenty minutes is noise, and the common case is by far the near one.
     */
    static formatRealMoment(time) {
        if (!Number.isFinite(time)) return '';
        try {
            const when = new Date(time);
            const now = new Date();
            const sameDay = when.getFullYear() === now.getFullYear()
                && when.getMonth() === now.getMonth()
                && when.getDate() === now.getDate();

            const clock = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            if (sameDay) return clock;

            const date = when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            return `${date}, ${clock}`;
        } catch (_) {
            return '';
        }
    }
}
