// ==================================================================
// ===== PIN RELINK =================================================
// ==================================================================
// The dialogs that repair a broken pin, one at a time or a scene at a time. The search and
// the write are PinManager's (findRelinkCandidates, relinkPin); this only asks the GM.

import { PinManager } from './manager-pins.js';
import { DialogAPI } from './api-dialog.js';

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));

/** Words for each answer to "where to look", for a message that says what was searched. */
const SEARCHED = { compendiums: 'the compendiums', world: 'this world', both: 'the compendiums or this world' };

export class PinRelink {
    /**
     * Ask where to look for a replacement, unless the GM turned asking off or the pins keep their records in
     * the world, where there is nothing to look for in a compendium. A world is rebuilt often and its documents
     * get new ids, so the answer is as likely to be a compendium as the world.
     * @param {{ worldOnly: boolean, subject: string }} options
     * @returns {Promise<'compendiums' | 'world' | 'both' | null>} Null when the GM cancelled.
     * @private
     */
    static async _chooseSources({ worldOnly, subject }) {
        const defaults = PinManager.getRelinkDefaults();
        if (worldOnly) return 'world';
        if (!defaults.ask) return defaults.source;
        const choice = await DialogAPI.choose({
            title: 'Relink Pin',
            content: `<p>Where should I look for what ${esc(subject)} should point at now?</p>`,
            choices: [
                { id: 'compendiums', label: 'Compendiums', icon: 'fa-solid fa-book-atlas', default: defaults.source === 'compendiums', description: 'The compendiums you mapped in Compendium Mapping, in their priority order' },
                { id: 'world', label: 'This World', icon: 'fa-solid fa-globe', default: defaults.source === 'world', description: 'Documents in this world' },
                { id: 'both', label: 'Compendiums, then World', icon: 'fa-solid fa-layer-group', default: defaults.source === 'both', description: 'Compendiums first, then this world' }
            ],
            closeValue: null,
            cancelValue: null
        });
        if (choice.action !== DialogAPI.ACTIONS.SUBMIT || !choice.value) return null;
        return choice.value;
    }

    /**
     * Ask the GM what a broken pin should point at now, and relink it.
     * @param {string} pinId
     * @returns {Promise<boolean>} True when the pin was relinked.
     */
    static async open(pinId) {
        if (!game.user?.isGM) return false;
        const pin = PinManager.get(pinId);
        if (!pin) return false;

        const worldOnly = (await PinManager.resolvePinTarget(pin)).relinkScope === 'world';
        const sources = await this._chooseSources({ worldOnly, subject: pin.text || 'this pin' });
        if (!sources) return false;

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
            emptyMessage: `Nothing in ${SEARCHED[found.sources]} looks like a match. Drop a ${found.kindLabel} below.`
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

    /**
     * Repair the broken pins on a scene in one pass: look for a match for each, show them all with a dropdown
     * apiece, and relink the ones the GM picks. A match is preselected only when exactly one candidate has the
     * same id or the same name, and nothing changes until Apply, so a preselection is a proposal.
     * @param {{ sceneId?: string, pinIds?: string[] | null }} [options] - Restrict to these pins (a selection)
     * @returns {Promise<number>} How many pins were relinked.
     */
    static async openBulk({ sceneId = canvas?.scene?.id, pinIds = null } = {}) {
        if (!game.user?.isGM || !sceneId) return 0;
        const { broken, unrelinkable } = await PinManager.listBrokenPins(sceneId, { pinIds });
        const plural = (n) => `${n} pin${n === 1 ? '' : 's'}`;
        if (!broken.length) {
            ui.notifications?.info(unrelinkable
                ? `${plural(unrelinkable)} ${unrelinkable === 1 ? 'is' : 'are'} broken, but that kind of pin cannot be relinked.`
                : 'No broken links to repair.');
            return 0;
        }

        const worldOnly = broken.every(({ target }) => target.relinkScope === 'world');
        const sources = await this._chooseSources({ worldOnly, subject: `these ${plural(broken.length)}` });
        if (!sources) return 0;

        ui.notifications?.info(`Looking for matches for ${plural(broken.length)}.`);
        const entries = [];
        for (const { pin } of broken) {
            entries.push({ pin, found: await PinManager.findRelinkCandidates(pin, { sources }) });
        }

        const optionLabel = (candidate) => {
            const where = candidate.origin === 'compendium' ? 'Compendium' : 'World';
            return `${candidate.name} - ${where}${candidate.parent ? `: ${candidate.parent}` : ''} (${candidate.reason})`;
        };
        const buildContent = () => {
            const rows = entries.map(({ pin, found }, index) => {
                const clear = found.candidates.filter((candidate) => candidate.reason === 'Same ID' || candidate.reason === 'Same name');
                const chosen = clear.length === 1 ? clear[0].uuid : '';
                const options = [
                    '<option value="">Leave broken</option>',
                    ...found.candidates.map((candidate) => `<option value="${esc(candidate.uuid)}"${candidate.uuid === chosen ? ' selected' : ''}>${esc(optionLabel(candidate))}</option>`)
                ];
                return `<div class="blacksmith-pin-repair-row">
                    <span class="blacksmith-pin-repair-label">${esc(pin.text || 'Unnamed pin')}<small>${esc(found.kindLabel)}</small></span>
                    <select class="blacksmith-input" name="pin-${index}">${options.join('')}</select>
                </div>`;
            });
            return `
                <p>${plural(broken.length)} on this scene point${broken.length === 1 ? 's' : ''} at something that no longer exists. Choose a match for each, or leave it broken. Nothing changes until you press Apply.${unrelinkable ? ` ${plural(unrelinkable)} more ${unrelinkable === 1 ? 'is' : 'are'} broken and cannot be relinked.` : ''}</p>
                <div class="blacksmith-pin-repair-list">${rows.join('')}</div>
                <label class="blacksmith-pin-repair-rename"><input type="checkbox" name="rename"> Rename journal pins to match their new documents</label>`;
        };

        let relinked = 0;
        await DialogAPI.prompt({
            title: 'Repair Broken Pins',
            classes: ['blacksmith-pin-repair'],
            content: buildContent,
            getValue: (root) => ({
                picks: entries
                    .map(({ pin }, index) => ({ pinId: pin.id, uuid: String(root.elements[`pin-${index}`]?.value ?? '') }))
                    .filter((pick) => pick.uuid),
                rename: !!root.elements.rename?.checked
            }),
            validate: (value) => (value?.picks?.length ? null : 'Choose a match for at least one pin.'),
            // Failures are collected, not thrown: a throw would reopen the dialog and relink nothing twice
            onSubmit: async ({ picks, rename }) => {
                const failed = [];
                for (const pick of picks) {
                    try {
                        await PinManager.relinkPin(pick.pinId, pick.uuid, { interactive: false, renameToMatch: rename });
                        relinked++;
                    } catch (err) {
                        failed.push(`${PinManager.get(pick.pinId)?.text || pick.pinId}: ${err?.message || err}`);
                    }
                }
                if (failed.length) ui.notifications?.warn(`${plural(relinked)} relinked. ${failed.length} failed: ${failed.join('; ')}`);
            },
            submitLabel: 'Apply',
            submitIcon: 'fa-solid fa-link'
        });

        if (relinked) ui.notifications?.info(`${plural(relinked)} relinked.`);
        return relinked;
    }
}
