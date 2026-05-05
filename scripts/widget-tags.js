// ==================================================================
// ===== WIDGET-TAGS – Reusable tag selection/filter component =====
// ==================================================================
// Embeddable UI component for selecting and managing tags.
// Requires the Blacksmith Window API (Application V2 windows).
// See documentation/architecture/architecture-tags.md §TagWidget.
// ==================================================================

import { TagManager } from './manager-tags.js';

export class TagWidget {

    // ============================================================
    // Template data preparation
    // ============================================================

    static prepareData({ contextKey, currentTags = [], mode = 'full', placeholder = 'Add a tag…' } = {}) {
        const choices = TagManager.getChoices(contextKey);
        const currentNorm = TagManager.normalize(currentTags);

        const chips = currentNorm.map(key => {
            const choice = choices.find(c => c.key === key);
            return {
                key,
                label: choice?.label ?? key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                protected: !!choice?.protected,
                removable: mode === 'full' && !choice?.protected
            };
        });

        const appliedSet = new Set(currentNorm);
        const suggestions = choices
            .filter(c => !appliedSet.has(c.key))
            .map(c => ({ key: c.key, label: c.label, protected: c.protected, tier: c.tier }));

        const filterItems = mode === 'filter'
            ? choices.map(c => ({
                key: c.key,
                label: c.label,
                protected: c.protected,
                tier: c.tier,
                visible: TagManager.getVisibility(c.key, contextKey)
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

    static readValue(element, contextKey) {
        if (!element || !contextKey) return [];
        const widget = element.querySelector(`[data-tag-widget="${contextKey}"]`);
        if (!widget) return [];
        const hidden = widget.querySelector('input[data-tag-value]');
        if (!hidden) return [];
        const raw = hidden.value || '';
        return raw ? raw.split(',').filter(Boolean) : [];
    }

    // ============================================================
    // Event wiring
    // ============================================================

    static activate(element, contextKey, onChange) {
        const widget = element.querySelector(`[data-tag-widget="${contextKey}"]`);
        if (!widget) return;

        const hiddenInput   = widget.querySelector('input[data-tag-value]');
        const textInput     = widget.querySelector('input[data-tag-input]');
        const chipContainer = widget.querySelector('[data-tag-chips]');
        const suggestBox    = widget.querySelector('[data-tag-suggestions]');

        if (!hiddenInput) return;

        const getTags = () => (hiddenInput.value ? hiddenInput.value.split(',').filter(Boolean) : []);
        const setTags = (tags) => {
            hiddenInput.value = [...new Set(tags.filter(Boolean))].join(',');
            if (typeof onChange === 'function') onChange(getTags());
        };

        const addTag = (key) => {
            if (!key) return;
            const current = getTags();
            if (!current.includes(key)) setTags([...current, key]);
            _rebuildChips();
            _rebuildSuggestions();
            if (textInput) textInput.value = '';
        };

        const removeTag = (key) => {
            setTags(getTags().filter(f => f !== key));
            _rebuildChips();
            _rebuildSuggestions();
        };

        const _rebuildChips = () => {
            if (!chipContainer) return;
            const current = getTags();
            const choices = TagManager.getChoices(contextKey);
            chipContainer.innerHTML = current.map(key => {
                const c = choices.find(x => x.key === key);
                const label = c?.label ?? key.replace(/-/g, ' ').replace(/\b\w/g, x => x.toUpperCase());
                const removable = !c?.protected;
                return `<span class="bsw-tag-chip${c?.protected ? ' bsw-tag-chip--protected' : ''}" data-tag-key="${key}">
                    ${label}
                    ${removable ? `<button type="button" class="bsw-tag-chip-remove" data-remove-tag="${key}" aria-label="Remove ${label}">×</button>` : ''}
                </span>`;
            }).join('');
            chipContainer.querySelectorAll('[data-remove-tag]').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); removeTag(btn.dataset.removeTag); });
            });
        };

        const _rebuildSuggestions = (query = '') => {
            if (!suggestBox) return;
            const current = new Set(getTags());
            const choices = TagManager.getChoices(contextKey);
            const q = query.toLowerCase().replace(/\s+/g, '-');
            const filtered = choices.filter(c => !current.has(c.key) && (q === '' || c.key.includes(q) || c.label.toLowerCase().includes(q)));

            if (filtered.length === 0) { suggestBox.hidden = true; suggestBox.innerHTML = ''; return; }
            suggestBox.innerHTML = filtered.map(c =>
                `<button type="button" class="bsw-tag-suggestion" data-suggest-tag="${c.key}">${c.label}</button>`
            ).join('');
            suggestBox.hidden = false;
            suggestBox.querySelectorAll('[data-suggest-tag]').forEach(btn => {
                btn.addEventListener('click', () => addTag(btn.dataset.suggestTag));
            });
        };

        if (textInput) {
            textInput.addEventListener('input', () => _rebuildSuggestions(textInput.value));
            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); const val = textInput.value.trim(); if (val) addTag(TagManager.normalize(val)); }
                else if (e.key === 'Escape') { textInput.value = ''; if (suggestBox) suggestBox.hidden = true; }
            });
            textInput.addEventListener('blur', () => { setTimeout(() => { if (suggestBox) suggestBox.hidden = true; }, 150); });
            textInput.addEventListener('focus', () => _rebuildSuggestions(textInput.value));
        }

        _rebuildChips();
    }

    // ============================================================
    // Partial registration
    // ============================================================

    static async registerPartial() {
        try {
            const path = `modules/coffee-pub-blacksmith/templates/partials/tag-widget.hbs`;
            const template = await fetch(path).then(r => r.text());
            if (template) Handlebars.registerPartial('blacksmith-tag-widget', template);
        } catch (e) {
            console.error('BLACKSMITH | TAGS Failed to register tag-widget partial', e);
        }
    }
}
