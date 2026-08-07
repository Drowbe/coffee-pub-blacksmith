import { MODULE } from './const.js';

const CLASSIFIERS = new Map();
let classifierSequence = 0;
let conditionIndexCache = null;

function localize(key, fallback) {
    const value = game?.i18n?.localize?.(`${MODULE.ID}.${key}`);
    return value && value !== `${MODULE.ID}.${key}` ? value : fallback;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character]));
}

function normalizeStatuses(effect) {
    const statuses = effect?.statuses;
    if (!statuses) return [];
    if (Array.isArray(statuses)) return statuses.map(String).filter(Boolean);
    if (statuses instanceof Set) return Array.from(statuses, String).filter(Boolean);
    if (typeof statuses.values === 'function') return Array.from(statuses.values(), String).filter(Boolean);
    return [];
}

function getFlag(effect, scope, key) {
    try {
        return effect?.getFlag?.(scope, key) ?? effect?.flags?.[scope]?.[key];
    } catch {
        return effect?.flags?.[scope]?.[key];
    }
}

function getConditionIndex() {
    if (conditionIndexCache) return conditionIndexCache;
    const byId = new Map();
    const byName = new Map();
    const add = (id, label) => {
        if (!id || !label) return;
        const localized = game?.i18n?.localize?.(label) || String(label);
        byId.set(String(id), localized);
        byName.set(localized.trim().toLowerCase(), String(id));
    };

    for (const condition of (CONFIG?.statusEffects || [])) {
        add(condition?.id, condition?.name ?? condition?.label);
    }
    for (const [id, condition] of Object.entries(CONFIG?.DND5E?.conditionTypes || {})) {
        add(id, condition?.label ?? condition?.name ?? condition);
    }
    conditionIndexCache = { byId, byName };
    return conditionIndexCache;
}

/** Round-based durations already read well ("10 Rounds"); only seconds need help. */
const ROUNDS_READ_BETTER_BELOW = 120; // seconds — i.e. 20 rounds, a plausible remainder for THIS fight

/* ===================================================================== */
/* ===== THE EFFECTS ECOSYSTEM ADAPTER ================================= */
/* ===================================================================== */
/*
 * Effects are not a substrate Blacksmith controls. Two other things rewrite
 * durations underneath every consumer:
 *
 *   dnd5e      DurationData.getEffectDuration() maps a source item's own units
 *              at creation -- `round`/`turn` produce {rounds}/{turns},
 *              `minute`/`hour`/`day` produce {seconds}. Happens with no
 *              third-party module installed at all.
 *   Times Up   setDurationRounds() rewrites any effect under its threshold into
 *              a rounds duration, NULLS duration.seconds, and stashes the
 *              original in flags.times-up.durationSeconds. It also expires
 *              effects itself, deleting them.
 *
 * Per architecture-ownership.md, absorbing that variance is the hub's job and
 * branching on it is forbidden to satellites. Everything in this section exists
 * so that no consumer ever asks whether Times Up is installed.
 */

/** Seconds per combat round, from the world's own config rather than assumed. */
function roundSeconds() {
    const value = Number(CONFIG?.time?.roundTime);
    return Number.isFinite(value) && value > 0 ? value : 6;
}

/**
 * Whether Blacksmith should let Times Up own expiry: the module must be active
 * AND the enableTimesUpIntegration world setting on (default true).
 *
 * Checked at RUNTIME by every lane, so toggling applies live — same contract as
 * isMidiIntegrationEnabled in utility-midi-resolution.js. When this returns
 * false, Blacksmith supplies the baseline itself; with Times Up installed that
 * means both will expire the same effect and one will fail noisily, which is
 * why the setting is documented as diagnostic rather than as a normal mode.
 */
export function isTimesUpIntegrationEnabled() {
    if (!game?.modules?.get('times-up')?.active) return false;
    try {
        return game.settings.get(MODULE.ID, 'enableTimesUpIntegration') !== false;
    } catch {
        return true; // setting not registered yet — module active means integrate
    }
}

/**
 * The seconds a Times Up conversion stashed away, or null if it did not convert
 * this effect. Presence of the flag IS the marker that the effect was authored
 * in seconds and rewritten into rounds.
 */
function timesUpOriginalSeconds(effect) {
    const stashed = getFlag(effect, 'times-up', 'durationSeconds');
    const value = Number(stashed);
    return Number.isFinite(value) ? value : null;
}

/**
 * How much is left, as a number and the unit that number is in.
 *
 * THE UNIT IS PART OF THE ANSWER, NOT AN IMPLEMENTATION DETAIL. Foundry reports
 * `duration.remaining` in whichever unit the document happens to carry —
 * seconds for a seconds duration, a decimal count of rounds for a turns
 * duration — and announces that nowhere. A consumer that assumes seconds is
 * wrong by a factor of `roundTime` on every rounds-based effect, and a consumer
 * that gets a seconds-normalized number cannot tell a wall-clock remainder from
 * a combat one. Both mistakes have been shipped by a consuming module.
 *
 * Rounds are NOT converted to seconds for the caller. A rounds duration
 * advances with the combat tracker and not with the world clock, so quoting it
 * in seconds would state a remainder that is not true.
 *
 * The one conversion that IS applied: where Times Up rewrote a seconds duration
 * into rounds, the seconds are restored, because that effect was authored in
 * seconds and the rewrite is exactly the substrate variance this layer exists
 * to hide. Without the integration the document is reported as it stands.
 *
 * @param {ActiveEffect} effect
 * @returns {{value: number, unit: 'seconds'|'rounds'}|null} null when the effect
 *   has no duration at all (a permanent effect), which is distinct from zero.
 */
export function getEffectRemaining(effect) {
    const duration = effect?.duration;
    if (!duration?.type || duration.type === 'none') return null;

    const raw = Number(duration.remaining ?? duration.seconds);
    if (!Number.isFinite(raw)) return null;

    if (duration.type === 'seconds') return { value: raw, unit: 'seconds' };

    // Rounds/turns. If Times Up put it here, put it back.
    if (isTimesUpIntegrationEnabled() && timesUpOriginalSeconds(effect) !== null) {
        return { value: raw * roundSeconds(), unit: 'seconds' };
    }
    return { value: raw, unit: 'rounds' };
}

/**
 * Whether the clock has run out. Deliberately separate from whether the effect
 * still exists: those are different facts and conflating them is what makes an
 * expiry contract untestable.
 */
export function hasEffectExpired(effect) {
    const remaining = getEffectRemaining(effect);
    return remaining !== null && remaining.value <= 0;
}

/**
 * Foundry's own `duration.label` renders a seconds-based effect as raw seconds
 * ("1710 Seconds"), which is unreadable at a glance for anything longer than a
 * combat. Convert to the unit a human would actually say: rounds while a short
 * remainder is ticking down in combat, otherwise minutes / hours / days.
 *
 * Turn- and round-based durations are passed through untouched — Foundry
 * already labels those the way you would read them aloud.
 */
function formatDuration(duration) {
    if (!duration?.type || duration.type === 'none') return '';
    const fallback = duration?.label ? String(duration.label) : '';
    if (duration.type !== 'seconds') return fallback;

    const seconds = Number(duration.remaining ?? duration.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return fallback;

    const plural = (n, key, word) => `${n} ${localize(key, word)}${n === 1 ? '' : localize(`${key}-Plural`, 's')}`;

    if (game?.combat?.started && seconds <= ROUNDS_READ_BETTER_BELOW) {
        return plural(Math.ceil(seconds / 6), 'DurationUnit-Round', 'round');
    }
    if (seconds < 60) return plural(Math.ceil(seconds), 'DurationUnit-Second', 'second');
    if (seconds < 3600) return plural(Math.round(seconds / 60), 'DurationUnit-Minute', 'minute');
    if (seconds < 86400) return plural(Math.round(seconds / 3600), 'DurationUnit-Hour', 'hour');
    return plural(Math.round(seconds / 86400), 'DurationUnit-Day', 'day');
}

function getBibliosophOutcome(effect) {
    const outcome = getFlag(effect, 'coffee-pub-bibliosoph', 'outcomeBurst');
    if (!outcome) return null;
    const kind = String(outcome?.kind ?? outcome?.type ?? '').toLowerCase();
    const type = kind === 'injury' ? 'injury' : (kind === 'crit' || kind === 'critical' ? 'critical' : (kind === 'fumble' ? 'fumble' : 'effect'));
    const typeLabels = {
        injury: localize('ActiveEffectType-Injury', 'Injury'),
        critical: localize('ActiveEffectType-Critical', 'Critical'),
        fumble: localize('ActiveEffectType-Fumble', 'Fumble'),
        effect: localize('ActiveEffectType-Effect', 'Effect')
    };
    return {
        type,
        typeLabel: typeLabels[type],
        name: String(effect?.name ?? '').replace(/^(Critical|Fumble)\s*:\s*/i, '').trim(),
        conditionIds: outcome?.condition ? [String(outcome.condition)] : []
    };
}

/**
 * Read-only Active Effect normalization shared by Blacksmith and sibling modules.
 */
/**
 * Effects already announced as expired this session, by uuid.
 *
 * An expired effect stays expired across every subsequent tick, so without this
 * the event would fire on a loop for as long as the document survives. Cleared
 * when the effect is deleted, so a re-applied effect can expire again. Session
 * memory only: it is GM-side state about what this client has already said, and
 * nothing downstream depends on it persisting.
 */
const ANNOUNCED_EXPIRED = new Set();

export class EffectsAPI {
    static HOOKS = Object.freeze({
        changed: 'blacksmith.effects.changed',
        /**
         * The clock ran out. NOT "the effect was deleted" — see sweepExpired for
         * why those are deliberately different facts.
         */
        expired: 'blacksmith.effects.expired'
    });

    static isAvailable() {
        return true;
    }

    /**
     * Duration helpers, on the class because `api.effects` is the only handle a
     * consumer has — the module-level functions are not reachable from it.
     * `hasExpired` in particular exists so nobody writes their own: the two
     * shipped bugs it replaces were both a consumer assuming `remaining` is
     * always seconds.
     */
    static getRemaining(effect) { return getEffectRemaining(effect); }
    static hasExpired(effect) { return hasEffectExpired(effect); }
    static isTimesUpIntegrationEnabled() { return isTimesUpIntegrationEnabled(); }

    static initialize() {
        if (EffectsAPI._hookIds) return;
        conditionIndexCache = null;
        EffectsAPI._hookIds = {};
        for (const operation of ['create', 'update', 'delete']) {
            EffectsAPI._hookIds[operation] = Hooks.on(`${operation}ActiveEffect`, (effect) => {
                if (operation === 'delete') ANNOUNCED_EXPIRED.delete(effect?.uuid);
                EffectsAPI.emitChanged(effect, operation);
            });
        }

        // TICK SOURCES. Seconds durations move with the world clock; rounds
        // durations move with the combat tracker. Neither advances on its own,
        // so both are watched and neither is assumed to imply the other.
        //
        // THE GM CHECK CANNOT LIVE HERE. `initialize()` runs at `init`, before
        // `game.user` exists, so gating registration on `isGM` would evaluate
        // undefined on every client and register nothing anywhere. The listeners
        // are registered unconditionally and `sweepExpired` makes the decision
        // at call time, when there is a user to ask.
        EffectsAPI._hookIds.worldTime = Hooks.on('updateWorldTime', () => EffectsAPI.sweepExpired());
        EffectsAPI._hookIds.combat = Hooks.on('updateCombat', (_combat, changed) => {
            if (changed?.turn === undefined && changed?.round === undefined) return;
            EffectsAPI.sweepExpired();
        });
    }

    /**
     * Find effects whose clock has run out, announce each once, and settle who
     * deletes it.
     *
     * WHY THIS EXISTS AT ALL. Foundry core does not expire effects; Times Up
     * does, and it is optional. That left every consuming module with three
     * moves and no correct one: always delete (races Times Up), never delete
     * (effects linger forever without it), or check whether Times Up is
     * installed (forbidden to a satellite). The loser of the race cannot even
     * fail quietly — Foundry notifies from inside the socket response handler,
     * before the promise rejects, so a caller's catch is strictly too late.
     * Arbitration has to live in the one layer permitted to know Times Up is
     * there. See architecture-ownership.md.
     *
     * EXPIRED MEANS THE CLOCK RAN OUT, NOT THAT THE DOCUMENT IS GONE. Consumers
     * that need to know it was removed listen to `deleteActiveEffect`, which
     * fires whoever did the deleting. Keeping the two apart is what lets this
     * yield deletion to Times Up without the event's meaning changing.
     *
     * CONSUMERS MUST NOT DELETE ON EXPIRY. That is the whole contract: exactly
     * one actor deletes in every configuration, and it is Times Up or this.
     */
    static sweepExpired() {
        if (!game.user?.isGM) return;
        const yieldDeletion = isTimesUpIntegrationEnabled();
        for (const actor of game.actors ?? []) {
            if (!actor?.effects?.size) continue;
            for (const effect of actor.effects) {
                if (!hasEffectExpired(effect)) continue;
                const uuid = effect?.uuid;
                if (!uuid || ANNOUNCED_EXPIRED.has(uuid)) continue;
                ANNOUNCED_EXPIRED.add(uuid);
                EffectsAPI.emitExpired(effect, { deletedBy: yieldDeletion ? 'times-up' : 'blacksmith' });
                // Yield the delete when Times Up owns expiry; it will remove the
                // document on its own schedule and `deleteActiveEffect` carries
                // that fact. Otherwise nothing else will, so this does.
                if (!yieldDeletion) void EffectsAPI.deleteExpired(effect);
            }
        }
    }

    /**
     * Remove an effect whose clock ran out. Guarded rather than optimistic: a GM
     * can delete by hand between the sweep and this call, and the point of the
     * arbitration is that a lost race never reaches a user.
     */
    static async deleteExpired(effect) {
        try {
            if (!effect?.parent?.effects?.get?.(effect.id)) return false;
            await effect.delete();
            return true;
        } catch (error) {
            console.warn(`${MODULE.NAME} | Failed to delete expired effect`, effect?.uuid, error);
            return false;
        }
    }

    static emitExpired(effect, context = {}) {
        Hooks?.callAll?.(EffectsAPI.HOOKS.expired, {
            effect,
            actor: effect?.parent ?? null,
            remaining: getEffectRemaining(effect),
            ...context
        });
    }

    /**
     * Subscribe to expiry. Fires on the GM client only — it is the authoritative
     * one, and firing everywhere would need cross-client dedupe to say the same
     * thing. A consumer needing every client should listen to
     * `deleteActiveEffect`, which Foundry already broadcasts.
     */
    static onExpired(callback) {
        if (typeof callback !== 'function') throw new Error('EffectsAPI.onExpired requires a callback.');
        const hookId = Hooks.on(EffectsAPI.HOOKS.expired, callback);
        return () => Hooks.off(EffectsAPI.HOOKS.expired, hookId);
    }

    static registerClassifier(definition = {}) {
        const id = String(definition.id ?? '').trim();
        if (!id) throw new Error('EffectsAPI.registerClassifier requires a non-empty id.');
        if (typeof definition.classify !== 'function') throw new Error(`Effects classifier "${id}" requires a classify function.`);
        if (CLASSIFIERS.has(id) && definition.replace !== true) {
            throw new Error(`Effects classifier "${id}" is already registered.`);
        }
        const record = {
            id,
            priority: Number.isFinite(Number(definition.priority)) ? Number(definition.priority) : 0,
            classify: definition.classify,
            qualifies: typeof definition.qualifies === 'function' ? definition.qualifies : null,
            sequence: classifierSequence++
        };
        CLASSIFIERS.set(id, record);
        return () => EffectsAPI.unregisterClassifier(id);
    }

    static unregisterClassifier(id) {
        return CLASSIFIERS.delete(String(id ?? '').trim());
    }

    static getClassifier(id) {
        return CLASSIFIERS.get(String(id ?? '').trim()) ?? null;
    }

    static getClassifiers() {
        return Array.from(CLASSIFIERS.values())
            .sort((a, b) => b.priority - a.priority || a.sequence - b.sequence)
            .map(({ id, priority, classify, qualifies }) => ({ id, priority, classify, qualifies }));
    }

    static getConditionLabel(conditionId) {
        return getConditionIndex().byId.get(String(conditionId ?? '')) ?? String(conditionId ?? '');
    }

    /** Rebuild condition labels after a module changes CONFIG status definitions at runtime. */
    static refreshConditionIndex() {
        conditionIndexCache = null;
    }

    static getActiveEffects(actor, options = {}) {
        if (!actor) return [];
        const { includeDisabled = false, includeSuppressed = false, qualifyingOnly = true } = options;
        const conditionIndex = getConditionIndex();
        const classifiers = EffectsAPI.getClassifiers();
        const effects = actor?.effects?.contents ?? Array.from(actor?.effects ?? []);

        return effects.filter((effect) => {
            if (!includeDisabled && effect?.disabled) return false;
            if (!includeSuppressed && effect?.isSuppressed) return false;
            if (!qualifyingOnly) return true;

            const statuses = normalizeStatuses(effect);
            const hasKnownName = conditionIndex.byName.has(String(effect?.name ?? '').trim().toLowerCase());
            const classifierMatch = classifiers.some((classifier) => {
                if (!classifier.qualifies) return false;
                try {
                    return Boolean(classifier.qualifies(effect, { actor, api: EffectsAPI }));
                } catch (error) {
                    console.warn(`${MODULE.NAME} | Effects classifier "${classifier.id}" qualification failed`, error);
                    return false;
                }
            });
            return Boolean(
                classifierMatch ||
                effect?.isTemporary ||
                statuses.length ||
                hasKnownName
            );
        });
    }

    static async getDisplayEffects(actor, options = {}) {
        const effects = EffectsAPI.getActiveEffects(actor, options);
        const conditionIndex = getConditionIndex();
        const classifiers = EffectsAPI.getClassifiers();
        const canReadDescriptions = options.includeDescriptions === 'always' ||
            (options.includeDescriptions !== 'never' && Boolean(game?.user?.isGM || actor?.isOwner));
        const shouldEnrich = options.enrichDescriptions !== false && canReadDescriptions;
        const records = [];

        for (const effect of effects) {
            const statuses = normalizeStatuses(effect);
            const conditionIds = [...statuses];
            const namedConditionId = conditionIndex.byName.get(String(effect?.name ?? '').trim().toLowerCase());
            if (namedConditionId && !conditionIds.includes(namedConditionId)) conditionIds.push(namedConditionId);

            let classification = null;
            for (const classifier of classifiers) {
                try {
                    classification = await classifier.classify(effect, { actor, conditionIds: [...conditionIds], api: EffectsAPI });
                } catch (error) {
                    console.warn(`${MODULE.NAME} | Effects classifier "${classifier.id}" failed`, error);
                }
                if (classification) break;
            }

            for (const conditionId of (classification?.conditionIds ?? [])) {
                if (conditionId && !conditionIds.includes(String(conditionId))) conditionIds.push(String(conditionId));
            }
            const conditions = conditionIds.map((id) => conditionIndex.byId.get(id) ?? id);
            const duration = effect?.duration;
            const durationLabel = formatDuration(duration);
            const type = String(classification?.type ?? 'effect');
            const typeLabel = String(classification?.typeLabel ?? localize('ActiveEffectType-Effect', 'Effect'));
            const name = String(classification?.name ?? effect?.name ?? localize('ActiveEffectUnnamed', 'Unnamed Effect'));
            const description = canReadDescriptions ? String(effect?.description ?? '') : '';
            let descriptionHtml = '';
            if (description) {
                if (shouldEnrich) {
                    const TextEditorImpl = globalThis.foundry?.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
                    descriptionHtml = TextEditorImpl?.enrichHTML
                        ? await TextEditorImpl.enrichHTML(description, {
                            async: true,
                            relativeTo: effect,
                            rollData: actor?.getRollData?.() ?? {}
                        })
                        : description;
                } else {
                    descriptionHtml = description;
                }
            }

            records.push({
                id: effect?.id ?? null,
                uuid: effect?.uuid ?? null,
                name,
                fullName: String(effect?.name ?? name),
                img: String(effect?.img ?? 'icons/svg/aura.svg'),
                type,
                typeLabel,
                context: String(classification?.context ?? (type === 'effect' ? '' : conditions.join(', '))),
                conditionIds,
                conditions,
                durationLabel,
                // The number to compare, with the unit it is in. `durationLabel`
                // is the string to show; a consumer wanting to reason about time
                // left should read this and never parse that.
                remaining: getEffectRemaining(effect),
                descriptionHtml,
                sourceName: String(effect?.origin ?? '')
            });
        }

        for (const record of records) {
            if (record.type !== 'effect' || record.context || !record.conditionIds.length) continue;
            const source = records.find((candidate) =>
                candidate !== record &&
                candidate.type !== 'effect' &&
                candidate.conditionIds.some((id) => record.conditionIds.includes(id))
            );
            if (source) record.context = `${localize('ActiveEffectVia', 'via')} ${source.name}`;
        }

        for (const record of records) {
            record.detail = [record.typeLabel, record.context, record.durationLabel].filter(Boolean).join(' · ');
            record.tooltipHtml = [
                `<strong>${escapeHtml(record.name)}</strong>`,
                record.detail ? `<em>${escapeHtml(record.detail)}</em>` : '',
                record.descriptionHtml ? `<hr>${record.descriptionHtml}` : ''
            ].filter(Boolean).join('<br>');
        }
        return records;
    }

    static emitChanged(effect, operation = 'update') {
        Hooks?.callAll?.(EffectsAPI.HOOKS.changed, { effect, actor: effect?.parent ?? null, operation });
    }

    static onChanged(callback) {
        if (typeof callback !== 'function') throw new Error('EffectsAPI.onChanged requires a callback.');
        const hookId = Hooks.on(EffectsAPI.HOOKS.changed, callback);
        return () => Hooks.off(EffectsAPI.HOOKS.changed, hookId);
    }
}

EffectsAPI.registerClassifier({
    id: 'coffee-pub-blacksmith.bibliosoph-outcome',
    priority: -100,
    qualifies: (effect) => Boolean(getFlag(effect, 'coffee-pub-bibliosoph', 'outcomeBurst')),
    classify: getBibliosophOutcome
});
