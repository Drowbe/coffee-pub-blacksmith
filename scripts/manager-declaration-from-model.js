// ==================================================================
// ===== DECLARATION FROM A DATA MODEL ==============================
// ==================================================================
// Build a declaration by WALKING a Foundry DataModel schema, instead of asking
// a module to transcribe its own schema into a second format.
//
// WHY. A module that declares a document subtype already has a `TypeDataModel`,
// and Foundry's field instances already carry everything a declaration needs:
// `required`, `nullable`, `blank`, `initial`, `choices`, `integer`, `min`, `max`,
// and, for `SchemaField` and `ArrayField`, the nested fields themselves. Asking
// for that a second time by hand produces the failure this whole model exists to
// end -- a copied enum that goes stale the first time the owner adds a value.
//
// Proposed by Bibliosoph while adopting the seam, and taken because it is
// general: it works for any module with a subtype, and the module supplies only
// what a schema cannot express.
//
// WHAT A MODULE STILL SUPPLIES, and it is the real seam: the HUMAN layer, keyed
// by dotted path -- one sentence of guidance per field, and an example. Machine
// shape is introspectable; intent is not.
//
// THIS IS A BUILDER, NOT A SECOND REGISTRATION PATH. It returns a plain
// declaration object which the caller then passes to `registerDeclaration`,
// where it meets exactly the same validation every other profile meets. Making
// `registerDeclaration` polymorphic would have given the registry two front
// doors, and Blacksmith is consumer zero of the one that already exists.
// ==================================================================

/** Foundry's field classes, by the declaration type they map onto. */
function typeOfField(field) {
    const name = field?.constructor?.name ?? '';
    if (name.includes('Schema')) return 'object';
    if (name.includes('Array') || name.includes('Set')) return 'array';
    if (name.includes('Boolean')) return 'boolean';
    if (name.includes('Number')) return field.integer ? 'integer' : 'number';
    // Everything else authored -- StringField, DocumentIdField, FilePathField,
    // HTMLField, ColorField -- is a string as far as a payload is concerned.
    return 'string';
}

/**
 * The nested field map of a schema-ish field, or null.
 *
 * `SchemaField` holds `.fields`; an `ArrayField` of schemas holds its element in
 * `.element`, which is itself the schema field. Both are walked the same way, so
 * a nested shape produces nested descriptors and, downstream, dotted-path errors
 * and a worked template element -- none of which needs special casing here.
 */
function nestedFieldsOf(field) {
    if (field?.fields && typeof field.fields === 'object') return field.fields;
    const element = field?.element;
    if (element?.fields && typeof element.fields === 'object') return element.fields;
    return null;
}

/**
 * One field descriptor from one Foundry field instance.
 * @param {string} key - The field's own key.
 * @param {object} field - The Foundry field instance.
 * @param {string} dotted - The field's dotted path within the model, for the human layer.
 * @param {object} human - { guidance: {path: string}, examples: {path: *} }
 * @param {string} pathPrefix - Where the model's data lands on the document.
 * @returns {object} A declaration field descriptor.
 */
function descriptorFor(key, field, dotted, human, pathPrefix) {
    const type = typeOfField(field);
    const descriptor = { name: key, type };

    // `required` alone is not the whole story for a string: Foundry's
    // `blank: false` is what actually forbids an empty value, and a required
    // field that permits blank is satisfied by "".
    if (field.required === true && field.blank !== true) descriptor.required = true;
    if (field.nullable === true) descriptor.nullable = true;

    // `initial` is the model's default, and a function initial is computed per
    // document rather than being a value, so it is not carried across.
    if (field.initial !== undefined && typeof field.initial !== 'function') {
        descriptor.default = field.initial;
    }
    if (field.choices) {
        descriptor.values = Array.isArray(field.choices)
            ? [...field.choices]
            : Object.keys(field.choices);
    }
    if (typeof field.min === 'number') descriptor.min = field.min;
    if (typeof field.max === 'number') descriptor.max = field.max;

    const guidance = human.guidance?.[dotted];
    if (guidance) descriptor.guidance = guidance;
    const example = human.examples?.[dotted];
    if (example !== undefined) descriptor.example = example;

    // The path is decided by whether this field IS a nested child, never by whether
    // it HAS nested shape. Those are different questions and conflating them in an
    // `else` cost `modifiers` its path: a top-level ArrayField of schemas got no
    // `system.modifiers`, so the importer had nowhere to write it and dropped it
    // from every document, silently. A child is suppressed by its own prefix being
    // null, which is set on the recursion below -- one level down from here.
    if (pathPrefix !== null) descriptor.path = `${pathPrefix}${key}`;

    const nested = nestedFieldsOf(field);
    if (nested) {
        // `null` prefix: a nested field carries no path of its own. Its parent owns
        // the document path and the nesting describes the shape of the value, which
        // is the same rule registration enforces.
        descriptor.fields = Object.entries(nested).map(([childKey, childField]) =>
            descriptorFor(childKey, childField, `${dotted}.${childKey}`, human, null));
        // An explicit `example` on a shaped field would defeat the worked element
        // the nesting produces.
        delete descriptor.example;
    }
    return descriptor;
}

/**
 * Build a declaration from a Foundry DataModel schema.
 *
 * @param {object} schema - `Model.defineSchema()` output, or a model class with one.
 * @param {object} options
 * @param {string} options.kind - Host kind id.
 * @param {string} options.id - Profile id.
 * @param {string} options.label
 * @param {string} [options.module] - Owning module id.
 * @param {object} options.document - { documentName, type, containerNameFrom, ... }
 * @param {string} [options.pathPrefix='system.'] - Where the model's data lands.
 * @param {Record<string,string>} [options.guidance] - One sentence per DOTTED PATH.
 * @param {Record<string,*>} [options.examples] - Template values per dotted path.
 * @param {object[]} [options.extraFields] - Descriptors the model cannot express --
 *        the page name, a container selector, anything not in `system`.
 * @param {object[]} [options.rules]
 * @param {string[]} [options.derive]
 * @returns {object} A declaration, ready for `registerDeclaration`.
 */
export function declarationFromModel(schema, options = {}) {
    const resolved = typeof schema === 'function'
        ? schema.defineSchema?.()
        : (schema?.defineSchema?.() ?? schema);
    if (!resolved || typeof resolved !== 'object') {
        throw new Error('declarationFromModel: expected a schema object or a model class with defineSchema()');
    }
    const {
        kind, id, label, module, document,
        pathPrefix = 'system.', guidance = {}, examples = {},
        extraFields = [], rules, derive
    } = options;

    const human = { guidance, examples };
    const fields = Object.entries(resolved)
        .map(([key, field]) => descriptorFor(key, field, key, human, pathPrefix));

    return {
        kind, id, label, schemaVersion: 1, form: 'mapped',
        ...(module ? { module } : {}),
        document,
        // The module's own descriptors come FIRST so a name collision resolves in
        // their favour: the page name and the container selector are theirs to
        // define, and the model has no opinion about either.
        fields: [...extraFields, ...fields],
        ...(rules ? { rules } : {}),
        ...(derive ? { derive } : {})
    };
}
