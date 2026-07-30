// ==================================================================
// ===== BLACKSMITH DIALOG API TEST =================================
// ==================================================================

/**
 * Manual test script for module.api.dialog (scripts/api-dialog.js).
 *
 * USAGE:
 * 1. Reload Foundry so the new module files load (F5).
 * 2. Open the console (F12).
 * 3. Paste this whole script once. It defines DT.* and runs nothing.
 * 4. Run the checks one at a time — each opens a dialog you interact with.
 *
 *    await DT.wired()      // no interaction; run this first
 *    await DT.dismiss()    // THE contract: dismissal must not reject
 *    await DT.confirmYes()
 *    await DT.choose()     // the only helper with no Blacksmith call site
 *    await DT.validate()   // the reopen-on-invalid loop
 *    await DT.asyncFail()
 *    await DT.asyncOk()
 *    await DT.attemptCeiling()
 *    await DT.domContent()
 *    await DT.wait()
 *    await DT.diagnose()   // run this if a primary button seems to do nothing
 *
 * Watch the console throughout. Any "Uncaught (in promise)" is a failure:
 * the entire point of these helpers is that dismissal resolves.
 */

const DT = {};

DT.api = () => {
    const dialog = game.modules.get('coffee-pub-blacksmith')?.api?.dialog;
    if (!dialog) throw new Error('api.dialog is missing — is Blacksmith enabled and reloaded?');
    return dialog;
};

/** No interaction. Confirms the surface is wired and the stylesheet loaded. */
DT.wired = async () => {
    const dialog = DT.api();
    const surface = ['confirm', 'choose', 'prompt', 'wait']
        .filter(name => typeof dialog[name] !== 'function');
    const styled = [...document.styleSheets].some((sheet) => {
        try {
            return [...sheet.cssRules].some(rule => String(rule.cssText).includes('blacksmith-dialog'));
        } catch (_) {
            return false;
        }
    });
    console.log('api.dialog keys      :', Object.keys(dialog));
    console.log('missing helpers      :', surface.length ? surface : 'none');
    console.log('ACTIONS              :', dialog.ACTIONS);
    console.log('dialog.css loaded    :', styled ? 'yes' : 'NO — check the @import in styles/default.css');
    return { ok: !surface.length && styled };
};

/**
 * The contract. Press Escape, then run again and use the title-bar X.
 * Both must resolve false. Neither may throw.
 */
DT.dismiss = async () => {
    const result = await DT.api().confirm({
        title: 'Dismissal Contract',
        content: '<p>Dismiss this with <strong>Escape</strong> or the title-bar X.</p><p>It must resolve <code>false</code>, not throw.</p>'
    });
    console.log('resolved:', result, '(expected: false)');
    return result;
};

/** Click the destructive confirm button. Also check it looks like a Blacksmith button. */
DT.confirmYes = async () => {
    const result = await DT.api().confirm({
        title: 'Delete Something',
        content: '<p>Click <strong>Delete It</strong>. Then run again and click Cancel.</p>',
        confirmLabel: 'Delete It',
        confirmIcon: 'fa-solid fa-trash',
        destructive: true
    });
    console.log('resolved:', result, '(expected: true on Delete It, false on Cancel)');
    console.log('CHECK: was the confirm button styled red/critical? If it looked like a plain');
    console.log('Foundry button, styleButtons() did not match the action names — cosmetic only.');
    return result;
};

/**
 * choose() has no Blacksmith consumer, so this is its only coverage.
 * Try: All Scenes, then Cancel, then Escape, then the disabled entry.
 */
DT.choose = async () => {
    const result = await DT.api().choose({
        title: 'Delete Pins',
        content: '<p>Pick a scope. Try the disabled entry too — it must not respond.</p>',
        choices: [
            { id: 'scene', label: 'Current Scene', icon: 'fa-solid fa-map' },
            { id: 'all', label: 'All Scenes', icon: 'fa-solid fa-globe', destructive: true },
            { id: 'blocked', label: 'Unavailable', icon: 'fa-solid fa-ban', disabled: true, description: 'Disabled on purpose — hover for this tooltip.' }
        ]
    });
    console.log('resolved:', result);
    console.log('expected: {action:"submit", value:"all"} | {action:"cancel"} | {action:"close"}');
    return result;
};

/**
 * Validation reopens the dialog — DialogV2 cannot stay open once a button is
 * clicked. Press Enter on the empty field (tests Enter-to-submit AND the reopen
 * loop), type something, press Enter again.
 */
DT.validate = async () => {
    const result = await DT.api().prompt({
        title: 'Validation Reopens',
        content: ({ value, attempt }) => `<p>Attempt ${attempt}. Leave this empty and press <strong>Enter</strong> — the dialog must reopen with a message above. Then type something and press Enter.</p>`
            + `<input name="thing" class="blacksmith-input" type="text" value="${value ?? ''}" placeholder="Type here">`,
        focusSelector: '[name="thing"]',
        getValue: root => root.elements.thing?.value.trim() ?? '',
        validate: value => value ? null : 'Enter a value.',
        cancelValue: '',
        closeValue: ''
    });
    console.log('resolved:', result);
    console.log('CHECK: input focused on open? Did empty+Enter reopen with the message and');
    console.log('the attempt counter incrementing? Was previously typed text preserved?');
    return result;
};

/** A throwing onSubmit must reopen the dialog carrying the error message. */
DT.asyncFail = async () => {
    let calls = 0;
    const result = await DT.api().prompt({
        title: 'Async Failure',
        content: '<p>Click <strong>OK</strong>. After a pause the dialog must reopen showing "Deliberate failure". Then dismiss with Escape.</p>',
        getValue: () => 'fixed-value',
        onSubmit: async () => {
            calls++;
            await new Promise(resolve => setTimeout(resolve, 1200));
            throw new Error('Deliberate failure');
        },
        closeValue: 'dismissed'
    });
    console.log('onSubmit invocations:', calls, '(one per OK click)');
    console.log('resolved:', result, '(expected: {action:"close", value:"dismissed"})');
    return result;
};

/** maxAttempts must stop a validator that can never pass. */
DT.attemptCeiling = async () => {
    let attempts = 0;
    const result = await DT.api().prompt({
        title: 'Attempt Ceiling',
        content: '<p>Click <strong>OK</strong> three times. It must stop after 3, not loop forever.</p>',
        getValue: () => 'whatever',
        validate: () => { attempts++; return 'Never valid.'; },
        maxAttempts: 3,
        closeValue: 'ceiling'
    });
    console.log('validate calls:', attempts, '(expected: 3)');
    console.log('resolved:', result, '(expected: {action:"close", value:"ceiling"})');
    return result;
};

/** The success path: closes and carries the callback's return value through as `result`. */
DT.asyncOk = async () => {
    const result = await DT.api().prompt({
        title: 'Async Success',
        content: '<p>Click <strong>OK</strong> once and wait.</p>',
        getValue: () => 'collected',
        onSubmit: async () => {
            await new Promise(resolve => setTimeout(resolve, 1200));
            return 'callback-return';
        }
    });
    console.log('resolved:', result);
    console.log('expected: {action:"submit", value:"collected", result:"callback-return"}');
    return result;
};

/**
 * DOM content must stay literal — this is why content accepts an HTMLElement.
 * The tag below must be visible AS TEXT, and no alert may fire.
 */
DT.domContent = async () => {
    const node = document.createElement('div');
    node.textContent = '<script>alert("parsed!")</script> — this must appear as literal text';
    const result = await DT.api().confirm({
        title: 'Literal DOM Content',
        content: node
    });
    console.log('resolved:', result);
    console.log('CHECK: was the script tag shown as text, with no alert?');
    return result;
};

/**
 * Diagnostic for "the primary button did nothing / resolved empty".
 * Reports which internal mechanism actually drove the result, so the cause is
 * observable rather than inferred. Type a value and click Save.
 */
DT.diagnose = async () => {
    const seen = [];
    const probe = (event) => seen.push(`${event.type} on .${[...(event.currentTarget.classList ?? [])].join('.') || 'unknown'}`);
    document.addEventListener('click', probe, true);
    document.addEventListener('submit', probe, true);
    try {
        const outcome = await DT.api().prompt({
            title: 'Diagnostic',
            content: '<p>Type something and click <strong>Save</strong>.</p>'
                + '<input name="d" class="blacksmith-input" type="text" value="typed-value">',
            submitLabel: 'Save',
            getValue: (root) => {
                const direct = root?.querySelector('[name="d"]')?.value ?? null;
                console.log('getValue root tag  :', root?.tagName, '| found input:', direct !== null);
                if (direct === null) {
                    console.log('root did NOT contain the input — contentRootOf() picked the wrong element.');
                }
                return direct ?? '';
            },
            cancelValue: '',
            closeValue: ''
        });
        console.log('events observed    :', seen.length ? seen : 'none');
        console.log('resolved           :', outcome);
        if (outcome.action === 'close') {
            console.log('DIAGNOSIS: resolved as close, so no activation ran. Either _onRender did not');
            console.log('fire (no listeners bound) or the button action name did not match.');
        } else if (outcome.action === 'submit' && !outcome.value) {
            console.log('DIAGNOSIS: activation ran but getValue returned empty — root/selector mismatch.');
        } else if (outcome.action === 'submit') {
            console.log('DIAGNOSIS: working as intended.');
        }
        return outcome;
    } finally {
        document.removeEventListener('click', probe, true);
        document.removeEventListener('submit', probe, true);
    }
};

/** Custom buttons through wait(). */
DT.wait = async () => {
    const result = await DT.api().wait({
        title: 'Token Move Request',
        content: '<p>A player wants to move a token. Try Allow, then Deny, then Escape.</p>',
        buttons: [
            { action: 'cancel', label: 'Deny', icon: 'fa-solid fa-xmark' },
            { action: 'allow', label: 'Allow', icon: 'fa-solid fa-check', default: true, callback: async () => 'approved' }
        ]
    });
    console.log('resolved:', result);
    console.log('expected: {action:"submit", value:"allow", result:"approved"} | {action:"cancel"} | {action:"close"}');
    return result;
};

window.DT = DT;
console.log('Blacksmith dialog tests ready. Start with: await DT.wired()');
