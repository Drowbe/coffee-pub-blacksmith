// ============================================
// PINS MANUAL RELOAD - Force reload pins
// ============================================
// Copy/paste into browser console. Uses API only (no imports).
// ============================================

(async () => {
    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
    if (!pinsAPI) {
        console.error('BLACKSMITH | PINS API not available');
        return;
    }
    console.log('BLACKSMITH | PINS Reloading...');
    const result = await pinsAPI.reload();
    console.log('BLACKSMITH | PINS Reload result:', result);
})();
