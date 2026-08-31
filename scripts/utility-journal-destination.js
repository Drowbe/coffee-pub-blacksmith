// ==================================================================
// ===== JOURNAL DESTINATION - where an imported page lands =========
// ==================================================================
// One find-or-create, replacing four that disagreed.
//
// Every journal builder implemented "find or create the entry, then find or
// update the page", and no two did it the same way:
//
//   Encounter  name + folder   createEmbeddedDocuments   HTML format   returns entry
//   Area       name + folder   createEmbeddedDocuments   HTML format   returns entry
//   Location   name + folder   createEmbeddedDocuments   HTML format   returns entry
//   Injury     name ONLY       update({pages})           no format     returns nothing
//
// Injury was the outlier on every column and one of those was a real defect:
// `Array.isArray(entry.pages) ? entry.pages : []` guards a value that is an
// EmbeddedCollection and never an Array, so the guard always took the empty
// branch and submitted an update carrying only the new page. Confirmed against
// a live world on 2026-08-31 -- `Array.isArray` false, `EmbeddedCollection`, 9
// pages -- so appending through that path either silently did nothing or
// replaced the siblings. Nothing about it was worth preserving.
//
// DESTINATION IS NOT CONTENT. A profile's declaration says what a page SAYS;
// this says where it goes. Keeping them apart is what lets one profile own an
// entry per scene and another file every page into a shared entry, without
// either one carrying folder logic.
// ==================================================================

import { toSentenceCase } from './api-core.js';

/**
 * The Journal folder of that name, created at the root if it does not exist.
 * @param {string} folderName
 * @returns {Promise<Folder|null>} null when no name was given.
 */
export async function ensureJournalFolder(folderName) {
    const name = toSentenceCase(String(folderName ?? '').trim());
    if (!name) return null;
    const existing = game.folders.find(folder => folder.name === name && folder.type === 'JournalEntry');
    if (existing) return existing;
    return await Folder.create({ name, type: 'JournalEntry', parent: null });
}

/**
 * Land document data on a JournalEntry, creating or extending as needed.
 *
 * Matching is on name AND folder together. Name alone was the injury builder's
 * rule and it collides across folders: two campaigns each with a "Fire" entry
 * are one entry as far as that test is concerned.
 *
 * A page whose name already exists is UPDATED rather than duplicated, which is
 * what makes re-importing a corrected page do the obvious thing. A page that is
 * new is appended through `createEmbeddedDocuments` -- never by submitting a
 * `pages` array to the parent's `update`, which is what broke injuries.
 *
 * @param {object} data - Document source data. `name` and `pages` are required.
 * @param {object} [options]
 * @param {string} [options.folderName] - Folder to file the entry under.
 * @returns {Promise<JournalEntry>} The created or extended entry, always.
 */
export async function upsertJournalEntry(data, { folderName } = {}) {
    const pages = Array.isArray(data?.pages) ? data.pages : [];
    const folder = await ensureJournalFolder(folderName);
    const name = String(data?.name ?? '').trim() || 'Unnamed Entry';

    const existing = game.journal.find(entry =>
        entry.name === name && (entry.folder?.id ?? null) === (folder?.id ?? null));

    if (!existing) {
        return await JournalEntry.create({ ...data, name, folder: folder?.id ?? null });
    }

    for (const page of pages) {
        const match = existing.pages.find(one => one.name === page.name);
        if (match) await match.update(page);
        else await existing.createEmbeddedDocuments('JournalEntryPage', [page]);
    }
    return existing;
}
