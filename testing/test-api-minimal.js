// Minimal test to see if Blacksmith loads
console.log('=== MINIMAL BLACKSMITH TEST ===');

// Check if module exists at all
const module = game.modules.get('coffee-pub-blacksmith');
console.log('1. Module object exists:', !!module);

if (module) {
    console.log('2. Module active:', module.active);
    console.log('3. Module esmodules loaded:', !!module.esmodules);
    
    // Check if any scripts loaded
    if (module.esmodules) {
        console.log('4. Scripts loaded:', module.esmodules.length);
        module.esmodules.forEach(script => {
            console.log('   -', script);
        });
    }
    
    // Check if there are any console errors
    console.log('5. Check browser console for JavaScript errors');
}

// Check if there are any global errors
console.log('6. Global errors:', window.lastError || 'None');
