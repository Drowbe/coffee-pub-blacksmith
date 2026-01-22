// ============================================
// PINS RENDERING TEST - Console Commands
// ============================================
// Copy and paste these into the browser console to test pin rendering
// ============================================

// 1. Check API availability
const blacksmith = await game.modules.get('coffee-pub-blacksmith')?.api;
const pinsAPI = blacksmith?.pins;
console.log('✅ Pins API available:', !!pinsAPI);

// 2. Check current scene
const scene = canvas?.scene;
console.log('📍 Active scene:', scene?.id, scene?.name);

// 3. Check if canvas is ready
console.log('🎨 Canvas ready:', !!canvas);
console.log('🎨 Blacksmith layer:', !!canvas?.layers?.find(l => l.name === 'blacksmith-utilities-layer'));

// 4. Create a test pin at center of viewport (or specific coordinates)
const viewportCenter = canvas.stage.getBounds();
const testX = canvas.stage.pivot.x || 1000;
const testY = canvas.stage.pivot.y || 1000;

const testPin = await pinsAPI.create({
    id: crypto.randomUUID(),
    x: testX,
    y: testY,
    text: 'Test Pin',
    moduleId: 'test-module',
    image: '<i class="fa-solid fa-star"></i>' // Font Awesome icon
});
console.log('📌 Created pin:', testPin);

// 5. Check if renderer container exists (via dynamic import)
const { PinRenderer } = await import('../scripts/pins-renderer.js');
const container = PinRenderer.getContainer();
console.log('🎨 Renderer container:', !!container);
console.log('🎨 Container children count:', container?.children.length || 0);

// 6. List all pins
const allPins = pinsAPI.list();
console.log('📋 All pins:', allPins);
console.log('📋 Pin count:', allPins.length);

// 7. Manually reload pins if they're not showing (force refresh)
if (container && allPins.length > 0) {
    console.log('🔄 Manually reloading pins...');
    await PinRenderer.loadScenePins(scene.id, allPins);
    console.log('✅ Reload complete. Check canvas for pins.');
}

// 8. Check if pin graphics exist in renderer
const pinGraphics = PinRenderer.getPin(testPin.id);
console.log('🎨 Pin graphics object:', !!pinGraphics);
if (pinGraphics) {
    console.log('🎨 Pin position:', pinGraphics.x, pinGraphics.y);
    console.log('🎨 Pin visible:', pinGraphics.visible);
    console.log('🎨 Pin children:', pinGraphics.children.length);
}

// 9. Create another pin with different style
const testPin2 = await pinsAPI.create({
    id: crypto.randomUUID(),
    x: testX + 200,
    y: testY + 200,
    text: 'Pin 2',
    moduleId: 'test-module',
    size: { w: 48, h: 48 },
    style: {
        fill: '#ff0000',
        stroke: '#00ff00',
        strokeWidth: 3,
        alpha: 0.8
    }
});
console.log('📌 Created second pin:', testPin2);

// 10. Force reload to see both pins
await PinRenderer.loadScenePins(scene.id, pinsAPI.list());
console.log('✅ Both pins should now be visible on canvas');

// 11. Update pin position (should update visually)
await pinsAPI.update(testPin.id, { x: testX + 100, y: testY + 100 });
console.log('📌 Updated pin position');

// 12. Check final state
console.log('📊 Final state:');
console.log('  - Pins in data:', pinsAPI.list().length);
console.log('  - Pins in renderer:', PinRenderer.getContainer()?.children.length || 0);
console.log('  - Current scene ID:', PinRenderer._currentSceneId);

// ============================================
// VISUAL CHECKLIST:
// ============================================
// ✅ Look at the canvas - you should see:
//    - Circle(s) with fill/stroke colors
//    - Icon image if provided (star.svg)
//    - Pins positioned at the coordinates you specified
//    - Pins should move when you pan/zoom the canvas
// ============================================

// CLEANUP (run this when done testing):
// await pinsAPI.delete(testPin.id);
// await pinsAPI.delete(testPin2.id);
// console.log('🧹 Cleanup complete');
