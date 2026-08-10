// ==================================================================
// ===== UI-GMNOTES-SHEET – GM Notes read card (Items) ==============
// ==================================================================
// Injects a GM-only, read-only "GM Notes" card into dnd5e item sheets.
// The card is an at-a-glance enriched view; clicking the feather opens
// the canonical editor window (window-gmnotes.js) — editing never happens
// inside the host sheet, which is what kept breaking.
//
// The card is intentionally read-only here: no embedded editor means no
// interaction conflict with dnd5e's form. It live-refreshes when a note
// changes via the GMNotesAPI change hook.
//
// v1 scope: Items. Actors/journals reuse the SAME window; only this thin
// read-card injection is item-specific.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { GMNotesAPI } from './api-gmnotes.js';
import { GMNotesManager } from './manager-gmnotes.js';
import { GMNotesWindow } from './window-gmnotes.js';

// Item sheet render hooks in dnd5e 5.x (AppV2). ItemSheet5e is the
// default for all item types; ContainerSheet handles containers.
const ITEM_SHEET_HOOKS = ['renderItemSheet5e', 'renderContainerSheet'];

export class GMNotesSheetUI {

    static initialize() {
        for (const name of ITEM_SHEET_HOOKS) {
            HookManager.registerHook({
                name,
                description: 'Blacksmith: Inject GM Notes read card into item sheets',
                context: 'blacksmith-gm-notes-item',
                priority: 3,
                callback: GMNotesSheetUI._onRenderItemSheet
            });
        }
        // Live-refresh any open cards when a note is saved/cleared.
        Hooks.on(GMNotesAPI.CHANGE_HOOK, ({ uuid }) => GMNotesSheetUI._refreshCards(uuid));
        // And when a LIVE section's data changes. A contributed section's source is
        // not this document's flags, so nothing the document does would say to look
        // again -- without this the card shows whatever it computed on first render.
        Hooks.on(GMNotesManager.SECTIONS_HOOK, ({ uuid }) => GMNotesSheetUI._refreshCards(uuid));
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

        const card = GMNotesSheetUI._buildCard(doc);
        host.appendChild(card);
        GMNotesSheetUI._renderRead(card, doc);
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
                <span>GM Notes</span>
                <button type="button" class="unbutton control-button always-interactive blacksmith-gm-notes-edit"
                        aria-label="Edit GM Notes">
                    <i class="fas fa-feather" inert></i>
                </button>
            </div>
            <div class="details collapsible-content">
                <div class="editor editor-content wrapper"></div>
            </div>
        `;

        // Initial collapse: a remembered preference wins; otherwise collapse
        // when the note is empty. GMNotesAPI.get is synchronous (reads a flag).
        const note = GMNotesAPI.get(doc.uuid);
        const hasContent = !!(note && note.text && note.text.trim());
        const pref = GMNotesSheetUI._getCollapseState(doc.uuid);
        card.classList.toggle('collapsed', pref === undefined ? !hasContent : pref);

        // Collapse when the header (but not the feather) is clicked; remember it.
        const header = card.querySelector('.header');
        header.addEventListener('click', (ev) => {
            if (ev.target.closest('.blacksmith-gm-notes-edit')) return;
            const collapsed = card.classList.toggle('collapsed');
            GMNotesSheetUI._setCollapseState(doc.uuid, collapsed);
        });

        // Feather → open the canonical editor window.
        card.querySelector('.blacksmith-gm-notes-edit')
            .addEventListener('click', () => GMNotesSheetUI._openEditor(doc));

        return card;
    }

    static _openEditor(doc) {
        new GMNotesWindow({ uuid: doc.uuid, title: doc.name }).render(true);
    }

    // Per-user collapse memory (stored on the User document flag).
    static _getCollapseState(uuid) {
        const map = game.user?.getFlag(MODULE.ID, 'gmNotesCollapse');
        return map ? map[uuid] : undefined;
    }

    static _setCollapseState(uuid, collapsed) {
        const current = game.user?.getFlag(MODULE.ID, 'gmNotesCollapse') || {};
        game.user?.setFlag(MODULE.ID, 'gmNotesCollapse', { ...current, [uuid]: collapsed }).catch(() => {});
    }

    // ------------------------------------------------------------
    // Read rendering + live refresh
    // ------------------------------------------------------------

    static async _renderRead(card, doc) {
        const note = GMNotesAPI.get(doc.uuid);
        // Use the stripped text mirror to decide emptiness — an "emptied"
        // note is stored as "<p></p>", which is non-empty HTML but no text.
        const hasContent = !!(note && note.text && note.text.trim());
        const wrapper = card.querySelector('.editor.editor-content');
        const enriched = hasContent ? await GMNotesSheetUI._enrich(note.html, doc) : '';

        // Sections, persisted and live-contributed. This card used to render only
        // the General note, which meant a module could register a provider, see it
        // returned by getSections(), and still have it appear nowhere — the only
        // surface that renders sections is GMNotesFieldController, which Blacksmith
        // offers to consumers and never mounts itself.
        const sections = await GMNotesSheetUI._renderSections(doc);

        wrapper.innerHTML = (enriched || '') + sections;
        const hasSections = !!sections;
        card.classList.toggle('empty', !hasContent && !hasSections);
        card.classList.toggle('has-notes', hasContent || hasSections);
    }

    /**
     * Sections as HTML, or an empty string when there are none.
     *
     * Read-only here by design: the card is a read card, and a section's own
     * editor lives behind the feather. Contributed sections are never editable
     * anyway — they are computed at render time and own no storage.
     */
    static async _renderSections(doc) {
        try {
            const sections = await GMNotesManager.getSections(doc);
            if (!sections.length) return '';

            const blocks = [];
            for (const section of sections) {
                const body = await GMNotesSheetUI._enrich(section.html, doc);
                if (!body) continue;
                const icon = String(section.icon || 'fa-solid fa-puzzle-piece');
                blocks.push(
                    `<div class="blacksmith-gm-notes-card-section" data-section-id="${section.id}">` +
                    `<h4 class="blacksmith-gm-notes-card-section-title"><i class="${icon}" inert></i> ${section.label || section.id}</h4>` +
                    `<div class="blacksmith-gm-notes-card-section-body">${body}</div>` +
                    `</div>`
                );
            }
            return blocks.join('');
        } catch (err) {
            // Logged rather than swallowed: a section that renders nothing is
            // indistinguishable from one with nothing to show.
            console.error(`${MODULE.ID} | GM Notes card: sections failed to render`, err);
            return '';
        }
    }

    static _refreshCards(uuid) {
        const doc = fromUuidSync(uuid);
        if (!doc) return;
        const note = GMNotesAPI.get(uuid);
        const hasContent = !!(note && note.text && note.text.trim());
        for (const card of document.querySelectorAll('.blacksmith-gm-notes')) {
            if (card.dataset.docUuid !== uuid) continue;
            GMNotesSheetUI._renderRead(card, doc);
            // After a save: adding content expands and reveals it; clearing collapses.
            card.classList.toggle('collapsed', !hasContent);
            GMNotesSheetUI._setCollapseState(uuid, !hasContent);
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
