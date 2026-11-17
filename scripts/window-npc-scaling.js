// ==================================================================
// ===== WINDOW-NPC-SCALING: scale a creature =======================
// ==================================================================
//
// A Tool window, one per creature (`NpcScalingWindow.openFor(target)`). It asks for a target challenge
// rating and a name suffix, shows what the scaling would change as stat / now / scaled, lets the GM correct
// the damage-per-round estimate, and creates the scaled actor. The decisions are the engine's
// (utility-npc-scaling.js) and the writes are the manager's (manager-npc-scaling.js); this is presentation.
// See documentation/architecture/architecture-npc-scaling.md.

import { MODULE } from './const.js';
import { BlacksmithToolWindowBaseV2 } from './window-tool-base.js';
import { registerWindow } from './api-windows.js';
import { registerToolbarTool } from './manager-toolbar.js';
import { HookManager } from './manager-hooks.js';
import { ToastAPI } from './api-toast.js';
import { EncounterManager } from './manager-encounter.js';
import { NpcScalingManager } from './manager-npc-scaling.js';
import { NpcScalingError } from './utility-npc-scaling.js';

const WINDOW_ID = 'blacksmith-npc-scaling';
const DEFAULT_LABEL = 'Super';

/** Every CR the guidelines table has a row for, in order, as the keys the table uses. */
const CR_OPTIONS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));

export class NpcScalingWindow extends BlacksmithToolWindowBaseV2 {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        {},
        {
            classes: ['blacksmith-window-tool', 'blacksmith-npc-scaling-tool-window'],
            position: { width: 520, height: 'auto' },
            window: { title: 'Scale NPC', icon: 'fa-solid fa-arrow-up-right-dots', resizable: true },
            // Several creatures can be open at once, each with its own window, so they must not share one saved position.
            rememberPosition: false,
            windowSizeConstraints: { minHeight: 280 }
        }
    );

    static ACTION_HANDLERS = {
        'npc-scaling-apply': (_event, _target, win) => win?._apply(),
        'npc-scaling-open-source': (_event, _target, win) => win?._openSource()
    };

    /** A window is keyed on the creature's UUID. A token is keyed on the TOKEN, never on its shared actor id. */
    static keyFor(target) {
        if (typeof target === 'string') return target || null;
        return target?.document?.uuid ?? target?.uuid ?? null;
    }

    constructor(target, options = {}) {
        super({ id: `${WINDOW_ID}-${foundry.utils.randomID()}`, ...options });
        this._target = target;
        this._cr = null;
        this._label = DEFAULT_LABEL;
        this._attacks = null;
        this._busy = false;
    }

    // ==============================================================
    // ===== RENDERING ==============================================
    // ==============================================================

    async getData() {
        let resolved;
        try {
            resolved = await NpcScalingManager.resolve(this._target);
        } catch (error) {
            return this._refusal(error);
        }
        const { actor, source, fromScaled } = resolved;
        const read = fromScaled ? source : actor;
        const snapshot = NpcScalingManager.snapshot(read);

        // A first render has no CR chosen yet: offer four above the creature's own, which is the kind of
        // step the tool exists for, and which the GM changes in one click.
        if (this._cr === null) this._cr = Math.min(30, Math.floor(snapshot.cr ?? 0) + 4);

        let planned = null;
        let failure = null;
        try {
            planned = await NpcScalingManager.plan(this._target, { cr: this._cr, label: this._label, attacksPerRound: this._attacks ?? undefined });
        } catch (error) {
            failure = error;
        }

        const attacks = planned?.snapshot?.attacksPerRound ?? snapshot.attacksPerRound;
        this._canApply = Boolean(planned) && !this._busy;

        const crSelect = CR_OPTIONS.map((key) => {
            const value = EncounterManager.parseCR(key);
            return `<option value="${key}"${value === this._cr ? ' selected' : ''}>${key}</option>`;
        }).join('');

        const sourceNote = fromScaled
            ? `<div class="blacksmith-tool-hint">${esc(actor.name)} was scaled from ${esc(source.name)}. A new scaling starts from ${esc(source.name)}, so the two do not stack.</div>`
            : '';

        const body = `
            <div class="blacksmith-npc-scaling-body">
                <div class="blacksmith-tool-section is-ruleless">
                    <div class="blacksmith-tool-section-title">
                        <i class="fa-solid fa-skull"></i>
                        <span>${esc(read.name)}</span>
                        <span class="blacksmith-tool-section-actions">
                            <span class="blacksmith-badge blacksmith-badge-info">CR ${esc(EncounterManager.formatCR(snapshot.cr ?? 0))}</span>
                        </span>
                    </div>
                    ${sourceNote}
                </div>

                <div class="blacksmith-tool-section">
                    <div class="blacksmith-tool-section-title">
                        <i class="fa-solid fa-crosshairs"></i>
                        <span>Scale to</span>
                    </div>
                    <div class="blacksmith-npc-scaling-fields">
                        <label class="blacksmith-npc-scaling-field">
                            <span>Challenge rating</span>
                            <select class="blacksmith-select" name="npc-scaling-cr">${crSelect}</select>
                        </label>
                        <div class="blacksmith-npc-scaling-field">
                            <span>Name suffix</span>
                            <span class="blacksmith-tool-editable" data-field="label" data-value="${esc(this._label)}" data-required="true" data-maxlength="40" data-placeholder="Super">
                                <span class="blacksmith-tool-editable-text">${esc(this._label)}</span>
                                <button type="button" class="blacksmith-tool-btn is-icon blacksmith-tool-editable-edit" data-tooltip="Change the name suffix"><i class="fa-solid fa-pen"></i></button>
                            </span>
                        </div>
                    </div>
                </div>

                <div class="blacksmith-tool-section">
                    <div class="blacksmith-tool-section-title">
                        <i class="fa-solid fa-table-list"></i>
                        <span>What changes</span>
                    </div>
                    ${failure ? this._failureHtml(failure) : this._previewHtml(planned, attacks)}
                </div>
            </div>`;

        return {
            appId: WINDOW_ID,
            bodyContent: body,
            toolFooterLeft: fromScaled
                ? `<button type="button" class="blacksmith-window-btn-secondary" data-action="npc-scaling-open-source" data-tooltip="Open ${esc(source.name)}, the creature this was scaled from"><i class="fa-solid fa-user"></i> Open Source</button>`
                : '',
            toolFooterRight: `<button type="button" class="blacksmith-window-btn-primary" data-action="npc-scaling-apply"${this._canApply ? '' : ' disabled'} data-tooltip="Create a new actor at this challenge rating. ${esc(source.name)} is not changed."><i class="fa-solid fa-plus"></i> Create Scaled Actor</button>`
        };
    }

    /** The stat / now / scaled table, the damage estimate, and anything the engine wants the GM to see. */
    _previewHtml(planned, attacks) {
        const rows = planned.preview.map((row) => {
            const now = row.from === null || row.from === undefined ? '' : esc(row.from);
            const next = row.to === null || row.to === undefined ? '' : esc(row.to);
            return `<div class="blacksmith-npc-scaling-row">
                <span class="blacksmith-npc-scaling-stat">${esc(row.label)}</span>
                <span class="blacksmith-npc-scaling-now">${now || '&ndash;'}</span>
                <span class="blacksmith-npc-scaling-next">${next || '&ndash;'}</span>
                ${row.note ? `<span class="blacksmith-npc-scaling-note blacksmith-tool-hint">${esc(row.note)}</span>` : ''}
            </div>`;
        }).join('');

        const warnings = planned.warnings.map((w) =>
            `<div class="blacksmith-tool-hint blacksmith-npc-scaling-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(w.message)}</div>`).join('');

        const shown = Number.isInteger(attacks) ? attacks : 1;
        return `
            <div class="blacksmith-npc-scaling-table">
                <div class="blacksmith-npc-scaling-row is-head"><span>Stat</span><span>Now</span><span>Scaled</span></div>
                ${rows || '<div class="blacksmith-tool-empty">Nothing changes at this challenge rating.</div>'}
            </div>
            <div class="blacksmith-npc-scaling-field">
                <span>Attacks per round (estimate)</span>
                <span class="blacksmith-tool-editable" data-field="attacks" data-value="${shown}" data-required="true" data-maxlength="2">
                    <span class="blacksmith-tool-editable-text">${shown}</span>
                    <button type="button" class="blacksmith-tool-btn is-icon blacksmith-tool-editable-edit" data-tooltip="Correct the attack count. The damage bonus is spread across it, so more attacks means less on each."><i class="fa-solid fa-pen"></i></button>
                </span>
            </div>
            <div class="blacksmith-tool-hint">Armor class becomes a fixed value. Features with their own fixed save DC are not changed.</div>
            ${warnings}`;
    }

    _failureHtml(error) {
        return `<div class="blacksmith-tool-empty">${esc(error?.message ?? 'This creature cannot be scaled.')}</div>`;
    }

    /** A target that cannot be scaled at all: say why, offer nothing to press. */
    _refusal(error) {
        return {
            appId: WINDOW_ID,
            bodyContent: `<div class="blacksmith-npc-scaling-body"><div class="blacksmith-tool-empty">${esc(error?.message ?? 'This creature cannot be scaled.')}</div></div>`
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        const root = this.element;
        if (!root || this._wired) return;
        this._wired = true;

        // The CR select. A native `change`, listened for once on the window root.
        root.addEventListener('change', (event) => {
            const select = event.target?.closest?.('select[name="npc-scaling-cr"]');
            if (select) {
                this._cr = EncounterManager.parseCR(select.value);
                this.render();
                return;
            }
            // An editable text field announces itself with a `change` carrying `{ value, previous }`.
            const editable = event.target?.closest?.('.blacksmith-tool-editable');
            const value = event.detail?.value;
            if (!editable || value === undefined) return;
            if (editable.dataset.field === 'label') {
                this._label = String(value).trim() || DEFAULT_LABEL;
                this.render();
            } else if (editable.dataset.field === 'attacks') {
                const n = Math.round(Number(value));
                if (Number.isFinite(n) && n >= 1 && n <= 10) {
                    this._attacks = n;
                    this.render();
                }
            }
        });
    }

    // ==============================================================
    // ===== ACTIONS ================================================
    // ==============================================================

    async _apply() {
        if (this._busy || !this._canApply) return;
        this._busy = true;
        try {
            const { actor } = await NpcScalingManager.apply(this._target, {
                cr: this._cr, label: this._label, attacksPerRound: this._attacks ?? undefined
            });
            ToastAPI.show({
                title: 'Scaled actor created',
                subtitle: actor.name,
                icon: 'fa-solid fa-arrow-up-right-dots',
                moduleId: MODULE.ID,
                duration: 8,
                callToAction: 'Open sheet',
                onClick: () => actor.sheet?.render(true)
            });
        } catch (error) {
            ToastAPI.show({
                title: 'Could not scale',
                subtitle: error instanceof NpcScalingError ? error.message : 'Something went wrong. See the console.',
                icon: 'fa-solid fa-triangle-exclamation',
                moduleId: MODULE.ID,
                duration: 10
            });
            if (!(error instanceof NpcScalingError)) console.error(`${MODULE.NAME} | NPC Scaling:`, error);
        } finally {
            this._busy = false;
            this.render();
        }
    }

    async _openSource() {
        try {
            const { source } = await NpcScalingManager.resolve(this._target);
            source?.sheet?.render(true);
        } catch (error) {
            ui.notifications?.warn(error.message);
        }
    }

    // ==============================================================
    // ===== OPENING ================================================
    // ==============================================================

    /**
     * Open the window for a creature, or focus the one already open for it. GM only.
     * @param {Actor|Token|TokenDocument|string} target
     * @returns {Promise<NpcScalingWindow|null>}
     */
    static async open(target) {
        if (!game.user?.isGM) {
            ui.notifications?.warn('Only a GM can scale a creature.');
            return null;
        }
        if (!target) {
            ui.notifications?.warn('Select an NPC token, or open an NPC sheet, to scale it.');
            return null;
        }
        return this.openFor(target);
    }
}

/** The first selected NPC token, or null. The toolbar and the registry both open for it. */
function selectedNpcToken() {
    return canvas?.tokens?.controlled?.find((t) => t.actor?.type === 'npc') ?? null;
}

/**
 * Called from `blacksmith.js` once the window registry exists. Registers the window by id, and its two ways in:
 * the GM toolbar (for the selected NPC token) and the NPC sheet's header menu (for that sheet's actor).
 * Both go through the public registration surface a satellite would use.
 */
export function registerNpcScalingWindow() {
    registerWindow(WINDOW_ID, {
        moduleId: MODULE.ID,
        title: 'Scale NPC',
        open: () => NpcScalingWindow.open(selectedNpcToken())
    });

    registerToolbarTool('blacksmith-scale-npc', {
        icon: 'fa-solid fa-arrow-up-right-dots',
        name: 'blacksmith-scale-npc',
        title: 'Scale NPC (select an NPC token first)',
        zone: 'gmtools',
        order: 40,
        moduleId: MODULE.ID,
        gmOnly: true,
        onClick: () => NpcScalingWindow.open(selectedNpcToken())
    });

    // Every actor sheet calls the base-class header hook; only an NPC sheet, opened by a GM, gets the entry.
    // The ApplicationV2 hook, not the V1 `getActorSheetHeaderButtons`, which never fires on v13.
    HookManager.registerHook({
        name: 'getHeaderControlsActorSheetV2',
        description: 'NPC Scaling: add Scale NPC to the NPC sheet controls menu',
        context: 'npc-scaling-header-controls',
        priority: 3,
        callback: (app, controls) => {
            // --- BEGIN - HOOKMANAGER CALLBACK ---
            if (!game.user?.isGM || app.document?.type !== 'npc') return;
            // A header-control click dispatches to app.options.actions[action], and core has no handler for
            // this name, so the handler is installed alongside the entry.
            app.options.actions.blacksmithScaleNpc ??= () => NpcScalingWindow.open(app.document);
            controls.push({
                icon: 'fa-solid fa-arrow-up-right-dots',
                label: 'Scale NPC',
                action: 'blacksmithScaleNpc'
            });
            // --- END - HOOKMANAGER CALLBACK ---
        }
    });
}

export { WINDOW_ID as NPC_SCALING_WINDOW_ID };
