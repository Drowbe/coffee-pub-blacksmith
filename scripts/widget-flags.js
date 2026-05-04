// ==================================================================
// ===== WIDGET-FLAGS – Reusable flag selection/filter component ===
// ==================================================================
// Embeddable UI component for selecting and managing flags.
// Requires the Blacksmith Window API (Application V2 windows).
// See documentation/architecture/architecture-flags.md §FlagWidget.
// ==================================================================

import { FlagManager } from './manager-flags.js';

export class FlagWidget {

    // ============================================================
    // Template data preparation
    // ============================================================

    /**
     * Prepare the context object to pass to the {{> blacksmith-flag-widget}} partial.
     * Call this in your window's prepareContext() method.
     *
     * @param {object} options
     * @param {string}   options.contextKey    - Context identifier, e.g. 'coffee-pub-squire.quests'
     * @param {string[]} options.currentFlags  - Flags currently on the record
     * @param {'full'|'filter'} [options.mode] - 'full' = add/remove; 'filter' = visibility toggles only
     * @param {string}   [options.placeholder] - Input placeholder text (full mode only)
     * @returns {object} Template data object
     */
    static prepareData({ contextKey, currentFlags = [], mode = 'full', placeholder = 'Add a flag…' } = {}) {
        const choices = FlagManager.getChoices(contextKey);
        const currentNorm = FlagManager.normalize(currentFlags);

        // Build chip list for current flags
        const chips = currentNorm.map(key => {
            const choice = choices.find(c => c.key === key);
            return {
                key,
                label: choice?.label ?? key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                protected: !!choice?.protected,
                removable: mode === 'full' && !choice?.protected
            };
        });

        // Build suggestions (choices not already applied)
        const appliedSet = new Set(currentNorm);
        const suggestions = choices
            .filter(c => !appliedSet.has(c.key))
            .map(c => ({
                key: c.key,
                label: c.label,
                protected: c.protected,
                tier: c.tier
            }));

        // Build filter list (filter mode: all choices with visibility state)
        const filterItems = mode === 'filter'
            ? choices.map(c => ({
                key: c.key,
                label: c.label,
                protected: c.protected,
                tier: c.tier,
                visible: FlagManager.getVisibility(c.key, contextKey)
            }))
            : [];

        return {
            contextKey,
            mode,
            placeholder,
            chips,
            suggestions,
            filterItems,
            hasChips: chips.length > 0,
            hasSuggestions: suggestions.length > 0,
            isFullMode: mode === 'full',
            isFilterMode: mode === 'filter'
        };
    }

    // ============================================================
    // Value extraction
    // ============================================================

    /**
     * Read the current flag selection from a rendered widget inside a window element.
     * Call this in your _onSubmit or change handler.
     *
     * @param {HTMLElement} element - The window root element (e.g. this.element)
     * @param {string} contextKey  - Must match the contextKey used in prepareData()
     * @returns {string[]} Normalized array of selected flags
     */
    static readValue(element, contextKey) {
        if (!element || !contextKey) return [];
        const widget = element.querySelector(`[data-flag-widget="${contextKey}"]`);
        if (!widget) return [];
        const hidden = widget.querySelector('input[data-flag-value]');
        if (!hidden) return [];
        const raw = hidden.value || '';
        return raw ? raw.split(',').filter(Boolean) : [];
    }

    // ============================================================
    // Event wiring (call from your window's _onRender or activateListeners)
    // ============================================================

    /**
     * Wire up interactive behaviour for a rendered flag widget.
     * Call once after the widget HTML is in the DOM.
     *
     * @param {HTMLElement} element  - The window root element
     * @param {string}      contextKey
     * @param {Function}    [onChange] - Optional callback fired with (flags[]) on every change
     */
    static activate(element, contextKey, onChange) {
        const widget = element.querySelector(`[data-flag-widget="${contextKey}"]`);
        if (!widget) return;

        const hiddenInput   = widget.querySelector('input[data-flag-value]');
        const textInput     = widget.querySelector('input[data-flag-input]');
        const chipContainer = widget.querySelector('[data-flag-chips]');
        const suggestBox    = widget.querySelector('[data-flag-suggestions]');

        if (!hiddenInput) return;

        // -- Helper: read current value --
        const getFlags = () => (hiddenInput.value ? hiddenInput.value.split(',').filter(Boolean) : []);
        const setFlags = (flags) => {
            hiddenInput.value = [...new Set(flags.filter(Boolean))].join(',');
            if (typeof onChange === 'function') onChange(getFlags());
        };

        // -- Add a flag chip --
        const addFlag = (key) => {
            if (!key) return;
            const current = getFlags();
            if (!current.includes(key)) setFlags([...current, key]);
            _rebuildChips();
            _rebuildSuggestions();
            if (textInput) textInput.value = '';
        };

        // -- Remove a flag chip --
        const removeFlag = (key) => {
            setFlags(getFlags().filter(f => f !== key));
            _rebuildChips();
            _rebuildSuggestions();
        };

        // -- Rebuild chip DOM --
        const _rebuildChips = () => {
            if (!chipContainer) return;
            const current = getFlags();
            const choices = FlagManager.getChoices(contextKey);
            chipContainer.innerHTML = current.map(key => {
                const c = choices.find(x => x.key === key);
                const label = c?.label ?? key.replace(/-/g, ' ').replace(/\b\w/g, x => x.toUpperCase());
                const removable = !c?.protected;
                return `<span class="bsw-flag-chip${c?.protected ? ' bsw-flag-chip--protected' : ''}" data-flag-key="${key}">
                    ${label}
                    ${removable ? `<button type="button" class="bsw-flag-chip-remove" data-remove-flag="${key}" aria-label="Remove ${label}">×</button>` : ''}
                </span>`;
            }).join('');

            // Re-bind remove buttons
            chipContainer.querySelectorAll('[data-remove-flag]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeFlag(btn.dataset.removeFlag);
                });
            });
        };

        // -- Rebuild suggestion DOM based on current input --
        const _rebuildSuggestions = (query = '') => {
            if (!suggestBox) return;
            const current = new Set(getFlags());
            const choices = FlagManager.getChoices(contextKey);
            const q = query.toLowerCase().replace(/\s+/g, '-');
            const filtered = choices.filter(c => !current.has(c.key) && (q === '' || c.key.includes(q) || c.label.toLowerCase().includes(q)));

            if (filtered.length === 0) {
                suggestBox.hidden = true;
                suggestBox.innerHTML = '';
                return;
            }
            suggestBox.innerHTML = filtered.map(c =>
                `<button type="button" class="bsw-flag-suggestion" data-suggest-flag="${c.key}">${c.label}</button>`
            ).join('');
            suggestBox.hidden = false;

            suggestBox.querySelectorAll('[data-suggest-flag]').forEach(btn => {
                btn.addEventListener('click', () => addFlag(btn.dataset.suggestFlag));
            });
        };

        // -- Text input events --
        if (textInput) {
            textInput.addEventListener('input', () => _rebuildSuggestions(textInput.value));
            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = textInput.value.trim();
                    if (val) addFlag(FlagManager.normalize(val));
                } else if (e.key === 'Escape') {
                    textInput.value = '';
                    suggestBox && (suggestBox.hidden = true);
                }
            });
            textInput.addEventListener('blur', () => {
                setTimeout(() => { if (suggestBox) suggestBox.hidden = true; }, 150);
            });
            textInput.addEventListener('focus', () => _rebuildSuggestions(textInput.value));
        }

        // -- Remove chips on initial render --
        _rebuildChips();
    }

    // ============================================================
    // Partial registration
    // ============================================================

    /** Register the Handlebars partial for this widget. Called by blacksmith.js during init. */
    static async registerPartial() {
        try {
            const path = `modules/coffee-pub-blacksmith/templates/partials/flag-widget.hbs`;
            const template = await fetch(path).then(r => r.text());
            if (template) Handlebars.registerPartial('blacksmith-flag-widget', template);
        } catch (e) {
            console.error('BLACKSMITH | FLAGS Failed to register flag-widget partial', e);
        }
    }
}
