import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { SocketManager } from './manager-sockets.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';

export class CSSEditor extends BlacksmithWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-css-editor';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'blacksmith-css-editor',
            classes: ['blacksmith-css-editor'],
            position: { width: 800, height: 600 },
            window: { title: 'CSS Editor', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 700 }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-gmtools.hbs`
        }
    };

    static ACTION_HANDLERS = null;

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        super(opts);
        this.registerSettingsHandler();
        this._cmEditor = null;
        this._cmDarkCompartment = null;
        this._cmDarkTheme = null;
    }

    registerSettingsHandler() {
        game.settings.settings.get(`${MODULE.ID}.customCSS`).onChange = () => {
            const css = game.settings.get(MODULE.ID, 'customCSS');
            const transition = game.settings.get(MODULE.ID, 'cssTransition');
            this.applyCSS(css, transition);
        };
    }

    getData() {
        return {
            css: game.settings.get(MODULE.ID, 'customCSS'),
            transition: game.settings.get(MODULE.ID, 'cssTransition'),
            dark: game.settings.get(MODULE.ID, 'cssDarkMode')
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        const dark = game.settings.get(MODULE.ID, 'cssDarkMode');
        this.element.classList.toggle('dark-mode', dark);
        this._attachLocalListeners();
        await this._initCodeMirrorEditor();
    }

    _getEditorValue() {
        if (this._cmEditor) return this._cmEditor.state.doc.toString();
        return this.element.querySelector('textarea[name="css"]')?.value ?? '';
    }

    _attachLocalListeners() {
        const el = this.element;

        el.querySelector('.css-editor-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this._save();
        });

        el.querySelector('input[name="dark"]')?.addEventListener('change', (event) => {
            this.element.classList.toggle('dark-mode', event.target.checked);
            if (this._cmEditor && this._cmDarkCompartment) {
                this._cmEditor.dispatch({
                    effects: this._cmDarkCompartment.reconfigure(
                        event.target.checked ? this._cmDarkTheme : []
                    )
                });
            }
        });

        el.querySelector('.refresh-button')?.addEventListener('click', () => {
            window.location.reload();
        });

        el.querySelector('.copy-button')?.addEventListener('click', () => {
            navigator.clipboard.writeText(this._getEditorValue()).then(() => {
                ui.notifications.info('CSS copied to clipboard');
            }).catch(err => {
                ui.notifications.error('Failed to copy CSS');
                postConsoleAndNotification(MODULE.NAME, 'Failed to copy CSS', err, false, true);
            });
        });

        el.querySelector('.clear-button')?.addEventListener('click', async () => {
            if (this._getEditorValue().trim() === '') return;
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: 'Clear CSS Editor' },
                content: '<p>Are you sure you want to clear all CSS? This cannot be undone.</p>',
                rejectClose: false,
                modal: true,
                yes: { default: false },
                no: { default: true }
            });
            if (!confirmed) return;
            if (this._cmEditor) {
                this._cmEditor.dispatch({
                    changes: { from: 0, to: this._cmEditor.state.doc.length, insert: '' }
                });
            } else {
                const textarea = el.querySelector('textarea[name="css"]');
                if (textarea) textarea.value = '';
            }
            ui.notifications.info('CSS editor cleared');
        });

        el.querySelector('.world-button')?.addEventListener('click', () => {
            try {
                const existingButton = document.querySelector('button[data-action="openApp"][data-app="world"]');
                if (existingButton) { existingButton.click(); return; }
                if (ui?.world) { ui.world.render(true); return; }
                if (game.world?.sheet) { game.world.sheet.render(true); return; }
                const tempButton = document.createElement('button');
                tempButton.setAttribute('data-action', 'openApp');
                tempButton.setAttribute('data-app', 'world');
                document.body.appendChild(tempButton);
                tempButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                setTimeout(() => tempButton.remove(), 100);
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Error opening World Config', error, false, false);
                game.settings.sheet.render(true);
            }
        });

        el.querySelector('.settings-button')?.addEventListener('click', () => {
            game.settings.sheet.render(true);
        });
    }

    async _initCodeMirrorEditor() {
        if (this._cmEditor) {
            this._cmEditor.destroy();
            this._cmEditor = null;
            this._cmDarkCompartment = null;
        }

        let pkg = null;
        try {
            pkg = await import(`/modules/${MODULE.ID}/scripts/vendor/codemirror.mjs`);
        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, 'CSS Editor: vendor CM6 bundle not found, using textarea', { err }, true, false);
            return;
        }

        const { Compartment, EditorState, EditorView, keymap, lineNumbers, highlightActiveLine,
                defaultKeymap, history, historyKeymap, search, searchKeymap, css, oneDark } = pkg;

        const el = this.element;
        const textarea = el.querySelector('textarea[name="css"]');
        const container = el.querySelector('.editor-container');
        if (!textarea || !container) return;

        const dark = el.classList.contains('dark-mode');
        this._cmDarkCompartment = new Compartment();
        this._cmDarkTheme = oneDark ?? [];

        const state = EditorState.create({
            doc: textarea.value,
            extensions: [
                lineNumbers(),
                highlightActiveLine(),
                history(),
                css(),
                search({ top: false }),
                keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
                this._cmDarkCompartment.of(dark ? this._cmDarkTheme : [])
            ]
        });

        const cmDiv = document.createElement('div');
        cmDiv.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;';
        container.insertBefore(cmDiv, textarea);
        textarea.style.display = 'none';

        this._cmEditor = new EditorView({ state, parent: cmDiv });
        el.classList.add('has-cm-editor');
    }

    async _save() {
        const el = this.element;
        const css = this._getEditorValue();
        const transition = !!el.querySelector('input[name="transition"]')?.checked;
        const dark = !!el.querySelector('input[name="dark"]')?.checked;

        await game.settings.set(MODULE.ID, 'customCSS', css);
        await game.settings.set(MODULE.ID, 'cssTransition', transition);
        await game.settings.set(MODULE.ID, 'cssDarkMode', dark);

        this.element.classList.toggle('dark-mode', dark);
        this.applyCSS(css, transition);

        if (game.user.isGM) {
            const socket = SocketManager.getSocket();
            if (socket) {
                await socket.executeForOthers("updateCSS", { type: "updateCSS", css, transition, dark });
            }
        }

        ui.notifications.info('CSS changes applied');
    }

    async close(options = {}) {
        this._cmEditor?.destroy();
        this._cmEditor = null;
        this._cmDarkCompartment = null;
        this._cmDarkTheme = null;
        return super.close(options);
    }

    applyCSS(css, transition) {
        const styleId = 'blacksmith-custom-css';
        document.getElementById(styleId)?.remove();

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);

        if (transition) {
            const transitionStyle = document.createElement('style');
            transitionStyle.textContent = '* { transition: all 0.75s ease-in-out; }';
            document.head.appendChild(transitionStyle);
            setTimeout(() => transitionStyle.remove(), 750);
        }
    }
}
