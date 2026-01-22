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
        // Initialize pins renderer
        PinRenderer.initialize(this);
    }

    activate() {
        postConsoleAndNotification(MODULE.NAME, "BlacksmithLayer: Activated", "", true, false);
        // Load pins for current scene when layer activates (if container is ready)
        if (canvas?.scene && PinRenderer.getContainer()) {
            import('./manager-pins.js').then(async ({ PinManager }) => {
                const pins = PinManager.list({ sceneId: canvas.scene.id });
                await PinRenderer.loadScenePins(canvas.scene.id, pins);
            });
        }
    }

    deactivate() {
        postConsoleAndNotification(MODULE.NAME, "BlacksmithLayer: Deactivated", "", true, false);
        // Clear pins when layer deactivates
        PinRenderer.clear();
    }
}
