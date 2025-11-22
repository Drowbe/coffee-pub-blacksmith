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

        // Add dark mode toggle listener
        const darkModeInput = html.querySelector('input[name="dark"]');
        if (darkModeInput) {
            darkModeInput.addEventListener('change', async (event) => {
                const isDark = event.target.checked;
                if (this.element) {
                    this.element.classList.toggle('dark-mode', isDark);
                }
            });
        }

        // Add refresh button listener
        const refreshButton = html.querySelector('.refresh-button');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                window.location.reload();
            });
        }

        // Add copy button listener
        const copyButton = html.querySelector('.copy-button');
        if (copyButton) {
            copyButton.addEventListener('click', () => {
                const textarea = html.querySelector('textarea[name="css"]');
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
        const clearButton = html.querySelector('.clear-button');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                const textarea = html.querySelector('textarea[name="css"]');
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
        const worldButton = html.querySelector('.world-button');
        if (worldButton) {
            worldButton.addEventListener('click', () => {
                new WorldConfig(game.world).render(true);
            });
        }

        // Settings button
        const settingsButton = html.querySelector('.settings-button');
        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                game.settings.sheet.render(true);
            });
        }

        // Add smart indentation handlers
        const textarea = html.querySelector('textarea[name="css"]');
        if (textarea) {
            textarea.addEventListener('keydown', this._handleEditorKeydown.bind(this));
        }
        
        // Search functionality listeners
        this._setupSearchListeners(html);
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
            this.element.classList.toggle('dark-mode', dark);
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
        if (this.element) {
            const dark = game.settings.get(MODULE.ID, 'cssDarkMode');
            this.element.classList.toggle('dark-mode', dark);
        }
        
        return result;
    }

    _setupSearchListeners(html) {
        const textarea = html.querySelector('textarea[name="css"]');
        const searchInput = html.querySelector('.search-input');
        const replaceInput = html.querySelector('.replace-input');
        
        if (!textarea || !searchInput || !replaceInput) return;
        
        // Search input listeners
        searchInput.addEventListener('input', () => {
            this._performSearch(html);
        });
        
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (event.shiftKey) {
                    this._findPrevious(html);
                } else {
                    this._findNext(html);
                }
            }
        });
        
        // Search button listeners
        const findNextButton = html.querySelector('.find-next-button');
        if (findNextButton) {
            findNextButton.addEventListener('click', () => {
                this._findNext(html);
            });
        }
        
        const findPrevButton = html.querySelector('.find-prev-button');
        if (findPrevButton) {
            findPrevButton.addEventListener('click', () => {
                this._findPrevious(html);
            });
        }
        
        const replaceButton = html.querySelector('.replace-button');
        if (replaceButton) {
            replaceButton.addEventListener('click', () => {
                this._replaceCurrent(html);
            });
        }
        
        const replaceAllButton = html.querySelector('.replace-all-button');
        if (replaceAllButton) {
            replaceAllButton.addEventListener('click', () => {
                this._replaceAll(html);
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
        const textarea = html.querySelector('textarea[name="css"]');
        const searchInput = html.querySelector('.search-input');
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
            this._highlightCurrentMatch(html);
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
        const textarea = html.querySelector('textarea[name="css"]');
        const searchInput = html.querySelector('.search-input');
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
        const textarea = html.querySelector('textarea[name="css"]');
        const searchInput = html.querySelector('.search-input');
        const replaceInput = html.querySelector('.replace-input');
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
            this._performSearch(html);
        }
    }
    
    _replaceAll(html) {
        const textarea = html.querySelector('textarea[name="css"]');
        const searchInput = html.querySelector('.search-input');
        const replaceInput = html.querySelector('.replace-input');
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
