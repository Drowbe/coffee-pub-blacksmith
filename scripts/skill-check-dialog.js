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
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'skill-check-dialog',
            template: 'modules/coffee-pub-blacksmith/templates/skill-check-window.hbs',
            classes: ['coffee-pub-blacksmith', 'skill-check-dialog'],
            title: 'Skill Check',
            width: 800,
            height: 600,
            resizable: true
            
        });
    }

    getData() {
        // Create a map of skill descriptions
        const skillDescriptions = {
            'acr': 'Balancing, flipping, or escaping tricky physical situations with agility and finesse.',
            'ani': 'Calming, controlling, or understanding the behavior of animals.',
            'arc': 'Knowing about magic, spells, and arcane lore.',
            'ath': 'Performing feats of strength like climbing, swimming, or grappling.',
            'dec': 'Lying convincingly or hiding the truth through trickery or disguise.',
            'his': 'Recalling facts about past events, civilizations, and important lore.',
            'ins': 'Reading people\'s true intentions, emotions, or honesty.',
            'itm': 'Using threats or force of personality to influence others.',
            'inv': 'Examining clues, solving mysteries, or finding hidden details.',
            'med': 'Treating wounds, diagnosing ailments, and stabilizing the dying.',
            'nat': 'Understanding natural environments, animals, weather, and geography.',
            'prc': 'Noticing hidden creatures, objects, or subtle changes in your surroundings.',
            'prf': 'Entertaining an audience through music, acting, storytelling, or art.',
            'per': 'Convincing others through kindness, diplomacy, or charm.',
            'rel': 'Knowing about gods, holy rites, religious symbols, and divine lore.',
            'slt': 'Secretly manipulating objects, like stealing or planting items unnoticed.',
            'ste': 'Moving silently and staying hidden from view.',
            'sur': 'Tracking creatures, navigating the wilds, and enduring harsh conditions.'
        };

        // Get all skills from the system
        const skills = Object.entries(CONFIG.DND5E.skills).map(([id, data]) => ({
            id,
            name: game.i18n.localize(data.label),
            icon: "fas fa-check",
            description: skillDescriptions[id]
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

            // If it's a skill, update the description
            if (type === 'skill') {
                const systemSkillData = CONFIG.DND5E.skills[value];
                const customSkillData = this.getData().skills.find(s => s.id === value);
                
                if (systemSkillData && customSkillData) {
                    const ability = CONFIG.DND5E.abilities[systemSkillData.ability]?.label || '';
                    const abilityName = game.i18n.localize(ability);
                    const skillName = game.i18n.localize(systemSkillData.label);
                    const skillDesc = game.i18n.localize(systemSkillData.reference);
                    
                    const title = `${skillName} (${abilityName})`;
                    const uuid = `${skillDesc}`;
                    
                    // Store the skill info in the dialog data
                    this.skillInfo = {
                        description: customSkillData.description,
                        link: `@UUID[${uuid}]{${title}}`
                    };
                }
            }
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
            const selectedActors = Array.from(html.find('.actor-item.selected')).map(item => ({
                id: item.dataset.actorId,
                name: item.querySelector('.actor-name').textContent
            }));
            
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

            if (this.callback) {
                this.callback(selectedActors, {
                    type: this.selectedType,
                    value: this.selectedValue,
                    dc: dc || null,
                    showDC,
                    rollMode,
                    description: description || null,
                    label: label || null,
                    skillDescription: this.skillInfo?.description,
                    skillLink: this.skillInfo?.link
                });
            }

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