import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { SocketManager } from './manager-sockets.js';

export class CSSEditor extends FormApplication {
    static get defaultOptions() {
        const dark = game.settings.get(MODULE.ID, 'cssDarkMode');
        const classes = ['blacksmith-css-editor'];
        if (dark) classes.push('dark-mode');

        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'blacksmith-css-editor',
            title: 'CSS Editor',
            template: `modules/${MODULE.ID}/templates/window-gmtools.hbs`,
            width: 800,
            height: 600,
            minWidth: 700,
            resizable: true,
            minimizable: true,
            classes: classes,
            closeOnSubmit: false // Prevent closing on submit
        });
    }

    constructor(options = {}) {
        super(options);
        this.registerSettingsHandler();
        
        // Search functionality properties
        this.searchResults = [];
        this.currentSearchIndex = -1;
        this.lastSearchTerm = '';
    }

    registerSettingsHandler() {
        // Watch for settings changes
        game.settings.settings.get(`${MODULE.ID}.customCSS`).onChange = () => {
            const css = game.settings.get(MODULE.ID, 'customCSS');
            const transition = game.settings.get(MODULE.ID, 'cssTransition');
            this.applyCSS(css, transition);
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // v13: Application/FormApplication.activateListeners may still receive jQuery
        // Convert to native DOM if needed
        let htmlElement = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            htmlElement = html[0] || html.get?.(0) || html;
        } else if (html && typeof html.querySelectorAll !== 'function') {
            // Not a valid DOM element
            return;
        }
        if (!htmlElement) return;

        // Add dark mode toggle listener
        const darkModeInput = htmlElement.querySelector('input[name="dark"]');
        if (darkModeInput) {
            darkModeInput.addEventListener('change', async (event) => {
                const isDark = event.target.checked;
                if (this.element && this.element.classList) {
                    // v13: Foundry sets this.element to native DOM
                    this.element.classList.toggle('dark-mode', isDark);
                }
            });
        }

        // Add refresh button listener
        const refreshButton = htmlElement.querySelector('.refresh-button');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                window.location.reload();
            });
        }

        // Add copy button listener
        const copyButton = htmlElement.querySelector('.copy-button');
        if (copyButton) {
            copyButton.addEventListener('click', () => {
                const textarea = htmlElement.querySelector('textarea[name="css"]');
                if (textarea) {
                    navigator.clipboard.writeText(textarea.value).then(() => {
                        ui.notifications.info('CSS copied to clipboard');
                    }).catch(err => {
                        ui.notifications.error('Failed to copy CSS');
                        postConsoleAndNotification(MODULE.NAME, 'Failed to copy CSS', err, false, true);
                    });
                }
            });
        }

        // Add clear button listener
        const clearButton = htmlElement.querySelector('.clear-button');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                const textarea = htmlElement.querySelector('textarea[name="css"]');
                if (textarea && textarea.value.trim() !== '') {
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
        }

        // Update world button to open World Config
        const worldButton = htmlElement.querySelector('.world-button');
        if (worldButton) {
            worldButton.addEventListener('click', () => {
                try {
                    // v13: Try to find and trigger FoundryVTT's openApp handler
                    // First, try to find an existing button with data-action="openApp" and data-app="world"
                    const existingButton = document.querySelector('button[data-action="openApp"][data-app="world"]');
                    if (existingButton) {
                        existingButton.click();
                        return;
                    }
                    
                    // Alternative: Try to access the world application directly
                    if (ui?.world) {
                        ui.world.render(true);
                        return;
                    }
                    
                    // Fallback: Try to open world sheet directly
                    if (game.world?.sheet) {
                        game.world.sheet.render(true);
                        return;
                    }
                    
                    // Last resort: Try to create and trigger the button event
                    const tempButton = document.createElement('button');
                    tempButton.setAttribute('data-action', 'openApp');
                    tempButton.setAttribute('data-app', 'world');
                    document.body.appendChild(tempButton);
                    
                    // Try to trigger FoundryVTT's event handler
                    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
                    tempButton.dispatchEvent(event);
                    
                    // Clean up after a short delay
                    setTimeout(() => tempButton.remove(), 100);
                } catch (error) {
                    // If all else fails, open settings sheet
                    postConsoleAndNotification(MODULE.NAME, 'Error opening World Config', error, false, false);
                    game.settings.sheet.render(true);
                }
            });
        }

        // Settings button
        const settingsButton = htmlElement.querySelector('.settings-button');
        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                game.settings.sheet.render(true);
            });
        }

        // Add smart indentation handlers
        const textarea = htmlElement.querySelector('textarea[name="css"]');
        if (textarea) {
            textarea.addEventListener('keydown', this._handleEditorKeydown.bind(this));
        }
        
        // Search functionality listeners
        this._setupSearchListeners(htmlElement);
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
            css: game.settings.get(MODULE.ID, 'customCSS'),
            transition: game.settings.get(MODULE.ID, 'cssTransition'),
            dark: game.settings.get(MODULE.ID, 'cssDarkMode')
        };
    }

    async close(options = {}) {
        // Clean up global keyboard shortcut listener
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
        
        return super.close(options);
    }

    async _updateObject(event, formData) {
        event.preventDefault();
        
        const css = formData.css;
        const transition = formData.transition;
        const dark = formData.dark;

        await game.settings.set(MODULE.ID, 'customCSS', css);
        await game.settings.set(MODULE.ID, 'cssTransition', transition);
        await game.settings.set(MODULE.ID, 'cssDarkMode', dark);

        // Apply dark mode
        if (this.element) {
            // v13: Detect and convert jQuery to native DOM if needed
            let nativeElement = this.element;
            if (this.element && (this.element.jquery || typeof this.element.find === 'function')) {
                nativeElement = this.element[0] || this.element.get?.(0) || this.element;
            }
            if (nativeElement && nativeElement.classList) {
                nativeElement.classList.toggle('dark-mode', dark);
            }
        }

        // Apply the CSS
        this.applyCSS(css, transition);

        // Notify other clients using SocketManager
        if (game.user.isGM) {
            const socket = SocketManager.getSocket();
            if (socket) {
                await socket.executeForOthers("updateCSS", {
                    type: "updateCSS",  // Add type property
                    css: css,
                    transition: transition,
                    dark: dark
                });
            }
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
        if (this.element && this.element.classList) {
            // v13: Foundry sets this.element to native DOM
            const dark = game.settings.get(MODULE.ID, 'cssDarkMode');
            this.element.classList.toggle('dark-mode', dark);
        }
        
        return result;
    }

    _setupSearchListeners(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        const textarea = nativeHtml.querySelector('textarea[name="css"]');
        const searchInput = nativeHtml.querySelector('.search-input');
        const replaceInput = nativeHtml.querySelector('.replace-input');
        
        if (!textarea || !searchInput || !replaceInput) return;
        
        // Search input listeners
        searchInput.addEventListener('input', () => {
            this._performSearch(nativeHtml);
        });
        
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (event.shiftKey) {
                    this._findPrevious(nativeHtml);
                } else {
                    this._findNext(nativeHtml);
                }
            }
        });
        
        // Search button listeners
        const findNextButton = nativeHtml.querySelector('.find-next-button');
        if (findNextButton) {
            findNextButton.addEventListener('click', () => {
                this._findNext(nativeHtml);
            });
        }
        
        const findPrevButton = nativeHtml.querySelector('.find-prev-button');
        if (findPrevButton) {
            findPrevButton.addEventListener('click', () => {
                this._findPrevious(nativeHtml);
            });
        }
        
        const replaceButton = nativeHtml.querySelector('.replace-button');
        if (replaceButton) {
            replaceButton.addEventListener('click', () => {
                this._replaceCurrent(nativeHtml);
            });
        }
        
        const replaceAllButton = nativeHtml.querySelector('.replace-all-button');
        if (replaceAllButton) {
            replaceAllButton.addEventListener('click', () => {
                this._replaceAll(nativeHtml);
            });
        }
        
        // Global keyboard shortcuts - store handler for cleanup
        this._keydownHandler = (event) => {
            if (event.ctrlKey && event.key === 'f') {
                event.preventDefault();
                searchInput.focus();
                searchInput.select();
            } else if (event.ctrlKey && event.key === 'h') {
                event.preventDefault();
                replaceInput.focus();
                replaceInput.select();
            }
        };
        document.addEventListener('keydown', this._keydownHandler);
    }

    // Search functionality methods
    _performSearch(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        const textarea = nativeHtml.querySelector('textarea[name="css"]');
        const searchInput = nativeHtml.querySelector('.search-input');
        if (!textarea || !searchInput) return;
        const searchTerm = searchInput.value;
        
        if (searchTerm === '') {
            this.searchResults = [];
            this.currentSearchIndex = -1;
            this.lastSearchTerm = '';
            return;
        }
        
        if (searchTerm !== this.lastSearchTerm) {
            this.searchResults = [];
            this.currentSearchIndex = -1;
            this.lastSearchTerm = searchTerm;
            
            // Find all occurrences
            const text = textarea.value;
            let index = 0;
            while ((index = text.indexOf(searchTerm, index)) !== -1) {
                this.searchResults.push(index);
                index += searchTerm.length;
            }
        }
        
        if (this.searchResults.length > 0) {
            this._highlightCurrentMatch(nativeHtml);
        }
    }
    
    _findNext(html) {
        if (this.searchResults.length === 0) return;
        
        this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchResults.length;
        this._highlightCurrentMatch(html);
    }
    
    _findPrevious(html) {
        if (this.searchResults.length === 0) return;
        
        this.currentSearchIndex = this.currentSearchIndex <= 0 ? 
            this.searchResults.length - 1 : this.currentSearchIndex - 1;
        this._highlightCurrentMatch(html);
    }
    
    _highlightCurrentMatch(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        const textarea = nativeHtml.querySelector('textarea[name="css"]');
        const searchInput = nativeHtml.querySelector('.search-input');
        if (!textarea || !searchInput) return;
        const searchTerm = searchInput.value;
        
        if (this.currentSearchIndex >= 0 && this.currentSearchIndex < this.searchResults.length) {
            const start = this.searchResults[this.currentSearchIndex];
            const end = start + searchTerm.length;
            
            textarea.focus();
            textarea.setSelectionRange(start, end);
            
            // Scroll to the match
            const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
            const lines = textarea.value.substring(0, start).split('\n').length - 1;
            textarea.scrollTop = lines * lineHeight - textarea.clientHeight / 2;
        }
    }
    
    _replaceCurrent(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        const textarea = nativeHtml.querySelector('textarea[name="css"]');
        const searchInput = nativeHtml.querySelector('.search-input');
        const replaceInput = nativeHtml.querySelector('.replace-input');
        if (!textarea || !searchInput || !replaceInput) return;
        const searchTerm = searchInput.value;
        const replaceTerm = replaceInput.value;
        
        if (this.currentSearchIndex >= 0 && this.currentSearchIndex < this.searchResults.length) {
            const start = this.searchResults[this.currentSearchIndex];
            const end = start + searchTerm.length;
            
            const before = textarea.value.substring(0, start);
            const after = textarea.value.substring(end);
            textarea.value = before + replaceTerm + after;
            
            // Update search results after replacement
            this._performSearch(nativeHtml);
        }
    }
    
    _replaceAll(html) {
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        const textarea = nativeHtml.querySelector('textarea[name="css"]');
        const searchInput = nativeHtml.querySelector('.search-input');
        const replaceInput = nativeHtml.querySelector('.replace-input');
        if (!textarea || !searchInput || !replaceInput) return;
        const searchTerm = searchInput.value;
        const replaceTerm = replaceInput.value;
        
        if (searchTerm === '') return;
        
        const newValue = textarea.value.replaceAll(searchTerm, replaceTerm);
        textarea.value = newValue;
        
        // Clear search results after replace all
        this.searchResults = [];
        this.currentSearchIndex = -1;
        this.lastSearchTerm = '';
        searchInput.value = '';
        replaceInput.value = '';
        
        ui.notifications.info(`Replaced ${(textarea.value.match(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length} occurrences`);
    }
} 
