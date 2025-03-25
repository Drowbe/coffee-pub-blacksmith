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
            resizable: true,
            minimizable: true,
            classes: ['blacksmith-css-editor']
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

    getData() {
        return {
            css: game.settings.get(MODULE_ID, 'customCSS'),
            transition: game.settings.get(MODULE_ID, 'cssTransition')
        };
    }

    async _updateObject(event, formData) {
        const css = formData.css;
        const transition = formData.transition;

        await game.settings.set(MODULE_ID, 'customCSS', css);
        await game.settings.set(MODULE_ID, 'cssTransition', transition);

        // Apply the CSS
        this.applyCSS(css, transition);

        // Notify other clients
        if (game.user.isGM) {
            game.socket.emit('module.coffee-pub-blacksmith', {
                type: 'updateCSS',
                css: css,
                transition: transition
            });
        }
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
            document.head.appendChild(transitionStyle);
            
            setTimeout(() => {
                transitionStyle.remove();
            }, 750);
        }
    }
} 