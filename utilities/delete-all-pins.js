// ============================================
// DELETE ALL PINS - Console Command
// ============================================
// Copy/paste into browser console to delete all pins from the current scene
// ============================================

(async () => {
    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
    if (!pinsAPI) {
        console.error('BLACKSMITH | PINS API not available');
        return;
    }

    const scene = canvas?.scene;
    if (!scene) {
        console.error('BLACKSMITH | PINS No active scene!');
        return;
    }

    // Get all pins for current scene
    const pins = pinsAPI.list({ sceneId: scene.id });
    console.log(`BLACKSMITH | PINS Found ${pins.length} pin(s) to delete`);

    if (pins.length === 0) {
        console.log('BLACKSMITH | PINS No pins to delete');
        return;
    }

    // Confirm deletion
    const confirmed = confirm(`Delete all ${pins.length} pin(s) from scene "${scene.name}"?`);
    if (!confirmed) {
        console.log('BLACKSMITH | PINS Deletion cancelled');
        return;
    }

    // Delete all pins
    let deleted = 0;
    let errors = 0;
    for (const pin of pins) {
        try {
            await pinsAPI.delete(pin.id, { sceneId: scene.id });
            deleted++;
            console.log(`BLACKSMITH | PINS Deleted pin: ${pin.id}`);
        } catch (err) {
            errors++;
            console.error(`BLACKSMITH | PINS Error deleting pin ${pin.id}:`, err);
        }
    }

    console.log(`BLACKSMITH | PINS Deletion complete: ${deleted} deleted, ${errors} errors`);
})();
