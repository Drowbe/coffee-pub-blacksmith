import { MODULE } from './const.js';

const CLASSIFIERS = new Map();
let classifierSequence = 0;

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
    return { byId, byName };
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
export class EffectsAPI {
    static HOOKS = Object.freeze({
        changed: 'blacksmith.effects.changed'
    });

    static isAvailable() {
        return true;
    }

    static initialize() {
        if (EffectsAPI._hookIds) return;
        EffectsAPI._hookIds = {};
        for (const operation of ['create', 'update', 'delete']) {
            EffectsAPI._hookIds[operation] = Hooks.on(`${operation}ActiveEffect`, (effect) => {
                EffectsAPI.emitChanged(effect, operation);
            });
        }
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
            const durationLabel = duration?.type && duration.type !== 'none' && duration?.label ? String(duration.label) : '';
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
