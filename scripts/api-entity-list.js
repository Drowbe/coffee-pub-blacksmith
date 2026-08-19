// ==================================================================
// ===== API-ENTITY-LIST.JS =========================================
// ==================================================================
//
// Shared selectable-entity presentation: a single- or multi-select list
// of users, actors, tokens, party members, or anything a consumer can
// describe. Presentation only. It opens and closes nothing, submits no
// form, touches no socket, mutates no document, changes no ownership,
// and sends no notification. The host owns all of that.
//
// It is an EMBEDDED component, so it has no submit/cancel/close and no
// action vocabulary — it reports selection and lets the host read or set
// it. The { action: 'submit' | 'cancel' | 'close' } vocabulary belongs to
// something owning an open/close lifecycle, which means api.dialog or the
// host window.
//
// Built on native radio/checkbox inputs rather than a custom roving
// tabindex widget. That is deliberate: keyboard navigation, focus rings,
// group semantics, and screen-reader announcement come from the platform
// instead of being reimplemented, and multi-select stays readable with
// plain form APIs (root.querySelectorAll('[name="x"]:checked')) so a host
// can keep an existing form contract unchanged.
//
// See documentation/api/api-entity-list.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

const DEFAULT_IMG = 'icons/svg/mystery-man.svg';

export const ENTITY_LIST_MODES = Object.freeze({
    SINGLE: 'single',
    MULTI: 'multi'
});

function esc(value) {
    return foundry.utils.escapeHTML(String(value ?? ''));
}

function classAttr(...values) {
    const classes = values.flat().filter(value => typeof value === 'string' && value.trim());
    return classes.length ? ` class="${esc(classes.join(' '))}"` : '';
}

/**
 * Normalize a caller's descriptor. Unknown keys are preserved on `data` so a
 * host can round-trip its own payload through getSelection().
 * @param {Object} entity
 * @returns {Object|null}
 */
function normalizeEntity(entity) {
    if (!entity || entity.id == null) return null;
    return {
        id: String(entity.id),
        uuid: entity.uuid ?? null,
        name: entity.name ?? String(entity.id),
        img: entity.img || DEFAULT_IMG,
        type: entity.type ?? null,
        group: entity.group ? String(entity.group) : null,
        disabled: Boolean(entity.disabled),
        disabledReason: entity.disabledReason ?? null,
        badges: Array.isArray(entity.badges) ? entity.badges.filter(Boolean) : [],
        metadata: entity.metadata ?? null,
        className: entity.className ?? null,
        data: entity
    };
}

/** One row. Disabled rows carry a visible reason, not just a tooltip. */
function renderEntity(entity, { mode, inputName, selected, itemClass }) {
    const isMulti = mode === ENTITY_LIST_MODES.MULTI;
    const inputType = isMulti ? 'checkbox' : 'radio';
    const isSelected = selected.has(entity.id);
    const reason = entity.disabled && entity.disabledReason ? entity.disabledReason : null;

    const badges = entity.badges
        .map(badge => `<span class="blacksmith-badge${badge.variant ? ` blacksmith-badge-${esc(badge.variant)}` : ''}">${esc(badge.label ?? badge)}</span>`)
        .join('');

    return `
        <label${classAttr('blacksmith-entity', itemClass, entity.className, entity.disabled ? 'disabled' : '')}
               data-entity-id="${esc(entity.id)}"${entity.uuid ? ` data-entity-uuid="${esc(entity.uuid)}"` : ''}${reason ? ` data-tooltip="${esc(reason)}"` : ''}>
            <input type="${inputType}" name="${esc(inputName)}" value="${esc(entity.id)}"${isSelected ? ' checked' : ''}${entity.disabled ? ' disabled' : ''}>
            <img class="blacksmith-entity-img" src="${esc(entity.img)}" alt="">
            <span class="blacksmith-entity-body">
                <span class="blacksmith-entity-name">${esc(entity.name)}</span>
                ${entity.type ? `<span class="blacksmith-entity-type">${esc(entity.type)}</span>` : ''}
                ${reason ? `<span class="blacksmith-entity-reason">${esc(reason)}</span>` : ''}
            </span>
            ${badges ? `<span class="blacksmith-entity-badges">${badges}</span>` : ''}
        </label>`;
}

/**
 * Create a selectable entity list.
 *
 * Returns a controller carrying the markup to inject plus the read/write
 * surface. Build it, put `html` into your window body or dialog content, then
 * call `attach(root)` once that markup is in the document.
 *
 * @param {Object} config
 * @param {Array<Object>} config.entities - Descriptors:
 *   { id, uuid, name, img, type, group, disabled, disabledReason, badges, metadata, className }
 *
 *   `group` is an optional section label. Rows are NOT reordered — a header is
 *   emitted where a group's first member appears, so the caller controls
 *   section order by ordering the entities.
 * @param {'single'|'multi'} [config.mode='single']
 * @param {string} [config.inputName] - Input `name`, so a host can preserve an
 *   existing form contract. Defaults to 'blacksmith-entity'.
 * @param {string|Array<string>} [config.selected] - Pre-selected id(s).
 * @param {string} [config.itemClass] - Extra class on every row, for host skinning.
 * @param {string} [config.listClass] - Extra class on the container.
 * @param {string} [config.emptyMessage] - Shown when there are no entities.
 * @param {Function} [config.filter] - (entity) => boolean, applied before render.
 * @param {Function} [config.onSelectionChange] - ({ selected, changed, sourceEvent }) => void
 * @returns {Object} controller
 */
function create(config = {}) {
    const {
        entities = [],
        mode = ENTITY_LIST_MODES.SINGLE,
        inputName = 'blacksmith-entity',
        selected = [],
        itemClass = '',
        listClass = '',
        emptyMessage = 'No entries available.',
        filter = null,
        onSelectionChange = null
    } = config;

    const normalizedMode = mode === ENTITY_LIST_MODES.MULTI
        ? ENTITY_LIST_MODES.MULTI
        : ENTITY_LIST_MODES.SINGLE;

    let list = (Array.isArray(entities) ? entities : [])
        .map(normalizeEntity)
        .filter(Boolean);

    if (typeof filter === 'function') {
        list = list.filter((entity) => {
            try {
                return Boolean(filter(entity.data));
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Entity list: filter threw', error, false, false);
                return false;
            }
        });
    }

    const byId = new Map(list.map(entity => [entity.id, entity]));

    // A disabled entity can never be pre-selected: the host would otherwise
    // read back a selection the user cannot change or clear.
    const initial = new Set(
        (Array.isArray(selected) ? selected : [selected])
            .filter(id => id != null)
            .map(String)
            .filter(id => byId.get(id) && !byId.get(id).disabled)
    );
    if (normalizedMode === ENTITY_LIST_MODES.SINGLE && initial.size > 1) {
        const first = [...initial][0];
        initial.clear();
        initial.add(first);
    }

    let root = null;
    let detach = null;
    let attached = null;

    const inputsIn = (container) => (container
        ? [...container.querySelectorAll(`input[name="${CSS.escape(inputName)}"]`)]
        : []);

    const inputs = () => inputsIn(root);

    const readSelectionFrom = (container) => inputsIn(container)
        .filter(input => input.checked)
        .map(input => byId.get(input.value)?.data)
        .filter(Boolean);

    /**
     * Say so when a controller-state getter is read after a FAILED bind.
     *
     * Gated on `attached === false`, not on `!root`: null means attach was never attempted, and
     * reading the normalised initial selection before render is legitimate. False means it was
     * attempted, found nothing, and the caller is about to act on an answer the user never gave.
     *
     * The message names whether this list LIES or merely goes quiet, because the two failures need
     * different fixes and the difference is invisible from the API. A list created with a selection
     * hands that selection back as though it were chosen; a list created empty returns nothing and
     * the operation simply does not happen.
     */
    let warnedUnbound = false;
    const warnIfUnbound = (method) => {
        if (attached !== false || warnedUnbound) return;
        warnedUnbound = true;
        postConsoleAndNotification(
            MODULE.NAME,
            `Entity list: ${method}() read after attach() found no rows named "${inputName}". ` +
            (initial.size
                ? 'This returns the selection the list was CREATED with, which is indistinguishable from a user choice.'
                : 'This returns nothing selected, so the operation will silently do nothing.') +
            ' Use readFrom(root).',
            '',
            false,
            false
        );
    };

    const readSelection = () => {
        // No root means nothing was ever bound, so there is no rendered answer to read and the
        // initial selection is the only thing left to report. It is also indistinguishable from a
        // real answer, which is the whole trap: a host that never attached, or whose attach
        // silently failed, gets back what it passed in and cannot tell. `readFrom` takes the root
        // explicitly and never lands here.
        if (!root) {
            return [...initial].map(id => byId.get(id)?.data).filter(Boolean);
        }
        return inputs()
            .filter(input => input.checked)
            .map(input => byId.get(input.value)?.data)
            .filter(Boolean);
    };

    const controller = {
        /** Markup to inject. Attach after it is in the document. */
        get html() {
            const renderRow = (entity) => renderEntity(entity, {
                mode: normalizedMode,
                inputName,
                selected: initial,
                itemClass
            });

            // Group headers are emitted inline rather than by bucketing the
            // list: entities keep the order the caller gave them, and a group
            // appears where its first member does. Callers that want a
            // particular section order simply supply the entities in it.
            //
            // `aria-hidden` on the header keeps it out of the radiogroup's
            // options — a heading between radios is announced as a stray item
            // otherwise — while the group name still reaches assistive tech
            // through each row's own type label.
            let seenGroup = null;
            const rows = list.length
                ? list.map(entity => {
                    let prefix = '';
                    if (entity.group && entity.group !== seenGroup) {
                        seenGroup = entity.group;
                        prefix = `<div class="blacksmith-entity-group" aria-hidden="true">${esc(entity.group)}</div>`;
                    }
                    return prefix + renderRow(entity);
                }).join('')
                : `<div class="blacksmith-entity-empty">${esc(emptyMessage)}</div>`;
            return `<div${classAttr('blacksmith-entity-list', `blacksmith-entity-list-${normalizedMode}`, listClass)}
                         role="${normalizedMode === ENTITY_LIST_MODES.MULTI ? 'group' : 'radiogroup'}"
                         data-entity-input="${esc(inputName)}">${rows}</div>`;
        },

        /** The entities actually rendered, after filtering. */
        get entities() {
            return list.map(entity => entity.data);
        },

        mode: normalizedMode,
        inputName,

        /**
         * True once `attach` has found rows to read, false once it has not.
         * Null before either has happened.
         *
         * Binding failure used to be invisible: `attach` returned the controller either way, so a
         * host could not tell a wired control from an inert one, and every consumer wrote the same
         * defensive read-the-form fallback. Check this, or use `readFrom`.
         *
         * It reports whether any matching input was present when `attach` ran, not merely whether a
         * container was supplied, because an empty container is the failure that actually happens —
         * a root that exists while the markup never made it in. The listener is delegated on the
         * root and is bound regardless, so rows that arrive later still work; a false here means
         * "nothing to read yet", which is worth surfacing rather than worth throwing.
         */
        get attached() {
            return attached;
        },

        /**
         * Wire change events. Safe to call again after a host rerender — the
         * previous listener is released first.
         * @param {HTMLElement} container - Any ancestor of the rendered markup.
         * @returns {Object} The controller, for chaining. Read `attached` for success.
         */
        attach(container) {
            controller.destroy();
            root = container ?? null;
            if (!root) {
                attached = false;
                return controller;
            }
            attached = inputs().length > 0;
            const handler = (event) => {
                const target = event.target;
                if (!target?.name || target.name !== inputName) return;
                const changed = byId.get(target.value)?.data ?? null;
                try {
                    onSelectionChange?.({
                        selected: readSelection(),
                        changed,
                        sourceEvent: event
                    });
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, 'Entity list: onSelectionChange threw', error, false, false);
                }
            };
            root.addEventListener('change', handler);
            detach = () => root?.removeEventListener('change', handler);
            return controller;
        },

        /**
         * Currently selected entities, in the caller's original descriptor form.
         *
         * Depends on `attach` having bound a root. Unbound, it reports the selection the list was
         * created with — a plausible answer rather than a wrong-looking one, which is why the
         * failure went unnoticed in two modules. When you are reading to act on the answer and can
         * name the root, prefer `readFrom`.
         */
        getSelection() {
            warnIfUnbound('getSelection');
            return readSelection();
        },

        /**
         * Selected ids only. Carries the same dependency on `attach` as `getSelection`, because it
         * is the same read with a map over it — a consumer reaching for ids has not opted out of
         * anything, and this is the one most reached for first.
         */
        getSelectedIds() {
            warnIfUnbound('getSelectedIds');
            return readSelection().map(entity => String(entity.id));
        },

        /**
         * The selection read out of the DOM, correct whether or not binding succeeded.
         *
         * Reading and binding are separate concerns and only binding can fail. `attach` exists for
         * live behaviour — `onSelectionChange` — while this exists to answer "what is ticked right
         * now", which the DOM can always answer. Use it at submit time.
         *
         * Unlike `getSelection` it never falls back to the initial selection: a container with no
         * rows returns nothing selected, which is the truth, rather than an answer the caller
         * supplied and could mistake for the user's.
         *
         * @param {HTMLElement} container - Any ancestor of the rendered markup.
         * @returns {Array<Object>} Selected entities in the caller's descriptor form.
         */
        readFrom(container) {
            return readSelectionFrom(container);
        },

        /**
         * Selected ids read out of the DOM. See `readFrom`.
         * @param {HTMLElement} container
         * @returns {Array<string>}
         */
        readIdsFrom(container) {
            return readSelectionFrom(container).map(entity => String(entity.id));
        },

        /**
         * Set the selection. Disabled entities are ignored; in single mode only
         * the first valid id is applied.
         * @param {string|Array<string>} ids
         */
        setSelection(ids) {
            const wanted = new Set((Array.isArray(ids) ? ids : [ids])
                .filter(id => id != null)
                .map(String)
                .filter(id => byId.get(id) && !byId.get(id).disabled));
            if (normalizedMode === ENTITY_LIST_MODES.SINGLE && wanted.size > 1) {
                const first = [...wanted][0];
                wanted.clear();
                wanted.add(first);
            }
            initial.clear();
            for (const id of wanted) initial.add(id);
            for (const input of inputs()) {
                if (input.disabled) continue;
                input.checked = wanted.has(input.value);
            }
            return controller;
        },

        /** Release the change listener. Idempotent. */
        destroy() {
            try {
                detach?.();
            } catch (_) { /* listener already gone */ }
            detach = null;
            return controller;
        }
    };

    return controller;
}

// ===== PROVIDERS =====
//
// Convenience adapters producing descriptor arrays. A host can always build
// descriptors itself; these exist so the common cases are not retyped. They
// only shape data — none of them filter by permission, which is the host's job.

/**
 * @param {Object} [options]
 * @param {boolean} [options.includeGM=false]
 * @param {boolean} [options.activeOnly=false] - Omit offline users entirely.
 * @param {boolean} [options.disableOffline=true] - Keep offline users, disabled.
 * @returns {Array<Object>}
 */
function fromUsers({ includeGM = false, activeOnly = false, disableOffline = true } = {}) {
    return (game.users?.contents ?? [])
        .filter(user => includeGM || !user.isGM)
        .filter(user => !activeOnly || user.active)
        .map(user => ({
            id: user.id,
            uuid: user.uuid ?? null,
            name: user.character?.name || user.name,
            img: user.character?.img || user.avatar || DEFAULT_IMG,
            disabled: disableOffline ? !user.active : false,
            disabledReason: (disableOffline && !user.active) ? 'Offline' : null,
            className: user.active ? null : 'offline',
            data: user
        }));
}

/**
 * @param {Object} [options]
 * @param {string} [options.type='character']
 * @param {boolean} [options.playerOwnedOnly=true]
 * @returns {Array<Object>}
 */
function fromActors({ type = 'character', playerOwnedOnly = true } = {}) {
    return (game.actors?.contents ?? [])
        .filter(actor => !type || actor.type === type)
        .filter(actor => !playerOwnedOnly || actor.hasPlayerOwner)
        .map(actor => ({
            id: actor.id,
            uuid: actor.uuid,
            name: actor.name,
            img: actor.img || DEFAULT_IMG,
            data: actor
        }));
}

/**
 * Tokens on the current scene.
 * @returns {Array<Object>}
 */
function fromTokens() {
    return (canvas?.tokens?.placeables ?? [])
        .filter(token => token?.document)
        .map(token => ({
            id: token.id,
            uuid: token.document.uuid,
            name: token.document.name || token.actor?.name || token.id,
            img: token.document.texture?.src || token.actor?.img || DEFAULT_IMG,
            data: token
        }));
}

/**
 * Public surface — exposed as module.api.entityList.
 * See documentation/api/api-entity-list.md.
 */
const EntityListAPI = {
    create,
    MODES: ENTITY_LIST_MODES,
    providers: {
        fromUsers,
        fromActors,
        fromTokens
    }
};

export { EntityListAPI };
