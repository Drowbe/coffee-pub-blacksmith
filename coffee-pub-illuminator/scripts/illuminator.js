// ==================================================================
// ===== ILLUMINATOR - ENTRY POINT ==================================
// ==================================================================

import { MODULE } from './const.js';
import { HookManager } from './manager-hooks.js';
import { ImageCacheManager } from './manager-image-cache.js';
import { TokenImageUtilities } from './token-image-utilities.js';
import { TokenImageReplacementWindow } from './token-image-replacement.js';
import { registerSettings } from './settings.js';
import { getSettingSafely } from './api-helpers.js';

Hooks.once('ready', function () {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) {
        console.warn(`${MODULE.TITLE} | Blacksmith not found; skipping registration.`);
        return;
    }
    if (typeof blacksmith.registerMenubarTool !== 'function') {
        setTimeout(() => {
            const api = game.modules.get('coffee-pub-blacksmith')?.api;
            if (api && typeof api.registerMenubarTool === 'function') {
                initializeIlluminator(api);
            } else {
                console.warn(`${MODULE.TITLE} | Blacksmith API not available; image replacement tools will not appear.`);
            }
        }, 150);
        return;
    }
    initializeIlluminator(blacksmith);
});

function initializeIlluminator(blacksmith) {
    registerSettings(blacksmith);
    HookManager.initialize();
    ImageCacheManager.initialize();
    TokenImageUtilities.initialize();

    blacksmith.registerMenubarTool('imagereplace', {
        icon: 'fa-solid fa-images',
        name: 'imagereplace',
        title: 'Replace Image',
        tooltip: null,
        onClick: () => TokenImageReplacementWindow.openWindow(),
        zone: 'middle',
        group: 'utility',
        groupOrder: blacksmith.GROUP_ORDER?.UTILITY ?? 50,
        order: 2,
        moduleId: MODULE.ID,
        gmOnly: true,
        leaderOnly: false,
        visible: true,
        toggleable: false,
        active: false,
        iconColor: null,
        buttonNormalTint: null,
        buttonSelectedTint: null
    });

    if (typeof blacksmith.registerToolbarTool === 'function') {
        blacksmith.registerToolbarTool('token-replacement', {
            icon: 'fa-solid fa-images',
            name: 'token-replacement',
            title: 'Token Image Replacement',
            button: true,
            visible: () => getSettingSafely(MODULE.ID, 'tokenImageReplacementShowInCoffeePubToolbar', true),
            gmOnly: true,
            onCoffeePub: true,
            onFoundry: () => getSettingSafely(MODULE.ID, 'tokenImageReplacementShowInFoundryToolbar', false),
            onClick: () => TokenImageReplacementWindow.openWindow(),
            moduleId: MODULE.ID,
            zone: 'gmtools',
            order: 20
        });
    }

    const module = game.modules.get(MODULE.ID);
    if (module) {
        module.api = {
            getCombatContextMenuItems(context) {
                const { combat, combatantId, canvasToken, x, y } = context || {};
                const items = [];
                items.push({
                    name: 'Replace Image',
                    icon: 'fa-solid fa-image',
                    disabled: !canvasToken,
                    callback: async () => {
                        if (!canvasToken) return;
                        try {
                            if (blacksmith.panToCombatant && combat && combatantId) {
                                await blacksmith.panToCombatant(combatantId, { selectToken: true });
                                const token = canvas.tokens?.placeables.find(t => t.id === canvasToken.id);
                                if (token) token.control({ releaseOthers: true });
                            }
                        } catch (_e) {}
                        await TokenImageReplacementWindow.openWindow();
                    }
                });
                return items;
            },
            registerImageTileContextMenuItem: ImageCacheManager.registerImageTileContextMenuItem.bind(ImageCacheManager),
            unregisterImageTileContextMenuItem: ImageCacheManager.unregisterImageTileContextMenuItem.bind(ImageCacheManager),
            openReplacementWindow: (opts) => TokenImageReplacementWindow.openWindow(opts)
        };
    }
}
