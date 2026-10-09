// ==================================================================
// ===== PIN RELINK =================================================
// ==================================================================
// The dialog that repairs a broken pin: pick one of the documents that look like what it
// pointed at, or drop another of the same kind on it. The search and the write are
// PinManager's (findRelinkCandidates, relinkPin); this only asks the GM.

import { PinManager } from './manager-pins.js';
import { DialogAPI } from './api-dialog.js';

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));

export class PinRelink {
    /**
     * Ask the GM what a broken pin should point at now, and relink it.
     * @param {string} pinId
     * @returns {Promise<boolean>} True when the pin was relinked.
     */
    static async open(pinId) {
        if (!game.user?.isGM) return false;
        const pin = PinManager.get(pinId);
        if (!pin) return false;

        // Ask where to look, unless the GM turned asking off: a world is rebuilt often and its documents get
        // new ids, so the answer is as likely to be a compendium as the world
        const defaults = PinManager.getRelinkDefaults();
        // A type that keeps its records in the world has nothing to look for in a compendium: no question to ask
        const worldOnly = (await PinManager.resolvePinTarget(pin)).relinkScope === 'world';
        let sources = worldOnly ? 'world' : defaults.source;
        if (defaults.ask && !worldOnly) {
            const choice = await DialogAPI.choose({
                title: 'Relink Pin',
                content: `<p>Where should I look for what ${esc(pin.text || 'this pin')} should point at now?</p>`,
                choices: [
                    { id: 'compendiums', label: 'Compendiums', icon: 'fa-solid fa-book-atlas', default: sources === 'compendiums', description: 'The compendiums you mapped in Compendium Mapping, in their priority order' },
                    { id: 'world', label: 'This World', icon: 'fa-solid fa-globe', default: sources === 'world', description: 'Documents in this world' },
                    { id: 'both', label: 'Compendiums, then World', icon: 'fa-solid fa-layer-group', default: sources === 'both', description: 'Compendiums first, then this world' }
                ],
                closeValue: null,
                cancelValue: null
            });
            if (choice.action !== DialogAPI.ACTIONS.SUBMIT || !choice.value) return false;
            sources = choice.value;
        }

        const found = await PinManager.findRelinkCandidates(pin, { sources });
        if (!found.kind) {
            ui.notifications?.warn('This pin has no link to repair.');
            return false;
        }

        const { EntityListAPI } = await import('./api-entity-list.js');
        const list = EntityListAPI.create({
            entities: found.candidates.map((candidate) => ({
                id: candidate.uuid,
                name: candidate.name,
                img: candidate.img || undefined,
                type: candidate.parent,
                badges: [candidate.origin === 'compendium' ? 'Compendium' : 'World', candidate.reason]
            })),
            mode: 'single',
            inputName: 'blacksmith-pin-relink',
            // Nothing is preselected: pressing Enter must never relink to a guess
            emptyMessage: `Nothing in ${{ compendiums: 'the compendiums', world: 'this world', both: 'the compendiums or this world' }[found.sources]} looks like a match. Drop a ${found.kindLabel} below.`
        });

        const kind = esc(found.kindLabel);
        // A function, so that a rejected value reopens the dialog with what was typed or dropped still in the box
        const buildContent = ({ value } = {}) => `
            <p>${esc(pin.text || 'This pin')} pointed at a ${kind} that no longer exists. Choose what it should point at now.</p>
            ${list.html}
            <div class="blacksmith-field">
                <span class="blacksmith-field-label">Or drop a ${kind} here, or paste its UUID</span>
                <input type="text" name="relink-uuid" class="blacksmith-input" placeholder="Drop here, or paste a UUID" value="${esc(value ?? '')}">
            </div>`;

        let relinked = false;
        await DialogAPI.prompt({
            title: 'Relink Pin',
            classes: ['blacksmith-pin-relink'],
            content: buildContent,
            controls: list,
            // Bound after every render: DialogV2 rebuilds the content from a string
            onRender: (element) => {
                const input = element.querySelector('[name="relink-uuid"]');
                if (!input) return;
                input.addEventListener('dragover', (event) => event.preventDefault());
                input.addEventListener('drop', (event) => {
                    event.preventDefault();
                    const editor = foundry.applications.ux.TextEditor.implementation ?? foundry.applications.ux.TextEditor;
                    const data = editor.getDragEventData(event);
                    if (data?.uuid) input.value = data.uuid;
                });
            },
            // A typed or dropped UUID wins over the list; the list is read from the DOM, not the controller
            getValue: (root) => {
                const typed = String(root.elements['relink-uuid']?.value ?? '').trim();
                if (typed) return typed;
                const chosen = list.readIdsFrom(root);
                return (Array.isArray(chosen) ? chosen[0] : chosen) ?? '';
            },
            validate: (value) => (value ? null : `Pick one from the list, or drop a ${found.kindLabel} on the box.`),
            // Throwing reopens the dialog with the message, so a wrong kind or a missing document is corrected in place
            onSubmit: async (value) => {
                await PinManager.relinkPin(pinId, value);
                relinked = true;
            },
            submitLabel: 'Relink',
            submitIcon: 'fa-solid fa-link'
        });

        if (relinked) ui.notifications?.info('Pin relinked.');
        return relinked;
    }
}
