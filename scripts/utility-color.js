// ==================================================================
// ===== COLOR ======================================================
// ==================================================================
//
// One place that turns "whatever a colour setting gave us" into the two forms
// the module actually draws with: a `#RRGGBB` string, and the packed number PIXI
// wants.
//
// It exists because a colour setting does not return a string any more. Settings
// registered with `foundry.data.fields.ColorField` -- which is what gives the
// settings form its native colour picker -- come back through
// `Setting#_castType`, which calls `field.initialize()`
// (`client/documents/setting.mjs:61-71`), and `ColorField#initialize` returns a
// `foundry.utils.Color` (`common/data/fields.mjs:2703-2706`). `Color` extends
// Number, so it has no `.replace`, no `.trim`, and no `.startsWith`.
//
// That is the whole trap, and it fails in two different ways depending on which
// call site you read: `borderHex.replace('#', '0x')` throws, while a
// `typeof raw === 'string'` guard silently falls through to its default and the
// user's chosen colour is simply ignored. Both were live before this file
// existed. Accepting a string, a `Color` and a raw number in one function is
// what stops a third variant appearing the next time a setting changes shape.
//
// ==================================================================

/**
 * Normalize a colour setting value to `#RRGGBB`.
 *
 * Accepts a hex string with or without the leading `#` (3, 6 or 8 digits -- an
 * 8-digit value has its alpha dropped, since every consumer here carries opacity
 * separately), a `foundry.utils.Color`, or a packed number. Anything it cannot
 * read returns the fallback rather than throwing: a wrong colour is a cosmetic
 * fault and an exception in a render path is not.
 *
 * @param {string|number|object|null|undefined} raw
 * @param {string} fallbackHex - Returned when `raw` cannot be read. Give the same
 *   value the setting declares as its default, so a broken read looks like an
 *   unset setting rather than like a different feature.
 * @returns {string} `#RRGGBB`
 */
export function coerceColorToHex(raw, fallbackHex) {
    if (raw == null || raw === '') return fallbackHex;

    if (typeof raw === 'string') {
        const t = raw.trim();
        if (/^#[0-9a-fA-F]{3}$/.test(t)) return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
        if (/^#[0-9a-fA-F]{6}$/.test(t) || /^#[0-9a-fA-F]{8}$/.test(t)) return t.slice(0, 7);
        if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t}`;
        return fallbackHex;
    }

    // A Color, or a packed number. Color extends Number, so one path serves both.
    try {
        const Color = globalThis.foundry?.utils?.Color;
        const c = Color?.from ? Color.from(raw) : raw;
        const n = Number(c);
        if (Number.isFinite(n)) return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
    } catch (_e) {
        /* fall through to the fallback */
    }
    return fallbackHex;
}

/**
 * The same value as the number PIXI takes for a tint or a line colour.
 *
 * @param {string|number|object|null|undefined} raw
 * @param {number} fallbackNumber - e.g. `0xffcc33`.
 * @returns {number}
 */
export function coerceColorToNumber(raw, fallbackNumber) {
    const hex = coerceColorToHex(raw, null);
    if (hex == null) return fallbackNumber;
    const n = Number.parseInt(hex.slice(1), 16);
    return Number.isFinite(n) ? n : fallbackNumber;
}
