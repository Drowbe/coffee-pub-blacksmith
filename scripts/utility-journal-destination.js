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

import { postConsoleAndNotification } from './api-core.js';
import { MODULE } from './const.js';

/**
 * The Journal folder of that name, created at the root if it does not exist.
 *
 * MATCHED CASE-INSENSITIVELY, CREATED VERBATIM. This used to run the name through
 * `toSentenceCase` before doing either, which is the same defect the container
 * model was fixed for one level down: a folder name is the OWNING MODULE'S
 * vocabulary, and reshaping it uninvited is how a lookup silently stops matching.
 * It did two wrong things at once. A GM whose folder is `INJURIES` got a second
 * folder called `Injuries`, because the search compared a transformed needle to
 * untransformed haystacks; and a module asking for `injuries` had its folder
 * renamed on creation, along with anything else the transform mangled -- it
 * lowercases every character after the first of each word, so `McDonald` files
 * under `Mcdonald` and a proper noun quietly loses its spelling.
 *
 * Case-insensitive matching is the half that prevents duplicates; creating
 * verbatim is the half that respects the caller. Neither works alone.
 *
 * @param {string} folderName
 * @returns {Promise<Folder|null>} null when no name was given.
 */
export async function ensureJournalFolder(folderName) {
    const name = String(folderName ?? '').trim();
    if (!name) return null;
    const wanted = name.toLocaleLowerCase();
    const existing = game.folders.find(folder =>
        folder.type === 'JournalEntry' && String(folder.name).toLocaleLowerCase() === wanted);
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
        // A JOURNAL OF THIS NAME ELSEWHERE IS WORTH SAYING OUT LOUD. Matching on name
        // AND folder is correct and stays -- name alone collides across folders, which
        // was the injury builder's bug. But the correct rule has a blind spot: the
        // world gains a second journal with the same name and no signal at all, and
        // the GM finds out when `game.journal.getName()` hands them the other one.
        //
        // It is not a rejection, because a payload naming a folder means that folder.
        // The distinction the warning draws is between "add to the journal I mean" and
        // "add to a journal that happens to share its name" -- invisible otherwise, and
        // the wrong answer is the destructive one: appending into a GM's real content.
        const elsewhere = game.journal.filter(entry => entry.name === name
            && (entry.folder?.id ?? null) !== (folder?.id ?? null));
        if (elsewhere.length) {
            const where = elsewhere.map(entry => entry.folder?.name ?? 'the root').join(', ');
            postConsoleAndNotification(MODULE.NAME,
                `Creating a second journal named "${name}" in ${folder?.name ?? 'the root'} -- `
                + `one already exists in ${where}. Pages were NOT added to the existing entry.`,
                '', false, true);
        }
        return await JournalEntry.create({ ...data, name, folder: folder?.id ?? null });
    }

    for (const page of pages) {
        const match = existing.pages.find(one => one.name === page.name);
        if (match) await match.update(page);
        else await existing.createEmbeddedDocuments('JournalEntryPage', [page]);
    }
    return existing;
}
