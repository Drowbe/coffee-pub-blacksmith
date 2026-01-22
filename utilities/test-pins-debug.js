// ============================================
// PINS DEBUG - Check pin persistence and loading
// ============================================
// Run this after refreshing to see what's happening
// ============================================

(async () => {
    console.log('=== BLACKSMITH | PINS DEBUG ===');
    
    // 1. Check API
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    const pinsAPI = blacksmith?.pins;
    console.log('✅ Pins API available:', !!pinsAPI);
    
    if (!pinsAPI) {
        console.error('❌ Pins API not available!');
        return;
    }
    
    // 2. Check scene
    const scene = canvas?.scene;
    console.log('📍 Scene:', scene?.id, scene?.name);
    
    if (!scene) {
        console.error('❌ No active scene!');
        return;
    }
    
    // 3. Check scene flags directly
    const flags = scene.getFlag('coffee-pub-blacksmith', 'pins');
    console.log('📋 Scene flags (raw):', flags);
    console.log('📋 Pin count in flags:', Array.isArray(flags) ? flags.length : 0);
    
    // 4. Check via API
    const pins = pinsAPI.list();
    console.log('📋 Pins via API:', pins);
    console.log('📋 Pin count via API:', pins.length);
    
    // 5. Check renderer
    const { PinRenderer } = await import('../scripts/pins-renderer.js');
    const container = PinRenderer.getContainer();
    console.log('🎨 Renderer container:', !!container);
    
    if (container) {
        console.log('🎨 Container children:', container.children.length);
        console.log('🎨 Container children details:', container.children.map(c => ({
            id: c.pinData?.id,
            x: c.x,
            y: c.y,
            visible: c.visible
        })));
    } else {
        console.warn('⚠️ Renderer container not initialized!');
    }
    
    // 6. Check layer
    const layer = canvas?.layers?.find(l => l.name === 'blacksmith-utilities-layer');
    console.log('🎨 Blacksmith layer:', !!layer);
    console.log('🎨 Layer active:', layer?.active);
    
    // 7. If pins exist in data but not on canvas, try manual reload
    if (pins.length > 0 && (!container || container.children.length === 0)) {
        console.log('🔄 Attempting manual reload...');
        try {
            await PinRenderer.loadScenePins(scene.id, pins);
            console.log('✅ Manual reload complete');
        } catch (err) {
            console.error('❌ Manual reload failed:', err);
        }
    }
    
    // 8. If no pins exist, create a test pin
    if (pins.length === 0) {
        console.log('📌 No pins found. Creating test pin...');
        try {
            const testPin = await pinsAPI.create({
                id: crypto.randomUUID(),
                x: 1000,
                y: 1000,
                moduleId: 'test-module',
                text: 'Test Pin',
                image: '<i class="fa-solid fa-star"></i>'
            });
            console.log('✅ Test pin created:', testPin.id);
            console.log('📍 Check canvas for pin at (1000, 1000)');
        } catch (err) {
            console.error('❌ Failed to create test pin:', err);
        }
    }
    
    console.log('=== END DEBUG ===');
})();
