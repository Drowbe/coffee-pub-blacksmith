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

    const replacements = [
        { placeholder: '[ADD-CAMPAIGN-NAME-HERE]', value: campaignName },
        { placeholder: '[ADD-RULES-VERSION-HERE]', value: rulesVersion },
        { placeholder: '[ADD-RULEBOOKS-HERE]', value: rulebooks },
        { placeholder: '[ADD-ITEM-SOURCE-HERE]', value: itemSource }
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
        .replace(/\u2018|\u2019|\u201A|\u201B|\u2032/g, "'")
        .replace(/\u201C|\u201D|\u201E|\u201F/g, '"');
}

/** @deprecated Use applyCampaignPlaceholders */
export async function applyItemPromptWithDefaults(itemPrompt) {
    return applyCampaignPlaceholders(itemPrompt);
}
