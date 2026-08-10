// ==================================================================
// ===== PROSEMIRROR COLLAB GUARD ===================================
// ==================================================================
//
// Makes Foundry's collaborative ProseMirror editing usable from a host
// that is not the document's own sheet.
//
// THE BUG. When collaborative steps arrive from another client,
// `ProseMirrorEditor#_onNewSteps` notifies the edited document's sheet
// before applying them (`client/applications/ux/prosemirror-editor.mjs:92`):
//
//     this.options.document?.sheet?._onNewSteps?.();
//
// For a JournalEntryPage that resolves to JournalEntryPageProseMirrorSheet,
// whose implementation is one unguarded line
// (`client/applications/sheets/journal/journal-entry-page-prose-mirror-sheet.mjs:107`):
//
//     this.form.querySelectorAll('[data-action="save-html"]')...
//
// `document.sheet` is lazily constructed, so it exists even when it has
// never been rendered -- and then `this.form` is undefined and it throws.
//
// THE CONSEQUENCE, which is why this is worth fixing rather than avoiding:
// the throw happens BEFORE `receiveTransaction` and `view.dispatch`, so the
// incoming steps are discarded. Two clients connect, presence shows both
// users in the toolbar, and no text ever syncs. It reads as "collaboration
// does not work" when collaboration is working perfectly and one line of
// UI bookkeeping is failing in front of it.
//
// THE FIX. Skip that notification when the sheet has no rendered form.
// There is nothing to do in that case: the method exists to disable
// save-source buttons that are not on screen.
//
// This is Blacksmith infrastructure rather than a Notes detail. Any module
// hosting a collaborative editor outside a document's own sheet hits it.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

const TARGET = 'foundry.applications.sheets.journal.JournalEntryPageProseMirrorSheet.prototype._onNewSteps';

export class ProseMirrorCollabGuard {

    static _registered = false;

    /** Register the guard. Safe to call when libWrapper is absent; it simply does not apply. */
    static initialize() {
        if (this._registered) return;

        if (typeof libWrapper === 'undefined') {
            postConsoleAndNotification(MODULE.NAME, 'ProseMirror collab guard: libWrapper unavailable, collaborative editors hosted outside a document sheet will not sync', '', false, false);
            return;
        }

        // Resolved rather than assumed: if Foundry moves the class, the guard should
        // announce that it is not applied rather than throw during startup.
        const exists = foundry?.applications?.sheets?.journal?.JournalEntryPageProseMirrorSheet?.prototype?._onNewSteps;
        if (typeof exists !== 'function') {
            postConsoleAndNotification(MODULE.NAME, 'ProseMirror collab guard: target method not found, skipping', TARGET, false, false);
            return;
        }

        try {
            libWrapper.register(MODULE.ID, TARGET, function (wrapped, ...args) {
                // Not rendered means nothing to disable. Returning early is the whole
                // fix; calling wrapped() would throw and take the step application
                // down with it.
                if (!this.form) return;
                return wrapped(...args);
            }, 'MIXED');

            this._registered = true;
            postConsoleAndNotification(MODULE.NAME, 'ProseMirror collab guard registered', '', true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'ProseMirror collab guard: registration failed', error?.message ?? error, false, false);
        }
    }
}
