// Import required modules
import { MODULE } from './const.js';
import { playSound, rollCoffeePubDice, postConsoleAndNotification } from './api-core.js';
import { handleSkillRollUpdate } from './blacksmith.js';
import { SocketManager } from './manager-sockets.js';
import { skillDescriptions, abilityDescriptions, saveDescriptions, toolDescriptions } from '../resources/dictionary.js';


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
            showDC: true,
            groupRoll: true,
            isCinematic: false
        };
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'skill-check-dialog',
            template: 'modules/coffee-pub-blacksmith/templates/window-skillcheck.hbs',
            classes: ['coffee-pub-blacksmith', 'skill-check-dialog'],
            title: 'Request a Roll',
            width: 800,
            height: 700,
            resizable: true
        });
    }

    getData() {
        // Get all tokens from the canvas, including NPCs and monsters
        const canvasTokens = canvas.tokens.placeables
            .filter(t => t.actor)
            .map(t => ({
                id: t.id,
                name: t.name, // Use the token's name for display
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
        postConsoleAndNotification(MODULE.NAME, 'Tools data being passed to template:', tools, true, false);

        // Use imported descriptions from dictionary.js

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
            userPreferences: this.userPreferences,
            dcValue: '' // Default DC value, will be updated by user input
        };

        postConsoleAndNotification(MODULE.NAME, 'Final template data:', templateData, true, false);
        return templateData;
    }

    _getToolProficiencies() {
        const toolProfs = new Map(); // Map of tool name to count and actor-specific IDs
        const selectedActors = this.element?.find('.cpb-actor-item.selected') || [];
        const selectedCount = selectedActors.length;
        
        if (selectedCount === 0) return [];

        postConsoleAndNotification(MODULE.NAME, 'Selected actors count:', selectedCount, true, false);
        
        selectedActors.each((i, el) => {
            const tokenId = el.dataset.tokenId; // Updated to use new data attribute name
            const token = canvas.tokens.placeables.find(t => t.id === tokenId);
            const actor = token?.actor;
            if (!actor) return;

            // Keep track of tool names processed for this actor to avoid double-counting
            const processedTools = new Set();

            // Get tool proficiencies from the actor
            const tools = actor.items.filter(i => i.type === "tool");
            postConsoleAndNotification(MODULE.NAME, `Actor ${actor.name} tools:`, tools.map(t => t.name), true, false);
            tools.forEach(tool => {
                // If we've already processed a tool with this name for this actor, skip it
                if (processedTools.has(tool.name)) return;

                const toolIdentifier = tool.system.baseItem || tool.id; // Use baseItem if available, fallback to id
                if (!toolProfs.has(tool.name)) {
                    toolProfs.set(tool.name, {
                        count: 1,
                        actorTools: new Map([[actor.id, toolIdentifier]]) // Use actor.id for tool mapping
                    });
                } else {
                    const toolData = toolProfs.get(tool.name);
                    toolData.count++;
                    toolData.actorTools.set(actor.id, toolIdentifier); // Use actor.id for tool mapping
                }
                
                processedTools.add(tool.name);
            });
        });

        // Convert to array and add isCommon flag
        const result = Array.from(toolProfs.entries())
            .map(([name, data]) => {
                const isCommon = data.count === selectedCount;
                postConsoleAndNotification(MODULE.NAME, `Tool ${name}: count=${data.count}, selectedCount=${selectedCount}, isCommon=${isCommon}`, "", true, false);
                const description = toolDescriptions[name] || 'A specialized tool for specific tasks.';
                
                return {
                    name,
                    isCommon,
                    actorTools: data.actorTools, // Map of actorId to their specific tool ID
                    description
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

        postConsoleAndNotification(MODULE.NAME, 'Final tool list:', result, true, false);
        return result;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // v13: Handle both jQuery and native DOM (some Application classes may still pass jQuery)
        // Convert jQuery to native DOM if needed
        let htmlElement;
        if (html && typeof html.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            htmlElement = html[0] || html.get?.(0);
        } else if (html && typeof html.querySelectorAll === 'function') {
            // It's already a native DOM element
            htmlElement = html;
        } else {
            console.error('SkillCheckDialog.activateListeners: Invalid html parameter', html);
            return;
        }
        
        if (!htmlElement) {
            console.error('SkillCheckDialog.activateListeners: Could not extract DOM element');
            return;
        }

        postConsoleAndNotification(MODULE.NAME, "SKILLROLLL | LOCATION CHECK: We are in skill-check-dialogue.js and in activateListeners(html)...", "", true, false);

        // If we have an initial skill selection, trigger a click on it (v13: native DOM)
        if (this.selectedType === 'skill' && this.selectedValue) {
            const skillItem = htmlElement.querySelector(`.cpb-check-item[data-type="skill"][data-value="${this.selectedValue}"]`);
            if (skillItem) {
                skillItem.classList.add('selected', 'cpb-skill-challenger');
                const indicator = skillItem.querySelector('.cpb-roll-type-indicator');
                if (indicator) {
                    indicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                }
            }
        }

        // Debug: Check if classes are being applied (v13: native DOM)
        const unavailableTools = htmlElement.querySelectorAll('.cpb-tool-unavailable');
        postConsoleAndNotification(MODULE.NAME, 'Tool items with unavailable class:', unavailableTools.length, true, false);
        htmlElement.querySelectorAll('.cpb-check-item[data-type="tool"]').forEach((el) => {
            postConsoleAndNotification(MODULE.NAME, 'Tool item:', {
                name: el.querySelector('span').textContent,
                hasUnavailableClass: el.classList.contains('cpb-tool-unavailable'),
                dataCommon: el.dataset.common,
                classList: Array.from(el.classList)
            }, true, false);
        });

        // Apply initial filter if there are selected tokens (v13: native DOM)
        const hasSelectedTokens = canvas.tokens.controlled.length > 0;
        const initialFilter = hasSelectedTokens ? 'selected' : 'party';
        
        // Set initial active state on actor filter button (left column) (v13: native DOM)
        const firstColumn = htmlElement.querySelector('.cpb-dialog-column:first-child');
        const initialFilterBtn = firstColumn?.querySelector(`.cpb-filter-btn[data-filter="${initialFilter}"]`);
        if (initialFilterBtn) initialFilterBtn.classList.add('active');
        
        // Apply initial actor filter
        this._applyFilter(html, initialFilter);
        
        // Set initial roll type filter to "quick" and apply it (middle column) (v13: native DOM)
        const secondColumn = htmlElement.querySelector('.cpb-dialog-column:nth-child(2)');
        const quickFilterBtn = secondColumn?.querySelector(`.cpb-filter-btn[data-filter="quick"]`);
        if (quickFilterBtn) quickFilterBtn.classList.add('active');
        this._applyRollTypeFilter(html, 'quick');

        // If tokens are selected on the canvas, pre-select them in the dialog (v13: native DOM)
        if (hasSelectedTokens) {
            canvas.tokens.controlled.forEach(token => {
                const actorItem = htmlElement.querySelector(`.cpb-actor-item[data-token-id="${token.id}"]`);
                if (actorItem) {
                    const actor = token.actor;
                    const indicator = actorItem.querySelector('.cpb-group-indicator');

                    if (actor && actor.type !== 'character') {
                        // NPCs and Monsters default to Defenders
                        actorItem.classList.remove('cpb-group-1');
                        actorItem.classList.add('selected', 'cpb-group-2');
                        if (indicator) {
                            indicator.innerHTML = '<i class="fas fa-shield-halved" title="Defenders"></i>';
                        }
                    } else {
                        // Players default to Challengers
                        actorItem.classList.remove('cpb-group-2');
                        actorItem.classList.add('selected', 'cpb-group-1');
                        if (indicator) {
                            indicator.innerHTML = '<i class="fas fa-swords" title="Challengers"></i>';
                        }
                    }
                }
            });
            // Update the tool list based on the pre-selected actors
            this._updateToolList();
        }

        // Handle actor selection (v13: native DOM)
        htmlElement.querySelectorAll('.cpb-actor-item').forEach(item => {
            const handleActorSelection = (ev) => {
                ev.preventDefault();
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
                
                // Check if all defenders were removed and clear defender roll selections (v13: native DOM)
                const defenders = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-2');
                const hasDefenders = defenders.length > 0;
                if (!hasDefenders) {
                    // Clear all defender roll selections
                    const defenderIndicators = htmlElement.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator i.fa-shield-halved');
                    defenderIndicators.forEach(indicator => {
                        const parent = indicator.parentElement;
                        if (parent) parent.innerHTML = '';
                    });
                    htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('cpb-skill-defender'));
                    this.defenderRoll = { type: null, value: null };
                }
            };
            
            item.addEventListener('click', handleActorSelection);
            item.addEventListener('contextmenu', handleActorSelection);
        });

        // Handle player search - separate from criteria search (v13: native DOM)
        htmlElement.querySelectorAll('input[name="search"]').forEach((input) => {
            const searchContainer = input.closest('.cpb-search-container');
            const clearButton = searchContainer?.querySelector('.cpb-clear-search-button');
            const dialogColumn = input.closest('.cpb-dialog-column');
            const actorList = dialogColumn?.querySelector('.cpb-actor-list');
            const isPlayerSearch = actorList !== null;
            
            // Show/hide clear button based on input content
            const updateClearButton = () => {
                if (clearButton) {
                    clearButton.style.display = input.value.length > 0 ? '' : 'none';
                }
            };
            
            input.addEventListener('input', (ev) => {
                const searchTerm = ev.currentTarget.value.toLowerCase();
                updateClearButton();
                
                if (isPlayerSearch) {
                    // Search in actor list - support both class naming schemes
                    dialogColumn.querySelectorAll('.cpb-actor-list .cpb-actor-item').forEach((el) => {
                        const nameEl = el.querySelector('.cpb-actor-name');
                        if (nameEl) {
                            const name = nameEl.textContent.toLowerCase();
                            el.style.display = name.includes(searchTerm) ? '' : 'none';
                        }
                    });
                } else {
                    // Search in criteria/checks list
                    htmlElement.querySelectorAll('.cpb-check-item, .check-item').forEach((el) => {
                        const text = el.textContent.toLowerCase();
                        el.style.display = text.includes(searchTerm) ? '' : 'none';
                    });
                }
            });

            // Handle clear button click (v13: native DOM)
            if (clearButton) {
                clearButton.addEventListener('click', () => {
                    input.value = '';
                    // Trigger input event manually
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    clearButton.style.display = 'none';
                });
            }

            // Initial state
            updateClearButton();
        });

        // Handle actor filter buttons (left column) (v13: native DOM)
        // Reuse firstColumn declared in Phase 1 (line 216)
        if (firstColumn) {
            firstColumn.querySelectorAll('.cpb-filter-btn').forEach(button => {
                button.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    const filterType = button.dataset.filter;
                    
                    // Toggle active state on actor filter buttons only
                    firstColumn.querySelectorAll('.cpb-filter-btn').forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                    
                    // Handle actor filtering
                    const firstSearchInput = htmlElement.querySelector('input[name="search"]');
                    const searchTerm = firstSearchInput ? firstSearchInput.value.toLowerCase() : '';
                    if (searchTerm) {
                        // First apply filter without updating visibility
                        this._applyFilter(html, filterType, false);
                        
                        // Then apply search within filtered results
                        firstColumn.querySelectorAll('.cpb-actor-list .cpb-actor-item').forEach((el) => {
                            if (el.style.display !== 'none') {
                                const nameEl = el.querySelector('.cpb-actor-name, .actor-name');
                                if (nameEl) {
                                    const name = nameEl.textContent.toLowerCase();
                                    el.style.display = name.includes(searchTerm) ? '' : 'none';
                                }
                            }
                        });
                    } else {
                        // No search term, just apply filter
                        this._applyFilter(html, filterType, true);
                    }
                });
            });
        }

        // Handle roll type filter buttons (middle column) (v13: native DOM)
        // Reuse secondColumn declared in Phase 1 (line 224)
        if (secondColumn) {
            secondColumn.querySelectorAll('.cpb-filter-btn').forEach(button => {
                button.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    const filterType = button.dataset.filter;
                    
                    // Toggle active state on roll type filter buttons only
                    secondColumn.querySelectorAll('.cpb-filter-btn').forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                    
                    // Handle roll type filtering
                    this._applyRollTypeFilter(html, filterType);
                });
            });
        }

        // Handle check item selection (v13: native DOM)
        htmlElement.querySelectorAll('.cpb-check-item, .check-item').forEach((item) => {
            const handleCheckItemSelection = (ev) => {
                ev.preventDefault();
                const type = item.dataset.type;

                // This handler should not manage tool selections as they have a dedicated handler.
                if (type === 'tool') return;
                
                const value = item.dataset.value;
                const isRightClick = ev.type === 'contextmenu';

                // Handle quick rolls
                if (type === 'quick') {
                    // Read new data attributes
                    const rollType = item.dataset.rollType || null;
                    const groupAttr = item.dataset.group;
                    const dcAttr = item.dataset.dc;
                    const defenderSkillAttr = item.dataset.defenderSkill;
                    const rollTitle = item.dataset.rollTitle || null;
                    let isGroupRoll = null;
                    if (groupAttr !== undefined) isGroupRoll = groupAttr === 'true';
                    let dcOverride = dcAttr !== undefined ? dcAttr : null;

                    // Check if defenders are selected for non-contested rolls (v13: native DOM)
                    if (rollType !== 'contested' && rollType !== 'party') {
                        const defenders = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-2');
                        const hasDefenders = defenders.length > 0;
                        if (hasDefenders) {
                            ui.notifications.warn("You have defenders selected, but this is not a contested roll type. Please deselect defenders or choose a contested roll.");
                            return;
                        }
                    }

                    // Clear any existing selections (v13: native DOM)
                    htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('selected'));
                    htmlElement.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator').forEach(ind => ind.innerHTML = '');

                    // Party roll: select all party members (v13: native DOM)
                    if (rollType === 'party') {
                        htmlElement.querySelectorAll('.cpb-actor-item').forEach((actorItem) => {
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
                } else if (rollType === 'contested') {
                    // Contested roll: set up both challenger and defender skills
                    postConsoleAndNotification(MODULE.NAME, 'CPB | Setting up contested roll:', { value, defenderSkillAttr }, true, false);
                    
                    // Set the challenger skill selection
                    const quickRollMap = {
                        'perception': 'prc',
                        'insight': 'ins',
                        'investigation': 'inv',
                        'nature': 'nat',
                        'stealth': 'ste',
                        'athletics': 'ath',
                        'acrobatics': 'acr',
                        'deception': 'dec',
                        'persuasion': 'per',
                        'intimidation': 'itm'
                    };
                    const challengerSkillValue = quickRollMap[value] || value;
                        if (challengerSkillValue) {
                            const challengerSkillItem = htmlElement.querySelector(`.cpb-check-item[data-type="skill"][data-value="${challengerSkillValue}"]`);
                            if (challengerSkillItem) {
                                challengerSkillItem.classList.add('selected', 'cpb-skill-challenger');
                                const indicator = challengerSkillItem.querySelector('.cpb-roll-type-indicator');
                                if (indicator) {
                                    indicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                                }
                                this.challengerRoll = { type: 'skill', value: challengerSkillValue };
                            }
                        }

                        // Set the defender skill selection (v13: native DOM)
                        if (defenderSkillAttr) {
                            const defenderSkillValue = quickRollMap[defenderSkillAttr] || defenderSkillAttr;
                            const defenderSkillItem = htmlElement.querySelector(`.cpb-check-item[data-type="skill"][data-value="${defenderSkillValue}"]`);
                            if (defenderSkillItem) {
                                defenderSkillItem.classList.add('selected', 'cpb-skill-defender');
                                const indicator = defenderSkillItem.querySelector('.cpb-roll-type-indicator');
                                if (indicator) {
                                    indicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                                }
                                this.defenderRoll = { type: 'skill', value: defenderSkillValue };
                            }
                        }

                        // Set quick contested roll flag and store overrides
                        this._isQuickPartyRoll = true;
                        this._quickRollOverrides = {
                            isGroupRoll: false, // Contested rolls are never group rolls
                            dcOverride: null, // Contested rolls don't use DC
                            isContested: true,
                            rollType: rollType, // Store the roll type for consistency
                            rollTitle: rollTitle // Store the roll title
                        };

                        // Automatically click the roll button (v13: native DOM)
                        const rollButton = htmlElement.querySelector('button[data-button="roll"]');
                        if (rollButton) rollButton.click();
                        return;
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
                        const skillItem = htmlElement.querySelector(`.cpb-check-item[data-type="skill"][data-value="${skillValue}"]`);
                        if (skillItem) {
                            skillItem.classList.add('selected', 'cpb-skill-challenger');
                            const indicator = skillItem.querySelector('.cpb-roll-type-indicator');
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
                        dcOverride,
                        rollType: rollType, // Store the roll type to distinguish party vs other quick rolls
                        rollTitle: rollTitle // Store the roll title
                    };

                    // Automatically click the roll button (v13: native DOM)
                    const rollButton = htmlElement.querySelector('button[data-button="roll"]');
                    if (rollButton) rollButton.click();
                    return;
            }

            // If this is a non-common tool, prevent selection and show notification
            if (type === 'tool' && item.dataset.common === 'false') {
                const toolName = item.querySelector('span')?.textContent || 'selected tool';
                ui.notifications.warn(`Not all selected players have ${toolName}.`);
                return;
            }

                // Check if we have both challengers and defenders (v13: native DOM)
                        const challengers = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-1');
                const defenders = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-2');
                const hasChallengers = challengers.length > 0;
                const hasDefenders = defenders.length > 0;
                const isContestedRoll = hasChallengers && hasDefenders;

                if (isContestedRoll) {
                    // In contested mode, maintain two selections (v13: native DOM)
                    let wasDeselected = false;
                    htmlElement.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator i').forEach((el) => {
                        const indicator = el.closest('.cpb-roll-type-indicator');
                        const checkItem = indicator.closest('.cpb-check-item');
                        
                        // If clicking the same item, deselect it
                        if (checkItem === item) {
                            if ((isRightClick && el.classList.contains('fa-shield-halved')) ||
                                (!isRightClick && el.classList.contains('fa-swords'))) {
                                indicator.innerHTML = '';
                                checkItem.classList.remove('selected');
                                // Remove styling classes
                                checkItem.classList.remove('cpb-skill-challenger', 'cpb-skill-defender');
                                wasDeselected = true;
                                // Clear the appropriate roll type
                                if (isRightClick) {
                                    this.defenderRoll = { type: null, value: null };
                                } else {
                                    this.challengerRoll = { type: null, value: null };
                                }
                            }
                        }
                        // Remove other selections of the same type
                        else if ((isRightClick && el.classList.contains('fa-shield-halved')) ||
                                (!isRightClick && el.classList.contains('fa-swords'))) {
                            indicator.innerHTML = '';
                            checkItem.classList.remove('selected');
                            // Remove styling classes
                            checkItem.classList.remove('cpb-skill-challenger', 'cpb-skill-defender');
                        }
                    });

                    // Break early if deselected
                    if (wasDeselected) return;

                    // Check if trying to select defender roll without defenders (v13: native DOM)
                    if (isRightClick) {
                        const defenders = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-2');
                        const hasDefenders = defenders.length > 0;
                        if (!hasDefenders) {
                            ui.notifications.warn("You must select at least one defender in the contestants column before selecting a defender roll.");
                            return;
                        }
                    }
                    
                    // Add the roll type indicator and selected state
                    const rollTypeIndicator = item.querySelector('.cpb-roll-type-indicator');
                    if (rollTypeIndicator) {
                        if (isRightClick) {
                            rollTypeIndicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                            this.defenderRoll = { type, value };
                            // Add defender styling
                            item.classList.add('cpb-skill-defender');
                            item.classList.remove('cpb-skill-challenger');
                        } else {
                            rollTypeIndicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                            this.challengerRoll = { type, value };
                            // Add challenger styling
                            item.classList.add('cpb-skill-challenger');
                            item.classList.remove('cpb-skill-defender');
                        }
                    }
                    item.classList.add('selected');
                } else {
                    // Check if we're deselecting the current selection
                    const currentIndicator = item.querySelector('.cpb-roll-type-indicator');
                    const hasCurrentSelection = currentIndicator && currentIndicator.innerHTML !== '';
                    
                    if (hasCurrentSelection) {
                        // Clear selection (v13: native DOM)
                        htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('selected'));
                        htmlElement.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator').forEach(ind => ind.innerHTML = '');
                        htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('cpb-skill-challenger', 'cpb-skill-defender'));
                        this.selectedType = null;
                        this.selectedValue = null;
                    } else {
                        // Check if trying to select defender roll without defenders (v13: native DOM)
                        if (isRightClick) {
                            const defenders = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-2');
                            const hasDefenders = defenders.length > 0;
                            if (!hasDefenders) {
                                ui.notifications.warn("You must select at least one defender in the contestants column before selecting a defender roll.");
                                return;
                            }
                        }
                        
                        // New selection (v13: native DOM)
                        htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('selected'));
                        htmlElement.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator').forEach(ind => ind.innerHTML = '');
                        htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('cpb-skill-challenger', 'cpb-skill-defender'));
                    
                    const rollTypeIndicator = item.querySelector('.cpb-roll-type-indicator');
                    if (rollTypeIndicator) {
                        if (isRightClick) {
                            rollTypeIndicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                            item.classList.add('cpb-skill-defender');
                        } else {
                            rollTypeIndicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                            item.classList.add('cpb-skill-challenger');
                        }
                    }
                    item.classList.add('selected');
                    this.selectedType = type;
                    this.selectedValue = value;
                    
                    // Extract roll title for skill/ability/save rolls
                    const rollTitle = item.dataset.rollTitle || null;
                    if (rollTitle) {
                        this.selectedRollTitle = rollTitle;
                    }
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
                    postConsoleAndNotification(MODULE.NAME, "Skill Info set:", this.skillInfo, true, false);
                }
            }
            };
            
            item.addEventListener('click', handleCheckItemSelection);
            item.addEventListener('contextmenu', handleCheckItemSelection);
        });

        // Handle the roll button (v13: native DOM)
        const rollButton = htmlElement.querySelector('button[data-button="roll"]');
        if (rollButton) {
            rollButton.addEventListener('click', async (ev) => {
            // Guard clause: Only proceed if the current user is the owner of at least one selected actor or is GM
            
            // Check if this is a quick party roll and get all party members if so
            let selectedActors;
                if (this._isQuickPartyRoll && this._quickRollOverrides && this._quickRollOverrides.rollType === 'party') {
                    // For party rolls, include all party members regardless of UI selection (v13: native DOM)
                    selectedActors = Array.from(htmlElement.querySelectorAll('.cpb-actor-item')).map(item => {
                    const tokenId = item.dataset.tokenId;
                    const token = canvas.tokens.placeables.find(t => t.id === tokenId);
                    const actor = token?.actor;
                    // Only include party members (characters with player owners)
                    if (actor && actor.hasPlayerOwner) {
                        return {
                            tokenId: tokenId,
                            actorId: actor?.id,
                            name: item.querySelector('.cpb-actor-name, .actor-name').textContent,
                            group: 1, // Party rolls are always group 1 (challengers)
                            actor: actor
                        };
                    }
                    return null;
                }).filter(actor => actor !== null);
                } else {
                    // For non-party rolls, use the currently selected actors (v13: native DOM)
                    selectedActors = Array.from(htmlElement.querySelectorAll('.cpb-actor-item.selected')).map(item => {
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
            }
            
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
            let isContestedRoll = hasChallengers && hasDefenders;

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
                    const dcInput = htmlElement.querySelector('input[name="dc"]');
                    dc = dcInput && dcInput.value ? dcInput.value : 15;
                }
                if (this._quickRollOverrides.isGroupRoll !== null) {
                    groupRoll = this._quickRollOverrides.isGroupRoll;
                } else {
                    const groupRollInput = htmlElement.querySelector('input[name="groupRoll"]');
                    groupRoll = groupRollInput ? groupRollInput.checked : false;
                }
                
                // Handle contested roll overrides
                if (this._quickRollOverrides.isContested) {
                    // For contested rolls, force certain settings
                    dc = null; // Contested rolls don't use DC
                    groupRoll = false; // Contested rolls are individual
                    isContestedRoll = true; // Force contested mode
                }
            } else {
                const dcInput = htmlElement.querySelector('input[name="dc"]');
                dc = (challengerRollType === 'save' && challengerRollValue === 'death') ? 10 : 
                      (dcInput ? dcInput.value || null : null);
                const groupRollInput = htmlElement.querySelector('input[name="groupRoll"]');
                groupRoll = groupRollInput ? groupRollInput.checked : false;
            }

            // If only one actor is selected, it cannot be a group roll.
            if (selectedActors.length <= 1) {
                groupRoll = false;
            }

            const showDCInput = htmlElement.querySelector('input[name="showDC"]');
            const showDC = showDCInput ? showDCInput.checked : false;
            const rollModeSelect = htmlElement.querySelector('select[name="rollMode"]');
            const rollMode = rollModeSelect ? rollModeSelect.value : null;
            

            // Process actors and their specific tool IDs if needed
            const processedActors = selectedActors.map(actor => {
                const result = { 
                    id: actor.tokenId, // Use token ID as the primary id (for template matching)
                    actorId: actor.actorId, // Store actor ID for roll operations
                    name: actor.name,
                    group: actor.group
                    // Don't add ownership here - check it client-side
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
                const showExplanationInput = htmlElement.querySelector('input[name="showRollExplanation"]');
                const showExplanation = showExplanationInput ? showExplanationInput.checked : false;
                const showLink = showExplanation; // Always show links when explanations are enabled

                switch (type) {
                    case 'quick':
                        // Map quick roll values to their corresponding skill data
                        const quickRollMap = {
                            'perception': { skill: 'prc', name: 'Party Perception' },
                            'insight': { skill: 'ins', name: 'Party Insight' },
                            'investigation': { skill: 'inv', name: 'Party Investigation' },
                            'nature': { skill: 'nat', name: 'Party Nature' },
                            'stealth': { skill: 'ste', name: 'Party Stealth' },
                            'athletics': { skill: 'ath', name: 'Athletics' },
                            'acrobatics': { skill: 'acr', name: 'Acrobatics' },
                            'deception': { skill: 'dec', name: 'Deception' },
                            'persuasion': { skill: 'per', name: 'Persuasion' },
                            'intimidation': { skill: 'itm', name: 'Intimidation' }
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
                        const actor = game.actors.get(firstActor.actorId);
                        const toolIdentifier = typeof value === 'function' ? value(firstActor.actorId) : value;
                        const toolItem = actor?.items.get(toolIdentifier) || actor?.items.find(i => i.system.baseItem === toolIdentifier);
                        
                        name = toolItem?.name;
                        // Use custom description from dictionary instead of system description
                        if (showExplanation && toolItem?.name) {
                            desc = toolDescriptions[toolItem.name] || 'A specialized tool for specific tasks.';
                        } else {
                            desc = null;
                        }
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
                rollTitle: (this._isQuickPartyRoll && this._quickRollOverrides?.rollTitle) || this.selectedRollTitle || challengerInfo.name, // Use quick roll title, selected roll title, or fallback to skill name
                defenderSkillName: isContestedRoll && defenderInfo ? defenderInfo.name : null,
                skillAbbr: challengerRollType === 'tool' ? (processedActors[0]?.toolId || null) : challengerRollValue,
                defenderSkillAbbr: isContestedRoll ? (defenderRollType === 'tool' ? (processedActors.find(a => a.group === 2)?.toolId || null) : defenderRollValue) : null,
                actors: processedActors,
                requesterId: game.user.id,
                currentUserId: game.user.id, // Add current user ID for template
                type: 'skillCheck',
                dc: dc,
                showDC: showDC,
                isGroupRoll: groupRoll,
                skillDescription: challengerInfo.desc,
                defenderSkillDescription: isContestedRoll && defenderInfo ? defenderInfo.desc : null,
                skillLink: challengerInfo.link,
                defenderSkillLink: isContestedRoll && defenderInfo ? defenderInfo.link : null,
                rollMode,
                rollType: challengerRollType,
                defenderRollType: isContestedRoll ? defenderRollType : null,
                hasMultipleGroups: isContestedRoll,
                showRollExplanation: htmlElement.querySelector('input[name="showRollExplanation"]')?.checked || false,
                isCinematic: htmlElement.querySelector('input[name="isCinematic"]')?.checked || false,
                isGM: game.user.isGM
            };

            postConsoleAndNotification(MODULE.NAME, 'CPB | Cinematic Mode flag set to:', messageData.isCinematic, true, false);

            // Create the chat message
            const message = await ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker(),
                content: await SkillCheckDialog.formatChatMessage(messageData),
                flags: { 'coffee-pub-blacksmith': messageData },
                type: CONST.CHAT_MESSAGE_TYPES.ROLL,
                rollMode: rollMode
            });

            // Play sound for roll request posted to chat
            playSound(COFFEEPUB.SOUNDNOTIFICATION02, COFFEEPUB.SOUNDVOLUMENORMAL);
            
            // Scroll chat to bottom to show the new roll request
            SkillCheckDialog._scrollChatToBottom();

            // If cinematic mode is enabled, show for the GM and broadcast to players
            if (messageData.isCinematic) {
                // Show for the current user who initiated the roll
                SkillCheckDialog._showCinematicDisplay(messageData, message.id);

                // Emit to other users to show the overlay
                const socket = SocketManager.getSocket();
                if (socket) {
                    await socket.executeForOthers("showCinematicOverlay", {
                        type: "showCinematicOverlay",  // Add type property
                        messageId: message.id,
                        messageData: messageData
                    });
                }
            }

            // Close the dialog
            this.close();
            });
        }

        // Handle the cancel button (v13: native DOM)
        const cancelButton = htmlElement.querySelector('button[data-button="cancel"]');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => this.close());
        }

        // Handle preference checkboxes (v13: native DOM)
        const showRollExplanationInput = htmlElement.querySelector('input[name="showRollExplanation"]');
        if (showRollExplanationInput) {
            showRollExplanationInput.addEventListener('change', (ev) => {
                this.userPreferences.showRollExplanation = ev.currentTarget.checked;
                game.settings.set('coffee-pub-blacksmith', 'skillCheckPreferences', this.userPreferences);
            });
        }

        const showDCInput = htmlElement.querySelector('input[name="showDC"]');
        if (showDCInput) {
            showDCInput.addEventListener('change', (ev) => {
                this.userPreferences.showDC = ev.currentTarget.checked;
                game.settings.set('coffee-pub-blacksmith', 'skillCheckPreferences', this.userPreferences);
            });
        }

        const groupRollInput = htmlElement.querySelector('input[name="groupRoll"]');
        if (groupRollInput) {
            groupRollInput.addEventListener('change', (ev) => {
                this.userPreferences.groupRoll = ev.currentTarget.checked;
                game.settings.set('coffee-pub-blacksmith', 'skillCheckPreferences', this.userPreferences);
            });
        }

        const isCinematicInput = htmlElement.querySelector('input[name="isCinematic"]');
        if (isCinematicInput) {
            isCinematicInput.addEventListener('change', (ev) => {
                this.userPreferences.isCinematic = ev.currentTarget.checked;
                game.settings.set('coffee-pub-blacksmith', 'skillCheckPreferences', this.userPreferences);
            });
        }

        // Update DC display when DC input changes (v13: native DOM)
        const dcInput = htmlElement.querySelector('input[name="dc"]');
        if (dcInput) {
            const handleDCChange = (ev) => {
                const dcValue = ev.currentTarget.value;
                // Update the unified header DC display
                const dcDisplay = htmlElement.querySelector('.unified-dc-display, .unified-dc-input');
                if (dcDisplay) {
                    if (dcValue && dcValue.trim() !== '') {
                        dcDisplay.value = dcValue;
                    } else {
                        dcDisplay.value = '--';
                    }
                }
            };
            dcInput.addEventListener('input', handleDCChange);
            dcInput.addEventListener('change', handleDCChange);
        }
    }

    _updateToolList() {
        const tools = this._getToolProficiencies();
        // v13: Handle both jQuery and native DOM (this.element may still be jQuery)
        let element;
        if (this.element && typeof this.element.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            element = this.element[0] || this.element.get?.(0);
        } else if (this.element && typeof this.element.querySelectorAll === 'function') {
            // It's already a native DOM element
            element = this.element;
        } else {
            console.error('_updateToolList: Invalid this.element', this.element);
            return;
        }
        
        if (!element) {
            console.error('_updateToolList: Could not extract DOM element');
            return;
        }
        
        // v13: native DOM - get last check section
        const checkSections = element.querySelectorAll('.cpb-check-section');
        const toolSection = checkSections.length > 0 ? checkSections[checkSections.length - 1] : null;
        
        if (!toolSection) return;
        
        // Clear existing tools (v13: native DOM)
        toolSection.querySelectorAll('.cpb-check-item').forEach(item => item.remove());
        
        // Add new tools (v13: native DOM)
        tools.forEach(tool => {
            // Convert Map to array of [actorId, toolId] pairs for data attribute
            const actorToolsArray = Array.from(tool.actorTools.entries());
            
            // Create tool item element (v13: native DOM)
            const toolItem = document.createElement('div');
            toolItem.className = `cpb-check-item${tool.isCommon ? '' : ' cpb-tool-unavailable'}`;
            toolItem.dataset.type = 'tool';
            toolItem.dataset.toolName = tool.name;
            toolItem.dataset.actorTools = JSON.stringify(actorToolsArray).replace(/'/g, "&apos;");
            toolItem.dataset.common = tool.isCommon;
            toolItem.dataset.rollTitle = tool.name;
            toolItem.dataset.tooltip = tool.description;
            
            // Build inner HTML
            toolItem.innerHTML = `
                <i class="fas fa-tools"></i>
                <span class="cpb-roll-label">${tool.name}</span><span class="cpb-roll-description">${tool.description}</span>
                <div class="cpb-roll-type-indicator"></div>
            `;
            
            // Only attach click handler if the tool is common
            if (tool.isCommon) {
                const handleToolSelection = (ev) => {
                    ev.preventDefault();
                    try {
                        const item = ev.currentTarget;
                        const type = 'tool';
                        // Parse the actor tools data back into a Map
                        const actorToolsData = JSON.parse(item.dataset.actorTools);
                        const actorTools = new Map(actorToolsData);
                        const isRightClick = ev.type === 'contextmenu';

                        // Check if we have both challengers and defenders (v13: native DOM)
                        const challengers = element.querySelectorAll('.cpb-actor-item.cpb-group-1');
                        const defenders = element.querySelectorAll('.cpb-actor-item.cpb-group-2');
                        const hasChallengers = challengers.length > 0;
                        const hasDefenders = defenders.length > 0;
                        const isContestedRoll = hasChallengers && hasDefenders;

                        if (isContestedRoll) {
                            // Handle contested roll selection (v13: native DOM)
                            const currentIndicator = item.querySelector('.cpb-roll-type-indicator');
                            const currentIcon = currentIndicator?.querySelector('i');
                            
                            if (isRightClick) {
                                // Handle defender selection
                                if (currentIcon?.classList.contains('fa-shield-halved')) {
                                    // Deselect if already selected as defender
                                    if (currentIndicator) currentIndicator.innerHTML = '';
                                    item.classList.remove('selected');
                                    this.defenderRoll = { type: null, value: null };
                                } else {
                                    // Clear other defender selections
                                    toolSection.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator i.fa-shield-halved').forEach(icon => {
                                        const parent = icon.parentElement;
                                        if (parent) parent.innerHTML = '';
                                    });
                                    toolSection.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('selected'));
                                    
                                    // Set as defender
                                    if (currentIndicator) {
                                        currentIndicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                                    }
                                    item.classList.add('selected');
                                    this.defenderRoll = { type, value: actorTools };
                                }
                            } else {
                                // Handle challenger selection
                                if (currentIcon?.classList.contains('fa-swords')) {
                                    // Deselect if already selected as challenger
                                    if (currentIndicator) currentIndicator.innerHTML = '';
                                    item.classList.remove('selected');
                                    this.challengerRoll = { type: null, value: null };
                                } else {
                                    // Clear other challenger selections
                                    toolSection.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator i.fa-swords').forEach(icon => {
                                        const parent = icon.parentElement;
                                        if (parent) parent.innerHTML = '';
                                    });
                                    toolSection.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('selected'));
                                    
                                    // Set as challenger
                                    if (currentIndicator) {
                                        currentIndicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                                    }
                                    item.classList.add('selected');
                                    this.challengerRoll = { type, value: actorTools };
                                }
                            }
                        } else {
                            // Handle non-contested roll selection (v13: native DOM)
                            const currentIndicator = item.querySelector('.cpb-roll-type-indicator');
                            const hasCurrentSelection = currentIndicator ? currentIndicator.innerHTML !== '' : false;
                            
                            // Clear all selections first
                            toolSection.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('selected'));
                            toolSection.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator').forEach(ind => ind.innerHTML = '');
                            
                            if (hasCurrentSelection) {
                                // If clicking an already selected item, clear the selection
                                this.selectedType = null;
                                this.selectedValue = null;
                            } else {
                                // Set new selection
                                if (currentIndicator) {
                                    if (isRightClick) {
                                        currentIndicator.innerHTML = '<i class="fas fa-shield-halved" title="Defender Roll"></i>';
                                    } else {
                                        currentIndicator.innerHTML = '<i class="fas fa-swords" title="Challenger Roll"></i>';
                                    }
                                }
                                item.classList.add('selected');
                                this.selectedType = type;
                                this.selectedValue = actorTools;
                            }
                        }
                    } catch (error) {
                        console.error('Error in tool selection', error);
                        ui.notifications.error('There was an error processing the tool selection.');
                    }
                };
                
                toolItem.addEventListener('click', handleToolSelection);
                toolItem.addEventListener('contextmenu', handleToolSelection);
            } else {
                const handleUnavailableTool = (ev) => {
                    ev.preventDefault();
                    ui.notifications.warn(`Not all selected players have ${tool.name}.`);
                };
                toolItem.addEventListener('click', handleUnavailableTool);
                toolItem.addEventListener('contextmenu', handleUnavailableTool);
            }
            
            toolSection.appendChild(toolItem);
        });
    }

    // Update helper method to optionally defer visibility updates (v13: native DOM)
    _applyFilter(html, filterType, updateVisibility = true) {
        // v13: Handle both jQuery and native DOM
        const htmlElement = html && typeof html.jquery !== 'undefined' ? (html[0] || html.get?.(0)) : html;
        if (!htmlElement || typeof htmlElement.querySelectorAll !== 'function') {
            console.error('_applyFilter: Invalid html parameter');
            return;
        }
        htmlElement.querySelectorAll('.cpb-actor-list .cpb-actor-item').forEach((el) => {
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
        
        // Check if all defenders were removed and clear defender roll selections (v13: native DOM)
        const defenders = htmlElement.querySelectorAll('.cpb-actor-item.cpb-group-2');
        const hasDefenders = defenders.length > 0;
        if (!hasDefenders) {
            // Clear all defender roll selections
            const defenderIndicators = htmlElement.querySelectorAll('.cpb-check-item .cpb-roll-type-indicator i.fa-shield-halved');
            defenderIndicators.forEach(indicator => {
                const parent = indicator.parentElement;
                if (parent) parent.innerHTML = '';
            });
            htmlElement.querySelectorAll('.cpb-check-item').forEach(el => el.classList.remove('cpb-skill-defender'));
            this.defenderRoll = { type: null, value: null };
        }
    }

    /**
     * Apply roll type filter to show/hide sections (v13: native DOM)
     */
    _applyRollTypeFilter(html, filterType) {
        // v13: Handle both jQuery and native DOM
        const htmlElement = html && typeof html.jquery !== 'undefined' ? (html[0] || html.get?.(0)) : html;
        if (!htmlElement || typeof htmlElement.querySelectorAll !== 'function') {
            console.error('_applyRollTypeFilter: Invalid html parameter');
            return;
        }
        // Hide all sections first
        htmlElement.querySelectorAll('.cpb-check-section').forEach(section => {
            section.style.display = 'none';
        });
        
        // Show the section that matches the filter
        const targetSection = htmlElement.querySelector(`.cpb-check-section[data-filter="${filterType}"]`);
        if (targetSection) {
            targetSection.style.display = '';
        }
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
                    return COFFEEPUB.SOUNDSUCCESS; // Success
                } else {
                    return COFFEEPUB.SOUNDFAILURE; // Failure
                }
            } else {
                return COFFEEPUB.SOUNDSUCCESS; // Default to success sound
            }
        } else {
            // Existing group roll sound logic (unchanged)
            return COFFEEPUB.SOUNDFAILURE;
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
        
        // Use the constant
        const soundPath = COFFEEPUB.SOUNDCINEMATICOPEN;
        const volume = COFFEEPUB.SOUNDVOLUMENORMAL;
        
        playSound(soundPath, volume);
        // Remove any existing overlay
        $('#cpb-cinematic-overlay').remove();

        const createActorCardHtml = (actor, index) => {
            const token = canvas.tokens.get(actor.id) || canvas.tokens.placeables.find(t => t.actor?.id === actor.actorId);
            const actorDocument = token?.actor;
            const actorImg = actorDocument?.img || 'icons/svg/mystery-man.svg';
            const actorName = actor.name;
            const result = actor.result;
            const animationDelay = (index * 0.1) + 0.3; // Staggered delay

            // Check for ownership to apply disabled style and correct icon
            const hasPermission = game.user.isGM || actorDocument?.isOwner;

            let rollAreaHtml;
            if (hasPermission && !result) {
                rollAreaHtml = `
                    <div class="cpb-cinematic-roll-area">
                        <button class="cpb-cinematic-roll-mod-btn" data-roll-type="disadvantage" title="Roll with Disadvantage">
                            <i class="fas fa-minus"></i>
                        </button>
                        <button class="cpb-cinematic-roll-btn" data-roll-type="normal" title="Roll Normal">
                            <i class="fas fa-dice-d20"></i>
                        </button>
                        <button class="cpb-cinematic-roll-mod-btn" data-roll-type="advantage" title="Roll with Advantage">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                `;
            } else if (!hasPermission && !result) {
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
                <div class="cpb-cinematic-card" data-token-id="${actor.id}" style="animation-delay: ${animationDelay}s;">
                    <img src="${actorImg}" alt="${actorName}">
                    <div class="cpb-cinematic-actor-name">${actorName}</div>
                    ${rollAreaHtml}
                </div>
            `;
        };

        let actorCardsHtml;
        if (messageData.hasMultipleGroups) {
            const challengers = messageData.actors.filter(a => a.group === 1);
            const defenders = messageData.actors.filter(a => a.group === 2);

            const challengerCards = challengers.map(createActorCardHtml).join('');
            const defenderCards = defenders.map(createActorCardHtml).join('');

            actorCardsHtml = `
                <div class="cpb-cinematic-actor-group">
                    <h3 class="cpb-cinematic-group-title">Challengers</h3>
                    <div class="cpb-cinematic-card-grid">${challengerCards}</div>
                </div>
                <div class="cpb-cinematic-vs-divider">VS</div>
                <div class="cpb-cinematic-actor-group">
                    <h3 class="cpb-cinematic-group-title">Defenders</h3>
                    <div class="cpb-cinematic-card-grid">${defenderCards}</div>
                </div>
            `;
        } else {
            actorCardsHtml = messageData.actors.map(createActorCardHtml).join('');
        }




        // Try to get constants from AssetLookup if COFFEEPUB is not ready
        let assetLookup = null;
        try {
            const module = game.modules.get('coffee-pub-blacksmith');
            assetLookup = module?.api?.assetLookup;
            if (assetLookup) {
                const allConstants = assetLookup.getAllConstants();
            }
        } catch (e) {
        }

        // Determine the background image based on the roll type
        let backgroundImage;
        
        // Helper function to get constant value with fallback
        const getConstant = (constantName, fallbackPath) => {
            // Try COFFEEPUB first
            if (window.COFFEEPUB?.[constantName]) {
                return window.COFFEEPUB[constantName];
            }
            // Try AssetLookup as fallback
            if (assetLookup) {
                const value = assetLookup.getConstant(constantName);
                if (value) {
                    return value;
                }
            }
            // Use fallback path
            return fallbackPath;
        };

        if (messageData.hasMultipleGroups) {
            backgroundImage = getConstant('BACKCONTESTEDROLL', 'modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-6.webp');
        } else {
            switch (messageData.rollType) {
                case 'skill':
                    backgroundImage = getConstant('BACKSKILLCHECK', 'modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-2.webp');
                    break;
                case 'ability':
                    backgroundImage = getConstant('BACKABILITYCHECK', 'modules/coffee-pub-blacksmith/images/banners/banners-damage-cold-3.webp');
                    break;
                case 'save':
                    backgroundImage = getConstant('BACKSAVINGTHROW', 'modules/coffee-pub-blacksmith/images/banners/banners-damage-bludgeoning-4.webp');
                    break;
                case 'tool':
                    backgroundImage = getConstant('BACKTOOLCHECK', 'modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-3.webp');
                    break;
                case 'dice':
                    backgroundImage = getConstant('BACKDICEROLL', 'modules/coffee-pub-blacksmith/images/banners/banners-damage-psychic-2.webp');
                    break;
                default:
                    backgroundImage = getConstant('BACKCONTESTEDROLL', 'modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-6.webp');
            }
        }


        // Create roll details text with separate title and subtitle
        let rollDetailsHtml = `<div class="cpb-cinematic-roll-details">`;
        
        // 1. Roll Title (always separate and prominent)
        const rollTitle = messageData.rollTitle || messageData.skillName;
        rollDetailsHtml += `<h2 class="cpb-cinematic-roll-title">${rollTitle}</h2>`;
        
        // 2. Subtitle with skill info and additional details
        const subtitleParts = [];
        
        // Contested roll info (skill vs skill)
        if (messageData.hasMultipleGroups) {
            subtitleParts.push(`${messageData.skillName} vs ${messageData.defenderSkillName}`);
        }
        
        // DC info
        if (messageData.showDC && messageData.dc) {
            subtitleParts.push(`DC ${messageData.dc}`);
        }
        
        // Group roll info
        if (messageData.isGroupRoll && !messageData.hasMultipleGroups) {
            subtitleParts.push(`Group Roll`);
        }
        
        // Add subtitle if we have any parts
        if (subtitleParts.length > 0) {
            rollDetailsHtml += `<p class="cpb-cinematic-roll-subtext">${subtitleParts.join(' • ')}</p>`;
        }
        
        rollDetailsHtml += `</div>`;

        const containerClass = `cpb-cinematic-actors-container ${messageData.hasMultipleGroups ? 'contested' : ''}`;
        const overlay = $(`
            <div id="cpb-cinematic-overlay">
                <button class="cpb-cinematic-close-btn"><i class="fas fa-times"></i></button>
                <div id="cpb-cinematic-bar" style="background-image: url('${backgroundImage}');">
                    ${rollDetailsHtml}
                    <div class="${containerClass}">
                        ${actorCardsHtml}
                    </div>
                </div>
            </div>
        `);
        overlay.data('messageId', messageId);

        $('body').append(overlay);

        // Attach click handler for the close button
        overlay.find('.cpb-cinematic-close-btn').on('click', () => this._hideCinematicDisplay());

        // Attach click handlers to the new roll buttons
        overlay.find('.cpb-cinematic-roll-btn, .cpb-cinematic-roll-mod-btn').on('click', async (event) => {
            postConsoleAndNotification(MODULE.NAME, `Cinema mode: Dice button clicked`, { eventTarget: event.target }, true, false);
            const diceSound = COFFEEPUB.SOUNDDICEROLL;
            playSound(diceSound, COFFEEPUB.SOUNDVOLUMENORMAL);
            const button = event.currentTarget;
            const card = button.closest('.cpb-cinematic-card');
            const tokenId = card.dataset.tokenId;
            const actorData = messageData.actors.find(a => a.id === tokenId);
            if (!actorData) return;
            
            const rollButtonType = button.dataset.rollType;
            const options = {
                advantage: rollButtonType === 'advantage',
                disadvantage: rollButtonType === 'disadvantage',
                fastForward: true,
                rollMode: messageData.rollMode || 'roll'
            };

            // Determine which roll type to use (challenger or defender)
            const isDefender = actorData.group === 2 && messageData.hasMultipleGroups;
            const type = isDefender ? messageData.defenderRollType : messageData.rollType;
            let value;

            if (type === 'tool') {
                value = actorData.toolId;
            } else {
                value = isDefender ? messageData.defenderSkillAbbr : messageData.skillAbbr;
            }

            // Visually disable the card's roll area after a choice is made
            const rollArea = $(card).find('.cpb-cinematic-roll-area');
            rollArea.empty().append('<div class="cpb-cinematic-wait-icon"><i class="fas fa-dice-d20"></i></div>');

            const chatMessage = game.messages.get(messageId);
            if (chatMessage) {
                // Execute the roll directly using the new 4-function system
                const { processRoll, deliverRollResults } = await import('./manager-rolls.js');
                const { postConsoleAndNotification } = await import('./api-core.js');
                const { MODULE } = await import('./const.js');
                
                // Prepare roll data for execution
                const actor = game.actors.get(actorData.actorId);
                if (!actor) {
                    postConsoleAndNotification(MODULE.NAME, `Cinema mode: Actor not found for ID ${actorData.actorId}`, null, true, false);
                    return;
                }
                
                // Prepare roll data
                const rollData = {
                    actor: actor,
                    rollTypeKey: type,
                    rollValueKey: value,
                    messageId: messageId,
                    tokenId: tokenId,
                    actorId: actorData.actorId,
                    mode: 'cinema',
                    cinemaMode: true
                };
                
                // Execute the roll directly (SAME as window mode)
                postConsoleAndNotification(MODULE.NAME, `Cinema mode: About to call processRoll`, { rollData, options }, true, false);
                
                // Execute the roll
                const rollResults = await processRoll(rollData, options);
                postConsoleAndNotification(MODULE.NAME, `Cinema mode: processRoll completed`, { rollResults }, true, false);
                
                // Deliver the results
                await deliverRollResults(rollResults, { messageId, tokenId });
            }
        });

        // Use a timeout to allow the element to be added to the DOM before adding the class for transition
        setTimeout(() => overlay.addClass('visible'), 50);
    }

    // OLD SYSTEM DELETED - Cinema updates now handled by new system in manager-rolls.js

    /**
     * Hides the cinematic display.
     */
    static async _hideCinematicDisplay() {
        const overlay = $('#cpb-cinematic-overlay');
        if (game.user.isGM) {
            const socket = SocketManager.getSocket();
            if (socket) {
                await socket.executeForOthers("closeCinematicOverlay", {
                    type: "closeCinematicOverlay"  // Add type property
                });
            }
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
        // v13: Handle both jQuery and native DOM (renderChatMessage hook may still pass jQuery)
        // Convert jQuery to native DOM if needed
        let htmlElement;
        if (html && typeof html.jquery !== 'undefined') {
            // It's a jQuery object, get the native DOM element
            htmlElement = html[0] || html.get?.(0);
        } else if (html && typeof html.querySelectorAll === 'function') {
            // It's already a native DOM element
            htmlElement = html;
        } else {
            console.warn('SkillCheckDialog.handleChatMessageClick: Invalid html parameter', html);
            return;
        }
        
        if (!htmlElement) {
            console.warn('SkillCheckDialog.handleChatMessageClick: Could not extract DOM element');
            return;
        }
        
        // Use the native DOM element
        htmlElement.querySelectorAll('.cpb-skill-roll').forEach((btn) => {
            btn.addEventListener('click', async (event) => {
                const button = event.currentTarget;
                const actorId = button.dataset.actorId;
                const tokenId = button.dataset.tokenId;
                const type = button.dataset.type || 'skill';
                const value = button.dataset.value;
                const rollTitle = button.dataset.rollTitle;

                // Find the corresponding actor data in the message flags to get the token ID
                const flags = message.flags['coffee-pub-blacksmith'];
                if (!flags) return;
                const actorData = flags.actors.find(a => a.actorId === actorId && a.id === tokenId);
                if (!actorData) {
                    ui.notifications.error(`Could not find actor data for ID ${actorId} and token ID ${tokenId} in the chat message.`);
                    return;
                }
                
                // Check ownership - only allow GM or character owner to roll
                const actor = game.actors.get(actorId);
                if (!game.user.isGM && !actor?.isOwner) {
                    ui.notifications.warn("You don't have permission to roll for this character.");
                    return;
                }
                // Use the new unified system directly - pass existing messageId to prevent duplicate cards
                const { orchestrateRoll } = await import('./manager-rolls.js');
                await orchestrateRoll({
                    actors: [{ actorId, tokenId, name: actorData.name }],
                    challengerRollType: type,
                    challengerRollValue: value,
                    challengerRollTitle: rollTitle, // Pass the roll title from the button
                    defenderRollType: flags.defenderRollType || null,
                    defenderRollValue: flags.defenderRollValue || null,
                    dc: flags.dc || null,
                    showDC: flags.showDC || false,
                    groupRoll: flags.isGroupRoll || false,
                    rollMode: flags.rollMode || 'roll',
                    isCinematic: false, // This is window mode
                    showRollExplanation: false
                }, message.id); // Pass existing messageId to prevent duplicate card creation
            });
        });
    }

    /**
     * Scroll the Foundry chat log to the bottom
     */
    static _scrollChatToBottom() {
        try {
            // Find the chat log container
            const chatLog = document.querySelector('#chat-log');
            if (chatLog) {
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `_scrollChatToBottom error:`, error, true, false);
        }
    }


}
