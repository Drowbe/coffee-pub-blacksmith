// Import required modules
import { MODULE_ID } from './const.js';

export class SkillCheckDialog extends Application {
    constructor(data = {}) {
        super();
        this.actors = data.actors || [];
        this.selectedType = null;
        this.selectedValue = null;
        this.callback = data.callback || null;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            template: "modules/coffee-pub-blacksmith/templates/skill-check-window.hbs",
            classes: ["dialog", "skill-check-dialog"],
            width: 800,
            height: 600,
            resizable: true
        });
    }

    getData() {
        // Get all skills from the system
        const skills = Object.entries(CONFIG.DND5E.skills).map(([id, data]) => ({
            id,
            name: game.i18n.localize(data.label),
            icon: "fas fa-check"
        }));

        // Get all abilities
        const abilities = Object.entries(CONFIG.DND5E.abilities).map(([id, data]) => ({
            id,
            name: game.i18n.localize(data.label)
        }));

        // Get all saves (same as abilities for D&D 5e)
        const saves = Object.entries(CONFIG.DND5E.abilities).map(([id, data]) => ({
            id,
            name: game.i18n.localize(data.label)
        }));

        // Get tools from selected actors
        const tools = this._getToolProficiencies();

        return {
            actors: this.actors,
            skills,
            abilities,
            saves,
            tools
        };
    }

    _getToolProficiencies() {
        const toolProfs = new Set();
        const selectedActors = this.element?.find('.actor-item.selected') || [];
        
        selectedActors.each((i, el) => {
            const actorId = el.dataset.actorId;
            const actor = game.actors.get(actorId);
            if (!actor) return;

            // Get tool proficiencies from the actor
            const tools = actor.items.filter(i => i.type === "tool");
            tools.forEach(tool => {
                toolProfs.add({
                    id: tool.id,
                    name: tool.name
                });
            });
        });

        return Array.from(toolProfs);
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Handle actor selection
        html.find('.actor-item').click(ev => {
            const item = ev.currentTarget;
            item.classList.toggle('selected');
            // Update tool proficiencies when actor selection changes
            this._updateToolList();
        });

        // Handle check item selection
        html.find('.check-item').click(ev => {
            const item = ev.currentTarget;
            const type = item.dataset.type;
            const value = item.dataset.value;

            // Remove selection from all items
            html.find('.check-item').removeClass('selected');
            // Add selection to clicked item
            item.classList.add('selected');

            this.selectedType = type;
            this.selectedValue = value;
        });

        // Handle search input
        html.find('input[name="search"]').on('input', ev => {
            const searchTerm = ev.currentTarget.value.toLowerCase();
            html.find('.check-item').each((i, el) => {
                const text = el.textContent.toLowerCase();
                el.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });

        // Handle the roll button
        html.find('button[data-button="roll"]').click(ev => {
            const selectedActors = html.find('.actor-item.selected');
            
            if (selectedActors.length === 0) {
                ui.notifications.warn("Please select at least one actor.");
                return;
            }
            
            if (!this.selectedType || !this.selectedValue) {
                ui.notifications.warn("Please select a check type.");
                return;
            }

            // Get form data
            const dc = html.find('input[name="dc"]').val();
            const showDC = html.find('input[name="showDC"]').prop('checked');
            const rollMode = html.find('select[name="rollMode"]').val();
            const description = html.find('textarea[name="description"]').val();
            const label = html.find('input[name="label"]').val();

            selectedActors.each((i, actorItem) => {
                const actorId = actorItem.dataset.actorId;
                
                if (this.callback) {
                    this.callback(actorId, {
                        type: this.selectedType,
                        value: this.selectedValue,
                        dc: dc || null,
                        showDC,
                        rollMode,
                        description: description || null,
                        label: label || null
                    });
                }
            });

            this.close();
        });

        // Handle the cancel button
        html.find('button[data-button="cancel"]').click(() => this.close());
    }

    _updateToolList() {
        const tools = this._getToolProficiencies();
        const toolSection = this.element.find('.check-section').last();
        
        // Clear existing tools
        toolSection.find('.check-item').remove();
        
        // Add new tools
        tools.forEach(tool => {
            const toolItem = $(`
                <div class="check-item" data-type="tool" data-value="${tool.id}">
                    <i class="fas fa-tools"></i>
                    <span>${tool.name}</span>
                </div>
            `);
            toolSection.append(toolItem);
        });
    }
} 