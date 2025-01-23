export class BlacksmithLayer extends CanvasLayer {
    constructor() {
        super();
        console.log("BlacksmithLayer: Initialized");
    }

    async _draw() {
        console.log("BlacksmithLayer: Drawing layer");
        // Add your drawing logic here
    }

    activate() {
        console.log("BlacksmithLayer: Activated");
        // Add any custom activation logic here
    }

    deactivate() {
        console.log("BlacksmithLayer: Deactivated");
        // Add any custom deactivation logic here
    }
}