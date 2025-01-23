// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { BLACKSMITH, MODULE_ID, MODULE_TITLE } from './const.js'
import { COFFEEPUB, postConsoleAndNotification, playSound } from './global.js';

// ================================================================== 
// ===== CLASSES ====================================================
// ================================================================== 

export class BlacksmithWindowBrowser extends FormApplication {
    constructor(url) {
        super();
        this.onFormSubmit;
        this.formTitle;
        this.url = url || 'https://google.com'; // Default URL if none provided
    }

    static get defaultOptions() {
        const defaults = super.defaultOptions;
        const overrides = {
            width: 'auto',
            id: MODULE_ID + "-browser",
            template: BLACKSMITH.WINDOW_BROWSER,
            title: BLACKSMITH.WINDOW_BROWSER_TITLE,
            resizable: true,
            top: JSON.parse(localStorage.getItem(MODULE_ID + "-browserWindowPosition"))?.top || 200,
            left: JSON.parse(localStorage.getItem(MODULE_ID + "-browserWindowPosition"))?.left || 200,
        };
        return foundry.utils.mergeObject(defaults, overrides);
    }

    async close() {
        const position = { top: this.position.top, left: this.position.left };
        localStorage.setItem(MODULE_ID + "-browserWindowPosition", JSON.stringify(position));
        this.destroy(); // Call destroy method before closing
        return super.close();  
    }

    destroy() {
        // Remove the iframe load event listener
        const iframe = this.element.find('#blacksmith-browser');
        iframe.off('load');

        // Remove any other event listeners you might have added
        // For example, if you've added any click handlers:
        // this.element.find('.some-button').off('click');

        // Clear any timers or intervals if you've set any
        // clearInterval(this.someInterval);
        // clearTimeout(this.someTimeout);

        // Nullify any references that might prevent garbage collection
        this.onFormSubmit = null;
        this.formTitle = null;
        this.url = null;

        // Call destroy on the parent class if it exists
        if (super.destroy) {
            super.destroy();
        }
    }

    activateListeners(html) {
        super.activateListeners(html);
        let iframe = html.find('#blacksmith-browser');
        iframe.attr('src', this.url);
        
        // Add the load event listener
        iframe.on('load', this._handleIframeLoad.bind(this));
    }

    _handleIframeLoad() {
        let iframe = this.element.find('#blacksmith-browser');
        try {
            iframe[0].contentWindow.location.href;
        } catch (e) {
            this.element.find('#blacksmith-browser-container').html(`
                <p>Unable to display ${this.url} due to security restrictions.</p>
                <p>You can visit the site directly by clicking <a href="${this.url}" target="_blank">here</a>.</p>
            `);
        }
    }

    getData(options) {
        return {
            ...super.getData(options),
            url: this.url
        };
    }
}

