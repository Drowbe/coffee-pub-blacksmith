/**
 * Helpers for Illuminator – delegate to Blacksmith when available, else minimal local behavior.
 */
import { MODULE } from './const.js';

export function getSettingSafely(moduleId, settingKey, defaultValue = null) {
    try {
        const v = game.settings.get(moduleId, settingKey);
        return v !== undefined && v !== null ? v : defaultValue;
    } catch (_e) {
        return defaultValue;
    }
}

export function postConsoleAndNotification(moduleName, message, detail, logToConsole = true, showNotification = false) {
    if (logToConsole && typeof console?.log === 'function') {
        console.log(moduleName, message, detail !== undefined && detail !== '' ? detail : '');
    }
    if (showNotification && ui?.notifications) {
        const text = typeof message === 'string' ? message : String(detail ?? message);
        ui.notifications.info(text);
    }
}

export async function playSound(sound = 'sound', volume = 0.7, loop = false, broadcast = true, duration = 0) {
    const api = game.modules.get('coffee-pub-blacksmith')?.api;
    if (api?.playSound) return api.playSound(sound, volume, loop, broadcast, duration);
}
