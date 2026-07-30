// ==================================================================
// ===== API-DIALOG.JS ==============================================
// ==================================================================
//
// Shared helpers over foundry.applications.api.DialogV2: confirm,
// choose, prompt, wait. Presentation and promise semantics only — no
// domain logic, no cross-client state, no template loading. Consumers
// render their own content and hand it over as a string or a DOM node.
//
// The contract this exists to enforce: USER DISMISSAL NEVER REJECTS.
// Escape and the title-bar close resolve closeValue; an explicit Cancel
// resolves cancelValue. Only a consumer callback throwing can reject.
//
// Every helper routes through DialogV2.wait(). Three facts from the v13
// API shape this module, and all three were verified against the
// published docs rather than inferred:
//
//   1. `render` and `close` are DialogV2WaitOptions — options of the
//      STATIC methods, not the constructor. `new DialogV2({render})`
//      silently ignores them, which is why this module never uses the
//      constructor directly.
//   2. wait() resolves the button callback's return value, or the
//      button's `action` string when that value is nullish, or null on
//      dismissal (rejectClose defaults to false in v13). The submit
//      button therefore returns a wrapper object so a real value is
//      never confused with an action name.
//   3. DialogV2 has NO supported way to stay open after a button is
//      clicked. Validation is therefore a re-prompt loop: on an invalid
//      value the dialog reopens carrying the message and the previous
//      input. Pass `content` as a function to control that redisplay.
//
// See documentation/api/api-dialog.md.

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

const ROOT_CLASS = 'blacksmith-dialog';
const ERROR_CLASS = 'blacksmith-dialog-error';

/** Marks a submit button's payload so a value is never mistaken for an action name. */
const VALUE_KEY = '__blacksmithDialogValue';

/** Result vocabulary shared by choose/prompt/wait. `confirm` resolves a boolean. */
export const DIALOG_ACTIONS = Object.freeze({
    SUBMIT: 'submit',
    CANCEL: 'cancel',
    CLOSE: 'close'
});

const DEFAULT_CANCEL_LABEL = 'Cancel';
const DEFAULT_CANCEL_ICON = 'fa-solid fa-xmark';
const CANCEL_ACTION = 'cancel';

/**
 * Normalize content for DialogV2, which accepts `string | HTMLDivElement`.
 * A string is passed through and Foundry sanitizes it with cleanHTML. A DOM
 * node is passed as a node so its identity and listeners survive — wrapped in
 * a div when it is not already one, because that is the type DialogV2 takes.
 * @param {string|HTMLElement|Promise<string|HTMLElement>} content
 * @returns {Promise<string|HTMLDivElement>}
 */
async function resolveContent(content) {
    const value = await content;
    if (value == null) return '';
    if (value instanceof HTMLDivElement) return value;
    if (value instanceof HTMLElement) {
        const wrapper = document.createElement('div');
        wrapper.append(value);
        return wrapper;
    }
    return String(value);
}

/** Prepend the validation message to already-resolved content. */
function withErrorBanner(content, message) {
    if (!message) return content;
    if (content instanceof HTMLDivElement) {
        const banner = document.createElement('div');
        banner.className = ERROR_CLASS;
        banner.setAttribute('role', 'alert');
        banner.textContent = String(message);
        content.prepend(banner);
        return content;
    }
    const safe = foundry.utils.escapeHTML(String(message));
    return `<div class="${ERROR_CLASS}" role="alert">${safe}</div>${content}`;
}

/** Build the dialog's CSS classes. */
function dialogClasses(extra = [], { destructive = false } = {}) {
    const classes = [ROOT_CLASS];
    if (destructive) classes.push('blacksmith-dialog-destructive');
    if (Array.isArray(extra)) classes.push(...extra.filter(c => typeof c === 'string' && c.trim()));
    else if (typeof extra === 'string' && extra.trim()) classes.push(extra.trim());
    return classes;
}

/** Omit undefined/null keys so Foundry's own defaults survive. */
function compact(object) {
    const out = {};
    for (const [key, value] of Object.entries(object || {})) {
        if (value !== undefined && value !== null) out[key] = value;
    }
    return out;
}

/**
 * Apply Blacksmith styling and disabled state to the rendered buttons.
 * Done from the render callback because `class` and `disabled` are not
 * documented DialogV2Button fields, whereas the render hook is.
 */
function decorateButtons(dialog, descriptors) {
    const root = dialog?.element;
    if (!root) return;
    for (const descriptor of descriptors) {
        const element = root.querySelector(`button[data-action="${CSS.escape(descriptor.action)}"]`);
        if (!element) continue;
        element.classList.add(descriptor.destructive
            ? 'blacksmith-window-btn-critical'
            : (descriptor.primary ? 'blacksmith-window-btn-primary' : 'blacksmith-window-btn-secondary'));
        if (descriptor.description) element.dataset.tooltip = descriptor.description;
        if (descriptor.disabled) element.disabled = true;
    }
}

/**
 * One call into DialogV2.wait(). Returns the raw resolution: null when
 * dismissed, an action string, or a submit button's wrapper object.
 *
 * @param {Object} config
 * @param {Array<Object>} config.buttons - Descriptors: { action, label, icon,
 *   default, primary, destructive, disabled, description, callback }
 * @returns {Promise<*>}
 */
async function openDialog({
    title = '',
    content = '',
    buttons = [],
    modal = true,
    classes = [],
    position = null,
    destructive = false,
    focusSelector = null,
    onRender = null
} = {}) {
    return foundry.applications.api.DialogV2.wait(compact({
        window: { title },
        content,
        modal,
        rejectClose: false,
        classes: dialogClasses(classes, { destructive }),
        position: position || undefined,
        buttons: buttons.map(button => compact({
            action: button.action,
            label: button.label,
            icon: button.icon,
            default: button.default ? true : undefined,
            callback: button.callback
        })),
        render: (_event, dialog) => {
            decorateButtons(dialog, buttons);
            if (focusSelector) {
                dialog.element?.querySelector?.(focusSelector)?.focus?.();
            }
            try {
                onRender?.(dialog.element, dialog);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Dialog: onRender failed', error, false, false);
            }
        }
    }));
}

// ===== PUBLIC API =====

/**
 * Yes/no confirmation. Resolves a boolean — the shape every existing Blacksmith
 * call site consumes.
 *
 * Implemented with explicit buttons rather than DialogV2.confirm so the action
 * names are ours, which keeps button styling and labelling deterministic.
 *
 * @param {Object} options
 * @param {string} options.title
 * @param {string|HTMLElement|Promise<string|HTMLElement>} options.content
 * @param {string} [options.confirmLabel='Yes']
 * @param {string} [options.confirmIcon='fa-solid fa-check']
 * @param {string} [options.cancelLabel='Cancel']
 * @param {string} [options.cancelIcon]
 * @param {boolean} [options.destructive=false] - Critical styling on confirm.
 * @param {'cancel'|'confirm'} [options.defaultAction='cancel'] - Focused button.
 * @param {boolean} [options.closeValue=false] - Resolved on Escape / close / Cancel.
 * @param {boolean} [options.modal=true]
 * @returns {Promise<boolean>}
 */
async function confirm(options = {}) {
    const {
        title = '',
        content = '',
        confirmLabel = 'Yes',
        confirmIcon = 'fa-solid fa-check',
        cancelLabel = DEFAULT_CANCEL_LABEL,
        cancelIcon = DEFAULT_CANCEL_ICON,
        destructive = false,
        defaultAction = 'cancel',
        closeValue = false,
        modal = true,
        classes = [],
        position = null
    } = options;

    const confirmIsDefault = defaultAction === 'confirm';
    const result = await openDialog({
        title,
        content: await resolveContent(content),
        modal,
        classes,
        position,
        destructive,
        buttons: [
            {
                action: CANCEL_ACTION,
                label: cancelLabel,
                icon: cancelIcon,
                default: !confirmIsDefault
            },
            {
                action: 'confirm',
                label: confirmLabel,
                icon: confirmIcon,
                default: confirmIsDefault,
                destructive,
                primary: !destructive
            }
        ]
    });

    if (result === 'confirm') return true;
    if (result === CANCEL_ACTION) return false;
    return closeValue;
}

/**
 * One choice from several. The only helper with no DialogV2 equivalent.
 *
 * @param {Object} options
 * @param {Array<{id: string, label: string, icon?: string, description?: string,
 *   disabled?: boolean, destructive?: boolean, default?: boolean,
 *   callback?: Function}>} options.choices
 *   `description` renders as the button's tooltip. `callback` receives the id.
 * @param {boolean} [options.showCancel=true]
 * @returns {Promise<{action: string, value: *, result: *}>}
 */
async function choose(options = {}) {
    const {
        title = '',
        content = '',
        choices = [],
        showCancel = true,
        cancelLabel = DEFAULT_CANCEL_LABEL,
        cancelIcon = DEFAULT_CANCEL_ICON,
        cancelValue = null,
        closeValue = null,
        modal = true,
        classes = [],
        position = null,
        onRender = null
    } = options;

    const list = (Array.isArray(choices) ? choices : []).filter(choice => choice && choice.id != null);
    if (!list.length) throw new Error('dialog.choose requires at least one choice.');

    const buttons = list.map(choice => ({
        action: `choice-${choice.id}`,
        label: choice.label ?? String(choice.id),
        icon: choice.icon,
        default: Boolean(choice.default),
        destructive: Boolean(choice.destructive),
        disabled: Boolean(choice.disabled),
        description: choice.description,
        primary: !choice.destructive,
        // Synchronous: the consumer's callback runs after wait() resolves, so
        // nothing here depends on whether DialogV2 awaits button callbacks.
        callback: () => ({ [VALUE_KEY]: choice.id })
    }));

    if (showCancel) {
        buttons.push({ action: CANCEL_ACTION, label: cancelLabel, icon: cancelIcon });
    }

    const result = await openDialog({
        title,
        content: await resolveContent(content),
        modal,
        classes,
        position,
        onRender,
        destructive: list.some(choice => choice.destructive),
        buttons
    });

    if (result && typeof result === 'object' && VALUE_KEY in result) {
        const id = result[VALUE_KEY];
        const chosen = list.find(choice => choice.id === id);
        return {
            action: DIALOG_ACTIONS.SUBMIT,
            value: id,
            result: typeof chosen?.callback === 'function' ? await chosen.callback(id) : undefined
        };
    }
    if (result === CANCEL_ACTION) {
        return { action: DIALOG_ACTIONS.CANCEL, value: cancelValue, result: undefined };
    }
    return { action: DIALOG_ACTIONS.CLOSE, value: closeValue, result: undefined };
}

/**
 * Collect and validate a value from consumer-rendered content.
 *
 * DialogV2 cannot stay open after a button is clicked, so an invalid value
 * REOPENS the dialog carrying the message. Pass `content` as a function to
 * control that redisplay — it receives `{ value, error, attempt }`, where
 * `value` is the previous input. A plain string reopens unchanged with the
 * message banner above it.
 *
 * @param {Object} options
 * @param {string|HTMLElement|Function|Promise<string|HTMLElement>} options.content
 * @param {Function} options.getValue - (root) => value. `root` is the submit
 *   button's owning form, so `root.elements.foo.value` works.
 * @param {Function} [options.validate] - (value) => string|null. A returned
 *   string reopens the dialog with that message.
 * @param {Function} [options.onSubmit] - (value) => any. Throwing reopens the
 *   dialog with the error message. Its return value becomes `result`.
 * @param {number} [options.maxAttempts=10] - Reopen ceiling, so a validator that
 *   can never pass cannot loop forever.
 * @returns {Promise<{action: string, value: *, result: *}>}
 */
async function prompt(options = {}) {
    const {
        title = '',
        content = '',
        getValue = null,
        validate = null,
        onSubmit = null,
        submitLabel = 'OK',
        submitIcon = 'fa-solid fa-check',
        cancelLabel = DEFAULT_CANCEL_LABEL,
        cancelIcon = DEFAULT_CANCEL_ICON,
        showCancel = true,
        destructive = false,
        cancelValue = null,
        closeValue = null,
        modal = true,
        classes = [],
        position = null,
        focusSelector = null,
        onRender = null,
        maxAttempts = 10
    } = options;

    let previous = null;
    let message = null;

    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
        // The function form exists only to pre-fill the previous input; the
        // message banner is always this helper's job, either way.
        const base = typeof content === 'function'
            ? content({ value: previous, error: message, attempt })
            : content;
        const resolved = withErrorBanner(await resolveContent(base), message);

        const buttons = [];
        if (showCancel) {
            buttons.push({ action: CANCEL_ACTION, label: cancelLabel, icon: cancelIcon });
        }
        buttons.push({
            action: DIALOG_ACTIONS.SUBMIT,
            label: submitLabel,
            icon: submitIcon,
            default: true,
            destructive,
            primary: !destructive,
            // `button.form` is the documented way to reach the dialog's form.
            callback: (_event, button, dialog) => ({
                [VALUE_KEY]: typeof getValue === 'function'
                    ? getValue(button.form ?? dialog.element)
                    : undefined
            })
        });

        const result = await openDialog({
            title,
            content: resolved,
            modal,
            classes,
            position,
            destructive,
            focusSelector,
            onRender,
            buttons
        });

        if (result === CANCEL_ACTION) {
            return { action: DIALOG_ACTIONS.CANCEL, value: cancelValue, result: undefined };
        }
        if (!result || typeof result !== 'object' || !(VALUE_KEY in result)) {
            return { action: DIALOG_ACTIONS.CLOSE, value: closeValue, result: undefined };
        }

        // getValue runs inside the button callback because the form is gone once
        // the dialog closes; awaiting here covers a consumer returning a promise.
        const value = await result[VALUE_KEY];

        if (typeof validate === 'function') {
            let invalid = null;
            try {
                invalid = await validate(value);
            } catch (error) {
                invalid = error?.message || 'Validation failed.';
            }
            if (invalid) {
                previous = value;
                message = String(invalid);
                continue;
            }
        }

        if (typeof onSubmit === 'function') {
            try {
                return {
                    action: DIALOG_ACTIONS.SUBMIT,
                    value,
                    result: await onSubmit(value)
                };
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Dialog: onSubmit failed', error, false, false);
                previous = value;
                message = error?.message || 'Something went wrong.';
                continue;
            }
        }

        return { action: DIALOG_ACTIONS.SUBMIT, value, result: undefined };
    }

    // Attempt ceiling reached; surface the last message rather than looping.
    if (message) ui.notifications?.warn(message);
    return { action: DIALOG_ACTIONS.CLOSE, value: closeValue, result: undefined };
}

/**
 * Custom buttons with the shared dismissal contract. Use when confirm/choose/prompt
 * do not fit; prefer those when they do.
 *
 * @param {Object} options
 * @param {Array<{action: string, label: string, icon?: string, default?: boolean,
 *   destructive?: boolean, disabled?: boolean, callback?: Function}>} options.buttons
 *   `callback` receives the dialog's form element and its return value becomes
 *   `result`. It runs after the dialog has closed, so read any DOM state you
 *   need from that form rather than expecting a live dialog.
 * @returns {Promise<{action: string, value: *, result: *}>}
 */
async function wait(options = {}) {
    const {
        title = '',
        content = '',
        buttons = [],
        onRender = null,
        focusSelector = null,
        closeValue = null,
        cancelValue = null,
        modal = true,
        classes = [],
        position = null
    } = options;

    const list = (Array.isArray(buttons) ? buttons : []).filter(button => button && button.action);
    if (!list.length) throw new Error('dialog.wait requires at least one button.');

    const result = await openDialog({
        title,
        content: await resolveContent(content),
        modal,
        classes,
        position,
        onRender,
        focusSelector,
        destructive: list.some(button => button.destructive),
        buttons: list.map(button => ({
            action: button.action,
            label: button.label ?? button.action,
            icon: button.icon,
            default: Boolean(button.default),
            destructive: Boolean(button.destructive),
            disabled: Boolean(button.disabled),
            primary: Boolean(button.default) && !button.destructive,
            // Synchronous. The form is captured here because it is gone once the
            // dialog closes; the consumer's callback runs after wait() resolves.
            callback: (_event, element, dialog) => ({
                [VALUE_KEY]: button.action,
                form: element?.form ?? dialog?.element ?? null
            })
        }))
    });

    if (result && typeof result === 'object' && VALUE_KEY in result) {
        const action = result[VALUE_KEY];
        const activated = list.find(button => button.action === action);
        return {
            action: action === CANCEL_ACTION ? DIALOG_ACTIONS.CANCEL : DIALOG_ACTIONS.SUBMIT,
            value: action === CANCEL_ACTION ? cancelValue : action,
            result: typeof activated?.callback === 'function'
                ? await activated.callback(result.form)
                : undefined
        };
    }
    return { action: DIALOG_ACTIONS.CLOSE, value: closeValue, result: undefined };
}

/**
 * Public surface — exposed as module.api.dialog. See documentation/api/api-dialog.md.
 */
const DialogAPI = {
    confirm,
    choose,
    prompt,
    wait,
    ACTIONS: DIALOG_ACTIONS
};

export { DialogAPI };
