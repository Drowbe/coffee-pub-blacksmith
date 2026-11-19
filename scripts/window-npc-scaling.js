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
import { CombatBarManager } from './manager-combatbar.js';
import { DialogAPI } from './api-dialog.js';
import { NpcScalingManager } from './manager-npc-scaling.js';
import { NpcScalingAPI } from './api-npc-scaling.js';
import { CompendiumsAPI } from './api-compendiums.js';
import { NpcScalingError, guidelineFor } from './utility-npc-scaling.js';

const WINDOW_ID = 'blacksmith-npc-scaling';
const DEFAULT_LABEL = 'Super';

/** The fields of the template editor, in the order they appear: name, then the numbers. */
const TEMPLATE_FIELDS = [
    { key: 'crBy', label: 'Challenge rating step', hint: 'Steps up (or down, with a minus) from the creature\'s own CR.' },
    { key: 'ac', label: 'Armor class' },
    { key: 'attack', label: 'Attack bonus', hint: 'The total change, proficiency included.' },
    { key: 'saveDC', label: 'Spell save DC', hint: 'The total change, proficiency included.' },
    { key: 'initiative', label: 'Initiative' },
    { key: 'damage', label: 'Damage per hit', hint: 'Added to every weapon and spell attack.' },
    { key: 'legres', label: 'Legendary resistances', hint: 'Sets the count. 0 leaves it alone.' },
    { key: 'legact', label: 'Legendary actions', hint: 'Sets the count. 0 leaves it alone.' }
];

/** Every CR the guidelines table has a row for, in order, as the keys the table uses. */
const CR_OPTIONS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));

/** A figure the table can compare: a real number, not a blank, and not a formula. */
const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/** The rows whose size is the point, so they get a bar of now against scaled beside the change. */
const MAGNITUDE_ROWS = new Set(['hp', 'damage', 'dpr', 'attacks']);

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
        'npc-scaling-open-source': (_event, _target, win) => win?._openSource(),
        'npc-scaling-revert': (_event, _target, win) => win?._revert(),
        'npc-scaling-template-new': (_event, _target, win) => win?._editTemplate(null),
        'npc-scaling-template-edit': (_event, _target, win) => win?._editTemplate(win._selectedTemplate()),
        'npc-scaling-template-delete': (_event, _target, win) => win?._deleteTemplate(),
        'npc-scaling-template-export': () => {
            const count = NpcScalingAPI.templates.exportToFile();
            ui.notifications?.info(`NPC Scaling: exported ${count} template${count === 1 ? '' : 's'}.`);
        },
        'npc-scaling-template-import': (_event, _target, win) => win?._importTemplates(),
        'npc-scaling-guidelines': (_event, _target, win) => win?._guidelines()
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
        this._mode = 'cr';
        this._templateId = null;
        this._labelTouched = false;
        this._label = DEFAULT_LABEL;
        this._attacks = null;
        this._attacksTo = null;
        this._count = 1;
        this._output = 'actor';
        this._hasToken = false;
        this._chosenCR = null;
        this._sceneSeq = 0;
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

        // A token already scaled is offered its way back, not another scaling on top.
        const scaledToken = resolved.token ? NpcScalingManager.tokenScaling(resolved.token) : null;
        if (scaledToken) return this._revertView(resolved.token, scaledToken);
        this._hasToken = Boolean(resolved.token);
        // An unlinked token whose actor is already a scaled copy cannot be scaled in place; the switch says so.
        const tokenBlocked = this._output === 'token' && this._hasToken && !resolved.token.actorLink && fromScaled;
        const read = fromScaled ? source : actor;
        const snapshot = NpcScalingManager.snapshot(read);

        // A first render has no CR chosen yet: offer four above the creature's own, which is the kind of
        // step the tool exists for, and which the GM changes in one click.
        if (this._cr === null) this._cr = Math.min(30, Math.floor(snapshot.cr ?? 0) + 4);

        const templates = NpcScalingAPI.templates.list();
        if (!templates.some((t) => t.id === this._templateId)) this._templateId = templates[0]?.id ?? null;
        const template = this._selectedTemplate();
        if (this._mode === 'template' && template && !this._labelTouched) this._label = template.name;

        let planned = null;
        let failure = null;
        if (this._mode === 'template' && !template) {
            failure = new NpcScalingError('BAD_TEMPLATE', 'There are no templates yet. Create one to scale by it.');
        } else {
            try {
                planned = await NpcScalingManager.plan(this._target, this._request());
            } catch (error) {
                failure = error;
            }
        }

        const attacks = planned?.snapshot?.attacksPerRound ?? snapshot.attacksPerRound;
        this._canApply = Boolean(planned) && !this._busy && !tokenBlocked;

        // The scene's own reading of what rating to aim for. A failure here is never worth losing the window.
        let guidance = null;
        try {
            this._chosenCR = planned?.spec?.cr?.to ?? snapshot.cr ?? null;
            guidance = await NpcScalingAPI.guidance(this._target, { cr: this._chosenCR, count: this._count });
        } catch (error) {
            console.warn(`${MODULE.NAME} | NPC Scaling: scene guidance unavailable:`, error);
        }

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
                        <span>Scale by</span>
                        <span class="blacksmith-tool-section-actions">
                            <div class="blacksmith-tool-segmented" role="radiogroup" aria-label="Scale by">
                                <label class="blacksmith-tool-segment"><input type="radio" name="npc-scaling-mode" value="cr"${this._mode === 'cr' ? ' checked' : ''}><span>Challenge rating</span></label>
                                <label class="blacksmith-tool-segment"><input type="radio" name="npc-scaling-mode" value="template"${this._mode === 'template' ? ' checked' : ''}><span>Template</span></label>
                            </div>
                        </span>
                    </div>
                    ${this._mode === 'template' ? this._templatePickerHtml(templates, template) : ''}
                    ${this._guidanceHtml(guidance)}
                    <div class="blacksmith-npc-scaling-fields${this._mode === 'template' ? ' is-single' : ''}">
                        ${this._mode === 'cr' ? `<label class="blacksmith-npc-scaling-field">
                            <span>Challenge rating</span>
                            <select class="blacksmith-select" name="npc-scaling-cr">${crSelect}</select>
                        </label>` : ''}
                        <div class="blacksmith-npc-scaling-field">
                            <span>Name suffix</span>
                            <span class="blacksmith-tool-editable" data-field="label" data-value="${esc(this._label)}" data-required="true" data-maxlength="40" data-placeholder="Super">
                                <span class="blacksmith-tool-editable-text">${esc(this._label)}</span>
                                <button type="button" class="blacksmith-tool-btn is-icon blacksmith-tool-editable-edit" data-tooltip="Change the name suffix"><i class="fa-solid fa-pen"></i></button>
                            </span>
                        </div>
                    </div>
                    ${this._outputHtml(resolved, tokenBlocked)}
                </div>

                ${this._balanceHtml(guidance)}

                <div class="blacksmith-tool-section">
                    <div class="blacksmith-tool-section-title">
                        <i class="fa-solid fa-table-list"></i>
                        <span>What changes</span>
                        <span class="blacksmith-tool-section-actions">
                            <button type="button" class="blacksmith-tool-btn" data-action="npc-scaling-guidelines" data-tooltip="Which challenge rating table the changes are read from"><i class="fa-solid fa-table"></i> Guidelines</button>
                        </span>
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
            toolFooterRight: this._applyButtonHtml(source, resolved.token)
        };
    }

    /**
     * Which rating to aim for, from the scene: a band is a chip that sets the CR. Shown for a CR retarget only. A
     * template decides its own rating, so there is nothing to pick, and the scene table says where it lands.
     */
    _guidanceHtml(g) {
        if (!g || this._mode !== 'cr') return '';
        if (!g.available) {
            return `<div class="blacksmith-tool-hint blacksmith-npc-scaling-guidance">Put the party's tokens on this scene to see which challenge rating would make it Easy, Hard or Deadly.</div>`;
        }
        const range = (b) => (b.from === b.to ? EncounterManager.formatCR(b.from) : `${EncounterManager.formatCR(b.from)}\u2013${EncounterManager.formatCR(b.to)}`);
        const inBand = (b) => g.chosen && g.chosen.cr >= b.from && g.chosen.cr <= b.to;
        const chips = g.bands.map((b) => `<label class="blacksmith-tool-chip is-selectable" data-tooltip="Set the challenge rating to ${esc(EncounterManager.formatCR(b.from))}, the lowest that makes this ${esc(b.label)}">
                    <input type="radio" name="npc-scaling-band" value="${b.from}"${inBand(b) ? ' checked' : ''}>
                    <span>${esc(b.label)} ${esc(range(b))}</span>
                </label>`).join('');
        const many = g.count > 1 ? `${g.count} of them` : 'this creature';
        return `
            <div class="blacksmith-tool-chips blacksmith-npc-scaling-bands">${chips}</div>
            <div class="blacksmith-tool-hint blacksmith-npc-scaling-guidance">Each range is the challenge ratings that make the scene that hard with ${many} counted in.</div>`;
    }

    /**
     * The scene: how many of this creature to add, then what that does to the balance. The slider sits OUTSIDE the
     * region that is redrawn while it moves, so dragging it is never interrupted.
     */
    _balanceHtml(g) {
        if (!g?.available) return '';
        return `
            <div class="blacksmith-tool-section">
                <div class="blacksmith-tool-section-title">
                    <i class="fa-solid fa-scale-balanced"></i>
                    <span>The scene</span>
                </div>
                <div class="blacksmith-npc-scaling-count">
                    <span>How many of these</span>
                    <div class="blacksmith-slider">
                        <input type="range" name="npc-scaling-count" min="1" max="20" step="1" value="${g.count}" aria-label="How many of this creature to add">
                        <span>\u00d7 ${g.count}</span>
                    </div>
                </div>
                <div data-region="npc-scaling-scene">${this._sceneBodyHtml(g)}</div>
            </div>`;
    }

    /**
     * The meter and the balance table. The meter is the difficulty rule laid out along one axis, monsters' CR as a
     * share of the party's, with a pin for the scene now and one for the scene after the scaling. The zone colours
     * are the combat bar's own.
     */
    _sceneBodyHtml(g) {
        const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
        const pct = (ratio) => Math.min(100, Math.max(0, (ratio / g.maxRatio) * 100));
        const now = g.now;
        const next = g.chosen ?? g.now;

        const zones = g.zones.map((z) => `<span class="blacksmith-npc-scaling-zone${next?.key === z.key ? ' is-active' : ''}" style="width:${pct(z.to) - pct(z.from)}%;background:${CombatBarManager.getDifficultyChipColor(z.key)}" data-tooltip="${esc(z.label)}"><span>${esc(z.label)}</span></span>`).join('');
        const pin = (kind, label, point) => point
            ? `<span class="blacksmith-npc-scaling-pin is-${kind}" style="left:${pct(point.ratio)}%" data-tooltip="${esc(label)}: ${esc(point.label)}, monsters at ${Math.round(point.ratio * 100)}% of the party"><span>${esc(label)}</span></span>`
            : '';
        const meter = `
            <div class="blacksmith-npc-scaling-meter" role="img" aria-label="Encounter balance now and after scaling">
                <div class="blacksmith-npc-scaling-track">${zones}</div>
                ${pin('now', 'Now', now)}
                ${pin('scaled', 'Scaled', next)}
            </div>`;

        const others = g.othersCR > 0 ? `${num(g.othersCR)} from the other monsters on the scene` : 'No other monsters are on the scene';
        const cr = g.chosen ? num(g.chosen.cr) : null;
        const added = g.chosen ? ` plus ${g.count > 1 ? `${g.count} \u00d7 CR ${cr}` : `this creature at CR ${cr}`}` : '';
        const notOn = g.onScene ? '' : ' It is not on the scene, so Now is the scene without it.';
        const row = (stat, was, will, note = '', delta = '<span></span>') => `<div class="blacksmith-npc-scaling-row">
                <span class="blacksmith-npc-scaling-stat">${esc(stat)}</span>
                <span class="blacksmith-npc-scaling-now">${esc(was)}</span>
                <span class="blacksmith-npc-scaling-next">${esc(will)}</span>
                ${delta}
                ${note ? `<span class="blacksmith-npc-scaling-note blacksmith-tool-hint">${esc(note)}</span>` : ''}
            </div>`;
        const share = next ? `Monsters are ${Math.round(next.ratio * 100)}% of the party's CR.` : '';
        const shift = now && next && now.key !== next.key ? ` The scene moves from ${now.label} to ${next.label}.` : '';
        return `
            ${meter}
            <div class="blacksmith-npc-scaling-table has-delta">
                <div class="blacksmith-npc-scaling-row is-head"><span>Balance</span><span>Now</span><span>Scaled</span><span>Change</span></div>
                ${row('Party CR', num(g.partyCR), num(g.partyCR))}
                ${row('Monsters CR', now ? num(now.monsterCR) : '\u2013', next ? num(next.monsterCR) : '\u2013', `${others}${added}.${notOn}`, this._deltaHtml(now?.monsterCR, next?.monsterCR))}
                ${row('Encounter', now?.label ?? '\u2013', next?.label ?? '\u2013', `${share}${shift}`.trim())}
            </div>`;
    }

    /** Redraw only the meter and table, for the slider: a full render would replace the slider under the pointer. */
    async _refreshScene() {
        const seq = ++this._sceneSeq;
        let g;
        try {
            g = await NpcScalingAPI.guidance(this._target, { cr: this._chosenCR, count: this._count });
        } catch {
            return;
        }
        if (seq !== this._sceneSeq || !g?.available) return;
        const region = this.element?.querySelector('[data-region="npc-scaling-scene"]');
        if (region) region.innerHTML = this._sceneBodyHtml(g);
    }

    /** What the result of the scaling is: a new actor, or this token. Only offered for a token. */
    _outputHtml(resolved, blocked) {
        const token = resolved.token;
        if (!token) return '';
        const radio = (value, label, tip) => `<label class="blacksmith-tool-segment" data-tooltip="${esc(tip)}"><input type="radio" name="npc-scaling-output" value="${value}"${this._output === value ? ' checked' : ''}><span>${label}</span></label>`;
        let hint = '';
        if (this._output === 'token') {
            if (blocked) hint = `${esc(token.name)} is already a scaled copy, so it cannot be scaled again in place. Scale the original creature instead.`;
            else if (token.actorLink) hint = 'This token is linked to its actor, which other tokens share, so a new actor is made and the token is pointed at it. Reverting points it back and leaves that actor in the directory.';
            else hint = "This token's own actor is changed in place. Nothing is created, and Revert puts every changed value back.";
        }
        return `
            <div class="blacksmith-npc-scaling-output">
                <span>Result</span>
                <div class="blacksmith-tool-segmented" role="radiogroup" aria-label="Result">
                    ${radio('actor', 'New actor', 'Create a new actor and leave this token alone')}
                    ${radio('token', 'This token', 'Scale the token on the scene')}
                </div>
            </div>
            ${hint ? `<div class="blacksmith-tool-hint">${hint}</div>` : ''}`;
    }

    /** The one write, labelled for what it does. */
    _applyButtonHtml(source, token) {
        const disabled = this._canApply ? '' : ' disabled';
        if (token && this._output === 'token') {
            return `<button type="button" class="blacksmith-window-btn-primary" data-action="npc-scaling-apply"${disabled} data-tooltip="Scale ${esc(token.name)} on the scene. Revert puts it back."><i class="fa-solid fa-arrow-up-right-dots"></i> Scale This Token</button>`;
        }
        return `<button type="button" class="blacksmith-window-btn-primary" data-action="npc-scaling-apply"${disabled} data-tooltip="Create a new actor at this challenge rating. ${esc(source.name)} is not changed."><i class="fa-solid fa-plus"></i> Create Scaled Actor</button>`;
    }

    /** A scaled token: what was done to it, and the way back. */
    _revertView(token, record) {
        const cr = (n) => EncounterManager.formatCR(n ?? 0);
        const how = record.mode === 'swap'
            ? 'It now points at a scaled actor made from its own. Reverting points it back and leaves that actor in the directory.'
            : 'Its own actor was changed in place. Reverting puts every changed value back.';
        return {
            appId: WINDOW_ID,
            bodyContent: `
                <div class="blacksmith-npc-scaling-body">
                    <div class="blacksmith-tool-section is-ruleless">
                        <div class="blacksmith-tool-section-title">
                            <i class="fa-solid fa-skull"></i>
                            <span>${esc(token.name)}</span>
                            <span class="blacksmith-tool-section-actions">
                                <span class="blacksmith-badge blacksmith-badge-info">CR ${esc(cr(record.crFrom))} to ${esc(cr(record.crTo))}</span>
                            </span>
                        </div>
                        <div class="blacksmith-tool-hint">This token has been scaled (${esc(new Date(record.appliedAt).toLocaleString())}). ${esc(how)}</div>
                        <div class="blacksmith-tool-hint">Revert it to scale it again; a new scaling starts from the original, so the two do not stack.</div>
                    </div>
                </div>`,
            toolFooterRight: `<button type="button" class="blacksmith-window-btn-primary" data-action="npc-scaling-revert" data-tooltip="Put ${esc(token.name)} back as it was"><i class="fa-solid fa-rotate-left"></i> Revert Token</button>`
        };
    }

    /**
     * The change between two figures as a small coloured chip: up in the damage red (a stronger creature), down in
     * the info blue (a weaker one), none flat. Blank where either figure is not a plain number.
     * @param {*} from
     * @param {*} to
     * @param {boolean} [percent=false]  Also say it as a percentage in the tooltip, for rows where size is the point.
     */
    _deltaHtml(from, to, percent = false) {
        if (!isNum(from) || !isNum(to)) return '<span></span>';
        const f = Number(from);
        const d = Math.round((Number(to) - f) * 100) / 100;
        const dir = d > 0 ? 'is-up' : d < 0 ? 'is-down' : 'is-flat';
        const text = d > 0 ? `+${d}` : d < 0 ? `\u2212${Math.abs(d)}` : '0';
        const tip = d === 0 ? 'No change'
            : percent && f > 0 ? `${Math.abs(Math.round((d / f) * 100))}% ${d > 0 ? 'more' : 'less'} than now`
                : `${Math.abs(d)} ${d > 0 ? 'higher' : 'lower'} than now`;
        return `<span class="blacksmith-npc-scaling-delta ${dir}" data-tooltip="${esc(tip)}">${esc(text)}</span>`;
    }

    /** Two thin bars under a row, now and scaled, to the same scale, so how much bigger reads without the numbers. */
    _barsHtml(row) {
        if (!MAGNITUDE_ROWS.has(row.key) || !isNum(row.from) || !isNum(row.to)) return '';
        const f = Number(row.from);
        const t = Number(row.to);
        const max = Math.max(f, t);
        if (!(max > 0)) return '';
        const dir = t > f ? 'is-up' : t < f ? 'is-down' : 'is-flat';
        return `<span class="blacksmith-npc-scaling-bars" aria-hidden="true">
                <span class="blacksmith-npc-scaling-bar is-now" style="width:${((f / max) * 100).toFixed(1)}%"></span>
                <span class="blacksmith-npc-scaling-bar is-scaled ${dir}" style="width:${((t / max) * 100).toFixed(1)}%"></span>
            </span>`;
    }

    /** The stat / now / scaled table, the damage estimate, and anything the engine wants the GM to see. */
    _previewHtml(planned, attacks) {
        const rows = planned.preview.map((row) => {
            const now = row.from === null || row.from === undefined ? '' : esc(row.from);
            const next = row.to === null || row.to === undefined ? '' : esc(row.to);
            // The rating row is the cause of every other change, so it carries no change of its own.
            return `<div class="blacksmith-npc-scaling-row">
                <span class="blacksmith-npc-scaling-stat">${esc(row.label)}</span>
                <span class="blacksmith-npc-scaling-now">${now || '&ndash;'}</span>
                <span class="blacksmith-npc-scaling-next">${next || '&ndash;'}</span>
                ${row.key === 'cr' ? '<span></span>' : this._deltaHtml(row.from, row.to, MAGNITUDE_ROWS.has(row.key))}
                ${this._barsHtml(row)}
                ${row.note ? `<span class="blacksmith-npc-scaling-note blacksmith-tool-hint">${esc(row.note)}</span>` : ''}
            </div>`;
        }).join('');

        const warnings = planned.warnings.map((w) =>
            `<div class="blacksmith-tool-hint blacksmith-npc-scaling-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(w.message)}</div>`).join('');

        const shown = Number.isInteger(attacks) ? attacks : 1;
        const after = planned.spec.attacks?.to ?? shown;
        return `
            <div class="blacksmith-npc-scaling-table has-delta">
                <div class="blacksmith-npc-scaling-row is-head"><span>Stat</span><span>Now</span><span>Scaled</span><span>Change</span></div>
                ${rows || '<div class="blacksmith-tool-empty">Nothing changes at this challenge rating.</div>'}
            </div>
            <div class="blacksmith-npc-scaling-fields">
                <div class="blacksmith-npc-scaling-field">
                    <span>Attacks per round now (estimate)</span>
                    <span class="blacksmith-tool-editable" data-field="attacks" data-value="${shown}" data-required="true" data-maxlength="2">
                        <span class="blacksmith-tool-editable-text">${shown}</span>
                        <button type="button" class="blacksmith-tool-btn is-icon blacksmith-tool-editable-edit" data-tooltip="Correct the attack count the creature makes now. It is read from Multiattack where that says so plainly."><i class="fa-solid fa-pen"></i></button>
                    </span>
                </div>
                ${this._mode === 'cr' ? `<div class="blacksmith-npc-scaling-field">
                    <span>Attacks per round after scaling</span>
                    <span class="blacksmith-tool-editable" data-field="attacksTo" data-value="${after}" data-required="true" data-maxlength="2">
                        <span class="blacksmith-tool-editable-text">${after}</span>
                        <button type="button" class="blacksmith-tool-btn is-icon blacksmith-tool-editable-edit" data-tooltip="How many attacks it makes at the new challenge rating. The damage is shared across them, and Multiattack says so. Never fewer than it makes now."><i class="fa-solid fa-pen"></i></button>
                    </span>
                </div>` : ''}
            </div>
            <div class="blacksmith-tool-hint">Damage is written into the creature's own attacks and features, and Multiattack says how many it makes. Spell damage is left to the spells. Armor class becomes a fixed value, and features with their own fixed save DC are not changed. Challenge rating changes are read from: ${esc(NpcScalingAPI.guidelineInfo().label)}.</div>
            ${warnings}`;
    }

    // ==============================================================
    // ===== TEMPLATES ==============================================
    // ==============================================================

    /** What the current choices ask the manager to do. One place, so the preview and the apply cannot disagree. */
    _request() {
        const request = { label: this._label, attacksPerRound: this._attacks ?? undefined, attacksTo: this._attacksTo ?? undefined };
        if (this._hasToken && this._output === 'token') request.output = 'token';
        if (this._mode === 'template') request.template = this._templateId;
        else request.cr = this._cr;
        return request;
    }

    _selectedTemplate() {
        return NpcScalingAPI.templates.get(this._templateId);
    }

    /** One line saying what a template does, in the terms a GM reads it. */
    _describeTemplate(t) {
        const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
        const parts = [];
        if (t.crBy) parts.push(`CR ${signed(t.crBy)}`);
        if (t.hp.value) parts.push(`${signed(t.hp.value)}${t.hp.mode === 'percent' ? '%' : ''} hit points`);
        if (t.ac) parts.push(`${signed(t.ac)} AC`);
        if (t.attack) parts.push(`${signed(t.attack)} to hit`);
        if (t.saveDC) parts.push(`${signed(t.saveDC)} spell DC`);
        if (t.initiative) parts.push(`${signed(t.initiative)} initiative`);
        if (t.damage) parts.push(`${signed(t.damage)} damage per hit`);
        if (t.legres) parts.push(`${t.legres} legendary resistance${t.legres === 1 ? '' : 's'}`);
        if (t.legact) parts.push(`${t.legact} legendary action${t.legact === 1 ? '' : 's'}`);
        return parts.join(', ') || 'Changes nothing.';
    }

    /** The template chips, what the chosen one does, and the library's tools. */
    _templatePickerHtml(templates, selected) {
        const chips = templates.map((t) => `
            <label class="blacksmith-tool-chip is-selectable">
                <input type="radio" name="npc-scaling-template" value="${esc(t.id)}"${t.id === selected?.id ? ' checked' : ''}>
                <span>${esc(t.name)}</span>
            </label>`).join('');
        const tool = (action, icon, tip, disabled = false) =>
            `<button type="button" class="blacksmith-tool-btn is-icon" data-action="${action}" data-tooltip="${esc(tip)}"${disabled ? ' disabled' : ''}><i class="fa-solid ${icon}"></i></button>`;
        return `
            <div class="blacksmith-npc-scaling-templates">
                <div class="blacksmith-tool-chips">${chips || '<span class="blacksmith-tool-hint">No templates yet.</span>'}</div>
                <div class="blacksmith-npc-scaling-template-tools">
                    ${tool('npc-scaling-template-new', 'fa-plus', 'New template')}
                    ${tool('npc-scaling-template-edit', 'fa-pen', 'Edit the selected template', !selected)}
                    ${tool('npc-scaling-template-delete', 'fa-trash', 'Delete the selected template', !selected)}
                    ${tool('npc-scaling-template-export', 'fa-file-export', 'Export every template to a file')}
                    ${tool('npc-scaling-template-import', 'fa-file-import', 'Import templates from a file')}
                </div>
            </div>
            ${selected ? `<div class="blacksmith-tool-hint">${esc(this._describeTemplate(selected))}</div>` : ''}`;
    }

    /** The template editor's body, prefilled. `error` is rendered by the dialog helper itself. */
    _templateFormHtml(t) {
        const num = (key, label, hint) => `
            <label class="blacksmith-npc-scaling-form-row">
                <span class="blacksmith-field-label">${esc(label)}</span>
                <input type="number" step="1" name="${key}" class="blacksmith-input" value="${esc(t[key])}">
                ${hint ? `<span class="blacksmith-tool-hint">${esc(hint)}</span>` : ''}
            </label>`;
        return `
            <div class="blacksmith-npc-scaling-form">
                <label class="blacksmith-npc-scaling-form-row">
                    <span class="blacksmith-field-label">Name</span>
                    <input type="text" name="name" class="blacksmith-input" maxlength="40" value="${esc(t.name)}">
                </label>
                <label class="blacksmith-npc-scaling-form-row">
                    <span class="blacksmith-field-label">Hit points</span>
                    <span class="blacksmith-npc-scaling-form-pair">
                        <input type="number" step="1" name="hpValue" class="blacksmith-input" value="${esc(t.hp.value)}">
                        <select name="hpMode" class="blacksmith-select">
                            <option value="percent"${t.hp.mode === 'percent' ? ' selected' : ''}>% of the creature's own</option>
                            <option value="delta"${t.hp.mode === 'delta' ? ' selected' : ''}>flat amount</option>
                        </select>
                    </span>
                </label>
                ${TEMPLATE_FIELDS.map((f) => num(f.key, f.label, f.hint)).join('')}
            </div>`;
    }

    /**
     * Create or edit a template in one dialog. A `null` start is "new": it begins from what the window is
     * showing now, so a good CR retarget can be kept as a template in one step.
     * @param {Object|null} start  The template to edit, or null for a new one.
     */
    async _editTemplate(start) {
        let draft = start;
        if (!draft) {
            let fromPreview = null;
            try {
                const planned = await NpcScalingManager.plan(this._target, this._request());
                // A template needs a name to exist at all, so build it under a placeholder and clear it: the GM names it.
                fromPreview = { ...NpcScalingAPI.templates.fromSpec(planned.spec, planned.snapshot, 'New'), name: '' };
            } catch (error) {
                // No preview to start from (nothing chosen yet): start blank.
            }
            draft = fromPreview ?? { name: '', crBy: 0, hp: { mode: 'percent', value: 0 }, ac: 0, attack: 0, saveDC: 0, initiative: 0, damage: 0, legres: 0, legact: 0 };
        }

        const read = (form) => ({
            id: start?.id ?? '',
            name: form.elements.name.value.trim(),
            hp: { mode: form.elements.hpMode.value, value: Number(form.elements.hpValue.value) },
            ...Object.fromEntries(TEMPLATE_FIELDS.map((f) => [f.key, Number(form.elements[f.key].value)]))
        });

        const outcome = await DialogAPI.prompt({
            title: start ? `Edit ${start.name}` : 'New Scaling Template',
            content: ({ value }) => this._templateFormHtml(value ?? draft),
            submitLabel: 'Save',
            submitIcon: 'fa-solid fa-floppy-disk',
            focusSelector: '[name="name"]',
            getValue: read,
            validate: (value) => {
                if (!value.name) return 'Give the template a name.';
                if (NpcScalingAPI.templates.nameTaken(value.name, start?.id ?? null)) return `There is already a template called "${value.name}".`;
                return null;
            },
            cancelValue: null,
            closeValue: null
        });
        if (outcome?.action !== DialogAPI.ACTIONS.SUBMIT || !outcome.value) return;

        try {
            const saved = await NpcScalingAPI.templates.save(outcome.value);
            this._mode = 'template';
            this._templateId = saved.id;
            this._labelTouched = false;
        } catch (error) {
            ui.notifications?.error(error.message);
        }
        this.render();
    }

    async _deleteTemplate() {
        const template = this._selectedTemplate();
        if (!template) return;
        const confirmed = await DialogAPI.confirm({
            title: 'Delete Template',
            content: `<p>Delete the template <strong>${esc(template.name)}</strong>? Creatures already scaled with it are not changed.</p>`,
            confirmLabel: 'Delete Template',
            confirmIcon: 'fa-solid fa-trash',
            destructive: true
        });
        if (!confirmed) return;
        await NpcScalingAPI.templates.remove(template.id);
        this._templateId = null;
        this.render();
    }

    /** Pick a file, ask merge or replace, and bring its templates in. */
    _importTemplates() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.style.display = 'none';
        input.addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            input.remove();
            if (!file) return;

            let templates;
            try {
                templates = NpcScalingAPI.templates.parseImport(await file.text());
            } catch (error) {
                ui.notifications?.error(`NPC Scaling: ${error.message}`);
                return;
            }

            // ASKED, not assumed: replacing a library somebody built has no way back.
            const { action, value } = await DialogAPI.wait({
                title: 'Import Scaling Templates',
                content: `<p>Found <strong>${templates.length}</strong> template${templates.length === 1 ? '' : 's'}.</p>
                          <p>Merge them into this world's library, or replace it entirely?</p>`,
                buttons: [
                    { action: 'merge', label: 'Merge', icon: 'fas fa-code-merge', default: true },
                    { action: 'replace', label: 'Replace All', icon: 'fas fa-triangle-exclamation' },
                    { action: 'cancel', label: 'Cancel', icon: 'fas fa-times' }
                ],
                modal: true
            });
            const mode = action === DialogAPI.ACTIONS.SUBMIT ? value : null;
            if (mode !== 'merge' && mode !== 'replace') return;

            const result = await NpcScalingAPI.templates.import(templates, { replace: mode === 'replace' });
            ui.notifications?.info(mode === 'replace'
                ? `NPC Scaling: replaced the library with ${result.total} template${result.total === 1 ? '' : 's'}.`
                : `NPC Scaling: ${result.added} added, ${result.updated} updated.`);
            this.render();
        });
        document.body.appendChild(input);
        input.click();
    }

    // ==============================================================
    // ===== GUIDELINES =============================================
    // ==============================================================

    /** The CR table in use, and the two things to do about it: build one from a compendium, or go back. */
    async _guidelines() {
        const info = NpcScalingAPI.guidelineInfo();
        const custom = info.kind === 'compendium';
        const when = custom && info.builtAt ? ` Built ${new Date(info.builtAt).toLocaleDateString()} from ${info.samples} creatures.` : '';
        const { action, value } = await DialogAPI.wait({
            title: 'Challenge Rating Guidelines',
            content: `<p>Scaling moves each stat by the gap between two challenge ratings in a table.</p>
                      <p>Now using: <strong>${esc(info.label)}</strong>.${esc(when)}</p>
                      ${custom ? '' : '<p class="blacksmith-tool-hint">The 2024 books publish no such table. Build one from the creatures in a compendium, such as the 2024 monsters, and Blacksmith will use the typical figures it finds there.</p>'}`,
            buttons: [
                { action: 'build', label: 'Build from Compendium', icon: 'fas fa-table', default: true },
                ...(custom ? [{ action: 'reset', label: 'Use DMG 2014', icon: 'fas fa-rotate-left' }] : []),
                { action: 'cancel', label: 'Close', icon: 'fas fa-times' }
            ]
        });
        const choice = action === DialogAPI.ACTIONS.SUBMIT ? value : null;
        if (choice === 'build') await this._buildGuidelines();
        else if (choice === 'reset') {
            await NpcScalingAPI.resetGuidelines();
            this.render();
        }
    }

    /** Pick compendiums, read them, show what came out beside what is in use, and keep it only if asked. */
    async _buildGuidelines() {
        const packs = CompendiumsAPI.getAllPacks('Actor');
        if (!packs.length) {
            ui.notifications?.warn('There are no actor compendiums to build from.');
            return;
        }
        // Start from the compendiums the GM already chose for monsters; failing that, the 2024 ones the system ships.
        const chosen = new Set(CompendiumsAPI.getSelected('Actor'));
        if (!chosen.size && game.packs.get('dnd5e.actors24')) chosen.add('dnd5e.actors24');

        const picked = await DialogAPI.prompt({
            title: 'Build Guidelines from Compendium',
            content: ({ value }) => {
                const on = new Set(value ?? chosen);
                return `<p>Choose the actor compendiums to read. Only NPCs count, and the typical (median) figures at each challenge rating become the table.</p>
                    <div class="blacksmith-npc-scaling-packs">${packs.map((p) => `
                        <label class="blacksmith-npc-scaling-pack">
                            <input type="checkbox" name="pack" value="${esc(p.id)}"${on.has(p.id) ? ' checked' : ''}>
                            <span>${esc(p.displayLabel)}</span>
                        </label>`).join('')}</div>`;
            },
            submitLabel: 'Read Creatures',
            submitIcon: 'fa-solid fa-table',
            getValue: (form) => [...form.querySelectorAll('input[name="pack"]:checked')].map((el) => el.value),
            validate: (ids) => (ids.length ? null : 'Choose at least one compendium.'),
            cancelValue: null,
            closeValue: null
        });
        if (picked?.action !== DialogAPI.ACTIONS.SUBMIT || !picked.value?.length) return;

        let note = null;
        try { note = ui.notifications?.info('NPC Scaling: reading creatures...', { progress: true }); } catch (_) { /* no progress bar */ }
        let result;
        try {
            result = await NpcScalingAPI.buildGuidelines({
                packs: picked.value,
                onProgress: (done, total) => note?.update?.({ pct: total ? done / total : 0, message: `NPC Scaling: read ${done} of ${total}` })
            });
            note?.update?.({ pct: 1, message: `NPC Scaling: read ${result.report.samples} creatures` });
        } catch (error) {
            ui.notifications?.error(`NPC Scaling: ${error.message}`);
            return;
        }

        const { action, value } = await DialogAPI.wait({
            title: 'Challenge Rating Guidelines',
            content: this._guidelineCompareHtml(result),
            classes: ['blacksmith-npc-scaling-compare-dialog'],
            buttons: [
                { action: 'use', label: 'Use This Table', icon: 'fas fa-check', default: true },
                { action: 'cancel', label: 'Cancel', icon: 'fas fa-times' }
            ]
        });
        if (action !== DialogAPI.ACTIONS.SUBMIT || value !== 'use') return;
        try {
            await NpcScalingAPI.setGuidelines(result);
            ui.notifications?.info(`NPC Scaling: now using ${result.label}.`);
        } catch (error) {
            ui.notifications?.error(`NPC Scaling: ${error.message}`);
        }
        this.render();
    }

    /** Built table beside the one in use, one row per CR, with how each row came to be. */
    _guidelineCompareHtml(result) {
        const now = NpcScalingAPI.guidelines;
        const cell = (before, after) => (before === after ? `${after}` : `<span class="blacksmith-npc-scaling-was">${before}</span> ${after}`);
        const notes = { sampled: '', smoothed: 'smoothed so it does not fall', interpolated: 'too few creatures; between its neighbours' };
        const rows = result.report.rows.map((r) => {
            const cr = EncounterManager.parseCR(r.key);
            const a = guidelineFor(cr, now);
            const b = guidelineFor(cr, result.table);
            return `<tr class="${r.status === 'sampled' ? '' : 'is-estimated'}">
                <td>${esc(r.key)}</td><td>${r.n}</td>
                <td>${cell(a.ac, b.ac)}</td><td>${cell(a.hp, b.hp)}</td><td>${cell(a.atk, b.atk)}</td>
                <td>${cell(a.dpr, b.dpr)}</td><td>${cell(a.dc, b.dc)}</td>
                <td>${esc(notes[r.status] ?? '')}</td>
            </tr>`;
        }).join('');
        return `<p>Read <strong>${result.report.samples}</strong> creatures from ${esc(result.label.replace(/^Built from /, ''))}${result.skipped ? ` (${result.skipped} could not be read)` : ''}.
                Struck-through figures are what is in use now. Shaded rows are estimates, not measurements.</p>
            <div class="blacksmith-npc-scaling-compare">
                <table>
                    <thead><tr><th>CR</th><th>Creatures</th><th>AC</th><th>HP</th><th>To hit</th><th>Dmg/round</th><th>Save DC</th><th>Note</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
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

        // The count slider, live: only the meter and table are redrawn, so the slider under the pointer survives.
        root.addEventListener('input', (event) => {
            const range = event.target?.closest?.('input[name="npc-scaling-count"]');
            if (!range) return;
            this._count = Math.min(20, Math.max(1, Math.round(Number(range.value)) || 1));
            const label = range.parentElement?.querySelector('span');
            if (label) label.textContent = `\u00d7 ${this._count}`;
            this._refreshScene();
        });

        // The CR select. A native `change`, listened for once on the window root.
        root.addEventListener('change', (event) => {
            const select = event.target?.closest?.('select[name="npc-scaling-cr"]');
            if (select) {
                this._cr = EncounterManager.parseCR(select.value);
                this._attacksTo = null; // the attack count follows the new challenge rating until the GM sets one again
                this.render();
                return;
            }
            const mode = event.target?.closest?.('input[name="npc-scaling-mode"]');
            if (mode) {
                this._mode = mode.value === 'template' ? 'template' : 'cr';
                this.render();
                return;
            }
            const output = event.target?.closest?.('input[name="npc-scaling-output"]');
            if (output) {
                this._output = output.value === 'token' ? 'token' : 'actor';
                this.render();
                return;
            }
            // The slider moves live (see the input listener below); letting go redraws the rest, whose bands depend on it.
            if (event.target?.closest?.('input[name="npc-scaling-count"]')) {
                this.render();
                return;
            }
            const band = event.target?.closest?.('input[name="npc-scaling-band"]');
            if (band) {
                this._cr = Number(band.value);
                this._attacksTo = null; // as for the select: the attack count follows the new rating
                this.render();
                return;
            }
            const chip = event.target?.closest?.('input[name="npc-scaling-template"]');
            if (chip) {
                this._templateId = chip.value;
                this._labelTouched = false; // a new template brings its own name along, until the GM types one
                this.render();
                return;
            }
            // An editable text field announces itself with a `change` carrying `{ value, previous }`.
            const editable = event.target?.closest?.('.blacksmith-tool-editable');
            const value = event.detail?.value;
            if (!editable || value === undefined) return;
            if (editable.dataset.field === 'label') {
                this._label = String(value).trim() || DEFAULT_LABEL;
                this._labelTouched = true;
                this.render();
            } else if (editable.dataset.field === 'attacks') {
                const n = Math.round(Number(value));
                if (Number.isFinite(n) && n >= 1 && n <= 10) {
                    this._attacks = n;
                    this.render();
                }
            } else if (editable.dataset.field === 'attacksTo') {
                const n = Math.round(Number(value));
                if (Number.isFinite(n) && n >= 1 && n <= 10) {
                    this._attacksTo = n;
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
            const request = this._request();
            const result = await NpcScalingManager.apply(this._target, request);
            const { actor } = result;
            if (request.output === 'token') {
                ToastAPI.show({
                    title: 'Token scaled',
                    subtitle: result.token.name,
                    icon: 'fa-solid fa-arrow-up-right-dots',
                    moduleId: MODULE.ID,
                    duration: 8
                });
            } else ToastAPI.show({
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

    /** Put the scaled token back, then redraw: the window offers a fresh scaling again. */
    async _revert() {
        if (this._busy) return;
        this._busy = true;
        try {
            const { token } = await NpcScalingManager.revertToken(this._target);
            ToastAPI.show({
                title: 'Token reverted',
                subtitle: token.name,
                icon: 'fa-solid fa-rotate-left',
                moduleId: MODULE.ID,
                duration: 6
            });
        } catch (error) {
            ToastAPI.show({
                title: 'Could not revert',
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
