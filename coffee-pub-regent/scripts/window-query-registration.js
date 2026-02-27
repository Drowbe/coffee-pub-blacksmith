// ==================================================================
// ===== WINDOW-QUERY PARTIAL REGISTRATION (Regent) =================
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

const BASE = `modules/${MODULE.ID}/templates`;

export async function registerWindowQueryPartials() {
    try {
        postConsoleAndNotification(MODULE.NAME, "Registering window-query partials", "", false, false);

        const fetchPartial = (path) => fetch(`${BASE}/${path}`).then((r) => r.text());

        Handlebars.registerPartial('window-query-workspace-lookup', await fetchPartial('window-query-workspace-lookup.hbs'));
        Handlebars.registerPartial('window-query-workspace-character', await fetchPartial('window-query-workspace-character.hbs'));
        Handlebars.registerPartial('window-query-workspace-assistant', await fetchPartial('window-query-workspace-assistant.hbs'));
        Handlebars.registerPartial('window-query-workspace-narrative', await fetchPartial('window-query-workspace-narrative.hbs'));
        Handlebars.registerPartial('window-query-workspace-encounter', await fetchPartial('window-query-workspace-encounter.hbs'));

        Handlebars.registerPartial('partial-character-core', await fetchPartial('partial-character-core.hbs'));
        Handlebars.registerPartial('partial-character-abilities', await fetchPartial('partial-character-abilities.hbs'));
        Handlebars.registerPartial('partial-character-skills', await fetchPartial('partial-character-skills.hbs'));
        Handlebars.registerPartial('partial-character-features', await fetchPartial('partial-character-features.hbs'));
        Handlebars.registerPartial('partial-character-weapons', await fetchPartial('partial-character-weapons.hbs'));
        Handlebars.registerPartial('partial-character-spells', await fetchPartial('partial-character-spells.hbs'));
        Handlebars.registerPartial('partial-character-biography', await fetchPartial('partial-character-biography.hbs'));

        Handlebars.registerPartial('partial-global-options', await fetchPartial('partial-global-options.hbs'));
        Handlebars.registerPartial('partial-global-fund', await fetchPartial('partial-global-fund.hbs'));
        Handlebars.registerPartial('partial-global-skillcheckrolls', await fetchPartial('partial-global-skillcheckrolls.hbs'));
        Handlebars.registerPartial('partial-unified-header', await fetchPartial('partial-unified-header.hbs'));

        Handlebars.registerPartial('partial-lookup-srdrules', await fetchPartial('partial-lookup-srdrules.hbs'));
        Handlebars.registerPartial('partial-character-details', await fetchPartial('partial-character-details.hbs'));
        Handlebars.registerPartial('partial-character-guidance', await fetchPartial('partial-character-guidance.hbs'));
        Handlebars.registerPartial('partial-assistant-criteria', await fetchPartial('partial-assistant-criteria.hbs'));

        Handlebars.registerPartial('partial-encounter-scripts', await fetchPartial('partial-encounter-scripts.hbs'));
        Handlebars.registerPartial('partial-encounter-configuration', await fetchPartial('partial-encounter-configuration.hbs'));
        Handlebars.registerPartial('partial-encounter-worksheet', await fetchPartial('partial-encounter-worksheet.hbs'));
        Handlebars.registerPartial('partial-encounter-monsters', await fetchPartial('partial-encounter-monsters.hbs'));
        Handlebars.registerPartial('partial-encounter-party', await fetchPartial('partial-encounter-party.hbs'));
        Handlebars.registerPartial('partial-encounter-npcs', await fetchPartial('partial-encounter-npcs.hbs'));

        Handlebars.registerPartial('partial-narrative-image', await fetchPartial('partial-narrative-image.hbs'));
        Handlebars.registerPartial('partial-narrative-settings', await fetchPartial('partial-narrative-settings.hbs'));
        Handlebars.registerPartial('partial-narrative-geography', await fetchPartial('partial-narrative-geography.hbs'));
        Handlebars.registerPartial('partial-narrative-details', await fetchPartial('partial-narrative-details.hbs'));
        Handlebars.registerPartial('partial-narrative-rewards', await fetchPartial('partial-narrative-rewards.hbs'));
        Handlebars.registerPartial('partial-narrative-characters', await fetchPartial('partial-narrative-characters.hbs'));
        Handlebars.registerPartial('partial-narrative-encounters', await fetchPartial('partial-narrative-encounters.hbs'));

        postConsoleAndNotification(MODULE.NAME, "Window-query partials registered successfully", "", false, false);
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, "Error registering window-query partials", error.message, true, false);
        console.error("Error registering window-query partials:", error);
    }
}
