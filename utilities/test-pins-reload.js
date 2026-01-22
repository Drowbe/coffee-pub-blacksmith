// ============================================
// PINS MANUAL RELOAD - Force reload pins
// ============================================
// Run this to manually reload pins from scene flags
// ============================================

(async () => {
    console.log('=== BLACKSMITH | PINS MANUAL RELOAD ===');
    
    const { PinRenderer } = await import('../scripts/pins-renderer.js');
    const { PinManager } = await import('../scripts/manager-pins.js');
    
    // Check container
    const container = PinRenderer.getContainer();
    console.log('BLACKSMITH | PINS Container exists:', !!container);
    
    if (!container) {
        console.error('BLACKSMITH | PINS Container not initialized! Initializing...');
        const layer = canvas?.layers?.find(l => l.name === 'blacksmith-utilities-layer');
        if (layer) {
            PinRenderer.initialize(layer);
            console.log('BLACKSMITH | PINS Container initialized');
        } else {
            console.error('BLACKSMITH | PINS Blacksmith layer not found!');
            return;
        }
    }
    
    // Get pins
    const scene = canvas?.scene;
    if (!scene) {
        console.error('BLACKSMITH | PINS No active scene!');
        return;
    }
    
    const pins = PinManager.list({ sceneId: scene.id });
    console.log('BLACKSMITH | PINS Found pins:', pins.length);
    
    // Reload
    console.log('BLACKSMITH | PINS Reloading pins...');
    await PinRenderer.loadScenePins(scene.id, pins);
    
    // Check result
    const finalContainer = PinRenderer.getContainer();
    console.log('BLACKSMITH | PINS Container children after reload:', finalContainer?.children.length || 0);
    
    if (finalContainer) {
        finalContainer.children.forEach((child, idx) => {
            console.log(`BLACKSMITH | PINS Pin ${idx}:`, {
                id: child.pinData?.id,
                x: child.x,
                y: child.y,
                visible: child.visible,
                worldVisible: child.worldVisible
            });
        });
    }
    
    console.log('=== END RELOAD ===');
})();
