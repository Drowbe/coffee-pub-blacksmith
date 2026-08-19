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
 *
 * A string is passed through and Foundry sanitizes it with cleanHTML. A DOM
 * node is moved into a freshly created, attribute-free wrapper div: DialogV2
 * rejects a content element carrying any attributes at all ("config.content
 * element must have no attributes"), so handing a consumer's `<div class="...">`
 * straight through would throw. Wrapping keeps the consumer's own attributes,
 * because they are markup inside the wrapper rather than attributes on it.
 *
 * WHAT PASSING A NODE DOES NOT BUY YOU: identity, or listeners. DialogV2 reads
 * `options.content.innerHTML` and keeps the STRING (foundry.mjs:57177), then
 * builds the dialog by assigning `innerHTML` on a new form (foundry.mjs:57196).
 * The node handed in is never inserted. Anything bound to it before the dialog
 * opened is bound to an element the user never sees, and the failure is silent —
 * the markup renders and inputs still report values, so an unbound control looks
 * alive while reporting only its initial state.
 *
 * Bind after render, not before: pass controllers as `controls`, or use
 * `onRender`. This comment previously claimed the opposite and two consuming
 * modules independently wrote polling workarounds against it.
 *
 * @param {string|HTMLElement|Promise<string|HTMLElement>} content
 * @returns {Promise<string|HTMLDivElement>}
 */
async function resolveContent(content) {
    const value = await content;
    if (value == null) return '';
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
 * Make Enter activate the button marked `default`.
 *
 * HTML implicit submission activates the FIRST submit button in DOM order, not
 * the one flagged default. `prompt` renders Cancel first so the row reads
 * left-to-right, which meant Enter in a text field cancelled the dialog —
 * silently, and looking exactly like the user choosing to cancel. Intercepting
 * keydown and clicking the intended button is the smallest fix that depends on
 * neither button order nor DialogV2's internal button rendering.
 *
 * Textareas and contenteditable are left alone: Enter is a newline there.
 */
function bindEnterToDefault(dialog, buttons) {
    const root = dialog?.element;
    if (!root || root.dataset.blacksmithEnterBound) return;
    const fallback = buttons.find(button => button.default);
    if (!fallback) return;
    root.dataset.blacksmithEnterBound = 'true';
    root.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
        const target = event.target;
        const tag = target?.tagName;
        if (tag === 'TEXTAREA' || tag === 'BUTTON' || target?.isContentEditable) return;
        const button = root.querySelector(`button[data-action="${CSS.escape(fallback.action)}"]`);
        if (!button || button.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        button.click();
    });
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
 * Attach embedded Blacksmith controls once the dialog's markup is in the document.
 *
 * This exists because a control CANNOT be attached before the dialog opens: DialogV2
 * serializes element content to a string and rebuilds it (see `resolveContent`), so
 * anything bound beforehand is bound to a discarded node. Every control exposing the
 * `{ html, attach, destroy }` contract — `api.entityList`, `api.quantitySplit` — is
 * attached to the dialog root, which is a valid ancestor for their delegated listeners.
 *
 * Runs on EVERY render, which matters for `prompt`: an invalid value reopens the dialog,
 * and the reopened one is new markup. `attach` releases its previous listener first, so
 * re-attaching is correct rather than cumulative.
 *
 * Controls are deliberately NOT destroyed when the dialog closes. A button callback reads
 * its value after close, and tearing the controller down first would empty what the caller
 * asked for.
 *
 * @param {Object} dialog
 * @param {Array<Object>} controls
 */
function attachControls(dialog, controls) {
    const root = dialog?.element;
    if (!root || !controls.length) return;
    for (const control of controls) {
        if (typeof control?.attach !== 'function') {
            postConsoleAndNotification(MODULE.NAME, 'Dialog: a controls entry has no attach() and was skipped', control, false, false);
            continue;
        }
        try {
            control.attach(root);
            // A control that binds nothing does not throw — it returns and reports its own state.
            // Saying so here is the point: an unbound control renders identically and still answers
            // getValue()/getSelection() with the value it was created with, so without this the
            // only symptom is a user's input being quietly ignored at submit time.
            if (control.attached === false) {
                postConsoleAndNotification(
                    MODULE.NAME,
                    `Dialog: a control found nothing to bind to (input name "${control.inputName ?? 'unknown'}"). ` +
                    'Its markup is probably missing from `content`. Read it with readFrom(element) rather than ' +
                    'getValue()/getSelection(), which report the initial value when unbound.',
                    '',
                    false,
                    false
                );
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Dialog: control attach failed', error, false, false);
        }
    }
}

/** Accept one controller or a list, and drop the empties. */
function normalizeControls(controls) {
    if (!controls) return [];
    return (Array.isArray(controls) ? controls : [controls]).filter(Boolean);
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
/**
 * Dialogs are NOT modal by default.
 *
 * A modal DialogV2 calls <dialog>.showModal(), which puts it in the browser's top layer behind an
 * inert backdrop - every element behind it stops receiving events. That is right for a question
 * that must be answered before anything else happens, and wrong for a value prompt raised from an
 * already-open window, which is the common case: the window that asked is part of what gets frozen.
 *
 * The default was `true` until 2026-08-08, and the first consumer to combine `api.dialog` with
 * `api.quantitySplit` inside its own window got a whole interface locked behind a quantity slider.
 * Neither API was misused; the default was wrong.
 *
 * `confirm` is the exception, and it defaults to `modal: destructive` rather than to a flat value:
 * a destructive confirmation is exactly the stop-and-decide case, and leaving the window behind it
 * live would let a user act on something else while being asked to confirm deleting it. Blacksmith's
 * own delete confirms already pass `destructive: true`, so they stay modal without a call-site change.
 *
 * `modal: true` is still accepted everywhere.
 */
async function openDialog({
    title = '',
    content = '',
    buttons = [],
    modal = false,
    classes = [],
    position = null,
    destructive = false,
    focusSelector = null,
    onRender = null,
    controls = []
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
            bindEnterToDefault(dialog, buttons);
            // Before onRender and before focusing: a consumer's onRender may reasonably
            // expect its controls to be live, and focusing an input the control owns
            // should happen after that control is bound to it.
            attachControls(dialog, controls);
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
 * @param {boolean} [options.modal=destructive] - Modal by default only for a destructive confirm.
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
        modal = destructive,
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
 * @param {Object|Array<Object>} [options.controls] - Controls to bind once the dialog has
 *   rendered; anything exposing `attach(root)`. See `resolveContent`.
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
        modal = false,
        classes = [],
        position = null,
        onRender = null,
        controls = []
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
        controls: normalizeControls(controls),
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
 * @param {Object|Array<Object>} [options.controls] - Controls to bind after each render;
 *   anything exposing `attach(root)`, such as `api.entityList` or `api.quantitySplit`.
 *   They cannot be bound before the call — see `resolveContent`.
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
        modal = false,
        classes = [],
        position = null,
        focusSelector = null,
        onRender = null,
        controls = [],
        maxAttempts = 10
    } = options;

    const controlList = normalizeControls(controls);
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
            // Re-attached on every attempt: a rejected value reopens the dialog, and the
            // reopened one is fresh markup that the previous binding does not reach.
            controls: controlList,
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
 * @param {Object|Array<Object>} [options.controls] - Controls to bind once the dialog has
 *   rendered; anything exposing `attach(root)`, such as `api.entityList` or
 *   `api.quantitySplit`. They cannot be bound before the call — see `resolveContent`.
 * @param {Function} [options.onRender] - (element, dialog), after every render.
 * @returns {Promise<{action: string, value: *, result: *}>}
 */
async function wait(options = {}) {
    const {
        title = '',
        content = '',
        buttons = [],
        onRender = null,
        controls = [],
        focusSelector = null,
        closeValue = null,
        cancelValue = null,
        modal = false,
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
        controls: normalizeControls(controls),
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
