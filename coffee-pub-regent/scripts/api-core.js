// ==================================================================
// ===== REGENT MINIMAL API-CORE ====================================
// ==================================================================
// getSettingSafely for Regent settings; logging via Blacksmith API only.

import { MODULE } from './const.js';

// Use Blacksmith's postConsoleAndNotification so debug is controlled by Blacksmith's global debug setting.
export { postConsoleAndNotification } from '/modules/coffee-pub-blacksmith/scripts/api-core.js';

export function getSettingSafely(moduleId, settingKey, defaultValue = null) {
    if (!game?.settings?.settings?.has(`${moduleId}.${settingKey}`)) {
        return defaultValue;
    }
    return game.settings.get(moduleId, settingKey);
}
