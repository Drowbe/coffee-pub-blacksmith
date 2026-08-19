// ==================================================================
// ===== API-QUANTITY-SPLIT.JS ======================================
// ==================================================================
//
// Shared Give / Keep quantity control: a range input flanked by the two
// halves of a split, where Keep is always max - Give. Presentation and
// value handling only. It owns no submit, cancel, close, socket,
// transfer, or document mutation behavior — the host owns all of that,
// and owns what the number means.
//
// Contributed by Squire (contributions/blacksmith in that repo) rather
// than recreated from a description, which is the only way "preserve the
// existing Give/Keep experience" could actually be guaranteed. Blacksmith
// owns the naming, the markup contract, the CSS, and this controller.
//
// Packaged as create() -> { html, attach, ... } to match api.entityList,
// because a consumer composing a transfer window uses both in the same
// body and two integration models there would be gratuitous. Squire's
// contribution arrived as a Handlebars partial; the markup is unchanged
// apart from that packaging, plus aria-valuetext so a screen reader
// announces the split rather than a bare number.
//
// See documentation/api/api-quantity-split.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

function esc(value) {
    return foundry.utils.escapeHTML(String(value ?? ''));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * Create a Give/Keep quantity control.
 *
 * Build it, put `html` into your window body or dialog content, then call
 * `attach(root)` once that markup is in the document.
 *
 * @param {Object} config
 * @param {number} config.max - Stack size. Required; must be at least 1.
 * @param {number} [config.value=min] - Initial Give amount, clamped into range.
 * @param {number} [config.min=1] - Smallest transferable amount.
 * @param {string} [config.inputName='blacksmith-quantity'] - Input name and id.
 * @param {string} [config.giveLabel='Give']
 * @param {string} [config.keepLabel='Keep']
 * @param {string} [config.amountLabel='Transfer Amount']
 * @param {Function} [config.onChange] - ({ value, keep, min, max, sourceEvent }) => void.
 *   Fires on user changes only, not on attach or setValue.
 * @returns {Object} controller
 */
function create(config = {}) {
    const {
        max,
        min = 1,
        value = null,
        inputName = 'blacksmith-quantity',
        giveLabel = 'Give',
        keepLabel = 'Keep',
        amountLabel = 'Transfer Amount',
        onChange = null
    } = config;

    const resolvedMin = Number.isFinite(Number(min)) ? Math.max(0, Math.floor(Number(min))) : 1;
    const resolvedMax = Math.max(resolvedMin, Number.isFinite(Number(max)) ? Math.floor(Number(max)) : resolvedMin);
    if (!Number.isFinite(Number(max))) {
        postConsoleAndNotification(MODULE.NAME, 'Quantity split: max is required and must be a number', config, false, false);
    }

    let current = clamp(
        Number.isFinite(Number(value)) ? Math.floor(Number(value)) : resolvedMin,
        resolvedMin,
        resolvedMax
    );

    let input = null;
    let giveOutput = null;
    let keepOutput = null;
    let detach = null;
    let attached = null;

    const keepFor = (give) => Math.max(0, resolvedMax - give);

    /**
     * Say so when a controller-state getter is read after a FAILED bind.
     *
     * Gated on `attached === false` rather than on `!input`, which is the distinction that keeps
     * this from crying wolf: null means attach was never attempted, and reading the initial value
     * before render is legitimate. False means it was attempted, found nothing, and the caller is
     * now acting on a number the user never chose.
     *
     * Once per controller. A submit handler can read several times and the second warning teaches
     * nobody anything.
     */
    let warnedUnbound = false;
    const warnIfUnbound = (method) => {
        if (attached !== false || warnedUnbound) return;
        warnedUnbound = true;
        postConsoleAndNotification(
            MODULE.NAME,
            `Quantity split: ${method}() read after attach() found no input named "${inputName}". ` +
            'This reports the value the control was created with, not the user\'s. Use readFrom(root).',
            '',
            false,
            false
        );
    };

    /** Push `current` into the DOM. Never fires onChange — that is for user input. */
    const sync = () => {
        if (!input) return;
        input.value = String(current);
        if (giveOutput) giveOutput.textContent = String(current);
        if (keepOutput) keepOutput.textContent = String(keepFor(current));
        input.setAttribute('aria-valuetext', `${giveLabel} ${current}, ${keepLabel} ${keepFor(current)}`);
    };

    const controller = {
        /** Markup to inject. Attach after it is in the document. */
        get html() {
            return `
                <div class="blacksmith-quantity-split" data-quantity-split
                     data-min="${resolvedMin}" data-max="${resolvedMax}">
                    <output class="blacksmith-quantity-split-value" data-quantity-give
                            for="${esc(inputName)}">${current}</output>
                    <input type="range" id="${esc(inputName)}" name="${esc(inputName)}"
                           value="${current}" min="${resolvedMin}" max="${resolvedMax}" step="1"
                           aria-label="${esc(amountLabel)}"
                           aria-valuetext="${esc(`${giveLabel} ${current}, ${keepLabel} ${keepFor(current)}`)}">
                    <output class="blacksmith-quantity-split-value" data-quantity-keep
                            for="${esc(inputName)}">${keepFor(current)}</output>
                    <span class="blacksmith-quantity-split-caption" data-quantity-give-label>${esc(giveLabel)}</span>
                    <span class="blacksmith-quantity-split-caption blacksmith-quantity-split-caption-amount">${esc(amountLabel)}</span>
                    <span class="blacksmith-quantity-split-caption" data-quantity-keep-label>${esc(keepLabel)}</span>
                </div>`;
        },

        min: resolvedMin,
        max: resolvedMax,
        inputName,

        /**
         * True once `attach` has found its input, false once it has failed to.
         * Null before either has happened.
         *
         * Binding failure used to be invisible: `attach` returned the controller either way, so a
         * host could not tell a wired control from an inert one, and every consumer wrote the same
         * defensive read-the-form fallback. Check this, or use `readFrom`.
         */
        get attached() {
            return attached;
        },

        /**
         * Wire the control. Safe to call again after a host rerender — the
         * previous listener is released first.
         * @param {HTMLElement} container - Any ancestor of the rendered markup.
         * @returns {Object} The controller, for chaining. Read `attached` for success.
         */
        attach(container) {
            controller.destroy();
            input = container?.querySelector?.(`input[name="${CSS.escape(inputName)}"]`) ?? null;
            if (!input) {
                attached = false;
                return controller;
            }
            attached = true;
            const element = input.closest('[data-quantity-split]');
            giveOutput = element?.querySelector('[data-quantity-give]') ?? null;
            keepOutput = element?.querySelector('[data-quantity-keep]') ?? null;

            const listener = (event) => {
                const next = clamp(Number(input.value) || resolvedMin, resolvedMin, resolvedMax);
                const changed = next !== current;
                current = next;
                sync();
                if (!changed) return;
                try {
                    onChange?.({
                        value: current,
                        keep: keepFor(current),
                        min: resolvedMin,
                        max: resolvedMax,
                        sourceEvent: event
                    });
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, 'Quantity split: onChange threw', error, false, false);
                }
            };
            input.addEventListener('input', listener);
            detach = () => input?.removeEventListener('input', listener);

            // Bring the DOM in line with the controller's value, which also
            // covers a host that rendered stale markup.
            sync();
            return controller;
        },

        /**
         * The Give amount as the controller understands it.
         *
         * This is listener-maintained state, so it is only the user's answer if `attach` bound the
         * input. An unbound control reports the value it was created with — a plausible number
         * rather than a wrong-looking one, which is why the failure went unnoticed in two modules.
         * When you are reading to act on the answer and can name the root, prefer `readFrom`.
         */
        getValue() {
            warnIfUnbound('getValue');
            return current;
        },

        /**
         * The Give amount read out of the DOM, correct whether or not binding succeeded.
         *
         * Reading and binding are separate concerns and only binding can fail. `attach` exists for
         * live behaviour — moving captions, `onChange` — while this exists to answer "what does the
         * control say right now", which the DOM can always answer. Use it at submit time.
         *
         * Falls back to `getValue()` only when the input genuinely is not in `container`, which is
         * the case where there is no answer to read.
         *
         * @param {HTMLElement} container - Any ancestor of the rendered markup.
         * @returns {number} Clamped into the control's range.
         */
        readFrom(container) {
            const live = container?.querySelector?.(`input[name="${CSS.escape(inputName)}"]`) ?? null;
            if (!live) return current;
            return clamp(Number(live.value) || resolvedMin, resolvedMin, resolvedMax);
        },

        /**
         * The Keep amount — always max - value. Carries the same dependency on `attach` as
         * `getValue`, because it is derived from the same state.
         */
        getKeep() {
            warnIfUnbound('getKeep');
            return keepFor(current);
        },

        /**
         * The Keep amount derived from the DOM. The counterpart to `readFrom`, and correct on the
         * same terms. Exists so a caller reading Keep does not have to do `max - readFrom(root)`
         * by hand and get the clamp subtly wrong.
         * @param {HTMLElement} container
         * @returns {number}
         */
        readKeepFrom(container) {
            return keepFor(controller.readFrom(container));
        },

        /** Set the Give amount. Clamped into range. Does not fire onChange. */
        setValue(next) {
            current = clamp(
                Number.isFinite(Number(next)) ? Math.floor(Number(next)) : resolvedMin,
                resolvedMin,
                resolvedMax
            );
            sync();
            return controller;
        },

        /** Release the input listener. Idempotent. */
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

/**
 * Public surface — exposed as module.api.quantitySplit.
 * See documentation/api/api-quantity-split.md.
 */
const QuantitySplitAPI = { create };

export { QuantitySplitAPI };
