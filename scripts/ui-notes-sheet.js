// ==================================================================
// ===== UI-NOTES-SHEET – GM Notes panel injection (Items) ==========
// ==================================================================
// Injects a GM-only, collapsible "GM Notes" panel into dnd5e item
// sheets (ItemSheet5e + ContainerSheet), mirroring the way the
// Artificer module appends its properties panel. The panel is just
// another consumer of NotesAPI — no storage logic lives here.
//
// v1 scope: Items only. Actors are a fast-follow using the same panel.
// Editor is a textarea for the spike; the data model already stores
// { html, text } so a ProseMirror upgrade is a drop-in, no API change.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { NotesAPI } from './api-notes.js';

// Item sheet render hooks in dnd5e 5.x (AppV2). ItemSheet5e is the
// default for all item types; ContainerSheet handles containers.
const ITEM_SHEET_HOOKS = ['renderItemSheet5e', 'renderContainerSheet'];

// Debounce window for autosave-while-typing (ms).
const AUTOSAVE_DELAY = 600;

export class NotesSheetUI {

    // textarea element -> pending save timer
    static _timers = new WeakMap();

    static initialize() {
        for (const name of ITEM_SHEET_HOOKS) {
            HookManager.registerHook({
                name,
                description: 'Blacksmith: Inject GM Notes panel into item sheets',
                context: 'blacksmith-gm-notes-item',
                priority: 3,
                callback: NotesSheetUI._onRenderItemSheet
            });
        }
        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | NOTES GM Notes item-sheet UI initialized', '', false, false);
    }

    // ------------------------------------------------------------
    // Render hook
    // ------------------------------------------------------------

    static _onRenderItemSheet(app, html, _data) {
        // UI-gated: players never see the tab (per project decision).
        if (!game.user?.isGM) return;

        // AppV2 passes a native element; tolerate jQuery / app.element too.
        let root = html?.jquery ? html[0] : html;
        if (!root) root = app?.element?.jquery ? app.element[0] : app?.element;
        const doc = app?.document ?? app?.object;
        if (!root || !doc) return;

        // Idempotent: a single sheet render injects one panel.
        if (root.querySelector('.blacksmith-gm-notes')) return;

        const panel = NotesSheetUI._buildPanel(doc);
        const host = root.querySelector('.window-content') || root;
        host.appendChild(panel);
    }

    // ------------------------------------------------------------
    // Panel construction
    // ------------------------------------------------------------

    static _buildPanel(doc) {
        const note = NotesAPI.get(doc.uuid);
        const hasNote = !!(note && (note.html || note.text));

        const panel = document.createElement('section');
        panel.className = `blacksmith-gm-notes${hasNote ? ' has-notes' : ''}`;

        const header = document.createElement('header');
        header.className = 'blacksmith-gm-notes-header';
        header.innerHTML = `
            <i class="fas fa-chevron-down blacksmith-gm-notes-caret"></i>
            <i class="fas fa-feather blacksmith-gm-notes-icon"></i>
            <span class="blacksmith-gm-notes-title">GM Notes</span>
            <span class="blacksmith-gm-notes-status" aria-live="polite"></span>
        `;

        const body = document.createElement('div');
        body.className = 'blacksmith-gm-notes-body';

        const textarea = document.createElement('textarea');
        textarea.className = 'blacksmith-gm-notes-input';
        textarea.rows = 6;
        textarea.placeholder = 'GM-only notes for this item — plot hooks, reveals, associations…';
        textarea.value = note?.html ?? '';

        body.appendChild(textarea);
        panel.appendChild(header);
        panel.appendChild(body);

        // Collapse / expand.
        header.addEventListener('click', () => panel.classList.toggle('collapsed'));

        // Autosave (debounced). Stop propagation so keystrokes don't bubble
        // into sheet-level handlers.
        const status = header.querySelector('.blacksmith-gm-notes-status');
        textarea.addEventListener('keydown', (ev) => ev.stopPropagation());
        textarea.addEventListener('input', () => NotesSheetUI._scheduleSave(doc, textarea, status, panel));

        return panel;
    }

    static _scheduleSave(doc, textarea, status, panel) {
        clearTimeout(NotesSheetUI._timers.get(textarea));
        status.textContent = '…';
        const timer = setTimeout(async () => {
            const envelope = await NotesAPI.set(doc.uuid, { html: textarea.value });
            if (envelope) {
                status.textContent = 'Saved';
                panel.classList.toggle('has-notes', !!(envelope.html || envelope.text));
                setTimeout(() => { if (status.textContent === 'Saved') status.textContent = ''; }, 1500);
            } else {
                status.textContent = 'Save failed';
            }
        }, AUTOSAVE_DELAY);
        NotesSheetUI._timers.set(textarea, timer);
    }
}
