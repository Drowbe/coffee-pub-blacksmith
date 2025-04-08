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
        // Get all tokens from the canvas, including NPCs and monsters
        const canvasTokens = canvas.tokens.placeables
            .filter(t => t.actor)
            .map(t => ({
                id: t.actor.id,
                name: t.actor.name,
                hasOwner: t.actor.hasPlayerOwner,
                actor: t.actor,
                isSelected: t.isSelected,
                // Add additional info for display
                level: t.actor.type === 'character' ? t.actor.system.details.level : null,
                class: t.actor.type === 'character' ? t.actor.system.details.class : null,
                type: t.actor.type,
                hp: {
                    value: t.actor.system.attributes.hp.value,
                    max: t.actor.system.attributes.hp.max
                }
            }));

        // Check if there are any selected tokens
        const hasSelectedTokens = canvas.tokens.controlled.length > 0;

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

        // Get tools from all tokens
        const tools = this._getToolProficiencies();

        return {
            actors: canvasTokens,
            skills,
            abilities,
            saves,
            tools,
            hasSelectedTokens,
            initialFilter: hasSelectedTokens ? 'selected' : 'canvas'
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

        // Apply initial filter if there are selected tokens
        const hasSelectedTokens = canvas.tokens.controlled.length > 0;
        const initialFilter = hasSelectedTokens ? 'selected' : 'canvas';
        
        // Set initial active state on filter button
        html.find(`.filter-btn[data-filter="${initialFilter}"]`).addClass('active');
        
        // Apply initial filter
        this._applyFilter(html, initialFilter);

        // Handle actor selection
        html.find('.actor-item').click(ev => {
            const item = ev.currentTarget;
            item.classList.toggle('selected');
            // Update tool proficiencies when actor selection changes
            this._updateToolList();
        });

        // Handle player search - separate from criteria search
        html.find('input[name="search"]').each((i, input) => {
            const $input = $(input);
            const $clearButton = $input.closest('.search-container').find('.clear-search-button');
            const isPlayerSearch = $input.closest('.dialog-column').find('.actor-list').length > 0;
            
            // Show/hide clear button based on input content
            const updateClearButton = () => {
                $clearButton.toggle($input.val().length > 0);
            };
            
            $input.on('input', ev => {
                const searchTerm = ev.currentTarget.value.toLowerCase();
                updateClearButton();
                
                if (isPlayerSearch) {
                    // Search in actor list
                    html.find('.actor-list .actor-item').each((i, el) => {
                        const name = el.querySelector('.actor-name').textContent.toLowerCase();
                        el.style.display = name.includes(searchTerm) ? '' : 'none';
                    });
                } else {
                    // Search in criteria/checks list
                    html.find('.check-item').each((i, el) => {
                        const text = el.textContent.toLowerCase();
                        el.style.display = text.includes(searchTerm) ? '' : 'none';
                    });
                }
            });

            // Handle clear button click
            $clearButton.on('click', () => {
                $input.val('').trigger('input');
                $clearButton.hide();
            });

            // Initial state
            updateClearButton();
        });

        // Handle filter buttons
        html.find('.filter-btn').click(ev => {
            const button = ev.currentTarget;
            const filterType = button.dataset.filter;
            
            // Toggle active state on buttons
            html.find('.filter-btn').removeClass('active');
            button.classList.add('active');
            
            // Apply filter and respect current search term
            const searchTerm = html.find('input[name="search"]').first().val().toLowerCase();
            if (searchTerm) {
                // First apply filter without updating visibility
                this._applyFilter(html, filterType, false);
                
                // Then apply search within filtered results
                html.find('.actor-list .actor-item').each((i, el) => {
                    if (el.style.display !== 'none') {
                        const name = el.querySelector('.actor-name').textContent.toLowerCase();
                        el.style.display = name.includes(searchTerm) ? '' : 'none';
                    }
                });
            } else {
                // No search term, just apply filter
                this._applyFilter(html, filterType, true);
            }
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
                    
                    // Store the skill info and log it
                    this.skillInfo = {
                        description: customSkillData.description,
                        link: `@UUID[${uuid}]{${title}}`
                    };
                    console.log("Skill Info set:", this.skillInfo);
                }
            }
        });

        // Handle the roll button
        html.find('button[data-button="roll"]').click(async (ev) => {
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

            // Get the proper name and data based on roll type
            let rollName, rollValue, rollDescription, rollLink;
            switch (this.selectedType) {
                case 'skill':
                    const skillData = CONFIG.DND5E.skills[this.selectedValue];
                    rollName = game.i18n.localize(skillData?.label);
                    rollValue = this.selectedValue;
                    rollDescription = this.skillInfo?.description;
                    rollLink = this.skillInfo?.link;
                    break;
                case 'tool':
                    const toolItem = game.actors.get(selectedActors[0].id)?.items.get(this.selectedValue);
                    rollName = toolItem?.name;
                    rollValue = this.selectedValue;
                    rollDescription = toolItem?.system.description?.value || '';
                    rollLink = '';
                    break;
                case 'ability':
                    const abilityData = CONFIG.DND5E.abilities[this.selectedValue];
                    rollName = game.i18n.localize(abilityData?.label) + ' Check';
                    rollValue = this.selectedValue;
                    rollDescription = game.i18n.localize(abilityData?.reference || '');
                    rollLink = `@UUID[Compendium.dnd5e.rules.JournalEntry.PLlZqGrHwXWmTD6c.JournalEntryPage.0LgGvGMuMWMjLArg]{${rollName}}`;
                    break;
                case 'save':
                    const saveData = CONFIG.DND5E.abilities[this.selectedValue];
                    rollName = game.i18n.localize(saveData?.label) + ' Save';
                    rollValue = this.selectedValue;
                    rollDescription = game.i18n.localize(saveData?.reference || '');
                    rollLink = `@UUID[Compendium.dnd5e.rules.JournalEntry.PLlZqGrHwXWmTD6c.JournalEntryPage.0LgGvGMuMWMjLArg]{${rollName}}`;
                    break;
                case 'dice':
                    rollName = `${this.selectedValue} Roll`;
                    rollValue = this.selectedValue.startsWith('d') ? '1' + this.selectedValue : this.selectedValue;
                    rollDescription = `Rolling a ${this.selectedValue}`;
                    rollLink = '';
                    break;
                default:
                    rollName = this.selectedValue;
                    rollValue = this.selectedValue;
                    rollDescription = '';
                    rollLink = '';
            }

            // Create message data
            const messageData = {
                skillName: rollName,
                skillAbbr: rollValue,
                actors: selectedActors,
                requesterId: game.user.id,
                type: 'skillCheck',
                dc: dc || null,
                showDC,
                label: label || null,
                description: description || null,
                skillDescription: rollDescription,
                skillLink: rollLink,
                rollMode,
                rollType: this.selectedType
            };

            // Create the chat message
            const content = await renderTemplate('modules/coffee-pub-blacksmith/templates/skill-check-card.hbs', messageData);
            const chatMessage = await ChatMessage.create({
                content: content,
                speaker: ChatMessage.getSpeaker(),
                flags: {
                    'coffee-pub-blacksmith': messageData
                },
                whisper: rollMode === 'gmroll' ? game.users.filter(u => u.isGM).map(u => u.id) : [],
                blind: rollMode === 'blindroll'
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
            
            // Attach click handler to the new tool item
            toolItem.on('click', (ev) => {
                const item = ev.currentTarget;
                const type = item.dataset.type;
                const value = item.dataset.value;

                // Remove selection from all items
                this.element.find('.check-item').removeClass('selected');
                // Add selection to clicked item
                item.classList.add('selected');

                this.selectedType = type;
                this.selectedValue = value;
            });
            
            toolSection.append(toolItem);
        });
    }

    // Update helper method to optionally defer visibility updates
    _applyFilter(html, filterType, updateVisibility = true) {
        html.find('.actor-list .actor-item').each((i, el) => {
            const actorId = el.dataset.actorId;
            const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
            const actor = game.actors.get(actorId);
            
            if (!actor) return;
            
            let show = false;
            switch (filterType) {
                case 'selected':
                    // Show only selected tokens on canvas
                    show = canvas.tokens.controlled.some(t => t.actor?.id === actorId);
                    break;
                case 'canvas':
                    // Show all tokens on canvas regardless of type
                    show = token != null;
                    break;
                case 'party':
                    // Show only player characters (type === 'character')
                    show = actor.type === 'character' && actor.hasPlayerOwner;
                    break;
                default:
                    show = true;
            }
            
            if (updateVisibility) {
                el.style.display = show ? '' : 'none';
            } else {
                // Just mark the element with a data attribute for later use
                el.dataset.filterShow = show;
                if (!show) {
                    el.style.display = 'none';
                } else {
                    el.style.display = '';
                }
            }
        });
    }
} 