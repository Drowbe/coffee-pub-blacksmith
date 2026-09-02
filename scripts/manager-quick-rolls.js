// ==================================================================
// ===== QUICK ROLLS (manager-quick-rolls.js) =======================
// ==================================================================
//
// The Request a Roll window's QUICK tab: a library of prepared requests the GM
// can fire in one click.
//
// These were twenty-four rows of hand-written markup in `window-skillcheck.hbs`.
// That meant a GM could not add one, could not change one, and could not remove
// one -- the list was whatever shipped, and a table wanting "Athletics vs
// Acrobatics, DC 12, cinematic" had to build it by hand every time. They are now
// DATA, seeded from that same twenty-four so nothing is lost, and every one of
// them is editable and removable.
//
// WORLD-SCOPED, not per-user. This is the table's roll library rather than one
// person's preferences: a second GM opening the window sees the same list, and
// the rolls travel with the world. Favourites stay per-user (`skillCheckPreferences`)
// because a favourite is a personal shortcut to a shared thing.
//
// SEEDED ONCE, THEN LEFT ALONE. A separate flag records that the defaults have
// been planted, so a GM who deletes all twenty-four does not find them back next
// launch. That is also what makes "which ones ship as defaults" a decision that
// can change later without stepping on anything a table has built.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';

const SETTING = 'requestRollQuickRolls';
const SEEDED_SETTING = 'requestRollQuickRollsSeeded';

export class QuickRollsManager {
    /**
     * The roll types a quick roll may use.
     *
     * Skill, ability and save -- the three where a roll is fully described by a
     * type and a CONFIG id. Tools are per-actor (a tool roll has to know which
     * actors own the tool) and dice are a whole formula, so neither collapses to
     * the two fields a quick roll stores.
     */
    static ROLL_TYPES = [
        { key: 'skill', label: 'Skill' },
        { key: 'ability', label: 'Ability Check' },
        { key: 'save', label: 'Saving Throw' }
    ];

    /** The default icon for a roll with nothing better, and the fallback for a record missing one. */
    static DEFAULT_ICON = 'fas fa-dice-d20';

    // ===== SHAPE ==================================================

    /**
     * A quick roll, with every field defaulted.
     *
     * Run over every record on read rather than trusted from storage: these are
     * hand-editable world settings, they outlive the shape that wrote them, and a
     * missing field must render as a sane row rather than as `undefined` in a label.
     */
    static normalize(raw = {}) {
        const contested = raw.mode === 'contested';
        return {
            id: String(raw.id ?? QuickRollsManager.newId()),
            category: String(raw.category ?? 'Quick Rolls').trim() || 'Quick Rolls',
            label: String(raw.label ?? 'Untitled Roll').trim() || 'Untitled Roll',
            description: String(raw.description ?? '').trim(),
            icon: String(raw.icon ?? '').trim() || QuickRollsManager.DEFAULT_ICON,
            mode: contested ? 'contested' : 'normal',
            // Who rolls. Only meaningful when the roll is not contested -- a contest
            // needs two named sides, so it uses whoever is selected on both.
            targets: raw.targets === 'party' ? 'party' : 'selected',
            // Whether the party passes together or each on their own. Contested rolls
            // have no group success to speak of: the comparison IS the outcome.
            success: raw.success === 'group' ? 'group' : 'individual',
            challenger: QuickRollsManager._normalizeSide(raw.challenger, 'skill'),
            defender: contested ? QuickRollsManager._normalizeSide(raw.defender, 'skill') : null,
            // A DC is optional and stays a STRING: it reaches an input and a flag, and
            // `''` and `0` are different answers that a number type cannot tell apart.
            dc: raw.dc == null || String(raw.dc).trim() === '' ? null : String(raw.dc).trim(),
            isCinematic: !!raw.isCinematic,
            rollTitle: String(raw.rollTitle ?? '').trim() || String(raw.label ?? '').trim() || 'Quick Roll'
        };
    }

    static _normalizeSide(side, fallbackType) {
        const type = QuickRollsManager.ROLL_TYPES.some((t) => t.key === side?.type) ? side.type : fallbackType;
        return { type, value: String(side?.value ?? '').trim() };
    }

    /** Ids are opaque and only have to be unique within the library. */
    static newId() {
        return `qr-${foundry.utils.randomID(10)}`;
    }

    // ===== STORAGE ================================================

    /**
     * The library, normalized.
     *
     * Seeds the defaults on the first read that finds nothing AND finds the seed
     * flag unset. Both conditions matter: an empty list with the flag SET is a GM
     * who cleared the library on purpose, and refilling it would be the module
     * arguing with them.
     */
    static all() {
        const stored = getSettingSafely(MODULE.ID, SETTING, null);
        if (Array.isArray(stored) && stored.length) return stored.map(QuickRollsManager.normalize);

        const seeded = getSettingSafely(MODULE.ID, SEEDED_SETTING, false);
        if (seeded) return [];
        return QuickRollsManager.DEFAULTS.map(QuickRollsManager.normalize);
    }

    /** Seed the world's library from the defaults, once. Safe to call on every ready. */
    static async seedIfNeeded() {
        if (!game.user?.isGM) return;
        if (getSettingSafely(MODULE.ID, SEEDED_SETTING, false)) return;
        const stored = getSettingSafely(MODULE.ID, SETTING, null);
        if (Array.isArray(stored) && stored.length) {
            await game.settings.set(MODULE.ID, SEEDED_SETTING, true);
            return;
        }
        await game.settings.set(MODULE.ID, SETTING, QuickRollsManager.DEFAULTS.map(QuickRollsManager.normalize));
        await game.settings.set(MODULE.ID, SEEDED_SETTING, true);
        postConsoleAndNotification(MODULE.NAME, 'Quick Rolls: seeded the world library with the built-in rolls.', QuickRollsManager.DEFAULTS.length, true, false);
    }

    static async _write(list) {
        await game.settings.set(MODULE.ID, SETTING, list.map(QuickRollsManager.normalize));
        // Writing anything means the library is the GM's now, so the defaults must
        // never be planted over the top of it later.
        if (!getSettingSafely(MODULE.ID, SEEDED_SETTING, false)) {
            await game.settings.set(MODULE.ID, SEEDED_SETTING, true);
        }
    }

    static get(id) {
        return QuickRollsManager.all().find((roll) => roll.id === id) ?? null;
    }

    /** Add a roll, or replace the one sharing its id. Returns the stored record. */
    static async save(record) {
        const normalized = QuickRollsManager.normalize(record);
        const list = QuickRollsManager.all();
        const index = list.findIndex((roll) => roll.id === normalized.id);
        if (index >= 0) list[index] = normalized;
        else list.push(normalized);
        await QuickRollsManager._write(list);
        return normalized;
    }

    static async remove(id) {
        await QuickRollsManager._write(QuickRollsManager.all().filter((roll) => roll.id !== id));
    }

    /**
     * The library grouped for rendering, categories in first-seen order.
     *
     * First-seen rather than alphabetical: the order is the GM's, and sorting it
     * would quietly rearrange a list somebody arranged.
     */
    static byCategory() {
        const groups = new Map();
        for (const roll of QuickRollsManager.all()) {
            if (!groups.has(roll.category)) groups.set(roll.category, []);
            groups.get(roll.category).push(roll);
        }
        return [...groups.entries()].map(([category, rolls]) => ({ category, rolls }));
    }

    /** Every category currently in use, for the builder's "existing or new" picker. */
    static categories() {
        return [...new Set(QuickRollsManager.all().map((roll) => roll.category))];
    }

    // ===== PORTABILITY ============================================
    //
    // A world-scoped library is shared by the GMs of ONE world and nobody else. A
    // table that spent an evening building twenty rolls has no way to carry them to
    // a new campaign, and a GM who builds a good set has no way to hand it to
    // anyone -- which is most of the value of having built it.
    //
    // A FILE rather than a compendium or a module setting: it survives a world being
    // rebuilt, it can be attached to a message, and it needs nothing installed at the
    // other end.

    /** The file format's version. Bumped only when a reader would need to behave differently. */
    static EXPORT_VERSION = 1;

    /**
     * The library as a file payload.
     *
     * WRAPPED IN AN ENVELOPE rather than exported as a bare array. The envelope is
     * what lets a reader tell this file from the twenty other JSON arrays a Foundry
     * user has lying around, and what gives a future format somewhere to say so. The
     * world id and the date are for the human staring at four downloads wondering
     * which is which; nothing reads them back.
     */
    static exportPayload() {
        return {
            type: 'coffee-pub-blacksmith.quick-rolls',
            version: QuickRollsManager.EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            world: game.world?.id ?? null,
            rolls: QuickRollsManager.all()
        };
    }

    /** A filename a GM can tell apart in a downloads folder six months later. */
    static exportFilename() {
        const world = String(game.world?.id ?? 'world').replace(/[^A-Za-z0-9_-]+/g, '-');
        const day = new Date().toISOString().slice(0, 10);
        return `quick-rolls-${world}-${day}.json`;
    }

    /** Write the library to a file the browser downloads. */
    static exportToFile() {
        const payload = QuickRollsManager.exportPayload();
        foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), 'application/json', QuickRollsManager.exportFilename());
        return payload.rolls.length;
    }

    /**
     * Read a file's text into a list of rolls, or throw with a reason a GM can act on.
     *
     * Accepts the envelope AND a bare array, because the second is what somebody hand-
     * assembling a file will write, and refusing it would be pedantry about a shape we
     * can recognise perfectly well.
     *
     * Every entry is normalized, which is also the validation: a roll missing fields
     * comes back with defaults rather than as a row that renders `undefined`. What is
     * NOT tolerated is an entry that names no roll at all -- that is a file of the
     * wrong kind, and importing it would fill the tab with rolls that do nothing.
     *
     * @returns {object[]} normalized rolls
     */
    static parseImport(text) {
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (error) {
            throw new Error('That file is not valid JSON.');
        }

        const raw = Array.isArray(parsed) ? parsed : parsed?.rolls;
        if (!Array.isArray(raw)) {
            throw new Error('That file does not contain a quick roll library.');
        }
        if (parsed?.version != null && Number(parsed.version) > QuickRollsManager.EXPORT_VERSION) {
            throw new Error(`That file was written by a newer version of Blacksmith (format ${parsed.version}).`);
        }

        const rolls = raw
            .filter((entry) => entry && typeof entry === 'object' && entry.challenger?.value)
            .map(QuickRollsManager.normalize);

        if (!rolls.length) throw new Error('That file contains no usable rolls.');
        return rolls;
    }

    /**
     * Bring imported rolls into the library.
     *
     * `replace` empties it first. Merging matches on ID, which is right in both
     * directions that matter: re-importing a library you exported updates the rolls
     * you changed rather than doubling them, and two worlds that both carry the
     * built-ins agree about them because their ids are derived from what they are,
     * not generated per world.
     *
     * @returns {{added: number, updated: number, total: number}}
     */
    static async importRolls(rolls, { replace = false } = {}) {
        const existing = replace ? [] : QuickRollsManager.all();
        const byId = new Map(existing.map((roll) => [roll.id, roll]));

        let added = 0;
        let updated = 0;
        for (const roll of rolls) {
            if (byId.has(roll.id)) updated++;
            else added++;
            byId.set(roll.id, roll);
        }

        // Order: what was already there keeps its place, and anything new goes on the
        // end -- an import must not silently rearrange a list somebody arranged.
        const merged = replace
            ? rolls.slice()
            : [...existing.map((roll) => byId.get(roll.id)), ...rolls.filter((roll) => !existing.some((e) => e.id === roll.id))];

        await QuickRollsManager._write(merged);
        return { added, updated, total: merged.length };
    }

    // ===== THE DEFAULTS ===========================================
    //
    // The twenty-four rolls that used to be markup, field for field. Written out
    // rather than generated from a loop over skills and DCs: they are CONTENT, a
    // GM will edit them, and a table that reads as data is one somebody can change
    // a single line of without working out what the loop was doing.
    //
    // Values are CONFIG ids (`prc`), not the friendly names the markup used
    // (`perception`) -- the old rows relied on a ten-entry lookup table in the
    // dialog to translate, which silently failed for every skill outside it.

    static DEFAULTS = [
        ...['prc:Perception:fas fa-magnifying-glass-waveform:Party’s awareness of hidden details, sounds, or threats.',
            'ins:Insight:fas fa-brain:Party’s ability to read motives, lies, or intentions.',
            'inv:Investigation:fas fa-magnifying-glass:Party’s skill at analyzing clues, objects, or mechanisms.',
            'nat:Nature:fas fa-sheep:Party’s knowledge of plants, animals, terrain, and survival lore.',
            'ste:Stealth:fas fa-burst:Party’s ability to move quietly and avoid detection.'
        ].flatMap((entry) => {
            const [value, name, icon, description] = entry.split(':');
            return ['individual', 'group'].map((success) => ({
                id: `qr-party-${value}-${success}`,
                category: success === 'group' ? 'Party Rolls (Group Success)' : 'Party Rolls (Individual Success)',
                label: `Party ${name}: ${success === 'group' ? 'Group' : 'Individual'} Success`,
                description,
                icon,
                mode: 'normal',
                targets: 'party',
                success,
                challenger: { type: 'skill', value },
                dc: null,
                isCinematic: false,
                rollTitle: `Party ${name}`
            }));
        }),

        ...['prc:Perception:spot hidden creatures, objects, or environmental changes',
            'ins:Insight:discern motives, detect lies, or read emotions',
            'inv:Investigation:search, analyze, or piece together clues and mechanisms'
        ].flatMap((entry) => {
            const [value, name, what] = entry.split(':');
            return [10, 15].map((dc) => ({
                id: `qr-common-${value}-${dc}`,
                category: 'Common Rolls',
                label: `DC ${dc} ${name} Check`,
                description: `${dc === 10 ? 'Moderate' : 'Tougher'} check to ${what}.`,
                icon: 'fas fa-magnifying-glass-waveform',
                mode: 'normal',
                targets: 'selected',
                success: 'group',
                challenger: { type: 'skill', value },
                dc: String(dc),
                isCinematic: false,
                rollTitle: `${name} Check`
            }));
        }),

        {
            id: 'qr-grapple-attack', category: 'Grapple Rolls', label: 'Grapple Attack',
            description: 'Use Strength to grab and restrain a foe.', icon: 'fas fa-hand-back-fist',
            mode: 'contested', challenger: { type: 'skill', value: 'ath' }, defender: { type: 'skill', value: 'ath' },
            dc: null, isCinematic: false, rollTitle: 'Grapple Attack'
        },
        {
            id: 'qr-grapple-acrobatics', category: 'Grapple Rolls', label: 'Grapple vs Acrobatics',
            description: 'Grab a foe who tries to twist free.', icon: 'fas fa-person-running',
            mode: 'contested', challenger: { type: 'skill', value: 'ath' }, defender: { type: 'skill', value: 'acr' },
            dc: null, isCinematic: false, rollTitle: 'Grapple vs Acrobatics'
        },
        {
            id: 'qr-shove-attack', category: 'Grapple Rolls', label: 'Shove Attack',
            description: 'Push a foe back or knock them prone.', icon: 'fas fa-arrows-up-down-left-right',
            mode: 'contested', challenger: { type: 'skill', value: 'ath' }, defender: { type: 'skill', value: 'ath' },
            dc: null, isCinematic: false, rollTitle: 'Shove Attack'
        },
        {
            id: 'qr-escape-grapple', category: 'Grapple Rolls', label: 'Escape Grapple',
            description: 'Break free of a grapple.', icon: 'fas fa-person-walking-dashed-line-arrow-right',
            mode: 'contested', challenger: { type: 'skill', value: 'ath' }, defender: { type: 'skill', value: 'ath' },
            dc: null, isCinematic: false, rollTitle: 'Escape Grapple'
        },
        {
            id: 'qr-deception-insight', category: 'Manipulation Rolls', label: 'Deception vs Insight',
            description: 'Tell a convincing lie.', icon: 'fas fa-mask',
            mode: 'contested', challenger: { type: 'skill', value: 'dec' }, defender: { type: 'skill', value: 'ins' },
            dc: null, isCinematic: false, rollTitle: 'Deception vs Insight'
        },
        {
            id: 'qr-persuasion-insight', category: 'Manipulation Rolls', label: 'Persuasion vs Insight',
            description: 'Win someone over with charm or reason.', icon: 'fas fa-comments',
            mode: 'contested', challenger: { type: 'skill', value: 'per' }, defender: { type: 'skill', value: 'ins' },
            dc: null, isCinematic: false, rollTitle: 'Persuasion vs Insight'
        },
        {
            id: 'qr-intimidation-insight', category: 'Manipulation Rolls', label: 'Intimidation vs Insight',
            description: 'Cow someone into compliance.', icon: 'fas fa-angry',
            mode: 'contested', challenger: { type: 'skill', value: 'itm' }, defender: { type: 'skill', value: 'ins' },
            dc: null, isCinematic: false, rollTitle: 'Intimidation vs Insight'
        },
        {
            id: 'qr-stealth-perception', category: 'Stealth Rolls', label: 'Stealth vs Perception',
            description: 'Move unseen past a watchful foe.', icon: 'fas fa-user-ninja',
            mode: 'contested', challenger: { type: 'skill', value: 'ste' }, defender: { type: 'skill', value: 'prc' },
            dc: null, isCinematic: false, rollTitle: 'Stealth vs Perception'
        }
    ];
}
