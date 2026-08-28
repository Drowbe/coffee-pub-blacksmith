// ==================================================================
// ===== WINDOW STYLE IDENTIFIERS (window-styles.js) ================
// ==================================================================
//
// The stable identifiers for Blacksmith's window presentations, so a consumer
// can store or exchange a style choice without importing a base class.
//
// Lives in its own module rather than alongside one of the bases: each base
// needs the whole set (to stamp its own value into the render context), and a
// constant that lives inside one presentation and is imported by the others
// makes the import graph read as though those presentations depend on it.
//
// The registry stays presentation-agnostic -- any of these can be registered
// and opened through registerWindow / openWindow.

export const BLACKSMITH_WINDOW_STYLES = Object.freeze({
    /** Five-zone editor window. BlacksmithWindowBaseV2. */
    STANDARD: 'standard',
    /** Compact persistent tool palette. BlacksmithToolWindowBaseV2. */
    TOOL: 'tool',
    /** Viewport-covering blocking surface. BlacksmithFullscreenWindowBaseV2. */
    FULLSCREEN: 'fullscreen'
});
