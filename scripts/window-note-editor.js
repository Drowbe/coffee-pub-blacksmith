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
import { NotesManager, NOTE_VISIBILITY, NOTE_TAG_CONTEXT } from './manager-notes.js';
import { PinsAPI } from './api-pins.js';
import { TagsAPI } from './api-tags.js';
import { EntityListAPI } from './api-entity-list.js';
import { PinConfigWindow } from './window-pin-configuration.js';

export const NOTE_EDITOR_WINDOW_ID = 'blacksmith-note-editor';

/** Visibility shapes offered in the editor. `shared` reveals the user picker. */
const SHARED = 'shared';

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

    /** Current visibility shape, derived from ownership rather than the flag. */
    _currentVisibility() {
        if (!this.note) return NOTE_VISIBILITY.PRIVATE;
        const flag = this.note.getFlag(MODULE.ID, 'visibility');
        if (flag === NOTE_VISIBILITY.PARTY) return NOTE_VISIBILITY.PARTY;
        // Anyone owning it who is neither the author nor a GM means it was shared
        // with named people. Read from ownership because ownership is what is
        // enforced; the flag only records intent.
        const authorId = this.note.getFlag(MODULE.ID, 'authorId');
        const shared = this._sharedUserIds();
        return shared.length && shared.some((id) => id !== authorId) ? SHARED : NOTE_VISIBILITY.PRIVATE;
    }

    /** Non-GM, non-author users who own this note. */
    _sharedUserIds() {
        if (!this.note) return [];
        const authorId = this.note.getFlag(MODULE.ID, 'authorId');
        const users = this.note.ownership ?? {};
        return Object.entries(users)
            .filter(([id, level]) => (
                id !== 'default'
                && level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
                && id !== authorId
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
        const visibility = this._currentVisibility();
        const tags = this.note ? NotesManager.getNoteTags(this.note) : [];
        const authorId = this.note?.getFlag(MODULE.ID, 'authorId') ?? null;
        const author = authorId ? game.users.get(authorId) : null;
        const pin = this._pin();

        // Suggestions come from the shared taxonomy, so a note tag and a pin tag
        // are the same tag rather than two spellings of one.
        const choices = TagsAPI.getChoices?.(NOTE_TAG_CONTEXT) ?? [];
        const suggestions = choices
            .map((choice) => choice?.key)
            .filter((key) => key && !tags.includes(key))
            .slice(0, 14);

        this._userList = EntityListAPI.create({
            entities: EntityListAPI.providers.fromUsers({ includeGM: false, disableOffline: false }),
            mode: EntityListAPI.MODES.MULTI,
            inputName: 'note-shared-with',
            selected: this._sharedUserIds(),
            emptyMessage: 'No other players in this world.'
        });

        const body = `
            <div class="blacksmith-note-editor-head">
                <input type="text" name="note-title" class="blacksmith-note-title"
                       value="${foundry.utils.escapeHTML(this.note?.name ?? '')}"
                       placeholder="Untitled Note" autocomplete="off">
                <button type="button" class="blacksmith-note-icon-btn" data-note-action="icon"
                        title="${pin ? 'Configure this note’s icon and pin' : 'Choose an icon for this note'}">
                    ${pin ? '<i class="fa-solid fa-palette"></i>' : '<i class="fa-solid fa-circle-plus"></i>'}
                    <span>${pin ? 'Icon' : 'Add icon'}</span>
                </button>
            </div>

            <div class="blacksmith-note-editor-host"></div>

            <div class="blacksmith-note-editor-strip">
                <label class="blacksmith-note-vis">
                    <span>Who can see this</span>
                    <select name="note-visibility">
                        <option value="${NOTE_VISIBILITY.PRIVATE}" ${visibility === NOTE_VISIBILITY.PRIVATE ? 'selected' : ''}>Only me</option>
                        <option value="${NOTE_VISIBILITY.PARTY}" ${visibility === NOTE_VISIBILITY.PARTY ? 'selected' : ''}>The whole party</option>
                        <option value="${SHARED}" ${visibility === SHARED ? 'selected' : ''}>Just these people…</option>
                    </select>
                </label>

                <div class="blacksmith-note-shared${visibility === SHARED ? '' : ' hidden'}">
                    ${this._userList.html}
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

        const vis = root.querySelector('[name="note-visibility"]');
        const shared = root.querySelector('.blacksmith-note-shared');
        vis?.addEventListener('change', () => {
            shared?.classList.toggle('hidden', vis.value !== SHARED);
        });

        // Suggestions append rather than replace: the field is the source of truth
        // and a click should never discard what was typed.
        for (const button of root.querySelectorAll('.blacksmith-note-tag-suggestions button')) {
            button.addEventListener('click', () => {
                const input = root.querySelector('[name="note-tags"]');
                if (!input) return;
                const current = input.value.split(',').map((t) => t.trim()).filter(Boolean);
                if (!current.includes(button.dataset.tag)) current.push(button.dataset.tag);
                input.value = current.join(', ');
                button.remove();
            });
        }

        const on = (action, handler) => root
            .querySelector(`[data-note-action="${action}"]`)
            ?.addEventListener('click', handler);

        on('save', () => void this._save());
        on('cancel', () => void this.close());
        on('icon', () => void this._configureIcon());
        on('place', () => void this._place());
        on('unpin', () => void this._unpin());
        on('pan', () => void PinsAPI.panTo?.(this.note?.getFlag(MODULE.ID, 'pinId')));
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
        const shape = root?.querySelector('[name="note-visibility"]')?.value ?? NOTE_VISIBILITY.PRIVATE;
        return {
            title: root?.querySelector('[name="note-title"]')?.value ?? '',
            content: this._editor?.value ?? '',
            shape,
            // getSelectedIds, not getSelection: the latter returns entity objects,
            // and an object used as an ownership key stringifies to "[object Object]"
            // -- which Foundry rejects as "not a mapping of user IDs".
            sharedWith: shape === SHARED ? (this._userList?.getSelectedIds?.() ?? []) : [],
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
                sharedWith: form.sharedWith
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
            sharedWith: form.sharedWith
        });
        if (!updated) return;
        await NotesManager.setNoteTags(this.note, form.tags);
        return this.close();
    }

    _onClose(options) {
        if (this.noteUuid && NoteEditorWindow._open.get(this.noteUuid) === this) {
            NoteEditorWindow._open.delete(this.noteUuid);
        }
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
