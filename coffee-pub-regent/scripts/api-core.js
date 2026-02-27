// ==================================================================
// ===== REGENT MINIMAL API-CORE ====================================
// ==================================================================
// Minimal helpers so Regent does not depend on Blacksmith internals.

import { MODULE } from './const.js';

export function getSettingSafely(moduleId, settingKey, defaultValue = null) {
    if (!game?.settings?.settings?.has(`${moduleId}.${settingKey}`)) {
        return defaultValue;
    }
    return game.settings.get(moduleId, settingKey);
}

export function postConsoleAndNotification(
    strModuleName = MODULE.NAME,
    message = null,
    result = null,
    blnDebug = false,
    blnNotification = false
) {
    if (!message) return;
    const hasResult = !(result === "" || result === undefined || result === null);
    const prefix = `[${strModuleName}]`;
    if (blnDebug && !getSettingSafely(MODULE.ID, 'openAIDebug', false)) return;
    if (hasResult) {
        console.log(prefix, message, result);
    } else {
        console.log(prefix, message);
    }
    if (blnNotification && ui?.notifications) {
        const text = hasResult ? `${message} ${typeof result === 'object' ? JSON.stringify(result) : result}` : message;
        ui.notifications.info(text);
    }
}
