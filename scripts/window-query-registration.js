// ================================================================== 
// ===== WINDOW-QUERY PARTIAL REGISTRATION ==========================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-common.js';

// Function to register all window-query template partials
export async function registerWindowQueryPartials() {
    try {
        postConsoleAndNotification(MODULE.NAME, "Registering window-query partials", "", false, false);
        
        // WORKSPACE TEMPLATES
        const workspaceLookupTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-query-workspace-lookup.hbs').then(response => response.text());
        Handlebars.registerPartial('window-query-workspace-lookup', workspaceLookupTemplate);

        const workspaceCharacterTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-query-workspace-character.hbs').then(response => response.text());
        Handlebars.registerPartial('window-query-workspace-character', workspaceCharacterTemplate);

        const workspaceAssistantTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-query-workspace-assistant.hbs').then(response => response.text());
        Handlebars.registerPartial('window-query-workspace-assistant', workspaceAssistantTemplate);

        const narrativeTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-query-workspace-narrative.hbs').then(response => response.text());
        Handlebars.registerPartial('window-query-workspace-narrative', narrativeTemplate);

        const encounterTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-query-workspace-encounter.hbs').then(response => response.text());
        Handlebars.registerPartial('window-query-workspace-encounter', encounterTemplate);

        // CHARACTER SECTION PARTIALS
        const characterCoreTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-character-core.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-character-core', characterCoreTemplate);

        const characterAbilitiesTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-character-abilities.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-character-abilities', characterAbilitiesTemplate);

        const characterSkillsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-character-skills.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-character-skills', characterSkillsTemplate);

        const characterFeaturesTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-character-features.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-character-features', characterFeaturesTemplate);

        const characterWeaponsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-character-weapons.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-character-weapons', characterWeaponsTemplate);

        const characterSpellsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-character-spells.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-character-spells', characterSpellsTemplate);

        const characterBiographyTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-character-biography.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-character-biography', characterBiographyTemplate);

        // GLOBAL PARTIALS
        const globalOptionsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-global-options.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-global-options', globalOptionsTemplate);

        const globalFundTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-global-fund.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-global-fund', globalFundTemplate);

        const globalSkillCheckTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-global-skillcheckrolls.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-global-skillcheckrolls', globalSkillCheckTemplate);

        // UNIFIED HEADER PARTIAL
        const unifiedHeaderTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-unified-header.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-unified-header', unifiedHeaderTemplate);

        // LOOKUP PARTIALS
        const lookupSRDRulesTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-lookup-srdrules.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-lookup-srdrules', lookupSRDRulesTemplate);

        // CHARACTER PARTIALS
        const characterDetailsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-character-details.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-character-details', characterDetailsTemplate);

        const characterGuidanceTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-character-guidance.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-character-guidance', characterGuidanceTemplate);

        // ASSISTANT PARTIALS
        const assistantCriteriaTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-assistant-criteria.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-assistant-criteria', assistantCriteriaTemplate);

        // ENCOUNTER PARTIALS
        const encounterScriptsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-encounter-scripts.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-encounter-scripts', encounterScriptsTemplate);

        const encounterConfigurationTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-encounter-configuration.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-encounter-configuration', encounterConfigurationTemplate);

        const encounterWorksheetTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-encounter-worksheet.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-encounter-worksheet', encounterWorksheetTemplate);

        const encounterMonstersTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-encounter-monsters.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-encounter-monsters', encounterMonstersTemplate);

        const encounterPartyTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-encounter-party.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-encounter-party', encounterPartyTemplate);

        const encounterNPCTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-encounter-npcs.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-encounter-npcs', encounterNPCTemplate);

        // NARRATIVE PARTIALS
        const narrativeImageTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-narrative-image.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-narrative-image', narrativeImageTemplate);

        const narrativeSettingsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-narrative-settings.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-narrative-settings', narrativeSettingsTemplate);

        const narrativeGeographyTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-narrative-geography.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-narrative-geography', narrativeGeographyTemplate);

        const narrativeDetailsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-narrative-details.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-narrative-details', narrativeDetailsTemplate);

        const narrativeRewardsTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-narrative-rewards.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-narrative-rewards', narrativeRewardsTemplate);

        const narrativeCharactersTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-narrative-characters.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-narrative-characters', narrativeCharactersTemplate);

        const narrativeEncountersTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partial-narrative-encounters.hbs').then(response => response.text());
        Handlebars.registerPartial('partial-narrative-encounters', narrativeEncountersTemplate);

        postConsoleAndNotification(MODULE.NAME, "Window-query partials registered successfully", "", false, false);
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, "Error registering window-query partials", error.message, true, false);
        console.error('Error registering window-query partials:', error);
    }
}
