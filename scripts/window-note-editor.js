// ==================================================================
// ===== NOTE EDITOR ================================================
// ==================================================================
//
// One note: title, body, who can see it, tags, and its icon.
//
// SHAPE. Title and body are the window; visibility, tags, and the icon
// live in one compact strip beneath. The requirement is the author's --
// "I don't want taking notes to feel heavy and like I just opened Word"
// -- so a note you never share and never pin should need nothing but the
// title and the body.
//
// COLLABORATIVE EDITING. An existing note binds a collaborative editor to
// its page, so two people can write at once. A NEW note does not: it has
// no page yet, and nobody can co-edit something that does not exist.
// That split is what removes Squire's draft-page problem -- it created a
// page on first interaction purely so collaboration had something to bind
// to, which is where the hundreds of stray "Untitled Note" pages came
// from. Here the page is created on CLOSE, and only if something was
// actually typed -- an untouched note is never written at all.
//
// THERE IS NO SAVE BUTTON. Title, access, and tags commit as they change,
// and the body is written by _commitBody.
//
// THE BODY DOES NOT SAVE ITSELF. HTMLProseMirrorElement's save only sets
// the element's own `_value` and fires `change`; in a journal sheet that
// event reaches the sheet's form and the SHEET writes the document. This
// window is not a sheet, so without _commitBody the body reached disk only
// through collaborative step sync on the server -- an edit appeared if you
// waited and vanished if you closed first, and the toolbar's own save
// button did nothing at all.
//
// Collaboration only works because of the guard in
// manager-prosemirror-collab.js; without it every incoming step is
// silently discarded. See that file before touching the editor mount.
//
// THE ICON IS THE PIN'S. A note's icon lives on its pin, not on the page,
// so "the pin just uses the icon I chose" is true by construction rather
// than by keeping two copies in step. The pin is created lazily -- the
// first time an icon is set or the note is placed -- and may be unplaced,
// which Pins already models. Configuring it opens Blacksmith's own pin
// config window, which began life as Squire's note icon picker.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { BlacksmithToolWindowBaseV2 } from './window-tool-base.js';
import { registerWindow } from './api-windows.js';
import { NotesManager, NOTE_VISIBILITY, NOTE_TAG_CONTEXT, noteIconHtml, noteAccessUsers, noteAccessBadge } from './manager-notes.js';
import { NoteReminders, REMINDER_CLOCKS } from './manager-note-reminders.js';
import { timeFromDate, toDisplayYear, toInternalYear } from './utility-calendar.js';
import { HookManager } from './manager-hooks.js';
import { PinsAPI } from './api-pins.js';
import { ToastAPI } from './api-toast.js';
import { TagsAPI } from './api-tags.js';
import { EntityListAPI } from './api-entity-list.js';
import { PinConfigWindow } from './window-pin-configuration.js';

export const NOTE_EDITOR_WINDOW_ID = 'blacksmith-note-editor';

export class NoteEditorWindow extends BlacksmithToolWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-tool-root';

    /** Open editors by note uuid, so one note is never open twice. */
    static _open = new Map();

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'blacksmith-note-editor-window',
            classes: ['blacksmith-note-editor', 'blacksmith-notes-tool-window'],
            position: { width: 620, height: 620 },
            window: { title: 'Note', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 440, minHeight: 360, maxWidth: 900 },
            toolTitlebar: 'micro',
            rememberPosition: true,
            windowPositionKey: 'blacksmith-note-editor-position',
            // Shared with the list so Notes is one theme the user switches once,
            // rather than two windows of the same feature drifting apart. The
            // preference keys default to the position key, which would make them
            // independent -- this is the override that ties them together.
            toolThemePreferenceKey: 'blacksmith-notes-theme',
            toolTitlebarPreferenceKey: 'blacksmith-notes-titlebar'
        }
    );

    static PARTS = {
        body: { template: `modules/${MODULE.ID}/templates/window-tool-template.hbs` }
    };

    // Null on purpose: the ProseMirror toolbar emits data-action="bold", "save"
    // and friends, which AppV2 would route as window actions. Controls below use
    // data-note-action and explicit listeners.
    static ACTION_HANDLERS = null;

    constructor({ note = null, ...options } = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = note
            ? `blacksmith-note-editor-${note.id}`
            : `blacksmith-note-editor-new-${foundry.utils.randomID(8)}`;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, NoteEditorWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, NoteEditorWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        this.note = note ?? null;
        this.noteUuid = note?.uuid ?? null;
        this._editor = null;
        this._userList = null;
        // Edit is the default: a note is a thing you write. Read exists because
        // ProseMirror renders an @UUID link as text you cannot click -- following a
        // link out of a note is impossible while editing it.
        this._readMode = false;
        /** Editor text carried into read mode, ahead of the debounced document write. */
        this._liveHtml = null;
        /** Set when the note is gone from under us, so close() does not recreate it. */
        this._discarded = false;
        if (this.noteUuid) NoteEditorWindow._open.set(this.noteUuid, this);

        this._hookContext = `note-editor:${this.id}`;

        // Keep the read view current. Its content is a snapshot taken when the
        // editor was torn down, so an edit arriving from another client -- or this
        // client's own debounced write landing -- has to invalidate it, or read
        // mode quietly shows an older note than the one on disk.
        HookManager.registerHook({
            name: 'updateJournalEntryPage',
            description: 'Note editor: refresh the read view when the note changes',
            priority: 4,
            context: this._hookContext,
            callback: (page) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                if (!this._readMode || !this.noteUuid || page?.uuid !== this.noteUuid) return;
                this._liveHtml = null;
                void this.render(false);
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // Losing access while the note is open. Their client still holds the page
        // until the update lands, so without this they keep typing into something
        // they can no longer save -- and collaborative steps make that worse, since
        // the text looks accepted right up until it is refused.
        HookManager.registerHook({
            name: 'updateJournalEntryPage',
            description: 'Note editor: close when the user loses access',
            priority: 4,
            context: this._hookContext,
            callback: (page) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                if (!this.noteUuid || page?.uuid !== this.noteUuid) return;
                if (page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return;
                this._discarded = true;
                ToastAPI.show({
                    title: 'Note unshared',
                    subtitle: `"${page.name}" is no longer shared with you.`,
                    icon: 'fa-solid fa-user-slash',
                    moduleId: MODULE.ID
                });
                if (NoteEditorWindow._open.get(this.noteUuid) === this) {
                    NoteEditorWindow._open.delete(this.noteUuid);
                }
                this.note = null;
                this.noteUuid = null;
                void this.close();
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });

        // An editor whose note has been deleted has nothing to save into, and
        // saving would recreate a page the user just removed. Watch the document
        // hook rather than Blacksmith's own: deletion can come from the journal
        // sidebar or another client, and those never fire the Blacksmith one here.
        HookManager.registerHook({
            name: 'deleteJournalEntryPage',
            description: 'Note editor: close when its note is deleted',
            priority: 4,
            context: this._hookContext,
            callback: (page) => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                if (!this.noteUuid || page?.uuid !== this.noteUuid) return;
                this._discarded = true;
                // Drop the registry entry here rather than leaving it to _onClose,
                // which keys off noteUuid -- clearing it first would strand the entry
                // and the next open of a note with this uuid would be refused.
                if (NoteEditorWindow._open.get(this.noteUuid) === this) {
                    NoteEditorWindow._open.delete(this.noteUuid);
                }
                this.note = null;
                this.noteUuid = null;
                void this.close();
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });
    }

    get title() {
        return this.note ? `Note: ${this.note.name}` : 'New Note';
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    // ==============================================================
    // ===== STATE ==================================================
    // ==============================================================

    /**
     * Non-GM users who own this note -- the ticked avatars.
     *
     * Includes the current user: they are a chip in the strip like anybody else,
     * so their own access is read from ownership rather than assumed. GMs are
     * excluded because they own every note by construction and ticking them would
     * describe nothing.
     */
    _ownerUserIds() {
        if (!this.note) {
            // A new note starts owned by whoever is writing it, unless that is a GM,
            // who is not in the strip at all.
            return game.user.isGM ? [] : [game.user.id];
        }
        const users = this.note.ownership ?? {};
        return Object.entries(users)
            .filter(([id, level]) => (
                id !== 'default'
                && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
                && !game.users.get(id)?.isGM
            ))
            .map(([id]) => id);
    }

    /** The note's pin, if it has one. May be unplaced. */
    _pin() {
        const pinId = this.note?.getFlag(MODULE.ID, 'pinId');
        return pinId ? PinsAPI.get?.(pinId) ?? null : null;
    }

    // ==============================================================
    // ===== RENDER =================================================
    // ==============================================================

    async getData() {
        // No visibility read here: the strip is driven entirely by ownership via
        // _ownerUserIds, and the mode is derived from what is ticked. The flag is
        // written on change and never consulted to draw the window.
        const tags = this.note ? NotesManager.getNoteTags(this.note) : [];
        const authorId = this.note?.getFlag(MODULE.ID, 'authorId') ?? null;
        const author = authorId ? game.users.get(authorId) : null;
        const pin = this._pin();
        const fav = this.note ? NotesManager.isFavorite(this.note) : false;

        // Suggestions come from the shared taxonomy, so a note tag and a pin tag
        // are the same tag rather than two spellings of one.
        const choices = TagsAPI.getChoices?.(NOTE_TAG_CONTEXT) ?? [];
        // Every choice is rendered; which ones look "taken" is decided live in
        // _syncTagChips against the field's current value. Filtering the list here
        // and removing the button on click was the old shape, and it meant a tag you
        // deleted from the field never returned to the picker.
        const suggestions = choices.map((choice) => choice?.key).filter(Boolean);

        // Rendered as a strip of avatars rather than a stacked list: this is one row
        // in a compact strip, and a name per line was most of why the old shape was
        // tall enough to change the window's layout between private and shared.
        // Just the characters, in one row. GMs are absent because a GM can already
        // open everything -- offering them as a choice would imply it changes
        // something. The current user comes first so their own access is where they
        // will look for it, rather than somewhere in the middle of the row.
        const selfId = game.user.id;
        // noteAccessUsers, not the raw provider: it drops GMs AND any user whose
        // assigned character is a group actor -- the party token is a roster, not a
        // person, and cannot be an editor of anything.
        const allowed = new Set(noteAccessUsers().map((u) => u.id));
        const players = EntityListAPI.providers
            .fromUsers({ includeGM: false, disableOffline: false })
            .filter((entity) => allowed.has(entity.id))
            .sort((a, b) => (a.id === selfId ? -1 : b.id === selfId ? 1 : 0));

        this._userList = EntityListAPI.create({
            entities: players,
            mode: EntityListAPI.MODES.MULTI,
            inputName: 'note-shared-with',
            selected: this._ownerUserIds(),
            listClass: 'blacksmith-note-user-strip',
            itemClass: 'blacksmith-note-user',
            emptyMessage: 'No players.'
        });

        const body = `
            <div class="blacksmith-note-editor-head">
                <button type="button" class="blacksmith-note-icon-btn" data-note-action="icon"
                        title="Choose this note’s icon">
                    ${noteIconHtml(pin?.image)}
                </button>
                <input type="text" name="note-title" class="blacksmith-note-title"
                       value="${foundry.utils.escapeHTML(this.note?.name ?? '')}"
                       placeholder="Untitled Note" autocomplete="off">
                ${this.note ? `
                <button type="button" class="blacksmith-note-mode-toggle${this._readMode ? ' on' : ''}"
                        data-note-action="toggle-read"
                        title="${this._readMode ? 'Edit this note' : 'Read it, and follow its links'}">
                    <i class="fa-solid ${this._readMode ? 'fa-pen-to-square' : 'fa-book-open'}"></i>
                </button>` : ''}
                <button type="button" class="blacksmith-note-fav" data-note-action="favorite"
                        title="${fav ? 'Remove from favourites' : 'Add to favourites'}">
                    <i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>
            </div>

            <div class="blacksmith-note-editor-host"></div>

            <div class="blacksmith-note-editor-strip">
                <div class="blacksmith-note-vis">
                    <span class="blacksmith-note-strip-label">Access</span>
                    <div class="blacksmith-note-vis-row">
                        <div class="blacksmith-note-shared">${this._userList.html}</div>
                        <span class="blacksmith-note-mode" data-mode=""></span>
                    </div>
                </div>

                <label class="blacksmith-note-tags">
                    <span>Tags</span>
                    <input type="text" name="note-tags" value="${foundry.utils.escapeHTML(tags.join(', '))}"
                           placeholder="bob, phlan, informant" autocomplete="off">
                    ${suggestions.length
                        ? `<div class="blacksmith-note-tag-suggestions">${suggestions
                            .map((t) => `<button type="button" data-tag="${foundry.utils.escapeHTML(t)}">${foundry.utils.escapeHTML(t)}</button>`)
                            .join('')}</div>`
                        : ''}
                </label>
            </div>
        `;

        // Pin controls only appear once there is something to say about them.
        const pinButton = !this.note
            ? ''
            : pin?.sceneId
                ? '<button type="button" class="blacksmith-window-btn-secondary" data-note-action="unpin">' +
                  '<i class="fa-solid fa-location-dot-slash"></i> Unpin</button>' +
                  '<button type="button" class="blacksmith-window-btn-secondary" data-note-action="pan">' +
                  '<i class="fa-solid fa-crosshairs"></i> Show</button>'
                : '<button type="button" class="blacksmith-window-btn-secondary" data-note-action="place">' +
                  '<i class="fa-solid fa-location-dot"></i> Place on canvas</button>';

        return {
            appId: this.id,
            bodyContent: body,
            showToolFooter: true,
            toolFooterLeft: (author
                ? `<span class="blacksmith-note-meta">${foundry.utils.escapeHTML(author.name)}</span>`
                : '') + this._reminderControl(),
            toolFooterRight:
                pinButton +
                '<button type="button" class="blacksmith-window-btn-primary" data-note-action="cancel">' +
                '<i class="fas fa-xmark"></i> Close</button>'
        };
    }

    /**
     * The reminder chip, in the footer beside the author.
     *
     * The footer rather than the Access strip because that row answers a different
     * question: access is WHO, tags are WHAT, and a date is WHEN. It also already
     * grows with the player count, so a fourth thing in it would be the one that
     * pushes the window taller.
     *
     * The cost of the footer is discoverability, which is why the unset state is a
     * visible invitation rather than an icon: nobody hunts for a feature they have
     * not been told about.
     */
    _reminderControl() {
        if (!this.note || !NoteReminders.canSet(this.note)) return '';

        const world = this._reminderChip(REMINDER_CLOCKS.WORLD, {
            icon: 'fa-bell',
            firedIcon: 'fa-bell-slash',
            dueAt: NoteReminders.getDue(this.note),
            firedAt: NoteReminders.getFired(this.note),
            format: (at) => NoteReminders.formatMoment(at),
            change: 'Change when this note comes back in the world'
        });
        const real = this._reminderChip(REMINDER_CLOCKS.REAL, {
            icon: 'fa-clock',
            firedIcon: 'fa-clock',
            dueAt: NoteReminders.getRealDue(this.note),
            firedAt: NoteReminders.getRealFired(this.note),
            format: (at) => NoteReminders.formatRealMoment(at),
            change: 'Change when this note comes back in real time'
        });

        // ONE invitation, not two. Two "Remind me" buttons in a footer would ask
        // the reader to understand the world/real split before they have any
        // reason to care about it; the dialog asks once they are already there.
        // Chips are per clock, because once set they are two different facts.
        const invite = (world || real)
            ? '<button type="button" class="blacksmith-note-remind" data-note-action="remind"'
                + ' data-tooltip="Add another reminder"><i class="fa-solid fa-plus"></i></button>'
            : '<button type="button" class="blacksmith-note-remind" data-note-action="remind"'
                + ' data-tooltip="Bring this note back at a moment in the world, or at a real time">'
                + '<i class="fa-regular fa-bell"></i> Remind me...</button>';

        return world + real + invite;
    }

    /**
     * One clock's chip, or nothing when that clock has no reminder.
     *
     * Fired is shown, not cleared. "It came back on the 14th" is the useful fact
     * afterwards, and clearing it would leave a note that looks like it never had
     * a moment at all.
     */
    _reminderChip(clock, { icon, firedIcon, dueAt, firedAt, format, change }) {
        if (dueAt === null) return '';

        const fired = firedAt !== null;
        const label = foundry.utils.escapeHTML(format(dueAt));
        const tooltip = fired
            ? `Resurfaced ${foundry.utils.escapeHTML(format(firedAt))}`
            : change;

        return `<button type="button" class="blacksmith-note-remind set${fired ? ' fired' : ''}"
                        data-note-action="remind" data-remind-clock="${clock}" data-tooltip="${tooltip}">
                    <i class="fa-solid ${fired ? firedIcon : icon}"></i> ${label}
                </button>
                <button type="button" class="blacksmith-note-remind-clear" data-note-action="remind-clear"
                        data-remind-clock="${clock}"
                        data-tooltip="Remove this reminder. The note stays.">
                    <i class="fa-solid fa-xmark"></i>
                </button>`;
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        await this._mountEditor();
        this._wire();
    }

    /**
     * Mount the body editor.
     *
     * Collaborative only for a note that already exists. Three requirements, each
     * of which fails silently if missed: seed through the factory because `value`
     * is a constructor property and not an attribute; force it editable before
     * mount AND on `open`, because it mounts read-only; and give the content a real
     * min-height in CSS or it collapses to nothing and reads as "the toolbar shows
     * but I cannot type".
     */
    async _mountEditor() {
        const host = this.element?.querySelector?.('.blacksmith-note-editor-host');
        if (!host) return;

        if (this._readMode) {
            await this._mountReadView(host);
            return;
        }
        if (host.querySelector('prose-mirror')) return;

        const Cls = foundry?.applications?.elements?.HTMLProseMirrorElement;
        if (!Cls?.create) {
            postConsoleAndNotification(MODULE.NAME, 'Notes: ProseMirror element unavailable', '', false, true);
            return;
        }

        const collaborative = !!this.noteUuid;
        const editor = Cls.create({
            name: 'text.content',
            value: this.note?.text?.content ?? '',
            compact: true,
            ...(collaborative ? { collaborate: true, documentUUID: this.noteUuid } : {})
        });
        editor.classList.add('blacksmith-notes-editor');
        // The element emits `change` when it saves -- on its toolbar button, and
        // when it is removed from the DOM. This is the listener a sheet's form
        // would be; without it the save button is inert.
        editor.addEventListener('change', () => void this._commitBody(editor.value));
        editor.disabled = false;
        editor.removeAttribute('readonly');
        editor.addEventListener('open', () => {
            editor.disabled = false;
            editor.removeAttribute('readonly');
            requestAnimationFrame(() => {
                const content = editor.querySelector('.editor-content');
                content?.setAttribute('contenteditable', 'true');
                content?.focus();
            });
        }, { once: true });

        host.replaceChildren(editor);
        this._editor = editor;
    }

    /**
     * Render the note as enriched HTML.
     *
     * Enriched, so `@UUID[...]` becomes a real content link. Foundry delegates
     * clicks on `.content-link` globally, so nothing here has to wire them -- the
     * only requirement is that the markup exists outside a ProseMirror surface.
     *
     * Read from the live document rather than from the editor: collaborative edits
     * are already on the page, so this cannot show something staler than the note.
     */
    async _mountReadView(host) {
        // The value carried over from the editor wins while it is fresher than the
        // document; once an update for this page lands, _liveHtml is dropped and
        // the document is authoritative again.
        const html = this._liveHtml ?? this.note?.text?.content ?? '';
        if (!html) {
            host.innerHTML = '<div class="blacksmith-note-read blacksmith-note-read-empty">Nothing written yet.</div>';
            return;
        }
        const ns = foundry?.applications?.ux?.TextEditor;
        const TE = ns?.implementation ?? ns ?? globalThis.TextEditor;
        try {
            const enriched = await TE.enrichHTML(html, { relativeTo: this.note, secrets: game.user.isGM });
            host.innerHTML = `<div class="blacksmith-note-read">${enriched}</div>`;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Notes: could not enrich the note body', error?.message ?? error, false, false);
            host.innerHTML = `<div class="blacksmith-note-read">${html}</div>`;
        }
    }

    _wire() {
        const root = this.element;
        if (!root) return;

        this._userList?.attach(root);

        // ---- the access strip ----
        // One row of character toggles; the MODE is derived, never chosen. Ticking
        // everybody IS the party, and is stored as the party flag rather than as a
        // list of whoever exists today, so a player who joins later is included
        // without anyone editing the note.
        const shared = root.querySelector('.blacksmith-note-shared');

        shared?.addEventListener('change', async (event) => {
            // Untick yourself and you lose the note. GMs are not in the strip, so
            // this can only be a player removing their own access.
            const input = event.target;
            if (input?.value === game.user.id && input.checked === false) {
                const ok = await foundry.applications.api.DialogV2.confirm({
                    window: { title: 'Remove your own access?' },
                    content: '<p>You will not be able to open this note again once you save. '
                        + 'Somebody it is shared with would have to share it back.</p>',
                    modal: true
                }).catch(() => false);
                if (!ok) {
                    input.checked = true;
                }
            }
            this._syncAccess();
            void this._commitNow();
        });

        this._syncAccess();

        // The text field stays the source of truth and a chip is a view of it, so a
        // tag removed by typing reappears as an available chip.
        const tagInput = root.querySelector('[name="note-tags"]');
        const readTags = () => (tagInput?.value ?? '')
            .split(',').map((t) => t.trim()).filter(Boolean);

        for (const button of root.querySelectorAll('.blacksmith-note-tag-suggestions button')) {
            button.addEventListener('click', () => {
                if (!tagInput) return;
                const current = readTags();
                const tag = button.dataset.tag;
                tagInput.value = (current.includes(tag)
                    ? current.filter((t) => t !== tag)
                    : [...current, tag]).join(', ');
                this._syncTagChips();
                void this._commitNow();
            });
        }
        tagInput?.addEventListener('input', () => {
            this._syncTagChips();
            this._commitSoon();
        });
        this._syncTagChips();

        // Typing commits on a delay; leaving the field commits at once, so a
        // closed window never loses the last few characters to a pending timer.
        const titleInput = root.querySelector('[name="note-title"]');
        titleInput?.addEventListener('input', () => this._commitSoon());
        titleInput?.addEventListener('change', () => void this._commitNow());
        tagInput?.addEventListener('change', () => void this._commitNow());

        const on = (action, handler) => root
            .querySelector(`[data-note-action="${action}"]`)
            ?.addEventListener('click', handler);

        on('favorite', async () => {
            if (!this.note) {
                ui.notifications.info('Save the note first.');
                return;
            }
            await NotesManager.toggleFavorite(this.note);
            this.render(false);
        });
        on('toggle-read', () => {
            this._readMode = !this._readMode;
            // Take the editor's CURRENT value on the way out. The collaborative
            // editor persists to `text.content` on a debounce, so the document is
            // behind what is on screen the moment you toggle -- which showed the
            // note as it was when the window opened. The editor's own value is the
            // live text, including steps received from other clients.
            this._liveHtml = this._readMode ? (this._editor?.value ?? null) : null;
            // The editor is about to be destroyed; write what it holds.
            if (this._liveHtml != null) void this._commitBody(this._liveHtml);
            // Drop the editor element so the next mount rebuilds cleanly; a
            // collaborative ProseMirror left in the DOM keeps its session open.
            const host = this.element?.querySelector?.('.blacksmith-note-editor-host');
            if (host) host.replaceChildren();
            this._editor = null;
            void this.render(false);
        });
        on('cancel', () => void this.close());
        on('icon', () => void this._configureIcon());
        on('place', () => void this._place());
        on('unpin', () => void this._unpin());
        on('pan', () => void PinsAPI.panTo?.(this.note?.getFlag(MODULE.ID, 'pinId')));
        // querySelectorAll, not `on`: the footer now carries one control per clock
        // plus the add button, and `on` binds only the first match. Binding only
        // the first is the kind of failure that looks like "the second chip does
        // nothing" rather than like an error.
        for (const button of root.querySelectorAll('[data-note-action="remind"]')) {
            button.addEventListener('click', () => void this._setReminder(button.dataset.remindClock ?? null));
        }
        for (const button of root.querySelectorAll('[data-note-action="remind-clear"]')) {
            button.addEventListener('click', async () => {
                await NoteReminders.clearFor(button.dataset.remindClock ?? REMINDER_CLOCKS.WORLD, this.note);
                this.render(false);
            });
        }
    }

    /**
     * Ask for the moment, and bind the note to it.
     *
     * Absolute fields rather than "in N days", with quick-set buttons that fill
     * them: one stored value and one thing on screen, where offering both an
     * offset and a date would be two ways to say one thing and a question about
     * which one won. The shortcuts cover the common intent without becoming a
     * second source of truth -- they write into the same fields you can then edit.
     */
    /**
     * An instant as a `datetime-local` field value.
     *
     * Built from the LOCAL parts rather than `toISOString`, which converts to UTC
     * and would show a time hours away from the one the reader means. The format
     * is fixed by the input, not by locale: `YYYY-MM-DDTHH:MM`.
     */
    static _toLocalInput(ms) {
        const date = new Date(ms);
        const pad = (value) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
            + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    async _setReminder(clock = null) {
        if (!this.note || !NoteReminders.canSet(this.note)) return;

        const calendar = game.time?.calendar;

        // Which clock the dialog opens on. Clicking a chip edits THAT reminder;
        // the add button opens on whichever clock is still free, so the second
        // reminder does not land on top of the first.
        //
        // Resolved AFTER the calendar check, not before: with no calendar the
        // in-world pane is never rendered, and opening on it would show the
        // switch above an empty dialog rather than anything to fill in.
        let startClock = clock
            ?? (NoteReminders.getDue(this.note) !== null && NoteReminders.getRealDue(this.note) === null
                ? REMINDER_CLOCKS.REAL
                : REMINDER_CLOCKS.WORLD);

        if (!calendar) {
            if (clock === REMINDER_CLOCKS.WORLD) {
                ui.notifications.warn('This world has no calendar, so a note cannot be given an in-world moment.');
                return;
            }
            startClock = REMINDER_CLOCKS.REAL;
        }

        const { DialogAPI } = await import('./api-dialog.js');
        const localize = (value) => game.i18n?.localize(value ?? '') ?? '';

        // ---- the in-world half ----

        let worldPane = '';
        let seed = null;
        let worldShortcuts = [];

        if (calendar) {
            const hoursPerDay = Number(calendar.days?.hoursPerDay) || 24;
            const minutesPerHour = Number(calendar.days?.minutesPerHour) || 60;
            const secondsPerMinute = Number(calendar.days?.secondsPerMinute) || 60;
            const months = calendar.months?.values ?? [];

            // Seed from the existing reminder when there is one, so editing a date
            // is an edit rather than a re-entry.
            seed = calendar.timeToComponents(NoteReminders.getDue(this.note) ?? (game.time?.worldTime ?? 0));

            const monthOptions = months
                .map((month, index) => `<option value="${index}"${index === seed.month ? ' selected' : ''}>${foundry.utils.escapeHTML(localize(month?.name))}</option>`)
                .join('');

            // Offsets in SECONDS, computed from the calendar's own units -- a day
            // is not 86400 seconds on a world that does not use twenty-four hours.
            const daySeconds = hoursPerDay * minutesPerHour * secondsPerMinute;
            worldShortcuts = [
                { label: 'In an hour', seconds: minutesPerHour * secondsPerMinute },
                { label: 'Tomorrow', seconds: daySeconds },
                { label: 'In 3 days', seconds: daySeconds * 3 },
                { label: 'In a month', seconds: daySeconds * (Number(months[seed.month]?.days) || 30) }
            ];

            worldPane = `
                <div class="blacksmith-note-remind-pane" data-pane="${REMINDER_CLOCKS.WORLD}">
                    <div class="blacksmith-note-remind-shortcuts">
                        ${worldShortcuts.map((s) => `<button type="button" data-world-offset="${s.seconds}">${s.label}</button>`).join('')}
                    </div>
                    <div class="blacksmith-note-remind-row">
                        <label>Month<select name="remindMonth">${monthOptions}</select></label>
                        <label>Day<input type="number" name="remindDay" min="1" value="${seed.dayOfMonth + 1}"></label>
                        <label>Year<input type="number" name="remindYear" value="${toDisplayYear(calendar, seed.year)}"></label>
                        <label>Time
                            <span class="blacksmith-note-remind-time">
                                <input type="number" name="remindHour" min="0" max="${hoursPerDay - 1}" value="${seed.hour}">
                                <span>:</span>
                                <input type="number" name="remindMinute" min="0" max="${minutesPerHour - 1}" value="${seed.minute}">
                            </span>
                        </label>
                    </div>
                </div>`;
        }

        // ---- the real-time half ----

        // A single `datetime-local` rather than the world side's four fields. It
        // reads and writes LOCAL time, which is exactly what a person means by
        // "half past seven", and the browser already owns the picker. Nothing
        // here needs the calendar, which is why this half still works on a world
        // that has none.
        const realSeed = NoteReminders.getRealDue(this.note) ?? (Date.now() + (15 * 60 * 1000));
        const realShortcuts = [
            { label: 'In 15 minutes', ms: 15 * 60 * 1000 },
            { label: 'In an hour', ms: 60 * 60 * 1000 },
            { label: 'In 3 hours', ms: 3 * 60 * 60 * 1000 },
            { label: 'Tomorrow', ms: 24 * 60 * 60 * 1000 }
        ];

        const realPane = `
            <div class="blacksmith-note-remind-pane" data-pane="${REMINDER_CLOCKS.REAL}">
                <div class="blacksmith-note-remind-shortcuts">
                    ${realShortcuts.map((s) => `<button type="button" data-real-offset="${s.ms}">${s.label}</button>`).join('')}
                </div>
                <div class="blacksmith-note-remind-row">
                    <label>Date and time
                        <input type="datetime-local" name="remindReal" value="${NoteEditorWindow._toLocalInput(realSeed)}">
                    </label>
                </div>
                <p class="blacksmith-note-remind-note">Your own clock. This only reaches you while Foundry is open.</p>
            </div>`;

        // ---- one dialog, two panes ----

        // A segmented switch rather than two separate buttons in the footer or two
        // dialogs. The plan's rule is that the two calendars must never be
        // mistakable for each other, and a switch that names both is the clearest
        // way to say "these are different kinds of thing" at the moment of choosing.
        const tab = (value, icon, label) =>
            `<label class="blacksmith-note-remind-tab">
                <input type="radio" name="remindClock" value="${value}"${startClock === value ? ' checked' : ''}>
                <span><i class="fa-solid ${icon}"></i> ${label}</span>
            </label>`;

        const { action, value } = await DialogAPI.prompt({
            title: 'Remind me about this note',
            submitLabel: 'Set Reminder',
            submitIcon: 'fa-solid fa-bell',
            position: { width: 460 },
            content: `
                <div class="blacksmith-note-remind-form" data-active="${startClock}">
                    <div class="blacksmith-note-remind-tabs">
                        ${calendar ? tab(REMINDER_CLOCKS.WORLD, 'fa-bell', 'In the world') : ''}
                        ${tab(REMINDER_CLOCKS.REAL, 'fa-clock', 'Real time')}
                    </div>
                    ${worldPane}
                    ${realPane}
                </div>`,
            // The shortcuts write into the fields rather than resolving to a time of
            // their own, so what is submitted is always what is on screen.
            // `attach` receives the DIALOG element, not the form -- `root.elements`
            // is a form-only collection, so the fields are found by name attribute.
            controls: {
                attach: (root) => {
                    const form = root.querySelector('.blacksmith-note-remind-form');
                    const field = (name) => root.querySelector(`[name="${name}"]`);
                    const set = (name, value) => {
                        const input = field(name);
                        if (input) input.value = String(value);
                    };

                    // Which pane is showing is a data attribute rather than inline
                    // display, so the rule lives in CSS with the rest of the layout.
                    for (const radio of root.querySelectorAll('[name="remindClock"]')) {
                        radio.addEventListener('change', () => {
                            if (radio.checked && form) form.dataset.active = radio.value;
                        });
                    }

                    for (const button of root.querySelectorAll('[data-world-offset]')) {
                        button.addEventListener('click', () => {
                            if (!calendar) return;
                            const at = (game.time?.worldTime ?? 0) + Number(button.dataset.worldOffset);
                            const parts = calendar.timeToComponents(at);
                            set('remindMonth', parts.month);
                            set('remindDay', parts.dayOfMonth + 1);
                            set('remindYear', toDisplayYear(calendar, parts.year));
                            set('remindHour', parts.hour);
                            set('remindMinute', parts.minute);
                        });
                    }

                    for (const button of root.querySelectorAll('[data-real-offset]')) {
                        button.addEventListener('click', () => {
                            set('remindReal', NoteEditorWindow._toLocalInput(Date.now() + Number(button.dataset.realOffset)));
                        });
                    }
                }
            },
            getValue: (root) => {
                const clockValue = root.elements.remindClock?.value ?? REMINDER_CLOCKS.WORLD;

                if (clockValue === REMINDER_CLOCKS.REAL) {
                    // `datetime-local` has no timezone, and `new Date` reads it as
                    // LOCAL time -- which is what the person typing it meant. The
                    // stored value is the resulting absolute instant, so it stays
                    // correct for a player in another country.
                    const raw = root.elements.remindReal?.value ?? '';
                    const at = raw ? new Date(raw).getTime() : NaN;
                    return { clock: REMINDER_CLOCKS.REAL, at };
                }

                // `timeFromDate` rather than `componentsToTime` directly: core reads
                // `day` as the day of the YEAR and silently drops a month and a day
                // of the month, so every date built the obvious way lands on day
                // zero. See utility-calendar.js.
                return {
                    clock: REMINDER_CLOCKS.WORLD,
                    at: timeFromDate(calendar, {
                        year: toInternalYear(calendar, Number(root.elements.remindYear?.value)),
                        // Zero-based on the way in, one-based on screen. Foundry's
                        // calendar counts months and days from zero; nobody writing
                        // a date does.
                        month: Number(root.elements.remindMonth?.value) || 0,
                        dayOfMonth: Math.max(0, (Number(root.elements.remindDay?.value) || 1) - 1),
                        hour: Number(root.elements.remindHour?.value) || 0,
                        minute: Number(root.elements.remindMinute?.value) || 0,
                        second: 0
                    })
                };
            },
            validate: (entered) => {
                if (!Number.isFinite(entered?.at)) {
                    return entered?.clock === REMINDER_CLOCKS.REAL
                        ? 'Choose a date and time.'
                        : 'That is not a date this calendar has.';
                }
                // Only the real clock can be checked against now. World time runs
                // backwards routinely -- a GM rewinding is ordinary -- so a past
                // in-world date is a legitimate thing to ask for.
                if (entered.clock === REMINDER_CLOCKS.REAL && entered.at <= Date.now()) {
                    return 'That time has already passed.';
                }
                return null;
            }
        });

        if (action !== DialogAPI.ACTIONS.SUBMIT || !Number.isFinite(value?.at)) return;

        await NoteReminders.setFor(value.clock, this.note, value.at);
        this.render(false);
    }

    /** Every character in the strip -- all non-GM users. */
    _allPlayerIds() {
        return (this._userList?.entities ?? []).map((e) => e.id);
    }

    /**
     * Derive the mode from the toggles and show it.
     *
     * The mode is a readout, not an input. Party is "all of them selected", which
     * is the author's model: the user should not have to reason about which
     * exclusive set they are in, only about who is ticked.
     */
    _syncAccess() {
        const root = this.element;
        if (!root) return;
        const badge = root.querySelector('.blacksmith-note-mode');
        if (!badge) return;

        const everybody = this._allPlayerIds();
        const selected = this._userList?.getSelectedIds?.() ?? [];
        const allSelected = everybody.length > 0 && selected.length === everybody.length;

        // Reflect each avatar's state as a class. The checkbox stays the source of
        // truth; this is only what makes the accent border visible.
        for (const label of root.querySelectorAll('.blacksmith-note-user')) {
            label.classList.toggle('selected', !!label.querySelector('input')?.checked);
        }

        // All of them ticked IS the party, however it was arrived at.
        // Mirrors noteAccessMode's rules against the LIVE ticks rather than saved
        // ownership -- the badge has to move as you click, before anything is
        // written. The saved-state version is what the list row uses.
        const shown = noteAccessBadge({
            total: everybody.length,
            selected: selected.length
        });

        badge.dataset.mode = shown.mode;
        badge.innerHTML = `<i class="${shown.icon}"></i>`;
        badge.dataset.tooltip = shown.label;
    }

    /** Mark chips that are already in the field. Cheap enough to run on every keystroke. */
    _syncTagChips() {
        const root = this.element;
        const input = root?.querySelector('[name="note-tags"]');
        if (!input) return;
        const current = new Set(input.value.split(',').map((t) => t.trim()).filter(Boolean));
        for (const button of root.querySelectorAll('.blacksmith-note-tag-suggestions button')) {
            button.classList.toggle('selected', current.has(button.dataset.tag));
        }
    }

    // ==============================================================
    // ===== THE PIN ================================================
    // ==============================================================

    /**
     * Ensure the note has a pin, creating an unplaced one if not.
     *
     * Unplaced is a first-class Pins state, not a workaround -- its store exists
     * for exactly this. The note carries only `pinId`; the icon and design live on
     * the pin, so there is one copy rather than two to keep in step.
     */
    async _ensurePin() {
        if (!this.note) {
            ui.notifications.warn('Save the note first.');
            return null;
        }
        const existing = this._pin();
        if (existing) return existing;

        const pin = await PinsAPI.create(NotesManager.buildNotePinData(this.note));
        if (!pin) return null;

        await this.note.setFlag(MODULE.ID, 'pinId', pin.id);
        return pin;
    }

    /** Open pin config. This window began life as Squire's note icon picker. */
    async _configureIcon() {
        const pin = await this._ensurePin();
        if (!pin) return;
        await PinConfigWindow.open(pin.id, {
            moduleId: MODULE.ID,
            onSelect: () => void this.render(false)
        });
    }

    async _place() {
        const pin = await this._ensurePin();
        if (!pin) return;
        if (!canvas?.scene) {
            ui.notifications.warn('Open a scene first.');
            return;
        }
        ui.notifications.info('Click the map to place this note. Esc cancels.');
        // Placement is Pins' interaction, not this window's -- there is one
        // placement implementation and this is not it.
        await this.close();
        Hooks.callAll('blacksmith.notes.requestPlacement', { noteUuid: this.noteUuid, pinId: pin.id });
    }

    async _unpin() {
        const { NotePlacementManager } = await import('./manager-note-placement.js');
        await NotePlacementManager.unplace(this.note);
        await this.render(false);
    }

    // ==============================================================
    // ===== SAVE ===================================================
    // ==============================================================

    _readForm() {
        const root = this.element;
        const raw = root?.querySelector('[name="note-tags"]')?.value ?? '';
        // Everyone selected is STORED as party, not as a list of the people who
        // exist today. That is the whole reason the normalisation happens here:
        // ownership is rebuilt from the party flag, so a player who joins next
        // session can open the note without anybody editing it.
        const everybody = this._allPlayerIds();
        const picked = this._userList?.getSelectedIds?.() ?? [];
        const everyone = everybody.length > 0 && picked.length === everybody.length;
        const shape = everyone ? NOTE_VISIBILITY.PARTY : NOTE_VISIBILITY.PRIVATE;
        return {
            title: root?.querySelector('[name="note-title"]')?.value ?? '',
            content: this._editor?.value ?? '',
            shape,
            // getSelectedIds, not getSelection: the latter returns entity objects,
            // and an object used as an ownership key stringifies to "[object Object]"
            // -- which Foundry rejects as "not a mapping of user IDs".
            // Dropped when it is the party: PARTY already grants every player, and a
            // stale list would make the note read as shared-with-three.
            sharedWith: everyone ? [] : picked,
            // The author giving up their own access is how a note is handed over. A
            // GM author is never in the strip and always owns the note anyway.
            keepAuthor: game.user.isGM || everyone || picked.includes(game.user.id),
            tags: raw.split(',').map((t) => t.trim()).filter(Boolean)
        };
    }

    /**
     * Persist the editor's body to the page.
     *
     * NOTHING ELSE DOES THIS. `HTMLProseMirrorElement`'s own save only updates the
     * element's internal `_value` and fires a `change` event
     * (client/applications/elements/prosemirror-editor.mjs) -- in a journal sheet
     * that event bubbles to the sheet's form and the SHEET writes the document.
     * This window is not a sheet, so the body only ever reached disk through
     * collaborative step sync on the server, which is why an edit appeared if you
     * waited and was lost if you closed first. Even the toolbar's save button did
     * nothing here, for the same reason.
     *
     * @param {string|null} html
     */
    async _commitBody(html) {
        if (!this.note || typeof html !== 'string') return;
        if (html === (this.note.text?.content ?? '')) return;
        try {
            await this.note.update({ 'text.content': html });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Notes: could not save the note body', error?.message ?? error, false, false);
        }
    }

    /** Commit after a pause in typing. */
    _commitSoon() {
        clearTimeout(this._commitTimer);
        this._commitTimer = setTimeout(() => void this._commit(), 600);
    }

    /** Commit now, cancelling any pending debounce. */
    async _commitNow() {
        clearTimeout(this._commitTimer);
        await this._commit();
    }

    /**
     * Write the fields an existing note owns, as they change.
     *
     * There is no Save button. The body never needed one -- collaborative editing
     * has been writing it as you type since the beginning -- and title, access, and
     * tags are small enough to commit on change. Serialised through `_committing`
     * so a fast typist plus an access toggle cannot interleave two updates.
     */
    async _commit() {
        if (!this.note || this._committing) return;
        this._committing = true;
        try {
            const form = this._readForm();
            const visibility = form.shape === NOTE_VISIBILITY.PARTY
                ? NOTE_VISIBILITY.PARTY
                : NOTE_VISIBILITY.PRIVATE;
            await NotesManager.updateNote(this.note, {
                title: form.title,
                // Never the body: the collaborative editor owns it, and posting a
                // snapshot here would clobber whatever a co-editor added.
                content: null,
                visibility,
                sharedWith: form.sharedWith,
                keepAuthor: form.keepAuthor
            });
            await NotesManager.setNoteTags(this.note, form.tags);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Notes: could not save the note', error?.message ?? error, false, false);
        } finally {
            this._committing = false;
        }
    }

    /**
     * Closing is how a new note comes into being, and how a pending edit lands.
     *
     * An EMPTY new note is never created -- that is what keeps this from becoming
     * Squire's orphan problem, where a page appeared on first interaction and a
     * click that went nowhere left "Untitled Note" behind. Nothing typed, nothing
     * written. Anything typed is kept, because with no Save button the only other
     * reading of Close is "throw away what I just wrote".
     */
    async close(options = {}) {
        if (this._discarded) return super.close(options);

        if (this.note) {
            // Body first, then the fields. Both before the window goes: closing
            // removes the editor element, and whatever it held is gone with it.
            await this._commitBody(this._editor?.value ?? null);
            await this._commitNow();
            return super.close(options);
        }

        const form = this._readForm();
        const bodyText = (() => {
            const div = document.createElement('div');
            div.innerHTML = String(form.content ?? '');
            return (div.textContent ?? '').trim();
        })();
        if (!form.title.trim() && !bodyText) return super.close(options);

        const page = await NotesManager.createNote({
            title: form.title,
            content: form.content,
            visibility: form.shape === NOTE_VISIBILITY.PARTY ? NOTE_VISIBILITY.PARTY : NOTE_VISIBILITY.PRIVATE,
            tags: form.tags,
            sharedWith: form.sharedWith,
            keepAuthor: form.keepAuthor
        });
        if (page) {
            this.note = page;
            this.noteUuid = page.uuid;
        }
        return super.close(options);
    }

    _onClose(options) {
        clearTimeout(this._commitTimer);
        if (this.noteUuid && NoteEditorWindow._open.get(this.noteUuid) === this) {
            NoteEditorWindow._open.delete(this.noteUuid);
        }
        HookManager.disposeByContext?.(this._hookContext);
        super._onClose?.(options);
    }
}

/**
 * Open the editor for a note, or a blank one.
 *
 * @param {object} [options]
 * @param {JournalEntryPage|string} [options.note] omit to create
 * @returns {Promise<NoteEditorWindow|null>}
 */
export async function openNoteEditor({ note = null } = {}) {
    const page = typeof note === 'string' ? fromUuidSync(note) : note;

    if (page) {
        if (!NotesManager.isNote(page)) {
            ui.notifications.warn('That journal page is not a note.');
            return null;
        }
        // One editor per note. Collaboration handles two people, but two windows
        // over one document on ONE client is just a way to lose your own writing.
        const existing = NoteEditorWindow._open.get(page.uuid);
        if (existing) {
            existing.bringToFront?.();
            return existing;
        }
        if (!page.isOwner) {
            ui.notifications.warn('You do not have permission to edit that note.');
            return null;
        }
    } else if (!NotesManager.getNotesJournal()) {
        ui.notifications.error('No notes journal is selected. A GM sets one in Blacksmith settings.');
        return null;
    }

    const window = new NoteEditorWindow({ note: page ?? null });
    await window.render(true);
    return window;
}

/** Register the editor so any module or macro can open it by id. */
export function registerNoteEditorWindow() {
    registerWindow(NOTE_EDITOR_WINDOW_ID, {
        moduleId: MODULE.ID,
        title: 'Note',
        open: async (options = {}) => openNoteEditor(options)
    });
}
