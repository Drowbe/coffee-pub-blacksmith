import { MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';

export class CSSEditor extends FormApplication {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'blacksmith-css-editor',
            title: 'CSS Editor',
            template: `modules/${MODULE_ID}/templates/css-editor.hbs`,
            width: 800,
            height: 600,
            minWidth: 700,
            resizable: true,
            minimizable: true,
            classes: ['blacksmith-css-editor'],
            closeOnSubmit: false // Prevent closing on submit
        });
    }

    constructor(options = {}) {
        super(options);
        this.registerSettingsHandler();
    }

    registerSettingsHandler() {
        // Watch for settings changes
        game.settings.settings.get(`${MODULE_ID}.customCSS`).onChange = () => {
            const css = game.settings.get(MODULE_ID, 'customCSS');
            const transition = game.settings.get(MODULE_ID, 'cssTransition');
            this.applyCSS(css, transition);
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Add dark mode toggle listener
        html.find('input[name="dark"]').change(async (event) => {
            const isDark = event.target.checked;
            this.element[0].classList.toggle('dark-mode', isDark);
        });

        // Add refresh button listener
        html.find('.refresh-button').click(() => {
            window.location.reload();
        });

        // Add copy button listener
        html.find('.copy-button').click(() => {
            const textarea = html.find('textarea[name="css"]')[0];
            navigator.clipboard.writeText(textarea.value).then(() => {
                ui.notifications.info('CSS copied to clipboard');
            }).catch(err => {
                ui.notifications.error('Failed to copy CSS');
                console.error('Failed to copy CSS:', err);
            });
        });

        // Add clear button listener
        html.find('.clear-button').click(() => {
            const textarea = html.find('textarea[name="css"]')[0];
            if (textarea.value.trim() !== '') {
                Dialog.confirm({
                    title: 'Clear CSS Editor',
                    content: '<p>Are you sure you want to clear all CSS? This cannot be undone.</p>',
                    yes: () => {
                        textarea.value = '';
                        ui.notifications.info('CSS editor cleared');
                    }
                });
            }
        });

        // Add settings button listener
        html.find('.settings-button').click(() => {
            game.settings.sheet.render(true);
        });

        // Add modules button listener
        html.find('.modules-button').click(() => {
            game.settings.sheet.render(true, {activeMenu: 'modules'});
        });

        // Add smart indentation handlers
        const textarea = html.find('textarea[name="css"]')[0];
        textarea.addEventListener('keydown', this._handleEditorKeydown.bind(this));
    }

    _handleEditorKeydown(event) {
        // Handle Tab key
        if (event.key === 'Tab') {
            event.preventDefault();
            
            const textarea = event.target;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            
            // Insert 4 spaces
            const spaces = '    ';
            textarea.value = textarea.value.substring(0, start) + spaces + textarea.value.substring(end);
            
            // Move cursor after the inserted spaces
            textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
        }
        
        // Handle Enter key
        if (event.key === 'Enter') {
            event.preventDefault();
            
            const textarea = event.target;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const value = textarea.value;
            
            // Get the current line before the cursor
            const beforeCursor = value.substring(0, start);
            const currentLine = beforeCursor.split('\n').pop();
            
            // Calculate the indentation of the current line
            const indentMatch = currentLine.match(/^\s*/);
            const currentIndent = indentMatch ? indentMatch[0] : '';
            
            // Add extra indent if the line ends with an opening brace
            const extraIndent = currentLine.trimEnd().endsWith('{') ? '    ' : '';
            
            // Insert newline with proper indentation
            const insertion = '\n' + currentIndent + extraIndent;
            textarea.value = value.substring(0, start) + insertion + value.substring(end);
            
            // Move cursor to the end of the inserted indentation
            textarea.selectionStart = textarea.selectionEnd = start + insertion.length;
        }
    }

    getData() {
        return {
            css: game.settings.get(MODULE_ID, 'customCSS'),
            transition: game.settings.get(MODULE_ID, 'cssTransition'),
            dark: game.settings.get(MODULE_ID, 'cssDarkMode')
        };
    }

    async _updateObject(event, formData) {
        event.preventDefault();
        
        const css = formData.css;
        const transition = formData.transition;
        const dark = formData.dark;

        await game.settings.set(MODULE_ID, 'customCSS', css);
        await game.settings.set(MODULE_ID, 'cssTransition', transition);
        await game.settings.set(MODULE_ID, 'cssDarkMode', dark);

        // Apply dark mode
        this.element[0].classList.toggle('dark-mode', dark);

        // Apply the CSS
        this.applyCSS(css, transition);

        // Notify other clients
        if (game.user.isGM) {
            game.socket.emit('module.coffee-pub-blacksmith', {
                type: 'updateCSS',
                css: css,
                transition: transition,
                dark: dark
            });
        }

        // Show a notification that changes were applied
        ui.notifications.info('CSS changes applied');
    }

    applyCSS(css, transition) {
        let styleId = 'blacksmith-custom-css';
        let existingStyle = document.getElementById(styleId);
        
        if (existingStyle) {
            existingStyle.remove();
        }

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);

        if (transition) {
            const transitionStyle = document.createElement('style');
            transitionStyle.textContent = '* { transition: all 0.75s ease-in-out; }';
            document.head.appendChild(style);
            
            setTimeout(() => {
                transitionStyle.remove();
            }, 750);
        }
    }

    async render(force = false, options = {}) {
        // First call super.render and await its completion
        const result = await super.render(force, options);
        
        // Only try to access the element after render is complete
        if (this.element && this.element[0]) {
            const dark = game.settings.get(MODULE_ID, 'cssDarkMode');
            this.element[0].classList.toggle('dark-mode', dark);
        }
        
        return result;
    }
} 