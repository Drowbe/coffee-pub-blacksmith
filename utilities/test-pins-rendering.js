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

// 5. Check if renderer container exists (via canvas layer)
// Note: Direct import doesn't work from console - pins are loaded via hooks
const blacksmithLayer = canvas?.layers?.find(l => l.name === 'blacksmith-utilities-layer');
const pinsContainer = blacksmithLayer?.children?.find(c => c.name === 'blacksmith-pins-container');
console.log('🎨 Renderer container:', !!pinsContainer);
console.log('🎨 Container children count:', pinsContainer?.children.length || 0);

// 6. List all pins
const allPins = pinsAPI.list();
console.log('📋 All pins:', allPins);
console.log('📋 Pin count:', allPins.length);

// 7. Note: Pins are automatically loaded via hooks when created/updated
// If pins don't appear, try reloading the scene or canvas
console.log('ℹ️  Pins should appear automatically. If not, try:');
console.log('   - Reload scene: await scene.activate()');
console.log('   - Or reload canvas: window.location.reload()');

// 8. Check if pin graphics exist in renderer (via container)
if (pinsContainer) {
    const pinGraphics = pinsContainer.children.find(c => c.pinData?.id === testPin.id);
    console.log('🎨 Pin graphics object:', !!pinGraphics);
    if (pinGraphics) {
        console.log('🎨 Pin position:', pinGraphics.x, pinGraphics.y);
        console.log('🎨 Pin visible:', pinGraphics.visible);
        console.log('🎨 Pin children:', pinGraphics.children.length);
    }
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

// 10. Pins should automatically appear - check canvas
console.log('✅ Both pins should now be visible on canvas');
console.log('   If not visible, pins will load on next scene activation');

// 11. Update pin position (should update visually)
await pinsAPI.update(testPin.id, { x: testX + 100, y: testY + 100 });
console.log('📌 Updated pin position');

// 12. Check final state
console.log('📊 Final state:');
console.log('  - Pins in data:', pinsAPI.list().length);
console.log('  - Pins in renderer:', pinsContainer?.children.length || 0);
console.log('  - Current scene ID:', scene.id);

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
