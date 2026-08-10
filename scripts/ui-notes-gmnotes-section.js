// ==================================================================
// ===== NOTES -> GM NOTES SECTION ==================================
// ==================================================================
//
// Surfaces the annotation layer on every document that shows GM Notes:
// "here are the notes attached to this thing".
//
// This is the visible half of the gate. The annotation API can answer
// "what is attached to this thing" (api-notes.md); until something asked
// it on a real sheet, nobody could see that it could.
//
// A LIVE provider section rather than persisted content, which matters:
// providers are invoked at render time and their output is never written
// into the document's flags. So this shows the current annotations rather
// than a copy that drifts, and removing this file removes the section
// cleanly without leaving orphaned text in anyone's world.
//
// Read-only by design. Attaching happens from the note, not from the
// thing being annotated -- permission is gated on the note's ownership,
// so an "attach" control here would be offering an action the viewer may
// not be allowed to take against a note they may not own.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { NotesManager } from './manager-notes.js';

/** Anchor kind -> the icon shown beside a row. */
const ANCHOR_ICONS = Object.freeze({
    document: 'fa-solid fa-file-lines',
    point: 'fa-solid fa-location-dot',
    region: 'fa-solid fa-draw-polygon'
});

/** Escape text taken from a document name before it goes into the section HTML. */
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

/**
 * What to call a note in the list.
 *
 * A JournalEntry with one page is the ordinary shape of a note, and people name
 * the ENTRY -- the page inside it keeps whatever default it was created with, so
 * showing the page name gives a list of identical "Note" rows. Where an entry
 * holds several pages the page name is the distinguishing one, so it wins.
 *
 * Braces are stripped because the label goes inside `@UUID[...]{...}`, where an
 * unbalanced brace would break the enricher and render the raw syntax.
 */
function noteLabel(page) {
    const entry = page?.parent;
    const name = (entry?.pages?.size === 1 && entry?.name) ? entry.name : page?.name;
    return String(name ?? 'Note').replace(/[{}]/g, '');
}

/**
 * Build the section for one document, or null when nothing is attached.
 *
 * Returning null rather than an empty section is deliberate: a heading reading
 * "Related Notes" over nothing is worse than no heading, and every document
 * without a note would otherwise grow one.
 */
function buildSection(document) {
    try {
        const annotations = NotesManager.getByTarget(document);
        if (!annotations.length) return null;

        // Group by note, since one note attached at two anchors is one note to a
        // reader and two rows to the store.
        const byNote = new Map();
        for (const annotation of annotations) {
            if (!byNote.has(annotation.noteUuid)) byNote.set(annotation.noteUuid, []);
            byNote.get(annotation.noteUuid).push(annotation);
        }

        const rows = [];
        for (const [noteUuid, group] of byNote) {
            const page = fromUuidSync(noteUuid);
            // A note the viewer cannot see is not listed. `getByTarget` reads the
            // store, which does not filter by permission -- this is where that
            // happens, and it has to happen before the name is rendered.
            if (!page?.testUserPermission?.(game.user, 'OBSERVER')) continue;

            const kinds = [...new Set(group.map((a) => a.anchor?.kind ?? 'document'))];
            const icons = kinds
                .map((kind) => `<i class="${ANCHOR_ICONS[kind] ?? ANCHOR_ICONS.document}" title="${escapeHtml(kind)}"></i>`)
                .join(' ');

            rows.push(
                `<li class="blacksmith-related-note">${icons} @UUID[${noteUuid}]{${noteLabel(page)}}</li>`
            );
        }

        if (!rows.length) return null;

        return {
            id: 'related-notes',
            label: 'Related Notes',
            icon: 'fa-solid fa-note-sticky',
            html: `<ul class="blacksmith-related-notes">${rows.join('')}</ul>`
        };
    } catch (error) {
        // A provider that throws would take the whole GM Notes render with it, so
        // the catch is necessary -- but it is logged loudly rather than at debug
        // level. A section that silently renders nothing is indistinguishable from
        // one with nothing to show, which makes the failure impossible to notice.
        postConsoleAndNotification(MODULE.NAME, 'Notes: related-notes section failed to build', error?.message ?? error, false, false);
        return null;
    }
}

/**
 * Register the provider. Called from `ready` after NotesManager.initialize().
 * @returns {Function|null} the disposer, for symmetry -- nothing calls it today
 */
export function registerRelatedNotesSection() {
    const api = game.modules.get(MODULE.ID)?.api;
    if (typeof api?.gmNotes?.registerProvider !== 'function') {
        postConsoleAndNotification(MODULE.NAME, 'Notes: GM Notes provider registry unavailable; related-notes section not registered', '', false, false);
        return null;
    }

    return api.gmNotes.registerProvider(MODULE.ID, (document) => buildSection(document), {
        id: 'related-notes',
        // Below Blacksmith's own General content and any module's persisted
        // sections: this is context about the document, not content on it.
        weight: 200
    });
}
