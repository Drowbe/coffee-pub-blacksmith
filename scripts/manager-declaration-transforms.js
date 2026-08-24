// ==================================================================
// ===== DECLARATION TRANSFORMS =====================================
// ==================================================================
// Named conversions a declaration SELECTS but never supplies. Blacksmith
// owns compatibility with Foundry and dnd5e, so a system-shaped derivation
// is ours by definition; a module that needs one which does not exist asks
// for it, and that is one of the two narrow places where negotiation
// survives (plan-importer-api.md, "Where negotiation actually remains").
//
// A transform receives the authored value and a context, and returns the
// value to write. Returning `undefined` means WRITE NOTHING -- which is how
// an empty GM note leaves no flag behind rather than an empty envelope.
//
// Transforms may be async and may read the whole entry, because some of
// them genuinely need it: the icon guess reads the item's name and
// description, not just the blank path it is replacing.
// ==================================================================

import { GMNotesManager } from './manager-gmnotes.js';
import { guessIconPath } from './parsers/parse-item.js';
import { issue } from './utility-import-issues.js';

/**
 * Thrown by a transform so the failure reaches the result envelope with a code
 * and a path rather than as a bare message. Carries a structured issue.
 */
export class TransformError extends Error {
    /**
     * @param {string} code
     * @param {string} path
     * @param {string} message
     * @param {object} [details]
     */
    constructor(code, path, message, details = {}) {
        super(message);
        this.name = 'TransformError';
        this.issue = issue(code, path, message, details, 'convert');
    }
}

/**
 * Price as an amount plus a coin abbreviation, into dnd5e's stored shape.
 * Mirrors parseItemPrice in parsers/parse-item.js; the difference is that a
 * failure here names the field instead of throwing an untyped Error.
 * @param {*} value
 * @param {{field: object}} context
 * @returns {{value: number, denomination: string}}
 */
function price(value, { field }) {
    if (value == null || String(value).trim() === '') {
        return { value: 0, denomination: 'gp' };
    }
    const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(gp|sp|cp|ep|pp)?$/i);
    if (!match) {
        throw new TransformError('PRICE_UNPARSEABLE', field.name,
            `Unsupported ${field.name} "${value}"; use a value such as "50 GP".`,
            { actual: value });
    }
    return { value: Number(match[1]), denomination: (match[2] || 'gp').toLowerCase() };
}

/**
 * GM notes HTML into Blacksmith's envelope. Blank writes nothing at all, so an
 * item authored without notes carries no flag rather than an empty one.
 * @param {*} value
 * @returns {object|undefined}
 */
function gmNotes(value) {
    const html = typeof value === 'string' ? value : '';
    if (!html.trim()) return undefined;
    return GMNotesManager.buildEnvelope({ html });
}

/**
 * An explicit artwork path, or a guess from the item's name and description.
 * @param {*} value
 * @param {{entry: object}} context
 * @returns {Promise<string>}
 */
async function itemIcon(value, { entry }) {
    const supplied = typeof value === 'string' ? value.trim() : '';
    if (supplied) return supplied;
    return guessIconPath(entry);
}

/**
 * The magical flag, as dnd5e's physical-item property list.
 * @param {*} value
 * @returns {string[]}
 */
function magicalProperty(value) {
    return value ? ['mgc'] : [];
}

/** @type {Record<string, Function>} */
const TRANSFORMS = { price, gmNotes, itemIcon, magicalProperty };

/**
 * Whether a named transform exists. Used by the registry so a declaration naming
 * a transform Blacksmith does not have is rejected at registration.
 * @param {string} name
 * @returns {boolean}
 */
export function hasTransform(name) {
    return Object.prototype.hasOwnProperty.call(TRANSFORMS, name);
}

/**
 * Apply a named transform.
 * @param {string} name
 * @param {*} value
 * @param {{entry: object, field: object, declaration: object}} context
 * @returns {Promise<*>}
 */
export async function applyTransform(name, value, context) {
    const transform = TRANSFORMS[name];
    if (!transform) {
        throw new TransformError('UNKNOWN_TRANSFORM', context?.field?.name ?? '',
            `No transform named "${name}" is registered.`);
    }
    return transform(value, context);
}

/** Every registered transform name, for capability reporting. */
export function transformNames() {
    return Object.keys(TRANSFORMS);
}
