// ==================================================================
// ===== MANAGER-TOOL-WINDOWS - remember which tool windows were open
// ==================================================================
//
// The dice tray, macros, and health windows reopen themselves on load if the
// user left them open. Squire did this from its tray rebuild, reading a
// `windowStates` user flag; the tray is not part of what moved, so the same
// behaviour is kept here as a small pass of its own.
//
// A user flag rather than a setting: it is per user, it is not configuration,
// and it should not appear anywhere in the settings sheet.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

const FLAG_KEY = 'windowStates';
const SQUIRE_ID = 'coffee-pub-squire';

/** Marks the one-time read of Squire's flag as done, so it never runs twice. */
const ADOPTED_FLAG_KEY = 'windowStatesAdopted';

/**
 * Whether a tool window was open when the user last left.
 * @param {'diceTray'|'macros'|'health'} toolKey
 * @returns {boolean}
 */
export function getToolWindowState(toolKey) {
    try {
        return !!(game.user?.getFlag(MODULE.ID, FLAG_KEY) ?? {})[toolKey];
    } catch (_) {
        return false;
    }
}

/**
 * Record whether a tool window is open. Failures are logged and swallowed --
 * losing the reopen state is not worth interrupting a window open or close.
 * @param {'diceTray'|'macros'|'health'} toolKey
 * @param {boolean} isOpen
 */
export async function setToolWindowState(toolKey, isOpen) {
    try {
        const states = foundry.utils.duplicate(game.user.getFlag(MODULE.ID, FLAG_KEY) ?? {});
        if (states[toolKey] === !!isOpen) return;
        states[toolKey] = !!isOpen;
        await game.user.setFlag(MODULE.ID, FLAG_KEY, states);
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Tool windows: could not save open state', { toolKey, error: error?.message ?? error }, true, false);
    }
}

/**
 * Adopt Squire's `windowStates` flag once, for the same reason the settings are
 * adopted: the user should not have to reopen three windows because a feature
 * changed hands. Unlike settings this reads a flag, so it cannot go through
 * SettingsAdoptionManager -- the shape is different, the guard is not.
 */
async function adoptSquireWindowStates() {
    try {
        if (game.user.getFlag(MODULE.ID, ADOPTED_FLAG_KEY)) return;

        const squireStates = game.user.getFlag(SQUIRE_ID, FLAG_KEY);
        if (squireStates && typeof squireStates === 'object') {
            const ours = foundry.utils.duplicate(game.user.getFlag(MODULE.ID, FLAG_KEY) ?? {});
            for (const toolKey of ['diceTray', 'macros', 'health']) {
                if (ours[toolKey] === undefined && squireStates[toolKey] !== undefined) {
                    ours[toolKey] = !!squireStates[toolKey];
                }
            }
            await game.user.setFlag(MODULE.ID, FLAG_KEY, ours);
        }

        await game.user.setFlag(MODULE.ID, ADOPTED_FLAG_KEY, true);
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Tool windows: could not adopt Squire window states', error?.message ?? error, true, false);
    }
}

/**
 * Reopen whichever tool windows were open last time.
 *
 * Called from `ready` after the tools are registered. Each open is independent:
 * one failing must not stop the others, since they are three unrelated windows.
 */
export async function restoreToolWindows() {
    await adoptSquireWindowStates();

    const states = game.user.getFlag(MODULE.ID, FLAG_KEY) ?? {};

    // Imported lazily so a tool that is not registered in this world cannot
    // fail the whole pass at module-load time.
    const openers = [
        ['diceTray', async () => (await import('./window-dicetray.js')).openDiceTray()],
        ['macros', async () => (await import('./window-macros.js')).openMacrosWindow()],
        ['health', async () => (await import('./window-health.js')).openHealthWindow()]
    ];

    for (const [toolKey, open] of openers) {
        if (!states[toolKey]) continue;
        try {
            await open();
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Tool windows: could not reopen a tool window', { toolKey, error: error?.message ?? error }, true, false);
        }
    }
}
