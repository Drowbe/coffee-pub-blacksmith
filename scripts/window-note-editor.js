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
// from. Here the page is created on save.
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
import { NotesManager, NOTE_VISIBILITY, NOTE_TAG_CONTEXT, noteIconHtml } from './manager-notes.js';
import { HookManager } from './manager-hooks.js';
import { PinsAPI } from './api-pins.js';
import { TagsAPI } from './api-tags.js';
import { EntityListAPI } from './api-entity-list.js';
import { PinConfigWindow } from './window-pin-configuration.js';
import { PIN_ACCESS_ICONS } from './pin-permission-icons.js';

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
        if (this.noteUuid) NoteEditorWindow._open.set(this.noteUuid, this);

        this._hookContext = `note-editor:${this.id}`;

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
                ui.notifications.warn(`"${page.name}" is no longer shared with you.`);
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
        // written on save and never consulted to draw the window.
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
        const players = EntityListAPI.providers
            .fromUsers({ includeGM: false, disableOffline: false })
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
            toolFooterLeft: author
                ? `<span class="blacksmith-note-meta">${foundry.utils.escapeHTML(author.name)}</span>`
                : '',
            toolFooterRight:
                pinButton +
                '<button type="button" class="blacksmith-window-btn-secondary" data-note-action="cancel">' +
                '<i class="fas fa-xmark"></i> Close</button>' +
                '<button type="button" class="blacksmith-window-btn-primary" data-note-action="save">' +
                '<i class="fas fa-floppy-disk"></i> Save</button>'
        };
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
        if (!host || host.querySelector('prose-mirror')) return;

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
            });
        }
        tagInput?.addEventListener('input', () => this._syncTagChips());
        this._syncTagChips();

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
        on('save', () => void this._save());
        on('cancel', () => void this.close());
        on('icon', () => void this._configureIcon());
        on('place', () => void this._place());
        on('unpin', () => void this._unpin());
        on('pan', () => void PinsAPI.panTo?.(this.note?.getFlag(MODULE.ID, 'pinId')));
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
        // Nobody ticked means different things to different people: a GM still sees
        // it, a player is describing a note only they can open.
        const mode = allSelected
            ? 'party'
            : selected.length
                ? 'shared'
                : game.user.isGM ? 'gm' : 'private';

        const shown = {
            // The helmet is the party mark everywhere else in Blacksmith, and
            // user-shield is the GM mark -- both taken from the vocabulary the pin
            // permission UI already uses (scripts/pin-permission-icons.js).
            party: { icon: 'fa-solid fa-helmet-battle', label: 'Everyone in the party' },
            shared: { icon: 'fa-solid fa-user-group', label: `Shared with ${selected.length}` },
            gm: { icon: PIN_ACCESS_ICONS.gm, label: 'GMs only' },
            private: { icon: 'fa-solid fa-lock', label: 'Only me' }
        }[mode];

        badge.dataset.mode = mode;
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

    async _save() {
        const form = this._readForm();
        const visibility = form.shape === NOTE_VISIBILITY.PARTY
            ? NOTE_VISIBILITY.PARTY
            : NOTE_VISIBILITY.PRIVATE;

        if (!this.note) {
            const page = await NotesManager.createNote({
                title: form.title,
                content: form.content,
                visibility,
                tags: form.tags,
                sharedWith: form.sharedWith,
                keepAuthor: form.keepAuthor
            });
            if (!page) return;
            this.note = page;
            this.noteUuid = page.uuid;
            NoteEditorWindow._open.set(page.uuid, this);
            ui.notifications.info(`Created "${page.name}".`);
            return this.close();
        }

        // Content is omitted when collaborative: the editor has been writing to the
        // page as you type, and posting a stale snapshot here would clobber whatever
        // a co-editor added since this window last rendered.
        const updated = await NotesManager.updateNote(this.note, {
            title: form.title,
            content: this.noteUuid ? null : form.content,
            visibility,
            sharedWith: form.sharedWith,
            keepAuthor: form.keepAuthor
        });
        if (!updated) return;
        await NotesManager.setNoteTags(this.note, form.tags);
        return this.close();
    }

    _onClose(options) {
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
