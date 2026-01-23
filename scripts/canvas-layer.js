import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { PinRenderer } from './pins-renderer.js';

export class BlacksmithLayer extends foundry.canvas.layers.CanvasLayer {
    constructor() {
        super();
        postConsoleAndNotification(MODULE.NAME, "BlacksmithLayer: Initialized", "", true, false);
    }

    async _draw() {
        postConsoleAndNotification(MODULE.NAME, "BlacksmithLayer: Drawing layer", "", true, false);
        // Initialize pins renderer (no longer needs layer parameter)
        PinRenderer.initialize();
    }

    activate() {
        postConsoleAndNotification(MODULE.NAME, "BlacksmithLayer: Activated", "", true, false);
        // Load pins for current scene when layer activates (if system is ready)
        // Use setTimeout to ensure system is fully initialized
        setTimeout(async () => {
            if (canvas?.scene && PinRenderer.getContainer()) {
                const { PinManager } = await import('./manager-pins.js');
                const pins = PinManager.list({ sceneId: canvas.scene.id });
                if (pins.length > 0) {
                    await PinRenderer.loadScenePins(canvas.scene.id, pins);
                }
            }
        }, 100);
    }

    deactivate() {
        postConsoleAndNotification(MODULE.NAME, "BlacksmithLayer: Deactivated", "", true, false);
        // Clear pins when layer deactivates
        PinRenderer.clear();
    }
}
