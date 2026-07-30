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

    const keepFor = (give) => Math.max(0, resolvedMax - give);

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
         * Wire the control. Safe to call again after a host rerender — the
         * previous listener is released first.
         * @param {HTMLElement} container - Any ancestor of the rendered markup.
         */
        attach(container) {
            controller.destroy();
            input = container?.querySelector?.(`input[name="${CSS.escape(inputName)}"]`) ?? null;
            if (!input) return controller;
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

        /** The Give amount. */
        getValue() {
            return current;
        },

        /** The Keep amount — always max - value. */
        getKeep() {
            return keepFor(current);
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
