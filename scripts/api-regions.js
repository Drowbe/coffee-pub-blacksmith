// ==================================================================
// ===== API-REGIONS.JS =============================================
// ==================================================================
//
// Registers a module's Region BEHAVIOUR with Foundry: the entry in a region's Behaviors tab that does
// something when a token walks into, out of or across the shape. Foundry already has the extension point
// (`CONFIG.RegionBehavior.dataModels`); this is the one place that knows its sharp edges, so a satellite
// states WHAT the behaviour is and not how to get Foundry to accept it.
//
// What it holds, so no module has to rediscover it:
//   - It must run during `init`. Foundry builds a scene's RegionBehavior documents long before `ready`, and
//     one whose sub-type it does not yet know gets a `system` that is not the module's model; the next token
//     drag then throws until the world is reloaded. Registering later is refused here, not left to break.
//   - The model class is built inside the call, not at module scope: it extends a Foundry class reached
//     through the `foundry` global, which a module script may be evaluated before.
//   - The name in the Create Behavior list is `CP <Module>: <Label>` for every module in the suite, built here
//     from the module's own title, so two modules cannot name theirs differently.
//   - A behaviour that fires once ("Only once") is switched off by `spend`, which also marks it, so `reset`
//     can switch back on exactly the ones a trigger switched off and leave alone the ones a GM disabled by hand.
//   - A region event fires on EVERY client. A handler runs on the client of the user who caused it unless it
//     says otherwise, so one player stepping into a shop does not open a window for the whole table.
//
// What it cannot do: `module.json` must still declare the sub-type (`documentTypes.RegionBehavior`). Foundry
// reads that file before any script runs. A missing declaration is reported on the console.
//
// See documentation/api/api-regions.md.

import { MODULE } from './const.js';

const BRAND = 'CP';
const NAME = /^[a-z][a-zA-Z0-9]*$/;
/** Who runs a handler. `mover` is the default. */
const RUNS = ['mover', 'activeGM', 'everyone'];

/** `Coffee Pub Merchant` -> `Merchant`. A module whose title does not start that way keeps the whole title. */
function shortName(moduleId) {
    const title = game.modules.get(moduleId)?.title ?? moduleId;
    return title.replace(/^coffee pub\s+/i, '').trim() || title;
}

/** Wraps a handler so it runs only where `run` says. Foundry calls it with the behaviour as `this`. */
function gated(handler, run) {
    return function (event) {
        if (run === 'mover') {
            // An event with no user (a behaviour being switched on, say) has no mover: the active GM takes it,
            // so it runs once and not on every client.
            if (event?.user ? !event.user.isSelf : !game.user?.isActiveGM) return undefined;
        } else if (run === 'activeGM') {
            if (!game.user?.isActiveGM) return undefined;
        }
        return handler.call(this, event);
    };
}

export const RegionsAPI = {

    /**
     * Register a Region behaviour. Call it from your own `init` hook.
     * @param {object} spec
     * @param {string} spec.moduleId - Your module id; it namespaces the type
     * @param {string} spec.name - The sub-type, lower camel case (`openShop`). The type is `<moduleId>.<name>`
     * @param {string} spec.label - Its name, without the module prefix: `Open Merchant`. A localization key is localized
     * @param {string} [spec.icon='fa-solid fa-draw-polygon'] - Font Awesome classes
     * @param {(fields: object) => Record<string, object>} spec.fields - Returns the schema. Receives `foundry.data.fields`, so
     *   nothing at module scope touches Foundry. Give each field a `label` and `hint` that are localization KEYS
     * @param {Record<string, Function | { handler: Function, run?: 'mover'|'activeGM'|'everyone' } | Array<Function | { handler: Function, run?: 'mover'|'activeGM'|'everyone' }>>} [spec.events] - Keyed by
     *   a `CONST.REGION_EVENTS` value (`tokenMoveIn`, `tokenExit`, ...). A handler has the behaviour as `this` and receives
     *   Foundry's event. A bare function runs on the client of the user who caused the event. An array runs its
     *   handlers in order, each with its own `run`
     * @param {() => Promise<boolean|void>} [spec.reset] - Puts back whatever this behaviour changed in the world when `reset` is
     *   called on its region (a tile it hid, say). `this` is the behaviour. Return true if it changed anything. A behaviour
     *   that was switched off by `spend` is switched back on for you, so it needs no `reset` for that
     * @param {string[]} [spec.localizationPrefixes] - Default `['BEHAVIOR.TYPES.<name>', 'BEHAVIOR.TYPES.base']`
     * @returns {string | null} The type (`<moduleId>.<name>`), or null on a Foundry without region behaviours
     * @throws {TypeError} On a bad spec
     * @throws {Error} When called after `init`, or the type is already registered
     */
    registerBehavior(spec) {
        if (!spec || typeof spec !== 'object') throw new TypeError('regions: a spec object is required');
        const { moduleId, name, label, fields: defineFields } = spec;
        if (!moduleId || typeof moduleId !== 'string' || !game.modules.get(moduleId)) throw new TypeError('regions: moduleId must be an installed module id');
        if (typeof name !== 'string' || !NAME.test(name)) throw new TypeError('regions: name must be lower camel case, like openShop');
        if (!label || typeof label !== 'string') throw new TypeError('regions: a label (string) is required');
        if (typeof defineFields !== 'function') throw new TypeError('regions: fields must be a function returning the schema');
        if (spec.icon != null && typeof spec.icon !== 'string') throw new TypeError('regions: icon must be a string');
        if (game.ready) throw new Error(`regions: ${moduleId}.${name} was registered after init. Register from your init hook; later breaks every token move on a scene with this behaviour until the world reloads`);

        const base = foundry?.data?.regionBehaviors?.RegionBehaviorType;
        const fields = foundry?.data?.fields;
        const events = CONST?.REGION_EVENTS;
        if (!base || !fields || !events) {
            console.warn(`${MODULE.NAME} | This Foundry has no region behaviours; ${moduleId}.${name} is not registered.`);
            return null;
        }

        const type = `${moduleId}.${name}`;
        if (CONFIG.RegionBehavior.dataModels[type]) throw new Error(`regions: ${type} is already registered`);

        const known = new Set(Object.values(events));
        const handlers = {};
        for (const [event, entry] of Object.entries(spec.events ?? {})) {
            if (!known.has(event)) throw new TypeError(`regions: ${event} is not a region event (${[...known].join(', ')})`);
            // One event, several jobs: each runs in order, each with its own rule for who runs it.
            const gates = (Array.isArray(entry) ? entry : [entry]).map((item) => {
                const { handler, run = 'mover' } = typeof item === 'function' ? { handler: item } : (item ?? {});
                if (typeof handler !== 'function') throw new TypeError(`regions: the ${event} handler must be a function`);
                if (!RUNS.includes(run)) throw new TypeError(`regions: run must be ${RUNS.map((r) => `'${r}'`).join(', ')}`);
                return gated(handler, run);
            });
            handlers[event] = async function (regionEvent) {
                for (const gate of gates) await gate.call(this, regionEvent);
            };
        }

        class SuiteRegionBehavior extends base {
            static LOCALIZATION_PREFIXES = spec.localizationPrefixes ?? [`BEHAVIOR.TYPES.${name}`, 'BEHAVIOR.TYPES.base'];

            static defineSchema() {
                return defineFields(fields);
            }

            static events = handlers;

            async reset() {
                return spec.reset ? spec.reset.call(this) : false;
            }
        }

        CONFIG.RegionBehavior.dataModels[type] = SuiteRegionBehavior;
        CONFIG.RegionBehavior.typeIcons[type] = spec.icon ?? 'fa-solid fa-draw-polygon';
        // The legend Foundry draws round a third-party schema, the name in a region's behaviour list and the name in the
        // Create Behavior list. That last one only accepts a KEY: createDialog shows the raw type for a label that is
        // not in the translations (`game.i18n.has`). So `typeLabels` points at a key of ours, and the computed name is
        // put in the translations under it.
        //
        // WHEN. `init` fires BEFORE Foundry loads the translations (`game.i18n.initialize()` follows it, then fires
        // `i18nInit`): at `init` the dictionary is empty, a key label does not localize yet, and loading it later
        // replaces the whole object, so anything set now is lost. The text is written at `i18nInit`, the first moment
        // the translations, this module's language file included, are there to read.
        const key = `COFFEEPUB.RegionBehavior.${moduleId}.${name}`;
        CONFIG.RegionBehavior.typeLabels[type] = key;
        Hooks.once('i18nInit', () => {
            foundry.utils.setProperty(game.i18n.translations, key, `${BRAND} ${shortName(moduleId)}: ${game.i18n.localize(label)}`);
        });

        const declared = game.documentTypes?.RegionBehavior;
        if (Array.isArray(declared) && !declared.includes(type)) {
            console.warn(`${MODULE.NAME} | ${type} is registered but ${moduleId}'s module.json does not declare it. Add "documentTypes": { "RegionBehavior": { "${name}": {} } }.`);
        }
        return type;
    },

    /**
     * Switch a behaviour off because it has done its one job, and remember that it was the trigger and not a GM that did it.
     * Use it for "Only once". Run it where a write is allowed: the active GM's client (an `activeGM` handler).
     * @param {RegionBehavior} behavior - The behaviour document (`this.parent` inside a handler)
     * @returns {Promise<RegionBehavior>}
     */
    spend(behavior) {
        if (!behavior || typeof behavior.update !== 'function') throw new TypeError('regions: spend needs a RegionBehavior document');
        return behavior.update({ disabled: true, [`flags.${MODULE.ID}.spent`]: true });
    },

    /**
     * Put a region back to the state before anything triggered it: every behaviour switched off by `spend` is switched
     * back on, and every behaviour that registered a `reset` puts back what it changed. A behaviour a GM disabled by
     * hand is left disabled.
     * @param {RegionDocument|string} region - The region, or its UUID
     * @returns {Promise<{ reenabled: number, restored: number }>} How many behaviours were switched back on, and how many put the world back
     * @throws {Error} When the user is not a GM
     */
    async reset(region) {
        const doc = typeof region === 'string' ? await fromUuid(region) : region;
        if (!doc?.behaviors) throw new TypeError('regions: reset needs a region or a region UUID');
        if (!game.user?.isGM) throw new Error('regions: only a GM can reset a region');

        let reenabled = 0;
        let restored = 0;
        for (const behavior of doc.behaviors) {
            if (await behavior.system?.reset?.()) restored += 1;
            if (behavior.getFlag(MODULE.ID, 'spent')) {
                await behavior.update({ disabled: false, [`flags.${MODULE.ID}.-=spent`]: null });
                reenabled += 1;
            }
        }
        return { reenabled, restored };
    }
};
