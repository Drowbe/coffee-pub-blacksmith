// ==================================================================
// ===== MANAGER-NOTE-REMINDERS - a note with a moment ==============
// ==================================================================
//
// A time-bound note is an ordinary note carrying a `dueAt` flag: a world
// time it wants to be brought back at. Nothing else changes about it.
//
// This is NOT a calendar event, and the two are deliberately separate
// mechanisms. An event belongs to the world, recurs, and lives in a world
// setting; a reminder belongs to one person, never recurs, and lives on
// their own note. See architecture-calendar.md for the full table.
//
// WHY NOT `schedule()`, when events use it. Schedules are in-memory and
// nothing fires retroactively, so a reminder due while the world was closed
// would be silently gone. A missed festival is still visible on the calendar;
// a missed personal reminder is invisible. That asymmetry is the whole reason
// for a persisted moment scanned on crossing, and it is the one thing
// `schedule()` structurally cannot do.
//
// STORAGE. Two flags on the note page, and no central store:
//
//   dueAt    world time (seconds) the note wants to resurface at
//   firedAt  world time it actually resurfaced. Absent until it does.
//
// `firedAt` rather than a `done` flag is the scope line. It gives "recently
// fired" without inventing a status, an assignee, or a completion -- and
// `firedAt > dueAt` tells you it came back late, so "missed" falls out of the
// data instead of being a third field.
//
// The index below is derived, exactly as the annotation index is: rebuilt at
// ready, maintained by the same page hooks, and never consulted as truth.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { NotesManager } from './manager-notes.js';

/** Flag on the note page: the world time it is due at. */
const DUE_FLAG = 'dueAt';

/** Flag on the note page: the world time it actually fired at. */
const FIRED_FLAG = 'firedAt';

export class NoteReminders {

    /**
     * Sorted ascending by `dueAt`: `[{ dueAt, pageUuid }]`.
     *
     * Derived. An array rather than the annotation index's Map because every
     * question asked of it is a range -- "what is due by now", "what falls in
     * this month" -- and a range over a sorted array is a slice, where a Map
     * would be a full scan and a sort per call.
     */
    static _due = [];

    /** Whether the index has been built. Reads build it on demand if not. */
    static _indexed = false;

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
                description: 'Note reminders: keep the due index current',
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

        // The crossing itself. Registered on every client; `_isMine` decides
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

        // Anything that came due while this client was away. This is the case
        // the persisted flag exists for, and it runs once at startup rather
        // than waiting for the world time to move again -- which it might not
        // do for a whole session.
        void this.fireDue({ startup: true });

        postConsoleAndNotification(MODULE.NAME, `Note reminders: ${this._due.length} pending`, '', true, false);
    }

    /** Rebuild from scratch. Cheap enough to be the answer whenever correctness is in doubt. */
    static rebuildIndex() {
        const due = [];
        for (const entry of game.journal ?? []) {
            for (const page of entry.pages ?? []) {
                if (!NotesManager.isNote(page)) continue;
                const dueAt = this.getDue(page);
                if (dueAt === null) continue;
                // firedAt rides along only for the fingerprint below -- reads go
                // back to the page, so nothing here is consulted as truth.
                due.push({ dueAt, pageUuid: page.uuid, firedAt: this.getFired(page) });
            }
        }
        due.sort((a, b) => a.dueAt - b.dueAt);

        // Announce only a real change, not every page update. The page hooks fire
        // on any edit to any journal page -- typing in a note is one of them -- and
        // a surface that repainted on each would be repainting while you type.
        const fingerprint = due.map((entry) => `${entry.pageUuid}@${entry.dueAt}/${entry.firedAt ?? ''}`).join('|');
        const changed = this._indexed && fingerprint !== this._fingerprint;

        this._due = due;
        this._fingerprint = fingerprint;
        this._indexed = true;

        if (changed) Hooks.callAll('blacksmith.noteRemindersChanged');
    }

    /** What the index looked like last time, so a repaint is only announced on a real change. */
    static _fingerprint = '';

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

    /**
     * When a note is due, or null if it is not time-bound.
     * @returns {number|null} world time in seconds
     */
    static getDue(note) {
        const value = this._page(note)?.getFlag?.(MODULE.ID, DUE_FLAG);
        return Number.isFinite(value) ? value : null;
    }

    /**
     * When a note actually resurfaced, or null if it has not yet.
     * @returns {number|null} world time in seconds
     */
    static getFired(note) {
        const value = this._page(note)?.getFlag?.(MODULE.ID, FIRED_FLAG);
        return Number.isFinite(value) ? value : null;
    }

    /**
     * Notes due within a window, in due order.
     *
     * Both bounds are inclusive and either may be omitted, so this answers
     * "what is due today" for a calendar day cell and "everything still
     * pending" for a list, with no second method.
     *
     * Resolves and re-reads each page rather than trusting the index, so a
     * stale index can cost a miss but cannot report something false.
     *
     * @param {object} [options]
     * @param {number} [options.from] earliest world time, inclusive
     * @param {number} [options.to] latest world time, inclusive
     * @param {boolean} [options.includeFired=false] keep notes that already resurfaced
     * @returns {Array<{note: JournalEntryPage, dueAt: number, firedAt: number|null}>}
     */
    static list({ from = null, to = null, includeFired = false } = {}) {
        this._ensureIndexed();
        const out = [];

        for (const { pageUuid } of this._due) {
            const page = fromUuidSync(pageUuid);
            if (!page || !NotesManager.isNote(page)) continue;
            // Permission, not flags: a reminder on a note you cannot read is
            // not yours to see, and ownership is what makes that true.
            if (!page.testUserPermission(game.user, 'OBSERVER')) continue;

            const dueAt = this.getDue(page);
            if (dueAt === null) continue;
            if (from !== null && dueAt < from) continue;
            if (to !== null && dueAt > to) continue;

            const firedAt = this.getFired(page);
            if (firedAt !== null && !includeFired) continue;

            out.push({ note: page, dueAt, firedAt });
        }

        return out.sort((a, b) => a.dueAt - b.dueAt);
    }

    // ==============================================================
    // ===== WRITING ================================================
    // ==============================================================

    /**
     * Whether the current user may set a reminder on this note.
     *
     * The note's own ownership, exactly as annotating is: a reminder is a thing
     * you write on your note, not a claim about anything else.
     */
    static canSet(note) {
        const page = this._page(note);
        return !!page && page.testUserPermission(game.user, 'OWNER');
    }

    /**
     * Bind a note to a moment.
     *
     * Clears `firedAt` in the same write. Moving a reminder forward is asking
     * to be reminded again, and leaving the old stamp would mean it never was.
     *
     * @param {JournalEntryPage|string} note
     * @param {number} dueAt world time in seconds
     * @returns {Promise<boolean>}
     */
    static async set(note, dueAt) {
        const page = this._page(note);
        if (!page || !Number.isFinite(dueAt)) return false;
        if (!this.canSet(page)) {
            postConsoleAndNotification(MODULE.NAME, 'Note reminders: no permission to set a reminder on that note', '', false, false);
            return false;
        }

        await page.update({
            [`flags.${MODULE.ID}.${DUE_FLAG}`]: dueAt,
            [`flags.${MODULE.ID}.-=${FIRED_FLAG}`]: null
        });
        this.rebuildIndex();
        return true;
    }

    /**
     * Unbind a note from its moment. It stays a note.
     * @returns {Promise<boolean>}
     */
    static async clear(note) {
        const page = this._page(note);
        if (!page) return false;
        if (!this.canSet(page)) return false;

        await page.update({
            [`flags.${MODULE.ID}.-=${DUE_FLAG}`]: null,
            [`flags.${MODULE.ID}.-=${FIRED_FLAG}`]: null
        });
        this.rebuildIndex();
        return true;
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
     */
    static _isMine(page) {
        const authorId = page?.getFlag?.(MODULE.ID, 'authorId') ?? null;
        if (authorId) return authorId === game.user.id;
        return game.user.isGM;
    }

    /**
     * Fire everything the world has moved past.
     *
     * Idempotent through `firedAt`: the stamp is written before anything is
     * announced, so a second call during the same tick finds nothing to do.
     */
    static async fireDue({ startup = false } = {}) {
        // A running time mode ticks the clock several times a second, and stamping
        // is an await -- so without this a second pass starts while the first is
        // still writing, finds the same notes unstamped, and fires them twice.
        if (this._firing) return 0;
        this._firing = true;
        try {
            return await this._fireDue(startup);
        } finally {
            this._firing = false;
        }
    }

    /** Whether a firing pass is in flight. See fireDue. */
    static _firing = false;

    static async _fireDue(startup) {
        const now = game.time?.worldTime ?? 0;
        const owed = this.list({ to: now }).filter(({ note }) => this._isMine(note));
        if (!owed.length) return 0;

        for (const { note } of owed) {
            try {
                await note.setFlag(MODULE.ID, FIRED_FLAG, now);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Note reminders: could not stamp "${note.name}"`, error, false, false);
            }
        }
        this.rebuildIndex();

        for (const entry of owed) {
            try {
                Hooks.callAll('blacksmith.noteReminderFired', {
                    note: entry.note,
                    dueAt: entry.dueAt,
                    firedAt: now,
                    late: this._isLate(entry.dueAt, now, startup),
                    startup
                });
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Note reminders: a listener threw', error, false, false);
            }
        }

        void this._announce(owed, now, startup);
        return owed.length;
    }

    /**
     * Whether this reminder is arriving LATE rather than arriving now.
     *
     * `firedAt > dueAt` is not the test, though it is the obvious one. The clock
     * moves in steps -- a running time mode advances it several minutes at a
     * time -- so a reminder due at 14:30 is found at 14:35 and is past its moment
     * by construction. Calling that late made every ordinary reminder announce
     * itself in the past tense, as though it had been missed.
     *
     * Late means one of two things actually worth saying:
     *
     *   - it was found by the startup scan, which is exactly the "you were away
     *     when this came due" case the persisted index exists for, or
     *   - the world has moved more than an hour past it, which only happens when
     *     somebody jumped the clock rather than let it run.
     */
    static _isLate(dueAt, firedAt, startup) {
        if (startup) return true;
        const calendar = game.time?.calendar;
        const hour = (Number(calendar?.days?.secondsPerMinute) || 60) * (Number(calendar?.days?.minutesPerHour) || 60);
        return (firedAt - dueAt) > hour;
    }

    /**
     * Say so.
     *
     * Collapsed into one toast past a single reminder: reopening a world after
     * an in-world month should not bury the screen in a stack of them, and the
     * count is the useful fact at that point anyway.
     */
    static async _announce(owed, now, startup) {
        try {
            const { ToastAPI } = await import('./api-toast.js');

            if (owed.length === 1) {
                const [{ note, dueAt }] = owed;
                const late = this._isLate(dueAt, now, startup);
                ToastAPI.show({
                    title: note.name || 'Untitled Note',
                    // Present tense unless it really was missed. The clock moves in
                    // steps, so a reminder is always found a little past its moment
                    // -- wording that off `firedAt > dueAt` made every ordinary
                    // reminder read as something that had already been missed.
                    subtitle: late
                        ? `Was due ${this.formatMoment(dueAt)}`
                        : `Reminder for ${this.formatMoment(dueAt)}`,
                    icon: 'fa-solid fa-bell',
                    duration: 8,
                    moduleId: MODULE.ID,
                    stackKey: `blacksmith-note-reminder-${note.id}`,
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
                icon: 'fa-solid fa-bell',
                duration: 10,
                moduleId: MODULE.ID,
                stackKey: 'blacksmith-note-reminder-batch'
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
}
