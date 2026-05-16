// ==================================================================
// Canonical Font Awesome classes for pin Access + Visibility UI
// ==================================================================

/** Edit access (`config.blacksmithAccess`): `gm` | `private` | `public` (v6+). Legacy keys normalized on read. */
export const PIN_ACCESS_ICONS = Object.freeze({
    gm: 'fa-solid fa-user-shield',
    private: 'fa-solid fa-user-pen',
    public: 'fa-solid fa-users'
});

/** Visibility (`blacksmithVisibility`); keys match toolbar / Configure Pin / browse row. */
export const PIN_VISIBILITY_ICONS = Object.freeze({
    visible: 'fa-solid fa-eye',
    hidden: 'fa-solid fa-eye-slash',
    owner: 'fa-solid fa-binoculars'
});

/** Parent row icon for the pin context menu "Access" submenu (not a specific mode). */
export const PIN_ACCESS_SUBMENU_ICON = 'fa-solid fa-shield-halved';

/** @param {string} classString Space-separated FA classes (e.g. `PIN_ACCESS_ICONS.gm`) */
export function pinIconTag(classString) {
    return `<i class="${classString}"></i>`;
}
