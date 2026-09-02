// Import required modules
import { MODULE } from './const.js';
import { playSound, postConsoleAndNotification, getSettingSafely, getDiceIcon } from './api-core.js';
import { SocketManager } from './manager-sockets.js';
import { skillDescriptions, abilityDescriptions, saveDescriptions, toolDescriptions } from '../resources/dictionary.js';
import { resolveRequestRollCinematicBanner, resolveRequestRollSound, resolveRequestRollSetting } from './utility-theme-request-roll.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';
import {
    BlacksmithFullscreenWindowBaseV2,
    BLACKSMITH_FULLSCREEN_LAYOUTS,
    BLACKSMITH_FULLSCREEN_ANIMATIONS
} from './window-fullscreen-base.js';
import { skillCheckMessageData } from './cards-skill-check.js';
import { QuickRollsManager } from './manager-quick-rolls.js';
import { RollBuilderWindow } from './window-rollbuilder.js';

/**
 * The Cinematic mode surface for Request a Roll.
 *
 * The shell -- viewport cover, backdrop, pinned stacking, Escape, close button, one-at-a-time --
 * is the fullscreen base's. The band inside it is this feature's own content, unchanged, because
 * manager-rolls.js reaches into that markup by selector to reveal results, append the group
 * banner, and fade the surface out. The element keeps its historical id for the same reason.
 */
/**
 * The theme suffix for a roll, shared by the banner and the entrance.
 *
 * Both are per-roll-type and both are chosen from the same fact, so they are chosen
 * ONCE. Two switch statements over `rollType` would agree today and drift the first
 * time a roll type was added to one of them -- and the failure is silent, an ability
 * check wearing a saving throw's banner with the skill check's entrance.
 *
 * The theme's constants are `BACK<SUFFIX>` and `ANIM<SUFFIX>`, which is why the two
 * families are named to line up rather than each reading well on its own.
 *
 * @param {object} messageData
 * @returns {string}
 */
function cinematicThemeSuffix(messageData) {
    if (messageData?.hasMultipleGroups) return 'CONTESTEDROLL';
    switch (messageData?.rollType) {
        case 'skill': return 'SKILLCHECK';
        case 'ability': return 'ABILITYCHECK';
        case 'save': return 'SAVINGTHROW';
        case 'tool': return 'TOOLCHECK';
        case 'dice': return 'DICEROLL';
        default: return 'CONTESTEDROLL';
    }
}

export class CinematicOverlay extends BlacksmithFullscreenWindowBaseV2 {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'cpb-cinematic-overlay',
            classes: ['blacksmith-window-fullscreen', 'cpb-cinematic'],
            fullscreenLayout: BLACKSMITH_FULLSCREEN_LAYOUTS.BAR,
            // The floor, not the answer. The theme's CINEMATICANIMATION overrides it at
            // construction; this is what a theme that names nothing falls back to.
            fullscreenAnimation: BLACKSMITH_FULLSCREEN_ANIMATIONS.SLAM,
            fullscreenBackdrop: {
                image: 'modules/coffee-pub-blacksmith/images/backgrounds/background-skull-red.webp',
                // Glassy rather than a blackout: a light wash so the table still reads
                // through, and a heavy blur plus the suite's glass saturation so what
                // reads through is texture instead of a legible second screen. The band
                // carries its own opaque banner, so nothing here has to keep text legible.
                color: 'rgba(0, 0, 0, 0.42)',
                blur: 12,
                saturate: 115,
                // `imageBlur` softens the skulls themselves, so they sit behind the band
                // rather than competing with it.
                opacity: 0.4,
                imageBlur: 6,
                fit: 'cover'
            }
        }
    );

    constructor({ bodyContent = '', ...options } = {}) {
        super(options);
        this._cinematicBody = bodyContent;
    }

    /**
     * The entrance the theme asked for.
     *
     * Resolved before construction rather than inside it, because Application V2 freezes
     * options once the instance exists -- and the theme read is a fetch, so it cannot
     * happen inside a constructor at all. An unknown or absent value is left alone: the
     * base validates the name and falls back on its own, so a theme naming a preset that
     * no longer exists degrades to `fade` rather than throwing.
     *
     * @param {object} options
     * @returns {Promise<CinematicOverlay>}
     */
    static async create(options = {}, suffix = 'CONTESTEDROLL') {
        const themed = await resolveRequestRollSetting(`ANIM${suffix}`);
        return new CinematicOverlay(themed
            ? { ...options, fullscreenAnimation: themed }
            : options);
    }

    /**
     * Escape and the close control route through `_hideCinematicDisplay`, which broadcasts
     * only when a GM is the one dismissing.
     *
     * That asymmetry is the point. A player closing the cinematic is getting it out of their
     * way so they can roll from the chat card or the tray -- their roll still lands, and
     * everyone else's cinematic still updates -- so it must not end the scene for the table.
     * A GM closing it is ending the scene.
     */
    async onDismiss(reason) {
        await SkillCheckDialog._hideCinematicDisplay();
    }

    async getData() {
        return {
            appId: this.id,
            showHeader: false,
            bodyContent: this._cinematicBody
        };
    }
}


export class SkillCheckDialog extends BlacksmithWindowBaseV2 {
    /** @type {Map<string, Function>} Pending onRollComplete callbacks by message ID (for API callers) */
    static _pendingRollCallbacks = new Map();
    static _pendingRollCallbackDeleteHookId = null;
    static MAX_PENDING_ROLL_CALLBACKS = 100;

    static _registerRollCompleteCallback(messageId, callback) {
        if (!messageId || typeof callback !== 'function') return;
        if (this._pendingRollCallbackDeleteHookId == null) {
            this._pendingRollCallbackDeleteHookId = Hooks.on('deleteChatMessage', (message) => {
                if (message?.id) this._pendingRollCallbacks.delete(message.id);
            });
        }
        this._pendingRollCallbacks.delete(messageId);
        this._pendingRollCallbacks.set(messageId, callback);
        while (this._pendingRollCallbacks.size > this.MAX_PENDING_ROLL_CALLBACKS) {
            const oldest = this._pendingRollCallbacks.keys().next().value;
            if (!oldest) break;
            this._pendingRollCallbacks.delete(oldest);
        }
    }

    static ROOT_CLASS = 'skill-check-dialog';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'skill-check-dialog',
            classes: ['coffee-pub-blacksmith', 'skill-check-dialog'],
            position: { width: 800, height: 700 },
            window: { title: 'Request a Roll', resizable: true, minimizable: true }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-skillcheck.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    constructor(data = {}) {
        const options = {};
        // ApplicationV2 reads the frame title from options.window.title — `options.title` is the
        // ApplicationV1 key and is silently ignored (core: get title() { ...this.options.window.title }).
        // api-requestroll.md has always documented `title` as overriding the window title; this is the
        // V1 spelling left behind by the V2 migration. window-gmnotes.js does it the correct way.
        // Note this only ever affected the window frame: `data.title` is also carried to the chat card
        // via this.apiRollTitle, and that path works.
        if (data.title != null && data.title !== '') {
            options.window = { title: data.title };
        }
        super(options);
        this.actors = data.actors || [];
        // Initial roll type: 'skill' | 'ability' | 'save' (initialSkill is legacy, same as initialType:'skill' + initialValue)
        this.selectedType = data.initialType ?? (data.initialSkill ? 'skill' : null);
        this.selectedValue = data.initialValue ?? data.initialSkill ?? null;
        this.challengerRoll = { type: null, value: null };
        this.defenderRoll = { type: null, value: null };
        /**
         * A dice formula an API caller passed, split into rows and waiting for the DOM.
         * The rows ARE the builder's state, so there is nowhere to put it until they exist.
         * Null when the formula is one the rows cannot show -- it still rolls, unedited.
         */
        this._pendingDiceBuild = this.selectedType === 'dice'
            ? SkillCheckDialog.parseDiceBuild(this.selectedValue)
            : null;
        /**
         * Stamps the order dice were added in, which is the order the formula reads in.
         * Monotonic rather than a position, so removing the first die does not renumber
         * the rest -- the survivors keep the order the GM still sees on screen.
         */
        this._diceOrderCounter = 0;
        /** The dice build as a readable line, carried onto the card and the cinematic plate. */
        this.selectedDiceDisplay = null;
        this.callback = data.callback || null;
        this.onRollComplete = data.onRollComplete || null;
        this._isQuickPartyRoll = false;
        this._quickRollOverrides = undefined;
        // API: optional initial state for the dialog
        this.initialDc = data.dc != null ? String(data.dc) : null;
        this.initialFilter = data.initialFilter ?? null; // 'selected' | 'party'
        this.apiRollTitle = (data.title != null && data.title !== '') ? data.title : null; // Used as roll/card title when creating the request
        // API: when opened via API (_api), default groupRoll to false if not passed; when opened from UI, use saved preference (null)
        this.initialGroupRoll = data._api ? (data.hasOwnProperty('groupRoll') ? !!data.groupRoll : false) : null;
        // API: optional pre-fill for Roll Configuration window (e.g. harvest +2)
        this.initialSituationalBonus = data.situationalBonus != null ? data.situationalBonus : null;
        this.initialCustomModifier = data.customModifier != null ? String(data.customModifier) : null;
        // API: requested advantage/disadvantage for the roll surfaces ('advantage'|'disadvantage'|'normal')
        this.initialRollAdvantage = SkillCheckDialog.normalizeRollAdvantage(data.rollAdvantage);
        this.initialLockRollAdvantage = !!data.lockRollAdvantage;
        // API: requester-authored prose shown on the chat card (independent of showRollExplanation)
        this.initialExplanation = (data.explanation != null && data.explanation !== '') ? String(data.explanation) : null;
        /** When set, activateListeners runs this favorite once the dialog DOM is ready (e.g. menubar context menu). */
        this._pendingFavoriteRec = data.pendingFavoriteRec ?? null;
        /** When set, activateListeners fires this quick roll once the DOM is ready (menubar context menu). */
        this._pendingQuickRollId = data.pendingQuickRollId ?? null;

        // Load user preferences
        this.userPreferences = game.settings.get('coffee-pub-blacksmith', 'skillCheckPreferences') || {
            showRollExplanation: true,
            showDC: true,
            groupRoll: true,
            isCinematic: false,
            requestRollFavorites: [],
            requestRollSavedDice: []
        };
        if (!Array.isArray(this.userPreferences.requestRollFavorites)) {
            this.userPreferences.requestRollFavorites = [];
        }
        // Absent on every preferences object written before remembered rolls existed,
        // and the setting's default does not backfill a value already stored.
        if (!Array.isArray(this.userPreferences.requestRollSavedDice)) {
            this.userPreferences.requestRollSavedDice = [];
        }
    }

    // ===== REQUESTED ROLL ADVANTAGE ===================================

    /**
     * Normalize a requested advantage mode to the stored vocabulary.
     * Anything unrecognized (including undefined) becomes null, meaning "not requested" — the roller
     * keeps the three live buttons they have always had.
     * @param {*} value - Raw value from an API caller or message flags
     * @returns {'advantage'|'disadvantage'|'normal'|null}
     */
    static normalizeRollAdvantage(value) {
        if (value == null) return null;
        const mode = String(value).trim().toLowerCase();
        return ['advantage', 'disadvantage', 'normal'].includes(mode) ? mode : null;
    }

    /**
     * Convert a requested advantage mode into the { advantage, disadvantage } pair the roll
     * execution path consumes.
     * @param {string|null} mode - Normalized mode
     * @returns {{advantage: boolean, disadvantage: boolean}}
     */
    static rollAdvantageToOptions(mode) {
        return {
            advantage: mode === 'advantage',
            disadvantage: mode === 'disadvantage'
        };
    }

    /**
     * Display label for a requested advantage mode.
     * @param {string|null} mode - Normalized mode
     * @returns {string|null}
     */
    static rollAdvantageLabel(mode) {
        switch (mode) {
            case 'advantage': return 'Advantage';
            case 'disadvantage': return 'Disadvantage';
            case 'normal': return 'Normal';
            default: return null;
        }
    }

    /**
     * Resolve the advantage mode that applies to one actor row, per-actor value winning over the
     * request-level value.
     * @param {object} actorData - Actor entry from the message flags
     * @param {object} flags - Message flags
     * @returns {{mode: string|null, locked: boolean}}
     */
    static resolveRollAdvantage(actorData, flags) {
        const mode = SkillCheckDialog.normalizeRollAdvantage(actorData?.rollAdvantage)
            ?? SkillCheckDialog.normalizeRollAdvantage(flags?.rollAdvantage);
        return { mode, locked: mode != null && !!flags?.lockRollAdvantage };
    }

    /**
     * Resolve token and actor for a contestant row (canvas token and/or sheet actor).
     * @param {HTMLElement} el - `.cpb-actor-item`
     * @returns {{ tokenId: string|null, actorId: string|null, token: Token|null, actor: Actor|null }}
     */
    _resolveContestantFromElement(el) {
        const tokenId = el?.dataset?.tokenId || null;
        const actorId = el?.dataset?.actorId || null;
        const token = tokenId ? (canvas?.tokens?.placeables ?? []).find(t => t.id === tokenId) ?? null : null;
        const actor = token?.actor ?? (actorId ? game.actors.get(actorId) : null) ?? null;
        return {
            tokenId: tokenId || null,
            actorId: actor?.id ?? actorId ?? null,
            token,
            actor
        };
    }

    /** Stable id for Request Roll favorites (user scope). */
    static _computeFavoriteId(item) {
        const o = {
            type: item?.dataset?.type,
            value: item?.dataset?.value ?? '',
            rollType: item?.dataset?.rollType ?? '',
            group: item?.dataset?.group ?? '',
            dc: item?.dataset?.dc ?? '',
            defenderSkill: item?.dataset?.defenderSkill ?? '',
            toolName: item?.dataset?.toolName ?? '',
            common: item?.dataset?.common ?? ''
        };
        return JSON.stringify(o);
    }

    static _favoriteRecordFromItem(item) {
        const iconEl = item.querySelector(':scope > i');
        const labelEl = item.querySelector('.cpb-roll-label');
        const descEl = item.querySelector('.cpb-roll-description');
        return {
            id: SkillCheckDialog._computeFavoriteId(item),
            type: item.dataset.type,
            value: item.dataset.value ?? '',
            rollType: item.dataset.rollType ?? '',
            group: item.dataset.group ?? '',
            dc: item.dataset.dc ?? '',
            defenderSkill: item.dataset.defenderSkill ?? '',
            rollTitle: item.dataset.rollTitle ?? '',
            toolName: item.dataset.toolName ?? '',
            common: item.dataset.common ?? '',
            actorTools: item.dataset.actorTools ?? '',
            tooltip: item.dataset.tooltip ?? '',
            // How this favourite PLAYS, which is not part of what it IS -- deliberately
            // absent from `_computeFavoriteId`, so toggling it edits the favourite in
            // place instead of orphaning it and creating a second one.
            isCinematic: item.dataset.cinematic === 'true',
            // WHO ROLLS, and what the defender rolls. Both carried for the same reason
            // as `isCinematic` and kept out of the id for the same reason: they say how
            // a favourite RUNS, not which roll it is. Without them a contested favourite
            // has no way to fire silently and has to open the window -- which is what
            // one saved before this existed still does, correctly, since it defaults to
            // the selection and a selection cannot be split without a person.
            targets: item.dataset.targets ?? '',
            defenderType: item.dataset.defenderType ?? '',
            label: labelEl?.textContent?.trim() ?? '',
            description: descEl?.textContent?.trim() ?? '',
            iconClass: iconEl?.className ?? 'fas fa-dice-d20'
        };
    }

    _assignFavoriteIdsToCheckItems(htmlElement) {
        if (!htmlElement?.querySelectorAll) return;
        htmlElement.querySelectorAll('.cpb-check-item[data-type]').forEach((item) => {
            if (item.classList.contains('cpb-favorite-row')) return;
            item.dataset.favoriteId = SkillCheckDialog._computeFavoriteId(item);
        });
    }

    _findCanonicalFavoriteTarget(htmlElement, favoriteId) {
        if (!htmlElement?.querySelectorAll || !favoriteId) return null;
        return Array.from(htmlElement.querySelectorAll('.cpb-check-item')).find(
            (el) => !el.classList.contains('cpb-favorite-row') && el.dataset.favoriteId === favoriteId
        ) ?? null;
    }

    /**
     * When data-favorite-id round-trips or stored id drifts, match the same fields as _computeFavoriteId.
     */
    _findCanonicalFavoriteTargetByDataset(htmlElement, row) {
        if (!htmlElement?.querySelectorAll || !row) return null;
        const t = row.dataset.type;
        const v = row.dataset.value ?? '';
        const rt = row.dataset.rollType ?? '';
        const g = row.dataset.group ?? '';
        const dc = row.dataset.dc ?? '';
        const ds = row.dataset.defenderSkill ?? '';
        const tn = row.dataset.toolName ?? '';
        const c = row.dataset.common ?? '';
        return Array.from(htmlElement.querySelectorAll('.cpb-check-item')).find((item) => {
            if (item.classList.contains('cpb-favorite-row')) return false;
            if (item.dataset.type !== t) return false;
            if ((item.dataset.value ?? '') !== v) return false;
            if ((item.dataset.rollType ?? '') !== rt) return false;
            if ((item.dataset.group ?? '') !== g) return false;
            if ((item.dataset.dc ?? '') !== dc) return false;
            if ((item.dataset.defenderSkill ?? '') !== ds) return false;
            if ((item.dataset.toolName ?? '') !== tn) return false;
            if ((item.dataset.common ?? '') !== c) return false;
            return true;
        }) ?? null;
    }

    _findCanonicalForFavoriteRow(htmlElement, row) {
        const fid = row?.dataset?.favoriteId;
        const byId = fid ? this._findCanonicalFavoriteTarget(htmlElement, fid) : null;
        if (byId) return byId;
        return this._findCanonicalFavoriteTargetByDataset(htmlElement, row);
    }

    /**
     * Programmatic roll-button clicks nested under a synthetic click often do not run the request.
     * Defer to the next macrotask so the stack is not inside a synthetic click handler.
     */
    _queueRollButtonClick(htmlElement) {
        const rollButton = htmlElement.querySelector('button[data-button="roll"]');
        if (rollButton) setTimeout(() => rollButton.click(), 0);
    }

    /**
     * Same behavior as clicking a Quick tab roll row (party / contested / DC quick paths).
     * @param {HTMLElement} htmlElement - Dialog root
     * @param {HTMLElement} item - Row with data-type="quick" and related data-* (canonical row or favorite clone)
     */
    /**
     * Wire selection onto check items, once each.
     *
     * Extracted from `_attachLocalListeners` and given a SCOPE, because the QUICK
     * tab's rows are now rendered from data and redrawn whenever the library
     * changes -- new elements with no listeners on them. A redraw that did not
     * re-wire would leave rows that look exactly right and do nothing when clicked.
     *
     * `cpbSelectionBound` is what makes it safe to call twice: the whole-dialog pass
     * at render and the per-list pass after a redraw overlap on every row that
     * survived, and a second listener on those would fire the handler twice --
     * selecting and then immediately deselecting.
     */
    // ===== QUICK ROLLS ================================================
    //
    // The QUICK tab's rolls were twenty-four rows of hand-written markup. They are
    // now rendered from `QuickRollsManager`, which is what makes them addable,
    // editable and removable -- but the ROWS THEY PRODUCE ARE THE SAME SHAPE the
    // markup had, `data-*` for `data-*`.
    //
    // That is deliberate and load-bearing. `_handleQuickRollItem` reads the dataset,
    // `_computeFavoriteId` hashes a fixed set of those attributes, the search filters
    // on `.cpb-check-item`, and the favourites machinery round-trips rows through
    // `_favoriteRecordFromItem`. Emitting a different shape would have meant changing
    // all four at once, and a favourite saved before the change would no longer match
    // the row it came from.

    /** Every icon in the library, plus the row controls, drawn into the QUICK tab. */
    _renderQuickRollsSection(htmlElement) {
        const host = htmlElement?.querySelector?.('.cpb-quick-rolls-list');
        if (!host) return;
        host.innerHTML = '';

        const groups = QuickRollsManager.byCategory();
        const empty = htmlElement.querySelector('.cpb-quick-rolls-empty');
        if (empty) empty.style.display = groups.length ? 'none' : '';

        for (const { category, rolls } of groups) {
            const heading = document.createElement('div');
            heading.className = 'cpb-section-subheader';
            heading.textContent = category;
            host.appendChild(heading);
            for (const roll of rolls) host.appendChild(this._quickRollRow(roll));
        }
    }

    /**
     * One quick roll as a check item.
     *
     * `data-value` carries a CONFIG id (`prc`). The old markup carried friendly names
     * (`perception`) and leaned on a ten-entry lookup in `_handleQuickRollItem` to
     * translate, which silently did nothing for any skill outside those ten -- so a
     * quick roll for Arcana could never have worked. The lookup still runs and is now
     * a no-op, which is the correct behaviour for an id it does not know.
     */
    _quickRollRow(roll) {
        const row = document.createElement('div');
        row.className = 'cpb-check-item cpb-quick-roll-row';
        row.dataset.type = 'quick';
        row.dataset.quickId = roll.id;
        row.dataset.value = roll.challenger.value;
        row.dataset.challengerType = roll.challenger.type;
        row.dataset.rollTitle = roll.rollTitle;
        row.dataset.tooltip = roll.description || roll.label;
        row.dataset.cinematic = String(!!roll.isCinematic);

        // WHO ROLLS, on every row. For a normal roll it is folded into `rollType`,
        // which is the vocabulary `_handleQuickRollItem` has always spoken; a contest
        // needs it separately, because `rollType` is spent saying the roll is a contest.
        row.dataset.targets = roll.targets;
        if (roll.mode === 'contested') {
            row.dataset.rollType = 'contested';
            row.dataset.defenderSkill = roll.defender?.value ?? '';
            row.dataset.defenderType = roll.defender?.type ?? 'skill';
        } else {
            row.dataset.rollType = roll.targets === 'party' ? 'party' : 'individual';
            row.dataset.group = String(roll.success === 'group');
        }
        // Only set when there IS one: `_handleQuickRollItem` treats the attribute's
        // presence as "override the DC box", so an empty string would force a blank
        // DC onto a roll that meant to inherit whatever the window had.
        if (roll.dc) row.dataset.dc = roll.dc;

        const icon = document.createElement('i');
        icon.className = roll.icon;
        icon.dataset.tooltip = roll.rollTitle;

        const label = document.createElement('span');
        label.className = 'cpb-roll-label';
        label.textContent = roll.label;

        // HOW THE ROLL RESOLVES, in front of what it is for.
        //
        // The three facts that change what a click does -- who passes, against what,
        // and whether it takes over the table's screen -- were only in the label if the
        // GM had thought to write them there, and the built-ins mostly had not: "DC 15
        // Perception Check" says its DC and nothing about group success. Two rows can
        // be identical on screen and behave differently, which is the one thing a list
        // you fire from must not do.
        //
        // In the description's line rather than on its own, because they qualify the
        // description: they read as "group, DC 15, cinematic — tougher check to spot
        // hidden creatures". Marks rather than words, since three words in front of
        // every description would bury the description.
        const meta = document.createElement('span');
        meta.className = 'cpb-quick-roll-meta';

        const mark = (className, tooltip, text) => {
            const el = document.createElement('span');
            el.className = `cpb-quick-roll-mark${className ? ` ${className}` : ''}`;
            el.dataset.tooltip = tooltip;
            if (text) el.textContent = text;
            return el;
        };
        const markIcon = (icon, tooltip) => {
            const el = mark('', tooltip);
            const i = document.createElement('i');
            i.className = icon;
            el.appendChild(i);
            return el;
        };

        if (roll.mode === 'contested') {
            meta.appendChild(markIcon('fas fa-people-arrows', 'Contested — challengers roll against defenders'));
        } else if (roll.success === 'group') {
            meta.appendChild(markIcon('fas fa-users', 'Group success — half the party passing carries it'));
        } else {
            meta.appendChild(markIcon('fas fa-user-check', 'Individual success — each roller passes or fails alone'));
        }

        // A DC is optional, and its absence is meaningful: the roll reports a total and
        // nothing else. Shown as its number rather than an icon, because the number IS
        // the fact and an icon would need a tooltip to say it.
        if (roll.dc) {
            meta.appendChild(mark('cpb-quick-roll-mark-dc', `Target number ${roll.dc}`, `DC ${roll.dc}`));
        }

        meta.appendChild(roll.isCinematic
            ? markIcon('fas fa-film', 'Cinematic — takes over the screen for the table')
            : markIcon('fas fa-comment', 'Chat card — posts quietly to chat'));

        const description = document.createElement('span');
        description.className = 'cpb-roll-description';
        description.textContent = roll.description;

        const trailing = document.createElement('div');
        trailing.className = 'cpb-check-item-trailing';

        // Edit and delete sit BEFORE the heart, so the two controls that change the
        // library are together and the two that fire or keep it are together.
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'cpb-quick-roll-edit';
        edit.dataset.tooltip = 'Edit this roll';
        edit.setAttribute('aria-label', `Edit ${roll.label}`);
        edit.innerHTML = '<i class="fas fa-pen"></i>';

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'cpb-quick-roll-delete';
        remove.dataset.tooltip = 'Delete this roll';
        remove.setAttribute('aria-label', `Delete ${roll.label}`);
        remove.innerHTML = '<i class="fas fa-trash"></i>';

        const favorite = document.createElement('button');
        favorite.type = 'button';
        favorite.className = 'cpb-favorite-toggle';
        favorite.dataset.tooltip = 'Favorite';
        favorite.setAttribute('aria-label', 'Add to favorites');
        favorite.innerHTML = '<i class="far fa-heart"></i>';

        const auto = document.createElement('div');
        auto.className = 'cpb-roll-type-auto';
        auto.innerHTML = `<i class="fas ${roll.isCinematic ? 'fa-film' : 'fa-play'}"></i>`;

        trailing.append(edit, remove, favorite, auto);
        row.append(icon, label, meta, description, trailing);
        return row;
    }

    /** Open the builder, and rebuild the tab when it saves. */
    _openRollBuilder(htmlElement, record = null) {
        new RollBuilderWindow({
            record,
            onSave: () => this._refreshQuickRolls(htmlElement)
        }).render(true);
    }

    /**
     * Redraw the library and re-wire everything that hangs off its rows.
     *
     * All four calls matter. The rows are new elements, so their selection listeners,
     * their favourite ids and their heart states all have to be established again --
     * a redraw that skipped any of them would leave rows that look right and do
     * nothing, which is the failure this whole section is most likely to produce.
     */
    _refreshQuickRolls(htmlElement) {
        const root = htmlElement ?? this._getElementForUpdate();
        if (!root?.querySelector) return;
        this._renderQuickRollsSection(root);
        this._attachCheckItemListeners(root, root.querySelector('.cpb-quick-rolls-list'));
        this._assignFavoriteIdsToCheckItems(root);
        this._syncFavoriteHeartStates(root);
    }

    /**
     * Import a library from a file the GM picks.
     *
     * A hidden `<input type="file">` created per click rather than one left in the
     * template: the element keeps the last file it was given, so a reused input will
     * not fire `change` when the same file is chosen twice -- which reads exactly like
     * the import silently failing.
     */
    _importQuickRolls(htmlElement) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';

        input.addEventListener('change', async (ev) => {
            const file = ev.target.files?.[0];
            input.remove();
            if (!file) return;

            let rolls;
            try {
                rolls = QuickRollsManager.parseImport(await file.text());
            } catch (error) {
                ui.notifications.error(`Quick Rolls: ${error.message}`);
                return;
            }

            // ASKED, not assumed. Merging into a library somebody built and replacing
            // it are both reasonable things to want from the same file, and guessing
            // wrong in the replace direction destroys work with no way back.
            const mode = await foundry.applications.api.DialogV2.wait({
                window: { title: 'Import Quick Rolls' },
                content: `<p>Found <strong>${rolls.length}</strong> roll${rolls.length === 1 ? '' : 's'}.</p>
                          <p>Merge them into this world's library, or replace it entirely?</p>`,
                buttons: [
                    { action: 'merge', label: 'Merge', icon: 'fas fa-code-merge', default: true },
                    { action: 'replace', label: 'Replace All', icon: 'fas fa-triangle-exclamation' },
                    { action: 'cancel', label: 'Cancel', icon: 'fas fa-times' }
                ],
                modal: true,
                rejectClose: false
            });
            if (mode !== 'merge' && mode !== 'replace') return;

            const result = await QuickRollsManager.importRolls(rolls, { replace: mode === 'replace' });
            this._refreshQuickRolls(htmlElement);
            ui.notifications.info(mode === 'replace'
                ? `Quick Rolls: replaced the library with ${result.total} roll${result.total === 1 ? '' : 's'}.`
                : `Quick Rolls: ${result.added} added, ${result.updated} updated.`);
        });

        document.body.appendChild(input);
        input.click();
    }

    /** Wire Add, export, import, and the per-row edit and delete. */
    _attachQuickRollListeners(htmlElement) {
        htmlElement.querySelector('.cpb-quick-rolls-add')?.addEventListener('click', (ev) => {
            ev.preventDefault();
            this._openRollBuilder(htmlElement, null);
        });

        htmlElement.querySelector('.cpb-quick-rolls-export')?.addEventListener('click', (ev) => {
            ev.preventDefault();
            const count = QuickRollsManager.exportToFile();
            ui.notifications.info(`Quick Rolls: exported ${count} roll${count === 1 ? '' : 's'}.`);
        });

        htmlElement.querySelector('.cpb-quick-rolls-import')?.addEventListener('click', (ev) => {
            ev.preventDefault();
            this._importQuickRolls(htmlElement);
        });

        // Delegated, because the list is rebuilt whenever it changes and per-row
        // listeners would have to be re-attached every time.
        const list = htmlElement.querySelector('.cpb-quick-rolls-list');
        if (!list) return;
        list.addEventListener('click', async (ev) => {
            const row = ev.target.closest('.cpb-quick-roll-row');
            if (!row) return;
            const id = row.dataset.quickId;

            if (ev.target.closest('.cpb-quick-roll-edit')) {
                ev.preventDefault();
                ev.stopPropagation();
                this._openRollBuilder(htmlElement, QuickRollsManager.get(id));
                return;
            }
            if (ev.target.closest('.cpb-quick-roll-delete')) {
                ev.preventDefault();
                ev.stopPropagation();
                const roll = QuickRollsManager.get(id);
                // Confirmed, because the row IS the fire button: a misjudged click on a
                // 22px target next to it would otherwise delete a roll silently, and
                // nothing on this screen can bring it back.
                const ok = await foundry.applications.api.DialogV2.confirm({
                    window: { title: 'Delete Roll' },
                    content: `<p>Delete <strong>${foundry.utils.escapeHTML(roll?.label ?? 'this roll')}</strong>?</p>`,
                    modal: true
                });
                if (!ok) return;
                await QuickRollsManager.remove(id);
                this._refreshQuickRolls(htmlElement);
            }
        }, true);
    }

    _attachCheckItemListeners(htmlElement, scope = htmlElement) {
        if (!scope?.querySelectorAll) return;
        scope.querySelectorAll('.cpb-check-item, .check-item').forEach((item) => {
            if (item.classList.contains('cpb-favorite-row')) return;
            if (item.dataset.cpbSelectionBound === '1') return;
            item.dataset.cpbSelectionBound = '1';
            const handleCheckItemSelection = (ev) => {
                ev.preventDefault();
                const type = item.dataset.type;

                // This handler should not manage tool selections as they have a dedicated handler.
                if (type === 'tool') return;
                
                const value = item.dataset.value;
                const isRightClick = ev.type === 'contextmenu';

                if (type === 'quick') {
                    this._resetDiceBuild(htmlElement);
                    this._handleQuickRollItem(htmlElement, item);
                    return;
                }

                // A build left behind on the DICE tab would still be the selection --
                // it sets both contested sides -- and would quietly win over the tile
                // just clicked. Clearing it here is the counterpart to the builder
                // clearing everything else when a die goes above zero.
                this._resetDiceBuild(htmlElement);

            // If this is a non-common tool, prevent selection and show notification
            if (type === 'tool' && item.dataset.common === 'false') {
                const toolName = item.querySelector('span')?.textContent || 'selected tool';
                ui.notifications.warn(`Not all selected players have ${toolName}.`);
                return;
            }

                // Check if we have both challengers and defenders (v13: native DOM)
                        const challengers = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-1');
                const defenders = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-2');
                const hasChallengers = challengers.length > 0;
                const hasDefenders = defenders.length > 0;
                const isContestedRoll = hasChallengers && hasDefenders;

                if (isContestedRoll) {
                    // In contested mode, maintain two selections (v13: native DOM)
                    let wasDeselected = false;
                    htmlElement.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator i').forEach((el) => {
                        const indicator = el.closest('.cpb-roll-type-indicator');
                        const checkItem = indicator.closest('.cpb-check-item');
                        
                        // If clicking the same item, deselect it
                        if (checkItem === item) {
                            if ((isRightClick && el.classList.contains('fa-shield-halved')) ||
                                (!isRightClick && el.classList.contains('fa-swords'))) {
                                indicator.innerHTML = '';
                                checkItem.classList.remove('selected');
                                // Remove styling classes
                                checkItem.classList.remove('cpb-skill-challenger', 'cpb-skill-defender');
                                wasDeselected = true;
                                // Clear the appropriate roll type
                                if (isRightClick) {
                                    this.defenderRoll = { type: null, value: null };
                                } else {
                                    this.challengerRoll = { type: null, value: null };
                                }
                            }
                        }
                        // Remove other selections of the same type
                        else if ((isRightClick && el.classList.contains('fa-shield-halved')) ||
                                (!isRightClick && el.classList.contains('fa-swords'))) {
                            indicator.innerHTML = '';
                            checkItem.classList.remove('selected');
                            // Remove styling classes
                            checkItem.classList.remove('cpb-skill-challenger', 'cpb-skill-defender');
                        }
                    });

                    // Break early if deselected
                    if (wasDeselected) return;

                    // Check if trying to select defender roll without defenders (v13: native DOM)
                    if (isRightClick) {
                        const defenders = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-2');
                        const hasDefenders = defenders.length > 0;
                        if (!hasDefenders) {
                            ui.notifications.warn("You must select at least one defender in the contestants column before selecting a defender roll.");
                            return;
                        }
                    }
                    
                    // Add the roll type indicator and selected state
                    const rollTypeIndicator = item.querySelector('.cpb-roll-type-indicator');
                    if (rollTypeIndicator) {
                        if (isRightClick) {
                            rollTypeIndicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                            this.defenderRoll = { type, value };
                            // Add defender styling
                            item.classList.add('cpb-skill-defender');
                            item.classList.remove('cpb-skill-challenger');
                        } else {
                            rollTypeIndicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                            this.challengerRoll = { type, value };
                            // Add challenger styling
                            item.classList.add('cpb-skill-challenger');
                            item.classList.remove('cpb-skill-defender');
                        }
                    }
                    item.classList.add('selected');
                } else {
                    // Check if we're deselecting the current selection
                    const currentIndicator = item.querySelector('.cpb-roll-type-indicator');
                    const hasCurrentSelection = currentIndicator && currentIndicator.innerHTML !== '';
                    
                    if (hasCurrentSelection) {
                        // Clear selection (v13: native DOM)
                        htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('selected'));
                        htmlElement.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator').forEach(ind => ind.innerHTML = '');
                        htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('cpb-skill-challenger', 'cpb-skill-defender'));
                        this.selectedType = null;
                        this.selectedValue = null;
                    } else {
                        // Check if trying to select defender roll without defenders (v13: native DOM)
                        if (isRightClick) {
                            const defenders = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-2');
                            const hasDefenders = defenders.length > 0;
                            if (!hasDefenders) {
                                ui.notifications.warn("You must select at least one defender in the contestants column before selecting a defender roll.");
                                return;
                            }
                        }
                        
                        // New selection (v13: native DOM)
                        htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('selected'));
                        htmlElement.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator').forEach(ind => ind.innerHTML = '');
                        htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('cpb-skill-challenger', 'cpb-skill-defender'));
                    
                    const rollTypeIndicator = item.querySelector('.cpb-roll-type-indicator');
                    if (rollTypeIndicator) {
                        if (isRightClick) {
                            rollTypeIndicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                            item.classList.add('cpb-skill-defender');
                        } else {
                            rollTypeIndicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                            item.classList.add('cpb-skill-challenger');
                        }
                    }
                    item.classList.add('selected');
                    this.selectedType = type;
                    this.selectedValue = value;

                    // Extract roll title for skill/ability/save rolls
                    const rollTitle = item.dataset.rollTitle || null;
                    if (rollTitle) {
                        this.selectedRollTitle = rollTitle;
                    }
                }
            }

            // If it's a skill, update the description
            if (type === 'skill') {
                const systemSkillData = CONFIG.DND5E.skills[value];
                const customSkillData = this.getData().skills.find(s => s.id === value);
                
                if (systemSkillData && customSkillData) {
                    const ability = CONFIG.DND5E.abilities[systemSkillData.ability]?.label || '';
                    const abilityName = game.i18n.localize(ability);
                    const skillName = game.i18n.localize(systemSkillData.label);
                    const skillDesc = game.i18n.localize(systemSkillData.reference);
                    
                    const title = `${skillName} (${abilityName})`;
                    const uuid = `${skillDesc}`;
                    
                    // Store the skill info and log it
                    this.skillInfo = {
                        description: customSkillData.description,
                        link: `@UUID[${uuid}]{${title}}`
                    };
                    postConsoleAndNotification(MODULE.NAME, "Skill Info set:", this.skillInfo, true, false);
                }
            }
            };
            
            item.addEventListener('click', handleCheckItemSelection);
            item.addEventListener('contextmenu', handleCheckItemSelection);
        });
    }

    _handleQuickRollItem(htmlElement, item) {
        const rollType = item.dataset.rollType || null;
        const value = item.dataset.value;
        const groupAttr = item.dataset.group;
        const dcAttr = item.dataset.dc;
        const defenderSkillAttr = item.dataset.defenderSkill;
        const rollTitle = item.dataset.rollTitle || null;
        // A quick roll fires without the window's Cinematic switch ever being reached,
        // so the switch cannot be what decides: the roll carries its own answer, and
        // `null` means "whatever the window says", which is what a favourite executed
        // through this path used to get by accident.
        const isCinematic = item.dataset.cinematic === 'true' ? true : null;
        let isGroupRoll = null;
        if (groupAttr !== undefined) isGroupRoll = groupAttr === 'true';
        let dcOverride = dcAttr !== undefined ? dcAttr : null;

        if (rollType !== 'contested' && rollType !== 'party') {
            const defenders = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-2');
            if (defenders.length > 0) {
                ui.notifications.warn("You have defenders selected, but this is not a contested roll type. Please deselect defenders or choose a contested roll.");
                return;
            }
        }

        htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('selected'));
        htmlElement.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator').forEach(ind => ind.innerHTML = '');

        if (rollType === 'party') {
            htmlElement.querySelectorAll('.cpb-actor-item').forEach((actorItem) => {
                const { actor } = this._resolveContestantFromElement(actorItem);
                if (actor && actor.hasPlayerOwner) {
                    actorItem.classList.add('selected');
                    actorItem.classList.add('cpb-group-1');
                    const indicator = actorItem.querySelector('.cpb-group-indicator');
                    if (indicator) {
                        indicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                    }
                }
            });
        } else if (rollType === 'contested') {
            postConsoleAndNotification(MODULE.NAME, 'CPB | Setting up contested roll:', { value, defenderSkillAttr }, true, false);

            // A CONTEST CAN NAME ITS CHALLENGERS. This branch used to touch no
            // contestant at all, so a saved contested roll fired against whatever was
            // selected -- or refused outright with "select at least one actor" -- and
            // "Party Stealth vs the guards" could not be saved as one click.
            //
            // The party become challengers and everything else already selected becomes
            // the defence, which is the only reading of "whole party" that leaves a
            // contest with two sides. Anything not selected is left alone: the opposition
            // is situational and the GM has just picked it.
            if (item.dataset.targets === 'party') {
                htmlElement.querySelectorAll('.cpb-actor-item').forEach((actorItem) => {
                    const { actor } = this._resolveContestantFromElement(actorItem);
                    if (!actor) return;
                    const indicator = actorItem.querySelector('.cpb-group-indicator');
                    if (actor.hasPlayerOwner) {
                        actorItem.classList.remove('cpb-group-2');
                        actorItem.classList.add('selected', 'cpb-group-1');
                        if (indicator) indicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                    } else if (actorItem.classList.contains('selected')) {
                        actorItem.classList.remove('cpb-group-1');
                        actorItem.classList.add('cpb-group-2');
                        if (indicator) indicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                    }
                });
            }

            const quickRollMap = {
                'perception': 'prc',
                'insight': 'ins',
                'investigation': 'inv',
                'nature': 'nat',
                'stealth': 'ste',
                'athletics': 'ath',
                'acrobatics': 'acr',
                'deception': 'dec',
                'persuasion': 'per',
                'intimidation': 'itm'
            };
            const challengerType = item.dataset.challengerType || 'skill';
            const challengerSkillValue = quickRollMap[value] || value;
            if (challengerSkillValue) {
                const challengerSkillItem = htmlElement.querySelector(`.cpb-check-item[data-type="${challengerType}"][data-value="${challengerSkillValue}"]`);
                if (challengerSkillItem) {
                    challengerSkillItem.classList.add('selected', 'cpb-skill-challenger');
                    const indicator = challengerSkillItem.querySelector('.cpb-roll-type-indicator');
                    if (indicator) {
                        indicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                    }
                    this.challengerRoll = { type: challengerType, value: challengerSkillValue };
                }
            }

            if (defenderSkillAttr) {
                const defenderType = item.dataset.defenderType || 'skill';
                const defenderSkillValue = quickRollMap[defenderSkillAttr] || defenderSkillAttr;
                const defenderSkillItem = htmlElement.querySelector(`.cpb-check-item[data-type="${defenderType}"][data-value="${defenderSkillValue}"]`);
                if (defenderSkillItem) {
                    defenderSkillItem.classList.add('selected', 'cpb-skill-defender');
                    const indicator = defenderSkillItem.querySelector('.cpb-roll-type-indicator');
                    if (indicator) {
                        indicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                    }
                    this.defenderRoll = { type: defenderType, value: defenderSkillValue };
                }
            }

            this._isQuickPartyRoll = true;
            this._quickRollOverrides = {
                isGroupRoll: false,
                dcOverride: null,
                isContested: true,
                isCinematic,
                rollType: rollType,
                rollTitle: rollTitle
            };

            this._queueRollButtonClick(htmlElement);
            return;
        }

        const quickRollMap = {
            'perception': 'prc',
            'insight': 'ins',
            'investigation': 'inv',
            'nature': 'nat',
            'stealth': 'ste'
        };
        const challengerType = item.dataset.challengerType || 'skill';
        const skillValue = quickRollMap[value] || value;
        if (skillValue) {
            const skillItem = htmlElement.querySelector(`.cpb-check-item[data-type="${challengerType}"][data-value="${skillValue}"]`);
            if (skillItem) {
                skillItem.classList.add('selected', 'cpb-skill-challenger');
                const indicator = skillItem.querySelector('.cpb-roll-type-indicator');
                if (indicator) {
                    indicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                }
                this.selectedType = challengerType;
                this.selectedValue = skillValue;
            }
        }

        this._isQuickPartyRoll = true;
        this._quickRollOverrides = {
            isGroupRoll,
            dcOverride,
            isCinematic,
            rollType: rollType,
            rollTitle: rollTitle
        };

        this._queueRollButtonClick(htmlElement);
    }

    _runFavoriteRowClick(htmlElement, row) {
        const rec = SkillCheckDialog._favoriteRecordFromItem(row);
        SkillCheckDialog.executeFavoriteSilent(rec).then((result) => {
            if (result?.messageId && !result?.openedDialog) this.close();
        });
    }

    /** Build a minimal element with the same data-* as a stored favorite record (menubar / pending run). */
    static _elementFromFavoriteRecord(rec) {
        if (!rec) return null;
        const div = document.createElement('div');
        div.className = 'cpb-check-item';
        div.dataset.type = rec.type ?? '';
        div.dataset.value = rec.value ?? '';
        div.dataset.rollType = rec.rollType ?? '';
        div.dataset.group = rec.group ?? '';
        div.dataset.dc = rec.dc ?? '';
        div.dataset.defenderSkill = rec.defenderSkill ?? '';
        if (rec.rollTitle) div.dataset.rollTitle = rec.rollTitle;
        div.dataset.toolName = rec.toolName ?? '';
        div.dataset.common = rec.common ?? '';
        div.dataset.cinematic = String(!!rec.isCinematic);
        div.dataset.targets = rec.targets ?? '';
        div.dataset.defenderType = rec.defenderType ?? '';
        if (rec.actorTools) div.dataset.actorTools = rec.actorTools;
        if (rec.tooltip) div.dataset.tooltip = rec.tooltip;
        return div;
    }

    _renderFavoritesSection(htmlElement) {
        const list = htmlElement.querySelector('.cpb-favorites-list');
        const empty = htmlElement.querySelector('.cpb-favorites-empty');
        const favs = this.userPreferences.requestRollFavorites || [];
        if (!list) return;
        list.innerHTML = '';
        if (favs.length === 0) {
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';
        for (const rec of favs) {
            const row = document.createElement('div');
            row.className = 'cpb-check-item cpb-favorite-row';
            row.dataset.favoriteId = rec.id;
            row.dataset.type = rec.type;
            row.dataset.value = rec.value ?? '';
            row.dataset.rollType = rec.rollType ?? '';
            row.dataset.group = rec.group ?? '';
            row.dataset.dc = rec.dc ?? '';
            row.dataset.defenderSkill = rec.defenderSkill ?? '';
            if (rec.rollTitle) row.dataset.rollTitle = rec.rollTitle;
            row.dataset.toolName = rec.toolName ?? '';
            row.dataset.common = rec.common ?? '';
            row.dataset.cinematic = String(!!rec.isCinematic);
            row.dataset.targets = rec.targets ?? '';
            row.dataset.defenderType = rec.defenderType ?? '';
            if (rec.actorTools) row.dataset.actorTools = rec.actorTools;
            if (rec.tooltip) row.dataset.tooltip = rec.tooltip;

            const icon = document.createElement('i');
            icon.className = rec.iconClass || 'fas fa-dice-d20';

            const label = document.createElement('span');
            label.className = 'cpb-roll-label';
            label.textContent = rec.label || '';

            const desc = document.createElement('span');
            desc.className = 'cpb-roll-description';
            desc.textContent = rec.description || '';

            const trail = document.createElement('div');
            trail.className = 'cpb-check-item-trailing';
            const favBtn = document.createElement('button');
            favBtn.type = 'button';
            favBtn.className = 'cpb-favorite-toggle cpb-favorite-is-active';
            favBtn.dataset.tooltip = 'Remove from favorites';
            favBtn.setAttribute('aria-label', 'Remove from favorites');
            favBtn.innerHTML = '<i class="fas fa-heart"></i>';

            // HOW IT PLAYS, next to whether it is kept.
            //
            // A favourite fires without opening the window, so the Cinematic switch in
            // the header -- the only way to ask for the overlay -- is never reached on
            // this path, and every favourite went quietly to chat. The setting has to
            // live on the favourite because there is no moment between clicking one and
            // it posting in which to ask.
            //
            // ON THE FAVOURITE ROWS ONLY. A canonical check item is a roll TYPE, and
            // the same skill wants the overlay on one occasion and not the next; a
            // favourite is a saved decision about a specific request, which is exactly
            // the thing that can carry a preference.
            //
            // NOT a `.cpb-favorite-toggle`: that class is claimed by a capture-phase
            // listener that treats any click on it as hearting, and it calls
            // stopPropagation, so this button would never see its own click.
            const cinematic = document.createElement('button');
            cinematic.type = 'button';
            cinematic.className = `cpb-favorite-cinematic${rec.isCinematic ? ' cpb-favorite-cinematic-on' : ''}`;
            cinematic.dataset.tooltip = rec.isCinematic
                ? 'Plays as a cinematic. Click to send it to chat instead.'
                : 'Goes to chat. Click to play it as a cinematic.';
            cinematic.setAttribute('aria-label', cinematic.dataset.tooltip);
            cinematic.setAttribute('aria-pressed', String(!!rec.isCinematic));
            cinematic.innerHTML = '<i class="fas fa-film"></i>';

            const auto = document.createElement('div');
            auto.className = 'cpb-roll-type-auto';
            auto.innerHTML = '<i class="fas fa-play"></i>';
            trail.appendChild(favBtn);
            trail.appendChild(cinematic);
            trail.appendChild(auto);

            row.appendChild(icon);
            row.appendChild(label);
            row.appendChild(desc);
            row.appendChild(trail);
            list.appendChild(row);
        }
    }

    _syncFavoriteHeartStates(htmlElement) {
        if (!htmlElement?.querySelectorAll) return;
        const ids = new Set((this.userPreferences.requestRollFavorites || []).map((f) => f.id));
        htmlElement.querySelectorAll('.cpb-check-item:not(.cpb-favorite-row) .cpb-favorite-toggle').forEach((btn) => {
            const item = btn.closest('.cpb-check-item');
            const fid = item?.dataset.favoriteId;
            const active = !!(fid && ids.has(fid));
            btn.classList.toggle('cpb-favorite-is-active', active);
            const i = btn.querySelector('i');
            if (i) i.className = active ? 'fas fa-heart' : 'far fa-heart';
        });
    }

    _toggleFavorite(htmlElement, item) {
        if (!item) return;
        const favs = [...(this.userPreferences.requestRollFavorites || [])];
        let next;
        if (item.classList.contains('cpb-favorite-row')) {
            const favoriteId = item.dataset.favoriteId;
            next = favs.filter((f) => f.id !== favoriteId);
        } else {
            const rec = SkillCheckDialog._favoriteRecordFromItem(item);
            const idx = favs.findIndex((f) => f.id === rec.id);
            if (idx >= 0) next = favs.filter((_, i) => i !== idx);
            else next = [...favs, rec];
        }
        this.userPreferences = { ...this.userPreferences, requestRollFavorites: next };
        game.settings.set(MODULE.ID, 'skillCheckPreferences', this.userPreferences);
        this._renderFavoritesSection(htmlElement);
        this._assignFavoriteIdsToCheckItems(htmlElement);
        this._syncFavoriteHeartStates(htmlElement);
    }

    /**
     * Flip one favourite between chat and cinematic.
     *
     * Edits the stored record in place rather than removing and re-adding it, so the
     * favourite keeps its id and its position in the list -- a row that jumped to the
     * bottom every time you changed how it plays would be its own bug.
     */
    _toggleFavoriteCinematic(htmlElement, favoriteId) {
        const favs = this.userPreferences.requestRollFavorites || [];
        if (!favs.some((f) => f.id === favoriteId)) return;
        const next = favs.map((f) => (f.id === favoriteId ? { ...f, isCinematic: !f.isCinematic } : f));
        this.userPreferences = { ...this.userPreferences, requestRollFavorites: next };
        game.settings.set(MODULE.ID, 'skillCheckPreferences', this.userPreferences);
        this._renderFavoritesSection(htmlElement);
    }

    _attachRequestRollFavoriteListeners(htmlElement) {
        if (!htmlElement || htmlElement.dataset.cpbFavListenersAttached === '1') return;
        htmlElement.dataset.cpbFavListenersAttached = '1';

        const favList = htmlElement.querySelector('.cpb-favorites-list');
        if (favList) {
            favList.addEventListener('click', (ev) => {
                if (ev.target.closest('.cpb-favorite-toggle')) return;
                const row = ev.target.closest('.cpb-favorite-row');
                if (!row) return;
                ev.preventDefault();
                ev.stopPropagation();
                // Checked BEFORE the run, because the whole row is the fire button --
                // anything inside it that is not meant to fire has to say so here.
                if (ev.target.closest('.cpb-favorite-cinematic')) {
                    this._toggleFavoriteCinematic(htmlElement, row.dataset.favoriteId);
                    return;
                }
                this._runFavoriteRowClick(htmlElement, row);
            });
        }

        this._favoriteCaptureHandler = (ev) => {
            const btn = ev.target.closest('.cpb-favorite-toggle');
            if (!btn || !htmlElement.contains(btn)) return;
            ev.preventDefault();
            ev.stopPropagation();
            const item = btn.closest('.cpb-check-item');
            if (item) this._toggleFavorite(htmlElement, item);
        };
        htmlElement.addEventListener('click', this._favoriteCaptureHandler, true);
    }

    getData() {
        // Guard: no canvas or scene can cause canvas.tokens to be undefined
        const placeables = canvas?.tokens?.placeables ?? [];
        const controlled = canvas?.tokens?.controlled ?? [];

        // Canvas tokens plus party PCs without a token on this scene (theater of the mind)
        const actors = [];
        const seenActorIds = new Set();
        for (const t of placeables) {
            if (!t.actor) continue;
            const a = t.actor;
            seenActorIds.add(a.id);
            const hp = a.system?.attributes?.hp;
            actors.push({
                tokenId: t.id,
                actorId: a.id,
                name: t.name,
                hasOwner: a.hasPlayerOwner,
                isSelected: t.isSelected,
                level: a.type === 'character' ? a.system?.details?.level : null,
                class: a.type === 'character' ? a.system?.details?.class : null,
                type: a.type,
                hp: hp ? {
                    value: hp.value ?? 0,
                    max: hp.max ?? 0
                } : { value: 0, max: 0 },
                img: a.img
            });
        }
        for (const a of game.actors.filter((act) => act.type === 'character' && act.hasPlayerOwner)) {
            if (seenActorIds.has(a.id)) continue;
            seenActorIds.add(a.id);
            const hp = a.system?.attributes?.hp;
            actors.push({
                tokenId: '',
                actorId: a.id,
                name: a.name,
                hasOwner: true,
                isSelected: false,
                level: a.system?.details?.level ?? null,
                class: a.system?.details?.class ?? null,
                type: a.type,
                hp: hp ? {
                    value: hp.value ?? 0,
                    max: hp.max ?? 0
                } : { value: 0, max: 0 },
                img: a.img
            });
        }

        // Check if there are any selected tokens. `'selected'` resolves to `'canvas'`
        // -- see the note in _attachLocalListeners; the value stays public, the
        // filter button does not exist.
        const hasSelectedTokens = controlled.length > 0;
        const requestedFilter = this.initialFilter ?? (hasSelectedTokens ? 'canvas' : 'party');
        const initialFilter = requestedFilter === 'selected' ? 'canvas' : requestedFilter;

        // Get tools directly using _getToolProficiencies
        const tools = this._getToolProficiencies();
        postConsoleAndNotification(MODULE.NAME, 'Tools data being passed to template:', tools, true, false);

        // Use imported descriptions from dictionary.js

        // Get all skills from the system
        const skills = Object.entries(CONFIG.DND5E.skills).map(([id, data]) => ({
            id,
            name: game.i18n.localize(data.label),
            icon: "fas fa-toolbox",
            description: skillDescriptions[id]
        }));

        // Get all abilities
        const abilities = Object.entries(CONFIG.DND5E.abilities).map(([id, data]) => ({
            id,
            name: game.i18n.localize(data.label),
            description: abilityDescriptions[id]
        }));

        // Get all saves (same as abilities for D&D 5e)
        const saves = Object.entries(CONFIG.DND5E.abilities).map(([id, data]) => ({
            id,
            name: game.i18n.localize(data.label),
            description: saveDescriptions[id]
        }));

        // Add Death Save
        saves.push({
            id: 'death',
            name: 'Death',
            description: 'When you start your turn with 0 hit points, you must make a special saving throw, called a death saving throw, to determine whether you creep closer to death or hang onto life.'
        });

        const templateData = {
            actors,
            skills,
            abilities,
            saves,
            tools,
            hasSelectedTokens,
            initialFilter,
            userPreferences: {
                ...this.userPreferences,
                groupRoll: this.initialGroupRoll !== null ? this.initialGroupRoll : this.userPreferences.groupRoll
            },
            dcValue: this.initialDc ?? '' // API can pass default DC
        };

        postConsoleAndNotification(MODULE.NAME, 'Final template data:', templateData, true, false);
        return templateData;
    }

    /**
     * Skill id -> tool name substrings (lowercase). If any selected actor has a tool whose name
     * contains one of these strings, the skill is considered to have its kit.
     * Based on D&D 5e: Sleight of Hand (slt) uses Thieves' Tools; Medicine (med) uses Healer's Kit.
     */
    static SKILL_REQUIRED_KITS = {
        slt: ["thieves", "thief"],
        med: ["healer"]
    };

    /**
     * Get the set of lowercase tool names (and name substrings for matching) from all selected actors.
     * @param {Element} element - Dialog DOM element
     * @returns {Set<string>} Lowercase tool names
     */
    _getSelectedActorsToolNames(element) {
        if (!element?.querySelectorAll) return new Set();
        const selectedActorEls = element.querySelectorAll('.cpb-actor-item.selected');
        const names = new Set();
        selectedActorEls.forEach((el) => {
            const { actor } = this._resolveContestantFromElement(el);
            if (!actor) return;
            actor.items.filter(i => i.type === "tool").forEach(tool => {
                if (tool.name) names.add(tool.name.toLowerCase().trim());
            });
        });
        return names;
    }

    /**
     * Update skill items: dim skills that require a kit when no selected actor has that kit.
     * Call whenever actor selection or filter changes (same timing as _updateToolList).
     * @param {Element} [el] - Optional dialog element (e.g. from activateListeners); if omitted, uses this.element.
     */
    _updateSkillKitState(el) {
        const element = el || this._getElementForUpdate();
        if (!element?.querySelectorAll) return;
        const section = element.querySelector('.cpb-check-section[data-filter="skill"]');
        if (!section) return;
        const toolNames = this._getSelectedActorsToolNames(element);
        const skillItems = section.querySelectorAll('.cpb-check-item[data-type="skill"]');
        skillItems.forEach((item) => {
            const skillId = item.dataset.value;
            const required = SkillCheckDialog.SKILL_REQUIRED_KITS[skillId];
            if (!required || required.length === 0) {
                item.classList.remove('cpb-skill-no-kit');
                return;
            }
            const hasKit = Array.from(toolNames).some(toolName =>
                required.some(needle => toolName.includes(needle))
            );
            if (hasKit) item.classList.remove('cpb-skill-no-kit');
            else item.classList.add('cpb-skill-no-kit');
        });
    }

    _getElementForUpdate() {
        return this.element?.querySelectorAll ? this.element : null;
    }

    _getToolProficiencies() {
        const toolProfs = new Map(); // Map of tool name to count and actor-specific IDs
        const element = this.element?.querySelectorAll ? this.element : null;
        if (!element) return [];
        const selectedActorEls = element.querySelectorAll('.cpb-actor-item.selected');
        const selectedCount = selectedActorEls.length;
        if (selectedCount === 0) return [];

        postConsoleAndNotification(MODULE.NAME, 'Selected actors count:', selectedCount, true, false);

        selectedActorEls.forEach((el) => {
            const { actor } = this._resolveContestantFromElement(el);
            if (!actor) return;

            // Keep track of tool names processed for this actor to avoid double-counting
            const processedTools = new Set();

            // Get tool proficiencies from the actor
            const tools = actor.items.filter(i => i.type === "tool");
            postConsoleAndNotification(MODULE.NAME, `Actor ${actor.name} tools:`, tools.map(t => t.name), true, false);
            tools.forEach(tool => {
                // If we've already processed a tool with this name for this actor, skip it
                if (processedTools.has(tool.name)) return;

                const toolIdentifier = tool.system.baseItem || tool.id; // Use baseItem if available, fallback to id
                if (!toolProfs.has(tool.name)) {
                    toolProfs.set(tool.name, {
                        count: 1,
                        actorTools: new Map([[actor.id, toolIdentifier]]) // Use actor.id for tool mapping
                    });
                } else {
                    const toolData = toolProfs.get(tool.name);
                    toolData.count++;
                    toolData.actorTools.set(actor.id, toolIdentifier); // Use actor.id for tool mapping
                }

                processedTools.add(tool.name);
            });
        });

        // Convert to array and add isCommon flag
        const result = Array.from(toolProfs.entries())
            .map(([name, data]) => {
                const isCommon = data.count === selectedCount;
                postConsoleAndNotification(MODULE.NAME, `Tool ${name}: count=${data.count}, selectedCount=${selectedCount}, isCommon=${isCommon}`, "", true, false);
                const description = toolDescriptions[name] || 'A specialized tool for specific tasks.';
                
                return {
                    name,
                    isCommon,
                    actorTools: data.actorTools, // Map of actorId to their specific tool ID
                    description
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

        postConsoleAndNotification(MODULE.NAME, 'Final tool list:', result, true, false);
        return result;
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        this._attachLocalListeners();
    }

    _attachLocalListeners() {
        const htmlElement = this.element;
        postConsoleAndNotification(MODULE.NAME, "SKILLROLLL | LOCATION CHECK: We are in skill-check-dialogue.js and in _attachLocalListeners()...", "", true, false);

        // Apply initial filter (API can pass initialFilter; else selected tokens or party)
        //
        // `'selected'` RESOLVES TO `'canvas'`. The Selected filter button is gone --
        // a selected token is on the canvas by definition, so Canvas already shows
        // it, and the tokens are pre-selected in the list below regardless. The
        // VALUE stays supported because it is public: `api.rolls` documents
        // `initialFilter: 'selected'` and an error message names it, so a consumer
        // passing it gets the canvas view with its tokens already chosen rather
        // than a filter with no button to un-press.
        const hasSelectedTokens = (canvas?.tokens?.controlled?.length ?? 0) > 0;
        const requestedFilter = this.initialFilter ?? (hasSelectedTokens ? 'canvas' : 'party');
        const initialFilter = requestedFilter === 'selected' ? 'canvas' : requestedFilter;

        // Set initial active state on actor filter button (left column) (v13: native DOM)
        const firstColumn = htmlElement.querySelector('.cpb-dialog-column:first-child');
        const initialFilterBtn = firstColumn?.querySelector(`.cpb-filter-btn[data-filter="${initialFilter}"]`);
        if (initialFilterBtn) initialFilterBtn.classList.add('active');
        
        // How many contestants are selected, and on which side.
        //
        // Counted across the WHOLE list rather than the visible rows, for the same
        // reason Deselect All clears the whole list: a filter hides selections
        // without clearing them, and the number exists precisely to catch the ones
        // you cannot see. A count that agreed with the filter would go quiet in
        // exactly the situation it is for.
        //
        // Hidden at zero. A permanent "0 selected" is noise on a fresh window, and
        // the control beside it already says what to do about a number.
        // It writes into the WINDOW HEADER'S SUBTITLE, which previously held a
        // static "Skill Checks • Ability Checks • Saving Throws" -- a line that
        // restated the six roll-type buttons in the next column and never changed.
        // A caption is better spent on something that does.
        const updateSelectionCount = () => {
            const subtitle = htmlElement.querySelector('.cpb-dialog-subtitle');
            if (!subtitle) return;
            const items = htmlElement.querySelectorAll('.cpb-actor-list .cpb-actor-item');
            const challengers = [...items].filter((i) => i.classList.contains('cpb-group-1')).length;
            const defenders = [...items].filter((i) => i.classList.contains('cpb-group-2')).length;
            const total = challengers + defenders;

            if (!total) {
                subtitle.textContent = '';
                delete subtitle.dataset.tooltip;
                return;
            }
            // Sides are named only when there are two of them; on an ordinary roll
            // everyone is a challenger and saying so adds a word without a fact.
            subtitle.textContent = defenders
                ? `${challengers} vs ${defenders}`
                : `${total} selected`;
            subtitle.dataset.tooltip = defenders
                ? `${challengers} challenger${challengers === 1 ? '' : 's'}, ${defenders} defender${defenders === 1 ? '' : 's'}`
                : `${total} contestant${total === 1 ? '' : 's'} selected, including any hidden by the current filter`;
        };

        // Delegated and on the bubble phase, so it runs AFTER the per-item handlers
        // that do the selecting. Binding per item would mean finding every path that
        // selects -- click, right-click, the party auto-select, the token pre-select
        // -- and the one that gets missed is a count that silently drifts.
        const actorList = htmlElement.querySelector('.cpb-actor-list');
        if (actorList) {
            actorList.addEventListener('click', updateSelectionCount);
            actorList.addEventListener('contextmenu', updateSelectionCount);
        }

        // Deselect every contestant, both groups at once.
        //
        // It clears ALL items rather than only the visible ones. A filter hides
        // rows without deselecting them, so "deselect all" that respected the
        // filter would leave selections behind on rows you cannot see -- and the
        // whole reason to reach for it is a selection you have lost track of.
        //
        // The group indicator is emptied alongside the classes because the two are
        // the selection: `_resolveContestantFromElement` reads the classes and the
        // click handler reads the indicator's contents, so leaving either behind
        // gives a row that is half-selected.
        const deselectAll = htmlElement.querySelector('.cpb-deselect-all');
        if (deselectAll) {
            deselectAll.addEventListener('click', (ev) => {
                ev.preventDefault();
                htmlElement.querySelectorAll('.cpb-actor-list .cpb-actor-item').forEach((item) => {
                    item.classList.remove('selected', 'cpb-group-1', 'cpb-group-2');
                    const indicator = item.querySelector('.cpb-group-indicator') || item.querySelector('.group-indicator');
                    if (indicator) indicator.innerHTML = '';
                });
                this._updateToolList();
                // Called explicitly: this button lives in the header, so the
                // delegated listener on the actor list never sees it.
                updateSelectionCount();
            });
        }

        // Apply initial actor filter
        this._applyFilter(htmlElement, initialFilter);
        
        // Refresh tool list and skill kit dim state for current selection (works for any filter)
        this._updateToolList();
        this._updateSkillKitState(htmlElement);
        
        // When API passed initialFilter 'party', select all visible (party) actors as challengers
        if (initialFilter === 'party') {
            htmlElement.querySelectorAll('.cpb-actor-list .cpb-actor-item').forEach((actorItem) => {
                if (actorItem.style.display === 'none') return;
                const indicator = actorItem.querySelector('.cpb-group-indicator');
                if (!indicator) return;
                actorItem.classList.remove('cpb-group-2');
                actorItem.classList.add('selected', 'cpb-group-1');
                indicator.innerHTML = '<i class="fas fa-swords" title="Challengers"></i>';
            });
            this._updateToolList();
            this._updateSkillKitState(htmlElement);
        }

        // BEFORE the favourite listeners and before the selection pass below: those
        // both walk the rows, and the quick rolls do not exist in the DOM until this
        // has drawn them.
        //
        // `_refreshQuickRolls` rather than a bare render, because the favourite ids
        // and heart states are assigned inside `_updateToolList`, which has already
        // run by this point -- so a plain render would leave every quick row without
        // an id, and its heart unable to light or to remove the favourite it made.
        // Add and the delegated row listeners are bound once and survive every redraw.
        this._attachQuickRollListeners(htmlElement);
        this._refreshQuickRolls(htmlElement);

        this._attachRequestRollFavoriteListeners(htmlElement);
        this._attachDiceBuilderListeners(htmlElement);
        
        // Roll type filter (middle column): when API passed initialType/initialValue, show that tab first so selection is visible
        const secondColumn = htmlElement.querySelector('.cpb-dialog-column:nth-child(2)');
        const rollTypeFilter = (this.selectedType && ['skill', 'ability', 'save', 'dice'].includes(this.selectedType))
            ? this.selectedType
            : 'quick';
        secondColumn?.querySelectorAll('.cpb-filter-btn').forEach(btn => btn.classList.remove('active'));
        const rollTypeFilterBtn = secondColumn?.querySelector(`.cpb-filter-btn[data-filter="${rollTypeFilter}"]`);
        if (rollTypeFilterBtn) rollTypeFilterBtn.classList.add('active');
        this._applyRollTypeFilter(htmlElement, rollTypeFilter);
        
        // If we have an initial roll type selection (skill, ability, or save), resolve value to CONFIG id then pre-select (v13: native DOM)
        if (this.selectedType && this.selectedValue && this.selectedType !== 'dice') {
            const resolvedValue = this._resolveRollTypeValue(this.selectedType, this.selectedValue);
            const item = htmlElement.querySelector(`.cpb-check-item[data-type="${this.selectedType}"][data-value="${resolvedValue}"]`);
            if (item) {
                item.classList.add('selected', 'cpb-skill-challenger');
                const indicator = item.querySelector('.cpb-roll-type-indicator');
                if (indicator) {
                    indicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                }
            }
        }


        // Debug: Check if classes are being applied (v13: native DOM)
        const unavailableTools = htmlElement.querySelectorAll('.cpb-tool-unavailable');
        postConsoleAndNotification(MODULE.NAME, 'Tool items with unavailable class:', unavailableTools.length, true, false);
        htmlElement.querySelectorAll('.cpb-check-item[data-type="tool"]').forEach((el) => {
            postConsoleAndNotification(MODULE.NAME, 'Tool item:', {
                name: el.querySelector('span')?.textContent,
                hasUnavailableClass: el.classList.contains('cpb-tool-unavailable'),
                dataCommon: el.dataset.common,
                classList: Array.from(el.classList)
            }, true, false);
        });

        // If tokens are selected on the canvas, pre-select them in the dialog (v13: native DOM)
        if (hasSelectedTokens && canvas?.tokens?.controlled) {
            canvas.tokens.controlled.forEach(token => {
                const actorItem = htmlElement.querySelector(`.cpb-actor-item[data-token-id="${token.id}"]`);
                if (actorItem) {
                    const actor = token.actor;
                    const indicator = actorItem.querySelector('.cpb-group-indicator');

                    if (actor && actor.type !== 'character') {
                        // NPCs and Monsters default to Defenders
                        actorItem.classList.remove('cpb-group-1');
                        actorItem.classList.add('selected', 'cpb-group-2');
                        if (indicator) {
                            indicator.innerHTML = '<i class="fas fa-shield-halved" title="Defenders"></i>';
                        }
                    } else {
                        // Players default to Challengers
                        actorItem.classList.remove('cpb-group-2');
                        actorItem.classList.add('selected', 'cpb-group-1');
                        if (indicator) {
                            indicator.innerHTML = '<i class="fas fa-swords" title="Challengers"></i>';
                        }
                    }
                }
            });
            // Update the tool list based on the pre-selected actors
            this._updateToolList();
            this._updateSkillKitState();
        }

        // Reflect whatever the auto-selection chose. The listeners only fire on a
        // click, so without this the count stays blank on a window that opened with
        // tokens already controlled -- which is the common case.
        updateSelectionCount();

        // Handle actor selection (v13: native DOM)
        htmlElement.querySelectorAll('.cpb-actor-item').forEach(item => {
            const handleActorSelection = (ev) => {
                ev.preventDefault();
                const isRightClick = ev.type === 'contextmenu';
                const groupIndicator = item.querySelector('.cpb-group-indicator') || item.querySelector('.group-indicator');

                if (!groupIndicator) return;

                // Toggle selection based on click type
                if (isRightClick) {
                    if (groupIndicator.innerHTML.includes('fa-shield-halved')) {
                        // Remove from group 2
                        groupIndicator.innerHTML = '';
                        item.classList.remove('selected', 'cpb-group-2');
                    } else {
                        // Add to group 2, remove from group 1 if needed 
                        groupIndicator.innerHTML = '<i class="fas fa-shield-halved" title="Defenders"></i>';
                        item.classList.remove('cpb-group-1');
                        item.classList.add('selected', 'cpb-group-2');
                    }
                } else {
                    if (groupIndicator.innerHTML.includes('fa-swords')) {
                        // Remove from group 1
                        groupIndicator.innerHTML = '';
                        item.classList.remove('selected', 'cpb-group-1');
                    } else {
                        // Add to group 1, remove from group 2 if needed  
                        groupIndicator.innerHTML = '<i class="fas fa-swords" title="Challengers"></i>';
                        item.classList.remove('cpb-group-2');
                        item.classList.add('selected', 'cpb-group-1');
                    }
                }

                // Update tool proficiencies when actor selection changes
                this._updateToolList();
                this._updateSkillKitState();
                
                // Check if all defenders were removed and clear defender roll selections (v13: native DOM)
                const defenders = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-2');
                const hasDefenders = defenders.length > 0;
                if (!hasDefenders) {
                    // Clear all defender roll selections
                    const defenderIndicators = htmlElement.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator i.fa-shield-halved');
                    defenderIndicators.forEach(indicator => {
                        const parent = indicator.parentElement;
                        if (parent) parent.innerHTML = '';
                    });
                    htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('cpb-skill-defender'));
                    this.defenderRoll = { type: null, value: null };
                }
            };
            
            item.addEventListener('click', handleActorSelection);
            item.addEventListener('contextmenu', handleActorSelection);
        });

        // Handle player search - separate from criteria search (v13: native DOM)
        htmlElement.querySelectorAll('input[name="search"]').forEach((input) => {
            const searchContainer = input.closest('.cpb-search-container');
            const clearButton = searchContainer?.querySelector('.cpb-clear-search-button');
            const dialogColumn = input.closest('.cpb-dialog-column');
            const actorList = dialogColumn?.querySelector('.cpb-actor-list');
            const isPlayerSearch = actorList !== null;
            
            // Show/hide clear button based on input content
            const updateClearButton = () => {
                if (clearButton) {
                    clearButton.style.display = input.value.length > 0 ? '' : 'none';
                }
            };
            
            input.addEventListener('input', (ev) => {
                const searchTerm = ev.currentTarget.value.toLowerCase();
                updateClearButton();
                
                if (isPlayerSearch) {
                    // Search in actor list - support both class naming schemes
                    dialogColumn.querySelectorAll('.cpb-actor-list .cpb-actor-item').forEach((el) => {
                        const nameEl = el.querySelector('.cpb-actor-name');
                        if (nameEl) {
                            const name = nameEl.textContent.toLowerCase();
                            el.style.display = name.includes(searchTerm) ? '' : 'none';
                        }
                    });
                } else {
                    // Search in criteria/checks list
                    htmlElement.querySelectorAll('.cpb-check-item, .check-item').forEach((el) => {
                        const text = el.textContent.toLowerCase();
                        el.style.display = text.includes(searchTerm) ? '' : 'none';
                    });
                }
            });

            // Handle clear button click (v13: native DOM)
            if (clearButton) {
                clearButton.addEventListener('click', () => {
                    input.value = '';
                    // Trigger input event manually
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    clearButton.style.display = 'none';
                });
            }

            // Initial state
            updateClearButton();
        });

        // Handle actor filter buttons (left column) (v13: native DOM)
        // Reuse firstColumn declared in Phase 1 (line 216)
        if (firstColumn) {
            firstColumn.querySelectorAll('.cpb-filter-btn').forEach(button => {
                button.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    const filterType = button.dataset.filter;
                    
                    // Toggle active state on actor filter buttons only
                    firstColumn.querySelectorAll('.cpb-filter-btn').forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                    
                    // Handle actor filtering
                    const firstSearchInput = htmlElement.querySelector('input[name="search"]');
                    const searchTerm = firstSearchInput ? firstSearchInput.value.toLowerCase() : '';
                    if (searchTerm) {
                        // First apply filter without updating visibility
                        this._applyFilter(htmlElement, filterType, false);
                        
                        // Then apply search within filtered results
                        firstColumn.querySelectorAll('.cpb-actor-list .cpb-actor-item').forEach((el) => {
                            if (el.style.display !== 'none') {
                                const nameEl = el.querySelector('.cpb-actor-name, .actor-name');
                                if (nameEl) {
                                    const name = nameEl.textContent.toLowerCase();
                                    el.style.display = name.includes(searchTerm) ? '' : 'none';
                                }
                            }
                        });
                    } else {
                        // No search term, just apply filter
                        this._applyFilter(htmlElement, filterType, true);
                    }
                });
            });
        }

        // Handle roll type filter buttons (middle column) (v13: native DOM)
        // Reuse secondColumn declared in Phase 1 (line 224)
        if (secondColumn) {
            secondColumn.querySelectorAll('.cpb-filter-btn').forEach(button => {
                button.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    const filterType = button.dataset.filter;
                    
                    // Toggle active state on roll type filter buttons only
                    secondColumn.querySelectorAll('.cpb-filter-btn').forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                    
                    // Handle roll type filtering
                    this._applyRollTypeFilter(htmlElement, filterType);
                });
            });
        }

        // Selection on every check item currently in the DOM. The QUICK tab's rows
        // are redrawn from the library later and re-wired by `_refreshQuickRolls`.
        this._attachCheckItemListeners(htmlElement);

        // Handle the roll button (v13: native DOM)
        const rollButton = htmlElement.querySelector('button[data-button="roll"]');
        if (rollButton) {
            rollButton.addEventListener('click', async (ev) => {
            // Guard clause: Only proceed if the current user is the owner of at least one selected actor or is GM
            
            // Check if this is a quick party roll and get all party members if so
            let selectedActors;
                if (this._isQuickPartyRoll && this._quickRollOverrides && this._quickRollOverrides.rollType === 'party') {
                    // For party rolls, include all party members regardless of UI selection (v13: native DOM)
                    selectedActors = Array.from(htmlElement.querySelectorAll('.cpb-actor-item')).map(item => {
                    const { tokenId, actor } = this._resolveContestantFromElement(item);
                    // Only include party members (characters with player owners)
                    if (actor && actor.hasPlayerOwner) {
                        return {
                            tokenId: tokenId || null,
                            actorId: actor.id,
                            name: item.querySelector('.cpb-actor-name, .actor-name').textContent,
                            group: 1, // Party rolls are always group 1 (challengers)
                            actor: actor
                        };
                    }
                    return null;
                }).filter(actor => actor !== null);
                } else {
                    // For non-party rolls, use the currently selected actors (v13: native DOM)
                    selectedActors = Array.from(htmlElement.querySelectorAll('.cpb-actor-item.selected')).map(item => {
                    const { tokenId, actor } = this._resolveContestantFromElement(item);
                    return {
                        tokenId: tokenId || null,
                        actorId: actor?.id,
                        name: item.querySelector('.cpb-actor-name, .actor-name').textContent,
                        group: item.classList.contains('cpb-group-1') ? 1 : 
                               item.classList.contains('cpb-group-2') ? 2 : 1,
                        actor: actor
                    };
                }).filter((a) => a.actor);
            }
            
            const isRoller = selectedActors.some(a => {
                return a.actor && (a.actor.isOwner || game.user.isGM);
            });
            if (!isRoller) return;
            
            if (selectedActors.length === 0) {
                // "Contestant" rather than "actor": it is what the column is called, what
                // the hint under it says, and what the subtitle counts.
                ui.notifications.warn('Select at least one contestant on the left before requesting a roll.');
                return;
            }
            
            // Determine if this is a contested roll
            const hasChallengers = selectedActors.some(a => a.group === 1);
            const hasDefenders = selectedActors.some(a => a.group === 2);
            let isContestedRoll = hasChallengers && hasDefenders;

            let challengerRollType, challengerRollValue;
            let defenderRollType, defenderRollValue;

            const getActorSpecificValue = (actorId, toolMap) => {
                if (!toolMap || !(toolMap instanceof Map)) return null;
                return toolMap.get(actorId);
            };

            if (isContestedRoll) {
                // Use separate rolls for challengers and defenders if both are set
                if (this.challengerRoll.type && this.defenderRoll.type) {
                    challengerRollType = this.challengerRoll.type;
                    defenderRollType = this.defenderRoll.type;
                    
                    // For tools, get actor-specific IDs
                    if (challengerRollType === 'tool') {
                        challengerRollValue = (actorId) => getActorSpecificValue(actorId, this.challengerRoll.value);
                    } else {
                        challengerRollValue = this.challengerRoll.value;
                    }
                    
                    if (defenderRollType === 'tool') {
                        defenderRollValue = (actorId) => getActorSpecificValue(actorId, this.defenderRoll.value);
                    } else {
                        defenderRollValue = this.defenderRoll.value;
                    }
                } else if (this.challengerRoll.type) {
                    // If only challenger roll is set, use it for both
                    challengerRollType = defenderRollType = this.challengerRoll.type;
                    if (challengerRollType === 'tool') {
                        const toolMap = this.challengerRoll.value;
                        challengerRollValue = defenderRollValue = (actorId) => getActorSpecificValue(actorId, toolMap);
                    } else {
                        challengerRollValue = defenderRollValue = this.challengerRoll.value;
                    }
                } else if (this.defenderRoll.type) {
                    // If only defender roll is set, use it for both
                    challengerRollType = defenderRollType = this.defenderRoll.type;
                    if (defenderRollType === 'tool') {
                        const toolMap = this.defenderRoll.value;
                        challengerRollValue = defenderRollValue = (actorId) => getActorSpecificValue(actorId, toolMap);
                    } else {
                        challengerRollValue = defenderRollValue = this.defenderRoll.value;
                    }
                } else {
                    // Both groups are marked, so the contest is set up; what is missing is
                    // the roll itself. Says which click does which, because the two are
                    // not guessable and the hint that explains them is at the foot of a
                    // column that may be scrolled away.
                    ui.notifications.warn('Choose what the challengers roll: left-click a roll on the right. Right-click one to give the defenders a different roll.');
                    return;
                }
            } else {
                // For non-contested rolls, use the primary selection
                if (!this.selectedType || !this.selectedValue) {
                    // THIS WAS A CATCH-ALL AND IT CAUGHT THE WRONG THING MOST OF THE TIME.
                    //
                    // A contested roll only counts as contested when BOTH groups are
                    // marked. Choose a contested roll and forget to mark a defender and
                    // the request is not contested, so it arrives here -- where
                    // `selectedType` is empty, because a contested roll is stored in
                    // `challengerRoll`/`defenderRoll` and never touches it. The GM had
                    // picked a roll and was told to pick a roll.
                    //
                    // The roll state says which half is actually missing, so it says so.
                    const wantsContest = !!(this.challengerRoll?.type || this.defenderRoll?.type);
                    if (wantsContest && !hasDefenders) {
                        ui.notifications.warn('This is a contested roll, but no defenders are marked. Right-click a contestant on the left to make them a defender.');
                    } else if (wantsContest && !hasChallengers) {
                        ui.notifications.warn('This is a contested roll, but no challengers are marked. Left-click a contestant on the left to make them a challenger.');
                    } else {
                        ui.notifications.warn('Choose a roll on the right — a skill, ability, save, tool, or a dice formula.');
                    }
                    return;
                }
                challengerRollType = defenderRollType = this.selectedType;
                if (this.selectedType === 'tool') {
                    const toolMap = this.selectedValue;
                    challengerRollValue = defenderRollValue = (actorId) => getActorSpecificValue(actorId, toolMap);
                } else {
                    challengerRollValue = defenderRollValue = this.selectedValue;
                }
            }

            // Get form data
            let dc;
            let groupRoll;
            if (this._isQuickPartyRoll && this._quickRollOverrides) {
                // Use overrides from quick roll
                if (this._quickRollOverrides.dcOverride !== null) {
                    dc = this._quickRollOverrides.dcOverride;
                } else {
                    const dcInput = htmlElement.querySelector('input[name="dc"]');
                    dc = dcInput && dcInput.value ? dcInput.value : 15;
                }
                if (this._quickRollOverrides.isGroupRoll !== null) {
                    groupRoll = this._quickRollOverrides.isGroupRoll;
                } else {
                    const groupRollInput = htmlElement.querySelector('input[name="groupRoll"]');
                    groupRoll = groupRollInput ? groupRollInput.checked : false;
                }
                
                // Handle contested roll overrides
                if (this._quickRollOverrides.isContested) {
                    // For contested rolls, force certain settings
                    dc = null; // Contested rolls don't use DC
                    groupRoll = false; // Contested rolls are individual
                    isContestedRoll = true; // Force contested mode
                }
            } else {
                const dcInput = htmlElement.querySelector('input[name="dc"]');
                dc = (challengerRollType === 'save' && challengerRollValue === 'death') ? 10 : 
                      (dcInput ? dcInput.value || null : null);
                const groupRollInput = htmlElement.querySelector('input[name="groupRoll"]');
                groupRoll = groupRollInput ? groupRollInput.checked : false;
            }

            // If only one actor is selected, it cannot be a group roll.
            if (selectedActors.length <= 1) {
                groupRoll = false;
            }

            const showDCInput = htmlElement.querySelector('input[name="showDC"]');
            const showDC = showDCInput ? showDCInput.checked : false;
            const rollModeSelect = htmlElement.querySelector('select[name="rollMode"]');
            const rollMode = rollModeSelect ? rollModeSelect.value : null;
            

            // Process actors and their specific tool IDs if needed
            const processedActors = selectedActors.map(actor => {
                const result = { 
                    id: actor.tokenId || actor.actorId,
                    actorId: actor.actorId,
                    name: actor.name,
                    group: actor.group
                    // Don't add ownership here - check it client-side
                };
                if (actor.group === 1 && challengerRollType === 'tool') {
                    result.toolId = typeof challengerRollValue === 'function' ? challengerRollValue(actor.actorId) : challengerRollValue;
                } else if (actor.group === 2 && defenderRollType === 'tool') {
                    result.toolId = typeof defenderRollValue === 'function' ? defenderRollValue(actor.actorId) : defenderRollValue;
                }
                return result;
            });

            // Get roll information for both challenger and defender
            const getRollInfo = (type, value) => {
                let name, desc, link;
                const showExplanationInput = htmlElement.querySelector('input[name="showRollExplanation"]');
                const showExplanation = showExplanationInput ? showExplanationInput.checked : false;
                const showLink = showExplanation; // Always show links when explanations are enabled

                switch (type) {
                    case 'quick':
                        // Map quick roll values to their corresponding skill data
                        const quickRollMap = {
                            'perception': { skill: 'prc', name: 'Party Perception' },
                            'insight': { skill: 'ins', name: 'Party Insight' },
                            'investigation': { skill: 'inv', name: 'Party Investigation' },
                            'nature': { skill: 'nat', name: 'Party Nature' },
                            'stealth': { skill: 'ste', name: 'Party Stealth' },
                            'athletics': { skill: 'ath', name: 'Athletics' },
                            'acrobatics': { skill: 'acr', name: 'Acrobatics' },
                            'deception': { skill: 'dec', name: 'Deception' },
                            'persuasion': { skill: 'per', name: 'Persuasion' },
                            'intimidation': { skill: 'itm', name: 'Intimidation' }
                        };
                        const quickRollData = quickRollMap[value];
                        if (quickRollData) {
                            const skillData = CONFIG.DND5E.skills[quickRollData.skill];
                            name = quickRollData.name;
                            desc = showExplanation ? this.skillInfo?.description : null;
                            link = showLink ? this.skillInfo?.link : null;
                        }
                        break;
                    case 'skill':
                        const skillData = CONFIG.DND5E.skills[value];
                        name = game.i18n.localize(skillData?.label);
                        desc = showExplanation ? this.skillInfo?.description : null;
                        link = showLink ? this.skillInfo?.link : null;
                        break;
                    case 'tool':
                        // For tools, we'll get the name from the first actor's tool
                        const firstActor = processedActors[0];
                        const actor = game.actors.get(firstActor.actorId);
                        const toolIdentifier = typeof value === 'function' ? value(firstActor.actorId) : value;
                        const toolItem = actor?.items.get(toolIdentifier) || actor?.items.find(i => i.system.baseItem === toolIdentifier);
                        
                        name = toolItem?.name;
                        // Use custom description from dictionary instead of system description
                        if (showExplanation && toolItem?.name) {
                            desc = toolDescriptions[toolItem.name] || 'A specialized tool for specific tasks.';
                        } else {
                            desc = null;
                        }
                        link = null; // Tools don't have SRD links
                        break;
                    case 'ability':
                        const abilityData = CONFIG.DND5E.abilities[value];
                        const customAbilityData = this.getData().abilities.find(a => a.id === value);
                        const abilityName = game.i18n.localize(abilityData?.label);
                        name = abilityName + ' Check';
                        desc = showExplanation ? (customAbilityData?.description || '') : null;
                        link = showLink ? `@UUID[${abilityData.reference}]{${abilityName} Check}` : null;
                        break;
                    case 'save':
                        if (value === 'death') {
                            name = 'Death Save';
                            desc = showExplanation ? 'When you start your turn with 0 hit points, you must make a special saving throw, called a death saving throw, to determine whether you creep closer to death or hang onto life.' : null;
                            link = null;
                        } else {
                            const saveData = CONFIG.DND5E.abilities[value];
                            const customSaveData = this.getData().saves.find(s => s.id === value);
                            const saveName = game.i18n.localize(saveData?.label);
                            name = saveName + ' Save';
                            desc = showExplanation ? (customSaveData?.description || '') : null;
                            link = showLink ? `@UUID[${saveData.reference}]{${saveName} Save}` : null;
                        }
                        break;
                    case 'dice':
                        // The formula read as prose, NOT `value` -- which carries the
                        // bracket syntax. This is the contested band's lead and the
                        // cinematic's "X vs Y", both of which a reader reads.
                        name = SkillCheckDialog.diceFormulaDisplay(value);
                        desc = showExplanation ? `This is a straightforward dice roll of ${value} -- exactly the formula shown, with no ability modifier or proficiency bonus added on top.` : null;
                        link = null; // Dice rolls don't have SRD links
                        break;
                    default:
                        name = value;
                        desc = null;
                        link = null;
                }
                return { name, desc, link };
            };

            // Get info for both roll types
            const challengerInfo = getRollInfo(challengerRollType, challengerRollValue);
            const defenderInfo = isContestedRoll ? getRollInfo(defenderRollType, defenderRollValue) : null;

            // Create message data with processed actors
            const messageData = {
                skillName: challengerInfo.name,
                rollTitle: this.apiRollTitle || (this._isQuickPartyRoll && this._quickRollOverrides?.rollTitle) || this.selectedRollTitle || challengerInfo.name, // API title, then quick roll, selected roll title, or fallback to skill name
                defenderSkillName: isContestedRoll && defenderInfo ? defenderInfo.name : null,
                skillAbbr: challengerRollType === 'tool' ? (processedActors[0]?.toolId || null) : challengerRollValue,
                defenderSkillAbbr: isContestedRoll ? (defenderRollType === 'tool' ? (processedActors.find(a => a.group === 2)?.toolId || null) : defenderRollValue) : null,
                actors: processedActors,
                requesterId: game.user.id,
                currentUserId: game.user.id, // Add current user ID for template
                type: 'skillCheck',
                dc: dc,
                showDC: showDC,
                isGroupRoll: groupRoll,
                skillDescription: challengerInfo.desc,
                defenderSkillDescription: isContestedRoll && defenderInfo ? defenderInfo.desc : null,
                skillLink: challengerInfo.link,
                defenderSkillLink: isContestedRoll && defenderInfo ? defenderInfo.link : null,
                rollMode,
                rollType: challengerRollType,
                defenderRollType: isContestedRoll ? defenderRollType : null,
                hasMultipleGroups: isContestedRoll,
                // The FORMULA, separately from the title. A dice request's title is what
                // the GM called it ("Sneak Attack"); the formula is what will be rolled,
                // and both belong on the card -- the title alone says nothing about the
                // dice, and the formula alone reads as a machine talking.
                rollFormula: challengerRollType === 'dice' ? (this.selectedDiceDisplay || challengerRollValue) : null,
                showRollExplanation: htmlElement.querySelector('input[name="showRollExplanation"]')?.checked || false,
                // A quick roll marked cinematic says so regardless of the switch, because
                // it fires without the switch ever being seen. `null` from the override
                // means the roll had no opinion and the window's setting stands.
                isCinematic: (this._isQuickPartyRoll && this._quickRollOverrides?.isCinematic != null)
                    ? !!this._quickRollOverrides.isCinematic
                    : (htmlElement.querySelector('input[name="isCinematic"]')?.checked || false),
                isGM: game.user.isGM
            };
            if (this.initialSituationalBonus != null) messageData.situationalBonus = this.initialSituationalBonus;
            if (this.initialCustomModifier != null) messageData.customModifier = this.initialCustomModifier;
            if (this.initialRollAdvantage != null) {
                messageData.rollAdvantage = this.initialRollAdvantage;
                messageData.lockRollAdvantage = this.initialLockRollAdvantage;
                messageData.rollAdvantageLabel = SkillCheckDialog.rollAdvantageLabel(this.initialRollAdvantage);
            }
            if (this.initialExplanation != null) messageData.explanation = this.initialExplanation;
            messageData.actors.forEach(a => {
                if (messageData.situationalBonus != null) a.situationalBonus = messageData.situationalBonus;
                if (messageData.customModifier != null) a.customModifier = messageData.customModifier;
            });

            postConsoleAndNotification(MODULE.NAME, 'CPB | Cinematic Mode flag set to:', messageData.isCinematic, true, false);

            // Create the chat message
            // v13: CONST.CHAT_MESSAGE_TYPES is deprecated, use style instead
            // Since this is a roll request (not an actual roll), use OTHER style
            // `rollMode` is deliberately NOT passed to create(). Foundry applies a
            // roll mode through applyRollMode/whisper, and whispering this card would
            // hide it from the very players whose roll buttons it carries. The mode
            // instead selects who may READ each total, resolved per client -- see
            // documentation/plans/plan-card-visibility.md, decision 2.
            const message = await ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker(),
                ...(await SkillCheckDialog.formatChatMessage(messageData)),
                style: CONST.CHAT_MESSAGE_STYLES.OTHER
            });

            // Register API callback so the calling module receives roll results when players roll
            if (typeof this.onRollComplete === 'function') {
                SkillCheckDialog._registerRollCompleteCallback(message.id, this.onRollComplete);
            }

            // Play sound for roll request posted to chat
            const postedSound = await resolveRequestRollSound('SOUNDREQUESTROLLPOSTED');
            if (postedSound) playSound(postedSound, COFFEEPUB.SOUNDVOLUMENORMAL);
            
            // Scroll chat to bottom to show the new roll request
            SkillCheckDialog._scrollChatToBottom();

            // If cinematic mode is enabled, show for the GM and broadcast to players
            if (messageData.isCinematic) {
                // Show for the current user who initiated the roll
                SkillCheckDialog._showCinematicDisplay(messageData, message.id);

                // Emit to other users to show the overlay
                const socket = SocketManager.getSocket();
                if (socket) {
                    await socket.executeForOthers("showCinematicOverlay", {
                        type: "showCinematicOverlay",  // Add type property
                        messageId: message.id,
                        messageData: messageData
                    });
                }
            }

            // Close the dialog
            this.close();
            });
        }

        // Handle the cancel button (v13: native DOM)
        const cancelButton = htmlElement.querySelector('button[data-button="cancel"]');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => this.close());
        }

        // Handle preference checkboxes (v13: native DOM)
        const showRollExplanationInput = htmlElement.querySelector('input[name="showRollExplanation"]');
        if (showRollExplanationInput) {
            showRollExplanationInput.addEventListener('change', (ev) => {
                this.userPreferences.showRollExplanation = ev.currentTarget.checked;
                game.settings.set('coffee-pub-blacksmith', 'skillCheckPreferences', this.userPreferences);
            });
        }

        const showDCInput = htmlElement.querySelector('input[name="showDC"]');
        if (showDCInput) {
            showDCInput.addEventListener('change', (ev) => {
                this.userPreferences.showDC = ev.currentTarget.checked;
                game.settings.set('coffee-pub-blacksmith', 'skillCheckPreferences', this.userPreferences);
            });
        }

        const groupRollInput = htmlElement.querySelector('input[name="groupRoll"]');
        if (groupRollInput) {
            groupRollInput.addEventListener('change', (ev) => {
                this.userPreferences.groupRoll = ev.currentTarget.checked;
                game.settings.set('coffee-pub-blacksmith', 'skillCheckPreferences', this.userPreferences);
            });
        }

        const isCinematicInput = htmlElement.querySelector('input[name="isCinematic"]');
        if (isCinematicInput) {
            isCinematicInput.addEventListener('change', (ev) => {
                this.userPreferences.isCinematic = ev.currentTarget.checked;
                game.settings.set('coffee-pub-blacksmith', 'skillCheckPreferences', this.userPreferences);
            });
        }

        // Update DC display when DC input changes (v13: native DOM)
        const dcInput = htmlElement.querySelector('input[name="dc"]');
        if (dcInput) {
            if (this.initialDc != null && this.initialDc !== '') {
                dcInput.value = this.initialDc;
                const dcDisplay = htmlElement.querySelector('.unified-dc-display, .unified-dc-input');
                if (dcDisplay) dcDisplay.value = this.initialDc;
            }
            const handleDCChange = (ev) => {
                const dcValue = ev.currentTarget.value;
                // Update the unified header DC display
                const dcDisplay = htmlElement.querySelector('.unified-dc-display, .unified-dc-input');
                if (dcDisplay) {
                    if (dcValue && dcValue.trim() !== '') {
                        dcDisplay.value = dcValue;
                    } else {
                        dcDisplay.value = '--';
                    }
                }
            };
            dcInput.addEventListener('input', handleDCChange);
            dcInput.addEventListener('change', handleDCChange);
        }

        // A quick roll fired from the menubar. It runs through the WINDOW rather than
        // through a silent API call, because that is what a quick roll is: the handler
        // selects contestants in this dialog's own list -- the whole party, or the two
        // sides of a contest -- and there is no headless equivalent of that. The window
        // opens, fires, and closes itself, which is what a contested favourite has
        // always done.
        if (this._pendingQuickRollId) {
            const quickId = this._pendingQuickRollId;
            this._pendingQuickRollId = null;
            setTimeout(() => {
                const row = htmlElement.querySelector(`.cpb-quick-roll-row[data-quick-id="${quickId}"]`);
                if (row) {
                    this._handleQuickRollItem(htmlElement, row);
                } else {
                    ui.notifications.warn('That quick roll is no longer in the library. It may have been deleted or the library replaced by an import.');
                }
            }, 0);
        }

        if (this._pendingFavoriteRec) {
            const rec = this._pendingFavoriteRec;
            this._pendingFavoriteRec = null;
            const synthetic = SkillCheckDialog._elementFromFavoriteRecord(rec);
            setTimeout(() => {
                if (!synthetic) return;
                const t = rec.type;
                if (t === 'quick') {
                    this._handleQuickRollItem(htmlElement, synthetic);
                } else {
                    const canonical = this._findCanonicalForFavoriteRow(htmlElement, synthetic);
                    if (canonical) {
                        canonical.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    } else {
                        ui.notifications.warn('This favorite could not be matched in the dialog. Open the correct roll tab or remove the favorite.');
                    }
                }
            }, 0);
        }
    }

    _updateToolList() {
        const tools = this._getToolProficiencies();
        const element = this.element?.querySelectorAll ? this.element : null;
        if (!element) return;
        
        // v13: native DOM - get last check section
        const checkSections = element.querySelectorAll('.cpb-check-section');
        const toolSection = checkSections.length > 0 ? checkSections[checkSections.length - 1] : null;
        
        if (!toolSection) return;
        
        // Clear existing tools (v13: native DOM)
        toolSection.querySelectorAll('.cpb-check-item').forEach(item => item.remove());
        
        // Add new tools (v13: native DOM)
        tools.forEach(tool => {
            // Convert Map to array of [actorId, toolId] pairs for data attribute
            const actorToolsArray = Array.from(tool.actorTools.entries());
            
            // Create tool item element (v13: native DOM)
            const toolItem = document.createElement('div');
            toolItem.className = `cpb-check-item${tool.isCommon ? '' : ' cpb-tool-unavailable'}`;
            toolItem.dataset.type = 'tool';
            toolItem.dataset.toolName = tool.name;
            toolItem.dataset.value = tool.name;
            toolItem.dataset.actorTools = JSON.stringify(actorToolsArray).replace(/'/g, "&apos;");
            toolItem.dataset.common = tool.isCommon;
            toolItem.dataset.rollTitle = tool.name;
            toolItem.dataset.tooltip = tool.description;
            
            // Build inner HTML (favorite heart only when tool is usable for all selected actors)
            const trailing = tool.isCommon
                ? `<div class="cpb-check-item-trailing">
                <button type="button" class="cpb-favorite-toggle" title="Favorite" aria-label="Add to favorites"><i class="far fa-heart"></i></button>
                <div class="cpb-roll-type-indicator"></div>
            </div>`
                : `<div class="cpb-roll-type-indicator"></div>`;
            toolItem.innerHTML = `
                <i class="fas fa-tools"></i>
                <span class="cpb-roll-label">${tool.name}</span><span class="cpb-roll-description">${tool.description}</span>
                ${trailing}
            `;
            
            // Only attach click handler if the tool is common
            if (tool.isCommon) {
                const handleToolSelection = (ev) => {
                    ev.preventDefault();
                    try {
                        const item = ev.currentTarget;
                        const type = 'tool';
                        // A tool is another roll type, so it clears the dice build the
                        // same way the check-item handler does.
                        this._resetDiceBuild(element);
                        // Parse the actor tools data back into a Map
                        const actorToolsData = JSON.parse(item.dataset.actorTools);
                        const actorTools = new Map(actorToolsData);
                        const isRightClick = ev.type === 'contextmenu';

                        // Check if we have both challengers and defenders (v13: native DOM)
                        const challengers = element.querySelectorAll('.cpb-actor-item.cpb-group-1');
                        const defenders = element.querySelectorAll('.cpb-actor-item.cpb-group-2');
                        const hasChallengers = challengers.length > 0;
                        const hasDefenders = defenders.length > 0;
                        const isContestedRoll = hasChallengers && hasDefenders;

                        if (isContestedRoll) {
                            // Handle contested roll selection (v13: native DOM)
                            const currentIndicator = item.querySelector('.cpb-roll-type-indicator');
                            const currentIcon = currentIndicator?.querySelector('i');
                            
                            if (isRightClick) {
                                // Handle defender selection
                                if (currentIcon?.classList.contains('fa-shield-halved')) {
                                    // Deselect if already selected as defender
                                    if (currentIndicator) currentIndicator.innerHTML = '';
                                    item.classList.remove('selected');
                                    this.defenderRoll = { type: null, value: null };
                                } else {
                                    // Clear other defender selections
                                    toolSection.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator i.fa-shield-halved').forEach(icon => {
                                        const parent = icon.parentElement;
                                        if (parent) parent.innerHTML = '';
                                    });
                                    toolSection.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('selected'));
                                    
                                    // Set as defender
                                    if (currentIndicator) {
                                        currentIndicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                                    }
                                    item.classList.add('selected');
                                    this.defenderRoll = { type, value: actorTools };
                                }
                            } else {
                                // Handle challenger selection
                                if (currentIcon?.classList.contains('fa-swords')) {
                                    // Deselect if already selected as challenger
                                    if (currentIndicator) currentIndicator.innerHTML = '';
                                    item.classList.remove('selected');
                                    this.challengerRoll = { type: null, value: null };
                                } else {
                                    // Clear other challenger selections
                                    toolSection.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator i.fa-swords').forEach(icon => {
                                        const parent = icon.parentElement;
                                        if (parent) parent.innerHTML = '';
                                    });
                                    toolSection.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('selected'));
                                    
                                    // Set as challenger
                                    if (currentIndicator) {
                                        currentIndicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                                    }
                                    item.classList.add('selected');
                                    this.challengerRoll = { type, value: actorTools };
                                }
                            }
                        } else {
                            // Handle non-contested roll selection (v13: native DOM)
                            const currentIndicator = item.querySelector('.cpb-roll-type-indicator');
                            const hasCurrentSelection = currentIndicator ? currentIndicator.innerHTML !== '' : false;
                            
                            // Clear all selections first
                            toolSection.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('selected'));
                            toolSection.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator').forEach(ind => ind.innerHTML = '');
                            
                            if (hasCurrentSelection) {
                                // If clicking an already selected item, clear the selection
                                this.selectedType = null;
                                this.selectedValue = null;
                            } else {
                                // Set new selection
                                if (currentIndicator) {
                                    if (isRightClick) {
                                        currentIndicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                                    } else {
                                        currentIndicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                                    }
                                }
                                item.classList.add('selected');
                                this.selectedType = type;
                                this.selectedValue = actorTools;
                            }
                        }
                    } catch (error) {
                        // Names the tool and the reason. The old text said neither, so a
                        // GM whose actor data had one malformed tool was told only that
                        // "something" had gone wrong with "the tool selection" -- with no
                        // way to tell which of a dozen rows was the bad one.
                        console.error('Error in tool selection', error);
                        const toolName = item.dataset.toolName || item.querySelector('.cpb-roll-label')?.textContent?.trim() || 'that tool';
                        ui.notifications.error(`Could not select ${toolName}: ${error?.message ?? error}. See the console for details.`);
                    }
                };
                
                toolItem.addEventListener('click', handleToolSelection);
                toolItem.addEventListener('contextmenu', handleToolSelection);
            } else {
                const handleUnavailableTool = (ev) => {
                    ev.preventDefault();
                    ui.notifications.warn(`Not all selected players have ${tool.name}.`);
                };
                toolItem.addEventListener('click', handleUnavailableTool);
                toolItem.addEventListener('contextmenu', handleUnavailableTool);
            }
            
            toolSection.appendChild(toolItem);
        });

        this._assignFavoriteIdsToCheckItems(element);
        this._renderFavoritesSection(element);
        this._syncFavoriteHeartStates(element);
    }

    // Update helper method to optionally defer visibility updates (v13: native DOM)
    _applyFilter(html, filterType, updateVisibility = true) {
        const htmlElement = html;
        if (!htmlElement || typeof htmlElement.querySelectorAll !== 'function') {
            return;
        }
        htmlElement.querySelectorAll('.cpb-actor-list .cpb-actor-item').forEach((el) => {
            const { tokenId, token, actor } = this._resolveContestantFromElement(el);
            if (!actor) return;
            
            let show = false;
            switch (filterType) {
                case 'selected':
                    // Show only selected tokens on canvas (off-canvas PCs hidden here)
                    show = !!(tokenId && canvas.tokens.controlled.some(t => t.id === tokenId));
                    break;
                case 'canvas':
                    // Tokens placed on this scene only
                    show = !!tokenId && token != null;
                    break;
                case 'party':
                    // All player-owned PCs, including those not on the canvas
                    show = actor.type === 'character' && actor.hasPlayerOwner;
                    break;
                case 'monster':
                    // NPC tokens on the canvas
                    show = !!(tokenId && token && actor.type === 'npc');
                    break;
                default:
                    show = true;
            }
            
            if (updateVisibility) {
                el.style.display = show ? '' : 'none';
            } else {
                // Just mark the element with a data attribute for later use
                el.dataset.filterShow = show;
                if (!show) {
                    el.style.display = 'none';
                } else {
                    el.style.display = '';
                }
            }
        });
        
        // Check if all defenders were removed and clear defender roll selections (v13: native DOM)
        const defenders = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-2');
        const hasDefenders = defenders.length > 0;
        if (!hasDefenders) {
            // Clear all defender roll selections
            const defenderIndicators = htmlElement.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator i.fa-shield-halved');
            defenderIndicators.forEach(indicator => {
                const parent = indicator.parentElement;
                if (parent) parent.innerHTML = '';
            });
            htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('cpb-skill-defender'));
            this.defenderRoll = { type: null, value: null };
        }
    }

    /**
     * Resolve API initialValue (e.g. "perception") to the CONFIG id used in the template (e.g. "prc").
     * @param {string} type - 'skill' | 'ability' | 'save'
     * @param {string} value - API value (id or friendly name like "perception")
     * @returns {string} CONFIG id for data-value
     */
    _resolveRollTypeValue(type, value) {
        if (!value || typeof value !== 'string') return value;
        const v = value.trim().toLowerCase();
        if (type === 'skill' && CONFIG.DND5E?.skills) {
            if (CONFIG.DND5E.skills[value]) return value;
            const entry = Object.entries(CONFIG.DND5E.skills).find(([id, data]) =>
                id.toLowerCase() === v || (data?.label && game.i18n.localize(data.label).toLowerCase() === v)
            );
            return entry ? entry[0] : value;
        }
        if (type === 'ability' && CONFIG.DND5E?.abilities) {
            if (CONFIG.DND5E.abilities[value]) return value;
            const entry = Object.entries(CONFIG.DND5E.abilities).find(([id, data]) =>
                id.toLowerCase() === v || (data?.label && game.i18n.localize(data.label).toLowerCase() === v)
            );
            return entry ? entry[0] : value;
        }
        if (type === 'save' && CONFIG.DND5E?.abilities) {
            if (value === 'death' || v === 'death') return 'death';
            if (CONFIG.DND5E.abilities[value]) return value;
            const entry = Object.entries(CONFIG.DND5E.abilities).find(([id, data]) =>
                id.toLowerCase() === v || (data?.label && game.i18n.localize(data.label).toLowerCase() === v)
            );
            return entry ? entry[0] : value;
        }
        return value;
    }

    // ===== DICE BUILDER ===============================================
    //
    // The DICE tab used to be a list you picked one thing from, and the thing you
    // picked WAS the formula -- a tile's `data-value` went straight to `new Roll`.
    // "Roll 2d10 for Strength plus 1d4 bludgeoning plus 10" had no way to be asked
    // for, and neither did two dice of anything.
    //
    // It is now a builder. Every die has its own count starting at zero and its own
    // optional label, there is one flat modifier at the end, and the sum of those is
    // the request. Four things follow that are worth stating:
    //
    // 1. THE DOM IS THE STATE. Counts, labels, and the order they were set are read
    //    back out of the rows rather than mirrored into a parallel object. A mirror is
    //    a second thing to keep in step with the screen, and the failure when it
    //    drifts is silent -- a request that rolls something other than what the
    //    readout said.
    //
    // 2. BUILDING IS SELECTING. A non-empty build sets `selectedType`/`selectedValue`
    //    and both contested sides, exactly as clicking a tile used to; emptying it
    //    clears them again, and picking any other roll type clears the build. There
    //    is no separate "which die is selected" state, because a count above zero
    //    already says it.
    //
    // 3. TERM ORDER IS THE ORDER THE DICE WERE SET, not the order of the rows. The
    //    row a die lives on is a fact about the UI; which die the GM reached for first
    //    is a fact about the roll, and it is the one that reads right on the card.
    //    Each row carries a stamp from a counter, taken when its count leaves zero and
    //    dropped when it returns.
    //
    // 4. REMEMBERING IS NOT FAVOURITING. A remembered roll is kept here, in the tab
    //    that builds it. Favouriting promotes it to the Quick tab beside skills and
    //    saves -- which most working rolls have no business doing, hence two separate
    //    stores and a heart that lives on the saved row rather than on the builder.
    //
    // The label convention is the one the roll window's modifier field already uses:
    // `2d10[Strength]`, brackets and all. That is also Foundry's own flavour syntax,
    // so the label survives into the roll's tooltip rather than being decoration --
    // and `Roll.validate` is asked before the labelled form is trusted, so a label
    // that would break the parser costs the flavour rather than the roll.

    /** Row markers the builder reads. `modifier` is a term in the same sum, not a die. */
    static DICE_MODIFIER_ROW = 'modifier';

    /** The title a dice request carries when the GM did not name it. */
    static DICE_DEFAULT_TITLE = 'Custom Dice Roll';

    /**
     * A label as it may appear inside brackets.
     *
     * Brackets are stripped rather than escaped because they are the delimiter: a `]`
     * inside a label ends it early and the rest of the formula becomes garbage. Also
     * collapses whitespace, since the label is rendered inline.
     */
    static _sanitizeDiceLabel(raw) {
        return String(raw ?? '').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    }

    /** The builder's rows, in document order. Term order is a stamp on each row, not this. */
    _diceRows(root) {
        return Array.from(root?.querySelectorAll?.('.cpb-dice-row[data-die]') ?? []);
    }

    /** The count on one row, as a whole number. A missing or unreadable field is zero. */
    static _diceRowCount(row) {
        return Math.trunc(Number(row.querySelector('.cpb-dice-count')?.value)) || 0;
    }

    /**
     * Stamp each row with when its die entered the roll, and drop the stamp when it
     * leaves.
     *
     * The stamp is what makes "2d10 then 1d4" come out as `2d10 + 1d4` rather than in
     * row order. It is monotonic rather than a position, so removing the first die
     * does not renumber the others -- the remaining dice keep the order they were
     * added in, which is the order the GM still sees.
     */
    _stampDiceOrder(root) {
        for (const row of this._diceRows(root)) {
            const count = SkillCheckDialog._diceRowCount(row);
            row.classList.toggle('cpb-dice-row-active', count !== 0);
            if (count === 0) delete row.dataset.diceOrder;
            else if (!row.dataset.diceOrder) row.dataset.diceOrder = String(++this._diceOrderCounter);
        }
    }

    /**
     * Read the rows into a term list, in the order the dice were set.
     *
     * A die contributes a term only when its count is above zero. The modifier
     * contributes only when non-zero, and only alongside at least one die -- a
     * "request" that is a bare number is not a roll, and Foundry would happily
     * evaluate it, which is worse than refusing. It is also always LAST, whenever it
     * was typed: a flat term at the end is how a formula is written.
     *
     * @returns {{op: string, value: string, label: string}[]}
     */
    _readDiceTerms(root) {
        const dice = [];
        let modifier = null;

        for (const row of this._diceRows(root)) {
            const die = row.dataset.die;
            const count = SkillCheckDialog._diceRowCount(row);
            const label = SkillCheckDialog._sanitizeDiceLabel(row.querySelector('.cpb-dice-reason')?.value);

            if (die === SkillCheckDialog.DICE_MODIFIER_ROW) {
                if (count !== 0) modifier = { op: count < 0 ? '-' : '+', value: String(Math.abs(count)), label };
                continue;
            }
            if (count > 0) {
                dice.push({ order: Number(row.dataset.diceOrder) || 0, term: { op: '+', value: `${count}${die}`, label } });
            }
        }

        const terms = dice.sort((a, b) => a.order - b.order).map((entry) => entry.term);
        if (terms.length && modifier) terms.push(modifier);
        return terms;
    }

    /**
     * A formula with its bracketed labels read as words: `2d10[Strength]` -> `2d10 Strength`.
     *
     * The one place brackets become prose. The builder has the terms and could join
     * them itself, but the silent API path has only the string, and two ways of
     * writing the same line is how the card and the cinematic plate come to disagree.
     */
    static diceFormulaDisplay(formula) {
        return String(formula ?? '').replace(/\[([^\]]*)\]/g, ' $1').replace(/\s+/g, ' ').trim();
    }

    /** The GM's name for this roll, or the default. Never empty, because it titles the card. */
    _diceRollName(root) {
        const typed = String(root?.querySelector?.('.cpb-dice-name')?.value ?? '').trim();
        return typed || SkillCheckDialog.DICE_DEFAULT_TITLE;
    }

    /**
     * The build as the strings the rest of the window needs.
     *
     * `formula` is what gets rolled and carries the labels as Foundry flavour;
     * `plainFormula` is the same sum with the labels removed, used when the labelled
     * form does not parse and when an icon is chosen. `display` is the readable line
     * -- "2d10 Strength + 1d4 Bludgeoning + 10" -- shown on the card and the cinematic
     * plate, and `name` is the request's title.
     *
     * @returns {{terms: object[], formula: string, plainFormula: string, display: string, name: string}|null}
     */
    _composeDiceBuild(root) {
        const terms = this._readDiceTerms(root);
        if (!terms.length) return null;

        const join = (render) => terms
            .map((term, i) => (i === 0 ? '' : `${term.op} `) + render(term))
            .join(' ')
            .trim();

        const plainFormula = join((t) => t.value);
        const labelled = join((t) => (t.label ? `${t.value}[${t.label}]` : t.value));
        // `Roll.validate` is Foundry's own parser saying yes. Asked because the label
        // is user prose reaching a formula, and the cost of being wrong is a request
        // nobody can roll.
        const labelledIsRollable = typeof Roll === 'undefined'
            || typeof Roll.validate !== 'function'
            || Roll.validate(labelled);

        return {
            terms,
            formula: labelledIsRollable ? labelled : plainFormula,
            plainFormula,
            display: SkillCheckDialog.diceFormulaDisplay(labelled),
            name: this._diceRollName(root)
        };
    }

    /**
     * Split a formula back into rows, for an API caller or a remembered roll.
     *
     * Understands what the builder can produce -- `NdX` terms with optional bracketed
     * labels and one trailing number -- and returns null for anything else, so a
     * formula too complex to show is rolled as given rather than silently rewritten
     * into something the rows can display.
     *
     * `order` is the dice in the order they appear, which is what the stamps are
     * restored from: a remembered roll reopens reading the way it was written.
     *
     * @returns {{counts: object, labels: object, order: string[], modifier: number, modifierLabel: string}|null}
     */
    static parseDiceBuild(formula) {
        const text = String(formula ?? '').trim();
        if (!text) return null;
        // Values run up to a space, sign, or bracket; a bracketed label may contain
        // spaces, because its brackets say where it ends. Same shape as the roll
        // window's modifier tokenizer, for the same reason.
        const tokens = text.match(/[+-]|[^\s+\-\[]+(?:\[[^\]]*\])?/g) ?? [];

        const counts = {};
        const labels = {};
        const order = [];
        let modifier = 0;
        let modifierLabel = '';
        let pendingOp = '+';

        for (const token of tokens) {
            if (token === '+' || token === '-') { pendingOp = token; continue; }

            const split = /^(.*?)\[([^\]]*)\]$/.exec(token);
            const value = (split ? split[1] : token).trim();
            const label = split ? split[2].trim() : '';

            const dieMatch = /^(\d*)d(\d+)$/i.exec(value);
            if (dieMatch) {
                if (pendingOp === '-') return null; // Subtracting dice is not a thing the rows can show.
                const die = `d${dieMatch[2]}`;
                if (!(die in counts)) order.push(die);
                counts[die] = (counts[die] ?? 0) + (dieMatch[1] === '' ? 1 : parseInt(dieMatch[1], 10));
                if (label) labels[die] = label;
                pendingOp = '+';
                continue;
            }

            if (/^\d+$/.test(value)) {
                if (modifier !== 0) return null; // One flat term is all there is a row for.
                modifier = parseInt(value, 10) * (pendingOp === '-' ? -1 : 1);
                modifierLabel = label;
                pendingOp = '+';
                continue;
            }

            return null;
        }

        return order.length ? { counts, labels, order, modifier, modifierLabel } : null;
    }

    /** Write a parsed build into the rows, stamping the order it was written in. */
    _applyDiceBuild(root, build, name = '') {
        if (!build) return;
        for (const row of this._diceRows(root)) {
            const die = row.dataset.die;
            const countInput = row.querySelector('.cpb-dice-count');
            const labelInput = row.querySelector('.cpb-dice-reason');
            const isModifier = die === SkillCheckDialog.DICE_MODIFIER_ROW;
            if (countInput) countInput.value = String(isModifier ? build.modifier : (build.counts[die] ?? 0));
            if (labelInput) labelInput.value = isModifier ? (build.modifierLabel ?? '') : (build.labels[die] ?? '');
            // Stamped from the FORMULA's order, not the rows', so a remembered roll
            // reopens reading the way it was written rather than sorted by die size.
            const position = build.order.indexOf(die);
            if (position >= 0) row.dataset.diceOrder = String(this._diceOrderCounter + position + 1);
            else delete row.dataset.diceOrder;
        }
        this._diceOrderCounter += build.order.length;

        const nameInput = root.querySelector('.cpb-dice-name');
        if (nameInput) nameInput.value = name ?? '';
    }

    /**
     * Zero every row, and drop the selection the build was holding.
     *
     * This is also the "picked something else" path, which is why it clears rather
     * than keeps: a build sets BOTH contested sides, so a stale one left behind would
     * still be the defender's roll after a skill was clicked as challenger -- a
     * contested request rolling a formula no longer on screen.
     */
    _resetDiceBuild(root) {
        const element = root ?? this._getElementForUpdate();
        if (!element?.querySelectorAll) return;
        for (const row of this._diceRows(element)) {
            const countInput = row.querySelector('.cpb-dice-count');
            const labelInput = row.querySelector('.cpb-dice-reason');
            if (countInput) countInput.value = '0';
            if (labelInput) labelInput.value = '';
            delete row.dataset.diceOrder;
        }
        const nameInput = element.querySelector('.cpb-dice-name');
        if (nameInput) nameInput.value = '';
        this._syncDiceBuilder(element);
    }

    /**
     * Recompute the build and make the rest of the window agree with it.
     *
     * `keepSelection` is for the sync that runs at attach: an empty build must not
     * clear a selection an API caller passed in for some other roll type.
     */
    _syncDiceBuilder(html, { keepSelection = false } = {}) {
        const root = html ?? this._getElementForUpdate();
        if (!root?.querySelector) return;

        // Stamped BEFORE composing, because the stamps are what the term order is read
        // from -- a die bumped this tick has no order until this runs.
        this._stampDiceOrder(root);
        const build = this._composeDiceBuild(root);

        if (build) {
            this.selectedType = 'dice';
            this.selectedValue = build.formula;
            // The NAME titles the request, not the formula: "Sneak Attack" is what the
            // roll is for, and the formula is carried separately and shown in its own
            // right on both the card and the cinematic plate.
            this.selectedRollTitle = build.name;
            this.selectedDiceDisplay = build.display;
            // Both contested sides, because a contested dice roll is the same formula
            // rolled by both -- there is no left-click/right-click split to make here.
            this.challengerRoll = { type: 'dice', value: build.formula };
            this.defenderRoll = { type: 'dice', value: build.formula };
        } else if (!keepSelection) {
            if (this.selectedType === 'dice') {
                this.selectedType = null;
                this.selectedValue = null;
                this.selectedRollTitle = null;
            }
            this.selectedDiceDisplay = null;
            if (this.challengerRoll?.type === 'dice') this.challengerRoll = { type: null, value: null };
            if (this.defenderRoll?.type === 'dice') this.defenderRoll = { type: null, value: null };
        }

        this._renderDiceFormula(root, build);
        const remember = root.querySelector('.cpb-dice-remember');
        if (remember) {
            remember.disabled = !build;
            remember.dataset.tooltip = build ? 'Remember this roll' : 'Add a die first';
        }
    }

    /**
     * The readout.
     *
     * Built as DOM rather than a string: the labels are the user's own prose, and
     * `textContent` is the one way to put prose on a page that cannot also put markup
     * there. Each term renders as its value with the label beside it as a tag, which
     * is how the roll window shows a labelled modifier -- the number stays the thing
     * you read and the reason sits next to it.
     */
    _renderDiceFormula(root, build) {
        const readout = root.querySelector('.cpb-dice-formula');
        const summary = root.querySelector('.cpb-dice-summary');
        const icon = summary?.querySelector(':scope > i');
        if (!readout) return;

        readout.innerHTML = '';
        summary?.classList.toggle('cpb-dice-summary-empty', !build);

        if (!build) {
            readout.textContent = 'Add a die to build a roll';
            if (icon) icon.className = 'fas fa-dice-d20';
            return;
        }

        build.terms.forEach((term, index) => {
            if (index > 0) {
                const op = document.createElement('span');
                op.className = 'cpb-dice-term-op';
                op.textContent = term.op;
                readout.appendChild(op);
            }
            const value = document.createElement('span');
            value.className = 'cpb-dice-term-value';
            value.textContent = term.value;
            readout.appendChild(value);
            if (term.label) {
                const label = document.createElement('span');
                label.className = 'cpb-dice-term-label';
                label.textContent = term.label;
                readout.appendChild(label);
            }
        });

        if (icon) icon.className = getDiceIcon(build.plainFormula);
    }

    // ----- REMEMBERED ROLLS -------------------------------------------

    /** The remembered rolls, always an array even on a preferences object that predates them. */
    _savedDiceRolls() {
        const saved = this.userPreferences.requestRollSavedDice;
        return Array.isArray(saved) ? saved : [];
    }

    _writeSavedDiceRolls(next) {
        this.userPreferences = { ...this.userPreferences, requestRollSavedDice: next };
        game.settings.set(MODULE.ID, 'skillCheckPreferences', this.userPreferences);
    }

    /**
     * A favourite record for a remembered roll.
     *
     * Shaped exactly like a check item's, so `_computeFavoriteId`, the favourites
     * list, and `executeFavoriteSilent` all handle it without knowing the builder
     * exists. The formula is the record's VALUE and the name is its label, which is
     * why two rolls with the same dice and different names are two favourites.
     */
    static _diceFavoriteElement(record) {
        const el = document.createElement('div');
        el.className = 'cpb-check-item';
        el.dataset.type = 'dice';
        el.dataset.value = record.formula;
        el.dataset.rollTitle = record.name;

        const icon = document.createElement('i');
        icon.className = getDiceIcon(record.plainFormula || record.formula);
        const label = document.createElement('span');
        label.className = 'cpb-roll-label';
        label.textContent = record.name;
        const description = document.createElement('span');
        description.className = 'cpb-roll-description';
        description.textContent = record.display || record.formula;

        el.appendChild(icon);
        el.appendChild(label);
        el.appendChild(description);
        return el;
    }

    /** Remember the current build. A roll already remembered under the same id is left alone. */
    _rememberDiceBuild(root) {
        const build = this._composeDiceBuild(root);
        if (!build) return;
        const record = {
            formula: build.formula,
            plainFormula: build.plainFormula,
            display: build.display,
            name: build.name
        };
        record.id = SkillCheckDialog._computeFavoriteId(SkillCheckDialog._diceFavoriteElement(record));

        const saved = this._savedDiceRolls();
        if (saved.some((entry) => entry.id === record.id)) {
            ui.notifications.info(`"${record.name}" is already remembered.`);
            return;
        }
        this._writeSavedDiceRolls([...saved, record]);
        this._renderSavedDiceSection(root);
    }

    /**
     * The remembered list.
     *
     * Rebuilt rather than patched, because the list is short and every path that
     * changes it -- remember, forget, favourite -- changes a different part of a row.
     * Hidden entirely when empty: a heading over nothing is worse than no heading.
     */
    _renderSavedDiceSection(root) {
        const section = root?.querySelector?.('.cpb-dice-saved');
        const list = root?.querySelector?.('.cpb-dice-saved-list');
        if (!section || !list) return;

        const saved = this._savedDiceRolls();
        section.hidden = saved.length === 0;
        list.innerHTML = '';
        if (!saved.length) return;

        const favoriteIds = new Set((this.userPreferences.requestRollFavorites || []).map((f) => f.id));

        for (const record of saved) {
            const row = document.createElement('div');
            row.className = 'cpb-dice-saved-row';
            row.dataset.savedId = record.id;

            // The row is a button: clicking a remembered roll loads it back into the
            // builder rather than firing it, because the point of remembering one is
            // usually to adjust it.
            const load = document.createElement('button');
            load.type = 'button';
            load.className = 'cpb-dice-saved-load';
            load.dataset.tooltip = 'Load this roll into the builder';

            const icon = document.createElement('i');
            icon.className = getDiceIcon(record.plainFormula || record.formula);
            const name = document.createElement('span');
            name.className = 'cpb-dice-saved-name';
            name.textContent = record.name;
            const formula = document.createElement('span');
            formula.className = 'cpb-dice-saved-formula';
            formula.textContent = record.display || record.formula;
            load.append(icon, name, formula);

            const isFavorite = favoriteIds.has(record.id);
            const heart = document.createElement('button');
            heart.type = 'button';
            heart.className = `cpb-dice-saved-heart${isFavorite ? ' cpb-favorite-is-active' : ''}`;
            heart.dataset.tooltip = isFavorite
                ? 'Remove from favorites'
                : 'Also show this roll in Favorites';
            heart.setAttribute('aria-label', heart.dataset.tooltip);
            heart.innerHTML = `<i class="${isFavorite ? 'fas' : 'far'} fa-heart"></i>`;

            const forget = document.createElement('button');
            forget.type = 'button';
            forget.className = 'cpb-dice-saved-forget';
            forget.dataset.tooltip = 'Forget this roll';
            forget.setAttribute('aria-label', 'Forget this roll');
            forget.innerHTML = '<i class="fas fa-trash"></i>';

            row.append(load, heart, forget);
            list.appendChild(row);
        }
    }

    /** Load a remembered roll back into the rows. */
    _loadSavedDiceRoll(root, id) {
        const record = this._savedDiceRolls().find((entry) => entry.id === id);
        if (!record) return;
        const parsed = SkillCheckDialog.parseDiceBuild(record.formula);
        if (!parsed) {
            // Says WHY, because the roll is not broken -- it is one the rows cannot
            // draw, and it still fires correctly from Favorites. Without the reason this
            // reads as a corrupt saved roll.
            ui.notifications.warn(`"${record.name}" uses a formula the builder's rows cannot show (${record.display || record.formula}). It still rolls from Favorites; the builder handles one flat modifier and no subtracted dice.`);
            return;
        }
        this._resetDiceBuild(root);
        this._applyDiceBuild(root, parsed, record.name === SkillCheckDialog.DICE_DEFAULT_TITLE ? '' : record.name);
        this._syncDiceBuilder(root);
    }

    /** Wire the steppers, the typed counts, the labels, the row click, remember, and reset. */
    _attachDiceBuilderListeners(html) {
        const root = html;
        const builder = root?.querySelector?.('.cpb-dice-builder');
        if (!builder) return;

        const isModifierRow = (row) => row.dataset.die === SkillCheckDialog.DICE_MODIFIER_ROW;
        // Only the modifier goes below zero. A negative count of dice is not a thing.
        const clamp = (row, n) => isModifierRow(row)
            ? Math.min(999, Math.max(-999, n))
            : Math.min(99, Math.max(0, n));

        const bump = (row, delta) => {
            const input = row.querySelector('.cpb-dice-count');
            if (!input) return;
            input.value = String(clamp(row, SkillCheckDialog._diceRowCount(row) + delta));
            this._syncDiceBuilder(root);
        };

        builder.querySelectorAll('.cpb-dice-row[data-die]').forEach((row) => {
            row.querySelectorAll('.cpb-dice-step').forEach((button) => {
                button.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    bump(row, Number(button.dataset.diceDelta) || 0);
                });
            });

            // Clicking the die itself is +1 -- what clicking a die used to do, kept so
            // the common case is still one click rather than a hunt for the stepper.
            const bumpButton = row.querySelector('.cpb-dice-bump');
            if (bumpButton) {
                bumpButton.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    bump(row, 1);
                });
            }

            const countInput = row.querySelector('.cpb-dice-count');
            if (countInput) {
                // On `change` rather than `input`: clamping mid-keystroke turns a typed
                // "12" into "1" the moment the first digit lands.
                countInput.addEventListener('change', () => {
                    countInput.value = String(clamp(row, Math.trunc(Number(countInput.value)) || 0));
                    this._syncDiceBuilder(root);
                });
            }

            const labelInput = row.querySelector('.cpb-dice-reason');
            if (labelInput) {
                // `input`, not `change`: the label changes nothing that needs clamping,
                // and the readout is the only way to see what you are typing.
                labelInput.addEventListener('input', () => this._syncDiceBuilder(root));
            }
        });

        // The name is not in the formula, so it does not need a resync -- but it IS the
        // request's title, and `_syncDiceBuilder` is where that gets written.
        const nameInput = root.querySelector('.cpb-dice-name');
        if (nameInput) nameInput.addEventListener('input', () => this._syncDiceBuilder(root));

        const remember = root.querySelector('.cpb-dice-remember');
        if (remember) {
            remember.addEventListener('click', (ev) => {
                ev.preventDefault();
                this._rememberDiceBuild(root);
            });
        }

        const reset = root.querySelector('.cpb-dice-reset');
        if (reset) {
            reset.addEventListener('click', (ev) => {
                ev.preventDefault();
                this._resetDiceBuild(root);
            });
        }

        // Delegated, because the saved list is rebuilt whenever it changes and
        // per-row listeners would have to be re-attached every time.
        const savedList = root.querySelector('.cpb-dice-saved-list');
        if (savedList) {
            savedList.addEventListener('click', (ev) => {
                const row = ev.target.closest('.cpb-dice-saved-row');
                if (!row) return;
                ev.preventDefault();
                ev.stopPropagation();
                const id = row.dataset.savedId;

                if (ev.target.closest('.cpb-dice-saved-forget')) {
                    this._writeSavedDiceRolls(this._savedDiceRolls().filter((entry) => entry.id !== id));
                    this._renderSavedDiceSection(root);
                    return;
                }
                if (ev.target.closest('.cpb-dice-saved-heart')) {
                    const record = this._savedDiceRolls().find((entry) => entry.id === id);
                    if (record) this._toggleFavorite(root, SkillCheckDialog._diceFavoriteElement(record));
                    this._renderSavedDiceSection(root);
                    return;
                }
                this._loadSavedDiceRoll(root, id);
            });
        }

        // An API caller passed a formula rather than a build; show it in the rows so
        // that nudging a stepper edits it instead of replacing it.
        if (this._pendingDiceBuild) {
            this._applyDiceBuild(root, this._pendingDiceBuild, this.apiRollTitle ?? '');
            this._pendingDiceBuild = null;
        }
        this._renderSavedDiceSection(root);
        this._syncDiceBuilder(root, { keepSelection: true });
    }

    /**
     * Apply roll type filter to show/hide sections (v13: native DOM)
     */
    _applyRollTypeFilter(html, filterType) {
        const htmlElement = html;
        if (!htmlElement || typeof htmlElement.querySelectorAll !== 'function') return;
        // Hide all sections first
        htmlElement.querySelectorAll('.cpb-check-section').forEach(section => {
            section.style.display = 'none';
        });
        
        // Show the section that matches the filter
        const targetSection = htmlElement.querySelector(`.cpb-check-section[data-filter="${filterType}"]`);
        if (targetSection) {
            targetSection.style.display = '';
        }
    }

    /**
     * Centralized skill check result processing for use by other modules.
     * @param {object} messageData - The chat message data (flags) for the skill check.
     * @param {string} tokenId - The token ID whose result is being updated.
     * @param {object} result - The roll result object to apply.
     * @returns {object} Updated messageData with the new result.
     */
    static processRollResult(messageData, tokenId, result) {
        // Update the actors array with the new result - match by token ID
        const actors = (messageData.actors || []).map(a => ({
            ...a,
            result: a.id === tokenId ? result : a.result
        }));
        return {
            ...messageData,
            actors
        };
    }

    /**
     * Invoke a pending onRollComplete callback registered by openRequestRollDialog({ onRollComplete }).
     * Called by _notifyRequestRollComplete when a roll result is delivered.
     * @param {string} messageId - Chat message ID
     * @param {object} payload - { message, messageData, tokenId, result, allComplete }
     */
    static _invokeRollCompleteCallback(messageId, payload) {
        const callback = SkillCheckDialog._pendingRollCallbacks.get(messageId);
        if (typeof callback !== 'function') return;
        try {
            callback(payload);
        } catch (err) {
            console.error('Blacksmith Request Roll API: onRollComplete callback error', err);
        }
        if (payload.allComplete) {
            SkillCheckDialog._pendingRollCallbacks.delete(messageId);
        }
    }

    /**
     * Notify local API callbacks and all hook subscribers about a request-roll completion.
     * @param {object} payload - { messageId, message, messageData, tokenId, result, allComplete, requesterId, rollerUserId }
     */
    static _notifyRequestRollComplete(payload) {
        if (!payload?.messageId) return;
        const normalizedPayload = {
            messageId: payload.messageId,
            message: payload.message ?? game.messages.get(payload.messageId) ?? null,
            messageData: payload.messageData ?? null,
            tokenId: payload.tokenId ?? null,
            result: payload.result ?? null,
            allComplete: !!payload.allComplete,
            requesterId: payload.requesterId ?? payload.messageData?.requesterId ?? null,
            rollerUserId: payload.rollerUserId ?? null
        };
        SkillCheckDialog._invokeRollCompleteCallback(payload.messageId, normalizedPayload);
        Hooks.callAll('blacksmith.requestRollComplete', normalizedPayload);
    }

    /**
     * The message payload for a skill check: baked content plus the flags that
     * carry both the card and the state behind it.
     *
     * Returns `{ content, flags }` rather than a string, because a parts card needs
     * its composition stored as well as rendered -- the composition is what each
     * client re-renders from, and it is the only thing that can show one message
     * differently to two readers. Callers spread it into `create` or `update`.
     *
     * @param {object} messageData - the skill check state (the module's own flags)
     * @returns {Promise<{content: string, flags: object}>}
     */
    static async formatChatMessage(messageData) {
        return skillCheckMessageData(messageData);
    }

    /**
     * Resolve API initialValue to CONFIG id (static version for createRequestRoll).
     */
    static _resolveRollTypeValueStatic(type, value) {
        if (!value || typeof value !== 'string') return value;
        const v = value.trim().toLowerCase();
        if (type === 'skill' && CONFIG.DND5E?.skills) {
            if (CONFIG.DND5E.skills[value]) return value;
            const entry = Object.entries(CONFIG.DND5E.skills).find(([id, data]) =>
                id.toLowerCase() === v || (data?.label && game.i18n.localize(data.label).toLowerCase() === v)
            );
            return entry ? entry[0] : value;
        }
        if (type === 'ability' && CONFIG.DND5E?.abilities) {
            if (CONFIG.DND5E.abilities[value]) return value;
            const entry = Object.entries(CONFIG.DND5E.abilities).find(([id, data]) =>
                id.toLowerCase() === v || (data?.label && game.i18n.localize(data.label).toLowerCase() === v)
            );
            return entry ? entry[0] : value;
        }
        if (type === 'save' && CONFIG.DND5E?.abilities) {
            if (value === 'death' || v === 'death') return 'death';
            if (CONFIG.DND5E.abilities[value]) return value;
            const entry = Object.entries(CONFIG.DND5E.abilities).find(([id, data]) =>
                id.toLowerCase() === v || (data?.label && game.i18n.localize(data.label).toLowerCase() === v)
            );
            return entry ? entry[0] : value;
        }
        return value;
    }

    /**
     * Get roll label for silent request roll (skill/ability/save only).
     */
    static _getRollLabelForType(rollType, rollValue, showExplanation = false) {
        let name, desc, link;
        switch (rollType) {
            case 'skill':
                const skillData = CONFIG.DND5E.skills?.[rollValue];
                name = skillData ? game.i18n.localize(skillData.label) : rollValue;
                desc = showExplanation && skillDescriptions?.[rollValue] ? skillDescriptions[rollValue] : null;
                link = showExplanation && skillData?.reference ? `@UUID[${skillData.reference}]{${name}}` : null;
                break;
            case 'ability':
                const abilityData = CONFIG.DND5E.abilities?.[rollValue];
                const abilityName = abilityData ? game.i18n.localize(abilityData.label) : rollValue;
                name = abilityName + ' Check';
                desc = showExplanation && abilityDescriptions?.[rollValue] ? abilityDescriptions[rollValue] : null;
                link = showExplanation && abilityData?.reference ? `@UUID[${abilityData.reference}]{${name}}` : null;
                break;
            case 'save':
                if (rollValue === 'death') {
                    name = 'Death Save';
                    desc = showExplanation ? (saveDescriptions?.death ?? null) : null;
                    link = null;
                } else {
                    const saveData = CONFIG.DND5E.abilities?.[rollValue];
                    const saveName = saveData ? game.i18n.localize(saveData.label) : rollValue;
                    name = saveName + ' Save';
                    desc = showExplanation && saveDescriptions?.[rollValue] ? saveDescriptions[rollValue] : null;
                    link = showExplanation && saveData?.reference ? `@UUID[${saveData.reference}]{${name}}` : null;
                }
                break;
            case 'dice':
                // Named for what it rolls, since a silent caller may not pass a title.
                // `createRequestRoll` falls back to DICE_DEFAULT_TITLE for the title
                // itself; this is the roll's NAME, which the contested band uses.
                name = SkillCheckDialog.diceFormulaDisplay(rollValue);
                desc = showExplanation
                    ? `This is a straightforward dice roll of ${name} -- exactly the formula shown, with no ability modifier or proficiency bonus added on top.`
                    : null;
                link = null;
                break;
            default:
                name = rollValue;
                desc = null;
                link = null;
        }
        return { name, desc, link };
    }

    /**
     * The Request a Roll menu: favourites, then the quick roll library by category.
     *
     * Lives here rather than in the dice tool's registration because it is entirely
     * about this window's data -- the favourites in `skillCheckPreferences` and the
     * library in `QuickRollsManager` -- and the dice tool should not have to know the
     * shape of either.
     *
     * @returns {Array<object>} menubar context menu items
     */
    static requestRollMenuItems() {
            // FAVOURITES, THEN THE LIBRARY BY CATEGORY, each as a flyout.
            //
            // The menu used to be a flat list of favourites and nothing else, so a
            // table's twenty-four quick rolls -- the things the QUICK tab is mostly
            // made of -- were reachable only by opening the window. A flat list of
            // twenty-four would be worse than the window; the categories the GM already
            // filed them under are the grouping, and they are the GM's own words.
            //
            // Categories keep their library order rather than being sorted. It is the
            // order shown in the tab, and re-sorting it here would make the two
            // disagree about a list somebody arranged.
            const prefs = game.settings.get(MODULE.ID, 'skillCheckPreferences') || {};
            const favs = Array.isArray(prefs.requestRollFavorites) ? prefs.requestRollFavorites : [];
            const items = [];

            if (favs.length) {
                items.push({
                    name: 'Favorites',
                    icon: 'fa-solid fa-heart',
                    description: `${favs.length} saved`,
                    submenu: favs.map((rec) => ({
                        name: String(rec.label || rec.rollTitle || 'Favorite').slice(0, 96),
                        // The film icon marks the ones that take over the screen -- the
                        // only warning before a click that does, since this menu fires
                        // without opening the window.
                        icon: rec.isCinematic ? 'fa-solid fa-film' : 'fa-solid fa-dice',
                        onClick: () => { SkillCheckDialog.executeFavoriteSilent(rec); }
                    }))
                });
            }

            for (const { category, rolls } of QuickRollsManager.byCategory()) {
                items.push({
                    name: category,
                    icon: 'fa-solid fa-folder',
                    description: `${rolls.length} roll${rolls.length === 1 ? '' : 's'}`,
                    submenu: rolls.map((roll) => ({
                        name: String(roll.label).slice(0, 96),
                        // The roll's OWN icon, so a row reads the same here as it does
                        // in the tab; the film icon still wins when it is cinematic,
                        // because that is the thing worth knowing before clicking.
                        icon: roll.isCinematic ? 'fa-solid fa-film' : (roll.icon || 'fa-solid fa-dice'),
                        description: roll.description || undefined,
                        onClick: () => SkillCheckDialog.runQuickRoll(roll.id)
                    }))
                });
            }

            if (!items.length) {
                return [{
                    name: 'No rolls yet',
                    icon: 'far fa-heart',
                    description: 'Open Request a Roll to build one',
                    onClick: () => new SkillCheckDialog().render(true)
                }];
            }
            return items;
    }

    /**
     * The contestants a quick roll names, without a window to read them from.
     *
     * This used to be impossible, which is why every quick roll fired from the menubar
     * opened the dialog, drove its DOM, and closed it again -- a window flashing open
     * and shut on the way to a chat card. The DOM was never the source of any of this:
     * the contestant list comes from the canvas and the party, the groups come from the
     * roll's own `targets`, and both are here.
     *
     * Returns null when the answer genuinely is not knowable without a person -- see
     * the contested case below -- and the caller opens the window instead.
     *
     * @param {object} roll - a normalized `QuickRollsManager` record
     * @returns {Array<object>|null} actors for `createRequestRoll`, or null
     */
    static resolveQuickRollActors(roll) {
        const placeables = canvas?.tokens?.placeables ?? [];
        const controlled = canvas?.tokens?.controlled ?? [];
        const asActor = (t, group) => ({ id: t.id, actorId: t.actor.id, name: t.name, group });

        // The party: every player character, tokened or not. The second half is what
        // makes a party roll work in theatre of the mind, and it is the same list the
        // window's own contestant column builds.
        const partyActors = () => {
            const actors = placeables
                .filter((t) => t.actor?.hasPlayerOwner && t.actor.type === 'character')
                .map((t) => asActor(t, 1));
            const seen = new Set(actors.map((a) => a.actorId));
            for (const actor of game.actors.filter((a) => a.type === 'character' && a.hasPlayerOwner)) {
                if (seen.has(actor.id)) continue;
                seen.add(actor.id);
                actors.push({ id: actor.id, actorId: actor.id, name: actor.name, group: 1 });
            }
            return actors;
        };

        if (roll.mode !== 'contested') {
            const actors = roll.targets === 'party'
                ? partyActors()
                : controlled.filter((t) => t.actor).map((t) => asActor(t, 1));
            return actors.length ? actors : null;
        }

        // A CONTEST NEEDS TWO SIDES, and only "whole party" says where the line falls:
        // the party challenge and whatever else is selected defends. With "selected
        // tokens" there is nothing to split them BY -- in the window a GM marks
        // defenders by right-clicking them, and that is a judgement, not data. So this
        // returns null and the window opens, which is the honest answer rather than a
        // guess about which half of a selection is the opposition.
        if (roll.targets !== 'party') return null;

        const challengers = partyActors();
        const defenders = controlled
            .filter((t) => t.actor && !t.actor.hasPlayerOwner)
            .map((t) => asActor(t, 2));
        return challengers.length && defenders.length ? [...challengers, ...defenders] : null;
    }

    /** A quick roll as options for {@link SkillCheckDialog.createRequestRoll}, or null if it needs the window. */
    static quickRollRequestOptions(roll) {
        const actors = SkillCheckDialog.resolveQuickRollActors(roll);
        if (!actors) return null;

        return {
            initialType: roll.challenger.type,
            initialValue: roll.challenger.value,
            ...(roll.mode === 'contested' && roll.defender?.value
                ? { defenderType: roll.defender.type, defenderValue: roll.defender.value }
                : {}),
            actors,
            // A contest carries no DC: `createRequestRoll` would keep one, and the
            // window has never sent one on a contested quick roll. Group success is
            // refused there too, so it is not passed either.
            ...(roll.mode === 'contested' ? {} : { groupRoll: roll.success === 'group' }),
            ...(roll.mode !== 'contested' && roll.dc ? { dc: roll.dc } : {}),
            isCinematic: !!roll.isCinematic,
            title: roll.rollTitle
        };
    }

    /**
     * Fire one quick roll by id, from outside the window.
     *
     * Silent when it can be. The window opens only when the roll genuinely needs a
     * person: a contest whose two sides cannot be told apart from the selection, or
     * nobody to roll at all. It used to open every time, flash, and close.
     *
     * @param {string} id - a `QuickRollsManager` roll id
     */
    static async runQuickRoll(id) {
        const roll = QuickRollsManager.get(id);
        if (!roll) {
            ui.notifications.warn('That quick roll is no longer in the library.');
            return null;
        }

        const options = SkillCheckDialog.quickRollRequestOptions(roll);
        if (!options) return new SkillCheckDialog({ pendingQuickRollId: id }).render(true);

        try {
            return await SkillCheckDialog._openRequestRollSilent(options);
        } catch (error) {
            // The window is the fallback for anything the silent path refuses -- a
            // roll that cannot post is still a roll the GM asked for, and dropping it
            // with a toast would be worse than handing them the window they used to get.
            postConsoleAndNotification(MODULE.NAME, `Quick Roll "${roll.label}" fell back to the window`, error, true, false);
            return new SkillCheckDialog({ pendingQuickRollId: id }).render(true);
        }
    }

    /**
     * Delegates to `game.modules.get(MODULE.ID).api.openRequestRollDialog({ silent: true, ...options })` (same public API as external callers).
     * Falls back to {@link SkillCheckDialog.createRequestRoll} only if the module API is unavailable (e.g. unusual load order).
     * @param {object} options - Roll options; any `silent` key is stripped so callers cannot disable silent mode.
     */
    static _openRequestRollSilent(options) {
        const api = game.modules.get(MODULE.ID)?.api;
        if (typeof api?.openRequestRollDialog === 'function') {
            const { silent: _s, ...rest } = options ?? {};
            return api.openRequestRollDialog({ silent: true, ...rest });
        }
        return SkillCheckDialog.createRequestRoll(options ?? {});
    }

    /**
     * Run a stored favorite without opening the dialog: maps the record to options and uses {@link SkillCheckDialog._openRequestRollSilent}
     * (module `openRequestRollDialog({ silent: true })`), including the no-actors fallback implemented in `blacksmith.js`.
     * Party quick rolls force initialFilter "party". Other quick rolls use the API default (selected tokens if any, else party).
     * Contested quick rolls and tool favorites open the full dialog (not expressible as a silent card).
     * @param {object} rec - Record from {@link SkillCheckDialog._favoriteRecordFromItem} or persisted user settings
     */
    static async executeFavoriteSilent(rec) {
        if (!rec) return null;
        try {
            return await SkillCheckDialog._executeFavoriteFromRecord(rec);
        } catch (e) {
            // Prefixed with WHICH favourite. A bare `e.message` arriving as a toast with
            // no subject reads as a module-wide failure rather than as one saved roll
            // that no longer works -- and the whole point of favourites is that you fire
            // them without looking.
            const name = rec.rollTitle || rec.label || 'That favorite';
            ui.notifications.error(`${name} could not be rolled: ${e?.message ?? String(e)}`);
            return null;
        }
    }

    /**
     * @param {object} rec
     */
    static async _executeFavoriteFromRecord(rec) {
        const type = rec.type;
        // Spread into every path below rather than set once at the end: each builds its
        // own options object, and a favourite that plays to chat because one branch
        // forgot the flag is a bug nobody reports -- it just quietly does the default.
        const cinematic = rec.isCinematic ? { isCinematic: true } : {};

        if (type === 'quick') {
            const rt = rec.rollType || '';
            if (rt === 'contested') {
                // A CONTEST CAN GO SILENT NOW, when the favourite says the party
                // challenge -- that is the one answer which says where the line between
                // the two sides falls. Saved against a selection, it still opens the
                // window, because splitting a selection into challengers and defenders
                // is a judgement rather than data.
                const contested = SkillCheckDialog.quickRollRequestOptions({
                    mode: 'contested',
                    targets: rec.targets === 'party' ? 'party' : 'selected',
                    challenger: { type: 'skill', value: rec.value },
                    defender: { type: rec.defenderType || 'skill', value: rec.defenderSkill },
                    isCinematic: !!rec.isCinematic,
                    rollTitle: rec.rollTitle || rec.label || 'Contested Roll'
                });
                if (contested) return SkillCheckDialog._openRequestRollSilent(contested);

                ui.notifications.info('Select the defenders for this contested roll.');
                new SkillCheckDialog({ pendingFavoriteRec: rec }).render(true);
                return { openedDialog: true };
            }

            const quickValueToSkillId = {
                perception: 'prc',
                insight: 'ins',
                investigation: 'inv',
                nature: 'nat',
                stealth: 'ste',
                athletics: 'ath',
                acrobatics: 'acr',
                deception: 'dec',
                persuasion: 'per',
                intimidation: 'itm'
            };
            const raw = String(rec.value ?? '').trim().toLowerCase();
            const skillValue = quickValueToSkillId[raw] || rec.value;

            if (!skillValue) {
                ui.notifications.warn(`"${rec.label || rec.rollTitle || 'That favorite'}" has no skill saved on it. Remove it and favorite the roll again.`);
                return null;
            }

            const groupRoll = rec.group === 'true';
            let dcOpt;
            if (rec.dc != null && String(rec.dc).trim() !== '') {
                const n = Number(rec.dc);
                if (!Number.isNaN(n)) dcOpt = String(n);
            }

            const opts = {
                initialType: 'skill',
                initialValue: skillValue,
                groupRoll,
                ...cinematic,
                ...(rec.rollTitle ? { title: rec.rollTitle } : {}),
                ...(dcOpt !== undefined ? { dc: dcOpt } : {})
            };
            if (rt === 'party') opts.initialFilter = 'party';

            return SkillCheckDialog._openRequestRollSilent(opts);
        }

        if (type === 'tool') {
            ui.notifications.info('Tool rolls open Request a Roll to choose proficiency.');
            new SkillCheckDialog({ pendingFavoriteRec: rec }).render(true);
            return { openedDialog: true };
        }

        if (type === 'skill' || type === 'ability' || type === 'save') {
            const opts = {
                initialType: type,
                initialValue: rec.value,
                ...cinematic,
                ...(rec.rollTitle ? { title: rec.rollTitle } : {})
            };
            if (rec.dc != null && String(rec.dc).trim() !== '') {
                const n = Number(rec.dc);
                if (!Number.isNaN(n)) opts.dc = String(n);
            }
            if (rec.group === 'true' || rec.group === 'false') opts.groupRoll = rec.group === 'true';

            return SkillCheckDialog._openRequestRollSilent(opts);
        }

        if (type === 'dice') {
            return SkillCheckDialog._openRequestRollSilent({
                initialType: 'dice',
                initialValue: rec.value,
                ...cinematic,
                ...(rec.rollTitle ? { title: rec.rollTitle } : {})
            });
        }

        // Names the type it did not recognise, and says what to do. A favourite reaches
        // this only if it was saved by a newer version or hand-edited in settings, and
        // neither is diagnosable from "Unknown favorite type."
        ui.notifications.warn(`This favorite is a "${type ?? 'blank'}" roll, which this version cannot run. Remove it, or update Blacksmith.`);
        return null;
    }

    /**
     * Create a roll request chat card without opening the dialog (silent mode).
     * @param {object} options - initialType, initialValue/initialSkill, initialFilter or actors, dc, title, groupRoll, showDC, showRollExplanation, explanation, isCinematic, rollMode, rollAdvantage, lockRollAdvantage, onRollComplete
     * Also emits Hooks event 'blacksmith.requestRollComplete' with { messageId, tokenId, result, allComplete, messageData, requesterId, rollerUserId }.
     * @returns {Promise<{ message: ChatMessage, messageId: string }>}
     */
    static async createRequestRoll(options = {}) {
        const rollType = options.initialType ?? (options.initialSkill ? 'skill' : 'skill');
        const rollValueRaw = options.initialValue ?? options.initialSkill ?? null;
        if (!rollValueRaw) throw new Error('Request Roll (silent): initialValue or initialSkill is required');
        const rollValue = SkillCheckDialog._resolveRollTypeValueStatic(rollType, rollValueRaw);

        let processedActors;
        if (options.actors && Array.isArray(options.actors) && options.actors.length > 0) {
            const placeables = canvas?.tokens?.placeables ?? [];
            processedActors = [];
            for (const a of options.actors) {
                const actorId = a.actorId ?? a.id;
                const name = a.name ?? game.actors.get(actorId)?.name ?? 'Unknown';
                const group = a.group ?? 1;
                const perActorBonus = a.situationalBonus ?? options.situationalBonus;
                const perActorMod = a.customModifier ?? options.customModifier;
                const perActorAdvantage = SkillCheckDialog.normalizeRollAdvantage(a.rollAdvantage);
                if (a.tokenId != null && a.actorId != null) {
                    processedActors.push({
                        id: a.tokenId ?? a.id,
                        actorId: a.actorId ?? actorId,
                        name: a.name ?? name,
                        group,
                        ...(perActorBonus != null && { situationalBonus: perActorBonus }),
                        ...(perActorMod != null && { customModifier: perActorMod }),
                        ...(perActorAdvantage != null && { rollAdvantage: perActorAdvantage })
                    });
                } else {
                    const tokensForActor = placeables.filter(t => t.actor?.id === actorId);
                    for (const t of tokensForActor) {
                        processedActors.push({
                            id: t.id,
                            actorId: t.actor.id,
                            name: t.name,
                            group,
                            ...(perActorBonus != null && { situationalBonus: perActorBonus }),
                            ...(perActorMod != null && { customModifier: perActorMod }),
                            ...(perActorAdvantage != null && { rollAdvantage: perActorAdvantage })
                        });
                    }
                    if (tokensForActor.length === 0) {
                        processedActors.push({
                            id: actorId,
                            actorId: actorId,
                            name,
                            group,
                            ...(perActorBonus != null && { situationalBonus: perActorBonus }),
                            ...(perActorMod != null && { customModifier: perActorMod }),
                            ...(perActorAdvantage != null && { rollAdvantage: perActorAdvantage })
                        });
                    }
                }
            }
            processedActors = processedActors.filter(a => a.id && a.actorId);
        } else {
            const placeables = canvas?.tokens?.placeables ?? [];
            const controlled = canvas?.tokens?.controlled ?? [];
            const filter = options.initialFilter ?? (controlled.length > 0 ? 'selected' : 'party');
            if (filter === 'selected') {
                processedActors = controlled.map(t => ({
                    id: t.id,
                    actorId: t.actor?.id,
                    name: t.name,
                    group: 1
                })).filter(a => a.actorId);
            } else {
                processedActors = placeables
                    .filter(t => t.actor && t.actor.type === 'character' && t.actor.hasPlayerOwner)
                    .map(t => ({ id: t.id, actorId: t.actor.id, name: t.name, group: 1 }));
                if (processedActors.length === 0) {
                    processedActors = placeables
                        .filter(t => t.actor && t.actor.hasPlayerOwner)
                        .map(t => ({ id: t.id, actorId: t.actor.id, name: t.name, group: 1 }));
                }
                const seenActorIds = new Set(processedActors.map(a => a.actorId));
                for (const act of game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner)) {
                    if (seenActorIds.has(act.id)) continue;
                    seenActorIds.add(act.id);
                    processedActors.push({ id: act.id, actorId: act.id, name: act.name, group: 1 });
                }
            }
            if (options.situationalBonus != null || options.customModifier != null) {
                processedActors.forEach(pa => {
                    if (options.situationalBonus != null) pa.situationalBonus = options.situationalBonus;
                    if (options.customModifier != null) pa.customModifier = options.customModifier;
                });
            }
        }
        if (!processedActors.length) {
            throw new Error('Request Roll (silent): no actors found. Set initialFilter ("party"|"selected") or pass actors array.');
        }

        const dc = options.dc != null ? String(options.dc) : null;
        const groupRoll = options.hasOwnProperty('groupRoll') ? !!options.groupRoll : (processedActors.length > 1);
        const showDC = options.hasOwnProperty('showDC') ? !!options.showDC : true;
        const showRollExplanation = options.hasOwnProperty('showRollExplanation') ? !!options.showRollExplanation : false;
        const isCinematic = options.hasOwnProperty('isCinematic') ? !!options.isCinematic : false;
        const rollMode = options.rollMode ?? 'roll';
        const title = (options.title != null && options.title !== '') ? options.title : null;

        // A CONTEST, WITHOUT THE WINDOW.
        //
        // This path could not express one: `hasMultipleGroups` was hardcoded false and
        // the three defender fields were hardcoded null, so every contested request had
        // to open the dialog and drive it through the DOM -- which is why a contested
        // favourite flashed a window open and shut.
        //
        // Contested is decided by the ACTORS, not by an option. Two groups among them is
        // what a contest IS, and a caller who says `defenderValue` while handing over one
        // group has described a roll with nobody to make it.
        const hasChallengers = processedActors.some((a) => a.group === 1);
        const hasDefenders = processedActors.some((a) => a.group === 2);
        const isContested = hasChallengers && hasDefenders;

        const defenderType = options.defenderType ?? rollType;
        const defenderValueRaw = options.defenderValue ?? null;
        const defenderValue = defenderValueRaw
            ? SkillCheckDialog._resolveRollTypeValueStatic(defenderType, defenderValueRaw)
            : null;
        // Both sides roll the same thing unless the caller says otherwise -- the same
        // rule the window follows when only one side has a roll chosen.
        const defenderLabel = isContested
            ? SkillCheckDialog._getRollLabelForType(defenderType, defenderValue ?? rollValue, showRollExplanation)
            : null;

        const rollLabel = SkillCheckDialog._getRollLabelForType(rollType, rollValue, showRollExplanation);
        const messageData = {
            skillName: rollLabel.name,
            // An untitled dice request is "Custom Dice Roll" rather than its own formula:
            // the formula is carried separately and shown in its own right, so a title
            // repeating it says the same thing twice and names nothing.
            rollTitle: title ?? (rollType === 'dice' ? SkillCheckDialog.DICE_DEFAULT_TITLE : rollLabel.name),
            defenderSkillName: isContested ? defenderLabel.name : null,
            skillAbbr: rollValue,
            rollFormula: rollType === 'dice' ? SkillCheckDialog.diceFormulaDisplay(rollValue) : null,
            defenderSkillAbbr: isContested ? (defenderValue ?? rollValue) : null,
            actors: processedActors,
            requesterId: game.user.id,
            currentUserId: game.user.id,
            type: 'skillCheck',
            dc: dc,
            showDC: showDC,
            // A contest has no group success to speak of: the comparison IS the
            // outcome, and the two calculations are independent blocks that would both
            // run and put two verdicts in one message.
            isGroupRoll: isContested ? false : groupRoll,
            skillDescription: rollLabel.desc,
            defenderSkillDescription: isContested ? defenderLabel.desc : null,
            skillLink: rollLabel.link,
            defenderSkillLink: isContested ? defenderLabel.link : null,
            rollMode,
            rollType,
            defenderRollType: isContested ? defenderType : null,
            hasMultipleGroups: isContested,
            showRollExplanation: showRollExplanation,
            isCinematic: isCinematic,
            isGM: game.user.isGM
        };
        if (options.situationalBonus != null) messageData.situationalBonus = options.situationalBonus;
        if (options.customModifier != null) messageData.customModifier = options.customModifier;
        const requestedAdvantage = SkillCheckDialog.normalizeRollAdvantage(options.rollAdvantage);
        if (requestedAdvantage != null) {
            messageData.rollAdvantage = requestedAdvantage;
            messageData.lockRollAdvantage = !!options.lockRollAdvantage;
            messageData.rollAdvantageLabel = SkillCheckDialog.rollAdvantageLabel(requestedAdvantage);
        }
        if (options.explanation != null && options.explanation !== '') {
            messageData.explanation = String(options.explanation);
        }

        // See the note at the other create site: the roll mode selects who may read
        // a total, not who receives the message.
        const message = await ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            ...(await SkillCheckDialog.formatChatMessage(messageData)),
            style: CONST.CHAT_MESSAGE_STYLES.OTHER
        });

        if (typeof options.onRollComplete === 'function') {
            SkillCheckDialog._registerRollCompleteCallback(message.id, options.onRollComplete);
        }

        const postedSound = await resolveRequestRollSound('SOUNDREQUESTROLLPOSTED');
        if (postedSound) playSound(postedSound, COFFEEPUB.SOUNDVOLUMENORMAL);
        SkillCheckDialog._scrollChatToBottom();

        if (isCinematic) {
            SkillCheckDialog._showCinematicDisplay(messageData, message.id);
            const socket = SocketManager.getSocket();
            if (socket) {
                await socket.executeForOthers("showCinematicOverlay", {
                    type: "showCinematicOverlay",
                    messageId: message.id,
                    messageData: messageData
                });
            }
        }

        return { message, messageId: message.id };
    }

    /**
     * Shows a cinematic display for the skill check.
     * @param {object} messageData - The chat message data (flags) for the skill check.
     * @param {string} messageId - The ID of the chat message.
     */
    static async _showCinematicDisplay(messageData, messageId) {
        
        const soundPath = await resolveRequestRollSound('SOUNDCINEMATICOPEN');
        const volume = COFFEEPUB.SOUNDVOLUMENORMAL;
        
        if (soundPath) playSound(soundPath, volume);
        // Remove any existing overlay (v13: native DOM)
        const existingOverlay = document.getElementById('cpb-cinematic-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        const createActorCardHtml = (actor) => {
            const token = canvas.tokens.get(actor.id) || canvas.tokens.placeables.find(t => t.actor?.id === actor.actorId);
            const actorDocument = token?.actor || game.actors.get(actor.actorId);
            const actorImg = actorDocument?.img || 'icons/svg/mystery-man.svg';
            const actorName = actor.name;
            const result = actor.result;

            // Always check ownership on the base actor. An unlinked token's synthetic actor
            // evaluates token-document ownership, not base-actor ownership — causing a false
            // negative (hourglass) for players who own the base actor but not the token doc.
            const baseActor = game.actors.get(actor.actorId) ?? actorDocument;
            const hasPermission = game.user.isGM || baseActor?.isOwner;

            let rollAreaHtml;
            if (hasPermission && !result) {
                // Requested advantage mode for this row: marked, and the only button rendered when locked
                const requested = SkillCheckDialog.resolveRollAdvantage(actor, messageData);
                const show = (mode) => !requested.locked || requested.mode === mode;
                const mark = (mode) => requested.mode === mode ? ' is-requested' : '';
                const suffix = (mode) => requested.mode === mode
                    ? (requested.locked ? ' (required)' : ' (requested)')
                    : '';
                const buttons = [
                    show('disadvantage') ? `
                        <button class="cpb-cinematic-roll-mod-btn disadvantage${mark('disadvantage')}" data-roll-type="disadvantage" title="Roll with Disadvantage${suffix('disadvantage')}">
                            <i class="fas fa-minus"></i>
                        </button>` : '',
                    show('normal') ? `
                        <button class="cpb-cinematic-roll-btn${mark('normal')}" data-roll-type="normal" title="Roll Normal${suffix('normal')}">
                            <i class="fas fa-dice-d20"></i>
                        </button>` : '',
                    show('advantage') ? `
                        <button class="cpb-cinematic-roll-mod-btn advantage${mark('advantage')}" data-roll-type="advantage" title="Roll with Advantage${suffix('advantage')}">
                            <i class="fas fa-plus"></i>
                        </button>` : ''
                ].join('');
                rollAreaHtml = `
                    <div class="cpb-cinematic-roll-area">
                        ${buttons}
                    </div>
                `;
            } else if (!hasPermission && !result) {
                rollAreaHtml = `
                    <div class="cpb-cinematic-roll-area">
                        <div class="cpb-cinematic-wait-icon">
                            <i class="fas fa-hourglass-half"></i>
                        </div>
                    </div>
                `;
            }

            if (result) {
                const successClass = result.total >= messageData.dc ? 'success' : 'failure';
                rollAreaHtml = `<div class="cpb-cinematic-roll-area"><div class="cpb-cinematic-roll-result ${successClass}">${result.total}</div></div>`;
            }

            return `
                <div class="cpb-cinematic-card" data-fs-stage="items" data-token-id="${actor.id}">
                    <img src="${actorImg}" alt="${actorName}">
                    <div class="cpb-cinematic-actor-name">${actorName}</div>
                    ${rollAreaHtml}
                </div>
            `;
        };

        let actorCardsHtml;
        if (messageData.hasMultipleGroups) {
            const challengers = messageData.actors.filter(a => a.group === 1);
            const defenders = messageData.actors.filter(a => a.group === 2);

            const challengerCards = challengers.map(createActorCardHtml).join('');
            const defenderCards = defenders.map(createActorCardHtml).join('');

            // The side modifiers carry which way each group packs: the challengers fill
            // toward the divider from the left, the defenders from the right, so the two
            // sides meet at the VS however lopsided the contest is. Named classes rather
            // than :first-child / :last-child, because the ordering that would rely on is
            // an accident of this template and nothing would fail loudly if it changed.
            //
            // `data-fs-from` tells the fullscreen base the same thing in ITS vocabulary:
            // which edge these items travel in from, and -- because the base numbers items
            // within their from-group -- that the two sides arrive in step rather than one
            // after the other. Blacksmith's class names mean nothing to the base, and a
            // shop or a quest log gets directional entrances from the same attribute.
            actorCardsHtml = `
                <div class="cpb-cinematic-actor-group cpb-cinematic-actor-group-challengers" data-fs-from="left">
                    <div class="cpb-cinematic-card-grid">${challengerCards}</div>
                </div>
                <div class="cpb-cinematic-vs-divider" data-fs-stage="content"><span class="cpb-cinematic-vs-flame">VS</span></div>
                <div class="cpb-cinematic-actor-group cpb-cinematic-actor-group-defenders" data-fs-from="right">
                    <div class="cpb-cinematic-card-grid">${defenderCards}</div>
                </div>
            `;
        } else {
            actorCardsHtml = messageData.actors.map(createActorCardHtml).join('');
        }
        // The banner and the entrance are both this roll type's, chosen from one decision.
        const themeSuffix = cinematicThemeSuffix(messageData);
        const backgroundImage = await resolveRequestRollCinematicBanner(`BACK${themeSuffix}`);


        // Title and details are PLATES, straddling the band's top and bottom edges rather
        // than stacking inside it. The band then carries only the cards and the VS, which
        // is what stops a contested roll competing with its own heading for the same
        // vertical space.
        //
        // Each plate sits in a positioning SLOT. The slot owns the placement transform and
        // the plate owns appearance -- because the plate is the `content` stage's animation
        // target, and a stage animates `transform`. Centre the plate with a transform of
        // its own and the entrance keyframes overwrite it, dropping the plate off-centre
        // the moment the animation ends. Two transforms on one element never compose.
        const rollTitle = messageData.rollTitle || messageData.skillName;

        const subtitleParts = [];

        // Contested roll info (skill vs skill)
        if (messageData.hasMultipleGroups) {
            subtitleParts.push(`${messageData.skillName} vs ${messageData.defenderSkillName}`);
        }

        // The dice formula, beside the DC. A dice request's title is the GM's name for
        // it, so without this the plate names a roll and never says what it rolls.
        if (messageData.rollFormula) {
            subtitleParts.push(foundry.utils.escapeHTML(String(messageData.rollFormula)));
        }

        // DC info
        if (messageData.showDC && messageData.dc) {
            subtitleParts.push(`DC ${messageData.dc}`);
        }

        // Group roll info
        if (messageData.isGroupRoll && !messageData.hasMultipleGroups) {
            subtitleParts.push(`Group Roll`);
        }

        // Requested advantage mode (request-level; per-actor modes are marked on their own cards)
        const requestedMode = SkillCheckDialog.normalizeRollAdvantage(messageData.rollAdvantage);
        if (requestedMode) {
            const label = SkillCheckDialog.rollAdvantageLabel(requestedMode);
            subtitleParts.push(messageData.lockRollAdvantage ? `${label} (required)` : `${label} (requested)`);
        }

        const titlePlateHtml = rollTitle
            ? `<div class="cpb-cinematic-plate-slot cpb-cinematic-plate-slot-title">
                   <div class="cpb-cinematic-plate cpb-cinematic-plate-title" data-fs-stage="content" style="background-image: url('${backgroundImage}');"><span class="cpb-cinematic-plate-text">${rollTitle}</span></div>
               </div>`
            : '';

        const detailLine = subtitleParts.join(' • ');
        const explanation = messageData.explanation
            ? `<span class="cpb-cinematic-plate-explanation">${foundry.utils.escapeHTML(String(messageData.explanation))}</span>`
            : '';
        const detailPlateHtml = (detailLine || explanation)
            ? `<div class="cpb-cinematic-plate-slot cpb-cinematic-plate-slot-detail">
                   <div class="cpb-cinematic-plate cpb-cinematic-plate-detail" data-fs-stage="content" style="background-image: url('${backgroundImage}');">
                       ${detailLine ? `<span class="cpb-cinematic-plate-detail-line">${detailLine}</span>` : ''}
                       ${explanation}
                   </div>
               </div>`
            : '';

        const containerClass = `cpb-cinematic-actors-container ${messageData.hasMultipleGroups ? 'contested' : ''}`;
        const bodyContent = `
            <div id="cpb-cinematic-bar" style="background-image: url('${backgroundImage}');">
                ${titlePlateHtml}
                <div class="${containerClass}">
                    ${actorCardsHtml}
                </div>
                ${detailPlateHtml}
            </div>
        `;

        // The shell comes from the fullscreen base: cover, backdrop, stacking, Escape, close
        // button, and the guarantee that a second cinematic replaces this one rather than
        // burying it. `overlay` below is the application element, which keeps the historical
        // id, so every selector manager-rolls.js uses against it still resolves.
        const app = await CinematicOverlay.create({ bodyContent }, themeSuffix);
        await app.render(true);
        const overlay = app.element;
        if (!overlay) return;

        // Attach click handlers to the new roll buttons (v13: native DOM)
        const rollButtons = overlay.querySelectorAll('.cpb-cinematic-roll-btn, .cpb-cinematic-roll-mod-btn');
        rollButtons.forEach(btn => {
            btn.addEventListener('click', async (event) => {
            const button = event.currentTarget;
            if (!(button instanceof HTMLElement)) return;
            postConsoleAndNotification(MODULE.NAME, `Cinema mode: Dice button clicked`, { eventTarget: event.target }, true, false);
            const diceSound = await resolveRequestRollSound('SOUNDDICEROLL');
            if (diceSound) playSound(diceSound, COFFEEPUB.SOUNDVOLUMENORMAL);
            const card = button.closest('.cpb-cinematic-card');
            if (!card) return;
            const tokenId = card.dataset.tokenId;
            const actorData = messageData.actors.find(a => a.id === tokenId);
            if (!actorData) return;
            
            const rollButtonType = button.dataset.rollType;

            // A locked request renders only the required button; this is the backstop for a click
            // that reaches the handler anyway (stale overlay, a modified DOM).
            const requested = SkillCheckDialog.resolveRollAdvantage(actorData, messageData);
            if (requested.locked && rollButtonType !== requested.mode) {
                ui.notifications.warn(`This roll was requested with ${requested.mode === 'normal' ? 'no advantage or disadvantage' : requested.mode}.`);
                return;
            }

            const options = {
                advantage: rollButtonType === 'advantage',
                disadvantage: rollButtonType === 'disadvantage',
                fastForward: true,
                rollMode: messageData.rollMode || 'roll'
            };
            if (actorData.situationalBonus != null) options.situationalBonus = actorData.situationalBonus;
            else if (messageData.situationalBonus != null) options.situationalBonus = messageData.situationalBonus;
            if (actorData.customModifier != null) options.customModifier = actorData.customModifier;
            else if (messageData.customModifier != null) options.customModifier = messageData.customModifier;

            // Determine which roll type to use (challenger or defender)
            const isDefender = actorData.group === 2 && messageData.hasMultipleGroups;
            const type = isDefender ? messageData.defenderRollType : messageData.rollType;
            let value;

            if (type === 'tool') {
                value = actorData.toolId;
            } else {
                value = isDefender ? messageData.defenderSkillAbbr : messageData.skillAbbr;
            }

            // Visually disable the card's roll area after a choice is made (v13: native DOM)
            const rollArea = card.querySelector('.cpb-cinematic-roll-area');
            if (rollArea) {
                rollArea.innerHTML = '<div class="cpb-cinematic-wait-icon"><i class="fas fa-dice-d20"></i></div>';
            }

            const chatMessage = game.messages.get(messageId);
            if (chatMessage) {
                // Execute the roll directly using the new 4-function system
                const { processRoll, deliverRollResults } = await import('./manager-rolls.js');
                const { postConsoleAndNotification } = await import('./api-core.js');
                const { MODULE } = await import('./const.js');
                
                // Prepare roll data for execution
                const actor = game.actors.get(actorData.actorId);
                if (!actor) {
                    postConsoleAndNotification(MODULE.NAME, `Cinema mode: Actor not found for ID ${actorData.actorId}`, null, true, false);
                    return;
                }
                
                // Prepare roll data
                const rollData = {
                    actor: actor,
                    rollTypeKey: type,
                    rollValueKey: value,
                    messageId: messageId,
                    tokenId: tokenId,
                    actorId: actorData.actorId,
                    mode: 'cinema',
                    cinemaMode: true
                };
                
                // Execute the roll directly (SAME as window mode)
                postConsoleAndNotification(MODULE.NAME, `Cinema mode: About to call processRoll`, { rollData, options }, true, false);
                
                // Execute the roll
                const rollResults = await processRoll(rollData, options);
                postConsoleAndNotification(MODULE.NAME, `Cinema mode: processRoll completed`, { rollResults }, true, false);
                
                // Deliver the results
                await deliverRollResults(rollResults, { messageId, tokenId });
            }
            });
        });
    }

    // OLD SYSTEM DELETED - Cinema updates now handled by new system in manager-rolls.js

    /**
     * Hides the cinematic display.
     */
    static async _hideCinematicDisplay() {
        const app = foundry.applications.instances.get('cpb-cinematic-overlay');
        if (!app) return;

        if (game.user.isGM) {
            const socket = SocketManager.getSocket();
            if (socket) {
                await socket.executeForOthers("closeCinematicOverlay", {
                    type: "closeCinematicOverlay"  // Add type property
                });
            }
        }
        await app.close();
    }

    /**
     * Close the cinematic surface on this client only.
     *
     * Separate from `_hideCinematicDisplay` because that one broadcasts. Every client runs
     * `updateCinemaOverlay` and reaches the end of the sequence on its own, so a broadcast
     * there would be one close message per connected user for a decision each had already
     * made independently.
     */
    static async _closeCinematicDisplay() {
        const app = foundry.applications.instances.get('cpb-cinematic-overlay');
        if (app) await app.close();
    }



    /**
     * A player (or the GM) clicked a pending row to roll for that actor.
     *
     * Registered against `SKILL_CHECK_ROLL_ACTION` and reached through the card
     * system's one delegated dispatcher, rather than by this class attaching its own
     * listeners on every chat render. That matters beyond tidiness: the card is
     * rebuilt after every roll, so hand-attached listeners had to be re-attached
     * each time and a missed re-attach left a dead button.
     *
     * @param {object} context - `{ message, value }` from the dispatcher. `value` is
     *   the JSON the composition packed into the row, since a data attribute is the
     *   only thing that survives being stored on a message and re-rendered.
     */
    static async handleRollAction({ message, value } = {}) {
        let request;
        try {
            request = JSON.parse(value ?? '{}');
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Skill Check | unreadable roll request on card', String(value), false, false);
            return;
        }

        const { tokenId, actorId, type = 'skill', value: rollValue, title } = request;
        const flags = message?.flags?.[MODULE.ID];
        if (!flags?.actors) return;

        const actorData = flags.actors.find((a) => a.actorId === actorId && a.id === tokenId);
        if (!actorData) {
            ui.notifications.error(`Could not find actor data for ID ${actorId} and token ID ${tokenId} in the chat message.`);
            return;
        }

        // The card is public -- it has to be, since it carries everyone's buttons --
        // so the check that you may roll for this character lives here rather than in
        // what gets rendered.
        const actor = game.actors.get(actorId);
        if (!game.user.isGM && !actor?.isOwner) {
            ui.notifications.warn("You don't have permission to roll for this character.");
            return;
        }

        const requested = SkillCheckDialog.resolveRollAdvantage(actorData, flags);

        const { orchestrateRoll } = await import('./manager-rolls.js');
        await orchestrateRoll({
            actors: [{ actorId, tokenId, name: actorData.name }],
            challengerRollType: type,
            challengerRollValue: rollValue,
            challengerRollTitle: title,
            defenderRollType: flags.defenderRollType || null,
            defenderRollValue: flags.defenderRollValue || null,
            dc: flags.dc || null,
            showDC: flags.showDC || false,
            groupRoll: flags.isGroupRoll || false,
            rollMode: flags.rollMode || 'roll',
            situationalBonus: actorData.situationalBonus ?? flags.situationalBonus,
            customModifier: actorData.customModifier ?? flags.customModifier,
            rollAdvantage: requested.mode,
            lockRollAdvantage: requested.locked,
            isCinematic: false,
            showRollExplanation: false
        }, message.id); // existing messageId, so the roll updates this card rather than posting a second
    }

    /**
     * Scroll the Foundry chat log to the bottom
     */
    static _scrollChatToBottom() {
        try {
            // Find the chat log container
            const chatLog = document.querySelector('#chat-log');
            if (chatLog) {
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `_scrollChatToBottom error:`, error, true, false);
        }
    }


}

// Seed the built-in quick rolls, and nothing else.
//
// THE REQUEST A ROLL MENUBAR TOOL IS GONE. It and the Dice Tray were two entries a
// pixel apart doing the same job -- "I want to roll something" -- and between them they
// had one context menu, one left-click each, and no relationship. The dice tool is now
// the single entry for rolling, and it owns this menu; see `registerDiceTray`.
Hooks.once('ready', () => {
    // Fire and forget: a world with a library already, or a GM who cleared it, is left
    // alone by the manager, and a failure here must not take anything else with it --
    // the window still opens on an empty QUICK tab with an Add button in it.
    QuickRollsManager.seedIfNeeded().catch((error) => {
        postConsoleAndNotification(MODULE.NAME, 'Quick Rolls: seeding failed', error, false, false);
    });
});
