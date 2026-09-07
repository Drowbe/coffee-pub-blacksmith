// ==================================================================
// JSON import prompt loading and composition (core + partial + profile)
// ==================================================================

import { CampaignManager } from './manager-campaign.js';

const PROMPT_MODULE_PREFIX = 'modules/coffee-pub-blacksmith/prompts/';

/** @type {Map<string, string>} */
const _promptCache = new Map();

/**
 * Fetch prompt text from this module's prompts folder (cached per path per session).
 * @param {string} filename - e.g. "prompt-item-core.txt"
 * @returns {Promise<string>}
 */
export async function fetchPromptText(filename) {
    const key = String(filename || '').trim();
    if (!key) return '';
    if (_promptCache.has(key)) return _promptCache.get(key);
    const url = `${PROMPT_MODULE_PREFIX}${key}`;
    const text = await (await fetch(url)).text();
    _promptCache.set(key, text);
    return text;
}

/**
 * Concatenate prompt sections with blank lines between non-empty parts.
 * @param {string[]} parts
 * @returns {string}
 */
export function composePrompt(parts) {
    return parts
        .map((p) => String(p ?? '').trim())
        .filter(Boolean)
        .join('\n\n');
}

/**
 * Append optional user-supplied context to a full AI-generation prompt. The
 * boundary makes the guidance useful without allowing it to supersede the
 * import contract that precedes it. Blank guidance adds nothing.
 *
 * @param {string} prompt
 * @param {string} guidance
 * @returns {string}
 */
/**
 * House style, stated to the generator once for every prompt this module builds.
 *
 * WHY IT LIVES IN BLACKSMITH AND NOT IN EACH MODULE. An import prompt is composed here
 * from a declaration's guidance and examples. A satellite can keep its own strings
 * clean, and they do, but nothing a satellite writes can tell the model generating a
 * payload what not to introduce of its own. Four modules writing this separately is
 * four chances for the fifth to forget, so it is said once and every profile registered
 * afterwards inherits it without knowing it exists.
 *
 * APPENDED AT THE DELIVERY POINT rather than inside any one builder. Four kind-level
 * builders (journals, items, actors, roll tables) and every declaration-driven profile
 * produce prompt text by different routes, and `buildPromptSchemaText` is a COMPONENT
 * that items compose into a larger prompt, so putting it there would repeat it inside
 * itself. `_buildSelectedPrompt` is the one place all of them meet.
 *
 * PHRASED AS A SUBSTITUTION, NOT A PROHIBITION. "Do not use em dashes" leaves a model
 * to pick a replacement and it often picks a comma splice or a parenthesis. Naming the
 * alternatives is what makes the instruction act on the output.
 *
 * AND THE TEXT AROUND IT HAS TO OBEY IT. A prompt is the largest sample of house voice
 * a generator sees, so an instruction delivered inside prose that breaks it argues with
 * its own demonstration. Everything composed into a prompt uses `--` where a dash is
 * genuinely wanted, which is the convention the documentation and code comments already
 * use, so there is one house style rather than a prompt-only dialect.
 */
const HOUSE_STYLE = `========================================
HOUSE STYLE
========================================

Applies to every piece of prose you write, including names, titles and headings.

- Do not use em dashes or en dashes. Use a comma, a colon, or a full stop instead.
- Do not use emoji, emoticons, or decorative symbols.
- Write plain prose. No markdown emphasis, no bold, no italics, and no bullet glyphs
  inside a field value unless that field's guidance says it takes formatted text.`;

/**
 * Add the house style to a finished prompt. Called at the single point every prompt
 * passes through on its way to the clipboard or a text file.
 *
 * @param {string} prompt
 * @returns {string}
 */
export function appendHouseStyle(prompt) {
    const base = String(prompt ?? '').trim();
    if (!base) return base;
    return composePrompt([base, HOUSE_STYLE]);
}

export function appendAdditionalUserGuidance(prompt, guidance) {
    const base = String(prompt ?? '').trim();
    const text = String(guidance ?? '').trim();
    if (!text) return base;
    return composePrompt([
        base,
        `========================================
ADDITIONAL USER GUIDANCE
========================================

Use this guidance to shape the generated content. It may add context, preferences, and constraints, but it must not override the JSON schema, output format, exact catalog-name rules, or validation requirements.

${text}`
    ]);
}

/**
 * Replace campaign placeholders used across import prompts.
 * @param {string} prompt
 * @param {{ campaignName?: string; rulesVersion?: string; rulebooks?: string; itemSource?: string }} [extra]
 * @returns {Promise<string>}
 */
export async function applyCampaignPlaceholders(prompt, extra = {}) {
    const context = CampaignManager.getPromptContext();
    const campaignName = extra.campaignName ?? context.campaignName ?? '';
    const rulesVersion = extra.rulesVersion ?? context.rulesVersion ?? '';
    const rulebooks = extra.rulebooks ?? context.rulebooks ?? '';
    const itemSource = extra.itemSource ?? campaignName;

    const actorsSource = extra.actorsSource ?? campaignName;

    const replacements = [
        { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', value: campaignName },
        { placeholder: '[ADD-RULES-VERSION-HERE]', value: rulesVersion },
        { placeholder: '[ADD-RULEBOOKS-HERE]', value: rulebooks },
        { placeholder: '[ADD-ITEM-SOURCE-HERE]', value: itemSource },
        { placeholder: '[ADD-ACTORS-SOURCE-HERE]', value: actorsSource },
        { placeholder: '[ADD-NPC-SOURCE-HERE]', value: actorsSource },
        // Party context — derived from the configured party actors (see CampaignManager).
        { placeholder: '[ADD-PARTY-NAME-HERE]', value: context.partyName },
        { placeholder: '[ADD-PARTY-SIZE-HERE]', value: context.partySize },
        { placeholder: '[ADD-PARTY-LEVEL-HERE]', value: context.partyLevel },
        { placeholder: '[ADD-PARTY-MAKEUP-HERE]', value: context.partyMakeup },
        { placeholder: '[ADD-PARTY-CLASSES-HERE]', value: context.partyClasses }
    ];

    let result = String(prompt ?? '');
    for (const { placeholder, value } of replacements) {
        if (value) {
            result = result.split(placeholder).join(value);
        }
    }
    return result;
}

/**
 * Replace curly/typographic quotes with straight ASCII before JSON.parse.
 * @param {string} str
 * @returns {string}
 */
export function normalizeStraightQuotesForJson(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/\uFEFF/g, '')
        .replace(/\u2018|\u2019|\u201A|\u201B|\u2032/g, "'")
        .replace(/\u201C|\u201D|\u201E|\u201F/g, '"');
}

/**
 * Strip markdown code fences and trim before JSON.parse (common when pasting from chat).
 * @param {string} str
 * @returns {string}
 */
export function stripJsonMarkdownFences(str) {
    let s = String(str ?? '').trim();
    if (!s.startsWith('```')) return s;
    s = s.replace(/^```[a-zA-Z]*\s*\r?\n?/, '');
    s = s.replace(/\r?\n?```\s*$/, '');
    return s.trim();
}

/**
 * Normalize pasted import JSON text for parsing.
 * @param {string} str
 * @returns {string}
 */
export function prepareJsonImportText(str) {
    return stripJsonMarkdownFences(normalizeStraightQuotesForJson(str));
}

/** @deprecated Use applyCampaignPlaceholders */
export async function applyItemPromptWithDefaults(itemPrompt) {
    return applyCampaignPlaceholders(itemPrompt);
}
