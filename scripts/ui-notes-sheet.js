// ==================================================================
// ===== UI-NOTES-SHEET – GM Notes read card (Items) ================
// ==================================================================
// Injects a GM-only, read-only "GM Notes" card into dnd5e item sheets.
// The card is an at-a-glance enriched view; clicking the feather opens
// the canonical editor window (window-notes.js) — editing never happens
// inside the host sheet, which is what kept breaking.
//
// The card is intentionally read-only here: no embedded editor means no
// interaction conflict with dnd5e's form. It live-refreshes when a note
// changes via the NotesAPI change hook.
//
// v1 scope: Items. Actors/journals reuse the SAME window; only this thin
// read-card injection is item-specific.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { NotesAPI } from './api-notes.js';
import { NotesWindow } from './window-notes.js';

// Item sheet render hooks in dnd5e 5.x (AppV2). ItemSheet5e is the
// default for all item types; ContainerSheet handles containers.
const ITEM_SHEET_HOOKS = ['renderItemSheet5e', 'renderContainerSheet'];

export class NotesSheetUI {

    static initialize() {
        for (const name of ITEM_SHEET_HOOKS) {
            HookManager.registerHook({
                name,
                description: 'Blacksmith: Inject GM Notes read card into item sheets',
                context: 'blacksmith-gm-notes-item',
                priority: 3,
                callback: NotesSheetUI._onRenderItemSheet
            });
        }
        // Live-refresh any open cards when a note is saved/cleared.
        Hooks.on(NotesAPI.CHANGE_HOOK, ({ uuid }) => NotesSheetUI._refreshCards(uuid));
        postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | NOTES GM Notes item-sheet UI initialized', '', false, false);
    }

    // ------------------------------------------------------------
    // Render hook
    // ------------------------------------------------------------

    static _onRenderItemSheet(app, html, _data) {
        // UI-gated: players never see the card (per project decision).
        if (!game.user?.isGM) return;

        // AppV2 passes a native element; tolerate jQuery / app.element too.
        let root = html?.jquery ? html[0] : html;
        if (!root) root = app?.element?.jquery ? app.element[0] : app?.element;
        const doc = app?.document ?? app?.object;
        if (!root || !doc) return;

        // Idempotent: one card per render.
        if (root.querySelector('.blacksmith-gm-notes')) return;

        const host = root.querySelector('.tab.description .item-descriptions')
            || root.querySelector('.tab.description')
            || root.querySelector('.window-content')
            || root;

        const card = NotesSheetUI._buildCard(doc);
        host.appendChild(card);
        NotesSheetUI._renderRead(card, doc);
    }

    // ------------------------------------------------------------
    // Card (read-only; reuses dnd5e .card.description look)
    // ------------------------------------------------------------

    static _buildCard(doc) {
        const card = document.createElement('div');
        card.className = 'card description collapsible blacksmith-gm-notes';
        card.dataset.docUuid = doc.uuid;
        card.innerHTML = `
            <div class="header">
                <span><i class="fas fa-feather-pointed blacksmith-gm-notes-glyph"></i> GM Notes</span>
                <button type="button" class="unbutton control-button always-interactive blacksmith-gm-notes-edit"
                        aria-label="Edit GM Notes">
                    <i class="fas fa-feather" inert></i>
                </button>
            </div>
            <div class="details collapsible-content">
                <div class="editor editor-content wrapper"></div>
            </div>
        `;

        // Collapse when the header (but not the feather) is clicked.
        const header = card.querySelector('.header');
        header.addEventListener('click', (ev) => {
            if (ev.target.closest('.blacksmith-gm-notes-edit')) return;
            card.classList.toggle('collapsed');
        });

        // Feather → open the canonical editor window.
        card.querySelector('.blacksmith-gm-notes-edit')
            .addEventListener('click', () => NotesSheetUI._openEditor(doc));

        return card;
    }

    static _openEditor(doc) {
        new NotesWindow({ uuid: doc.uuid, title: doc.name }).render(true);
    }

    // ------------------------------------------------------------
    // Read rendering + live refresh
    // ------------------------------------------------------------

    static async _renderRead(card, doc) {
        const html = NotesAPI.getHtml(doc.uuid);
        const wrapper = card.querySelector('.editor.editor-content');
        const enriched = await NotesSheetUI._enrich(html, doc);
        wrapper.innerHTML = enriched || '';
        card.classList.toggle('empty', !enriched);
        card.classList.toggle('has-notes', !!enriched);
    }

    static _refreshCards(uuid) {
        const doc = fromUuidSync(uuid);
        if (!doc) return;
        for (const card of document.querySelectorAll('.blacksmith-gm-notes')) {
            if (card.dataset.docUuid === uuid) NotesSheetUI._renderRead(card, doc);
        }
    }

    static async _enrich(html, doc) {
        if (!html) return '';
        const ns = foundry?.applications?.ux?.TextEditor;
        const TE = ns?.implementation ?? ns ?? globalThis.TextEditor;
        try {
            return await TE.enrichHTML(html, { relativeTo: doc, secrets: true });
        } catch (_err) {
            return html;
        }
    }
}
