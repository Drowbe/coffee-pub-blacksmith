// ==================================================================
// ===== UI-NOTES-SHEET – GM Notes panel injection (Items) ==========
// ==================================================================
// Injects a GM-only "GM Notes" card into dnd5e item sheets, matching
// the native description-editor idiom: an enriched read view with a
// feather toggle that swaps in Foundry's <prose-mirror> editor
// (real formatting — bold, bullets, headings). The panel is just
// another consumer of NotesAPI; no storage logic lives here.
//
// Placement: appended into .item-descriptions so GM Notes reads as a
// sibling of Description / Chat Description and sits above the property
// pills and any Artificer Properties block.
//
// v1 scope: Items only. Actors are a fast-follow using the same idiom.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { NotesAPI } from './api-notes.js';

// Item sheet render hooks in dnd5e 5.x (AppV2). ItemSheet5e is the
// default for all item types; ContainerSheet handles containers.
const ITEM_SHEET_HOOKS = ['renderItemSheet5e', 'renderContainerSheet'];

export class NotesSheetUI {

    static initialize() {
        for (const name of ITEM_SHEET_HOOKS) {
            HookManager.registerHook({
                name,
                description: 'Blacksmith: Inject GM Notes card into item sheets',
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

    static async _onRenderItemSheet(app, html, _data) {
        // UI-gated: players never see the card (per project decision).
        if (!game.user?.isGM) return;

        // AppV2 passes a native element; tolerate jQuery / app.element too.
        let root = html?.jquery ? html[0] : html;
        if (!root) root = app?.element?.jquery ? app.element[0] : app?.element;
        const doc = app?.document ?? app?.object;
        if (!root || !doc) return;

        // Idempotent: one card per render.
        if (root.querySelector('.blacksmith-gm-notes')) return;

        // Prefer sitting with the other description cards; fall back
        // outward so we still appear on single-description / odd sheets.
        const host = root.querySelector('.tab.description .item-descriptions')
            || root.querySelector('.tab.description')
            || root.querySelector('.window-content')
            || root;

        // Build + insert synchronously (marker present before any await
        // so a re-render mid-enrich cannot double-inject), then fill.
        const card = NotesSheetUI._buildCard(doc);
        host.appendChild(card);
        NotesSheetUI._renderRead(card, doc);
    }

    // ------------------------------------------------------------
    // Card shell (reuses dnd5e card/description classes for native look)
    // ------------------------------------------------------------

    static _buildCard(doc) {
        const card = document.createElement('div');
        card.className = 'card description collapsible blacksmith-gm-notes';
        card.dataset.target = `flags.${MODULE.ID}.gmNotes`;
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

        // Feather → enter edit mode.
        card.querySelector('.blacksmith-gm-notes-edit')
            .addEventListener('click', () => NotesSheetUI._enterEdit(card, doc));

        return card;
    }

    // ------------------------------------------------------------
    // Read mode (enriched HTML)
    // ------------------------------------------------------------

    static async _renderRead(card, doc) {
        card.classList.remove('editing');
        const html = NotesAPI.getHtml(doc.uuid);
        const wrapper = card.querySelector('.editor.editor-content');
        const enriched = await NotesSheetUI._enrich(html, doc);
        wrapper.innerHTML = enriched || '';
        card.classList.toggle('empty', !enriched);
        card.classList.toggle('has-notes', !!enriched);
    }

    // ------------------------------------------------------------
    // Edit mode (Foundry <prose-mirror> — full formatting toolbar)
    // ------------------------------------------------------------

    static _enterEdit(card, doc) {
        if (card.classList.contains('editing')) return;

        const Cls = foundry?.applications?.elements?.HTMLProseMirrorElement;
        if (!Cls?.create) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | NOTES ProseMirror element unavailable', '', false, true);
            return;
        }

        card.classList.add('editing');
        card.classList.remove('collapsed'); // editing implies expanded

        const wrapper = card.querySelector('.editor.editor-content');
        // Non-toggled editor: auto-activates on connect, seeded from `value`
        // (set as a property by the factory — a bare attribute is NOT read).
        // documentUUID mirrors the native element and gives core a real
        // document for enrichment instead of fromUuid(undefined). No `name`
        // → the sheet's submit-on-change ignores it, so our envelope write
        // stays the sole authority (text mirror + updatedAt + change hook).
        const editor = Cls.create({
            value: NotesAPI.getHtml(doc.uuid) || '',
            documentUUID: doc.uuid,
            compact: true
        });
        editor.classList.add('blacksmith-gm-notes-editor');

        // The editor otherwise mounts non-editable (it inherits a disabled
        // state). Force it editable before activation, and again on `open`
        // once ProseMirror's .editor-content exists — same fix Squire's
        // note window uses. Without this the toolbar shows but you can't type.
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

        // <prose-mirror> fires `change` when its save control is used.
        // stopPropagation keeps it out of the dnd5e form-submit pipeline.
        editor.addEventListener('change', async (ev) => {
            ev.stopPropagation();
            await NotesAPI.set(doc.uuid, { html: editor.value ?? '' });
            await NotesSheetUI._renderRead(card, doc);
        });

        wrapper.replaceChildren(editor);
    }

    // ------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------

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
