// ==================================================================
// Canonical Font Awesome classes for pin Access + Visibility UI
// ==================================================================

/** Access preset (maps to ownership + `blacksmithAccess`); keys match toolbar / Configure Pin. */
export const PIN_ACCESS_ICONS = Object.freeze({
    none: 'fa-solid fa-user-shield',
    read: 'fa-solid fa-user-lock',
    pin: 'fa-solid fa-user-pen',
    full: 'fa-solid fa-users'
});

/** Visibility (`blacksmithVisibility`); keys match toolbar / Configure Pin / browse row. */
export const PIN_VISIBILITY_ICONS = Object.freeze({
    visible: 'fa-solid fa-eye',
    hidden: 'fa-solid fa-eye-slash',
    owner: 'fa-solid fa-binoculars'
});

/** Parent row icon for the pin context menu "Access" submenu (not a specific mode). */
export const PIN_ACCESS_SUBMENU_ICON = 'fa-solid fa-shield-halved';

/** @param {string} classString Space-separated FA classes (e.g. `PIN_ACCESS_ICONS.read`) */
export function pinIconTag(classString) {
    return `<i class="${classString}"></i>`;
}
