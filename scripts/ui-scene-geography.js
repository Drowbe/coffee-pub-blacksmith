import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { registerSceneConfigTab } from './manager-scene-config.js';
import {
    GeographyManager,
    GEOGRAPHY_FLAG,
    GEOGRAPHY_FIELD_LIST,
    HABITATS
} from './manager-geography.js';

// ==================================================================
// ===== GEOGRAPHY TAB (SCENE CONFIG) ===============================
// ==================================================================
//
// Blacksmith is consumer zero for registerSceneConfigTab: this tab goes through
// the same public path Artificer will, with no internal shortcut.
//
// Every input is named `flags.coffee-pub-blacksmith.geography.<field>`, so
// Foundry's own Scene Config submission persists it. There is no submit handler
// here and no save callback on the API -- see api-scene-config.md.

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));

/** Field name Foundry will expand into the flag on submit. */
const fieldName = (key) => `flags.${MODULE.ID}.${GEOGRAPHY_FLAG}.${key}`;

/**
 * One text row per geography field.
 *
 * The placeholder shows the world default, so an empty box reads as "inherits
 * this" rather than "is blank". That is the whole distinction the seed model
 * rests on, and it is invisible unless the UI says so.
 */
function geographyRows(scene) {
    const stored = GeographyManager.getRaw(scene);
    const defaults = GeographyManager.getWorldDefaults();

    return GEOGRAPHY_FIELD_LIST.map((field) => {
        const value = typeof stored[field.key] === 'string' ? stored[field.key] : '';
        const fallback = defaults[field.key];
        const placeholder = fallback ? `${fallback} (campaign default)` : 'Not set';
        return `
            <div class="form-group">
                <label>${esc(field.label)}</label>
                <div class="form-fields">
                    <input type="text" name="${esc(fieldName(field.key))}"
                           value="${esc(value)}" placeholder="${esc(placeholder)}" />
                </div>
            </div>`;
    }).join('');
}

/**
 * Habitat checkboxes.
 *
 * The value attribute carries the canonical key and the visible text is the label,
 * which is why the vocabulary is {key, label} rather than bare strings. A checkbox
 * group submits one entry per box with `null` for each unticked one, so the read
 * side must filter against the vocabulary rather than for truthiness -- that is
 * what GeographyManager.normalizeHabitats does, and why nothing here trusts
 * the raw stored array.
 */
function habitatRows(scene) {
    const selected = new Set(GeographyManager.getHabitats(scene));
    const boxes = HABITATS.map((habitat) => `
        <label class="checkbox blacksmith-geography-habitat">
            <input type="checkbox" name="${esc(fieldName('habitat'))}"
                   value="${esc(habitat.key)}" ${selected.has(habitat.key) ? 'checked' : ''} />
            ${esc(habitat.label)}
        </label>`).join('');

    return `
        <div class="form-group stacked">
            <label>Habitat</label>
            <div class="blacksmith-geography-habitats">${boxes}</div>
            <p class="notes">What this place is like. Other Coffee Pub modules read this ${''
                }to decide what can be found here and what it sounds like.</p>
        </div>`;
}

/** The tab body. Synchronous end to end, as the API requires. */
function renderGeographyTab(scene) {
    const breadcrumb = GeographyManager.getBreadcrumb(scene);
    return `
        <div class="blacksmith-geography-tab">
            <p class="notes">
                Where this scene sits. Leave a field empty to inherit the campaign default
                set in Blacksmith's settings.
            </p>
            ${geographyRows(scene)}
            ${breadcrumb ? `<p class="notes blacksmith-geography-breadcrumb"><strong>Path:</strong> ${esc(breadcrumb)}</p>` : ''}
            <hr />
            ${habitatRows(scene)}
        </div>`;
}

/**
 * Register the tab. Called once during ready.
 */
export function initializeSceneGeography() {
    const registered = registerSceneConfigTab(`${MODULE.ID}-geography`, {
        label: 'Geography',
        icon: 'fa-solid fa-mountain-sun',
        moduleId: MODULE.ID,
        render: (scene) => renderGeographyTab(scene)
    });

    if (!registered) {
        postConsoleAndNotification(MODULE.NAME, 'Geography: the Scene Config tab failed to register', '', false, false);
    }
    return registered;
}
