// Import required modules
import { MODULE_ID } from './const.js';
import { playSound, rollCoffeePubDice, postConsoleAndNotification, COFFEEPUB } from './global.js';
import { handleSkillRollUpdate } from './blacksmith.js';

export class SkillCheckDialog extends Application {
    constructor(data = {}) {
        super();
        this.actors = data.actors || [];
        this.selectedType = data.initialSkill ? 'skill' : null;
        this.selectedValue = data.initialSkill || null;
        this.challengerRoll = { type: null, value: null };
        this.defenderRoll = { type: null, value: null };
        this.callback = data.callback || null;
        this.onRollComplete = data.onRollComplete || null;
        this._isQuickPartyRoll = false; // Track if the current roll is a quick party roll
        this._quickRollOverrides = undefined; // Track quick roll overrides
        
        // Load user preferences
        this.userPreferences = game.settings.get('coffee-pub-blacksmith', 'skillCheckPreferences') || {
            showRollExplanation: true,
            showRollExplanationLink: true,
            showDC: true,
            groupRoll: true,
            isCinematic: false
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
                id: t.id,
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
            icon: "fas fa-toolbox",
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
            const tokenId = el.dataset.tokenId; // Updated to use new data attribute name
            const token = canvas.tokens.placeables.find(t => t.id === tokenId);
            const actor = token?.actor;
            if (!actor) return;

            // Get tool proficiencies from the actor
            const tools = actor.items.filter(i => i.type === "tool");
            console.log(`Actor ${actor.name} tools:`, tools.map(t => t.name));
            tools.forEach(tool => {
                if (!toolProfs.has(tool.name)) {
                    toolProfs.set(tool.name, {
                        count: 1,
                        actorTools: new Map([[actor.id, tool.id]]) // Use actor.id for tool mapping
                    });
                } else {
                    const toolData = toolProfs.get(tool.name);
                    toolData.count++;
                    toolData.actorTools.set(actor.id, tool.id); // Use actor.id for tool mapping
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

        console.log("BLACKSMITH | SKILLROLLL | LOCATION CHECK: We are in skill-check-dialogue.js and in activateListeners(html)...");

        // If we have an initial skill selection, trigger a click on it
        if (this.selectedType === 'skill' && this.selectedValue) {
            const skillItem = html.find(`.cpb-check-item[data-type="skill"][data-value="${this.selectedValue}"]`);
            if (skillItem.length) {
                skillItem.addClass('selected');
                const indicator = skillItem[0].querySelector('.cpb-roll-type-indicator');
                if (indicator) {
                    indicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                }
            }
        }

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
                // Read new data attributes
                const rollType = item.dataset.rollType || null;
                const groupAttr = item.dataset.group;
                const dcAttr = item.dataset.dc;
                let isGroupRoll = null;
                if (groupAttr !== undefined) isGroupRoll = groupAttr === 'true';
                let dcOverride = dcAttr !== undefined ? dcAttr : null;

                // Clear any existing selections
                html.find('.cpb-check-item').removeClass('selected');
                html.find('.cpb-check-item .cpb-roll-type-indicator').html('');

                // Party roll: select all party members
                if (rollType === 'party') {
                    html.find('.cpb-actor-item').each((i, actorItem) => {
                        const tokenId = actorItem.dataset.tokenId; // This is now a token ID
                        const token = canvas.tokens.placeables.find(t => t.id === tokenId);
                        const actor = token?.actor;
                        if (actor && actor.hasPlayerOwner) {
                            actorItem.classList.add('selected');
                            actorItem.classList.add('cpb-group-1');
                            const indicator = actorItem.querySelector('.cpb-group-indicator');
                            if (indicator) {
                                indicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                            }
                        }
                    });
                } else if (rollType === 'common') {
                    // Common roll: use only selected tokens (do nothing extra)
                }

                // Set the skill selection
                const quickRollMap = {
                    'perception': 'prc',
                    'insight': 'ins',
                    'investigation': 'inv',
                    'nature': 'nat',
                    'stealth': 'ste'
                };
                const skillValue = quickRollMap[value] || value;
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

                // Set quick party/common roll flag and store overrides
                this._isQuickPartyRoll = true;
                this._quickRollOverrides = {
                    isGroupRoll,
                    dcOverride
                };

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
            // Guard clause: Only proceed if the current user is the owner of at least one selected actor or is GM
            const selectedActors = Array.from(html.find('.cpb-actor-item.selected')).map(item => {
                const tokenId = item.dataset.tokenId; // This is now a token ID
                const token = canvas.tokens.placeables.find(t => t.id === tokenId);
                const actor = token?.actor;
                return {
                    tokenId: tokenId,
                    actorId: actor?.id, // Get the actual actor ID for roll operations
                    name: item.querySelector('.cpb-actor-name, .actor-name').textContent,
                    group: item.classList.contains('cpb-group-1') ? 1 : 
                           item.classList.contains('cpb-group-2') ? 2 : 1,
                    actor: actor // Store the actor object for convenience
                };
            });
            const isRoller = selectedActors.some(a => {
                return a.actor && (a.actor.isOwner || game.user.isGM);
            });
            if (!isRoller) return;
            
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
            let dc;
            let groupRoll;
            if (this._isQuickPartyRoll && this._quickRollOverrides) {
                // Use overrides from quick roll
                if (this._quickRollOverrides.dcOverride !== null) {
                    dc = this._quickRollOverrides.dcOverride;
                } else {
                    const dcInput = html.find('input[name="dc"]');
                    dc = dcInput.val() ? dcInput.val() : 15;
                }
                if (this._quickRollOverrides.isGroupRoll !== null) {
                    groupRoll = this._quickRollOverrides.isGroupRoll;
                } else {
                    groupRoll = html.find('input[name="groupRoll"]').prop('checked');
                }
            } else {
                dc = (challengerRollType === 'save' && challengerRollValue === 'death') ? 10 : 
                      (html.find('input[name="dc"]').val() || null);
                groupRoll = html.find('input[name="groupRoll"]').prop('checked');
            }
            const showDC = html.find('input[name="showDC"]').prop('checked');
            const rollMode = html.find('select[name="rollMode"]').val();
            const description = html.find('textarea[name="description"]').val();
            const label = html.find('input[name="label"]').val();

            // Process actors and their specific tool IDs if needed
            const processedActors = selectedActors.map(actor => {
                const result = { 
                    id: actor.tokenId, // Use token ID as the primary id (for template matching)
                    actorId: actor.actorId, // Store actor ID for roll operations
                    name: actor.name,
                    group: actor.group
                };
                if (actor.group === 1 && challengerRollType === 'tool') {
                    result.toolId = typeof challengerRollValue === 'function' ? challengerRollValue(actor.actorId) : challengerRollValue;
                } else if (actor.group === 2 && defenderRollType === 'tool') {
                    result.toolId = typeof defenderRollValue === 'function' ? defenderRollValue(actor.actorId) : defenderRollValue;
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
                hasMultipleGroups: isContestedRoll,
                showRollExplanation: html.find('input[name="showRollExplanation"]').is(':checked'),
                showRollExplanationLink: html.find('input[name="showRollExplanationLink"]').is(':checked'),
                isCinematic: html.find('input[name="isCinematic"]').is(':checked')
            };

            console.log('CPB | Cinematic Mode flag set to:', messageData.isCinematic);

            // Create the chat message
            ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker(),
                content: await SkillCheckDialog.formatChatMessage(messageData),
                flags: { 'coffee-pub-blacksmith': messageData }
            }).then(message => {
                // If cinematic mode is enabled, show for the GM and broadcast to players
                if (messageData.isCinematic) {
                    // Show for the current user who initiated the roll
                    SkillCheckDialog._showCinematicDisplay(messageData, message.id);

                    // Emit to other users to show the overlay
                    game.socket.emit(`module.${MODULE_ID}`, {
                        type: 'showCinematicOverlay',
                        data: {
                            messageId: message.id,
                            messageData: messageData
                        }
                    });
                }
            });

            // Close the dialog
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

        html.find('input[name="isCinematic"]').change(ev => {
            this.userPreferences.isCinematic = ev.currentTarget.checked;
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
            const tokenId = el.dataset.tokenId; // This is now a token ID
            const token = canvas.tokens.placeables.find(t => t.id === tokenId);
            const actor = token?.actor;
            
            if (!actor) return;
            
            let show = false;
            switch (filterType) {
                case 'selected':
                    // Show only selected tokens on canvas
                    show = canvas.tokens.controlled.some(t => t.id === tokenId);
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

    /**
     * Centralized skill check result processing for use by other modules.
     * @param {object} messageData - The chat message data (flags) for the skill check.
     * @param {string} tokenId - The token ID whose result is being updated.
     * @param {object} result - The roll result object to apply.
     * @returns {object} Updated messageData with the new result.
     */
    static processRollResult(messageData, tokenId, result) {
        // Update the actors array with the new result - match by token ID
        const actors = (messageData.actors || []).map(a => ({
            ...a,
            result: a.id === tokenId ? result : a.result
        }));
        return {
            ...messageData,
            actors
        };
    }

    /**
     * Centralized logic to determine which sound to play for a skill check result.
     * @param {object} messageData - The chat message data (flags) for the skill check.
     * @param {string} tokenId - The token ID whose result was just posted.
     * @returns {string} The COFFEEPUB sound constant to play.
     */
    static getResultSound(messageData, tokenId) {
        const isGroupRoll = messageData.isGroupRoll;
        const dc = messageData.dc;
        let actorResult = null;
        if (Array.isArray(messageData.actors) && messageData.actors.length > 0) {
            actorResult = messageData.actors.find(a => a.id === tokenId && a.result && typeof a.result.total === 'number');
        }
        if (!isGroupRoll) {
            if (dc && actorResult && typeof actorResult.result.total === 'number') {
                if (actorResult.result.total >= Number(dc)) {
                    return COFFEEPUB.SOUNDBUTTON08; // Success
                } else {
                    return COFFEEPUB.SOUNDBUTTON07; // Failure
                }
            } else {
                return COFFEEPUB.SOUNDBUTTON08; // Default to success sound
            }
        } else {
            // Existing group roll sound logic (unchanged)
            return COFFEEPUB.SOUNDBUTTON07;
        }
    }

    /**
     * Centralized chat message formatting for skill check results.
     * @param {object} messageData - The chat message data (flags) for the skill check.
     * @returns {Promise<string>} The rendered chat message content.
     */
    static async formatChatMessage(messageData) {
        return renderTemplate('modules/coffee-pub-blacksmith/templates/skill-check-card.hbs', messageData);
    }

    /**
     * Shows a cinematic display for the skill check.
     * @param {object} messageData - The chat message data (flags) for the skill check.
     * @param {string} messageId - The ID of the chat message.
     */
    static _showCinematicDisplay(messageData, messageId) {
        // Remove any existing overlay
        $('#cpb-cinematic-overlay').remove();

        const actorCards = messageData.actors.map(actor => {
            const token = canvas.tokens.get(actor.id) || canvas.tokens.placeables.find(t => t.actor?.id === actor.actorId);
            const actorDocument = token?.actor;
            const actorImg = actorDocument?.img || 'icons/svg/mystery-man.svg';
            const actorName = actor.name;
            const result = actor.result;

            // Check for ownership to apply disabled style and correct icon
            const hasPermission = game.user.isGM || actorDocument?.isOwner;

            let rollAreaHtml;
            if (hasPermission) {
                rollAreaHtml = `
                    <div class="cpb-cinematic-roll-area">
                        <button class="cpb-cinematic-roll-btn" data-token-id="${actor.id}" data-actor-id="${actor.actorId}">
                            <i class="fas fa-dice-d20"></i>
                        </button>
                    </div>
                `;
            } else {
                rollAreaHtml = `
                    <div class="cpb-cinematic-roll-area">
                        <div class="cpb-cinematic-wait-icon">
                            <i class="fas fa-hourglass-half"></i>
                        </div>
                    </div>
                `;
            }

            if (result) {
                const successClass = result.total >= messageData.dc ? 'success' : 'failure';
                rollAreaHtml = `<div class="cpb-cinematic-roll-area"><div class="cpb-cinematic-roll-result ${successClass}">${result.total}</div></div>`;
            }

            return `
                <div class="cpb-cinematic-card" data-token-id="${actor.id}">
                    <img src="${actorImg}" alt="${actorName}">
                    <div class="cpb-cinematic-actor-name">${actorName}</div>
                    ${rollAreaHtml}
                </div>
            `;
        }).join('');

        // Create roll details text
        let rollDetailsHtml = `<div class="cpb-cinematic-roll-details">`;
        rollDetailsHtml += `<h2 class="cpb-cinematic-roll-title">${messageData.skillName}</h2>`;
        
        const subtextParts = [];
        if (messageData.showDC && messageData.dc) {
            subtextParts.push(`DC ${messageData.dc}`);
        }
        if (messageData.isGroupRoll) {
            subtextParts.push(`Group Roll`);
        }
        
        if (subtextParts.length > 0) {
            rollDetailsHtml += `<p class="cpb-cinematic-roll-subtext">${subtextParts.join(' &bull; ')}</p>`;
        }
        
        rollDetailsHtml += `</div>`;

        const overlay = $(`
            <div id="cpb-cinematic-overlay">
                <button class="cpb-cinematic-close-btn"><i class="fas fa-times"></i></button>
                <div id="cpb-cinematic-bar">
                    ${rollDetailsHtml}
                    <div class="cpb-cinematic-actors-container">
                        ${actorCards}
                    </div>
                </div>
            </div>
        `);
        overlay.data('messageId', messageId);

        $('body').append(overlay);

        // Attach click handler for the close button
        overlay.find('.cpb-cinematic-close-btn').on('click', () => this._hideCinematicDisplay());

        // Attach click handlers to the new roll buttons
        overlay.find('.cpb-cinematic-roll-btn').on('click', async (event) => {
            const button = event.currentTarget;
            const tokenId = button.dataset.tokenId;

            // Find the corresponding button in the chat log and click it.
            const chatMessageElement = $(`#chat-log .message[data-message-id="${messageId}"]`);
            if (chatMessageElement.length) {
                const targetButton = chatMessageElement.find(`.cpb-skill-roll[data-token-id="${tokenId}"]`);
                if (targetButton.length) {
                    button.disabled = true; // Prevent double clicks on overlay
                    $(button).find('i').addClass('fa-spin'); // Add spin animation
                    
                    targetButton.click(); // Trigger the click on the actual chat card button
                } else {
                    console.warn(`Blacksmith | Cinematic: Could not find roll button for token ${tokenId} in message ${messageId}`);
                    ui.notifications.warn("Could not find the corresponding roll button in the chat log.");
                    button.disabled = false; // Re-enable the button if the target wasn't found
                    $(button).find('i').removeClass('fa-spin');
                }
            } else {
                console.warn(`Blacksmith | Cinematic: Could not find chat message ${messageId}`);
                ui.notifications.warn("Could not find the corresponding chat message for this roll.");
                button.disabled = false; // Re-enable the button if the target wasn't found
                $(button).find('i').removeClass('fa-spin');
            }
        });

        // Use a timeout to allow the element to be added to the DOM before adding the class for transition
        setTimeout(() => overlay.addClass('visible'), 50);
    }

    /**
     * Updates a single actor's card in the cinematic display.
     * @param {string} tokenId - The ID of the token to update.
     * @param {object} result - The roll result object.
     * @param {object} messageData - The full message data.
     */
    static _updateCinematicDisplay(tokenId, result, messageData) {
        const overlay = $('#cpb-cinematic-overlay');
        if (!overlay.length) return;

        const card = overlay.find(`.cpb-cinematic-card[data-token-id="${tokenId}"]`);
        if (!card.length) return;

        // Use a timeout to create a delay for the reveal
        setTimeout(() => {
            const rollArea = card.find('.cpb-cinematic-roll-area');
            rollArea.empty(); // Clear the button or pending icon

            const successClass = result.total >= messageData.dc ? 'success' : 'failure';
            const resultHtml = `<div class="cpb-cinematic-roll-result ${successClass}">${result.total}</div>`;
            rollArea.append(resultHtml);

            // Check if all rolls are complete to hide the overlay
            const allComplete = messageData.actors.every(a => {
                const actorCard = overlay.find(`.cpb-cinematic-card[data-token-id="${a.id}"]`);
                return actorCard.find('.cpb-cinematic-roll-result').length > 0;
            });
            
            if (allComplete) {
                // If it is a group roll, display the result
                if (messageData.isGroupRoll && messageData.hasOwnProperty('groupSuccess')) {
                    const { groupSuccess, successCount, totalCount } = messageData;
                    const resultText = groupSuccess ? 'GROUP SUCCESS' : 'GROUP FAILURE';
                    const detailText = `${successCount} of ${totalCount} Succeeded`;
                    const resultClass = groupSuccess ? 'success' : 'failure';

                    const resultsBarHtml = `
                        <div id="cpb-cinematic-results-bar">
                            <div class="cpb-cinematic-group-result ${resultClass}">
                                <div class="cpb-cinematic-group-result-text">${resultText}</div>
                                <div class="cpb-cinematic-group-result-detail">${detailText}</div>
                            </div>
                        </div>
                    `;
                    
                    // Append the new results bar to the main cinematic bar
                    overlay.find('#cpb-cinematic-bar').append(resultsBarHtml);
                }

                setTimeout(() => this._hideCinematicDisplay(), 3000); // Hide after 3 seconds
            }
        }, 2000); // 2-second delay for animation
    }

    /**
     * Hides the cinematic display.
     */
    static _hideCinematicDisplay() {
        const overlay = $('#cpb-cinematic-overlay');
        if (game.user.isGM) {
            game.socket.emit(`module.${MODULE_ID}`, { type: 'closeCinematicOverlay' });
        }
        overlay.removeClass('visible');
        setTimeout(() => overlay.remove(), 500); // Remove from DOM after transition
    }

    /**
     * Attach listeners to chat card roll buttons and handle roll logic.
     * @param {object} message - The chat message object.
     * @param {object} html - The jQuery-wrapped HTML of the chat card.
     */
    static handleChatMessageClick(message, html) {
        html.find('.cpb-skill-roll').each((_, btn) => {
            $(btn).off('click').on('click', async (event) => {
                console.log('Handler attached, message:', message);
                const button = event.currentTarget;
                const tokenId = button.dataset.tokenId; // Get token ID
                const actorId = button.dataset.actorId; // Get actor ID for roll operations
                
                console.log('Debug - tokenId:', tokenId, 'actorId:', actorId);
                
                const messageData = message.flags['coffee-pub-blacksmith'];
                console.log('CPB | Cinematic Mode flag read as:', messageData.isCinematic, 'from message flags:', messageData);

                // Check if the click is coming from the cinematic UI
                const isCinematicClick = $('#cpb-cinematic-overlay').length > 0;
                const rollOptions = { 
                    chatMessage: false, 
                    createMessage: false, 
                    fastForward: isCinematicClick 
                };

                if (messageData.isCinematic && !isCinematicClick) {
                    this._showCinematicDisplay(messageData, message.id);
                }

                // Get the token and actor
                let token = canvas.tokens.get(tokenId);
                console.log('Debug - found token:', token);
                
                let actor = null;
                if (token?.actor) {
                    actor = token.actor;
                    console.log('Debug - got actor from token:', actor);
                } else if (actorId) {
                    actor = game.actors.get(actorId);
                    console.log('Debug - got actor from actorId:', actor);
                }
                
                if (!actor) {
                    console.error('Debug - Could not find actor for tokenId:', tokenId, 'or actorId:', actorId);
                    ui.notifications.error("Could not find the actor for this roll.");
                    return;
                }
                
                // Check permissions: GMs can roll for any token, others need ownership
                if (!game.user.isGM && !actor?.isOwner) {
                    ui.notifications.warn("You don't have permission to roll for this character.");
                    return;
                }
                try {
                    const flags = message.flags['coffee-pub-blacksmith'];
                    if (!flags) return;
                    // Roll the check but suppress the chat message
                    let roll;
                    const type = button.dataset.type || 'skill';
                    const value = button.dataset.value;
                    switch (type) {
                        case 'dice':
                            roll = await (new Roll(value)).evaluate();
                            rollCoffeePubDice(roll);
                            playSound(COFFEEPUB.SOUNDBUTTON07, COFFEEPUB.SOUNDVOLUMENORMAL);
                            break;
                        case 'skill':
                            if (typeof actor?.rollSkillV2 === 'function') {
                                roll = await actor.rollSkillV2(value, rollOptions);
                            } else {
                                roll = await actor.rollSkill(value, rollOptions);
                            }
                            break;
                        case 'ability':
                            roll = await actor.rollAbilityTest(value, rollOptions);
                            break;
                        case 'save':
                            if (value === 'death') {
                                roll = await actor.rollDeathSave(rollOptions);
                            } else {
                                roll = await actor.rollSavingThrow(value, rollOptions);
                            }
                            break;
                        case 'tool': {
                            const actorData = flags.actors.find(a => a.id === tokenId); // Find by token ID
                            const toolId = actorData?.toolId;
                            if (!toolId) {
                                ui.notifications.error(`No tool ID found for actor ${actor.name}`);
                                return;
                            }
                            const item = actor.items.get(toolId);
                            if (!item) {
                                ui.notifications.error(`Tool not found on actor: ${toolId}`);
                                return;
                            }
  
                            const rollData = actor.getRollData();
                            const ability = item.system.ability || "int";
                            const abilityMod = foundry.utils.getProperty(actor.system.abilities, `${ability}.mod`) || 0;
                            const prof = item.system.proficient ? actor.system.attributes.prof : 0;
                            const totalMod = abilityMod + prof;
                            const formula = `1d20 + ${totalMod}`;
                            roll = new Roll(formula, rollData);
                            await roll.evaluate({ async: true });
                            rollCoffeePubDice(roll);
                            break;
                        }
                        default:
                            return;
                    }

                    // Immediately after the switch, check if roll is defined
                    if (typeof roll === 'undefined') return;

                    // Format the roll result string
                    let rollResultStr = "";
                    const dc = flags.dc ? parseInt(flags.dc) : null;
                    if (dc) {
                        const success = roll.total >= dc;
                        rollResultStr = `DC ${dc} Check with a roll of ${roll.total} (${success ? 'success' : 'failure'})`;
                    } else {
                        rollResultStr = `Roll Result: ${roll.total}`;
                    }

                    // Update the actors array with the roll result - use token ID for matching
                    const actors = flags.actors.map(a => ({
                        ...a,
                        result: a.id === tokenId ? ( // Match by token ID
                            roll ? {
                                total: roll.total,
                                formula: roll.formula,
                                resultString: rollResultStr
                            } : {
                                total: "No Roll Needed",
                                formula: "Invalid Death Save",
                                error: "Character is not eligible for death saves"
                            }
                        ) : a.result
                    }));

                    // Calculate group roll results if needed
                    let groupRollData = {};
                    if (flags.isGroupRoll) {
                        const completedRolls = actors.filter(a => a.result);
                        const allRollsComplete = completedRolls.length === actors.length;
                        groupRollData = {
                            isGroupRoll: true,
                            allRollsComplete
                        };
                        if (allRollsComplete && flags.dc) {
                            const successCount = actors.filter(a => a.result && a.result.total >= flags.dc).length;
                            const totalCount = actors.length;
                            const groupSuccess = successCount > (totalCount / 2);
                            Object.assign(groupRollData, {
                                successCount,
                                totalCount,
                                groupSuccess
                            });
                        }
                    }

                    // Calculate contested roll results if needed
                    let contestedRoll;
                    if (flags.hasMultipleGroups && actors.every(a => a.result)) {
                        const group1 = actors.filter(a => a.group === 1);
                        const group2 = actors.filter(a => a.group === 2);
                        const group1Highest = Math.max(...group1.map(a => a.result.total));
                        const group2Highest = Math.max(...group2.map(a => a.result.total));
                        if (flags.dc && group1Highest < flags.dc && group2Highest < flags.dc) {
                            contestedRoll = {
                                winningGroup: 0,
                                group1Highest,
                                group2Highest,
                                isTie: true
                            };
                        } else {
                            const isGroup1Winner = group1Highest > group2Highest;
                            contestedRoll = {
                                winningGroup: isGroup1Winner ? 1 : 2,
                                group1Highest,
                                group2Highest,
                                isTie: group1Highest === group2Highest
                            };
                        }
                    }

                    // Update the message data
                    const messageData = {
                        ...flags,
                        ...groupRollData,
                        actors,
                        contestedRoll
                    };

                    // Always emit the update to the GM (even if GM is rolling) - use token ID for the update
                    game.socket.emit('module.coffee-pub-blacksmith', {
                        type: 'updateSkillRoll',
                        data: {
                            messageId: message.id,
                            tokenId: tokenId, // Use token ID for the update
                            result: roll
                        }
                    });
                    // If GM, call the handler directly as well
                    if (game.user.isGM) {
                        await handleSkillRollUpdate({
                            messageId: message.id,
                            tokenId: tokenId, // Use token ID for the update
                            result: roll
                        });
                    }

                    // Call the callback if it exists
                    if (message.app?.onRollComplete) {
                        message.app.onRollComplete(rollResultStr);
                    }

                    // Play sound for individual rolls (not group rolls)
                    const isGroupRoll = messageData.isGroupRoll;
                    if (!isGroupRoll) {
                        if (dc && roll) {
                            if (roll.total >= dc) {
                                playSound(COFFEEPUB.SOUNDBUTTON08, COFFEEPUB.SOUNDVOLUMENORMAL); // Success
                            } else {
                                playSound(COFFEEPUB.SOUNDBUTTON07, COFFEEPUB.SOUNDVOLUMENORMAL); // Failure
                            }
                        } else {
                            playSound(COFFEEPUB.SOUNDBUTTON08, COFFEEPUB.SOUNDVOLUMENORMAL); // Default to success sound
                        }
                    } else {
                        playSound(COFFEEPUB.SOUNDBUTTON07, COFFEEPUB.SOUNDVOLUMENORMAL);
                    }
                } catch (err) {
                    console.error("Error handling skill roll:", err);
                }
            });
        });
    }
} 