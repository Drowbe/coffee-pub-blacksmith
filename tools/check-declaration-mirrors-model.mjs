// ==================================================================
// check-declaration-mirrors-model.mjs
// ==================================================================
// HOSTED IN BLACKSMITH, USED BY ANY MODULE that registers an import profile for
// a document subtype it owns. Written by the Bibliosoph session while adopting
// the seam, and moved here because it is generic: no Foundry globals, no
// filesystem, no knowledge of injuries or of any other module.
//
// THE INVARIANT. For a module-owned subtype there are two schemas, and the
// module's registered DataModel is the senior one -- Foundry runs it on create.
// A declaration describing a SUBSET of the model does not fail loudly: the
// document lands and every undescribed field takes the model's `initial`. A
// declaration describing something the model rejects fails at create instead.
// Either way the declaration is a description that can drift from the thing it
// describes, and nothing else compares them.
//
// It pairs with `api.importer.declarationFromModel`, which derives a declaration
// from the same schema. That pairing is deliberate: the walk gives machine shape
// for free, which makes it easy to ship a complete schema with NO human layer at
// all -- and this refuses that, because a field with no guidance reaches an
// author as a bare name.
//
// Two design choices worth preserving, both the author's:
//
//   `knownTransforms` is CALLER-SUPPLIED rather than imported from Blacksmith's
//   vocabulary. A name-equality check would pass while two implementations
//   diverged, which is the exact failure this exists to catch; a caller mirroring
//   the transforms it actually uses gets a behavioural comparison instead.
//
//   `shippedContainerNames` being absent SAYS SO in the notes rather than passing
//   quietly. Without it the check only proves the profile agrees with itself, and
//   a green run that proves less than it appears to is worse than a yellow one.
//
// THERE IS EXACTLY ONE OF THIS FILE, and consumers import it as
// `api/check-declaration-mirrors-model.mjs`. That is not a "keep these in sync"
// note, which is what a fork always says on its way to diverging -- it is that a
// second copy has no supported way to be imported and so has no reason to exist.
//
// It forked once, and the manner is worth knowing. Two sessions improved two
// copies through each other, and the file changed three times inside ninety
// seconds; a grep, a sed and a diff run against it each read a different version,
// and both parties reported a defect that had been fixed before the message
// arrived. Neither report was careless. A file edited by one party and diffed by
// another moves faster than a message round-trip, and the only fix is that edits
// land where the other party already looks.
//
// EVERY CHECK HERE IS FOR A FAILURE THAT IS SILENT IN PRODUCTION. None of them
// catch a crash; all of them catch a document that looks fine. That is the test
// for whether a new check belongs here -- if the failure it describes would throw,
// something else already catches it.
//
// Verified on adoption against a `declarationFromModel` output: passes with a
// complete human layer, and goes red on a stricter bound and a dropped enum value.
// ==================================================================

/**
 * @param {object}   options
 * @param {object}   options.schema         the model's defineSchema() output
 * @param {object}   options.declaration    the registered declaration
 * @param {string}   options.titleField     declared field carrying the document NAME,
 *                                          which has no counterpart in the model
 * @param {string}   options.expectedType   the subtype the module's module.json registers
 * @param {string}  [options.expectedDocumentName]  'JournalEntryPage' for a page-building profile
 * @param {object}  [options.knownTransforms]       transform name -> implementation, for the
 *                                          container transforms this caller actually uses
 * @param {Function}[options.expectedContainerName] (value) => the container name this module
 *                                          expects, e.g. its own display function
 * @param {string}  [options.expectedSelector] the payload key a kind routes on, e.g. 'journaltype'.
 *                                          Supply it for a kind that routes by selector; omit it
 *                                          otherwise. See the note in the header.
 * @param {Set}     [options.shippedContainerNames] container names the module's compendium
 *                                          actually ships, if they can be read
 * @returns {{errors: string[], notes: string[]}}
 */
export function checkDeclarationMirrorsModel({
    schema,
    declaration,
    titleField = 'title',
    expectedType,
    expectedDocumentName = 'JournalEntryPage',
    knownTransforms = {},
    expectedContainerName = null,
    expectedSelector = null,
    shippedContainerNames = null
} = {}) {
    const errors = [];
    const notes = [];

    const fields = declaration?.fields ?? [];
    // The title and the SELECTOR are both routing metadata rather than content: the
    // first names the document, the second says which profile a payload is. Neither
    // exists in the model, so neither is paired against it. Excluding the title was
    // always here; the selector had to join it the moment selectors were checked at
    // all, or a correct profile failed for declaring the very field it needs.
    // ANY roled field, not just a selector. Blacksmith's typedef says all three --
    // `selector`, `input`, `envelope` -- land nowhere on the document, so none of
    // them pairs against a model. Excluding only `selector` fixed the case in front
    // of us and left `input` and `envelope` to fail the same false rejection later,
    // which a Blacksmith journal profile would have hit today.
    const isRoled = (f) => typeof f.role === 'string' && f.role.length > 0;
    const declared = fields.filter((f) => f.name !== titleField && !isRoled(f));
    const declaredNames = declared.map((f) => f.name);
    const modelNames = Object.keys(schema ?? {});

    // ---- The document name carries the title ----------------------

    if (!fields.some((f) => f.name === titleField)) {
        errors.push(`No \`${titleField}\` field: nothing would set the document name.`);
    }

    // ---- Field sets pair up, both directions ----------------------

    for (const name of modelNames) {
        if (!declaredNames.includes(name)) {
            errors.push(`\`${name}\` is in the model but not the declaration: it would import silently defaulted.`);
        }
    }
    for (const name of declaredNames) {
        if (!modelNames.includes(name)) {
            errors.push(`\`${name}\` is in the declaration but not the model: it would be discarded on construction.`);
        }
    }

    // ---- No declared constraint may be STRICTER than the model ----
    //
    // A declaration tighter than the model rejects at import what the
    // module's own sheet accepts -- the same document legal to edit and
    // illegal to import, which is two readers of one contract disagreeing.
    // Advisory ranges belong in `guidance`, where they inform without
    // creating a second, harsher validator.

    for (const field of declared) {
        const modelField = schema[field.name];
        if (!modelField) continue;

        if (field.min !== undefined && modelField.min !== undefined && field.min > modelField.min) {
            errors.push(`\`${field.name}\` declares min ${field.min}, stricter than the model's ${modelField.min}.`);
        }
        if (field.max !== undefined && modelField.max !== undefined && field.max < modelField.max) {
            errors.push(`\`${field.name}\` declares max ${field.max}, stricter than the model's ${modelField.max}.`);
        }
        if (modelField.nullable && field.nullable !== true) {
            errors.push(`\`${field.name}\` is nullable in the model but not the declaration; null would be read as absence.`);
        }
        if (modelField.choices) {
            const allowed = Object.keys(modelField.choices);
            const values = field.values ?? [];
            const missing = allowed.filter((v) => !values.includes(v));
            if (missing.length) {
                errors.push(`\`${field.name}\` omits legal value(s) the model accepts: ${missing.join(', ')}.`);
            }
            const bogus = values.filter((v) => !allowed.includes(v));
            if (bogus.length) {
                errors.push(`\`${field.name}\` declares value(s) the model rejects: ${bogus.join(', ')}.`);
            }
        }
    }

    // ---- Guidance is one sentence, by contract --------------------
    //
    // It feeds the template comment, the guide line and the generation
    // prompt alike, so a paragraph is a Blacksmith-side change rather than
    // something to smuggle past with semicolons.

    const walkGuidance = (list, prefix = '') => {
        for (const field of list) {
            const label = prefix + field.name;
            if (!field.guidance) {
                errors.push(`\`${label}\` has no guidance; it would reach an author as a bare field name.`);
            } else if ((field.guidance.match(/\.(\s|$)/g) || []).length > 1) {
                errors.push(`\`${label}\` guidance is more than one sentence.`);
            }
            if (field.fields) walkGuidance(field.fields, `${label}.`);
        }
    };
    walkGuidance(fields);

    // An explicit example on an array field overrides the worked element
    // derived from the nested fields, which is worse for an author.
    for (const field of fields) {
        if (field.type === 'array' && field.example !== undefined) {
            errors.push(`\`${field.name}\` sets an explicit example, which overrides the derived worked element.`);
        }
    }

    // ---- The document shape ---------------------------------------

    const doc = declaration?.document ?? {};
    if (doc.documentName !== expectedDocumentName) {
        errors.push(`documentName is \`${doc.documentName}\`; a profile whose fields ARE the document must declare ${expectedDocumentName}.`);
    }
    if (doc.type !== expectedType) {
        errors.push(`Declared type is \`${doc.type}\`, which is not the subtype module.json registers.`);
    }
    if (expectedDocumentName === 'JournalEntryPage' && doc.pageType !== undefined) {
        errors.push('`pageType` is the entry-building spelling; a page-building profile declares `type`.');
    }

    // ---- The container -------------------------------------------
    //
    // A page files into an entry named from a declared field, optionally
    // transformed. Getting that name wrong does not fail: it lands the
    // page in a NEW entry beside the existing one, so a world ends up
    // holding both and every lookup sees half the data.

    if (!doc.containerNameFrom) {
        errors.push('No containerNameFrom: the built page would have no container to land in.');
    } else if (!declaredNames.includes(doc.containerNameFrom) && doc.containerNameFrom !== titleField) {
        errors.push(`containerNameFrom names \`${doc.containerNameFrom}\`, which is not a declared field.`);
    }

    // Superseded spellings are named rather than ignored: a declaration
    // written against an older shape of this contract is exactly the
    // silent-inert case this whole file exists for.
    if (doc.containerNameFormat !== undefined) {
        errors.push('`containerNameFormat` was the superseded spelling; the field is `containerNameTransform` and takes a named transform.');
    }

    const transform = doc.containerNameTransform;
    const containerField = fields.find((f) => f.name === doc.containerNameFrom);
    const containerValues = containerField?.values ?? [];

    // A NESTED field carries no document path: its parent owns the path and
    // the nesting only describes the shape of the value. Registration
    // enforces this, so a nested `path` is a registration failure rather
    // than a harmless extra key.
    //
    // The converse is just as load-bearing and is the easier one to lose: a
    // TOP-LEVEL field must have a path even when its value is nested, or the
    // importer has nowhere to write it and the whole field is dropped from
    // every imported document without complaint.
    const walkPaths = (list, depth = 0, prefix = '') => {
        for (const field of list) {
            const label = prefix + field.name;
            if (depth > 0 && field.path !== undefined) {
                errors.push(`\`${label}\` is nested and carries a path; its parent owns the document path.`);
            }
            if (depth === 0 && !field.path && !isRoled(field)) {
                errors.push(`\`${label}\` has no path: the importer would have nowhere to write it, and it would be dropped from every imported document.`);
            }
            if (depth === 0 && field.path && isRoled(field)) {
                errors.push(`\`${label}\` has role \`${field.role}\` and a path; a roled field never lands on a document path of its own.`);
            }
            if (field.fields) walkPaths(field.fields, depth + 1, `${label}.`);
        }
    };
    walkPaths(fields);

    // ---- The profile can be selected at all ----------------------
    //
    // A kind that routes by selector reaches a profile only through a declared
    // `role: 'selector'` field whose values include the profile's own id. A profile
    // missing one registers, validates, and is then unreachable: the payload falls
    // through to whatever the kind did before declarations, and the author sees an
    // error about a field they never heard of.
    //
    // Checked HERE and not in Blacksmith's registry on purpose. The registry does
    // not know which kinds route by a selector, and demanding one everywhere would
    // leak the journal kind's rule into every kind -- Blacksmith's own Item profiles
    // share one `itemType` selector across eight profiles without enumerating it.
    // The consumer knows which kind it is registering for; the registry does not.
    if (expectedSelector) {
        const selectors = (declaration?.fields ?? []).filter((f) => f.role === 'selector');
        if (!selectors.length) {
            errors.push(`No \`role: 'selector'\` field. The \`${declaration?.kind}\` kind routes on `
                + `\`${expectedSelector}\`, so this profile could never be selected by a payload.`);
        } else if (selectors.length > 1) {
            errors.push(`${selectors.length} selector fields (${selectors.map((f) => f.name).join(', ')}); `
                + `a profile is chosen by exactly one.`);
        } else {
            const selector = selectors[0];
            if (selector.name !== expectedSelector) {
                errors.push(`Selector is named \`${selector.name}\`, but the \`${declaration?.kind}\` `
                    + `kind routes on \`${expectedSelector}\`.`);
            }
            // Only when the selector ENUMERATES. An absent list is legitimate and
            // documented -- Blacksmith's eight Item profiles share one `itemType`
            // selector without restating the types -- so a missing list contradicts
            // nothing. Without this guard the checker rejects all eight for doing the
            // documented thing, which is the registry's own rule the checker beside
            // it was failing to match.
            const values = Array.isArray(selector.values) ? selector.values : null;
            if (values && !values.includes(declaration?.id)) {
                errors.push(`Selector \`${selector.name}\` lists ${values.join(', ') || '(nothing)'} `
                    + `and not \`${declaration?.id}\`, so no payload could select this profile.`);
            }
        }
    }

    if (expectedContainerName && containerValues.length) {
        if (!transform) {
            const wouldDiffer = containerValues.filter((v) => expectedContainerName(v) !== v);
            if (wouldDiffer.length) {
                errors.push(`No containerNameTransform, but ${wouldDiffer.length} of ${containerValues.length} container value(s) need one (e.g. \`${wouldDiffer[0]}\` should name \`${expectedContainerName(wouldDiffer[0])}\`).`);
            }
        } else if (!knownTransforms[transform]) {
            // An unknown name is an error rather than a shrug: a typo is
            // the failure being avoided, and a build going red over a
            // transform since added is loud and one line to fix, where a
            // false green is neither.
            errors.push(`Transform \`${transform}\` is not one this checker knows (${Object.keys(knownTransforms).join(', ') || 'none supplied'}); if it has been added, teach it here rather than dropping the check.`);
        } else {
            const apply = knownTransforms[transform];
            for (const value of containerValues) {
                const produced = apply(value);
                const expected = expectedContainerName(value);
                if (produced !== expected) {
                    errors.push(`Container name for \`${value}\` transforms to \`${produced}\`, but this module expects \`${expected}\`.`);
                }
            }
            if (shippedContainerNames?.size) {
                const orphans = containerValues.map(apply).filter((name) => !shippedContainerNames.has(name));
                if (orphans.length) {
                    errors.push(`Import would create container(s) beside the shipped data rather than into it: ${orphans.join(', ')}.`);
                } else {
                    notes.push(`all ${containerValues.length} container names match shipped containers`);
                }
            } else {
                notes.push('shipped container names unavailable; container check proves agreement with this module only');
            }
        }
    }

    notes.push(`${modelNames.length} model fields, ${declaredNames.length} declared (+ ${titleField} -> document name)`);
    notes.push(`builds ${doc.documentName} of type ${doc.type}`);
    notes.push(`container from \`${doc.containerNameFrom}\`, transform ${transform ?? 'none'}`);

    return { errors, notes };
}
