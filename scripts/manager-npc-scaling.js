// ==================================================================
// ===== MANAGER-NPC-SCALING: the Foundry side of scaling ===========
// ==================================================================
//
// The engine (utility-npc-scaling.js) decides what a scaling DOES, as pure functions. This file is
// everything that touches Foundry: resolving a target to an actor, reading a snapshot off a prepared
// actor, handing the engine a view of the actor's schema, and writing the result as a NEW actor with a
// provenance flag. Nothing here edits the source.
//
// Public surface is api-npc-scaling.js. Design and the dnd5e traps: documentation/architecture/architecture-npc-scaling.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { EncounterManager } from './manager-encounter.js';
import { formatPackLabel } from './utility-compendium-types.js';
import {
    NpcScalingError, SPEC_VERSION, specFromCR, specFromTemplate, applySpec, parseMultiattackCount, estimateDPR, describeMultiattack, suggestCR
} from './utility-npc-scaling.js';
import { CompendiumsAPI } from './api-compendiums.js';
import { NpcScalingTemplates } from './manager-npc-scaling-templates.js';
import { NpcScalingGuidelines } from './manager-npc-scaling-guidelines.js';

/** The provenance flag key, under `flags.<module id>`. */
export const NPC_SCALING_FLAG = 'npcScaling';

/** The flag an unlinked TOKEN carries while its own actor is scaled in place. */
export const NPC_SCALING_TOKEN_FLAG = 'npcScalingToken';

/** The flag an ACTOR carries while it is scaled in place, which every token linked to it shows. */
export const NPC_SCALING_ACTOR_FLAG = 'npcScalingInPlace';

/** Fired once after a new actor has been written, or a token or an actor scaled in place. */
export const NPC_SCALING_APPLIED_HOOK = 'blacksmith.npcScaling.applied';

/** Fired once after a token or actor scaled in place has been put back. */
export const NPC_SCALING_REVERTED_HOOK = 'blacksmith.npcScaling.reverted';

/**
 * The part of an item's data an edit lives in, so the whole of it can be written and put back. Foundry replaces
 * an array wholesale, so a damage part cannot be updated by its index: the unit is the damage object, either the
 * weapon's (`system.damage`) or one activity's (`system.activities.<id>.damage`).
 */
const editRoot = (path) => {
    const seg = String(path).split('.');
    return (seg[1] === 'activities' ? seg.slice(0, 4) : seg.slice(0, 2)).join('.');
};

export class NpcScalingManager {

    // ==============================================================
    // ===== TARGETS ================================================
    // ==============================================================

    /**
     * Resolve whatever a caller has to hand into the creature to read and the creature to copy.
     *
     * A token is read through its OWN actor, so an unlinked token's changes (its hit points, its effects)
     * are what the preview describes. Anything that already carries a provenance flag is traced back to its
     * source, so scaling a scaled creature scales the ORIGINAL again and never stacks one scaling on another.
     *
     * @param {Actor|Token|TokenDocument|string} target  An actor, a token, a token document, or a UUID.
     * @returns {Promise<{ actor: Actor, source: Actor, token: TokenDocument|null, fromScaled: boolean }>}
     * @throws {NpcScalingError} NOT_GM, NO_TARGET, NOT_NPC.
     */
    static async resolve(target) {
        if (!game.user?.isGM) throw new NpcScalingError('NOT_GM', 'Only a GM can scale a creature.');

        let doc = target;
        if (typeof doc === 'string') doc = await fromUuid(doc);
        if (doc?.document) doc = doc.document; // a Token placeable
        const actor = doc?.documentName === 'Token' ? doc.actor : (doc?.documentName === 'Actor' ? doc : null);
        // An unlinked token's sheet is its synthetic actor's: it still knows which token it belongs to.
        const token = doc?.documentName === 'Token' ? doc : (actor?.isToken ? actor.token : null);
        if (!actor) throw new NpcScalingError('NO_TARGET', 'There is no creature to scale.');
        if (actor.type !== 'npc') throw new NpcScalingError('NOT_NPC', `${actor.name} is not an NPC; only NPCs can be scaled.`);

        const flag = actor.getFlag(MODULE.ID, NPC_SCALING_FLAG);
        if (flag?.sourceUuid) {
            const origin = await fromUuid(flag.sourceUuid).catch(() => null);
            if (origin?.documentName === 'Actor') return { actor, source: origin, token, fromScaled: true };
            postConsoleAndNotification(MODULE.NAME,
                `NPC Scaling: the source of ${actor.name} (${flag.sourceUuid}) no longer exists; scaling this actor itself.`, null, false, false);
        }
        return { actor, source: token?.baseActor ?? actor, token, fromScaled: false };
    }

    // ==============================================================
    // ===== SCENE GUIDANCE =========================================
    // ==============================================================

    /**
     * What challenge rating to aim for, read from the scene the creature is standing in.
     *
     * The party's rating and the other monsters' are Blacksmith's own encounter figures
     * (`EncounterManager.getPartyCR`, `getMonsterCR`, counting only what can still fight), and the
     * difficulty bands are `EncounterManager.calculateEncounterDifficulty`, so this agrees with the combat
     * bar and the journal's encounter toolbar. A creature scaled from a TOKEN is left out of the others, since
     * it is the thing being rated; one scaled from the sidebar, or a sheet, is not on the scene and so is
     * not subtracted.
     *
     * @param {Actor|Token|TokenDocument|string} target
     * @param {Object} [options]
     * @param {number} [options.cr]  A CR to describe in `chosen`.
     * @param {number} [options.count=1]  How many of the creature to add at that CR, 1 to 20.
     * @returns {Promise<Object>} `suggestCR`'s result, plus `onScene`. `available` is false when the scene
     *   holds no player character to rate against.
     * @throws {NpcScalingError} NOT_GM, NO_TARGET, NOT_NPC.
     */
    static async guidance(target, { cr, count } = {}) {
        const { actor, token } = await this.resolve(target);
        const own = token ?? actor.token ?? null;
        const placed = canvas?.tokens?.placeables ?? [];
        const others = own ? placed.filter((t) => t.document?.uuid !== own.uuid) : placed;

        const partyCR = EncounterManager.parseCR(EncounterManager.getPartyCR(null, { onlyStanding: true }));
        const othersCR = EncounterManager.parseCR(EncounterManager.getMonsterCR({}, others, { onlyStanding: true }));
        const own5e = Number(actor.system?.details?.cr);

        const result = suggestCR({
            partyCR,
            othersCR,
            currentCR: own && Number.isFinite(own5e) ? own5e : null,
            chosenCR: cr !== null && cr !== undefined && Number.isFinite(Number(cr)) ? Number(cr) : null,
            count,
            difficulty: (party, monsters) => EncounterManager.calculateEncounterDifficulty(party, monsters)
        });
        return { ...result, onScene: Boolean(own) };
    }

    // ==============================================================
    // ===== SNAPSHOT ===============================================
    // ==============================================================

    /**
     * Read a creature as the plain numbers the engine takes. Every figure is the PREPARED value, as the
     * sheet shows it, because that is what a person compares a preview against.
     *
     * `attackBonus` is the best to-hit among the creature's attack activities; `saveDC` is its spell DC and
     * is read only for a creature that casts. `dpr`, `attacksPerRound` and `avgHit` are an ESTIMATE (see
     * `estimateDPR`). The attack count is the one that matters: a scaling's damage bonus is spread across it,
     * so the preview lets the GM correct it.
     *
     * @param {Actor} actor
     * @param {Object} [options]
     * @param {number} [options.attacksPerRound]  Overrides the count read from the creature's Multiattack.
     * @returns {Object} A snapshot.
     */
    static snapshot(actor, { attacksPerRound } = {}) {
        const system = actor.system;
        const attacks = this._attackAverages(actor);
        const stated = Number.isInteger(attacksPerRound) && attacksPerRound >= 1 ? attacksPerRound : null;
        const damage = estimateDPR(attacks.averages, stated ?? this._multiattackCount(actor));
        const cr = system.details?.cr;

        return {
            cr: Number.isFinite(cr) ? cr : null,
            ac: Number(system.attributes?.ac?.value) || 0,
            hpMax: Number(system.attributes?.hp?.max) || 0,
            hpValue: Number(system.attributes?.hp?.value) || 0,
            attackBonus: attacks.bestToHit,
            saveDC: system.attributes?.spellcasting && Number.isFinite(system.attributes?.spell?.dc)
                ? system.attributes.spell.dc : null,
            dpr: damage.dpr,
            attacksPerRound: damage.attacksPerRound,
            avgHit: damage.avgHit
        };
    }

    /**
     * The average of a damage formula, as the midpoint of its minimum and maximum. A formula this client cannot
     * evaluate (a reference with no value) is 0: the figure is shown to the GM, who can correct it.
     */
    static _formulaAverage(formula, rollData) {
        if (!formula) return 0;
        try {
            const low = new Roll(formula, rollData).evaluateSync({ minimize: true, strict: false }).total;
            const high = new Roll(formula, rollData).evaluateSync({ maximize: true, strict: false }).total;
            return Number.isFinite(low) && Number.isFinite(high) ? (low + high) / 2 : 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Every damage part the creature's own actions carry, each with where it is STORED, so a scaling can write
     * into it. Spells are left out (their damage belongs to the spell and its own scaling), as is healing.
     * The base damage of a weapon is one shared part at `system.damage.base`, listed once however many
     * activities include it.
     * @param {Actor} actor
     * @returns {Array<{ itemId: string, itemName: string, path: string, avg: number, data: Object }>}
     */
    static _damageParts(actor) {
        const rollData = actor.getRollData?.() ?? {};
        const parts = [];
        const seen = new Set();
        for (const item of actor.items) {
            if (item.type === 'spell') continue;
            for (const activity of item.system?.activities?.values?.() ?? []) {
                if (!['attack', 'save', 'damage'].includes(activity.type)) continue;
                const prepared = activity.damage?.parts ?? [];
                // The prepared list has the weapon's base damage unshifted onto the front; the stored one does not.
                const bases = prepared.filter((p) => p.base).length;
                prepared.forEach((part, index) => {
                    if ([...(part.types ?? [])].some((t) => t === 'healing' || t === 'temphp')) return;
                    const path = part.base ? 'system.damage.base' : `system.activities.${activity.id}.damage.parts.${index - bases}`;
                    const key = `${item.id}:${path}`;
                    if (seen.has(key)) return;
                    const stored = foundry.utils.getProperty(item._source, path);
                    const avg = this._formulaAverage(part.formula, rollData);
                    if (!stored || !(avg > 0)) return;
                    seen.add(key);
                    parts.push({
                        itemId: item.id,
                        itemName: item.name,
                        path,
                        avg,
                        data: {
                            number: stored.number, denomination: stored.denomination, bonus: stored.bonus,
                            custom: { enabled: Boolean(stored.custom?.enabled), formula: stored.custom?.formula ?? '' }
                        }
                    });
                });
            }
        }
        return parts;
    }

    /** The average damage of every attack activity the creature has, and its best to-hit. */
    static _attackAverages(actor) {
        const averages = [];
        let bestToHit = null;
        const rollData = actor.getRollData?.() ?? {};
        for (const item of actor.items) {
            for (const activity of item.system?.activities?.values?.() ?? []) {
                if (activity.type !== 'attack') continue;
                const toHit = Number.parseInt(activity.labels?.toHit, 10);
                if (Number.isFinite(toHit) && (bestToHit === null || toHit > bestToHit)) bestToHit = toHit;
                let total = 0;
                for (const part of activity.damage?.parts ?? []) total += this._formulaAverage(part?.formula, rollData);
                if (total > 0) averages.push(total);
            }
        }
        return { averages, bestToHit };
    }

    /** The attack count a Multiattack feature states plainly, or null. */
    static _multiattackCount(actor) {
        const feature = actor.items.find((i) => /multiattack/i.test(i.name));
        return feature ? parseMultiattackCount(feature.system?.description?.value) : null;
    }

    // ==============================================================
    // ===== PLAN ===================================================
    // ==============================================================

    /**
     * The engine's view of an actor's schema and stored data.
     * `has` asks the actor's system model, not the data, so a field that exists but is empty still counts.
     * `get` reads STORED data, because a bonus formula is merged into what is stored and not into what
     * active effects add on top of it.
     */
    static _io(actor) {
        const schema = actor.system?.schema;
        return {
            has: (path) => Boolean(schema?.getField(path.replace(/^system\./, ''))),
            get: (path) => foundry.utils.getProperty(actor._source, path),
            parts: this._damageParts(actor)
        };
    }

    /**
     * Work out what a scaling would do, and write nothing.
     *
     * @param {Actor|Token|TokenDocument|string} target
     * @param {Object} request
     * @param {number} [request.cr]      Retarget to this challenge rating.
     * @param {string|Object} [request.template]  Or a saved template, by id or as an object.
     * @param {Object} [request.spec]    Or a ready-made spec.
     * @param {string} [request.label]   Name suffix, e.g. "Super".
     * @param {number} [request.attacksPerRound]  The GM's correction of the attack count the creature makes now.
     * @param {number} [request.attacksTo]  Attacks per round to scale to, for a challenge rating retarget. Default: what the new CR calls for.
     * @returns {Promise<{ snapshot: Object, spec: Object, updates: Object, itemEdits: Array, preview: Array, warnings: Array, source: Actor, actor: Actor, fromScaled: boolean }>}
     */
    static async plan(target, request = {}) {
        const { actor, source, fromScaled } = await this.resolve(target);

        // A scaled creature is re-derived from its source, so the snapshot is the source's, not the copy's.
        const read = fromScaled ? source : actor;
        const snapshot = this.snapshot(read, { attacksPerRound: request.attacksPerRound });

        let spec = request.spec;
        if (!spec && request.template) {
            const template = typeof request.template === 'string' ? NpcScalingTemplates.get(request.template) : request.template;
            if (!template) throw new NpcScalingError('BAD_TEMPLATE', `There is no scaling template "${request.template}".`);
            spec = specFromTemplate(template, snapshot);
            if (request.label) spec = { ...spec, label: request.label };
        } else if (!spec) {
            if (request.cr === undefined || request.cr === null) {
                throw new NpcScalingError('BAD_SPEC', 'Give a target challenge rating, a template or a spec to scale by.');
            }
            spec = specFromCR(snapshot, Number(request.cr), {
                label: request.label ?? '', table: NpcScalingGuidelines.current().table, attacksTo: request.attacksTo
            });
        } else if (spec.version !== SPEC_VERSION) {
            throw new NpcScalingError('BAD_SPEC', `This spec is version ${spec.version}; this Blacksmith reads version ${SPEC_VERSION}.`);
        }

        const result = applySpec(snapshot, spec, this._io(read));
        return { ...result, snapshot, source, actor: read, fromScaled };
    }

    // ==============================================================
    // ===== APPLY ==================================================
    // ==============================================================

    /**
     * Scale a creature. `output` says what to write:
     *
     * - `'actor'` (the default): a NEW actor. The source is never changed.
     * - `'token'`: an UNLINKED token's own actor, in place. Nothing is created and the base actor is untouched. A
     *   LINKED token is refused (`LINKED_TOKEN`): it has no stats of its own to change.
     * - `'update'`: the creature's ACTOR itself, in place, so every token linked to it, on every scene, shows the
     *   change. A compendium actor is refused (`READ_ONLY`).
     *
     * Both in-place outputs keep the original of every value they change, and `revert` writes them back. An
     * unlinked token or actor that is already a scaled copy is refused.
     *
     * @param {Actor|Token|TokenDocument|string} target  For `'token'`, a token (or an unlinked token's actor).
     * @param {Object} request  As `plan`, plus `output`: 'actor', 'token' or 'update'.
     * @returns {Promise<{ actor: Actor, source: Actor, preview: Array, warnings: Array, spec: Object, multiattack: ?string, token?: TokenDocument, mode?: 'delta'|'actor' }>}
     * @throws {NpcScalingError}
     */
    static async apply(target, request = {}) {
        const output = request.output ?? 'actor';
        if (output === 'token') return this._applyToToken(target, request);
        if (output === 'update') return this._applyUpdate(target, request);
        if (output !== 'actor') {
            throw new NpcScalingError('UNSUPPORTED_OUTPUT', `Output "${output}" is not known; use 'actor', 'token' or 'update'.`);
        }
        const result = await this._createScaledActor(target, request);
        Hooks.callAll(NPC_SCALING_APPLIED_HOOK, { source: result.source, result: result.actor, spec: result.spec, output });
        return result;
    }

    /** Write the new actor. Fires no hook: `apply` does, once, for whichever output it was asked for. */
    static async _createScaledActor(target, request = {}) {
        const planned = await this.plan(target, request);
        const { source, actor: read, spec, updates, itemEdits, preview, warnings, snapshot } = planned;

        // Copy the creature as it stands (a token's actor includes its unlinked changes), then write only
        // what the engine produced. `toObject` is the stored data, so nothing derived leaks in.
        const data = read.toObject();
        delete data._id;
        delete data._stats;
        delete data.sort;
        if (read.pack) data.folder = null;

        const crFrom = snapshot.cr;
        const crTo = spec.cr?.to ?? snapshot.cr;
        data.name = this._name(source.name, spec.label, crTo);
        data.prototypeToken = { ...(data.prototypeToken ?? {}), name: data.name };
        for (const [path, value] of Object.entries(updates)) foundry.utils.setProperty(data, path, value);

        // The creature's own actions get their share of the damage, and Multiattack says how many it makes. The
        // copy is a new document, so its items are ours to write; the source's are never touched.
        for (const edit of itemEdits) {
            const item = data.items?.find((i) => i._id === edit.itemId);
            if (!item) continue;
            for (const [key, value] of Object.entries(edit.set)) foundry.utils.setProperty(item, `${edit.path}.${key}`, value);
        }
        const multiattack = await this._applyMultiattack(data, source, spec, crTo);

        // One flag, written in the same create call, so there is no window in which a scaled actor exists
        // without saying what it was scaled from.
        foundry.utils.setProperty(data, `flags.${MODULE.ID}.${NPC_SCALING_FLAG}`, {
            sourceUuid: source.uuid,
            spec,
            template: typeof request.template === 'string' ? request.template : (request.template?.id || null),
            version: SPEC_VERSION,
            appliedAt: Date.now(),
            crFrom,
            crTo
        });

        const created = await Actor.implementation.create(data);
        if (!created) throw new NpcScalingError('CREATE_FAILED', 'Foundry did not create the scaled actor.');

        const result = { actor: created, source, preview, warnings, spec, multiattack };
        postConsoleAndNotification(MODULE.NAME,
            `NPC Scaling: ${source.name} -> ${created.name} (CR ${EncounterManager.formatCR(crFrom ?? 0)} to ${EncounterManager.formatCR(crTo ?? 0)})`,
            { sourceUuid: source.uuid, actorUuid: created.uuid }, true, false);
        return result;
    }

    /**
     * Say, on the new actor, that it makes more attacks. Only when the spec adds some.
     *
     * An existing Multiattack feature has a paragraph APPENDED, never rewritten: its prose names which
     * attacks go in which order, and a count swapped into that sentence would leave it contradicting itself.
     * With none, the SRD's Multiattack feature is looked up through the compendiums the GM has chosen for
     * features (`api.compendiums`), and used as the base of a new one; with none of those either, a plain
     * feature is made. Either way the description is the generated text.
     *
     * @param {Object} data  The new actor's data; its `items` are edited in place.
     * @param {Actor} source
     * @param {Object} spec
     * @param {number|null} crTo
     * @returns {Promise<'extended'|'added'|null>}
     */
    static async _applyMultiattack(data, source, spec, crTo) {
        if (!spec.attacks) return null;
        const text = describeMultiattack({ name: source.name, count: spec.attacks.to, from: spec.attacks.from, crTo });
        data.items ??= [];

        const existing = data.items.find((i) => /multiattack/i.test(i.name));
        if (existing) {
            foundry.utils.setProperty(existing, 'system.description.value', `${existing.system?.description?.value ?? ''}${text}`);
            return 'extended';
        }

        let item = null;
        try {
            const found = await CompendiumsAPI.resolveDocument('Multiattack', 'feature', { exact: true });
            item = found?.toObject?.() ?? null;
        } catch (error) {
            item = null; // a lookup that fails costs the SRD icon and structure, not the feature
        }
        if (item) {
            delete item._id;
            delete item._stats;
            delete item.folder;
            delete item.sort;
            delete item.ownership;
        } else {
            item = { name: 'Multiattack', type: 'feat', img: 'icons/svg/combat.svg', system: { type: { value: 'monster' } } };
        }
        foundry.utils.setProperty(item, 'system.description.value', text);
        data.items.push(item);
        return 'added';
    }

    /** "Goblin (Super)", or "Goblin (CR 12)" when no label was given. */
    static _name(base, label, cr) {
        const suffix = String(label ?? '').trim() || `CR ${EncounterManager.formatCR(Number(cr) || 0)}`;
        return `${base} (${suffix})`;
    }

    // ==============================================================
    // ===== SCALING IN PLACE =======================================
    // ==============================================================

    /**
     * What a token scaled in place says about itself, or null. One flag, written once and before anything it
     * describes: it holds the original of every value that was changed, so reverting is a read and a write-back,
     * and a failure halfway can always be undone.
     * @param {Token|TokenDocument} token
     * @returns {Object|null} `{ version, mode: 'delta', sourceUuid, spec, template, appliedAt, crFrom, crTo, original }`
     */
    static tokenScaling(token) {
        const doc = token?.document ?? token;
        return doc?.getFlag?.(MODULE.ID, NPC_SCALING_TOKEN_FLAG) ?? null;
    }

    /**
     * What an actor scaled in place says about itself, or null. As `tokenScaling`, with `mode: 'actor'`.
     * @param {Actor} actor  The real actor, not an unlinked token's synthetic one.
     * @returns {Object|null}
     */
    static actorScaling(actor) {
        return actor?.getFlag?.(MODULE.ID, NPC_SCALING_ACTOR_FLAG) ?? null;
    }

    /**
     * Whether the thing resolved is scaled in place, and which of the two carries it: its token, or the actor the
     * token is linked to. Both look the same to a person; they revert differently.
     * @param {{ actor: Actor, token: TokenDocument|null }} resolved  What `resolve` returned.
     * @returns {{ kind: 'token'|'actor', record: Object, name: string }|null}
     */
    static inPlaceState({ actor, token }) {
        const tokenRecord = token ? this.tokenScaling(token) : null;
        if (tokenRecord) return { kind: 'token', record: tokenRecord, name: token.name };
        const real = token?.baseActor ?? actor;
        const record = this.actorScaling(real);
        return record ? { kind: 'actor', record, name: real.name } : null;
    }

    /** `output: 'token'`: an unlinked token's own actor, in place. */
    static async _applyToToken(target, request = {}) {
        const { token, fromScaled } = await this.resolve(target);
        if (!token) {
            throw new NpcScalingError('NO_TOKEN', 'Scaling a token needs a token on a scene. This is an actor: scale it into a new actor, update it, or select its token.');
        }
        if (token.actorLink) {
            throw new NpcScalingError('LINKED_TOKEN',
                `${token.name} is linked to its actor, so it has no stats of its own to change. Use output 'update' to scale the actor (every token linked to it changes), or 'actor' for a new one.`);
        }
        if (this.tokenScaling(token)) throw new NpcScalingError('ALREADY_SCALED', `${token.name} is already scaled. Revert it first.`);
        if (fromScaled) throw new NpcScalingError('ALREADY_SCALED', `${token.name} is already a scaled copy. Scale the original creature instead.`);

        const result = await this._scaleInPlace(token, { ...request, output: undefined });
        Hooks.callAll(NPC_SCALING_APPLIED_HOOK, { source: result.source, result: result.actor, spec: result.spec, output: 'token', token });
        return result;
    }

    /**
     * `output: 'update'`: the creature's actor itself, in place. Whatever was given, a token or an actor, it is the
     * actor the tokens are linked to that changes, so every one of them shows it.
     */
    static async _applyUpdate(target, request = {}) {
        const resolved = await this.resolve(target);
        const real = resolved.token?.baseActor ?? resolved.actor;
        if (real.pack) throw new NpcScalingError('READ_ONLY', `${real.name} is in a compendium and cannot be changed. Scale it into a new actor instead.`);
        if (this.actorScaling(real)) throw new NpcScalingError('ALREADY_SCALED', `${real.name} has already been updated. Revert it first.`);
        const { fromScaled } = await this.resolve(real);
        if (fromScaled) throw new NpcScalingError('ALREADY_SCALED', `${real.name} is already a scaled copy. Scale the original creature instead.`);

        const result = await this._scaleInPlace(real, { ...request, output: undefined });
        Hooks.callAll(NPC_SCALING_APPLIED_HOOK, { source: result.source, result: result.actor, spec: result.spec, output: 'update' });
        return result;
    }

    /**
     * Scale a document in place: an unlinked token (its own actor, which lives in the token) or an actor. Everything
     * is worked out first (the new values, the originals they replace, the Multiattack text), the flag holding the
     * originals is written, and only then is anything changed. An item's damage is written as the whole damage
     * object it lives in, because Foundry replaces arrays.
     *
     * @param {TokenDocument|Actor} doc
     * @param {Object} request  As `plan`.
     */
    static async _scaleInPlace(doc, request) {
        const isToken = doc.documentName === 'Token';
        const flagKey = isToken ? NPC_SCALING_TOKEN_FLAG : NPC_SCALING_ACTOR_FLAG;
        const planned = await this.plan(doc, request);
        const { source, actor, spec, updates, itemEdits, preview, warnings, snapshot } = planned;
        const crFrom = snapshot.cr;
        const crTo = spec.cr?.to ?? snapshot.cr;
        const originalName = doc.name;
        const name = this._name(originalName, spec.label, crTo);
        // An actor's prototype token carries the name new tokens are dropped with, so it follows.
        const rename = isToken ? { name } : { name, 'prototypeToken.name': name };

        // Pairs, not a map: a path has dots in it, and a flag key with dots is read back as nesting.
        const stored = actor.toObject();
        const originalActor = Object.keys(updates).map((path) => ({
            path, value: foundry.utils.deepClone(foundry.utils.getProperty(stored, path)) ?? null
        }));

        const edited = new Map();
        for (const edit of itemEdits) {
            const item = actor.items.get(edit.itemId);
            if (!item) continue;
            let entry = edited.get(item.id);
            if (!entry) {
                const data = item.toObject();
                entry = { data, was: foundry.utils.deepClone(data), roots: new Set() };
                edited.set(item.id, entry);
            }
            for (const [key, value] of Object.entries(edit.set)) foundry.utils.setProperty(entry.data, `${edit.path}.${key}`, value);
            entry.roots.add(editRoot(edit.path));
        }
        const itemPatches = [];
        const originalItems = [];
        for (const [id, { data, was, roots }] of edited) {
            const patch = { _id: id };
            const prior = [];
            for (const root of roots) {
                foundry.utils.setProperty(patch, root, foundry.utils.getProperty(data, root));
                prior.push({ root, value: foundry.utils.getProperty(was, root) });
            }
            itemPatches.push(patch);
            originalItems.push({ id, roots: prior });
        }

        const snap = { items: actor.items.map((i) => i.toObject()) };
        const multiattack = await this._applyMultiattack(snap, source, spec, crTo);
        let extended = null;
        let created = null;
        if (multiattack === 'extended') {
            const hit = snap.items.find((i) => /multiattack/i.test(i.name));
            extended = { id: hit._id, was: actor.items.get(hit._id)?.system?.description?.value ?? '', now: hit.system.description.value };
        } else if (multiattack === 'added') {
            created = snap.items[snap.items.length - 1];
            created._id = foundry.utils.randomID(); // known before it exists, so the flag can name it
        }

        const record = {
            version: SPEC_VERSION,
            mode: isToken ? 'delta' : 'actor',
            sourceUuid: source.uuid,
            spec,
            template: typeof request.template === 'string' ? request.template : (request.template?.id || null),
            appliedAt: Date.now(),
            crFrom,
            crTo,
            original: {
                name: originalName,
                prototypeName: isToken ? null : (doc.prototypeToken?.name ?? null),
                actor: originalActor,
                items: originalItems,
                description: extended ? { id: extended.id, value: extended.was } : null,
                created: created ? created._id : null
            }
        };

        await doc.setFlag(MODULE.ID, flagKey, record);
        try {
            await actor.update(updates);
            if (itemPatches.length) await actor.updateEmbeddedDocuments('Item', itemPatches);
            if (extended) await actor.updateEmbeddedDocuments('Item', [{ _id: extended.id, 'system.description.value': extended.now }]);
            if (created) await actor.createEmbeddedDocuments('Item', [created], { keepId: true });
            await doc.update(rename);
        } catch (error) {
            try {
                await this.revert(doc);
            } catch (revertError) {
                console.error(`${MODULE.NAME} | NPC Scaling: could not undo a half-finished scaling of ${originalName}:`, revertError);
            }
            throw error;
        }

        postConsoleAndNotification(MODULE.NAME,
            `NPC Scaling: ${isToken ? 'token' : 'actor'} ${originalName} scaled in place (CR ${EncounterManager.formatCR(crFrom ?? 0)} to ${EncounterManager.formatCR(crTo ?? 0)})`,
            { uuid: doc.uuid }, true, false);
        return {
            actor: isToken ? doc.actor : doc,
            token: isToken ? doc : null,
            source, preview, warnings, spec, multiattack,
            mode: isToken ? 'delta' : 'actor'
        };
    }

    /**
     * Put something scaled in place back. Each value it changed is written back from the flag, the Multiattack it
     * was given is removed, and the name is restored; the flag goes last, so a revert that fails partway can be run
     * again. Whichever of a token, a linked token or an actor is given, what is reverted is what carries the flag:
     * the token's own, else the actor it is linked to.
     *
     * @param {Token|TokenDocument|Actor|string} target
     * @returns {Promise<{ token: TokenDocument|null, actor: Actor }>}
     * @throws {NpcScalingError} NOT_GM, NO_TARGET, NOT_NPC, NOT_SCALED.
     */
    static async revert(target) {
        const resolved = await this.resolve(target);
        const state = this.inPlaceState(resolved);
        if (!state) throw new NpcScalingError('NOT_SCALED', `${(resolved.token ?? resolved.actor).name} is not scaled.`);

        const isToken = state.kind === 'token';
        const doc = isToken ? resolved.token : (resolved.token?.baseActor ?? resolved.actor);
        const actor = isToken ? doc.actor : doc;
        const was = state.record.original ?? {};

        if (was.created && actor.items.get(was.created)) await actor.deleteEmbeddedDocuments('Item', [was.created]);
        const patches = [];
        for (const { id, roots } of was.items ?? []) {
            if (!actor.items.get(id)) continue;
            const patch = { _id: id };
            for (const { root, value } of roots) foundry.utils.setProperty(patch, root, value);
            patches.push(patch);
        }
        if (was.description && actor.items.get(was.description.id)) {
            patches.push({ _id: was.description.id, 'system.description.value': was.description.value });
        }
        if (patches.length) await actor.updateEmbeddedDocuments('Item', patches);
        const restore = {};
        for (const { path, value } of was.actor ?? []) restore[path] = value;
        if (Object.keys(restore).length) await actor.update(restore);
        await doc.update(isToken ? { name: was.name } : { name: was.name, 'prototypeToken.name': was.prototypeName ?? was.name });
        await doc.unsetFlag(MODULE.ID, isToken ? NPC_SCALING_TOKEN_FLAG : NPC_SCALING_ACTOR_FLAG);

        const token = isToken ? doc : null;
        Hooks.callAll(NPC_SCALING_REVERTED_HOOK, { token, actor, mode: state.record.mode, sourceUuid: state.record.sourceUuid });
        postConsoleAndNotification(MODULE.NAME, `NPC Scaling: ${state.name} reverted`, { uuid: doc.uuid }, true, false);
        return { token, actor };
    }

    /**
     * Scale several unlinked tokens, each by its own figures: the same request is planned against each creature, so a
     * CR target moves a goblin and an ogre by different amounts. One that cannot be scaled (a linked token, say) does
     * not stop the rest.
     * @param {Array<Token|TokenDocument|string>} targets
     * @param {Object} request  As `plan`.
     * @returns {Promise<{ results: Object[], failures: Array<{ target: *, error: Error }> }>}
     */
    static async applyToTokens(targets, request = {}) {
        const results = [];
        const failures = [];
        for (const target of targets ?? []) {
            try {
                results.push(await this.apply(target, { ...request, output: 'token' }));
            } catch (error) {
                failures.push({ target, error });
            }
        }
        return { results, failures };
    }

    // ==============================================================
    // ===== READING ================================================
    // ==============================================================

    /**
     * What a scaled actor says about itself, or null for any other actor.
     * @param {Actor} actor
     * @returns {{ sourceUuid: string, spec: Object, version: number, appliedAt: number, crFrom: number|null, crTo: number|null }|null}
     */
    static provenance(actor) {
        return actor?.getFlag?.(MODULE.ID, NPC_SCALING_FLAG) ?? null;
    }

    // ==============================================================
    // ===== SAMPLING ===============================================
    // ==============================================================

    /** The highest save DC a creature has: its spell DC, or any save activity's DC. Null when it has none. */
    static _bestSaveDC(actor, spellDC) {
        let best = Number.isFinite(spellDC) ? spellDC : null;
        for (const item of actor.items) {
            for (const activity of item.system?.activities?.values?.() ?? []) {
                if (activity.type !== 'save') continue;
                const dc = Number(activity.save?.dc?.value);
                if (Number.isFinite(dc) && dc > 0 && (best === null || dc > best)) best = dc;
            }
        }
        return best;
    }

    /**
     * One creature as the figures a guidelines table is made of. A figure the creature does not have is
     * `null` or zero, and the engine counts it for nothing (a creature with no attack has no attack bonus).
     * @param {Actor} actor
     * @returns {{ cr: number|null, ac: number, hp: number, atk: number|null, dpr: number, dc: number|null }}
     */
    static sample(actor) {
        const s = this.snapshot(actor);
        return { cr: s.cr, ac: s.ac, hp: s.hpMax, atk: s.attackBonus, dpr: s.dpr, dc: this._bestSaveDC(actor, s.saveDC) };
    }

    /**
     * Read every NPC in these actor compendiums as a sample. Loads the documents, so a pack of several hundred
     * creatures takes a few seconds; it yields to the browser as it goes so the window stays alive, and reports
     * progress.
     *
     * @param {string[]} packIds  Compendium ids, e.g. `dnd5e.actors24`.
     * @param {Object} [options]
     * @param {(done: number, total: number) => void} [options.onProgress]
     * @returns {Promise<{ samples: Object[], skipped: number, labels: string[], packIds: string[] }>}
     * @throws {NpcScalingError} NO_PACK when none of the ids is an actor compendium.
     */
    static async sampleCompendium(packIds, { onProgress } = {}) {
        const packs = (packIds ?? []).map((id) => game.packs.get(id)).filter((p) => p?.documentName === 'Actor');
        if (!packs.length) throw new NpcScalingError('NO_PACK', 'Choose at least one actor compendium.');

        const total = packs.reduce((n, p) => n + (p.index?.size ?? 0), 0);
        const samples = [];
        let done = 0;
        let skipped = 0;
        for (const pack of packs) {
            const documents = await pack.getDocuments({ type: 'npc' });
            for (const actor of documents) {
                try {
                    const sample = this.sample(actor);
                    if (sample.cr === null) skipped++;
                    else samples.push(sample);
                } catch (error) {
                    skipped++; // a creature this client cannot read is left out, and counted
                }
                done++;
                if (done % 20 === 0) {
                    onProgress?.(done, total);
                    await new Promise((resolve) => setTimeout(resolve));
                }
            }
        }
        onProgress?.(done, Math.max(total, done));
        return { samples, skipped, labels: packs.map((p) => formatPackLabel(p, p.collection)), packIds: packs.map((p) => p.collection) };
    }

    /** The guidelines table in use. Read-only: a caller that edits it edits it for everyone. */
    static get guidelines() {
        return NpcScalingGuidelines.current().table;
    }
}
