import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { registerSceneConfigTab } from './manager-scene-config.js';
import {
    GeographyManager,
    GEOGRAPHY_FLAG,
    GEOGRAPHY_FIELD_LIST,
    HABITATS
} from './manager-geography.js';
import { DarknessManager } from './manager-darkness.js';

// ==================================================================
// ===== GEOGRAPHY TAB (SCENE CONFIG) ===============================
// ==================================================================
//
// Blacksmith is consumer zero for registerSceneConfigTab: this tab goes through
// the same public path Artificer will, with no internal shortcut.
//
// Every input is named for the flag it writes -- `flags.coffee-pub-blacksmith.geography.<field>`
// for the geography rows, and `flags.coffee-pub-blacksmith.darknessFollowsClock` for the
// Time of Day box, which is a sibling of `geography` rather than inside it. Foundry's own
// Scene Config submission persists all of them. There is no submit handler here and no save
// callback on the API -- see api-scene-config.md.

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));

/** Field name Foundry will expand into the flag on submit. */
const fieldName = (key) => `flags.${MODULE.ID}.${GEOGRAPHY_FLAG}.${key}`;

/**
 * Field name for a flag that sits directly under the module, beside `geography`.
 *
 * The darkness opt-in predates this tab and is read by `manager-darkness.js` at its own
 * path, so it is named here rather than moved under `geography`: relocating a flag every
 * existing world already carries would silently switch the driver off for all of them.
 */
const sceneFlagName = (key) => `flags.${MODULE.ID}.${key}`;

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

/**
 * The darkness opt-in, and why it is on this tab.
 *
 * Whether a scene's light follows the sun is a fact about the PLACE -- an alley sees the
 * sky, a cellar does not -- which is the same kind of fact as habitat, and it is the
 * question a GM is already answering when they fill this tab in. It also has to be
 * *somewhere a GM will find it*: it lived only in the world clock's right-click Options
 * submenu, which is not a place anyone looks when configuring a scene. The author of this
 * module could not find it.
 *
 * The clock menu keeps its entry -- it is the fast toggle mid-session and it reports the
 * lock -- so both write this one flag and neither is authoritative over the other.
 */
function timeOfDayRows(scene) {
    const enabled = DarknessManager.isEnabledForScene(scene);

    // The same three settings the first-visit dialog offers to fix, reported here for a
    // scene that was switched on some other way -- through the clock menu, or by ticking
    // this very box on a previous visit. A ticked box that does nothing is the bug this
    // whole section replaces, so the tab has to be able to say WHY it is doing nothing.
    //
    // Reported, never fixed. This tab has no submit handler of its own: it names its
    // inputs and lets Foundry's form submission persist them, so it has nowhere to apply
    // a repair from even if it were entitled to. The dialog is where consent is asked for.
    //
    // The note does NOT name the core tab these live on. It was "Ambience" in v13 and that
    // tab does not survive into v14, whose SceneConfig parts are basics/grid/levels/
    // visibility/environment/misc. Naming a core tab in our copy is a string that rots on
    // somebody else's release schedule, for no gain.
    // Labels only, not the prerequisite notes. Those notes say what a setting BUYS, which
    // is right in the dialog that offers them and reads backwards in a list of what is
    // currently missing. The label already names the action.
    const unmet = enabled ? DarknessManager.getUnmetPrerequisites(scene) : [];
    const warnings = unmet.length
        ? `<div class="blacksmith-geography-lock">
               <p class="notes"><i class="fa-solid fa-triangle-exclamation"></i>
               <strong>This scene follows the clock. To see it happen:</strong></p>
               <ul class="notes">${unmet.map(item => `<li>${esc(item.label)}</li>`).join('')}</ul>
           </div>`
        : '';

    // `stacked`, like the habitat group above it, and for the same reason: a plain
    // `.form-group` is a flex ROW, so a `<p class="notes">` after the fields becomes a
    // third column beside the checkbox and renders as a tall narrow strip of text. The
    // note belongs under the control it explains.
    return `
        <div class="form-group stacked">
            <label>Time of Day</label>
            <label class="checkbox blacksmith-geography-timeofday">
                <input type="checkbox" name="${esc(sceneFlagName(DarknessManager.FLAG))}"
                       ${enabled ? 'checked' : ''} />
                Darkness follows the world clock
            </label>
            <p class="notes">Sunrise and sunset dim and brighten this scene as world time moves.
                Leave this off for interiors and anywhere else that never sees the sky.</p>
            ${warnings}
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
            <hr />
            ${timeOfDayRows(scene)}
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
