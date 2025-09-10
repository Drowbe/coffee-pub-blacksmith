import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

export class BlacksmithLayer extends CanvasLayer {
    constructor() {
        super();
        postConsoleAndNotification(MODULE.NAME, "BlacksmithLayer: Initialized", "", true, false);
    }

    async _draw() {
        postConsoleAndNotification(MODULE.NAME, "BlacksmithLayer: Drawing layer", "", true, false);
        // Add your drawing logic here
    }

    activate() {
        postConsoleAndNotification(MODULE.NAME, "BlacksmithLayer: Activated", "", true, false);
        // Add any custom activation logic here
    }

    deactivate() {
        postConsoleAndNotification(MODULE.NAME, "BlacksmithLayer: Deactivated", "", true, false);
        // Add any custom deactivation logic here
    }
}
