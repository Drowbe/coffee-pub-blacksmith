// ============================================
// PINS DEBUG - Check pin persistence and loading
// ============================================
// Copy/paste into browser console. Uses API only (no imports).
// ============================================

(async () => {
    console.log('=== BLACKSMITH | PINS DEBUG ===');

    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
    console.log('BLACKSMITH | PINS API available:', !!pinsAPI);

    if (!pinsAPI) {
        console.error('BLACKSMITH | PINS API not available!');
        return;
    }

    const scene = canvas?.scene;
    console.log('BLACKSMITH | PINS Scene:', scene?.id, scene?.name);

    if (!scene) {
        console.error('BLACKSMITH | PINS No active scene!');
        return;
    }

    const flags = scene.getFlag('coffee-pub-blacksmith', 'pins');
    console.log('BLACKSMITH | PINS Scene flags pin count:', Array.isArray(flags) ? flags.length : 0);

    const pins = pinsAPI.list();
    console.log('BLACKSMITH | PINS Pins via API:', pins.length, pins);

    const layer = canvas?.layers?.find(l => l.name === 'blacksmith-utilities-layer');
    console.log('BLACKSMITH | PINS Blacksmith layer:', !!layer, 'active:', layer?.active);

    if (pins.length > 0) {
        console.log('BLACKSMITH | PINS Running reload...');
        try {
            const result = await pinsAPI.reload();
            console.log('BLACKSMITH | PINS Reload result:', result);
            if (!result.containerReady) {
                console.warn('BLACKSMITH | PINS Container not ready – pins may not render.');
            }
        } catch (err) {
            console.error('BLACKSMITH | PINS Reload failed:', err);
        }
    } else {
        console.log('BLACKSMITH | PINS No pins. Create one with pinsAPI.create({...})');
    }

    console.log('=== BLACKSMITH | PINS END DEBUG ===');
})();
