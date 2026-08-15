// ==================================================================
// Canonical Font Awesome classes for pin editing + pin visibility UI
// ==================================================================

/** Pin editing (`config.blacksmithAccess`): `gm` | `private` | `public`. */
export const PIN_ACCESS_ICONS = Object.freeze({
    gm: 'fa-solid fa-user-shield',
    private: 'fa-solid fa-user-pen',
    public: 'fa-solid fa-users'
});

/** Pin visibility (`config.blacksmithVisibility`): `visible` | `hidden`. */
export const PIN_VISIBILITY_ICONS = Object.freeze({
    visible: 'fa-solid fa-eye',
    hidden: 'fa-solid fa-eye-slash'
});

/** Parent row icon for the pin context menu "Pin editing" submenu. */
export const PIN_ACCESS_SUBMENU_ICON = 'fa-solid fa-shield-halved';

/** @param {string} classString Space-separated FA classes (e.g. `PIN_ACCESS_ICONS.gm`) */
export function pinIconTag(classString) {
    return `<i class="${classString}"></i>`;
}
