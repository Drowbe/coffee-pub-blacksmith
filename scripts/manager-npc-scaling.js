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
import {
    NpcScalingError, SPEC_VERSION, specFromCR, applySpec, parseMultiattackCount, estimateDPR, GUIDELINES
} from './utility-npc-scaling.js';

/** The provenance flag key, under `flags.<module id>`. */
export const NPC_SCALING_FLAG = 'npcScaling';

/** Fired once after a new actor has been written. */
export const NPC_SCALING_APPLIED_HOOK = 'blacksmith.npcScaling.applied';

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
        const token = doc?.documentName === 'Token' ? doc : null;
        const actor = token ? token.actor : (doc?.documentName === 'Actor' ? doc : null);
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
                for (const part of activity.damage?.parts ?? []) {
                    const formula = part?.formula;
                    if (!formula) continue;
                    try {
                        const low = new Roll(formula, rollData).evaluateSync({ minimize: true, strict: false }).total;
                        const high = new Roll(formula, rollData).evaluateSync({ maximize: true, strict: false }).total;
                        if (Number.isFinite(low) && Number.isFinite(high)) total += (low + high) / 2;
                    } catch (error) {
                        // A formula this client cannot evaluate (a reference with no value) contributes nothing;
                        // the estimate is shown to the GM, who can correct it.
                    }
                }
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
            get: (path) => foundry.utils.getProperty(actor._source, path)
        };
    }

    /**
     * Work out what a scaling would do, and write nothing.
     *
     * @param {Actor|Token|TokenDocument|string} target
     * @param {Object} request
     * @param {number} [request.cr]      Retarget to this challenge rating.
     * @param {Object} [request.spec]    Or a ready-made spec (a template, or an edited preview).
     * @param {string} [request.label]   Name suffix, e.g. "Super".
     * @param {number} [request.attacksPerRound]  The GM's correction of the attack count the damage bonus is spread across.
     * @returns {Promise<{ snapshot: Object, spec: Object, updates: Object, preview: Array, warnings: Array, source: Actor, actor: Actor, fromScaled: boolean }>}
     */
    static async plan(target, request = {}) {
        const { actor, source, fromScaled } = await this.resolve(target);

        // A scaled creature is re-derived from its source, so the snapshot is the source's, not the copy's.
        const read = fromScaled ? source : actor;
        const snapshot = this.snapshot(read, { attacksPerRound: request.attacksPerRound });

        let spec = request.spec;
        if (!spec) {
            if (request.cr === undefined || request.cr === null) {
                throw new NpcScalingError('BAD_SPEC', 'Give a target challenge rating or a spec to scale by.');
            }
            spec = specFromCR(snapshot, Number(request.cr), { label: request.label ?? '' });
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
     * Scale a creature into a NEW actor. The source is never changed.
     *
     * @param {Actor|Token|TokenDocument|string} target
     * @param {Object} request  As `plan`, plus `output` ('actor' is the only one yet).
     * @returns {Promise<{ actor: Actor, source: Actor, preview: Array, warnings: Array, spec: Object }>}
     * @throws {NpcScalingError}
     */
    static async apply(target, request = {}) {
        const output = request.output ?? 'actor';
        if (output !== 'actor') {
            throw new NpcScalingError('UNSUPPORTED_OUTPUT', `Output "${output}" is not available yet; scaling writes a new actor.`);
        }

        const planned = await this.plan(target, request);
        const { source, actor: read, spec, updates, preview, warnings, snapshot } = planned;

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

        // One flag, written in the same create call, so there is no window in which a scaled actor exists
        // without saying what it was scaled from.
        foundry.utils.setProperty(data, `flags.${MODULE.ID}.${NPC_SCALING_FLAG}`, {
            sourceUuid: source.uuid,
            spec,
            version: SPEC_VERSION,
            appliedAt: Date.now(),
            crFrom,
            crTo
        });

        const created = await Actor.implementation.create(data);
        if (!created) throw new NpcScalingError('CREATE_FAILED', 'Foundry did not create the scaled actor.');

        const result = { actor: created, source, preview, warnings, spec };
        Hooks.callAll(NPC_SCALING_APPLIED_HOOK, { source, result: created, spec, output });
        postConsoleAndNotification(MODULE.NAME,
            `NPC Scaling: ${source.name} -> ${created.name} (CR ${EncounterManager.formatCR(crFrom ?? 0)} to ${EncounterManager.formatCR(crTo ?? 0)})`,
            { sourceUuid: source.uuid, actorUuid: created.uuid }, true, false);
        return result;
    }

    /** "Goblin (Super)", or "Goblin (CR 12)" when no label was given. */
    static _name(base, label, cr) {
        const suffix = String(label ?? '').trim() || `CR ${EncounterManager.formatCR(Number(cr) || 0)}`;
        return `${base} (${suffix})`;
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

    /** The guideline table in use. Read-only: a caller that edits it edits it for everyone. */
    static get guidelines() {
        return GUIDELINES;
    }
}
