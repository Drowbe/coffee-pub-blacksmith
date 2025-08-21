import { postConsoleAndNotification } from './global.js';
import { MODULE } from './const.js';

export class BlacksmithLayer extends CanvasLayer {
    constructor() {
        super();
        postConsoleAndNotification(MODULE.NAME, "BlacksmithLayer: Initialized", "", true, false);
    }

    async _draw() {
        postConsoleAndNotification("BlacksmithLayer: Drawing layer", "", false, true, false);
        // Add your drawing logic here
    }

    activate() {
        postConsoleAndNotification("BlacksmithLayer: Activated", "", false, true, false);
        // Add any custom activation logic here
    }

    deactivate() {
        postConsoleAndNotification("BlacksmithLayer: Deactivated", "", false, true, false);
        // Add any custom deactivation logic here
    }
}