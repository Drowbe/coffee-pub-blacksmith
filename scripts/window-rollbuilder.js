// ==================================================================
// ===== ROLL BUILDER (window-rollbuilder.js) =======================
// ==================================================================
//
// Builds and edits one QUICK ROLL for the Request a Roll window.
//
// The quick rolls were twenty-four rows of markup, so "I want Athletics vs
// Acrobatics at DC 12, as a cinematic" meant assembling it by hand every time it
// came up. This window is where a table's own rolls get made.
//
// IT OWNS NO STATE. Open it with a record to edit or with nothing to create; it
// writes through `QuickRollsManager` and calls back so the list behind it can
// re-render. Nothing here reads or writes the setting directly, which is what
// keeps the normalization in one place.
//
// A TOOL WINDOW, on `BlacksmithToolWindowBaseV2` and the shared
// `window-tool-template.hbs`. That is the framework's contract for a small utility
// opened from an in-flow action, and taking it means the shell -- frame, title bar,
// theming, position, and the whole `input`/`select`/`textarea` family -- is the
// system's rather than this file's. The first version of this window rendered its own
// root and painted its own fields, which is exactly the thing the base exists to stop:
// it looked like a different module and it ignored the user's Light/Dark/Glass choice.
//
// EPHEMERAL, so it follows the documented rules for one: a distinct id per instance,
// because two Application V2 windows sharing an id collide in the DOM, and
// `rememberPosition: false`, because `windowPositionKey` defaults to the class name
// and siblings would overwrite each other's saved position. The theme is remembered
// regardless -- that is gated by its own flag.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { BlacksmithToolWindowBaseV2 } from './window-tool-base.js';
import { QuickRollsManager } from './manager-quick-rolls.js';

export class RollBuilderWindow extends BlacksmithToolWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-tool-root';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'blacksmith-roll-builder',
            classes: ['blacksmith-rollbuilder-tool-window'],
            position: { width: 520, height: 700 },
            window: { title: 'Roll Builder', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 420, maxWidth: 720 },
            rememberPosition: false
        }
    );

    /** The shared tool shell. The body below is rendered into its `bodyContent`. */
    static PARTS = {
        body: { template: `modules/${MODULE.ID}/templates/window-tool-template.hbs` }
    };

    /**
     * @param {object} data
     * @param {object|null} data.record - the roll to edit; omit to create a new one
     * @param {Function} [data.onSave] - called with the saved record once it is written
     */
    constructor(data = {}) {
        super({
            // Distinct per instance: opening Edit while a New Roll is still open would
            // otherwise put two windows on one DOM id.
            id: `blacksmith-roll-builder-${foundry.utils.randomID(8)}`,
            window: { title: data.record ? 'Edit Roll' : 'New Roll' }
        });
        this.record = data.record ? QuickRollsManager.normalize(data.record) : null;
        this.onSave = typeof data.onSave === 'function' ? data.onSave : null;
    }

    /**
     * The icon palette.
     *
     * Every icon the built-in rolls use, plus the obvious neighbours a table reaches
     * for next. A GRID RATHER THAN A DROPDOWN because the thing being chosen is a
     * picture: reading "fa-person-walking-dashed-line-arrow-right" tells you nothing
     * that seeing it does not tell you faster.
     *
     * It is not exhaustive and is not meant to be -- the field underneath takes any
     * Font Awesome class, because a fixed grid is a guess about what a table will
     * want and this one would be wrong by the second session.
     */
    static ICON_PALETTE = [
        { icon: 'fas fa-dice-d20', name: 'Die' },
        { icon: 'fas fa-magnifying-glass-waveform', name: 'Perception' },
        { icon: 'fas fa-magnifying-glass', name: 'Investigation' },
        { icon: 'fas fa-brain', name: 'Insight' },
        { icon: 'fas fa-sheep', name: 'Nature' },
        { icon: 'fas fa-burst', name: 'Stealth burst' },
        { icon: 'fas fa-user-ninja', name: 'Stealth' },
        { icon: 'fas fa-hand-back-fist', name: 'Grapple' },
        { icon: 'fas fa-person-running', name: 'Acrobatics' },
        { icon: 'fas fa-arrows-up-down-left-right', name: 'Shove' },
        { icon: 'fas fa-person-walking-dashed-line-arrow-right', name: 'Escape' },
        { icon: 'fas fa-mask', name: 'Deception' },
        { icon: 'fas fa-comments', name: 'Persuasion' },
        { icon: 'fas fa-angry', name: 'Intimidation' },
        { icon: 'fas fa-dumbbell', name: 'Athletics' },
        { icon: 'fas fa-book-sparkles', name: 'Arcana' },
        { icon: 'fas fa-landmark', name: 'History' },
        { icon: 'fas fa-hand-holding-medical', name: 'Medicine' },
        { icon: 'fas fa-hands-praying', name: 'Religion' },
        { icon: 'fas fa-hand-sparkles', name: 'Sleight of Hand' },
        { icon: 'fas fa-masks-theater', name: 'Performance' },
        { icon: 'fas fa-mountain-sun', name: 'Survival' },
        { icon: 'fas fa-paw', name: 'Animal Handling' },
        { icon: 'fas fa-shield-halved', name: 'Defence' },
        { icon: 'fas fa-swords', name: 'Attack' },
        { icon: 'fas fa-heart-pulse', name: 'Constitution' },
        { icon: 'fas fa-eye', name: 'Watch' },
        { icon: 'fas fa-skull', name: 'Death' },
        { icon: 'fas fa-fire', name: 'Fire' },
        { icon: 'fas fa-bolt', name: 'Lightning' },
        { icon: 'fas fa-snowflake', name: 'Cold' },
        { icon: 'fas fa-helmet-battle', name: 'Party' },
        { icon: 'fas fa-users', name: 'Group' },
        { icon: 'fas fa-people-arrows', name: 'Contest' },
        { icon: 'fas fa-film', name: 'Cinematic' },
        { icon: 'fas fa-flag', name: 'Flag' }
    ];

    /** The three-column choices for one side of the roll, per type. */
    static _valueChoices() {
        const localize = (v) => (v ? game.i18n.localize(v) : '');
        return {
            skill: Object.entries(CONFIG.DND5E?.skills ?? {})
                .map(([key, cfg]) => ({ key, label: localize(cfg?.label) || key.toUpperCase() }))
                .sort((a, b) => a.label.localeCompare(b.label)),
            ability: Object.entries(CONFIG.DND5E?.abilities ?? {})
                .map(([key, cfg]) => ({ key, label: localize(cfg?.label) || key.toUpperCase() })),
            // Death is a save with no ability behind it, so it is appended rather than
            // derived -- the same special case the dialog's own save list makes.
            save: [
                ...Object.entries(CONFIG.DND5E?.abilities ?? {})
                    .map(([key, cfg]) => ({ key, label: `${localize(cfg?.label) || key.toUpperCase()} Save` })),
                { key: 'death', label: 'Death Save' }
            ]
        };
    }

    async getData() {
        const record = this.record ?? QuickRollsManager.normalize({
            category: QuickRollsManager.categories()[0] ?? 'Quick Rolls'
        });
        const choices = RollBuilderWindow._valueChoices();

        // Rendered as flat lists with a `selected` flag rather than by comparing in the
        // template: Handlebars has no `eq` on `<option>` without a helper, and the one
        // this module registers is for `{{#if}}`.
        const withSelection = (list, value) => list.map((o) => ({ ...o, selected: o.key === value }));

        const bodyContent = await foundry.applications.handlebars.renderTemplate(
            `modules/${MODULE.ID}/templates/window-rollbuilder.hbs`,
            {
                isEdit: !!this.record,
                record,
                challengerTypes: QuickRollsManager.ROLL_TYPES.map((t) => ({ ...t, selected: t.key === record.challenger.type })),
                defenderTypes: QuickRollsManager.ROLL_TYPES.map((t) => ({ ...t, selected: t.key === (record.defender?.type ?? 'skill') })),
                challengerValues: withSelection(choices[record.challenger.type] ?? choices.skill, record.challenger.value),
                defenderValues: withSelection(choices[record.defender?.type ?? 'skill'] ?? choices.skill, record.defender?.value),
                categories: QuickRollsManager.categories(),
                iconPalette: RollBuilderWindow.ICON_PALETTE.map((entry) => ({ ...entry, selected: entry.icon === record.icon })),
                isContested: record.mode === 'contested'
            }
        );

        // Cancel and Save go in the SHELL'S FOOTER rather than in the body, so they
        // stay put while the form scrolls and wear the frame's own divider. The shell
        // owns the bar; this owns what is in it.
        return {
            appId: this.id,
            bodyContent,
            showToolFooter: true,
            toolFooterLeft: '<button type="button" class="cpb-builder-cancel" data-button="cancel"><i class="fas fa-times"></i> Cancel</button>',
            toolFooterRight: `<button type="button" class="cpb-builder-save" data-button="save"><i class="fas fa-floppy-disk"></i> ${this.record ? 'Save Changes' : 'Save Roll'}</button>`
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachBuilderListeners();
    }

    _attachBuilderListeners() {
        const root = this.element;
        if (!root?.querySelector) return;

        const valueChoices = RollBuilderWindow._valueChoices();
        const field = (name) => root.querySelector(`[name="${name}"]`);

        /**
         * Repopulate a side's value list when its type changes.
         *
         * The list is rebuilt rather than filtered from a hidden superset, because a
         * stale `value` left selected from the previous type is a roll that looks
         * chosen and is not: `save` + `prc` reaches `new Roll` as a saving throw on a
         * skill that does not exist.
         */
        const repopulate = (side) => {
            const typeSelect = field(`${side}Type`);
            const valueSelect = field(`${side}Value`);
            if (!typeSelect || !valueSelect) return;
            const previous = valueSelect.value;
            const list = valueChoices[typeSelect.value] ?? valueChoices.skill;
            valueSelect.innerHTML = '';
            for (const choice of list) {
                const option = document.createElement('option');
                option.value = choice.key;
                option.textContent = choice.label;
                valueSelect.appendChild(option);
            }
            // Keep the selection only if the new type still offers it -- ability and
            // save share their keys, so switching between those two is lossless.
            if (list.some((c) => c.key === previous)) valueSelect.value = previous;
        };

        for (const side of ['challenger', 'defender']) {
            field(`${side}Type`)?.addEventListener('change', () => {
                repopulate(side);
                this._syncPreview();
            });
            field(`${side}Value`)?.addEventListener('change', () => this._syncPreview());
        }

        // Contested hides the party/success controls and shows the defender, because
        // neither of those questions has an answer in a contest: both sides are named
        // explicitly, and the comparison IS the outcome.
        root.querySelectorAll('[name="mode"]').forEach((input) => {
            input.addEventListener('change', () => this._syncMode());
        });

        root.querySelectorAll('input, select, textarea').forEach((input) => {
            input.addEventListener('input', () => this._syncPreview());
            input.addEventListener('change', () => this._syncPreview());
        });

        // The palette writes into the same field a GM can type into, rather than being
        // a second source of truth for the icon. Clicking a swatch is a shortcut for
        // typing its class, and nothing downstream needs to know which happened.
        const iconField = field('icon');
        root.querySelectorAll('.cpb-icon-swatch').forEach((swatch) => {
            swatch.addEventListener('click', (ev) => {
                ev.preventDefault();
                if (iconField) iconField.value = swatch.dataset.icon ?? '';
                this._syncIconPalette();
                this._syncPreview();
            });
        });
        iconField?.addEventListener('input', () => this._syncIconPalette());

        // Two radios rather than a lone checkbox labelled "cinematic": the choice is
        // between two things a GM can picture, and only one of them is the default.
        // They drive the hidden checkbox the record is actually read from.
        root.querySelectorAll('[name="isCinematicChoice"]').forEach((input) => {
            input.addEventListener('change', () => {
                const box = field('isCinematic');
                if (box) box.checked = input.value === 'cinematic' && input.checked;
                this._syncPreview();
            });
        });

        // "New category" is a text box that only exists while the picker says so --
        // an always-present second field asks the same question twice and leaves the
        // reader to work out which one wins.
        field('categorySelect')?.addEventListener('change', () => this._syncCategory());

        root.querySelector('[data-button="cancel"]')?.addEventListener('click', (ev) => {
            ev.preventDefault();
            this.close();
        });
        root.querySelector('[data-button="save"]')?.addEventListener('click', async (ev) => {
            ev.preventDefault();
            await this._save();
        });

        this._syncMode();
        this._syncCategory();
        this._syncIconPalette();
        this._syncPreview();
    }

    /** Light the swatch matching the field, if the field names one of them. */
    _syncIconPalette() {
        const root = this.element;
        const current = root?.querySelector?.('[name="icon"]')?.value?.trim() ?? '';
        root?.querySelectorAll?.('.cpb-icon-swatch').forEach((swatch) => {
            swatch.classList.toggle('cpb-icon-swatch-on', swatch.dataset.icon === current);
        });
    }

    _syncMode() {
        const root = this.element;
        const contested = root.querySelector('[name="mode"]:checked')?.value === 'contested';
        root.querySelectorAll('[data-when="contested"]').forEach((el) => { el.hidden = !contested; });
        root.querySelectorAll('[data-when="normal"]').forEach((el) => { el.hidden = contested; });
        // "Whole party" means something different in a contest -- the party are the
        // challengers rather than simply everyone who rolls -- so the hint swaps while
        // the control itself stays put.
        root.querySelectorAll('.cpb-builder-hint-normal').forEach((el) => { el.hidden = contested; });
        root.querySelectorAll('.cpb-builder-hint-contested').forEach((el) => { el.hidden = !contested; });
        this._syncPreview();
    }

    _syncCategory() {
        const root = this.element;
        const select = root.querySelector('[name="categorySelect"]');
        const isNew = !select || select.value === '__new__';
        const wrap = root.querySelector('[data-category-new]');
        if (wrap) wrap.hidden = !isNew;
        this._syncPreview();
    }

    /** The row as it will appear in the QUICK tab, drawn from the fields as they stand. */
    _syncPreview() {
        const root = this.element;
        const preview = root?.querySelector?.('.cpb-builder-preview');
        if (!preview) return;
        const draft = this._readForm();

        const icon = preview.querySelector('i');
        if (icon) icon.className = draft.icon || QuickRollsManager.DEFAULT_ICON;
        const label = preview.querySelector('.cpb-builder-preview-label');
        if (label) label.textContent = draft.label || 'Untitled Roll';
        const description = preview.querySelector('.cpb-builder-preview-description');
        if (description) description.textContent = draft.description || '';

        const summary = root.querySelector('.cpb-builder-summary');
        if (summary) summary.textContent = RollBuilderWindow.describe(draft);
    }

    /**
     * A quick roll in one line, for the preview and for a row's tooltip.
     *
     * Says what the roll DOES rather than listing its fields: a GM scanning the
     * library needs "Athletics vs Acrobatics, cinematic", not four labelled values.
     */
    static describe(roll) {
        const name = (side) => {
            if (!side?.value) return '—';
            if (side.type === 'save') {
                return side.value === 'death'
                    ? 'Death Save'
                    : `${game.i18n.localize(CONFIG.DND5E?.abilities?.[side.value]?.label ?? side.value)} Save`;
            }
            const table = side.type === 'ability' ? CONFIG.DND5E?.abilities : CONFIG.DND5E?.skills;
            const label = table?.[side.value]?.label;
            return label ? game.i18n.localize(label) : side.value;
        };

        const parts = [];
        if (roll.mode === 'contested') {
            parts.push(`${name(roll.challenger)} vs ${name(roll.defender)}`);
            parts.push(roll.targets === 'party' ? 'party challenges' : 'selected tokens');
        } else {
            parts.push(name(roll.challenger));
            parts.push(roll.targets === 'party' ? 'whole party' : 'selected tokens');
            parts.push(roll.success === 'group' ? 'group success' : 'individual success');
        }
        if (roll.dc) parts.push(`DC ${roll.dc}`);
        parts.push(roll.isCinematic ? 'cinematic' : 'chat card');
        return parts.join(' • ');
    }

    /** Every field, as a record. Not normalized -- the preview wants the draft as typed. */
    _readForm() {
        const root = this.element;
        const value = (name) => root.querySelector(`[name="${name}"]`)?.value ?? '';
        const checked = (name) => !!root.querySelector(`[name="${name}"]`)?.checked;
        const radio = (name) => root.querySelector(`[name="${name}"]:checked`)?.value ?? '';

        const categorySelect = value('categorySelect');
        const category = categorySelect === '__new__' ? value('categoryNew') : categorySelect;

        return {
            id: this.record?.id ?? QuickRollsManager.newId(),
            category,
            label: value('label'),
            description: value('description'),
            icon: value('icon'),
            mode: radio('mode') || 'normal',
            targets: radio('targets') || 'selected',
            success: radio('success') || 'individual',
            challenger: { type: value('challengerType'), value: value('challengerValue') },
            defender: { type: value('defenderType'), value: value('defenderValue') },
            dc: value('dc'),
            isCinematic: checked('isCinematic'),
            rollTitle: value('rollTitle')
        };
    }

    async _save() {
        const draft = this._readForm();

        // Refused rather than defaulted. A roll with no label is a blank row in a list
        // whose whole job is to be scannable, and one with no value silently becomes
        // whatever the first option happened to be.
        if (!String(draft.label).trim()) {
            ui.notifications.warn('Give the roll a label.');
            return;
        }
        if (!String(draft.challenger.value).trim()) {
            ui.notifications.warn('Choose what the challenger rolls.');
            return;
        }
        if (draft.mode === 'contested' && !String(draft.defender.value).trim()) {
            ui.notifications.warn('A contested roll needs a defender roll as well.');
            return;
        }
        if (!String(draft.category).trim()) {
            ui.notifications.warn('Give the roll a category, or pick an existing one.');
            return;
        }

        const saved = await QuickRollsManager.save(draft);
        postConsoleAndNotification(MODULE.NAME, 'Quick Rolls: saved', saved, true, false);
        this.onSave?.(saved);
        this.close();
    }
}
