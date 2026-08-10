// ==================================================================
// ===== NOTES LIST =================================================
// ==================================================================
//
// Every note you can see, with search and tag filters, and the pin
// controls that make a note more than a journal page.
//
// ONE menubar tool, not two. Left-click opens this list; right-click
// carries Quick Note, Open Notes, and the user's favourites. A separate
// quick-note button was a second icon for what is one feature.
//
// WHAT IS DELIBERATELY ABSENT. Squire's panel also had a scene dropdown,
// an ALL/PARTY/PRIVATE toggle, and a sort control -- five mechanisms on
// one list, which is a fair share of the "klunky and just too much" the
// author named. Search and tags answer "find the bob notes"; the rest
// answered questions nobody asked. Privacy is shown on each row because
// seeing it and filtering by it are different things.
//
// Sort is favourites first, then newest, and is not a control.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { BlacksmithToolWindowBaseV2 } from './window-tool-base.js';
import { HookManager } from './manager-hooks.js';
import { registerWindow } from './api-windows.js';
import { MenuBar } from './api-menubar.js';
import { NotesManager, NOTE_VISIBILITY, noteIconHtml } from './manager-notes.js';
import { NotePlacementManager } from './manager-note-placement.js';
import { PinsAPI } from './api-pins.js';
import { openNoteEditor } from './window-note-editor.js';

export const NOTES_WINDOW_ID = 'blacksmith-notes';

/** Strip HTML to plain text for search and the hover preview. */
function toText(html) {
    const div = document.createElement('div');
    div.innerHTML = String(html ?? '');
    return (div.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export class NotesWindow extends BlacksmithToolWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-tool-root';

    static activeWindow = null;

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'blacksmith-notes-window',
            classes: ['blacksmith-notes-tool-window'],
            position: { width: 440, height: 600 },
            window: { title: 'Notes', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 340, maxWidth: 760 },
            toolTitlebar: 'micro',
            rememberPosition: true,
            windowPositionKey: 'blacksmith-notes-tool-position',
            // Shared with the editor: Notes is one feature and should be one theme
            // the user switches once. Without this override each window would key
            // its theme off its own position key and they would drift apart.
            toolThemePreferenceKey: 'blacksmith-notes-theme',
            toolTitlebarPreferenceKey: 'blacksmith-notes-titlebar'
        }
    );

    static PARTS = {
        body: { template: 'modules/coffee-pub-blacksmith/templates/window-tool-template.hbs' }
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? NotesWindow.DEFAULT_OPTIONS.id;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, NotesWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, NotesWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        this.search = '';
        this.activeTags = new Set();
        this._hookContext = `notes-list:${this.id}`;
        NotesWindow.activeWindow = this;

        // Redraw on anything that changes what the list shows -- including pin
        // placement, since a row's pin indicator is part of the row.
        for (const name of [
            'blacksmith.notes.created', 'blacksmith.notes.updated', 'blacksmith.notes.deleted',
            'blacksmith.notes.placed', 'blacksmith.notes.unplaced'
        ]) {
            HookManager.registerHook({
                name,
                description: 'Notes list: redraw when a note changes',
                priority: 4,
                context: this._hookContext,
                callback: () => {
                    // --- BEGIN - HOOKMANAGER CALLBACK ---
                    void this.render(false);
                    // --- END - HOOKMANAGER CALLBACK ---
                }
            });
        }

        // Those hooks above are callAll on the client that made the change, so they
        // never reach anybody else. The Foundry document hooks DO propagate, which is
        // what makes "someone shared a note with me" appear without a reopen --
        // gaining ownership arrives as a create or an update depending on whether the
        // client already held the page. Filtered to this journal because they fire
        // for every page in the world and a redraw per unrelated page is waste.
        for (const name of ['createJournalEntryPage', 'updateJournalEntryPage', 'deleteJournalEntryPage']) {
            HookManager.registerHook({
                name,
                description: 'Notes list: redraw when a note changes on another client',
                priority: 4,
                context: this._hookContext,
                callback: (page) => {
                    // --- BEGIN - HOOKMANAGER CALLBACK ---
                    const journal = NotesManager.getNotesJournal();
                    if (journal && page?.parent?.id !== journal.id) return;
                    void this.render(false);
                    // --- END - HOOKMANAGER CALLBACK ---
                }
            });
        }
    }

    getToolHeaderActions() {
        return [
            ...(super.getToolHeaderActions?.() ?? []),
            {
                id: 'new-note',
                icon: 'fa-solid fa-plus',
                label: 'New Note',
                onClick: () => void openNoteEditor()
            }
        ];
    }

    // ==============================================================
    // ===== RENDER =================================================
    // ==============================================================

    /** Notes matching the current search and tag filters, newest first. */
    _visibleNotes() {
        const all = NotesManager.listNotes();
        const search = this.search.trim().toLowerCase();

        return all
            .filter((note) => {
                if (this.activeTags.size) {
                    const tags = NotesManager.getNoteTags(note);
                    // Any rather than all: picking two tags should widen the net,
                    // which is what "show me bob and phlan" means to a reader.
                    if (![...this.activeTags].some((t) => tags.includes(t))) return false;
                }
                if (!search) return true;
                return `${note.name} ${toText(note.text?.content)}`.toLowerCase().includes(search);
            })
            .sort((a, b) => {
                // Favourites first: they are the notes you came here for, and a
                // favourite that scrolled off with age would defeat the point.
                const af = NotesManager.isFavorite(a) ? 0 : 1;
                const bf = NotesManager.isFavorite(b) ? 0 : 1;
                if (af !== bf) return af - bf;
                const at = a.getFlag(MODULE.ID, 'timestamp') ?? '';
                const bt = b.getFlag(MODULE.ID, 'timestamp') ?? '';
                return String(bt).localeCompare(String(at));
            });
    }

    async getData() {
        if (!NotesManager.getNotesJournal()) {
            return {
                appId: this.id,
                bodyContent:
                    '<div class="blacksmith-notes-empty">' +
                    '<p>No notes journal is selected.</p>' +
                    '<p class="blacksmith-notes-empty-hint">A GM chooses one in Blacksmith settings, under Notes. ' +
                    'Give it <strong>All Players = Observer</strong> so players can write their own.</p></div>'
            };
        }

        const notes = this._visibleNotes();

        // Tag chips come from tags actually in use, so the list never offers a
        // filter that matches nothing.
        const counts = new Map();
        for (const note of NotesManager.listNotes()) {
            for (const tag of NotesManager.getNoteTags(note)) {
                counts.set(tag, (counts.get(tag) ?? 0) + 1);
            }
        }
        const chips = [...counts.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([tag, count]) => (
                `<button type="button" class="blacksmith-notes-chip${this.activeTags.has(tag) ? ' active' : ''}" ` +
                `data-tag="${foundry.utils.escapeHTML(tag)}">${foundry.utils.escapeHTML(tag)}<span>${count}</span></button>`
            ));

        const rows = notes.map((note) => {
            const pinId = note.getFlag(MODULE.ID, 'pinId');
            const pin = pinId ? PinsAPI.get(pinId) : null;
            const placed = !!pin?.sceneId;
            const visibility = note.getFlag(MODULE.ID, 'visibility') ?? NOTE_VISIBILITY.PRIVATE;
            const shared = Object.entries(note.ownership ?? {})
                .filter(([id, lvl]) => id !== 'default'
                    && lvl === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
                    && !game.users.get(id)?.isGM
                    && id !== note.getFlag(MODULE.ID, 'authorId'))
                .length;

            const privacy = visibility === NOTE_VISIBILITY.PARTY
                ? '<i class="fa-solid fa-users" title="The whole party"></i>'
                : shared
                    ? `<i class="fa-solid fa-user-group" title="Shared with ${shared} ${shared === 1 ? 'person' : 'people'}"></i>`
                    : '<i class="fa-solid fa-lock" title="Only me"></i>';

            const preview = toText(note.text?.content).slice(0, 140);

            const fav = NotesManager.isFavorite(note);

            return `
                <li class="blacksmith-note-row" data-uuid="${note.uuid}" data-tooltip="${foundry.utils.escapeHTML(preview)}">
                    <span class="blacksmith-note-row-icon">${noteIconHtml(pin?.image)}</span>
                    <div class="blacksmith-note-row-top">
                        <span class="blacksmith-note-row-name">${foundry.utils.escapeHTML(note.name)}</span>
                        <span class="blacksmith-note-row-flags">
                            ${fav ? '<i class="fa-solid fa-heart blacksmith-note-row-fav" title="Favourite"></i>' : ''}
                            ${privacy}
                        </span>
                    </div>
                    <div class="blacksmith-note-row-actions">
                        <button type="button" data-note-action="favorite"
                                title="${fav ? 'Remove from favourites' : 'Add to favourites'}">
                            <i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                        </button>
                        ${placed ? '<button type="button" data-note-action="pan" title="Show on the map"><i class="fa-solid fa-crosshairs"></i></button>' : ''}
                        ${placed
                            ? '<button type="button" data-note-action="unpin" title="Unpin"><i class="fa-solid fa-link-slash"></i></button>'
                            : '<button type="button" data-note-action="place" title="Place on the map"><i class="fa-solid fa-location-dot"></i></button>'}
                        <button type="button" data-note-action="edit" title="Edit"><i class="fa-solid fa-feather"></i></button>
                        ${note.isOwner ? '<button type="button" data-note-action="delete" title="Delete"><i class="fa-solid fa-trash"></i></button>' : ''}
                    </div>
                </li>`;
        });

        const body = `
            <div class="blacksmith-notes-search">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" name="notes-search" value="${foundry.utils.escapeHTML(this.search)}"
                       placeholder="Search notes" autocomplete="off">
                ${this.search ? '<button type="button" data-note-action="clear-search" title="Clear"><i class="fa-solid fa-xmark"></i></button>' : ''}
                <button type="button" class="blacksmith-notes-new" data-note-action="new" title="New note">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>
            ${chips.length ? `<div class="blacksmith-notes-chips">${chips.join('')}</div>` : ''}
            ${rows.length
                ? `<ul class="blacksmith-notes-list">${rows.join('')}</ul>`
                : `<div class="blacksmith-notes-empty"><p>${this.search || this.activeTags.size ? 'Nothing matches.' : 'No notes yet.'}</p>` +
                  '<p class="blacksmith-notes-empty-hint">Use the + beside the search box, or the note icon in the menubar.</p></div>'}
        `;

        return { appId: this.id, bodyContent: body };
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        const root = this.element?.querySelector?.('.blacksmith-window-tool-body');
        if (!root) return;

        const search = root.querySelector('[name="notes-search"]');
        if (search) {
            // Debounced: re-rendering the list on every keystroke rebuilds the input
            // and loses the caret.
            search.addEventListener('input', () => {
                clearTimeout(this._searchTimer);
                this._searchTimer = setTimeout(() => {
                    this.search = search.value;
                    void this.render(false);
                }, 200);
            });
            // Restore the caret after the debounced re-render put a new input here.
            if (this.search) {
                search.focus();
                search.setSelectionRange(search.value.length, search.value.length);
            }
        }

        root.querySelector('[data-note-action="new"]')
            ?.addEventListener('click', () => void openNoteEditor());

        root.querySelector('[data-note-action="clear-search"]')?.addEventListener('click', () => {
            this.search = '';
            void this.render(false);
        });

        for (const chip of root.querySelectorAll('.blacksmith-notes-chip')) {
            chip.addEventListener('click', () => {
                const tag = chip.dataset.tag;
                if (this.activeTags.has(tag)) this.activeTags.delete(tag);
                else this.activeTags.add(tag);
                void this.render(false);
            });
        }

        for (const row of root.querySelectorAll('.blacksmith-note-row')) {
            const uuid = row.dataset.uuid;
            const act = (action, handler) => row
                .querySelector(`[data-note-action="${action}"]`)
                ?.addEventListener('click', (ev) => { ev.stopPropagation(); handler(); });

            act('edit', () => void openNoteEditor({ note: uuid }));
            act('favorite', async () => {
                await NotesManager.toggleFavorite(uuid);
                void this.render(false);
            });
            act('delete', () => void this._confirmDelete(uuid));
            act('pan', () => {
                const pinId = fromUuidSync(uuid)?.getFlag(MODULE.ID, 'pinId');
                if (pinId) void PinsAPI.panTo(pinId);
            });
            act('unpin', () => void NotePlacementManager.unplace(uuid));
            act('place', () => void this._place(uuid));

            // The row itself opens the note; the buttons stop propagation above.
            row.addEventListener('click', () => void openNoteEditor({ note: uuid }));
        }
    }

    /** Placing needs a pin, which a note may not have yet. */
    async _place(uuid) {
        const note = fromUuidSync(uuid);
        if (!note) return;

        let pinId = note.getFlag(MODULE.ID, 'pinId');
        if (!pinId) {
            const pin = await PinsAPI.create(NotesManager.buildNotePinData(note));
            if (!pin) return;
            pinId = pin.id;
            await note.setFlag(MODULE.ID, 'pinId', pinId);
        }

        // Minimised rather than closed: placing is a map interaction, and the list
        // should be where you left it when you come back.
        await this.minimize?.();
        NotePlacementManager.begin({ noteUuid: uuid, pinId });
    }

    async _confirmDelete(uuid) {
        const note = fromUuidSync(uuid);
        if (!note) return;
        const attached = NotesManager.getByNote(note).length;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Delete Note' },
            content: `<p>Delete <strong>${foundry.utils.escapeHTML(note.name)}</strong>?</p>` +
                (attached ? `<p>It is attached to ${attached} thing(s). Those links go too.</p>` : '')
        }).catch(() => false);

        if (confirmed) await NotesManager.deleteNote(note);
    }

    _onClose(options) {
        clearTimeout(this._searchTimer);
        HookManager.disposeByContext(this._hookContext);
        NotesWindow.activeWindow = null;
        super._onClose?.(options);
    }
}

/** Open the notes list, or raise it. */
export async function openNotesWindow() {
    try {
        if (NotesWindow.activeWindow) {
            NotesWindow.activeWindow.maximize?.();
            NotesWindow.activeWindow.bringToFront?.();
            await NotesWindow.activeWindow.render(false);
            return NotesWindow.activeWindow;
        }
        const window = new NotesWindow();
        await window.render(true);
        return window;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Notes: failed to open the list', error?.message ?? error, false, false);
        ui.notifications.error('Failed to open Notes');
    }
}

/**
 * The note tool's right-click menu: the two actions, then your favourites.
 *
 * Built fresh on each open rather than at registration, so starring a note shows
 * up here immediately. Follows the Macros tool, which does the same thing with
 * the same shape.
 */
function buildNotesContextMenu() {
    const items = [
        { name: 'Quick Note', icon: 'fa-solid fa-square-plus', onClick: () => void openNoteEditor() },
        { name: 'Open Notes', icon: 'fa-solid fa-list', onClick: () => void openNotesWindow() }
    ];

    // Resolved through listNotes so a favourite you can no longer see -- unshared,
    // or deleted by its author -- does not appear as a dead row.
    const visible = new Map(NotesManager.listNotes().map((n) => [n.uuid, n]));
    const favorites = NotesManager.getFavorites()
        .map((uuid) => visible.get(uuid))
        .filter(Boolean);

    if (favorites.length) {
        items.push({ separator: true });
        for (const note of favorites) {
            const pinId = note.getFlag(MODULE.ID, 'pinId');
            const pin = pinId ? PinsAPI.get(pinId) : null;
            items.push({
                name: note.name,
                // The note's own icon, so the menu reads the way the list does.
                icon: noteIconHtml(pin?.image),
                onClick: () => void openNoteEditor({ note: note.uuid })
            });
        }
    }

    return items;
}

/** Register the list and its single menubar tool. */
export function registerNotesWindow() {
    registerWindow(NOTES_WINDOW_ID, {
        moduleId: MODULE.ID,
        title: 'Notes',
        open: async () => openNotesWindow()
    });

    MenuBar.registerMenubarTool('notes', {
        icon: 'fa-solid fa-note-sticky',
        name: 'notes',
        title: null,
        tooltip: 'Notes',
        onClick: () => openNotesWindow(),
        // Right-click carries everything else: writing one without opening the list
        // first, and jumping straight to a favourite.
        contextMenuItems: () => buildNotesContextMenu(),
        zone: 'left',
        group: 'general',
        order: 204,
        moduleId: MODULE.ID,
        gmOnly: false,
        leaderOnly: false,
        visible: true
    });

}
