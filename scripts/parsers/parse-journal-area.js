// ==================================================================
// Area journal JSON (blocks envelope) → Foundry HTML page content
// ==================================================================

import {
    buildFoundryBreadcrumb,
    buildFoundryBulletList,
    buildFoundryLabelBullet,
    buildFoundryLabeledSection,
    buildFoundryListItem,
    escapeJournalHtml,
    isJournalHtmlFragment,
    normalizeFoundryJournalHtml
} from '../utility-journal-html.js';
import { toSentenceCase } from '../api-core.js';
import { CampaignManager } from '../manager-campaign.js';

function omitIfNone(value) {
    if (value == null) return '';
    const s = String(value).trim();
    if (!s || s.toLowerCase() === 'none') return '';
    return s;
}

function unescapeQuotes(value) {
    return typeof value === 'string' ? value.replace(/\\"/g, '"') : value;
}

function asStringArray(value) {
    if (value == null) return [];
    if (Array.isArray(value)) {
        return value.map((v) => String(v ?? '').trim()).filter(Boolean);
    }
    const s = String(value).trim();
    return s ? [s] : [];
}

const NON_ITEM_INTERACTIVE_LABELS = new Set([
    'trap', 'hazard', 'lever', 'puzzle', 'environment', 'door', 'container',
    'object', 'interaction', 'secret', 'mechanism', 'alarm', 'hidden'
]);

/**
 * @param {string} label
 * @returns {boolean}
 */
function isNonItemInteractiveLabel(label) {
    return NON_ITEM_INTERACTIVE_LABELS.has(String(label ?? '').trim().toLowerCase());
}

/**
 * @param {string[]} lines
 * @returns {Promise<string[]>}
 */
/**
 * Item lookup: drop parenthetical qualifiers for compendium search.
 * @param {string} displayName
 * @returns {string}
 */
function itemLookupName(displayName) {
    const name = String(displayName ?? '').trim();
    if (!name) return '';
    const stripped = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return stripped || name;
}

function itemLinkWithDisplayLabel(linked, lookupName, displayName) {
    if (!linked.includes('@UUID') || lookupName === displayName) return linked;
    return linked.replace(`{${lookupName}}`, `{${displayName}}`);
}

async function linkItemLines(lines) {
    const { buildCompendiumLinkItem } = await import('../utility-common.js');
    const out = [];
    for (const line of lines) {
        const raw = String(line ?? '').trim();
        if (!raw) continue;
        if (isJournalHtmlFragment(raw)) {
            out.push(raw);
            continue;
        }
        const dash = raw.match(/^(.+?)\s*[—–-]\s*(.+)$/);
        if (dash) {
            const displayName = dash[1].trim();
            const blurb = dash[2].trim();
            if (isNonItemInteractiveLabel(displayName)) {
                out.push(`<strong>${escapeJournalHtml(displayName)}</strong> - ${escapeJournalHtml(blurb)}`);
            } else {
                const lookup = itemLookupName(displayName);
                const linked = itemLinkWithDisplayLabel(
                    await buildCompendiumLinkItem(lookup),
                    lookup,
                    displayName
                );
                const nameHtml = linked.includes('@UUID') ? linked : escapeJournalHtml(displayName);
                out.push(`<strong>${nameHtml}</strong> - ${escapeJournalHtml(blurb)}`);
            }
        } else {
            const displayName = raw;
            const lookup = itemLookupName(displayName);
            const linked = itemLinkWithDisplayLabel(
                await buildCompendiumLinkItem(lookup),
                lookup,
                displayName
            );
            out.push(linked.includes('@UUID') ? linked : escapeJournalHtml(displayName));
        }
    }
    return out;
}

/**
 * Compendium lookup name: strip trailing tag like (BCOD) but keep CR-style parentheses.
 * @param {string} displayName
 * @returns {string}
 */
function actorLookupName(displayName) {
    const name = String(displayName ?? '').trim();
    if (!name) return '';
    if (/\(CR\s*[\d/]/i.test(name)) return name;
    const stripped = name.replace(/\s*\([A-Za-z][A-Za-z0-9\s\-']*\)\s*$/, '').trim();
    return stripped || name;
}

/**
 * Prefer UUID link for lookup name but keep display label in the anchor text.
 * @param {string} linked
 * @param {string} lookupName
 * @param {string} displayName
 * @returns {string}
 */
function actorLinkWithDisplayLabel(linked, lookupName, displayName) {
    if (!linked.includes('@UUID') || lookupName === displayName) return linked;
    return linked.replace(`{${lookupName}}`, `{${displayName}}`);
}

/**
 * Link actor lines that look like "Name — blurb" or "Name - blurb". Names that match a
 * compendium/world actor become @UUID links; named individuals with no match render as
 * bold text. Covers generic types (Goblin, Commoner) and named NPCs/monsters alike.
 * @param {string[]} actors
 * @returns {Promise<string[]>}
 */
async function linkActorLines(actors) {
    const { buildCompendiumLinkActor } = await import('../utility-common.js');
    const out = [];
    for (const line of actors) {
        const raw = String(line ?? '').trim();
        if (!raw) continue;
        if (isJournalHtmlFragment(raw)) {
            out.push(raw);
            continue;
        }
        const dash = raw.match(/^(.+?)\s*[—–-]\s*(.+)$/);
        if (dash) {
            const displayName = dash[1].trim();
            const blurb = dash[2].trim();
            const lookup = actorLookupName(displayName);
            const linked = actorLinkWithDisplayLabel(
                await buildCompendiumLinkActor(lookup),
                lookup,
                displayName
            );
            const nameHtml = linked.includes('@UUID') ? linked : escapeJournalHtml(displayName);
            out.push(`<strong>${nameHtml}</strong> - ${escapeJournalHtml(blurb)}`);
        } else {
            const displayName = raw;
            const lookup = actorLookupName(displayName);
            const linked = actorLinkWithDisplayLabel(
                await buildCompendiumLinkActor(lookup),
                lookup,
                displayName
            );
            out.push(linked.includes('@UUID') ? linked : escapeJournalHtml(displayName));
        }
    }
    return out;
}

function resolveNarrativeCardImage(card, kind = 'narrative') {
    const image = omitIfNone(card?.image);
    if (image) return image;
    const defaults = CampaignManager.getJournalDefaults().narrative;
    const fallback = kind === 'character'
        ? defaults.characterImagePath
        : defaults.imagePath;
    return omitIfNone(fallback);
}

function buildNarrativeCardHtml(card, imageKind = 'narrative') {
    if (!card || typeof card !== 'object') return '';
    const title = omitIfNone(card.title);
    const description = unescapeQuotes(omitIfNone(card.description));
    const imageTitle = omitIfNone(card.imagetitle);
    const image = resolveNarrativeCardImage(card, imageKind);
    const secondary = unescapeQuotes(omitIfNone(card.descriptionsecondary));
    const dialogue = unescapeQuotes(omitIfNone(card.dialogue ?? card.carddialogue));

    if (!description && !image && !secondary && !dialogue) return '';

    let html = '<blockquote>';
    if (title) html += `<h4>${escapeJournalHtml(toSentenceCase(title))}</h4>`;
    if (description) {
        html += isJournalHtmlFragment(description)
            ? description
            : `<p>${escapeJournalHtml(description)}</p>`;
    }
    if (image) {
        if (imageTitle) html += `<h5>${escapeJournalHtml(toSentenceCase(imageTitle))}</h5>`;
        html += `<img src="${image}">`;
        html += '<hr>';
    }
    if (secondary) {
        html += isJournalHtmlFragment(secondary)
            ? secondary
            : `<p>${escapeJournalHtml(secondary)}</p>`;
    }
    if (dialogue && String(dialogue).trim() && String(dialogue).trim() !== ' ') {
        const d = isJournalHtmlFragment(dialogue) ? dialogue : escapeJournalHtml(dialogue);
        html += `<h6><strong>${title ? escapeJournalHtml(toSentenceCase(title)) : 'Quote'}</strong> "${d}"</h6>`;
    }
    html += '</blockquote>';
    return html;
}

/**
 * @param {Object} journalData
 * @returns {Promise<{ breadcrumbHtml: string, preparationHtml: string, areaSectionHtml: string, encounterHtml: string, conversationsHtml: string }>}
 */
export async function buildAreaJournalTemplateData(journalData) {
    const blocks = journalData?.blocks && typeof journalData.blocks === 'object'
        ? journalData.blocks
        : {};

    const realm = omitIfNone(journalData.realm);
    const region = omitIfNone(journalData.region);
    const site = omitIfNone(journalData.site);
    const area = omitIfNone(journalData.area);
    const sceneTitle = omitIfNone(journalData.scenetitle)
        ? toSentenceCase(String(journalData.scenetitle).trim())
        : '';

    const breadcrumbFromJson = omitIfNone(journalData.breadcrumb);
    const breadcrumbHtml = breadcrumbFromJson
        ? `<p><strong>${escapeJournalHtml(breadcrumbFromJson).replace(/\s*>\s*/g, ' &gt; ').replace(/\s*\|\s*/g, ' | ')}</strong></p>`
        : buildFoundryBreadcrumb([realm, region, site, area, sceneTitle].filter(Boolean));

    let preparationHtml = '';
    const prep = blocks.preparation;
    if (prep && typeof prep === 'object') {
        const parts = ['<h2>Preparation</h2>'];
        const purpose = asStringArray(prep.purpose);
        if (purpose.length) {
            parts.push('<h3>Purpose</h3>', buildFoundryBulletList(purpose));
        }
        // "actors" is the current field; "threats" is the legacy alias.
        const actors = asStringArray(prep.actors ?? prep.threats);
        if (actors.length) {
            const linked = await linkActorLines(actors);
            parts.push('<h3>Actors</h3>', buildFoundryBulletList(linked));
        }
        const rewards = asStringArray(prep.rewards);
        if (rewards.length) {
            const linkedRewards = await linkItemLines(rewards);
            parts.push('<h3>Rewards</h3>', buildFoundryBulletList(linkedRewards, (item) => item));
        }
        const gmnotes = asStringArray(prep.gmnotes);
        if (gmnotes.length) {
            parts.push('<h3>GM Notes</h3>', buildFoundryBulletList(gmnotes));
        }
        if (parts.length > 1) preparationHtml = parts.join('\n');
    }

    let areaSectionHtml = '';
    const areaBlock = blocks.area;
    // Optional blocks.area.title lets the on-page heading differ from the page/scene name.
    const areaTitle = (areaBlock && typeof areaBlock === 'object' && omitIfNone(areaBlock.title))
        ? toSentenceCase(String(areaBlock.title).trim())
        : '';
    const areaHeading = areaTitle || sceneTitle || area || 'Area';
    if (areaBlock && typeof areaBlock === 'object') {
        const parts = [`<h2>${escapeJournalHtml(areaHeading)}</h2>`];
        const card = buildNarrativeCardHtml(areaBlock.narrativecard, 'narrative');
        if (card) parts.push(card);

        const narrative = areaBlock.narrative;
        if (narrative && typeof narrative === 'object') {
            const bullets = [];
            if (omitIfNone(narrative.description)) {
                bullets.push(buildFoundryLabelBullet('Description', narrative.description));
            }
            if (omitIfNone(narrative.layout)) {
                bullets.push(buildFoundryLabelBullet('Layout', narrative.layout));
            }
            if (omitIfNone(narrative.atmosphere)) {
                bullets.push(buildFoundryLabelBullet('Atmosphere', narrative.atmosphere));
            }
            if (bullets.length) {
                parts.push('<h3>Narrative</h3>', `<ul>\n${bullets.join('\n')}\n</ul>`);
            }
        }

        const interactive = asStringArray(areaBlock.interactivedetails);
        if (interactive.length) {
            const linkedInteractive = await linkItemLines(interactive);
            parts.push('<h3>Interactive Details</h3>', buildFoundryBulletList(linkedInteractive, (item) => item));
        }

        const facts = asStringArray(areaBlock.discoverablefacts);
        if (facts.length) {
            parts.push('<h3>Discoverable Facts</h3>', buildFoundryBulletList(facts));
        }
        areaSectionHtml = parts.join('\n');
    }

    let encounterHtml = '';
    const enc = blocks.encounter;
    if (enc && typeof enc === 'object') {
        const parts = ['<h2>Running the Encounter</h2>'];
        const overview = omitIfNone(enc.overview);
        if (overview) parts.push(`<p>${escapeJournalHtml(overview)}</p>`);
        const tactics = asStringArray(enc.tactics);
        const triggers = asStringArray(enc.triggers);
        const special = asStringArray(enc.specialconditions);
        if (tactics.length) {
            parts.push('<h3>Tactics</h3>', buildFoundryBulletList(tactics));
        }
        if (triggers.length) {
            parts.push('<h3>Triggers</h3>', buildFoundryBulletList(triggers));
        }
        if (special.length) {
            parts.push('<h3>Special Conditions</h3>', buildFoundryBulletList(special));
        }
        encounterHtml = parts.join('\n');
    }

    let conversationsHtml = '';
    const conversations = Array.isArray(blocks.conversations) ? blocks.conversations : [];
    if (conversations.length) {
        const parts = ['<h2>Conversations</h2>'];
        for (const npc of conversations) {
            if (!npc || typeof npc !== 'object') continue;
            const name = omitIfNone(npc.name);
            if (!name) continue;
            const key = npc.keycharacter === true || npc.iskey === true;
            parts.push(`<h3>${escapeJournalHtml(name)}${key ? ' (Key Character)' : ''}</h3>`);
            if (npc.narrativecard && typeof npc.narrativecard === 'object') {
                const card = buildNarrativeCardHtml({
                    title: npc.narrativecard.title ?? name,
                    ...npc.narrativecard
                }, 'character');
                if (card) parts.push(card);
            }
            const snapshot = buildFoundryLabeledSection('Snapshot', asStringArray(npc.snapshot));
            const theyknow = buildFoundryLabeledSection('They Know', asStringArray(npc.theyknow));
            const theyveheard = buildFoundryLabeledSection("They've Heard", asStringArray(npc.theyveheard));
            const theywant = buildFoundryLabeledSection('They Want', asStringArray(npc.theywant));
            for (const block of [snapshot, theyknow, theyveheard, theywant]) {
                if (block) parts.push(block);
            }
        }
        conversationsHtml = parts.join('\n');
    }

    return {
        breadcrumbHtml,
        preparationHtml,
        areaSectionHtml,
        encounterHtml,
        conversationsHtml
    };
}
