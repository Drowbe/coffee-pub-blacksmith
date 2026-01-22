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

    // Check layer - FoundryVTT uses bracket notation
    const layer = canvas?.['blacksmith-utilities-layer'];
    console.log('BLACKSMITH | PINS Blacksmith layer:', !!layer, 'active:', layer?.active);
    
    // Check container via layer
    if (layer) {
        const container = layer.children?.find(c => c.name === 'blacksmith-pins-container');
        console.log('BLACKSMITH | PINS Container in layer:', !!container);
        if (container) {
            console.log('BLACKSMITH | PINS Container children:', container.children.length);
            console.log('BLACKSMITH | PINS Container visible:', container.visible, 'worldVisible:', container.worldVisible);
        }
    }

    // Check and activate layer if needed
    const layer = canvas?.['blacksmith-utilities-layer'];
    if (layer && !layer.active) {
        console.log('BLACKSMITH | PINS Activating layer...');
        layer.activate();
    }
    
    if (pins.length > 0) {
        console.log('BLACKSMITH | PINS Running reload...');
        try {
            const result = await pinsAPI.reload();
            console.log('BLACKSMITH | PINS Reload result:', result);
            if (!result.containerReady) {
                console.warn('BLACKSMITH | PINS Container not ready – pins may not render.');
            }
            
            // Check pin visibility after reload
            if (layer) {
                const container = layer.children?.find(c => c.name === 'blacksmith-pins-container');
                if (container) {
                    console.log('BLACKSMITH | PINS Container children after reload:', container.children.length);
                    container.children.forEach((pin, idx) => {
                        const bounds = pin.getBounds();
                        console.log(`BLACKSMITH | PINS Pin ${idx}:`, {
                            id: pin.pinData?.id,
                            x: pin.x,
                            y: pin.y,
                            visible: pin.visible,
                            worldVisible: pin.worldVisible,
                            bounds: bounds,
                            hasCircle: !!pin._circle,
                            hasIcon: !!pin._icon
                        });
                    });
                }
            }
        } catch (err) {
            console.error('BLACKSMITH | PINS Reload failed:', err);
        }
    } else {
        console.log('BLACKSMITH | PINS No pins. Create one with pinsAPI.create({...})');
    }

    console.log('=== BLACKSMITH | PINS END DEBUG ===');
})();
