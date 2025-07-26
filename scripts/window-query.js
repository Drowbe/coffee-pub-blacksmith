// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { postConsoleAndNotification, playSound, COFFEEPUB } from './global.js';
import { ThirdPartyManager } from './third-party.js';
import { SkillCheckDialog } from './skill-check-dialog.js';

// -- COMMON Imports --
import { createJournalEntry, createHTMLList, buildCompendiumLinkActor } from './common.js';
import { TokenHandler } from './token-handler.js';

// Base template for AI instructions
const BASE_PROMPT_TEMPLATE = {
    formatting: `Format your response as valid JSON with these guidelines:
- Use bold (**text**) for emphasis
- Create lists with <ul><li>item</li></ul>
- Keep descriptions clear and concise
- Use proper D&D5E terminology
- Use empty strings ("") for any empty or missing values, never use null`,
    
    atmosphere: `Include for all scenes:
- Sensory details (sight, sound, smell)
- Physical space descriptions
- Mood and ambiance elements`,
    
    narrative: `For all narrative elements:
- Connect to broader campaign story
- Include specific, vivid details
- Maintain D&D5E authenticity`,
    
    jsonFormat: `{
    "journaltype": "",
    "foldername": "",
    "sceneparent": "",
    "scenearea": "",
    "sceneenvironment": "",
    "scenelocation": "",
    "scenetitle": "",
    "prepencounter": "",
    "prepencounterdetails": "",
    "preprewards": "",
    "prepsetup": "",
    "contextintro": "",
    "cardtitle": "",
    "carddescriptionprimary": "",
    "cardimagetitle": "",
    "cardimage": "",
    "carddescriptionsecondary": "",
    "carddialogue": "",
    "contextadditionalnarration": "",
    "contextatmosphere": "",
    "contextgmnotes": ""
}`
};

// ================================================================== 
// ===== REGISTER TEMPLATE PARTIALS =================================
// ================================================================== 

document.addEventListener('DOMContentLoaded', () => {
    
    // Function to add event listeners
    const addEventListeners = () => {
    
        const workspaces = ['lookup', 'narrative', 'encounter', 'assistant', 'character'];

        workspaces.forEach(workspace => {
            const skill = document.getElementById(`optionSkill-${workspace}`);
            const dice = document.getElementById(`optionDiceType-${workspace}`);
            const roll = document.getElementById(`inputDiceValue-${workspace}`);
            const details = document.getElementById(`inputContextDetails-${workspace}`);

            if (skill && dice && roll) {
                skill.addEventListener('change', () => {
        
                    // Get the skill description from CONFIG.DND5E.skills
                    const skillKey = Object.entries(CONFIG.DND5E.skills).find(([k, s]) => 
                        game.i18n.localize(s.label) === skill.value
                    )?.[0];
                    
                    if (skillKey && details) {
                        const skillData = CONFIG.DND5E.skills[skillKey];
                        const ability = CONFIG.DND5E.abilities[skillData.ability]?.label || '';
                        const abilityName = game.i18n.localize(ability);
                        details.value = `${skill.value} (${abilityName}): ${game.i18n.localize(skillData.reference)}`;
                    }
                });

                dice.addEventListener('change', () => {
        
                });

                roll.addEventListener('change', () => {
        
                });
            } else {
                postConsoleAndNotification(`Blacksmith | Elements not found for workspace: ${workspace}`, "", false, false, true);
            }
        });

    };

    // Register partials and render templates
    const registerPartialsAndRender = async () => {
        try {

            // WORKSPACE TEMPLATES

            // Lookup
            const workspaceLookupTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-query-workspace-lookup.hbs').then(response => response.text());
            Handlebars.registerPartial('window-query-workspace-lookup', workspaceLookupTemplate);

            // Character
            const workspaceCharacterTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-query-workspace-character.hbs').then(response => response.text());
            Handlebars.registerPartial('window-query-workspace-character', workspaceCharacterTemplate);

            // Register character section partials
            const characterCoreTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-character-core.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-character-core', characterCoreTemplate);

            const characterAbilitiesTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-character-abilities.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-character-abilities', characterAbilitiesTemplate);

            const characterSkillsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-character-skills.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-character-skills', characterSkillsTemplate);

            const characterFeaturesTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-character-features.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-character-features', characterFeaturesTemplate);

            const characterWeaponsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-character-weapons.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-character-weapons', characterWeaponsTemplate);

            const characterSpellsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-character-spells.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-character-spells', characterSpellsTemplate);

            const characterBiographyTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-character-biography.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-character-biography', characterBiographyTemplate);

            // Assistant        
            const workspaceAssistantTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-query-workspace-assistant.hbs').then(response => response.text());
            Handlebars.registerPartial('window-query-workspace-assistant', workspaceAssistantTemplate);

            // Narrative    
            const narrativeTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-query-workspace-narrative.hbs').then(response => response.text());
            Handlebars.registerPartial('window-query-workspace-narrative', narrativeTemplate);


           


            // Encounter
            const encounterTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-query-workspace-encounter.hbs').then(response => response.text());
            Handlebars.registerPartial('window-query-workspace-encounter', encounterTemplate);

            // --- PARTIAL TEMPLATES ---

            // GLOBAL

            

            // general options -- section sellection, etc.
            const globalOptionsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-global-options.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-global-options', globalOptionsTemplate); 
            
            // general options -- section sellection, etc.
            const globalFundTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-global-fund.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-global-fund', globalFundTemplate); 


            // skill check rolls
            const globalSkillCheckTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-global-skillcheckrolls.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-global-skillcheckrolls', globalSkillCheckTemplate);

            // LOOKUP

            // lookup - features, etc.
            const lookupSRDRulesTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-lookup-srdrules.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-lookup-srdrules', lookupSRDRulesTemplate);   



            // CHARACTER

            // character - details
            const characterDetailsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-character-details.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-character-details', characterDetailsTemplate);

            // character - guidance
            const characterGuidanceTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-character-guidance.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-character-guidance', characterGuidanceTemplate); 


            // ASSISTANT

            const assistantCriteriaTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-assistant-criteria.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-assistant-criteria', assistantCriteriaTemplate);   

            // ENCOUNTER

            // narrative encounter
            //const narrativeEncounterTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-encounter.hbs').then(response => response.text());
            //Handlebars.registerPartial('window-element-narrative-encounter', narrativeEncounterTemplate);   

            // encounter scripts
            const encounterScriptsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-encounter-scripts.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-encounter-scripts', encounterScriptsTemplate);   
            
            // encounter configuration
            const encounterConfigurationTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-encounter-configuration.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-encounter-configuration', encounterConfigurationTemplate);       

            // encounter worksheet
            const encounterWorksheetTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-encounter-worksheet.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-encounter-worksheet', encounterWorksheetTemplate);       

            // encounter monsters
            const encounterMonstersTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-encounter-monsters.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-encounter-monsters', encounterMonstersTemplate);        

            // encounter party
            const encounterPartyTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-encounter-party.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-encounter-party', encounterPartyTemplate);        

            // encounter NPCs
            const encounterNPCTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-encounter-npcs.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-encounter-npcs', encounterNPCTemplate);    

            // Journal Narrative TEMPLATES

            // image settings   
            const narrativeImageTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-narrative-image.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-narrative-image', narrativeImageTemplate);   

            // narrative settings   
            const narrativeSettingsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-narrative-settings.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-narrative-settings', narrativeSettingsTemplate);   

            // narrative geography
            const narrativeGeographyTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-narrative-geography.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-narrative-geography', narrativeGeographyTemplate);   


            // narrative details
            const narrativeDetailsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-narrative-details.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-narrative-details', narrativeDetailsTemplate);   

            // narrative rewards
            const narrativeRewardsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-narrative-rewards.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-narrative-rewards', narrativeRewardsTemplate);   

            // Characters for the narrative
            const narrativeCharactersTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-narrative-characters.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-narrative-characters', narrativeCharactersTemplate);

            // Encounters for the narrative
            const narrativeEncountersTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-element-narrative-encounters.hbs').then(response => response.text());
            Handlebars.registerPartial('window-element-narrative-encounters', narrativeEncountersTemplate);



            // MAIN TEMPLATE
            // Render the main template (assuming you have a main template to render)
            const mainTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-query.hbs').then(response => response.text());
            const template = Handlebars.compile(mainTemplate);

            // Wait for the DOM to be fully loaded before setting innerHTML
            document.addEventListener('DOMContentLoaded', () => {
                const container = document.getElementById('blacksmith-workspace-wrapper');
                if (container) {
                    container.innerHTML = template();
                    // Add event listeners after rendering
                    addEventListeners();
                } else {
                    postConsoleAndNotification('Blacksmith | Element with ID "blacksmith-workspace-wrapper" not found.', "", false, false, true);
                }
            });
        } catch (error) {
            postConsoleAndNotification('Blacksmith | Error loading partial templates:', error, false, false, true);
        }
    };

    // Call the function to register partials and render templates
    registerPartialsAndRender();
    
});


// ================================================================== 
// ===== FUNCTIONS ==================================================
// ================================================================== 

// ************************************
// ** UTILITY Workspace Toggle
// ************************************

// Function to toggle the visibility of workspace sections
window.toggleSection = function(sectionId, button) {
    
    const sectionContent = document.getElementById(sectionId);
    if (sectionContent) {
        sectionContent.classList.toggle('collapsed');
        const icon = button.querySelector('i');
        if (sectionContent.classList.contains('collapsed')) {
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        } else {
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        }

    } else {
        postConsoleAndNotification("Section content not found for ID:", sectionId, false, false, true);
    }
};

// ************************************
// ** UTILITY Clear Form Inputs
// ************************************  

function clearFormInputs(form, blnClearForm) {
    const formInputs = form.querySelectorAll('input:not([data-persist]), textarea:not([data-persist]), select:not([data-persist])');
    if (blnClearForm) {


        // Clear the values of the form inputs
        formInputs.forEach(input => {
            if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = false;
            } else {
                input.value = '';
            }
        });
    } else {
        // Only clear the main input
        const textareaMessage = document.getElementById('blacksmith-input-message');
        if (textareaMessage) {
            textareaMessage.value = '';
        }
    }
}


// ************************************
// ** UTILITY Clear Worksheet Tokens
// ************************************  

function clearWorksheetTokens(id) {
    // Clear monsters section and restore message
    const monstersContainer = document.querySelector(`#workspace-section-monsters-${id} .monsters-container`);
    if (monstersContainer) {
        monstersContainer.innerHTML = `
            <div class="message-box" id="tokens-added-message-${id}" style="display: block;">
                If you want to use tokens already on the canvas, monsters tokens will appear here when added with the Monster and NPC button.
            </div>
        `;
    }

    // Clear NPCs section and restore message
    const npcContainer = document.querySelector(`#workspace-section-npcs-${id} .npc-container`);
    if (npcContainer) {
        npcContainer.innerHTML = `
            <div class="message-box" id="tokens-added-message-${id}" style="display: block;">
                NPC tokens will appear here when added with the Monster and NPC button.
            </div>
        `;
    }

    // Clear characters section and restore message
    const tokensContainer = document.querySelector(`#workspace-section-tokens-${id} .tokens-container`);
    if (tokensContainer) {
        tokensContainer.innerHTML = `
            <div class="message-box" id="tokens-added-message-${id}" style="display: block;">
                If you want to use player tokens already on the canvas, player tokens will appear here when added with the Player button.
            </div>
        `;
    }

    // Reset all level and class buttons to their base state
    const levelButtons = document.querySelectorAll(`.level-button`);
    levelButtons.forEach(button => {
        const countSpan = button.querySelector('.count');
        if (countSpan) countSpan.innerText = '0';
        button.classList.remove('active', 'auto');
        updateCharacterTypeDisplay(button);
    });

    const classButtons = document.querySelectorAll(`.class-button`);
    classButtons.forEach(button => {
        const countSpan = button.querySelector('.count');
        if (countSpan) countSpan.innerText = '0';
        button.classList.remove('active', 'auto');
        updateCharacterTypeDisplay(button);
    });

    // Hide the encounter section message
    const encounterMessage = document.querySelector(`#workspace-section-encounter-content-${id} #tokens-added-message-${id}`);
    if (encounterMessage) {
        encounterMessage.style.display = 'none';
    }

    // Reset the CR slider to 0
    const crSlider = document.querySelector(`#optionCR-${id}`);
    if (crSlider) {
        crSlider.value = 0;
        // Trigger the oninput event to update any dependent values
        crSlider.dispatchEvent(new Event('input'));
    }

    // Update all counts after clearing
    updateAllCounts(id);
}






// ================================================================== 
// ===== CLASSES ====================================================
// ================================================================== 

export class BlacksmithWindowQuery extends FormApplication {
    
    // ************************************
    // ** OPTIONS Set Defaults
    // ************************************

    constructor(options = {}, mode = 'default') {
        // Call the parent constructor first
        super(options);
        
        // Set the workspace ID
        this.workspaceId = options.workspaceId || 'default';
        this.messages = [];

        
        // Set workspaceId based on mode
        if (mode === 'encounter') {
            this.workspaceId = 'encounter';
            this.showWorkspace = true; 
        } else if (mode === 'assistant') {
            this.workspaceId = 'assistant';
            this.showWorkspace = true; 
        } else if (mode === 'narrative') {
            this.workspaceId = 'narrative';
            this.showWorkspace = true; 
        } else if (mode === 'character') {
            this.workspaceId = 'character';
            this.showWorkspace = true; 
        } else if (mode === 'lookup') {
            this.workspaceId = 'lookup';
            this.showWorkspace = true; 
        } else {
            this.workspaceId = 'lookup'; // Default to 'lookup' for any other mode
            this.showWorkspace = false;
        }
        
        // Store the last active workspace
        this.lastActiveWorkspace = this.workspaceId;
        

    }

    // ************************************
    // ** OPTIONS defaultOptions
    // ************************************

    static get defaultOptions() {
        const intHeight = game.user.isGM ? 950 : 600;
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'coffee-pub-blacksmith',
            template: 'modules/coffee-pub-blacksmith/templates/window-query.hbs',
            title: 'Blacksmith Query',
            resizable: true,
            width: 600,
            height: intHeight,
            classes: ['blacksmith-window'],
            minimizable: true,
            scrollY: ['.blacksmith-output']
        });
    }

    // ************************************
    // ** FUNCTION close
    // ************************************

    async close(options={}) {
        // Clean up any registered hooks
        TokenHandler.unregisterTokenHooks();
        return super.close(options);
    }

    // ************************************
    // ** LISTENER Initialize
    // ************************************

    async initialize(html) {


        // Get the window element - try both jQuery and direct DOM approaches
        const windowElement = html ? html.closest('.window-app') : document.querySelector('#coffee-pub-blacksmith');
        
        // Set initial workspace visibility
        if (!this.showWorkspace) {
            const wrapper = document.getElementById('blacksmith-workspace-wrapper');
            if (wrapper) {
                wrapper.classList.add('workspace-hidden');
                if (windowElement) {
                    windowElement.classList.remove('has-workspace');
                }
            }
            const toggleButton = document.getElementById('blacksmith-toggle-workspace');
            if (toggleButton) {
                const icon = toggleButton.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-chevrons-right');
                    icon.classList.add('fa-chevrons-left');
                }
            }
        } else {
            if (windowElement) {
                windowElement.classList.add('has-workspace');
            }
            this.switchWorkspace(html, `blacksmith-query-workspace-${this.workspaceId}`);
        }

        // Check if we're starting in encounter mode and have selected tokens
        if (this.workspaceId === 'encounter' && canvas.tokens.controlled.length > 0) {
            const checkDOMReady = setInterval(async () => {
                const container = document.getElementById('workspace-section-tokens-content-encounter');
                if (container) {
                    clearInterval(checkDOMReady);
                    await this.addAllTokensToContainer('encounter');
                }
            }, 100);
        }
    }

    // ************************************
    // ** ACTIVATE Listeners
    // ************************************

    activateListeners(html) {
        super.activateListeners(html);

        // don't let these buttons submit the main form
        html.on('click', '.blacksmith-send-button-normal', (event) => {
            event.preventDefault();
            this._onSubmit(event, html.find('form')[0]);
        });

        // Bind the copy and chat buttons
        html.on('click', '#blacksmith-chat-button-json', this._onSendToJson.bind(this));
        html.on('click', '#blacksmith-chat-button-chat', this._onSendToChat.bind(this));
        html.on('click', '#blacksmith-chat-button-copy', this._onCopyToClipboard.bind(this));
        html.find('form').submit(this._onSubmit.bind(this));

        // Bind the clear button workspace 
        html.find('#blacksmith-clear-workspace').on('click', (event) => {
            event.preventDefault();
            const form = html.find('form')[0];
            
            // Only clear inputs within the active workspace
            const workspaceSelector = `#blacksmith-query-workspace-${this.workspaceId}`;
            const workspaceInputs = form.querySelector(workspaceSelector);
            
            if (workspaceInputs) {
                const formInputs = workspaceInputs.querySelectorAll('input:not([data-persist]), textarea:not([data-persist]), select:not([data-persist])');
                formInputs.forEach(input => {
                    if (input.type === 'checkbox' || input.type === 'radio') {
                        input.checked = false;
                    } else {
                        input.value = '';
                    }
                });

                // Only clear worksheets for the active workspace if it's encounter or narrative
                if (this.workspaceId === 'encounter') {
                    clearWorksheetTokens("encounter");
                } else if (this.workspaceId === 'narrative') {
                    clearWorksheetTokens("narrative");
                }
            }
        });

        // Handle the Enter key press based on the checkbox state
        const enterSubmitsCheckbox = html.find('#enterSubmits');
        const inputMessage = html.find('textarea[name="blacksmith-input-message"]');

        inputMessage.on('keypress', (event) => {
            if (event.key === 'Enter' && enterSubmitsCheckbox.is(':checked')) {
                event.preventDefault();
                this._onSubmit(event, html.find('form')[0]); // Pass the form element
            }
        });


        // -- WATCH FOR WORKSPACE CHANGES --

        // Call toggleWorkspaceVisibility based on initial mode
        if (this.showWorkspace) {
            this.toggleWorkspaceVisibility(html, false);
        }
        
        // Ensure the correct workspace button is active based on the initial mode
        this.switchWorkspace(html, `blacksmith-query-workspace-${this.workspaceId}`);

        // Attach the event listener for the toggle button
        html.find('#blacksmith-toggle-workspace').on('click', (event) => {
            event.preventDefault();
            this.toggleWorkspaceVisibility(html, true);
        });

        // Attach the event listener for workspace buttons
        const workspaceButtons = html.find('#blacksmith-query-button-lookup, #blacksmith-query-button-narrative, #blacksmith-query-button-encounter, #blacksmith-query-button-assistant, #blacksmith-query-button-character');
        workspaceButtons.on('click', (event) => {
            event.preventDefault();
            const clickedButton = $(event.currentTarget);
            const workspaceId = clickedButton.attr('id').replace('button', 'workspace');
            this.switchWorkspace(html, workspaceId);
        });

        // -- ADD TOKENS BUTTONS --

        // Add event listener for "add-tokens-button"
        html.find('.add-tokens-button').each((index, button) => {
            $(button).on('click', async (event) => {
                event.preventDefault(); // Prevent form submission
                const id = event.target.id.split('-').pop();
                // add the tokens to the container
                await this.addTokensToContainer(id, 'player');
                // update the counts
                await updateAllCounts(id);
                
                const section = document.getElementById(`workspace-section-tokens-content-${id}`);
                if (section && section.classList.contains('collapsed')) {
                    toggleSection(`workspace-section-tokens-content-${id}`, button);
                }
            });
        });

        // Add event listener for "add-monsters-button"
        html.find('.add-monsters-button').each((index, button) => {
            $(button).on('click', async (event) => {
                event.preventDefault(); // Prevent form submission
                const id = event.target.id.split('-').pop();
                // add the monsters to the container
                await this.addTokensToContainer(id, 'monster');
                // update the counts
                await updateAllCounts(id);
                const section = document.getElementById(`workspace-section-monsters-content-${id}`);
                if (section && section.classList.contains('collapsed')) {
                    toggleSection(`workspace-section-monsters-content-${id}`, button);
                }
            });
        });

        // Add event listener for "add-npcs-button"
        html.find('.add-npcs-button').each((index, button) => {
            $(button).on('click', async (event) => {
                event.preventDefault(); // Prevent form submission
                const id = event.target.id.split('-').pop();
                // add the monsters to the container
                await this.addTokensToContainer(id, 'npc');
                // update the counts
                await updateAllCounts(id);
                const section = document.getElementById(`workspace-section-npcs-content-${id}`);
                if (section && section.classList.contains('collapsed')) {
                    toggleSection(`workspace-section-npcs-content-${id}`, button);
                }
            });
        });

        // Initialize drop zones
        const id = this.id;
        addNPCDropZoneHandlers(id);

        // Add drag and drop event listeners for panel drop zones
        html.find('.panel-drop-zone').each((index, dropZone) => {
            dropZone.addEventListener('dragover', (event) => {
                event.preventDefault();
                dropZone.classList.add('dragover');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });

            dropZone.addEventListener('drop', async (event) => {
                event.preventDefault();
                dropZone.classList.remove('dragover');

                try {
                    const rawData = event.dataTransfer.getData('text/plain');
                    
                    const data = JSON.parse(rawData);
                    const id = dropZone.id.split('-').pop();

                    // Handle different drop types based on the zone
                    if (dropZone.id.includes('encounters-drop-zone')) {

                        
                        // Handle both JournalEntry and JournalEntryPage drops
                        if (data.type === 'JournalEntry' || data.type === 'JournalEntryPage') {
                            let journal, page;
                            
                            if (data.type === 'JournalEntryPage') {

                                page = await fromUuid(data.uuid);
                                if (!page) {
                                    postConsoleAndNotification('BLACKSMITH | Regent: Page not found for UUID:', data.uuid, false, true, false);
                                    return;
                                }
                                journal = page.parent;
                                await addEncounterToNarrative(id, journal, page);
                            } else {

                                journal = await fromUuid(data.uuid);
                                if (!journal) {
                                    postConsoleAndNotification('BLACKSMITH | Regent: Journal not found for UUID:', data.uuid, false, true, false);
                                    return;
                                }

                                // If a specific page was dropped
                                if (data.pageId) {

                                    page = journal.pages.get(data.pageId);
                                    if (page) {
                                        await addEncounterToNarrative(id, journal, page);
                                    }
                                } else {
                                    // If the whole journal was dropped, show a dialog to select a page
                                    const pages = journal.pages.contents;

                                    
                                    if (pages.length === 0) {
                                        ui.notifications.warn("This journal has no pages.");
                                        return;
                                    }
                                    
                                    if (pages.length === 1) {

                                        await addEncounterToNarrative(id, journal, pages[0]);
                                    } else {

                                        // Create dialog for page selection
                                        const dialog = new Dialog({
                                            title: "Select Encounter Page",
                                            content: `<div><select id="page-select" style="width: 100%;">
                                                ${pages.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                                            </select></div>`,
                                            buttons: {
                                                select: {
                                                    label: "Select",
                                                    callback: async (html) => {
                                                        const pageId = html.find('#page-select').val();

                                                        const page = journal.pages.get(pageId);
                                                        if (page) {
                                                            await addEncounterToNarrative(id, journal, page);
                                                        }
                                                    }
                                                },
                                                cancel: {
                                                    label: "Cancel"
                                                }
                                            },
                                            default: "select"
                                        });
                                        dialog.render(true);
                                    }
                                }
                            }
                        } else {

                        }
                    } else if (dropZone.id.includes('monster-drop-zone')) {
                        // Handle actor drops for monsters
                        if (data.type === 'Actor') {
                            const actor = await fromUuid(data.uuid);
                            if (actor) {
                                // Create a temporary token-like structure
                                const tokenData = {
                                    actor: actor,
                                    name: actor.name,
                                    document: {
                                        disposition: -1, // Hostile by default for monsters
                                        texture: { src: actor.img },
                                        effects: [],
                                        uuid: data.uuid
                                    }
                                };

                                // Pass a single token in an array
                                await this.addTokensToContainer(id, 'monster', [tokenData]);

                                // Update the monster CR calculations
                                const monstersContainer = document.querySelector(`#workspace-section-monsters-content-${id} .monsters-container`);
                                if (monstersContainer) {
                                    const monsterCards = Array.from(monstersContainer.querySelectorAll('.player-card'));
                                    const tokens = monsterCards.map(card => {
                                        return {
                                            actor: {
                                                system: {
                                                    details: {
                                                        cr: card.dataset.cr
                                                    }
                                                }
                                            }
                                        };
                                    });
                                    updateTotalMonsterCR(id, tokens);
                                }
                            }
                        }
                    } else if (dropZone.id.includes('party-drop-zone')) {
                        // Handle actor drops for party members
                        if (data.type === 'Actor') {
                            const actor = await fromUuid(data.uuid);
                            if (actor && actor.type === 'character') {
                                // Create a temporary token-like structure
                                const tokenData = {
                                    actor: actor,
                                    name: actor.name,
                                    document: {
                                        disposition: 1, // Friendly by default for party
                                        texture: { src: actor.img },
                                        effects: [],
                                        uuid: data.uuid
                                    }
                                };

                                // Pass a single token in an array
                                await this.addTokensToContainer(id, 'player', [tokenData]);

                                // Update party calculations
                                this._applyTokenDataToButtons([tokenData]);
                                updateTotalPlayerCounts(id);
                                updateEncounterDetails(id);
                            } else {
                                ui.notifications.warn("Only player characters can be added to the party.");
                            }
                        }
                    } else if (dropZone.id.includes('npcs-drop-zone')) {
                        // Handle actor drops for NPCs
                        if (data.type === 'Actor') {
                            const actor = await fromUuid(data.uuid);
                            if (actor && actor.type === 'npc' && actor.prototypeToken.disposition >= 0) {
                                // Create a temporary token-like structure
                                const tokenData = {
                                    actor: actor,
                                    name: actor.name,
                                    document: {
                                        disposition: 1, // Friendly for NPCs
                                        texture: { src: actor.img },
                                        effects: [],
                                        uuid: data.uuid
                                    }
                                };

                                // Pass a single token in an array
                                await this.addTokensToContainer(id, 'npc', [tokenData]);
                                updateTotalNPCCR(id);
                                updateAllCounts(id);
                            } else {
                                ui.notifications.warn("Only non-hostile NPCs can be added to the NPC worksheet.");
                            }
                        }
                    }
                } catch (error) {
                    postConsoleAndNotification('Error processing dropped item:', error, false, false, true);
                    postConsoleAndNotification('Error stack:', error.stack, false, false, true);
                }
            });
        });


        // Add event listener for "add-monsters-button"
        html.find('.add-all-button').each((index, button) => {
            $(button).on('click', async (event) => {
                event.preventDefault(); // Prevent form submission
                const id = event.target.id.split('-').pop();
                await this.addAllTokensToContainer(id);

                // Open the sections
                const section = document.getElementById(`workspace-section-tokens-content-${id}`);
                if (section && section.classList.contains('collapsed')) {
                    toggleSection(`workspace-section-tokens-content-${id}`, button);
                }
                const sectionMonsters = document.getElementById(`workspace-section-monsters-content-${id}`);
                if (sectionMonsters && sectionMonsters.classList.contains('collapsed')) {
                    toggleSection(`workspace-section-monsters-content-${id}`, button);
                }
                const sectionNpcs = document.getElementById(`workspace-section-npcs-content-${id}`);
                if (sectionNpcs && sectionNpcs.classList.contains('collapsed')) {
                    toggleSection(`workspace-section-npcs-content-${id}`, button);
                }
                const sectionEncounter = document.getElementById(`workspace-section-encounter-content-${id}`);
                if (sectionEncounter && sectionEncounter.classList.contains('collapsed')) {
                    toggleSection(`workspace-section-encounter-content-${id}`, button);
                }
            });
        });

        
        // Load cookies when the form is first opened
        loadNarrativeCookies(this.workspaceId);

        // Add listeners for form changes to save cookies
        const formElements = html.find('input, select, textarea');
        formElements.on('change', () => {
            saveNarrativeCookies(this.workspaceId);
        });

        // Add event listener for encounter journal drops
        html.find('.encounters-drop-zone').each((index, dropZone) => {
            dropZone.addEventListener('dragover', (event) => {
                event.preventDefault();
                dropZone.classList.add('dragover');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });

            dropZone.addEventListener('drop', async (event) => {
                event.preventDefault();
                dropZone.classList.remove('dragover');

                try {
                    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
                    if (data.type === 'JournalEntry' && data.uuid) {
                        const id = dropZone.id.split('-').pop();
                        const journal = await fromUuid(data.uuid);
                        
                        // If a specific page was dropped
                        if (data.pageId) {
                            const page = journal.pages.get(data.pageId);
                            if (page) {
                                await addEncounterToNarrative(id, journal, page);
                            }
                        } else {
                            // If the whole journal was dropped, show a dialog to select a page
                            const pages = journal.pages.contents;
                            if (pages.length === 0) {
                                ui.notifications.warn("This journal has no pages.");
                                return;
                            }
                            
                            if (pages.length === 1) {
                                await addEncounterToNarrative(id, journal, pages[0]);
                            } else {
                                // Create dialog for page selection
                                const dialog = new Dialog({
                                    title: "Select Encounter Page",
                                    content: `<div><select id="page-select" style="width: 100%;">
                                        ${pages.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                                    </select></div>`,
                                    buttons: {
                                        select: {
                                            label: "Select",
                                            callback: async (html) => {
                                                const pageId = html.find('#page-select').val();
                                                const page = journal.pages.get(pageId);
                                                if (page) {
                                                    await addEncounterToNarrative(id, journal, page);
                                                }
                                            }
                                        },
                                        cancel: {
                                            label: "Cancel"
                                        }
                                    },
                                    default: "select"
                                });
                                dialog.render(true);
                            }
                        }
                    }
                } catch (error) {
                    postConsoleAndNotification('Error processing dropped journal:', error, false, false, true);
                }
            });
        });

        // Add roll dice button handler
        html.find('.roll-dice-button').on('click', async (event) => {
            event.preventDefault();
            const id = event.currentTarget.id.split('-').pop();
            await this._handleRollDiceClick(id);
        });
    }

    async _handleRollDiceClick(id) {
        const skillSelect = document.getElementById(`optionSkill-${id}`);
        const diceValueInput = document.getElementById(`inputDiceValue-${id}`);
        if (!skillSelect) return;

        const skillName = skillSelect.value;
        
        const selectedActors = canvas.tokens.controlled
            .filter(t => t.actor)
            .map(t => ({
                id: t.actor.id,
                name: t.actor.name
            }));

        // Find the skill ID from the skill name
        const skillId = Object.entries(CONFIG.DND5E.skills).find(([id, data]) => 
            game.i18n.localize(data.label) === skillName
        )?.[0];

        if (!skillId) {
            ui.notifications.warn("Could not find matching skill ID for " + skillName);
            return;
        }

        // Create and render dialog with initial skill and callback
        const dialog = new SkillCheckDialog({
            actors: selectedActors,
            initialSkill: skillId,
            onRollComplete: (result) => {
                if (diceValueInput) {
                    diceValueInput.value = result;
                }
            }
        });
        dialog.render(true);
    }

    // ************************************
    // ** UTILITY Switch Wokspace
    // ************************************

    switchWorkspace(html, workspaceId) {

        playSound(COFFEEPUB.SOUNDPOP03, COFFEEPUB.SOUNDVOLUMESOFT);
    
        // Update workspaceId and store as last active
        const oldWorkspaceId = this.workspaceId;
        this.workspaceId = workspaceId.replace('blacksmith-query-workspace-', '');
        this.lastActiveWorkspace = this.workspaceId;


        // First unregister any existing hooks
        TokenHandler.unregisterTokenHooks();

        // Then register new hooks if needed
        if (this.workspaceId === 'assistant' || this.workspaceId === 'character') {
            TokenHandler.registerTokenHooks(this.workspaceId);
        }
    
        if (html) {
            // jQuery path
            const workspaceButtons = html.find('#blacksmith-query-button-lookup, #blacksmith-query-button-narrative, #blacksmith-query-button-encounter, #blacksmith-query-button-assistant, #blacksmith-query-button-character');
            workspaceButtons.removeClass('active');
            html.find(`#blacksmith-query-button-${this.workspaceId}`).addClass('active');
            html.find('.workspace-content').addClass('hidden');
            html.find(`#${workspaceId}`).removeClass('hidden');
        } else {
            // Direct DOM manipulation path
            const workspaceButtons = document.querySelectorAll('#blacksmith-query-button-lookup, #blacksmith-query-button-narrative, #blacksmith-query-button-encounter, #blacksmith-query-button-assistant, #blacksmith-query-button-character');
            workspaceButtons.forEach(button => button.classList.remove('active'));
            const activeButton = document.getElementById(`blacksmith-query-button-${this.workspaceId}`);
            if (activeButton) activeButton.classList.add('active');
            
            const workspaceContents = document.querySelectorAll('.workspace-content');
            workspaceContents.forEach(content => content.classList.add('hidden'));
            const activeWorkspace = document.getElementById(workspaceId);
            if (activeWorkspace) activeWorkspace.classList.remove('hidden');
        }
    }

    // ************************************
    // ** UTILITY Toggle Wokspace
    // ************************************

    toggleWorkspaceVisibility(html, logToggle = true) {
        const windowElement = document.getElementById('coffee-pub-blacksmith');
        const workspace = document.getElementById('blacksmith-workspace-wrapper');
        const toggleButton = document.getElementById('blacksmith-toggle-workspace');
        
        if (!workspace || !windowElement) {
            postConsoleAndNotification('Could not find workspace or window elements', "", false, false, true);
            return;
        }

        const isHidden = workspace.classList.contains('workspace-hidden');
        const baseWidth = 600;
        const workspaceWidth = 400;  // Changed from 350 to 400
        const padding = 40;

        // First update the classes
        workspace.classList.toggle('workspace-hidden');
        windowElement.classList.toggle('has-workspace');

        // Update window size
        const newWidth = isHidden ? (baseWidth + workspaceWidth + padding) : baseWidth;
        this.position.width = newWidth;
        windowElement.style.width = `${newWidth}px`;

        // Update toggle button icon
        if (toggleButton) {
            const icon = toggleButton.querySelector('i');
            if (icon) {
                icon.className = isHidden ? 'fa-solid fa-chevrons-right' : 'fa-solid fa-chevrons-left';
            }
        }

        if (logToggle) {
    
        }
    }

    // ************************************
    // ** UTILITY Get Actor Classes
    // ************************************

    _getActorClasses(actor) {
        if (!foundry.utils.hasProperty(actor, "classes")) {
            return 'Unknown';
        }

        const classEntries = Object.entries(actor.classes);
        if (classEntries.length === 0) {
            return 'Unknown';
        }

        return classEntries.map(([className, classData]) => {
            return className;
        }).join(', ');
    }

    // ************************************
    // ** UTILITY Add All Tokens
    // ************************************

    async addAllTokensToContainer(id) {


        // Add the monsters and players to the container
        await this.addTokensToContainer(id, 'monster');
        await this.addTokensToContainer(id, 'player');
        await this.addTokensToContainer(id, 'npc');
        // Update the counts
        await updateAllCounts(id);

        // Update the hero cr containers
        let heroCR = 0;
        // Update the Party CR
        const partyHeroCRContainer = document.getElementById(`worksheet-party-partycr-${id}`);
        if (partyHeroCRContainer) {
            const partyHeroCRElement = partyHeroCRContainer.querySelector('.big-number.bold-badge');
            if (partyHeroCRElement) {
                heroCR = partyHeroCRElement.innerText.trim();
                postConsoleAndNotification(`Party Benchmark for id ${id}:`, heroCR, false, true, false);
            } else {
                postConsoleAndNotification(`Span element with class 'big-number bold-badge' not found within id worksheet-party-partycr-${id}.`, "", false, false, true);
            }
        } else {
            postConsoleAndNotification(`Element with id worksheet-party-partycr-${id} not found.`, "", false, false, true);
        }
        // Update the Hero CR on the PARTY sheet

        // Update the Hero CR on the NPC sheet
        const npcHeroCrContainer = document.getElementById(`worksheet-npc-herocr-${id}`);
        if (npcHeroCrContainer) {
            const npcHeroCrElement = npcHeroCrContainer.querySelector('.big-number.bold-badge');
            if (npcHeroCrElement) {
                heroCR = npcHeroCrElement.innerText.trim();
                postConsoleAndNotification(`NPC Hero CR for id ${id}:`, heroCR, false, true, false);
            } else {
                postConsoleAndNotification(`Span element with class 'big-number bold-badge' not found within id worksheet-npc-herocr-${id}.`, "", false, false, true);
            }
        } else {
            postConsoleAndNotification(`Element with id worksheet-npc-herocr-${id} not found.`, "", false, false, true);
        }
        // MONSTER CR 
        const monsterCRValueElement = document.querySelector(`#monsterCRValue-${id}`);
        let monsterCRValue = 0;
        if (monsterCRValueElement) {
            monsterCRValue = parseFloat(monsterCRValueElement.innerText.trim());
            postConsoleAndNotification(`Monster CR Value for id ${id}:`, monsterCRValue, false, true, false);
        } else {
            postConsoleAndNotification(`Blacksmith | Element with id monsterCRValue-${id} not found.`, "", false, false, true);
            monsterCRValue = 0;
        }

        // Set the slider appropriately
        // Lets assum if this is automated that they
        // want to use the MONSTER CR as the TARGET CR
        // to guage the encounter difficulty on the canvas.

        const maxBenchmarkOrMonsterCR = monsterCRValue
        await updateSlider(id, maxBenchmarkOrMonsterCR);

        // Optionally toggle sections if needed
        const sectionMonsters = document.getElementById(`workspace-section-monsters-content-${id}`);
        if (sectionMonsters && sectionMonsters.classList.contains('collapsed')) {
            // toggleSection(`workspace-section-monsters-content-${id}`, button);
        }
        const sectionPlayers = document.getElementById(`workspace-section-tokens-content-${id}`);
        if (sectionPlayers && sectionPlayers.classList.contains('collapsed')) {
            // toggleSection(`workspace-section-tokens-content-${id}`, button);
        }
    }

    async addTokensToContainer(id, type = 'player', providedTokens = null) {
        postConsoleAndNotification(`Adding ${type} tokens to container for ID:`, id, false, true, false);
        const intHPThreshold = 50;
        
        // Get the appropriate container based on type
        let tokensContainer;
        if (type === 'player') {
            tokensContainer = document.querySelector(`#workspace-section-tokens-content-${id} .tokens-container`);
        } else if (type === 'npc') {
            tokensContainer = document.querySelector(`#workspace-section-npcs-content-${id} .npc-container`);
        } else { // monster
            tokensContainer = document.querySelector(`#workspace-section-monsters-content-${id} .monsters-container`);
        }
    
        if (!tokensContainer) {
            postConsoleAndNotification(`Blacksmith | Container not found for type ${type} and ID ${id}`, "", false, false, true);
            return;
        }
    
        // Use provided tokens if available, otherwise get from canvas
        let tokens;
        if (providedTokens) {
            tokens = providedTokens;
        } else {
            const allTokens = canvas.tokens.placeables;
            const selectedTokens = canvas.tokens.controlled;
            tokens = selectedTokens.length >= 1 ? selectedTokens : allTokens;
        }

        // Get existing token UUIDs in the container
        const existingUUIDs = new Set(Array.from(tokensContainer.querySelectorAll('.player-card'))
            .map(card => card.dataset.tokenUuid || card.dataset.actorUuid)
            .filter(uuid => uuid));

        // Filter out duplicates
        tokens = tokens.filter(token => {
            const tokenUuid = token.document?.uuid;
            const actorUuid = token.actor?.uuid;
            return !existingUUIDs.has(tokenUuid) && !existingUUIDs.has(actorUuid);
        });
        
        // Check if Item Piles module is active
        const isItemPilesActive = game.modules.get("item-piles")?.active;
        
        // Filter tokens based on type
        tokens = tokens.filter(token => {
            const isPlayerToken = foundry.utils.hasProperty(token.actor, "type") && token.actor.type === 'character';
            const isAlive = foundry.utils.hasProperty(token.actor, "system.attributes.hp.value") && 
                           token.actor.system.attributes.hp.value > 0 && 
                           !token.document.effects.some(e => e.label === "Dead");
            const isItemPile = isItemPilesActive && game.itempiles.API.isValidItemPile(token.actor);
            
            if (type === 'player') {
                return isPlayerToken && !isItemPile;
            } else if (type === 'npc') {
                return foundry.utils.hasProperty(token.actor, "type") && 
                       token.actor.type === 'npc' && 
                       token.document.disposition >= 0 && 
                       isAlive && 
                       !isItemPile;
            } else { // monster
                return foundry.utils.hasProperty(token.actor, "type") && 
                       token.actor.type === 'npc' && 
                       token.document.disposition < 0 && 
                       isAlive && 
                       !isItemPile;
            }
        });
        postConsoleAndNotification(`Filtered ${type} tokens:`, tokens, false, true, false);
    
        if (tokens.length === 0) {
            if (!tokensContainer.hasChildNodes()) {
                tokensContainer.innerHTML = `<p>No ${type} tokens found on the canvas.</p>`;
            }
            return;
        }
    
        // Generate HTML for each new token
        tokens.forEach(token => {
            if (!foundry.utils.hasProperty(token.actor, "system")) return;
            
            const actorData = token.actor.system;
            postConsoleAndNotification("Actor Data:", actorData, false, true, false);
            const name = token.name;
            const strName = trimString(name, 16);
    
            // make this a setting at some point.
            const blnImagePortrait = true;
            let img;
            if (blnImagePortrait) {
                img = foundry.utils.hasProperty(token.actor, "img") ? token.actor.img : null;
            } else {
                img = foundry.utils.hasProperty(token.document, "texture.src") ? token.document.texture.src : null;
            }
            if (!img) return; // Skip if no image found
    
            // Determine the disposition and corresponding class
            const disposition = token.document.disposition;
            let strDispositionClass = '';
            switch (disposition) {
                case 0:
                    strDispositionClass = 'disposition-neutral';
                    break;
                case 1:
                    strDispositionClass = 'disposition-friendly';
                    break;
                case -1:
                    strDispositionClass = 'disposition-hostile';
                    break;
                default:
                    strDispositionClass = 'disposition-secret';
                    break;
            }
    
            // Determine if the token is dying (less than 20% HP)
            const hpValue = foundry.utils.getProperty(actorData, "attributes.hp.value") || 0;
            const hpMax = foundry.utils.getProperty(actorData, "attributes.hp.max") || 1;
            const hpPercentage = (hpValue / hpMax) * 100;
            const isDying = hpPercentage < intHPThreshold;
            const hpDyingClass = isDying ? 'hp-dying' : '';
    
            let detailsHTML = '';
            let tokenHTML = '';
            // WE should be using a template here
            if (type === 'player') {
                const classes = this._getActorClasses(token.actor);
                const level = foundry.utils.getProperty(actorData, "details.level") || 'Unknown Level';
                const hp = `${hpValue}/${hpMax}`;
                detailsHTML = `
                    <div class="character-details character-rollup">Level ${level} ${classes}</div>
                    <div class="character-details character-extra">${hp} HP</div>
                `;
                tokenHTML = `
                    <div data-class="${classes}" 
                         data-level="${level}" 
                         data-token-uuid="${token.document.uuid}"
                         data-actor-uuid="${token.actor.uuid}"
                         data-type="player"
                         class="player-card ${strDispositionClass} ${hpDyingClass}">
                        <img src="${img}" alt="${name}">
                        <div class="player-card-details">
                            <div class="character-name">${strName}</div>
                            ${detailsHTML}
                        </div>
                        <button type="button" class="clear-button" onclick="removeCard(event, this, '${id}')">x</button>
                    </div>
                `;
                // add to player container
                tokensContainer.insertAdjacentHTML('beforeend', tokenHTML);
            } else if (type === 'npc') {
                // For NPCs (non-hostile)
                const npcType = actorData.details?.type?.value || 'Unknown';
                const uuid = token.document.uuid || 'UUID Unknown';

                // Call the function to calculate the NPC CR
                let cr = calculateNPCCR(token.actor);
            
                detailsHTML = `
                    <div class="character-details character-rollup">CR ${cr} ${npcType}</div>    
                `;

                tokenHTML = `
                    <div data-cr="${cr}" 
                         data-type="${type}"
                         data-token-uuid="${token.document.uuid}"
                         data-actor-uuid="${token.actor.uuid}"
                         class="player-card ${strDispositionClass} ${hpDyingClass}">
                        <img src="${img}" alt="${name}">
                        <div class="player-card-details">
                            <div class="character-name">${strName}</div>
                            ${detailsHTML}
                        </div>
                        <button type="button" class="clear-button" onclick="removeCard(event, this, '${id}')">x</button>
                    </div>
                `;

                // Add to NPC container
                tokensContainer.insertAdjacentHTML('beforeend', tokenHTML);
            } else {
                postConsoleAndNotification("BLACKSMITH: Building Monster Card", strName, false, true, false);
                // Get CR from actor data
                let cr = actorData.details?.cr;
                // If CR exists but is a number, format it properly
                if (cr !== undefined && cr !== null) {
                    // Handle fractional CRs
                    switch (cr) {
                        case 0.125: cr = "1/8"; break;
                        case 0.25: cr = "1/4"; break;
                        case 0.5: cr = "1/2"; break;
                        default: cr = cr.toString();
                    }
                } else {
                    cr = 'Unknown';
                }

                const monsterType = actorData.details?.type?.value || 'Unknown';
                const uuid = token.document.uuid || 'UUID Unknown';

                // For debugging
                postConsoleAndNotification("Monster CR Data:", {
                    name: strName,
                    rawCR: actorData.details?.cr,
                    formattedCR: cr,
                    type: monsterType
                }, false, true, false);

                type = 'Monster';

                detailsHTML = `
                    <div class="character-details character-rollup">CR ${cr} ${monsterType}</div>    
                `;

                tokenHTML = `
                    <div data-cr="${cr}" 
                         data-type="${type}" 
                         data-token-uuid="${token.document.uuid}"
                         data-actor-uuid="${token.actor.uuid}"
                         data-actor-name="${token.actor.name}"
                         data-display-name="${strName}"
                         class="player-card ${strDispositionClass} ${hpDyingClass}">
                        <img src="${img}" alt="${name}">
                        <div class="player-card-details">
                            <div class="character-name">${strName}</div>
                            ${detailsHTML}
                        </div>
                        <button type="button" class="clear-button" onclick="removeCard(event, this, '${id}')">x</button>
                    </div>
                `;
                // add to monster container
                tokensContainer.insertAdjacentHTML('beforeend', tokenHTML);
            }
        });
    
        // Apply the token data to the toggle buttons for level and class
        if (type === 'player') {
            this._applyTokenDataToButtons(tokens);
            // update the level and total monster CR    
            postConsoleAndNotification("Update Character Level.", id, false, true, false);
            updateTotalPlayerCounts(id);
            // HIDE THE TOKENS ADDED MESSAGE
            // Display the message and hide the rest of the content
            document.getElementById(`tokens-added-message-${id}`).style.display = 'block';
        } else if (type === 'monster') {
            postConsoleAndNotification("Update Monster CR.", id, false, true, false);
            updateTotalMonsterCR(id, tokens);
        }
    }



    // ************************************
    // ** EVENT onSendToJson
    // ************************************

    async _onSendToJson(event) {
        event.preventDefault();
        const button = $(event.currentTarget);
        const messageId = button.data('message-id');
        const contentElement = $(`#blacksmith-message-wrapper[data-message-id="${messageId}"]`);
        let content = contentElement.length ? contentElement.html() : null;
        
        try {
            // Extract just the JSON content from the HTML
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error("No JSON content found in the message");
            }
            content = jsonMatch[0];

            // Parse and process the JSON
            const journalData = JSON.parse(content);
            const strJournalType = journalData.journaltype;
            
            // See what kind of Journal we are creating
            switch (strJournalType.toUpperCase()) {
                case "NARRATIVE":
                case "ENCOUNTER":
                    postConsoleAndNotification("Creating an NARRATIVE or ENCOUNTER journal entry.", "", false, false, false);
                    await createJournalEntry(journalData);
                    postConsoleAndNotification("completed NARRATIVE or ENCOUNTER journal entry creation.", "", false, false, false);
                    break;
                case "INJURY":
                    postConsoleAndNotification("Creating an INJURY journal entry.", "", false, false, false);
                    await buildInjuryJournalEntry(journalData);
                    postConsoleAndNotification("completed INJURY journal entry creation.", "", false, false, false);
                    break;
                default:
                    postConsoleAndNotification("Can't create the journal entry. The journal type was not found.", strJournalType, false, false, true);
            }
        } catch (error) {
            postConsoleAndNotification("Blacksmith | Error processing JSON:", error, false, false, true);

        }
    }

    // ************************************
    // ** EVENT onSendToChat
    // ************************************

    async _onSendToChat(event) {
        event.preventDefault();
        const button = $(event.currentTarget);
        const messageId = button.data('message-id');
        const contentElement = $(`#blacksmith-message-wrapper[data-message-id="${messageId}"]`);
        const content = contentElement.length ? contentElement.html() : null;
        postConsoleAndNotification("Content Element:", contentElement, false, true, false);
        postConsoleAndNotification("Content:", content, false, true, false);
        playSound(COFFEEPUB.SOUNDPOP02,COFFEEPUB.SOUNDVOLUMESOFT);
        if (content && content.trim() !== "") {
            await ChatMessage.create({
                content: content,
                speaker: ChatMessage.getSpeaker()
            });
        } else {
            postConsoleAndNotification("Blacksmith | No content found to send to chat.", "", false, false, true);
            ui.notifications.error("No content found to send to chat.");
        }
    }


    // ************************************
    // ** EVENT onCopyToClipboard
    // ************************************

    async _onCopyToClipboard(event) {
        event.preventDefault();
        const button = $(event.currentTarget);
        const messageId = button.data('message-id');
        const contentElement = $(`#blacksmith-message-content[data-message-id="${messageId}"]`);
        let content = contentElement.length ? contentElement.html() : null;
        postConsoleAndNotification("Content Element:", contentElement, false, false, false);
        postConsoleAndNotification("Content:", content, false, false, false);
        playSound(COFFEEPUB.SOUNDPOP02,COFFEEPUB.SOUNDVOLUMESOFT);
        if (content && content.trim() !== "") {
            // Sanitize content to remove unnecessary whitespace and line breaks
            content = content.replace(/<p>\s*<\/p>/g, '').trim();
            // Compress the HTML content by removing line breaks and spaces between tags
            content = content.replace(/>\s+</g, '><');
            // wrap it in a nice package.
            //content = `<div id="blacksmith-message-header" class="blacksmith-message-header-answer"><i class="fa-solid fa-copy"></i><span class="blacksmith-message-speaker">Clipboard</span></div><div id="blacksmith-message-content">${content}</div>`;
            try {
                await navigator.clipboard.writeText(content);
                ui.notifications.info("Content copied to clipboard.");
            } catch (err) {
                postConsoleAndNotification("Blacksmith | Failed to copy content: ", err, false, false, true);
                ui.notifications.error("Blacksmith | Failed to copy content to clipboard.");
            }
        } else {
            postConsoleAndNotification("Blacksmith | No content found to copy.", "", false, false, true);
            ui.notifications.error("Blacksmith | No content found to copy.");
        }
    }


    // ************************************
    // ** EVENT onSubmit
    // ************************************

    async _onSubmit(event, form) {
        
        event.preventDefault();
        form = form || event.currentTarget.closest('form'); // Use the passed form or the event's current target's closest form
        
        // Collect data from the chat workspaces
        const id = this.workspaceId; 
        var strPromptNarration = "";
        var strPromptEncounter = "";
        var strFinalPrompt = "";

        var strCampaignName = "The Burden of Knowledge";

        var strGmContext = "";
        var strPlayerContext = "";
        var strGMSimpleContext = "";
        var strPlayerSimpleContext = "";
        var strFinalContext = "";

        // ==============================================================
        // == COLLECT THE DATA
        // ==============================================================

        // INPUT MESSAGE - NORMAL QUESTION
        const inputMessage = form.querySelector('textarea[name="blacksmith-input-message"]').value.trim();
        postConsoleAndNotification('Form submitted with message:', inputMessage, false, true, false);


        //  LOOKUPS
        const optionFeatures = form.querySelector('#optionFeatures-' + id)?.value ?? null;
        const inputFeaturesDetails = form.querySelector('#inputFeaturesDetails-' + id)?.value ?? null;


        //  CHARACTER
        const inputCharacterGuidance = form.querySelector('#inputFeedbackRequested-' + id)?.value ?? null;
        let inputCharacterData = "";
        // Get character data if a token is selected
        const selectedToken = canvas.tokens?.controlled[0];
        if (selectedToken) {
            const tokenData = TokenHandler.getTokenData(selectedToken);
            inputCharacterData = formatCharacterData(tokenData);
        }

        
        // SKILL CHECK (AKA ASSISTANT)
        // Roll
        const blnSkillRoll = form.querySelector('#blnSkillRoll-' + id)?.checked ?? null;
        const optionSkill = form.querySelector('#optionSkill-' + id)?.value ?? null;
        const optionDiceType = form.querySelector('#optionDiceType-' + id)?.value ?? null;
        const inputDiceValue = form.querySelector('#inputDiceValue-' + id)?.value ?? null;
        // Details
        const optionType = form.querySelector('#optionType-' + id)?.value ?? null;
        const inputContextName = form.querySelector('#inputContextName-' + id)?.value ?? null;
        const inputContextDetails = form.querySelector('#inputContextDetails-' + id)?.value ?? null;


        // ENCOUNTER
        const blnAddEncounter = form.querySelector('#blnAddEncounter-' + id)?.checked ?? null;
        let targetCRValue = document.querySelector('#targetCRValue-' + id)?.textContent ?? "0.00"; // Get the value as a string
        const numericValue = parseFloat(targetCRValue); // Convert the string to a number
        if (numericValue > 0) {
            targetCRValue = numericValue; // Set targetCRValue to the numeric value
            // Your logic here when numericValue is greater than zero
        }
        const targetRatingElement = document.querySelector('#encounter-rating-' + id);
        let targetRating = ""; // Initialize the variable
        if (targetRatingElement) {
            targetRating = targetRatingElement.textContent; // Set targetRating to the text content
            postConsoleAndNotification(targetRating, "", false, true, false);
        }
        const inputNarrativeEncounterDetails = form.querySelector('#inputNarrativeEncounterDetails-' + id)?.value ?? null;

        const inputNarrativeEncounterMonsters = form.querySelector('#inputNarrativeEncounterMonsters-' + id)?.value ?? null;
        const blnSpecificEncounterMonsters = form.querySelector('#blnSpecificEncounterMonsters-' + id)?.checked ?? null;

        // NARRATIVE blnGenerateDialogue
        // card settings
        const inputFolderName = form.querySelector('#input-FOLDERNAME-' + id)?.value ?? null;
        const inputSceneTitle = form.querySelector('#input-SCENETITLE-' + id)?.value ?? null;
        const optionCardImage = form.querySelector('#optionCardImage-CARDIMAGE-' + id)?.value ?? null;
        const inputCardImage = form.querySelector('#input-CARDIMAGE' + id)?.value ?? null;

        // Details
        const blnGenerateDialogue = form.querySelector('#blnGenerateDialogue-' + id)?.checked ?? null;
        const inputNarrativeDetails = form.querySelector('#inputNarrativeDetails-' + id)?.value ?? null;

        // geography
        const inputLocation = form.querySelector('#input-LOCATION-' + id)?.value ?? null;
        const inputSceneParent = form.querySelector('#input-SCENEPARENT-' + id)?.value ?? null;
        const inputSceneArea = form.querySelector('#input-SCENEAREA-' + id)?.value ?? null;
        const inputEnvironment = form.querySelector('#input-ENVIRONMENT-' + id)?.value ?? null;
        // card prep
        const inputPrepTitle = form.querySelector('#input-PREPTITLE-' + id)?.value ?? null;
        const inputPrepDescription = form.querySelector('#input-PREPDESCRIPTION-' + id)?.value ?? null;
        const inputPrepDetails = form.querySelector('#input-PREPDESCRIPTION-' + id)?.value ?? null;
        // rewards and treasure
        const blnAddRewards = form.querySelector('#blnAddRewards-' + id)?.checked ?? null;
        const inputXP = form.querySelector('#input-XP-' + id)?.value ?? null;
        const inputNarrativeRewardDetails = form.querySelector('#inputNarrativeRewardDetails-' + id)?.value ?? null;


        // GLOBAL OPTIONS
        // General Options
        const blnGenerateDescription = form.querySelector('#blnGenerateDescription-' + id)?.checked ?? null;
        const blnGenerateDetails = form.querySelector('#blnGenerateDetails-' + id)?.checked ?? null;
        const blnGenerateStats = form.querySelector('#blnGenerateStats-' + id)?.checked ?? null;
        const blnGenerateBackstory = form.querySelector('#blnGenerateBackstory-' + id)?.checked ?? null;
        // Mechanics
        const blnMechanicsExplain = form.querySelector('#blnMechanicsExplain-' + id)?.checked ?? null;
        const blnMechanicsHowTo = form.querySelector('#blnMechanicsHowTo-' + id)?.checked ?? null;
        // GM Options
        const blnGMDetails = form.querySelector('#blnGMDetails-' + id)?.checked ?? null;
        const blnShowPrompt = form.querySelector('#blnShowPrompt-' + id)?.checked ?? null;
        const blnShowTable = form.querySelector('#blnShowTable-' + id)?.checked ?? null;


        // Write the settings to cookies





        // ==============================================================
        // == CHECK FOR WORKSPACE AND INPUT VALUES 
        // == ensures they have either used a worksheet
        // == or have added an input message.
        // ==============================================================

        // SET WORKSPACE FLAG
        // Should only be set if worspace fields are set.
        var isWorkspaceSet= false;
        switch(this.workspaceId) {
            case "encounter":
                // ENCOUNTER
                // update this once generating realtime encounters
                isWorkspaceSet = inputFolderName || inputSceneTitle || inputLocation || inputSceneParent || inputSceneArea || inputEnvironment || inputPrepTitle || inputPrepDescription || inputPrepDetails || inputXP || inputNarrativeRewardDetails;
                break;
            case "narrative":
                // NARRATIVE
                isWorkspaceSet = inputFolderName || inputSceneTitle || optionCardImage || inputCardImage || inputLocation || inputSceneParent || inputSceneArea || inputEnvironment || inputPrepTitle || inputPrepDescription || inputPrepDetails || inputXP || inputNarrativeRewardDetails;
                break;
            case "lookup":
                // LOOKUP
                isWorkspaceSet = optionFeatures || inputFeaturesDetails;
                break;
            case "assistant":
                // SKILL CHECK
                isWorkspaceSet = blnSkillRoll || optionSkill || optionDiceType || inputDiceValue || optionType ||inputContextName;
                break;
            case "character":
                // CHARACTER
                isWorkspaceSet =  inputCharacterGuidance || inputCharacterData;
                break;
            default:
                // No Workspace Set
                isWorkspaceSet= false;
        }

        // If inputMessage is empty and no workspace options are set, do not allow submission
        if (!inputMessage && !isWorkspaceSet) {
            ui.notifications.error("Please enter a message or set workspace options before submitting.");
            return;
        }

        // ==============================================================
        // == BUILD THE PROMPTS
        // ==============================================================
   
        // --------------------------------------------------------------
        // -- LOOKUPS 
        // -- sets: strPromtFeatures
        // --------------------------------------------------------------

        var strPromtFeatures = ""; 
        if (optionFeatures) {
            strPromtFeatures = `\n\nThe player is trying to understand the D&D5E character feature ${optionFeatures}. Make you response as clear as possible with the goal of helping them understand the rule. Assume they know little about the rule. Provide details and examples as needed.`;
            // Append the input message if they also added one.

            if (inputFeaturesDetails) {
                strPromtFeatures += `\n\nThe player has provided his additional context: ${inputFeaturesDetails}. Take this into account as you provide your response.`;
            }
            
            if (blnMechanicsExplain) {
                strPromtFeatures = strPromtFeatures + `\n\nAdd an h4 Heading for a section called "${optionFeatures} Details".`;
                strPromtFeatures = strPromtFeatures + `\n\nIn this section, explain the feature ${optionFeatures} to the player. This should include the definition, how it works, and any other details that the player needs to know.`;
            }
            if (blnMechanicsHowTo) {
                strPromtFeatures = strPromtFeatures + `\n\nAdd an h4 Heading for a section called "Foundry Instructions".`;
                strPromtFeatures = strPromtFeatures + `\n\nIn this section, provide examples of how to use the feature ${optionFeatures} in the FoundryVTT version 12 online tabletop. This might include how to use the feature on their token or how to use the feature in the character sheet. It might also tell them what to expect to see in the chat or what to expect to see in the sidebar or on the canvas.`;
            }

        } 
        else if (inputFeaturesDetails) {
            strPromtFeatures = `\n\nThe player is trying to understand some D&D5E rules or concept or action as they've provided the following details: ${inputFeaturesDetails}. Leverage the D&D5E SRD and the details they've provided to help them understand the rule, concept, or action. Take this into account as you provide your response. Make you response as clear as possible with the goal of helping them understand the rule. Assume they know little about the rule. Provide details and examples as needed.`;
            if (blnMechanicsExplain) {
                strPromtFeatures = strPromtFeatures + `\n\nAdd an h4 Heading for a section called "Rule Details".`;
                strPromtFeatures = strPromtFeatures + `\n\nIn this section, answer the question about "${inputFeaturesDetails}" for the player. This should include the definition, how it works, and any other details that the player needs to know to understand the rule.`;
            }
            if (blnMechanicsHowTo) {
                strPromtFeatures = strPromtFeatures + `\n\nAdd an h4 Heading for a section called "Foundry Instructions".`;
                strPromtFeatures = strPromtFeatures + `\n\nIn this section, provide examples of how to leverage or take actuon on "${optionFeatures}" in the FoundryVTT version 12 online tabletop. This might include what they need to know, how to use the rule on their token, or how to use the rule in the character sheet, or in the client in general. It might also tell them what to expect to see in the chat or what to expect to see in the sidebar or on the canvas..`;
            }
        }


        // --------------------------------------------------------------
        // -- SKILL CHECK (AKA ASSISTANT)
        // -- sets: strPromptSkillCheck
        // --------------------------------------------------------------

        // type
        var strPromptSkillCheck = "";
        var strPromptType = "";
        if (optionType) {
            strPromptType = `\n\nYou are generating details for a ${optionType}. Include history, stats, and details that the players may know for a ${optionType}.`;
        }
        // name
        var strPromptName = "";
        if (inputContextName) {
            strPromptName = `\n\nYou are generating a narrative about ${inputContextName}. Be sure to include the history, stats, and details that the players need to know for ${inputContextName}`;
        }
        // Additional Details
        if (inputContextDetails) {
            strPromtOtherInformation = strPromtOtherInformation +`\n\nThis section should also include context or details realted to: ${inputContextDetails}`;
        }
        // Skill Check Roll
        var strPromtSkillRoll = ""; 
        if (blnSkillRoll) {
            strPromtSkillRoll = `\n\nEverything you generate should be based on this skill check. They rolled a  ${inputDiceValue} against the skill '${optionSkill}' using a ${optionDiceType}. A low roll should give them very few details. A high roll should give them a lot of details with many specifics. If they roll the highest number on the dice they got a critical and know everything, especially tactics or secrets. Since the details are based on this roll, you should lead into the narrative with that context, referencing their roll of a DC${inputDiceValue} ${optionSkill} check and how it impacts what they know about things.`;
        }
        // build the final prompt
        strPromptSkillCheck = strPromptType + strPromptName + inputContextDetails + strPromtSkillRoll;




        // --------------------------------------------------------------
        // -- RESPONSE OPTIONS
        // --------------------------------------------------------------

        // generate description
        var strPromtDescription = ""; 
        if (blnGenerateDescription) {
            strPromtDescription = `\n\nAdd an h4 Heading for this section called "Description".`;
            strPromtDescription += `\n\nIn a section write a detailed description as a narrative describing things. Include descriptive details. If generating a narrative for a monster or NPC, include their appearance, mannerisms and any other details that will help the players better understand them and their motivations. Consider including features and abilities. If generating a narrative for a location, include its appearance, atmosphere, and any other details that will help the players better understand it. If generating a narrative for an item, include its appearance, properties, and any other details that will help the players better understand it.`;    
        }
        // generate other information
        var strPromtOtherInformation = "";   
        if (blnGenerateDetails) {
            strPromtOtherInformation = `\n\nAdd an h4 Heading for a section called "Additional Details".`;
            strPromtOtherInformation += `\n\nIn this section, include any other relevant information that the players need to know. This could include tactics, secrets, or any other details that will help the players better understand the context.`;
        }   
        // generate stats   
        var strPromtStats = "";   
        if (blnGenerateStats) {
            strPromtStats = `\n\nAdd an h4 Heading for a section called "Stats and Information".`;
            strPromtStats += `\n\nIn this section, provide the relevant stats and data in a bulleted list or table format, depending on the what it is. If you are generating a narrative for a monster or character, include their abilities, hit points, armor class, and other relevant stats. If it is a location, include any relevant environmental stats or data like temperature, humidity, where it is near, and other relevant details. If it is an item, include its properties, damage, and other relevant stats.`;
        }
        // generate backstory   
        var strPromtBackstory = "";   
        if (blnGenerateBackstory) {
            strPromtBackstory = `\n\nAdd an h4 Heading for a section called "Biography".`;
            strPromtBackstory += `\n\nIn this section, provide a detailed backstory. If you are generating a narrative for a monster or character, include their biography, history, and any other relevant details. If it is a location, include its history, significant events, and any other relevant details. If it is an item, include its origin, previous owners, and any other relevant details.`;
        }
        // Have everything packed for the GM view if requested
        var strPromtGMDetails = "";   
        if (blnGMDetails) {
            strPromtGMDetails = `\n\nAdd an h4 Heading for a section called "GM Details".`;
            strPromtGMDetails +=  `\n\nThis section id just for the GM. Ignore any skill checks for this section and tell the GM things that they need to know that you may not have been able to tell the players because of their roll. This could include things like additional immunities or properties, secrect locations, and far more details. The GM will use this information as the game progresses. Give the GM all of the details you can - be comprehensive. Generate Information for the GM as if they rolled a critical. If a monster, include tactics and secrets.`;
        }      
    
        // --------------------------------------------------------------
        // -- GM CONTEXT 
        // --------------------------------------------------------------

        // we will append more specific context later in the switch.    
        var strPromtGMMindset = "You are a wise dungeon master playing Dungeons and Dragons 5e. You are tasked to build an immersive narrative with engaging descriptions, facts, stats, and various specific details. Provide a vivid descriptions and details that captures the imagination of players. Be creative, witty, and engaging. Do no suggest a location or area if it is not provided.";
        strPromtGMMindset += "\n\nThe results will be returned formatted in simple HTML with the details separated by titles where appropriate. Headings and Titles should be h4 tags. Only use tables for number, stats, or other tabular data. Never put sentences in tables.";



        // --------------------------------------------------------------
        // -- GENERATE ENCOUNTER JSON
        // -- USE ON: Encounter
        // --------------------------------------------------------------

        strPromptEncounter = `You are a D&D5E DM creating an encounter for "${strCampaignName}". ${BASE_PROMPT_TEMPLATE.formatting}

${BASE_PROMPT_TEMPLATE.narrative}

IMPORTANT:
- Always generate a scene title if one is not provided
- Never leave required fields empty (especially scene title)
- Scene titles should be evocative and descriptive

Key encounter requirements:`;

        if (inputNarrativeEncounterDetails) {
            strPromptEncounter += `\nContext: ${inputNarrativeEncounterDetails}`;
        }

        // Build core metadata
        const metadata = {
            journaltype: "Encounter",
            foldername: inputFolderName || "",
            sceneparent: inputSceneParent || "",
            scenearea: inputSceneArea || "",
            sceneenvironment: inputEnvironment || "",
            scenelocation: inputLocation || "",
            scenetitle: inputSceneTitle || "Generate an evocative encounter title (required, 3-5 words)", // Modified this line
            cardimage: optionCardImage === "custom" ? (inputCardImage || "") : 
                      optionCardImage === "none" ? "" : 
                      optionCardImage || "", // Add card image from either option or direct input
            cardimagetitle: optionCardImage === "none" ? "" :
                           optionCardImage === "custom" ? (inputCardImage ? "Custom image" : "") :
                           optionCardImage ? "Selected preset image" : "" // Add image title
        };

        // Add metadata fields
        Object.entries(metadata).forEach(([key, value]) => {
            if (value) {
                strPromptEncounter += `\n${key.toUpperCase()}: ${value}`;
                if (key === 'cardimage' && value) {
                    strPromptEncounter += `\nNote: Use this image to inspire atmospheric and environmental descriptions.`;
                }
            }
        });

        // Get worksheet monsters before monster selection criteria
        const worksheetMonsters = getWorksheetMonsters(id);

        // Add monster selection criteria more concisely
        if (inputNarrativeEncounterMonsters || worksheetMonsters.length > 0) {
            const monsterList = [];
            if (inputNarrativeEncounterMonsters) monsterList.push(inputNarrativeEncounterMonsters);
            if (worksheetMonsters.length > 0) {
                monsterList.push(`Worksheet monsters: ${worksheetMonsters.map(m => `${m.name} (CR ${m.cr})`).join(', ')}`);
            }

            strPromptEncounter += `\n\nPREPENCOUNTER requirements:
- ${targetCRValue > 0 ? `Target CR: ${targetCRValue}, Difficulty: ${targetRating}` : 'Select thematically appropriate monsters'}
- Required monsters: ${monsterList.join(', ')}
- Max 10 total monsters, max 5 per type
- Consider tactical roles and synergies`;
        }

        // Add atmosphere and environment context
        if (inputEnvironment || inputLocation) {
            strPromptEncounter += `\n\n${BASE_PROMPT_TEMPLATE.atmosphere}`;
        }

        // Add the JSON format template
        strPromptEncounter += `\n\nRespond with JSON in this format:\n${BASE_PROMPT_TEMPLATE.jsonFormat}`;

        strPromptEncounter += `\n- FOLDERNAME: Set to "${inputFolderName}". Do not add any html tags to this field.`;
        strPromptEncounter += `\n- SCENEPARENT: Set to "". Do not add any html tags to this field.`;
        strPromptEncounter += `\n- SCENEAREA: Set to "". Do not add any html tags to this field.`;
        strPromptEncounter += `\n- ENVIRONMENT: Set to "". Do not add any html tags to this field.`;
        strPromptEncounter += `\n- LOCATION: Set to "". Do not add any html tags to this field.`;
        // They want an image on the card
        if (optionCardImage === "custom") {
            // They selected "Custom"
            if (inputCardImage) {
                // They added a custom image
                strPromptEncounter += `\n- CARDIMAGE: Set to "${inputCardImage}". Do not add any html tags or image tags to this field.`;
            } else {
                // They did not add a custom image
                strPromptEncounter += `\n- CARDIMAGE: Set to "". Do not add any html tags or image tags to this field.`;
            }
        } else if (optionCardImage === "none") {
            strPromptEncounter += `\n- CARDIMAGE: Set to "". Do not add any html tags or image tags to this field.`;
        } else {
            strPromptEncounter += `\n- CARDIMAGE: Set to "${optionCardImage || ''}". Do not add any html tags or image tags to this field.`;
        }
        strPromptEncounter += `\n- SCENETITLE: Title of the encounter you are writing the narrative for. Set it to "Encounter: ` + inputSceneTitle + `". Keep it under 5 words long. Do not add any html tags to this field.`;
        strPromptEncounter += `\n- INTRO: One or two sentences letting the GM know what is going to happen in this encounter. Do not add any html tags to this field.`;
        
        
        if (inputNarrativeEncounterMonsters) {
            if (blnSpecificEncounterMonsters) {
                // Only use the specified monsters
                strPromptEncounter += `
            - PREPENCOUNTER: Use exactly these monsters in the encounter (no others): ${inputNarrativeEncounterMonsters}. Do not add any html tags to this field.`;
            } else {
                // Include these monsters but can add others
                // Get monsters from the worksheet
                const worksheetMonsters = getWorksheetMonsters(id);
                const worksheetMonstersList = worksheetMonsters.map(m => `${m.name} (CR ${m.cr})`).join(', ');
                
                if (targetCRValue > 0) {
                    strPromptEncounter += `
            - PREPENCOUNTER: Create a tactically interesting encounter (comma-separated list)
              • Target CR: ${targetCRValue}, Difficulty: ${targetRating}
              • Max 10 total monsters, max 5 per type
              • MUST include these specific monsters: ${inputNarrativeEncounterMonsters}${worksheetMonsters.length ? `, and these monsters from the worksheet: ${worksheetMonstersList}` : ''}
              • Can add additional official D&D5E monsters that fit the environment
              • Consider monster synergies and tactical roles`;
                } else {
                    strPromptEncounter += `
            - PREPENCOUNTER: Select thematically appropriate monsters (comma-separated list)
              • MUST include these specific monsters: ${inputNarrativeEncounterMonsters}${worksheetMonsters.length ? `, and these monsters from the worksheet: ${worksheetMonstersList}` : ''}
              • Can add additional official D&D5E monster names in singular form
              • Choose additional creatures that create interesting tactical situations`;
                }
            }
        } else {
            // No specific monsters provided, but check worksheet
            const worksheetMonsters = getWorksheetMonsters(id);
            if (worksheetMonsters.length > 0) {
                const worksheetMonstersList = worksheetMonsters.map(m => `${m.actorName} (CR ${m.cr})`).join(', ');
                if (targetCRValue > 0) {
                    strPromptEncounter += `
            - PREPENCOUNTER: Create a tactically interesting encounter (comma-separated list)
              • Target CR: ${targetCRValue}, Difficulty: ${targetRating}
              • Max 10 total monsters, max 5 per type
              • MUST include these monsters from the worksheet: ${worksheetMonstersList}
              • Can add additional official D&D5E monsters that fit the environment
              • Consider monster synergies and tactical roles`;
                } else {
                    strPromptEncounter += `
            - PREPENCOUNTER: Select thematically appropriate monsters (comma-separated list)
              • MUST include these monsters from the worksheet: ${worksheetMonstersList}
              • Can add additional official D&D5E monster names in singular form
              • Choose additional creatures that create interesting tactical situations`;
                }
            } else {
                // Original code for when no monsters are provided
                if (targetCRValue > 0) {
                    strPromptEncounter += `
            - PREPENCOUNTER: Create a tactically interesting encounter (comma-separated list)
              • Target CR: ${targetCRValue}, Difficulty: ${targetRating}
              • Max 10 total monsters, max 5 per type
              • Use official D&D5E monsters that fit the environment
              • Consider monster synergies and tactical roles`;
                } else {
                    strPromptEncounter += `
            - PREPENCOUNTER: Select thematically appropriate monsters (comma-separated list)
              • Use official D&D5E monster names in singular form
              • Choose creatures that create interesting tactical situations`;
                }
            }
        }

        strPromptEncounter += `\n- PREPENCOUNTERDETAILS: Bulleted list of the encounter details. Label these items as Difficulty (Easy - trivial, no damage taken, Medium - still easy, possibility of damage, Hard - possibility of significant damage taken, or Deadly - possibility of deadly damage taken), Overall Challenge Rating (the cumulative challenge rating for all monsters combined), Monster Challenge Rating (the count and CR for each group of monsters labeled in the  format of "Monster (10) - 10 CR"), and Tactics (how to play the encounter). Bold the labels. Do not add any html tags to this field other than bullets and bolding.`;
        strPromptEncounter += `\n- PREPREWARDS: Bulleted list of treasure, items, experience points, or other rewards that are specifically related to the encounter. This could be treasure found due to the encounter or carried by the monsters. If there are no rewards, put "none". Bold the keywords. Do not add any html tags to this field other than bullets and bolding.`;
        if (blnAddRewards) {
            if (inputXP) {
                strPromptEncounter += ` Set the XP for this level to ` + inputXP + `".`;
            }
            if (inputNarrativeRewardDetails) {
                strPromptEncounter += ` Base the treasure and reward on these details: ` + inputNarrativeRewardDetails + `".`;
            }
        } else {
            strPromptEncounter += `\n- PREPREWARDS: Set to "None". There are no rewards in this scene. Do not add any narration in any other area that suggests rewards.`;
        }
        strPromptEncounter += `\n- PREPSETUP: Bulleted list of the Synopsis of the encounter for the GM. Include Key Moments in the encounter and anything they should know to run the encounter well. Bold the keywords. Do not add any html tags to this field other than bullets and bolding.`;
        strPromptNarration += `\n- CARDTITLE: This will be the title of the encounter card that will be shared with the players. Do not use "` + inputSceneTitle + `" as the title of CARDTITLE, and do not include any numbers. It should be a more interesting version of the scene title. Keep it under 5 words long. Do not add any html tags to this field.`;
        strPromptEncounter += `\n- CARDDESCRIPTIONPRIMARY: A player shareable version of the encounter with things they can know that will be on their narration card. Describe what they see or hear about the monster with their passive skills (i.e. without a nature check). Make it 5 to 8 sentences. Do not add any html tags to this field.`;
        strPromptEncounter += `\n- CARDIMAGETITLE: The title of the card image. Make it specific to the main monster or monsters in the encounter. keep it under 5 words long. Do not add any html tags to this field.`;
        strPromptEncounter += `\n- CARDDESCRIPTIONSECONDARY: This is additional encounter narration that will be on the narration card shared with the players. Keep it to 3 to 5  sentences. Do not add any html tags to this field.`;
        if (blnGenerateDialogue) {
            strPromptEncounter += `\n- CARDDIALOGUE: Add dialog or sounds here. Each line dialogue needs to be wrapped in an h6 html tag. Append the name of the person or the type of monster speaking to the beginning of the narration. Surround the name with a bold tag. Surround the dialogue in quotes. The format looks like this: <h6><b>Goblin</b>I will get you</h6>. Do not put a colon after the speaker. Do not add any html tags to this field othet that what was called out.`;
        } else {
            strPromptEncounter += `\n- CARDDIALOGUE: There is no dialogue in this encounter. Set to " ". Do not add any html tags to this field.`;
        }
        strPromptEncounter += `\n- CONTEXTADDITIONALNARRATION: Bulleted list of additional narration that the GM may share verbally with the party that answers questions they may have about the encounter. This narration adds details to the encounter shared on the card and for the encounter. Notes that relate this encounter to other scenes or contained in the additional context "${inputNarrativeDetails || ''}" are helpful. Try to have 10 to 20 bullet points. Bold the keywords. Do not add any html tags to this field other than bullets and bolding.`;
        strPromptEncounter += `\n- CONTEXTATMOSPHERE: Bulleted list of details about the labels sight, sounds, and smells, and whatever else makes sense for the encounter. Make these details specific to the environment of the monster and do not mention the room or area around the monster. Break things down formatted as "label: content". Bold the labels that start the bullet points. Try to be descriptive. Do not add any html tags to this field other than bullets and bolding.`;
        strPromptEncounter += `\n- CONTEXTGMNOTES: Bulleted list of context or strategies the GM might want to share with the party or need to run the encounter. Include details about the difficulty of the encounter from above. Add tactics for the monsters in the encounter and how to play them.

        For each monster type in the encounter, add an all-caps label wrapped in an h5 tag point that says "Monster: Monster Name (CR X)" where you insert the monster name and CR. Under it add the bolded title with the labels "GM Notes", "Stats and Skills", and "Special Abilities".

        Under "Monster Details" add a bullet labeled "Appearance and Behavior" and then sub-bullets with the details about the Appearance and Behavior of the monster. Add another bullet labeled "Tactics" and then sub-bullets with the details that describes the tactics for running the monster. Add another bullet labeled "Morale" and then sub-bullets with the details that describes the mindset and morale of the monster. Add a bullet point labeled "How it Relates" and add details that describe how this encounter relates to other encounters or narratives in the campaign connecting this encounter to other narratives you've created. Try to have 3 to 5 of these.

        Under "Abilities and Weaknesses" add a bullet labeled "Abilities" and then sub-bullets with details about monster's special abilities and powers (e.g. Lifedrain, etc). Add a bullet point labeled "Resistances and Immunities" and then sub-bullets with the details that describes the monster's resistances and immunities. Add a bullet labeled "Weaknesses and Vulnerabilities" and then sub-bullets with the details about the weaknesses and vulnerabilities of the monster.

        Under "Stats and Skills" add a bullet labeled "Hit Points" and then sub-bullets with the details about the monster's hit points. Add a bullet labeled "Armor Class" and then the monster's armor class. Add a bullet labeled "Speed" and then the monster's speed. Add a bullet labeled "STR" and then the monster's strength. Add a bullet labeled "DEX" and then the monster's dexterity. Add a bullet labeled "CON" and then the monster's constitution. Add a bullet labeled "INT" and then the monster's intelligence. Add a bullet labeled "WIS" and then the monster's wisdom. Add a bullet labeled "CHA" and then the monster's charisma.

        Bold the keywords and labels. Do not add any html tags to this field other than bullets and bolding.`;

        // Be mindful of including these required details and notes as appropriate for all of the above sections
        if (inputNarrativeDetails) {
            strPromptEncounter += `\n\nBe mindful of including these required details and notes as appropriate for all of the above sections: "${inputNarrativeDetails}". This is the additional context that will help you write the narrative.`;
        }
        strPromptEncounter += `\n- You will  take the above context and deliver it in the form JSON against this template replacing the all-caps words in the JSON that match the all-caps words above with the content you generated. All of the content should be plain text unless you were told to build a bulleted list, in which case you should generate the html in the form of <ul><li>content</li></ul>. Do not add a period to the end of any content you generate with HTML. Make sure you don't have double-periods in the content. When generating the text for the JSON, make sure it is JSON-friendly and escape html elements if needed. If you use quote marks in the html,  escape the quote marks so they do not break the json. Do not add any html tags unless you were told to do so. Here is the JSON template you should use:`;
        strPromptEncounter += `\n{`;
        strPromptEncounter += `\n"journaltype": "JOURNALTYPE",
            \n"foldername": "FOLDERNAME",
            \n"sceneparent": "SCENEPARENT",
            \n"scenearea": "SCENEAREA",
            \n"sceneenvironment": "ENVIRONMENT",
            \n"scenelocation": "LOCATION",
            \n"scenetitle": "SCENETITLE",
            \n"prepencounter": "PREPENCOUNTER",
            \n"prepencounterdetails": "PREPENCOUNTERDETAILS",
            \n"preprewards": "PREPREWARDS",
            \n"prepsetup": "PREPSETUP",
            \n"contextintro": "INTRO",
            \n"cardtitle": "CARDTITLE",
            \n"carddescriptionprimary": "CARDDESCRIPTIONPRIMARY",
            \n"cardimagetitle": "CARDIMAGETITLE",
            \n"cardimage": "CARDIMAGE",
            \n"carddescriptionsecondary": "CARDDESCRIPTIONSECONDARY",
            \n"carddialogue": "CARDDIALOGUE",
            \n"contextadditionalnarration": "CONTEXTADDITIONALNARRATION",
            \n"contextatmosphere": "CONTEXTATMOSPHERE",
            \n"contextgmnotes": "CONTEXTGMNOTES"`;
        strPromptEncounter += `\n}`;

        // --------------------------------------------------------------
        // -- GENERATE NARRATION JSON
        // -- USE ON: Narrative
        // --------------------------------------------------------------

        strPromptNarration = `You are a masterful D&D5E DM crafting an immersive narrative scene for "${strCampaignName}". Create vivid, detailed descriptions that engage players' imaginations. Your narrative should:
        - Use rich, atmospheric language
        - Include specific sensory details
        - Connect to the broader campaign story
        - Bold all important keywords and labels in bullet lists
        - Format bullet lists as <ul><li>content</li></ul>
        - ALWAYS generate a scene title if one is not provided
        - Never leave required fields empty (especially scene title)

        Generate content for these fields, maintaining D&D5E authenticity:`;

        // Core scene information
        strPromptNarration += `
        - JOURNALTYPE: "Narrative"
        - FOLDERNAME: "${inputFolderName || ''}"
        - SCENEPARENT: "${inputSceneParent || ''}"
        - SCENEAREA: "${inputSceneArea || ''}"
        - ENVIRONMENT: "${inputEnvironment || ''}"
        - LOCATION: "${inputLocation || ''}"
        - SCENETITLE: ${inputSceneTitle ? `"${inputSceneTitle}"` : "Generate an evocative scene title (required, 3-5 words)"}`; // Modified this line

        // Card image handling
        if (optionCardImage === "custom") {
            strPromptNarration += `\n- CARDIMAGE: "${inputCardImage || ''}"`;
        } else if (optionCardImage === "none") {
            strPromptNarration += `\n- CARDIMAGE: ""`;
        } else {
            strPromptNarration += `\n- CARDIMAGE: "${optionCardImage || ''}"`;
        }

        // Scene details with emphasis on rich description
        strPromptNarration += `
        - SCENETITLE: "${inputSceneTitle || ''}" (compelling, under 5 words)
        - INTRO: Create an evocative GM overview that sets the scene's mood and importance (1-2 sentences)`;

        // Encounter information with tactical depth
        if (blnAddEncounter) {
            if (inputNarrativeEncounterDetails) {
                strPromptNarration += `\n- Take this into account when generating the encounter: ` + inputNarrativeEncounterDetails + `.`;
            }

            // Get monsters from the worksheet first
            const worksheetMonsters = getWorksheetMonsters(id);
            const worksheetMonstersList = worksheetMonsters.map(m => `${m.actorName} (CR ${m.cr})`).join(', ');

            if (inputNarrativeEncounterMonsters) {
                if (blnSpecificEncounterMonsters) {
                    // Only use the specified monsters
                    strPromptNarration += `
                - PREPENCOUNTER: Use exactly these monsters in the encounter (no others): ${inputNarrativeEncounterMonsters}${worksheetMonsters.length ? ` and these monsters from the worksheet: ${worksheetMonstersList}` : ''}. Do not add any html tags to this field.`;
                } else {
                    // Include these monsters but can add others
                    if (targetCRValue > 0) {
                        strPromptNarration += `
                - PREPENCOUNTER: Create a tactically interesting encounter (comma-separated list)
                  • Target CR: ${targetCRValue}, Difficulty: ${targetRating}
                  • Max 10 total monsters, max 5 per type
                  • MUST include these specific monsters: ${inputNarrativeEncounterMonsters}${worksheetMonsters.length ? `, and these monsters from the worksheet: ${worksheetMonstersList}` : ''}
                  • Can add additional official D&D5E monsters that fit the environment
                  • Consider monster synergies and tactical roles`;
                    } else {
                        strPromptNarration += `
                - PREPENCOUNTER: Select thematically appropriate monsters (comma-separated list)
                  • MUST include these specific monsters: ${inputNarrativeEncounterMonsters}${worksheetMonsters.length ? `, and these monsters from the worksheet: ${worksheetMonstersList}` : ''}
                  • Can add additional official D&D5E monster names in singular form
                  • Choose additional creatures that create interesting tactical situations`;
                    }
                }
            } else if (worksheetMonsters.length > 0) {
                // No specific monsters provided but we have worksheet monsters
                if (targetCRValue > 0) {
                    strPromptNarration += `
                - PREPENCOUNTER: Create a tactically interesting encounter (comma-separated list)
                  • Target CR: ${targetCRValue}, Difficulty: ${targetRating}
                  • Max 10 total monsters, max 5 per type
                  • MUST include these monsters from the worksheet: ${worksheetMonstersList}
                  • Can add additional official D&D5E monsters that fit the environment
                  • Consider monster synergies and tactical roles`;
                } else {
                    strPromptNarration += `
                - PREPENCOUNTER: Select thematically appropriate monsters (comma-separated list)
                  • MUST include these monsters from the worksheet: ${worksheetMonstersList}
                  • Can add additional official D&D5E monster names in singular form
                  • Choose additional creatures that create interesting tactical situations`;
                }
            } else {
                // No specific monsters or worksheet monsters
                if (targetCRValue > 0) {
                    strPromptNarration += `
                - PREPENCOUNTER: Create a tactically interesting encounter (comma-separated list)
                  • Target CR: ${targetCRValue}, Difficulty: ${targetRating}
                  • Max 10 total monsters, max 5 per type
                  • Use official D&D5E monsters that fit the environment
                  • Consider monster synergies and tactical roles`;
                } else {
                    strPromptNarration += `
                - PREPENCOUNTER: Select thematically appropriate monsters (comma-separated list)
                  • Use official D&D5E monster names in singular form
                  • Choose creatures that create interesting tactical situations`;
                }
            }
        } else {
            strPromptNarration += `\n- PREPENCOUNTER: ""`;
            strPromptNarration += `\n- PREPENCOUNTERDETAILS: ""`;
        }

        // Rewards with narrative significance
        if (blnAddRewards) {
            strPromptNarration += `
        - PREPREWARDS: Create meaningful rewards:
          • XP: ${inputXP || 'Standard for level'}
          • Treasure: ${inputNarrativeRewardDetails || 'Thematically appropriate'}
          • Consider story significance and future use`;
        } else {
            strPromptNarration += `\n- PREPREWARDS: ""`;
        }

        // Rich narrative elements
        strPromptNarration += `
        - PREPSETUP: Create an engaging bullet list with:
          • **Synopsis**: Core narrative elements
          • **Key Moments**: Dramatic points and revelations
          • **GM Guidance**: Running the scene effectively

        - CARDTITLE: "${inputSceneTitle ? 'Evocative scene title based on ' + inputSceneTitle : ''}"
        - CARDDESCRIPTIONPRIMARY: Vivid player narrative (5-8 sentences)
        - CARDIMAGETITLE: "${optionCardImage === "none" ? '' : 'Atmospheric title'}"
        - CARDDESCRIPTIONSECONDARY: Detailed scene expansion (3-5 sentences)
        - CARDDIALOGUE: ${blnGenerateDialogue ? 'Create impactful character dialogue using <h6><b>Speaker</b>"Dialogue"</h6>' : '""'}

        - CONTEXTADDITIONALNARRATION: Create 10-20 detailed bullet points:
          • **Bold** key terms and concepts
          • Include connections to broader narrative
          • Reference provided context: "${inputNarrativeDetails || ''}"

        - CONTEXTATMOSPHERE: Create immersive environmental details:
          • **Sight/Sound/Smell**: Specific sensory details
          • **Dimensions**: Physical space descriptions
          • **Atmosphere**: Mood and ambiance elements

        - CONTEXTGMNOTES: Create 7-10 tactical and narrative points:
          • **Bold** important terms
          • Include encounter difficulty and tactics
          • Connect to other narrative elements`;

        // In the narrative prompt construction section, add:
        strPromptNarration += `\n- LINKEDENCOUNTERS: Add a section for linked encounters:`;

        // Get encounters data from the hidden input
        const encountersInput = form.querySelector('#input-encounters-data');
        if (encountersInput && encountersInput.value) {
            try {
                const encountersData = JSON.parse(encountersInput.value);
                if (encountersData.length > 0) {
                    strPromptNarration += `\nInclude these encounters in the narrative:`;
                    encountersData.forEach(encounter => {
                        strPromptNarration += `\n- ${encounter.name}:`;
                        strPromptNarration += `\n  UUID: ${encounter.uuid || ""}`;
                        strPromptNarration += `\n  Synopsis: ${encounter.synopsis || "No synopsis available"}`;
                        
                        if (encounter.keyMoments && encounter.keyMoments.length > 0) {
                            strPromptNarration += `\n  Key Moments:`;
                            encounter.keyMoments.forEach(moment => {
                                strPromptNarration += `\n    • ${moment}`;
                            });
                        } else {
                            strPromptNarration += `\n  Key Moments:\n    • No key moments specified`;
                        }
                    });
                    
                    // Add explicit instructions for the JSON format
                    strPromptNarration += `\n\nIMPORTANT: Make sure to include ALL linked encounters in your JSON response. The linkedEncounters array MUST include all encounters listed above, with proper uuid, name, synopsis, and keyMoments fields for each encounter. DO NOT omit any fields.`;
                }
            } catch (e) {
                postConsoleAndNotification('Error parsing encounters data:', e, false, false, true);
            }
        }

        // Update the JSON template to include linkedEncounters with explicit instructions
        strPromptNarration += `\n\nProvide the response in this JSON format:
        {
            "journaltype": "JOURNALTYPE",
            "foldername": "FOLDERNAME",
            "sceneparent": "SCENEPARENT",
            "scenearea": "SCENEAREA",
            "sceneenvironment": "ENVIRONMENT",
            "scenelocation": "LOCATION",
            "scenetitle": "SCENETITLE",
            "prepencounter": "PREPENCOUNTER",
            "prepencounterdetails": "PREPENCOUNTERDETAILS",
            "preprewards": "PREPREWARDS",
            "prepsetup": "PREPSETUP",
            "contextintro": "INTRO",
            "cardtitle": "CARDTITLE",
            "carddescriptionprimary": "CARDDESCRIPTIONPRIMARY",
            "cardimagetitle": "CARDIMAGETITLE",
            "cardimage": "${optionCardImage || inputCardImage || 'icons/svg/book.svg'}",
            "carddescriptionsecondary": "CARDDESCRIPTIONSECONDARY",
            "carddialogue": "CARDDIALOGUE",
            "contextadditionalnarration": "CONTEXTADDITIONALNARRATION",
            "contextatmosphere": "CONTEXTATMOSPHERE",
            "contextgmnotes": "CONTEXTGMNOTES",
            "linkedEncounters": [`;
            
        // Add any actual encounter data to the JSON template if available
        const encountersData = encountersInput && encountersInput.value ? JSON.parse(encountersInput.value || '[]') : [];
        if (encountersData.length > 0) {
            encountersData.forEach((encounter, index) => {
                strPromptNarration += `
                {
                    "uuid": "${encounter.uuid || ''}",
                    "name": "${encounter.name || ''}",
                    "synopsis": "${(encounter.synopsis || 'No synopsis available').replace(/"/g, '\\"')}",
                    "keyMoments": [`;
                
                if (encounter.keyMoments && encounter.keyMoments.length > 0) {
                    encounter.keyMoments.forEach((moment, mIndex) => {
                        strPromptNarration += `"${moment.replace(/"/g, '\\"')}"${mIndex < encounter.keyMoments.length - 1 ? ', ' : ''}`;
                    });
                } else {
                    strPromptNarration += `"No key moments specified"`;
                }
                
                strPromptNarration += `]
                }${index < encountersData.length - 1 ? ',' : ''}`;
            });
        } else {
            // Template with placeholders
            strPromptNarration += `
                {
                    "uuid": "JOURNAL_UUID",
                    "name": "ENCOUNTER_NAME",
                    "synopsis": "ENCOUNTER_SYNOPSIS",
                    "keyMoments": ["MOMENT1", "MOMENT2", ...]
                }`;
        }
        
        strPromptNarration += `
            ]
        }`;

        // ==============================================================
        // == FINALIZE THE PROMPTS
        // ==============================================================

        // --------------------------------------------------------------
        // -- GENERATE FINAL PROMPTs
        // -- USE ON: All Workspaces
        // --------------------------------------------------------------
        
        // Procedure to build the table rows
        const addTableRow = (label, value) => {
            if (value || value === true) {
                return `<tr><td><b>${label}:</b></td><td>${value}</td></tr>`;
            } else {
                // If there is only a label, span both columns
                return `<tr><td colspan="2"><b>${label}:</b></td></tr>`;
            }
        };

        // If they added something to the input, use it.
        if (inputMessage){
            // Normal Question
            postConsoleAndNotification("Using Input Message, ignoring workspace: ", inputMessage, false, true, false);
            // Prompt
            strFinalPrompt += inputMessage + `\n\n`;
            // GM Context
            strGmContext += addTableRow('<b>QUESTION</b>', null);
            strGmContext += addTableRow('Asked', inputMessage);
            strGMSimpleContext = `<b>Question:</b> "` + inputMessage + `"`;
            // Player Context
            strPlayerContext += addTableRow('<b>QUESTION</b>', null);
            strPlayerContext += addTableRow('Asked', inputMessage);
            strPlayerSimpleContext = `<b>Question:</b> "` + inputMessage + `"`;
        } else {
            // Process the workspace options if they are set.
            if (isWorkspaceSet) {
                switch(this.workspaceId) {
                    case "encounter":
                        // ENCOUNTER
                        // Prompt
                        postConsoleAndNotification("SWITCH: Encounter", "", false, true, false);
                        strFinalPrompt += strPromtGMMindset + "\n\n" + strPromptEncounter;
                        // GM Context
                        strGmContext += addTableRow('<b>GENERAL</b>', null);
                        strGmContext += addTableRow('Workspace', this.workspaceId);
                        strGmContext += addTableRow('<b>ENCOUNTER</b>', null);
                        strGmContext += addTableRow('Folder Name', inputFolderName);
                        strGmContext += addTableRow('Scene Title', inputSceneTitle);
                        strGmContext += addTableRow('Card Image Type', optionCardImage);
                        strGmContext += addTableRow('Card Image Path', inputCardImage);
                        strGmContext += addTableRow('Location', inputLocation);
                        strGmContext += addTableRow('Scene Parent', inputSceneParent);
                        strGmContext += addTableRow('Scene Area', inputSceneArea);
                        strGmContext += addTableRow('Environment', inputEnvironment);
                        strGmContext += addTableRow('Prep Title', inputPrepTitle);
                        strGmContext += addTableRow('Prep Description', inputPrepDescription);
                        strGmContext += addTableRow('Prep Details', inputPrepDetails);
                        
                        // Simple context for encounter
                        strGMSimpleContext = `<p><b>Generating encounter</b> for "${inputSceneTitle || 'unnamed encounter'}"`;
                        if (inputLocation) strGMSimpleContext += ` in ${inputLocation}`;
                        if (inputEnvironment) strGMSimpleContext += ` (${inputEnvironment})`;
                        strGMSimpleContext += `.</p>`;
                        
                        // Player simple context
                        strPlayerSimpleContext = strGMSimpleContext;
                        break;
                    case "narrative":
                        // NARRATIVE
                        // Prompt
                        postConsoleAndNotification("SWITCH: Narrative", "", false, true, false);
                        strFinalPrompt += strPromtGMMindset + "\n\n" + strPromptNarration;
                        // GM Context
                        strGmContext += addTableRow('<b>GENERAL</b>', null);
                        strGmContext += addTableRow('Workspace', this.workspaceId);
                        strGmContext += addTableRow('<b>NARRATIVE</b>', null);
                        strGmContext += addTableRow('Folder Name', inputFolderName);
                        strGmContext += addTableRow('Scene Title', inputSceneTitle);
                        strGmContext += addTableRow('Card Image Type', optionCardImage);
                        strGmContext += addTableRow('Card Image Path', inputCardImage);
                        strGmContext += addTableRow('Location', inputLocation);
                        strGmContext += addTableRow('Scene Parent', inputSceneParent);
                        strGmContext += addTableRow('Scene Area', inputSceneArea);
                        strGmContext += addTableRow('Environment', inputEnvironment);
                        strGmContext += addTableRow('Prep Title', inputPrepTitle);
                        strGmContext += addTableRow('Prep Description', inputPrepDescription);
                        strGmContext += addTableRow('Prep Details', inputPrepDetails);

                        // Simple context for narrative
                        strGMSimpleContext = `<p><b>Generating narrative</b> for "${inputSceneTitle || 'unnamed scene'}"`;
                        if (inputLocation) strGMSimpleContext += ` in ${inputLocation}`;
                        if (inputEnvironment) strGMSimpleContext += ` (${inputEnvironment})`;
                        strGMSimpleContext += `.</p>`;
                        
                        // Player simple context
                        strPlayerSimpleContext = strGMSimpleContext;
                        break;
                    case "lookup":
                        // LOOKUP
                        // Prompt
                        postConsoleAndNotification("SWITCH: lookup", "", false, true, false);
                        strPromtGMMindset = strPromtGMMindset + "\n\nYou going to provide context about features, spells, rules, actions or other details for the players. Use the data that follows to answer the question being clear and instructional.";
                        strFinalPrompt += strPromtGMMindset + "\n\n" + strPromtFeatures;
                        // GM Context
                        strGmContext += addTableRow('<b>GENERAL</b>', null);
                        strGmContext += addTableRow('Workspace', this.workspaceId);
                        strGmContext += addTableRow('<b>SRD LOOKUP</b>', null);
                        strGmContext += addTableRow('Feature', optionFeatures);
                        strGmContext += addTableRow('Details', inputFeaturesDetails);
                        strGmContext += addTableRow('Rules', blnMechanicsExplain);
                        strGmContext += addTableRow('Tutorial', blnMechanicsHowTo);
                        // Player Context
                        strPlayerContext += addTableRow('<b>SRD LOOKUP</b>', null);
                        strPlayerContext += addTableRow('Feature', optionFeatures);
                        strPlayerContext += addTableRow('Details', inputFeaturesDetails);
                        strPlayerContext += addTableRow('Rules', blnMechanicsExplain);
                        strPlayerContext += addTableRow('Tutorial', blnMechanicsHowTo);
                        
                        // Simple context for lookup
                        strGMSimpleContext = `<p><b>Looking up:</b> ${optionFeatures || 'SRD information'}`;
                        if (inputFeaturesDetails) strGMSimpleContext += ` - ${inputFeaturesDetails}`;
                        strGMSimpleContext += `.</p>`;
                        
                        // Player simple context
                        strPlayerSimpleContext = strGMSimpleContext;
                        break;
                    case "assistant":
                        // SKILL CHECK
                        // Prompt
                        postConsoleAndNotification("SWITCH: assistant", "", false, true, false);
                        strPromtGMMindset = strPromtGMMindset + "\n\nYou are generating descriptions and details for the GM and Players, as is applicable. You will provide a detailed response to the question being asked. You will include details, stats, and other information as needed.";
                        strFinalPrompt += strPromtGMMindset;
                        strFinalPrompt += "\n\n" + strPromptSkillCheck; // Skill Check
                        strFinalPrompt += "\n\n" + strPromtDescription; // Description of the Monster, NPC, Item, Location, etc.
                        strFinalPrompt += "\n\n" + strPromtOtherInformation; // Additional Information of the Monster, NPC, Item, Location, etc.
                        strFinalPrompt += "\n\n" + strPromtStats; // Stats of the Monster, NPC, Item, Location, etc.
                        strFinalPrompt += "\n\n" + strPromtBackstory; // Backstory of the Monster, NPC, Item, Location, etc.
                        strFinalPrompt += "\n\n" + strPromtGMDetails; //The GM Details prompts
                        // GM Context
                        strGmContext += addTableRow('<b>GENERAL</b>', null);
                        strGmContext += addTableRow('Workspace', this.workspaceId);
                        strGmContext += addTableRow('<b>SKILL CHECK</b>', null);
                        strGmContext += addTableRow('Roll Skill', blnSkillRoll);
                        strGmContext += addTableRow('Skill', optionSkill);
                        strGmContext += addTableRow('Dice Type', optionDiceType);
                        strGmContext += addTableRow('Dice Value', inputDiceValue);
                        strGmContext += addTableRow('Lookup Type', optionType);
                        strGmContext += addTableRow('Name', inputContextName);
                        strGmContext += addTableRow('Additional Details', inputContextDetails);
                        strGmContext += addTableRow('Description', blnGenerateDescription);
                        strGmContext += addTableRow('Details', blnGenerateDetails);
                        strGmContext += addTableRow('Stats', blnGenerateStats);
                        strGmContext += addTableRow('Backstory', blnGenerateBackstory);
                        strGmContext += addTableRow('GM Details', blnGMDetails);
                        strGmContext += addTableRow('Rules', blnMechanicsExplain);
                        strGmContext += addTableRow('Tutorial', blnMechanicsHowTo);
                        // Player Context
                        // none for the player
                        
                        // Simple context for assistant/skill check
                        let skillRollText = '';
                        if (blnSkillRoll && optionSkill && inputDiceValue) {
                            skillRollText = ` with ${optionSkill} check (${inputDiceValue})`;
                        }
                        
                        strGMSimpleContext = `<p><b>Knowledge check</b>`;
                        if (optionType) strGMSimpleContext += ` about ${optionType}`;
                        if (inputContextName) strGMSimpleContext += ` "${inputContextName}"`;
                        strGMSimpleContext += skillRollText;
                        if (blnGenerateDescription) strGMSimpleContext += `, including descriptions`;
                        if (blnGenerateDetails) strGMSimpleContext += `, including details`;
                        if (blnGenerateStats) strGMSimpleContext += `, including stats`;
                        if (blnGenerateBackstory) strGMSimpleContext += `, including backstory`;
                        strGMSimpleContext += `.</p>`;
                        
                        // Player simple context - same as GM but without GM-specific details
                        strPlayerSimpleContext = `<p><b>Knowledge check</b>`;
                        if (optionType) strPlayerSimpleContext += ` about ${optionType}`;
                        if (inputContextName) strPlayerSimpleContext += ` "${inputContextName}"`;
                        strPlayerSimpleContext += skillRollText;
                        if (blnGenerateDescription) strPlayerSimpleContext += `, including descriptions`;
                        if (blnGenerateDetails) strPlayerSimpleContext += `, including details`;
                        strPlayerSimpleContext += `.</p>`;
                        break;
                    case "character":
                        // CHARACTER GUIDANCE
                        const expertDMPrompt = `You are a seasoned Dungeon Master and D&D character optimization expert. Review the guidance I'm requesting (provided below), along with my full character details, and offer thoughtful, strategic advice tailored to my needs.

Consider both mechanical effectiveness and narrative potential. When responding, prioritize:

- Context-aware spell preparation and usage, including what spells to prepare and why, based on the scenario I describe.
- Weapon and equipment recommendations suited to different types of encounters.
- Identification of any weaknesses or inefficiencies in my build, along with suggestions for improvement.
- Advice on tactical roles I should play in combat (e.g. tank, support, controller), with explanations based on my class, stats, and abilities.
- Optional: Provide roleplay or character-driven ideas that align with the scenario and my background or subclass.

Please go beyond listing spells or stats—offer strategic reasoning, trade-offs, and alternative approaches. Ask clarifying questions if needed.

Please format the response using h4 tags for headings, bolding keywords, lists where appropriate, and basic tables when neeeded. 

Break the output into a minimum of these sections using h4 headings: Guidance Overview, Combat Readiness, Roleplay Strategies, Build Optimization Suggestions, any other sections as needed and end with Quick Reference Summary as a bulleted list or table.`;
                        
                        // Build the prompt using the form data we collected earlier
                        strFinalPrompt = `${expertDMPrompt}\n\nCharacter Details:\n${inputCharacterData}\n\nGuidance Requested:\n${inputCharacterGuidance}`;
                        
                        // Add character guidance simple context
                        strGMSimpleContext = `<p><b>Generating character guidance</b>`;
                        if (inputContextName) strGMSimpleContext += ` for "${inputContextName}"`;
                        if (blnGenerateDescription) strGMSimpleContext += `, with description`;
                        if (blnGenerateDetails) strGMSimpleContext += `, with details`;
                        if (blnGenerateBackstory) strGMSimpleContext += `, with backstory`;
                        strGMSimpleContext += `.</p>`;
                        
                        // Player simple context
                        strPlayerSimpleContext = strGMSimpleContext;
                        break;
                    default:
                        // override the top gm prompt with a random fact.   
                        strFinalPrompt += "Share a random dungeons and dragon fact.";
                        
                        // Default simple context
                        strGMSimpleContext = `<p><b>Processing request</b> in ${this.workspaceId} workspace.</p>`;
                        strPlayerSimpleContext = strGMSimpleContext;
                }
            }
        }   
        // --- Final GM Context ---
        strGmContext = "<h4><b>Aggregated Data GM Report</b></h4><table>" + strGmContext + "</table>";
        // --- Final Player Context ---
        strPlayerContext = "<h4><b>Player Request Report</b></h4><table>" + strPlayerContext + "</table>";

  
        // Set Context
        if (game.user.isGM) {
            // They are a GM
            // Show table or simple?
            if (blnShowTable) {
                strFinalContext += strGmContext;
            } else {
                strFinalContext += strGMSimpleContext;
            }

            if (blnShowPrompt) {
                strFinalContext = strFinalContext + "<p><b>Generated Prompt for AI:</b> " + strFinalPrompt + "</p>";

            }
        } else {
            // They are a player
            if (blnShowTable) {
                strFinalContext += strPlayerContext;
            } else {
                strFinalContext += strPlayerSimpleContext;
            }
        }


        //postConsoleAndNotification("BLACKSMITH strFinalContext", strFinalContext, false, true, false);
        //postConsoleAndNotification("BLACKSMITH strFinalPrompt", strFinalPrompt, false, true, false);



        // ==============================================================
        // == PROCESS THE PROMPTS
        // ==============================================================

        // Need to nail down and simplify the responses.
        // we need to add back reflecting what they want unless they want more context (usually the GM)
        // we need to nail now that we are only sending what we need to send.


        // Process so long as they have entered text in a workspace or the input.
        if (inputMessage || isWorkspaceSet) {
            // Only clear the inputs
            this.messages.push(strFinalPrompt);
           //postConsoleAndNotification("CLEAR FORMS: blnClearForm", blnClearForm, false, true, false);
           const inputs = form.querySelectorAll('input, textarea, select');

            // Clear all input elements in the form except 'enterSubmits'
            const blnClearForm = form.querySelector('#blnClearForm')?.checked ?? false;
            clearFormInputs(form, blnClearForm);

            

            // Set focus back to the input box
            form.querySelector('textarea[name="blacksmith-input-message"]').focus();

            if (this.onFormSubmit) {

                // Pass the message to the callback
                // This sends the data to ChatGPT via buildQueryCard in blacksmith.js
                postConsoleAndNotification("BLACKSMITH Submitting to ChatGPT: strFinalPrompt", strFinalPrompt, false, true, false);
                await this.onFormSubmit(strFinalPrompt, strFinalContext);

                // Hide the divs with the class "blacksmith-processing"
                let processingDivs = document.querySelectorAll('.blacksmith-processing');
                processingDivs.forEach(function(element) {
                    element.style.display = 'none';
                });
                
                // Check if the user is  a GM
                // et the GM know that the user is using the Regent to generate a prompt.
                if (!game.user.isGM) {
                    postConsoleAndNotification("Someone is using the Regent to generate a prompt.", "", false, true, false);
                    // Whisper the final prompt to the GM
                    const gmUsers = game.users.filter(user => user.isGM);
                    for (const gmUser of gmUsers) {
                        await ChatMessage.create({
                            content: `<div id="blacksmith-message-header" class="blacksmith-message-header-answer">
                                        <i class="fas fa-crystal-ball"></i>
                                        <span class="blacksmith-message-speaker">
                                            Regent Report
                                        </span>
                                    </div>
                                    <div id="blacksmith-message-content" data-message-id="">
                                        <h4>Player Using Regent</h4>
                                        <p><b>${game.user.name}</b><br></p>
                                        <h4>Input Message</h4>
                                        <p>${inputMessage}<br></p>
                                        <h4>Details</h4>
                                        ${strGmContext}
                                    </div>`,
                            whisper: [gmUser.id],
                            blind: true
                        });
                    }
                }
            }
        } else {
            ui.notifications.error("No content found to send to chat.");
        }
    }
    // send the messag to the output window.
    displayMessage(message) {
        this.element.find('#coffee-pub-blacksmith-output').append(message);
        this._scrollToBottom();
    }

    _scrollToBottom() {
        const output = this.element.find('#coffee-pub-blacksmith-output');
        output.scrollTop(output[0].scrollHeight);
    }

    // Pass Data to the template
    getData(options) {
        // Set data
        const users = game.users.contents;
        const randomuser1 = users[Math.floor(Math.random() * users.length)].name;
        const randomuser2 = users[Math.floor(Math.random() * users.length)].name;
        const title = this.formTitle;
        const user = game.user.name;
        const isGM = game.user.isGM;

        // Cookie helper function
        const getCookieValue = (cookieName) => {
            if (!game.settings.get(MODULE_ID, 'narrativeUseCookies')) return null;
            const cookiePrefix = 'blacksmith_narrative_';
            const name = cookiePrefix + cookieName + "=";
            const decodedCookie = decodeURIComponent(document.cookie);
            const cookieArray = decodedCookie.split(';');
            for(let cookie of cookieArray) {
                cookie = cookie.trim();
                if (cookie.indexOf(name) === 0) {
                    return cookie.substring(name.length, cookie.length);
                }
            }
            return null;
        };

        // Get values with cookie fallbacks
        const strDefaultNarrativeFolder = getCookieValue('folder_name') || 
            game.settings.get(MODULE_ID, 'defaultNarrativeFolder');
        
        const strDefaultJournalPageTitle = getCookieValue('scene_title') || 
            game.settings.get(MODULE_ID, 'defaultJournalPageTitle');
        
        const strDefaultSceneLocation = getCookieValue('location') || 
            game.settings.get(MODULE_ID, 'defaultSceneLocation');
        
        const strDefaultSceneParent = getCookieValue('scene_parent') || 
            game.settings.get(MODULE_ID, 'defaultSceneParent');
        
        const strDefaultSceneArea = getCookieValue('scene_area') || 
            game.settings.get(MODULE_ID, 'defaultSceneArea');
        
        const strDefaultSceneEnvironment = getCookieValue('environment') || 
            game.settings.get(MODULE_ID, 'defaultSceneEnvironment');

        // Get the new settings with cookie fallbacks
        const blnNarrativeUseCookies = game.settings.get(MODULE_ID, 'narrativeUseCookies');
        
        const strNarrativeDefaultCardImage = getCookieValue('card_image') || 
            game.settings.get(MODULE_ID, 'narrativeDefaultCardImage');
        
        const strNarrativeDefaultImagePath = getCookieValue('custom_image_path') || 
            game.settings.get(MODULE_ID, 'narrativeDefaultImagePath');
        
        // Convert string 'true'/'false' from cookie to boolean
        const blnNarrativeDefaultIncludeEncounter = getCookieValue('include_encounter') === 'true' || 
            game.settings.get(MODULE_ID, 'narrativeDefaultIncludeEncounter');
        
        const blnNarrativeDefaultIncludeTreasure = getCookieValue('include_rewards') === 'true' || 
            game.settings.get(MODULE_ID, 'narrativeDefaultIncludeTreasure');
        
        const strNarrativeDefaultXP = getCookieValue('xp') || 
            game.settings.get(MODULE_ID, 'narrativeDefaultXP');
        
        const strNarrativeDefaultTreasureDetails = getCookieValue('reward_details') || 
            game.settings.get(MODULE_ID, 'narrativeDefaultTreasureDetails');
        
        const strNarrativeDefaultEncounterDetails = getCookieValue('encounter_details') || 
            game.settings.get(MODULE_ID, 'narrativeDefaultEncounterDetails');

        // Get the image display name
        const imageSettings = game.settings.settings.get(MODULE_ID + '.narrativeDefaultCardImage');
        const strNarrativeDefaultCardImageName = imageSettings.choices[strNarrativeDefaultCardImage];

        // Return all variables in the data object
        return {
            title: title,
            user: user,
            isGM: isGM,
            randomuser1: randomuser1,
            randomuser2: randomuser2,
            strDefaultNarrativeFolder: strDefaultNarrativeFolder,
            strDefaultJournalPageTitle: strDefaultJournalPageTitle,
            strDefaultSceneLocation: strDefaultSceneLocation,
            strDefaultSceneParent: strDefaultSceneParent,
            strDefaultSceneArea: strDefaultSceneArea,
            strDefaultSceneEnvironment: strDefaultSceneEnvironment,
            blnNarrativeUseCookies: blnNarrativeUseCookies,
            strNarrativeDefaultCardImage: strNarrativeDefaultCardImage,
            strNarrativeDefaultCardImageName: strNarrativeDefaultCardImageName,
            strNarrativeDefaultImagePath: strNarrativeDefaultImagePath,
            blnNarrativeDefaultIncludeEncounter: blnNarrativeDefaultIncludeEncounter,
            blnNarrativeDefaultIncludeTreasure: blnNarrativeDefaultIncludeTreasure,
            strNarrativeDefaultXP: strNarrativeDefaultXP,
            strNarrativeDefaultTreasureDetails: strNarrativeDefaultTreasureDetails,
            strNarrativeDefaultEncounterDetails: strNarrativeDefaultEncounterDetails
        }
    }


    _applyTokenDataToButtons(playerTokens) {
        const levelCounts = {};
        const classCounts = {};

        playerTokens.forEach(token => {
            const actorData = token.actor.system;
            const level = actorData.details?.level || 0;
            const classes = this._getActorClasses(token.actor);

            // Count levels
            levelCounts[level] = (levelCounts[level] || 0) + 1;

            // Count classes
            classes.split(', ').forEach(className => {
                classCounts[className] = (classCounts[className] || 0) + 1;
            });
        });

        // Apply level counts
        Object.entries(levelCounts).forEach(([level, count]) => {
            const levelButton = this.element.find(`.level-button[data-level="${level}"]`);
            if (levelButton.length) {
                // Remove both classes first
                levelButton.removeClass('active auto');
                // Add 'auto' since count matches token count
                levelButton.addClass('auto');
                levelButton.find('.count').text(count).show();

                // Activate the clear button
                const clearButton = levelButton.find('.clear-button');
                if (clearButton.length) {
                    clearButton.show();
                }
            }
        });

        // Apply class counts
        Object.entries(classCounts).forEach(([className, count]) => {
            const classButton = this.element.find(`.class-button[data-class="${className.toLowerCase()}"]`);
            if (classButton.length) {
                // Remove both classes first
                classButton.removeClass('active auto');
                // Add 'auto' since count matches token count
                classButton.addClass('auto');
                classButton.find('.count').text(count).show();

                // Activate the clear button
                const clearButton = classButton.find('.clear-button');
                if (clearButton.length) {
                    clearButton.show();
                }
            }
        });

        // Update Encounter Benchmark info
        const id = this.element.closest('.window-content').data('window-id');
        if (id) {
            // Wrap these calls in a setTimeout to ensure they run after the DOM has updated
            setTimeout(() => {
                if (typeof updateTotalPlayerCounts === 'function') {
                    updateTotalPlayerCounts(id);
                }

                if (typeof updateEncounterDetails === 'function') {
                    updateEncounterDetails(id);
                }
            }, 0);
        }
    }
}


// ================================================================== 
// ===== FUNCTIONS ==================================================
// ================================================================== 

// ************************************
// ** UTILITY NPC Calculations
// ************************************

function calculateNPCCR(actor) {
    // Get actor data
    const actorData = actor.system;
    
    // Calculate Defensive CR
    const hp = foundry.utils.getProperty(actorData, "attributes.hp.value") || 0;
    const ac = foundry.utils.getProperty(actorData, "attributes.ac.value") || 10;
    let defensiveCR = calculateDefensiveCR(hp, ac);
    
    // Calculate Offensive CR
    const spellDC = foundry.utils.getProperty(actorData, "attributes.spelldc") || 0;
    const spells = foundry.utils.getProperty(actorData, "spells") || {};
    const spellLevel = Math.max(...Object.values(spells).map(s => parseInt(foundry.utils.getProperty(s, "value") || 0)));
    let offensiveCR = calculateOffensiveCR(spellDC, spellLevel);
    
    // Calculate final CR
    const finalCR = (defensiveCR + offensiveCR) / 2;
    
    // Format CR
    return formatCR(finalCR);
}

function calculateDefensiveCR(hp, ac) {
    // Simplified CR calculation based on HP and AC
    let cr = 0;
    
    // HP-based CR (very simplified)
    if (hp <= 35) cr = 1/8;
    else if (hp <= 49) cr = 1/4;
    else if (hp <= 70) cr = 1/2;
    else if (hp <= 85) cr = 1;
    else if (hp <= 100) cr = 2;
    
    // Adjust for AC
    if (ac >= 15) cr += 1;
    
    return cr;
}

function calculateOffensiveCR(spellDC, spellLevel) {
    // Simplified CR calculation based on spell DC and level
    let cr = 0;
    
    // Base CR on spell level
    cr = spellLevel;
    
    // Adjust for spell DC
    if (spellDC >= 15) cr += 1;
    
    return cr;
}

function formatCR(cr) {
    // Handle special cases
    if (cr === 0) return "0";
    if (cr > 0 && cr < 0.125) return "1/8";  // Round up very low CRs
    
    // Format standard CR values
    const crValues = {
        0.125: "1/8",
        0.25: "1/4",
        0.5: "1/2"
    };
    
    return crValues[cr] || Math.round(cr).toString();
}


// ************************************
// ** COOKIES Set the Narrative Cookies
// ************************************


function saveNarrativeCookies(id) {
    // Only save if the setting is enabled
    if (!game.settings.get(MODULE_ID, 'narrativeUseCookies')) return;

    const cookiePrefix = 'blacksmith_narrative_';
    const expiryDays = 30; // Cookies will last for 30 days

    // Function to set a cookie with expiration
    const setCookie = (name, value) => {
        const date = new Date();
        date.setTime(date.getTime() + (expiryDays * 24 * 60 * 60 * 1000));
        const expires = `expires=${date.toUTCString()}`;
        document.cookie = `${cookiePrefix}${name}=${value};${expires};path=/`;
    };

    // Save form values to cookies
    setCookie('folder_name', document.querySelector(`#input-FOLDERNAME-${id}`)?.value || '');
    setCookie('scene_title', document.querySelector(`#input-SCENETITLE-${id}`)?.value || '');
    setCookie('card_image', document.querySelector(`#optionCardImage-CARDIMAGE-${id}`)?.value || '');
    setCookie('custom_image_path', document.querySelector(`#input-CARDIMAGE-${id}`)?.value || '');
    setCookie('location', document.querySelector(`#input-LOCATION-${id}`)?.value || '');
    setCookie('scene_parent', document.querySelector(`#input-SCENEPARENT-${id}`)?.value || '');
    setCookie('scene_area', document.querySelector(`#input-SCENEAREA-${id}`)?.value || '');
    setCookie('environment', document.querySelector(`#input-ENVIRONMENT-${id}`)?.value || '');
    setCookie('include_encounter', document.querySelector(`#blnAddEncounter-${id}`)?.checked || false);
    setCookie('include_rewards', document.querySelector(`#blnAddRewards-${id}`)?.checked || false);
    setCookie('xp', document.querySelector(`#input-XP-${id}`)?.value || '');
    setCookie('reward_details', document.querySelector(`#inputNarrativeRewardDetails-${id}`)?.value || '');
    setCookie('encounter_details', document.querySelector(`#inputNarrativeEncounterDetails-${id}`)?.value || '');
}

// ************************************
// ** COOKIES Get the Narrative Cookies
// ************************************
// Add this function to load from cookies
function loadNarrativeCookies(id) {
    // Only load if the setting is enabled
    if (!game.settings.get(MODULE_ID, 'narrativeUseCookies')) return;

    const cookiePrefix = 'blacksmith_narrative_';

    // Function to get a cookie value
    const getCookie = (name) => {
        const cookieName = cookiePrefix + name + "=";
        const cookies = document.cookie.split(';');
        for(let cookie of cookies) {
            cookie = cookie.trim();
            if (cookie.indexOf(cookieName) === 0) {
                return cookie.substring(cookieName.length, cookie.length);
            }
        }
        return "";
    };

    // Load values from cookies if they exist
    const elements = {
        'folder_name': `#input-FOLDERNAME-${id}`,
        'scene_title': `#input-SCENETITLE-${id}`,
        'card_image': `#optionCardImage-CARDIMAGE-${id}`,
        'custom_image_path': `#input-CARDIMAGE-${id}`,
        'location': `#input-LOCATION-${id}`,
        'scene_parent': `#input-SCENEPARENT-${id}`,
        'scene_area': `#input-SCENEAREA-${id}`,
        'environment': `#input-ENVIRONMENT-${id}`,
        'xp': `#input-XP-${id}`,
        'reward_details': `#inputNarrativeRewardDetails-${id}`,
        'encounter_details': `#inputNarrativeEncounterDetails-${id}`
    };

    // Set values for text inputs
    for (const [cookieName, elementId] of Object.entries(elements)) {
        const element = document.querySelector(elementId);
        const cookieValue = getCookie(cookieName);
        if (element && cookieValue) {
            element.value = cookieValue;
        }
    }

    // Handle checkboxes separately
    const includeEncounter = document.querySelector(`#blnAddEncounter-${id}`);
    if (includeEncounter) {
        includeEncounter.checked = getCookie('include_encounter') === 'true';
    }

    const includeRewards = document.querySelector(`#blnAddRewards-${id}`);
    if (includeRewards) {
        includeRewards.checked = getCookie('include_rewards') === 'true';
    }
}

// Function to get monsters from the worksheet
function getWorksheetMonsters(id) {
    const monsterContainer = document.querySelector(`#workspace-section-monsters-content-${id} .monsters-container`);
    if (!monsterContainer) return [];

    const monsterCards = monsterContainer.querySelectorAll('.player-card');
    const monsters = [];

    monsterCards.forEach(card => {
        const name = foundry.utils.getProperty(card.querySelector('.character-name'), "textContent")?.trim();
        const details = foundry.utils.getProperty(card.querySelector('.character-rollup'), "textContent")?.trim();
        const tokenUuid = card.dataset.tokenUuid;
        const actorUuid = card.dataset.actorUuid;
        const actorName = card.dataset.actorName;
        const displayName = card.dataset.displayName;
        
        if (name && details) {
            // Extract CR from details (format: "CR X Type")
            const crMatch = details.match(/CR\s+([0-9/]+)/);
            const cr = crMatch ? crMatch[1] : 'Unknown';
            monsters.push({ 
                name: displayName,           // The display name (e.g., "Bob the Smasher")
                actorName: actorName,        // The underlying actor name (e.g., "Goblin")
                cr,
                tokenUuid,                   // For direct token reference
                actorUuid,                   // For actor reference
                details: details             // Full details string
            });
        }
    });

    return monsters;
}

// Add after other utility functions, before the BlacksmithWindowQuery class
async function addEncounterToNarrative(id, journalEntry, page) {
    const encountersContainer = document.querySelector(`#workspace-section-encounters-${id} .encounters-container`);
    if (!encountersContainer) return;

    // Get existing encounter UUIDs to prevent duplicates
    const existingUUIDs = new Set(Array.from(encountersContainer.querySelectorAll('.player-card'))
        .map(card => card.dataset.pageUuid)
        .filter(uuid => uuid));

    // Check for duplicate
    if (existingUUIDs.has(page.uuid)) {
        ui.notifications.warn("This encounter is already linked to the narrative.");
        return;
    }

    // Parse the content to find Synopsis and Key Moments
    const content = page.text.content;
    
    // Log the content for debugging
    postConsoleAndNotification('BLACKSMITH | Regent: Parsing encounter content for:', page.name, false, true, false);
    
    // First try to find the Summary and Setup section
    const setupMatch = content.match(/<h4>Summary and Setup<\/h4>([\s\S]*?)(?=<h4>|$)/i);
    if (!setupMatch) {
        ui.notifications.warn("This journal page doesn't appear to be an encounter (no Summary and Setup section found).");
        return;
    }

    const setupContent = setupMatch[1];
    postConsoleAndNotification('BLACKSMITH | Regent: Setup content found, length:', setupContent.length, false, true, false);
    
    // Extract synopsis - handle multiple possible patterns
    let synopsis = "";
    // Try different patterns for Synopsis - with colon inside or outside the strong tag
    let synopsisPatterns = [
        /<li><strong>Synopsis:<\/strong>(.*?)<\/li>/i,
        /<li><strong>Synopsis<\/strong>:(.*?)<\/li>/i
    ];
    
    for (const pattern of synopsisPatterns) {
        const match = setupContent.match(pattern);
        if (match && match[1]) {
            synopsis = match[1].trim();
            break;
        }
    }
    postConsoleAndNotification('BLACKSMITH | Regent: Extracted synopsis:', synopsis, false, true, false);
    
    // Extract key moments - handle multiple possible patterns
    let keyMoments = [];
    // Try different patterns for Key Moments - with colon inside or outside the strong tag
    let keyMomentsPatterns = [
        /<li><strong>Key Moments:<\/strong>(.*?)<\/li>/i,
        /<li><strong>Key Moments<\/strong>:(.*?)<\/li>/i
    ];
    
    for (const pattern of keyMomentsPatterns) {
        const match = setupContent.match(pattern);
        if (match && match[1]) {
            // Process the content based on what's there
            const content = match[1].trim();
            
            // If it contains bullet points (• or -), split by those
            if (content.includes('•') || content.includes('- ')) {
                keyMoments = content.split(/•|-/)
                    .map(moment => moment.trim())
                    .filter(moment => moment && moment.length > 3);
            } else {
                // Otherwise split by natural sentence breaks
                keyMoments = content.split(/[\.;,]/)
                    .map(moment => moment.trim())
                    .filter(moment => moment && moment.length > 5);
            }
            break;
        }
    }
    postConsoleAndNotification('BLACKSMITH | Regent: Extracted key moments:', keyMoments, false, true, false);

    // Create the encounter card
    const strName = trimString(page.name, 24);
    const cardHtml = `
        <div class="player-card" data-journal-uuid="${journalEntry.uuid}" data-page-uuid="${page.uuid}" data-page-name="${page.name}" data-type="encounter">
            <img src="${page.src || journalEntry.thumb || 'icons/svg/book.svg'}" alt="${page.name}">
            <div class="player-card-details">
                <div class="character-name">${strName}</div>
                <div class="character-details character-rollup">Encounter</div>
                <div class="character-details character-extra">${synopsis ? `Synopsis: ${trimString(synopsis, 30)}` : 'No synopsis available'}</div>
            </div>
            <button type="button" class="clear-button" onclick="removeCard(event, this, '${id}')">×</button>
        </div>
    `;

    // Add to encounters container
    encountersContainer.insertAdjacentHTML('beforeend', cardHtml);

    // Store the full encounter data in a dataset for use when generating the narrative
    const encounterData = {
        journalUuid: journalEntry.uuid,
        pageUuid: page.uuid,
        name: page.name,
        synopsis: synopsis,
        keyMoments: keyMoments
    };
    
    // Update or create the encounters data in the form
    updateEncountersData(id, encounterData);
}

function updateEncountersData(id, newEncounterData) {
    const form = document.querySelector(`#blacksmith-query-workspace-narrative`);
    if (!form) return;

    // Get or create the hidden input for encounters data
    let encountersInput = form.querySelector('#input-encounters-data');
    if (!encountersInput) {
        encountersInput = document.createElement('input');
        encountersInput.type = 'hidden';
        encountersInput.id = 'input-encounters-data';
        form.appendChild(encountersInput);
    }

    // Get current encounters data
    let encountersData = [];
    try {
        encountersData = JSON.parse(encountersInput.value || '[]');
    } catch (e) {
        encountersData = [];
    }

    // Add new encounter if provided
    if (newEncounterData) {
        // Format the encounter data to match the expected JSON structure
        const formattedEncounter = {
            uuid: newEncounterData.pageUuid,
            name: newEncounterData.name,
            synopsis: newEncounterData.synopsis,
            keyMoments: newEncounterData.keyMoments
        };
        
        // Check for duplicates before adding
        const existingIndex = encountersData.findIndex(e => e.uuid === formattedEncounter.uuid);
        if (existingIndex === -1) {
            encountersData.push(formattedEncounter);
        }
    }

    // Update the input value with the formatted data
    encountersInput.value = JSON.stringify(encountersData);
    
    postConsoleAndNotification('BLACKSMITH | Regent: Updated encounters data:', encountersData, false, true, false);
}

function formatCharacterData(tokenData) {
    if (!tokenData) return "";
    
    let characterText = "";
    
    // Basic Info
    characterText += `\nName: ${tokenData.name}`;
    characterText += `\nRace: ${tokenData.race || '-'}`;
    characterText += `\nClass: ${tokenData.className} (Level ${tokenData.classLevel})`;
    characterText += `\nBackground: ${tokenData.background || '-'}`;
    
    // Biography (if available)
    if (tokenData.biography) {
        characterText += "\n\nBiography:";
        characterText += `\n${tokenData.biography}`;
    }
    
    // Abilities
    characterText += "\n\nAbility Scores:";
    for (const [key, ability] of Object.entries(tokenData.abilities)) {
        characterText += `\n${ability.label}: ${ability.value} (${ability.mod >= 0 ? '+' : ''}${ability.mod})`;
    }
    
    // Skills
    characterText += "\n\nSkills:";
    for (const [key, skill] of Object.entries(tokenData.skills)) {
        characterText += `\n${skill.label} (${skill.ability}): ${skill.total}`;
    }
    
    // Features
    if (tokenData.features && tokenData.features.length > 0) {
        characterText += "\n\nFeatures:";
        tokenData.features.forEach(feature => {
            characterText += `\n${feature.name}`;
        });
    }
    
    // Equipment with descriptions
    if (tokenData.equippedWeapons && tokenData.equippedWeapons.length > 0) {
        characterText += "\n\nEquipped Weapons:";
        tokenData.equippedWeapons.forEach(weapon => {
            characterText += `\n${weapon.name}`;
            if (weapon.damage) characterText += ` (${weapon.damage} damage)`;
            if (weapon.type) characterText += ` - ${weapon.type}`;
            if (weapon.properties) {
                const props = Object.entries(weapon.properties)
                    .filter(([_, value]) => value === true)
                    .map(([key, _]) => key);
                if (props.length > 0) {
                    characterText += ` [${props.join(', ')}]`;
                }
            }
        });
    }
    
    // Spells
    if (tokenData.spells && Object.keys(tokenData.spells).length > 0) {
        characterText += "\n\nSpells:";
        for (const [level, spells] of Object.entries(tokenData.spells)) {
            if (spells.length > 0) {
                characterText += `\nLevel ${level}:`;
                spells.forEach(spell => {
                    characterText += ` ${spell.name},`;
                });
                characterText = characterText.slice(0, -1); // Remove trailing comma
            }
        }
    }
    
    return characterText;
}





