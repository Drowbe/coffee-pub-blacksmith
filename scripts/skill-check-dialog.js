// Import required modules
import { MODULE_ID } from './const.js';
import { playSound, COFFEEPUB } from './global.js';

export class SkillCheckDialog extends Application {
    constructor(data = {}) {
        super();
        this.actors = data.actors || [];
        this.selectedType = null;
        this.selectedValue = null;
        this.challengerRoll = { type: null, value: null };
        this.defenderRoll = { type: null, value: null };
        this.callback = data.callback || null;
        
        // Load user preferences
        this.userPreferences = game.settings.get('coffee-pub-blacksmith', 'skillCheckPreferences') || {
            showRollExplanation: true,
            showRollExplanationLink: true,
            showDC: true,
            groupRoll: true
        };
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'skill-check-dialog',
            template: 'modules/coffee-pub-blacksmith/templates/skill-check-window.hbs',
            classes: ['coffee-pub-blacksmith', 'skill-check-dialog'],
            title: 'Checks and Saves',
            width: 800,
            height: 650,
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

        // Get tools directly using _getToolProficiencies
        const tools = this._getToolProficiencies();
        console.log('Tools data being passed to template:', tools);

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

        const abilityDescriptions = {
            'str': 'Raw physical power, affecting melee attacks, lifting capacity, and athletic prowess.',
            'dex': 'Agility and reflexes, affecting ranged attacks, armor class, and fine motor skills.',
            'con': 'Physical toughness and stamina, affecting hit points and resistance to physical stress.',
            'int': 'Mental acuity and knowledge, affecting spell power for wizards and general knowledge.',
            'wis': 'Awareness and intuition, affecting spell power for clerics and perception of surroundings.',
            'cha': 'Force of personality, affecting social interaction and spell power for sorcerers and bards.'
        };

        const saveDescriptions = {
            'str': 'Resisting physical force, breaking free from restraints, or maintaining control against effects that would move you.',
            'dex': 'Dodging area effects, reacting quickly to danger, or maintaining balance in precarious situations.',
            'con': 'Enduring poison, disease, or other bodily trauma, and resisting effects that would sap your vitality.',
            'int': 'Protecting your mind against psychic attacks, illusions, and other mental influences.',
            'wis': 'Resisting effects that would charm, frighten, or otherwise affect your willpower.',
            'cha': 'Maintaining your force of personality against effects that would possess or alter your being.'
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
            name: game.i18n.localize(data.label),
            description: abilityDescriptions[id]
        }));

        // Get all saves (same as abilities for D&D 5e)
        const saves = Object.entries(CONFIG.DND5E.abilities).map(([id, data]) => ({
            id,
            name: game.i18n.localize(data.label),
            description: saveDescriptions[id]
        }));

        // Add Death Save
        saves.push({
            id: 'death',
            name: 'Death',
            description: 'When you start your turn with 0 hit points, you must make a special saving throw, called a death saving throw, to determine whether you creep closer to death or hang onto life.'
        });

        const templateData = {
            actors: canvasTokens,
            skills,
            abilities,
            saves,
            tools,
            hasSelectedTokens,
            initialFilter: hasSelectedTokens ? 'selected' : 'party',
            userPreferences: this.userPreferences
        };

        console.log('Final template data:', templateData);
        return templateData;
    }

    _getToolProficiencies() {
        const toolProfs = new Map(); // Map of tool name to count and actor-specific IDs
        const selectedActors = this.element?.find('.cpb-actor-item.selected') || [];
        const selectedCount = selectedActors.length;
        
        if (selectedCount === 0) return [];

        console.log('Selected actors count:', selectedCount);
        
        selectedActors.each((i, el) => {
            const actorId = el.dataset.actorId;
            const actor = game.actors.get(actorId);
            if (!actor) return;

            // Get tool proficiencies from the actor
            const tools = actor.items.filter(i => i.type === "tool");
            console.log(`Actor ${actor.name} tools:`, tools.map(t => t.name));
            tools.forEach(tool => {
                if (!toolProfs.has(tool.name)) {
                    toolProfs.set(tool.name, {
                        count: 1,
                        actorTools: new Map([[actorId, tool.id]])
                    });
                } else {
                    const toolData = toolProfs.get(tool.name);
                    toolData.count++;
                    toolData.actorTools.set(actorId, tool.id);
                }
            });
        });

        // Convert to array and add isCommon flag
        const result = Array.from(toolProfs.entries())
            .map(([name, data]) => {
                const isCommon = data.count === selectedCount;
                console.log(`Tool ${name}: count=${data.count}, selectedCount=${selectedCount}, isCommon=${isCommon}`);
                return {
                    name,
                    isCommon,
                    actorTools: data.actorTools // Map of actorId to their specific tool ID
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

        console.log('Final tool list:', result);
        return result;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Debug: Check if classes are being applied
        console.log('Tool items with unavailable class:', html.find('.cpb-tool-unavailable').length);
        html.find('.cpb-check-item[data-type="tool"]').each((i, el) => {
            console.log('Tool item:', {
                name: el.querySelector('span').textContent,
                hasUnavailableClass: el.classList.contains('cpb-tool-unavailable'),
                dataCommon: el.dataset.common,
                classList: Array.from(el.classList)
            });
        });

        // Apply initial filter if there are selected tokens
        const hasSelectedTokens = canvas.tokens.controlled.length > 0;
        const initialFilter = hasSelectedTokens ? 'selected' : 'party';
        
        // Set initial active state on filter button
        html.find(`.cpb-filter-btn[data-filter="${initialFilter}"]`).addClass('active');
        
        // Apply initial filter
        this._applyFilter(html, initialFilter);

        // Handle actor selection - updated to handle both namespaced and legacy classes
        html.find('.cpb-actor-item').on('click contextmenu', (ev) => {
            ev.preventDefault();
            const item = ev.currentTarget;
            const isRightClick = ev.type === 'contextmenu';
            const groupIndicator = item.querySelector('.cpb-group-indicator') || item.querySelector('.group-indicator');

            if (!groupIndicator) return;

            // Toggle selection based on click type
            if (isRightClick) {
                if (groupIndicator.innerHTML.includes('fa-shield-halved')) {
                    // Remove from group 2
                    groupIndicator.innerHTML = '';
                    item.classList.remove('selected', 'cpb-group-2');
                } else {
                    // Add to group 2, remove from group 1 if needed 
                    groupIndicator.innerHTML = '<i class="fas fa-shield-halved" title="Defenders"></i>';
                    item.classList.remove('cpb-group-1');
                    item.classList.add('selected', 'cpb-group-2');
                }
            } else {
                if (groupIndicator.innerHTML.includes('fa-swords')) {
                    // Remove from group 1
                    groupIndicator.innerHTML = '';
                    item.classList.remove('selected', 'cpb-group-1');
                } else {
                    // Add to group 1, remove from group 2 if needed  
                    groupIndicator.innerHTML = '<i class="fas fa-swords" title="Challengers"></i>';
                    item.classList.remove('cpb-group-2');
                    item.classList.add('selected', 'cpb-group-1');
                }
            }

            // Update tool proficiencies when actor selection changes
            this._updateToolList();
        });

        // Handle player search - separate from criteria search
        html.find('input[name="search"]').each((i, input) => {
            const $input = $(input);
            const $clearButton = $input.closest('.cpb-search-container').find('.cpb-clear-search-button');
            const isPlayerSearch = $input.closest('.cpb-dialog-column').find('.cpb-actor-list').length > 0;
            
            // Show/hide clear button based on input content
            const updateClearButton = () => {
                $clearButton.toggle($input.val().length > 0);
            };
            
            $input.on('input', ev => {
                const searchTerm = ev.currentTarget.value.toLowerCase();
                updateClearButton();
                
                if (isPlayerSearch) {
                    // Search in actor list - support both class naming schemes
                    html.find('.cpb-actor-list .cpb-actor-item').each((i, el) => {
                        const name = el.querySelector('.cpb-actor-name').textContent.toLowerCase();
                        el.style.display = name.includes(searchTerm) ? '' : 'none';
                    });
                } else {
                    // Search in criteria/checks list
                    html.find('.cpb-check-item, .check-item').each((i, el) => {
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
        html.find('.cpb-filter-btn, .filter-btn').click(ev => {
            const button = ev.currentTarget;
            const filterType = button.dataset.filter;
            
            // Toggle active state on buttons
            html.find('.cpb-filter-btn, .filter-btn').removeClass('active');
            button.classList.add('active');
            
            // Apply filter and respect current search term
            const searchTerm = html.find('input[name="search"]').first().val().toLowerCase();
            if (searchTerm) {
                // First apply filter without updating visibility
                this._applyFilter(html, filterType, false);
                
                // Then apply search within filtered results
                html.find('.cpb-actor-list .cpb-actor-item').each((i, el) => {
                    if (el.style.display !== 'none') {
                        const name = el.querySelector('.cpb-actor-name, .actor-name').textContent.toLowerCase();
                        el.style.display = name.includes(searchTerm) ? '' : 'none';
                    }
                });
            } else {
                // No search term, just apply filter
                this._applyFilter(html, filterType, true);
            }
        });

        // Handle check item selection
        html.find('.cpb-check-item, .check-item').on('click contextmenu', (ev) => {
            ev.preventDefault();
            const item = ev.currentTarget;
            const type = item.dataset.type;
            const value = item.dataset.value;
            const isRightClick = ev.type === 'contextmenu';

            // Handle quick rolls
            if (type === 'quick') {
                const quickRollMap = {
                    'perception': 'prc',
                    'insight': 'ins',
                    'investigation': 'inv',
                    'nature': 'nat',
                    'stealth': 'ste'
                };

                // Clear any existing selections
                html.find('.cpb-check-item').removeClass('selected');
                html.find('.cpb-check-item .cpb-roll-type-indicator').html('');

                // Select all party members (characters with player owners)
                html.find('.cpb-actor-item').each((i, actorItem) => {
                    const actorId = actorItem.dataset.actorId;
                    const actor = game.actors.get(actorId);
                    if (actor && actor.hasPlayerOwner) {
                        actorItem.classList.add('selected');
                        actorItem.classList.add('cpb-group-1');
                        const indicator = actorItem.querySelector('.cpb-group-indicator');
                        if (indicator) {
                            indicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                        }
                    }
                });

                // Set the skill selection
                const skillValue = quickRollMap[value];
                if (skillValue) {
                    const skillItem = html.find(`.cpb-check-item[data-type="skill"][data-value="${skillValue}"]`);
                    if (skillItem.length) {
                        skillItem.addClass('selected');
                        const indicator = skillItem[0].querySelector('.cpb-roll-type-indicator');
                        if (indicator) {
                            indicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                        }
                        this.selectedType = 'skill';
                        this.selectedValue = skillValue;
                    }
                }

                // Automatically click the roll button
                html.find('button[data-button="roll"]').trigger('click');
                return;
            }

            // If this is a non-common tool, prevent selection and show notification
            if (type === 'tool' && item.dataset.common === 'false') {
                const toolName = item.querySelector('span')?.textContent || 'selected tool';
                ui.notifications.warn(`Not all selected players have ${toolName}.`);
                return;
            }

            // Check if we have both challengers and defenders
            const hasChallengers = html.find('.cpb-actor-item.cpb-group-1').length > 0;
            const hasDefenders = html.find('.cpb-actor-item.cpb-group-2').length > 0;
            const isContestedRoll = hasChallengers && hasDefenders;

            if (isContestedRoll) {
                // In contested mode, maintain two selections
                let wasDeselected = false;
                html.find('.cpb-check-item .cpb-roll-type-indicator i').each((i, el) => {
                    const indicator = el.closest('.cpb-roll-type-indicator');
                    const checkItem = indicator.closest('.cpb-check-item');
                    
                    // If clicking the same item, deselect it
                    if (checkItem === item) {
                        if ((isRightClick && el.classList.contains('fa-shield-halved')) ||
                            (!isRightClick && el.classList.contains('fa-swords'))) {
                            indicator.innerHTML = '';
                            checkItem.classList.remove('selected');
                            wasDeselected = true;
                            // Clear the appropriate roll type
                            if (isRightClick) {
                                this.defenderRoll = { type: null, value: null };
                            } else {
                                this.challengerRoll = { type: null, value: null };
                            }
                            return false; // Break the each loop
                        }
                    }
                    // Remove other selections of the same type
                    else if ((isRightClick && el.classList.contains('fa-shield-halved')) ||
                            (!isRightClick && el.classList.contains('fa-swords'))) {
                        indicator.innerHTML = '';
                        checkItem.classList.remove('selected');
                    }
                });

                // Only add new selection if we didn't just deselect
                if (!wasDeselected) {
                    // Add the roll type indicator and selected state
                    const rollTypeIndicator = item.querySelector('.cpb-roll-type-indicator');
                    if (rollTypeIndicator) {
                        if (isRightClick) {
                            rollTypeIndicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                            this.defenderRoll = { type, value };
                        } else {
                            rollTypeIndicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                            this.challengerRoll = { type, value };
                        }
                    }
                    // Add selected class
            item.classList.add('selected');
                }
            } else {
                // Check if we're deselecting the current selection
                const currentIndicator = item.querySelector('.cpb-roll-type-indicator');
                const hasCurrentSelection = currentIndicator && currentIndicator.innerHTML !== '';
                
                if (hasCurrentSelection) {
                    // Clear selection
                    html.find('.cpb-check-item').removeClass('selected');
                    html.find('.cpb-check-item .cpb-roll-type-indicator').html('');
                    this.selectedType = null;
                    this.selectedValue = null;
                } else {
                    // New selection
                    html.find('.cpb-check-item').removeClass('selected');
                    html.find('.cpb-check-item .cpb-roll-type-indicator').html('');
                    
                    const rollTypeIndicator = item.querySelector('.cpb-roll-type-indicator');
                    if (rollTypeIndicator) {
                        if (isRightClick) {
                            rollTypeIndicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                        } else {
                            rollTypeIndicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                        }
                    }
                    item.classList.add('selected');
            this.selectedType = type;
            this.selectedValue = value;
                }
            }

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
            const selectedActors = Array.from(html.find('.cpb-actor-item.selected')).map(item => ({
                id: item.dataset.actorId,
                name: item.querySelector('.cpb-actor-name, .actor-name').textContent,
                group: item.classList.contains('cpb-group-1') ? 1 : 
                       item.classList.contains('cpb-group-2') ? 2 : 1
            }));
            
            if (selectedActors.length === 0) {
                ui.notifications.warn("Please select at least one actor.");
                return;
            }
            
            // Determine if this is a contested roll
            const hasChallengers = selectedActors.some(a => a.group === 1);
            const hasDefenders = selectedActors.some(a => a.group === 2);
            const isContestedRoll = hasChallengers && hasDefenders;

            let challengerRollType, challengerRollValue;
            let defenderRollType, defenderRollValue;

            const getActorSpecificValue = (actorId, toolMap) => {
                if (!toolMap || !(toolMap instanceof Map)) return null;
                return toolMap.get(actorId);
            };

            if (isContestedRoll) {
                // Use separate rolls for challengers and defenders if both are set
                if (this.challengerRoll.type && this.defenderRoll.type) {
                    challengerRollType = this.challengerRoll.type;
                    defenderRollType = this.defenderRoll.type;
                    
                    // For tools, get actor-specific IDs
                    if (challengerRollType === 'tool') {
                        challengerRollValue = (actorId) => getActorSpecificValue(actorId, this.challengerRoll.value);
                    } else {
                        challengerRollValue = this.challengerRoll.value;
                    }
                    
                    if (defenderRollType === 'tool') {
                        defenderRollValue = (actorId) => getActorSpecificValue(actorId, this.defenderRoll.value);
                    } else {
                        defenderRollValue = this.defenderRoll.value;
                    }
                } else if (this.challengerRoll.type) {
                    // If only challenger roll is set, use it for both
                    challengerRollType = defenderRollType = this.challengerRoll.type;
                    if (challengerRollType === 'tool') {
                        const toolMap = this.challengerRoll.value;
                        challengerRollValue = defenderRollValue = (actorId) => getActorSpecificValue(actorId, toolMap);
                    } else {
                        challengerRollValue = defenderRollValue = this.challengerRoll.value;
                    }
                } else if (this.defenderRoll.type) {
                    // If only defender roll is set, use it for both
                    challengerRollType = defenderRollType = this.defenderRoll.type;
                    if (defenderRollType === 'tool') {
                        const toolMap = this.defenderRoll.value;
                        challengerRollValue = defenderRollValue = (actorId) => getActorSpecificValue(actorId, toolMap);
                    } else {
                        challengerRollValue = defenderRollValue = this.defenderRoll.value;
                    }
                } else {
                    ui.notifications.warn("Please select at least one roll type.");
                    return;
                }
            } else {
                // For non-contested rolls, use the primary selection
            if (!this.selectedType || !this.selectedValue) {
                ui.notifications.warn("Please select a check type.");
                return;
                }
                challengerRollType = defenderRollType = this.selectedType;
                if (this.selectedType === 'tool') {
                    const toolMap = this.selectedValue;
                    challengerRollValue = defenderRollValue = (actorId) => getActorSpecificValue(actorId, toolMap);
                } else {
                    challengerRollValue = defenderRollValue = this.selectedValue;
                }
            }

            // Get form data
            const dc = (challengerRollType === 'save' && challengerRollValue === 'death') ? 10 : 
                      (html.find('input[name="dc"]').val() || null);
            const showDC = html.find('input[name="showDC"]').prop('checked');
            const groupRoll = html.find('input[name="groupRoll"]').prop('checked');
            const rollMode = html.find('select[name="rollMode"]').val();
            const description = html.find('textarea[name="description"]').val();
            const label = html.find('input[name="label"]').val();

            // Process actors and their specific tool IDs if needed
            const processedActors = selectedActors.map(actor => {
                const result = { ...actor };
                if (actor.group === 1 && challengerRollType === 'tool') {
                    result.toolId = typeof challengerRollValue === 'function' ? challengerRollValue(actor.id) : challengerRollValue;
                } else if (actor.group === 2 && defenderRollType === 'tool') {
                    result.toolId = typeof defenderRollValue === 'function' ? defenderRollValue(actor.id) : defenderRollValue;
                }
                return result;
            });

            // Get roll information for both challenger and defender
            const getRollInfo = (type, value) => {
                let name, desc, link;
                const showExplanation = html.find('input[name="showRollExplanation"]').prop('checked');
                const showLink = html.find('input[name="showRollExplanationLink"]').prop('checked');

                switch (type) {
                    case 'quick':
                        // Map quick roll values to their corresponding skill data
                        const quickRollMap = {
                            'perception': { skill: 'prc', name: 'Party Perception' },
                            'insight': { skill: 'ins', name: 'Party Insight' },
                            'investigation': { skill: 'inv', name: 'Party Investigation' },
                            'nature': { skill: 'nat', name: 'Party Nature' },
                            'stealth': { skill: 'ste', name: 'Party Stealth' }
                        };
                        const quickRollData = quickRollMap[value];
                        if (quickRollData) {
                            const skillData = CONFIG.DND5E.skills[quickRollData.skill];
                            name = quickRollData.name;
                            desc = showExplanation ? this.skillInfo?.description : null;
                            link = showLink ? this.skillInfo?.link : null;
                        }
                        break;
                case 'skill':
                        const skillData = CONFIG.DND5E.skills[value];
                        name = game.i18n.localize(skillData?.label);
                        desc = showExplanation ? this.skillInfo?.description : null;
                        link = showLink ? this.skillInfo?.link : null;
                    break;
                case 'tool':
                        // For tools, we'll get the name from the first actor's tool
                        const firstActor = processedActors[0];
                        const toolId = typeof value === 'function' ? value(firstActor.id) : value;
                        const toolItem = game.actors.get(firstActor.id)?.items.get(toolId);
                        name = toolItem?.name;
                        desc = showExplanation ? (toolItem?.system.description?.value || '').replace(/<\/?p>/gi, '').trim() : null;
                        link = null; // Tools don't have SRD links
                    break;
                case 'ability':
                        const abilityData = CONFIG.DND5E.abilities[value];
                        const customAbilityData = this.getData().abilities.find(a => a.id === value);
                    const abilityName = game.i18n.localize(abilityData?.label);
                        name = abilityName + ' Check';
                        desc = showExplanation ? (customAbilityData?.description || '') : null;
                        link = showLink ? `@UUID[${abilityData.reference}]{${abilityName} Check}` : null;
                    break;
                case 'save':
                        if (value === 'death') {
                            name = 'Death Save';
                            desc = showExplanation ? 'When you start your turn with 0 hit points, you must make a special saving throw, called a death saving throw, to determine whether you creep closer to death or hang onto life.' : null;
                            link = null;
                        } else {
                            const saveData = CONFIG.DND5E.abilities[value];
                            const customSaveData = this.getData().saves.find(s => s.id === value);
                    const saveName = game.i18n.localize(saveData?.label);
                            name = saveName + ' Save';
                            desc = showExplanation ? (customSaveData?.description || '') : null;
                            link = showLink ? `@UUID[${saveData.reference}]{${saveName} Save}` : null;
                        }
                    break;
                case 'dice':
                        name = `${value} Roll`;
                        desc = showExplanation ? `This is a standard ${value} dice roll. This is a straight-forward roll that does not include any modifiers or bonuses.` : null;
                        link = null; // Dice rolls don't have SRD links
                    break;
                default:
                        name = value;
                        desc = null;
                        link = null;
                }
                return { name, desc, link };
            };

            // Get info for both roll types
            const challengerInfo = getRollInfo(challengerRollType, challengerRollValue);
            const defenderInfo = isContestedRoll ? getRollInfo(defenderRollType, defenderRollValue) : null;

            // Create message data with processed actors
            const messageData = {
                skillName: challengerInfo.name,
                defenderSkillName: isContestedRoll && defenderInfo ? defenderInfo.name : null,
                skillAbbr: challengerRollType === 'tool' ? (processedActors[0]?.toolId || null) : challengerRollValue,
                defenderSkillAbbr: isContestedRoll ? (defenderRollType === 'tool' ? (processedActors.find(a => a.group === 2)?.toolId || null) : defenderRollValue) : null,
                actors: processedActors,
                requesterId: game.user.id,
                type: 'skillCheck',
                dc: dc,
                showDC: showDC,
                isGroupRoll: groupRoll,
                label: label || null,
                description: description || null,
                skillDescription: challengerInfo.desc,
                defenderSkillDescription: isContestedRoll && defenderInfo ? defenderInfo.desc : null,
                skillLink: challengerInfo.link,
                defenderSkillLink: isContestedRoll && defenderInfo ? defenderInfo.link : null,
                rollMode,
                rollType: challengerRollType,
                defenderRollType: isContestedRoll ? defenderRollType : null,
                hasMultipleGroups: isContestedRoll
            };

            // Create the chat message
            const content = await renderTemplate('modules/coffee-pub-blacksmith/templates/skill-check-card.hbs', messageData);
            const chatMessage = await ChatMessage.create({
                content: content,
                speaker: ChatMessage.getSpeaker(),
                flags: {
                    'coffee-pub-blacksmith': messageData
                },
                whisper: rollMode === 'gmroll' ? 
                    [...game.users.filter(u => u.isGM).map(u => u.id),
                     ...processedActors.map(a => game.actors.get(a.id)?.ownership)
                        .flatMap(ownership => Object.entries(ownership)
                            .filter(([userId, level]) => level === 3)
                            .map(([userId]) => userId))] : 
                    [],
                blind: rollMode === 'blindroll'
            });

            // Play notification sound for roll request
            playSound(COFFEEPUB.SOUNDNOTIFICATION09, COFFEEPUB.SOUNDVOLUMENORMAL);

            this.close();
        });

        // Handle the cancel button
        html.find('button[data-button="cancel"]').click(() => this.close());

        // Handle preference checkboxes
        html.find('input[name="showRollExplanation"]').change(ev => {
            this.userPreferences.showRollExplanation = ev.currentTarget.checked;
            game.settings.set('coffee-pub-blacksmith', 'skillCheckPreferences', this.userPreferences);
        });

        html.find('input[name="showRollExplanationLink"]').change(ev => {
            this.userPreferences.showRollExplanationLink = ev.currentTarget.checked;
            game.settings.set('coffee-pub-blacksmith', 'skillCheckPreferences', this.userPreferences);
        });

        html.find('input[name="showDC"]').change(ev => {
            this.userPreferences.showDC = ev.currentTarget.checked;
            game.settings.set('coffee-pub-blacksmith', 'skillCheckPreferences', this.userPreferences);
        });

        html.find('input[name="groupRoll"]').change(ev => {
            this.userPreferences.groupRoll = ev.currentTarget.checked;
            game.settings.set('coffee-pub-blacksmith', 'skillCheckPreferences', this.userPreferences);
        });
    }

    _updateToolList() {
        const tools = this._getToolProficiencies();
        const toolSection = this.element.find('.cpb-check-section').last();
        
        // Clear existing tools
        toolSection.find('.cpb-check-item').remove();
        
        // Add new tools
        tools.forEach(tool => {
            // Convert Map to array of [actorId, toolId] pairs for data attribute
            const actorToolsArray = Array.from(tool.actorTools.entries());
            
            const toolItem = $(`
                <div class="cpb-check-item${tool.isCommon ? '' : ' cpb-tool-unavailable'}" 
                     data-type="tool" 
                     data-tool-name="${tool.name}"
                     data-actor-tools='${JSON.stringify(actorToolsArray).replace(/'/g, "&apos;")}'
                     data-common="${tool.isCommon}">
                    <i class="fas fa-tools"></i>
                    <span>${tool.name}</span>
                    <div class="cpb-roll-type-indicator"></div>
                </div>
            `);
            
            // Only attach click handler if the tool is common
            if (tool.isCommon) {
                toolItem.on('click contextmenu', (ev) => {
                    ev.preventDefault();
                    try {
                const item = ev.currentTarget;
                        const type = 'tool';
                        // Parse the actor tools data back into a Map
                        const actorToolsData = JSON.parse(item.dataset.actorTools);
                        const actorTools = new Map(actorToolsData);
                        const isRightClick = ev.type === 'contextmenu';

                        // Check if we have both challengers and defenders
                        const hasChallengers = this.element.find('.cpb-actor-item.cpb-group-1').length > 0;
                        const hasDefenders = this.element.find('.cpb-actor-item.cpb-group-2').length > 0;
                        const isContestedRoll = hasChallengers && hasDefenders;

                        if (isContestedRoll) {
                            // Handle contested roll selection
                            const currentIndicator = $(item).find('.cpb-roll-type-indicator');
                            const currentIcon = currentIndicator.find('i');
                            
                            if (isRightClick) {
                                // Handle defender selection
                                if (currentIcon.hasClass('fa-shield-halved')) {
                                    // Deselect if already selected as defender
                                    currentIndicator.empty();
                                    $(item).removeClass('selected');
                                    this.defenderRoll = { type: null, value: null };
                                } else {
                                    // Clear other defender selections
                                    toolSection.find('.cpb-check-item .cpb-roll-type-indicator i.fa-shield-halved').parent().empty();
                                    toolSection.find('.cpb-check-item').removeClass('selected');
                                    
                                    // Set as defender
                                    currentIndicator.html('<i class="fas fa-shield-halved" title="Defender Roll"></i>');
                                    $(item).addClass('selected');
                                    this.defenderRoll = { type, value: actorTools };
                                }
                            } else {
                                // Handle challenger selection
                                if (currentIcon.hasClass('fa-swords')) {
                                    // Deselect if already selected as challenger
                                    currentIndicator.empty();
                                    $(item).removeClass('selected');
                                    this.challengerRoll = { type: null, value: null };
                                } else {
                                    // Clear other challenger selections
                                    toolSection.find('.cpb-check-item .cpb-roll-type-indicator i.fa-swords').parent().empty();
                                    toolSection.find('.cpb-check-item').removeClass('selected');
                                    
                                    // Set as challenger
                                    currentIndicator.html('<i class="fas fa-swords" title="Challenger Roll"></i>');
                                    $(item).addClass('selected');
                                    this.challengerRoll = { type, value: actorTools };
                                }
                            }
                        } else {
                            // Handle non-contested roll selection
                            const currentIndicator = $(item).find('.cpb-roll-type-indicator');
                            const hasCurrentSelection = currentIndicator.html() !== '';
                            
                            // Clear all selections first
                            toolSection.find('.cpb-check-item').removeClass('selected');
                            toolSection.find('.cpb-check-item .cpb-roll-type-indicator').empty();
                            
                            if (hasCurrentSelection) {
                                // If clicking an already selected item, clear the selection
                                this.selectedType = null;
                                this.selectedValue = null;
                            } else {
                                // Set new selection
                                if (isRightClick) {
                                    currentIndicator.html('<i class="fas fa-shield-halved" title="Defender Roll"></i>');
                                } else {
                                    currentIndicator.html('<i class="fas fa-swords" title="Challenger Roll"></i>');
                                }
                                $(item).addClass('selected');
                this.selectedType = type;
                                this.selectedValue = actorTools;
                            }
                        }
                    } catch (error) {
                        console.error('Error in tool selection:', error);
                        ui.notifications.error('There was an error processing the tool selection.');
                    }
                });
            } else {
                toolItem.on('click contextmenu', (ev) => {
                    ev.preventDefault();
                    ui.notifications.warn(`Not all selected players have ${tool.name}.`);
                });
            }
            
            toolSection.append(toolItem);
        });
    }

    // Update helper method to optionally defer visibility updates
    _applyFilter(html, filterType, updateVisibility = true) {
        html.find('.cpb-actor-list .cpb-actor-item').each((i, el) => {
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
                case 'monster':
                    // Show only non-player characters (type === 'npc')
                    //show = token != null && (!actor.hasPlayerOwner || actor.type !== 'character');
                    show = actor.type === 'npc';
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