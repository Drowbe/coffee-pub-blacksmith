// ==================================================================
// ===== CHAT CARDS MANAGER =========================================
// ==================================================================

/**
 * Renders Coffee Pub chat cards from a declared composition of parts.
 *
 * A card is data, not markup. A consumer passes a list of parts and their data;
 * this manager renders each part from a Blacksmith-owned template and assembles
 * the card. Consumers never write card HTML. See
 * `documentation/architecture/architecture-chatcards.md`.
 */

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';

// ==================================================================
// ===== THEMES =====================================================
// ==================================================================

/**
 * Available card themes. Themes are colour only -- a part looks the same in
 * every theme; the theme tints it. Applied as `.blacksmith-card.theme-{id}`,
 * defined in `styles/cards-common-themes.css`.
 *
 * Lives here rather than in `api-chat-cards.js` because the renderer needs it
 * and the API layer imports the renderer; keeping it here avoids a cycle.
 * `api-chat-cards.js` re-exports it, so existing importers are unaffected.
 *
 * Types: 'card' (light background, dark text), 'announcement' (dark background).
 */
export const CHAT_CARD_THEMES = Object.freeze([
    { id: 'default', name: 'Tan', className: 'theme-default', type: 'card', description: 'Tan parchment theme with subtle borders' },
    { id: 'amber', name: 'Amber', className: 'theme-amber', type: 'card', description: 'Warm amber and brown narration theme' },
    { id: 'blue', name: 'Blue', className: 'theme-blue', type: 'card', description: 'Blue accent theme' },
    { id: 'green', name: 'Green', className: 'theme-green', type: 'card', description: 'Green accent theme' },
    { id: 'red', name: 'Red', className: 'theme-red', type: 'card', description: 'Red accent theme' },
    { id: 'orange', name: 'Orange', className: 'theme-orange', type: 'card', description: 'Orange accent theme' },
    { id: 'announcement-green', name: 'Announcement Green', className: 'theme-announcement-green', type: 'announcement', description: 'Dark green background for announcements' },
    { id: 'announcement-blue', name: 'Announcement Blue', className: 'theme-announcement-blue', type: 'announcement', description: 'Dark blue background for announcements' },
    { id: 'announcement-red', name: 'Announcement Red', className: 'theme-announcement-red', type: 'announcement', description: 'Dark red background for announcements' }
]);

// ==================================================================
// ===== PART REGISTRY ==============================================
// ==================================================================

/**
 * The built-in part library. Consumers compose these; they cannot register new
 * parts (see plan decision "compose-only"). A part that does not exist here is
 * a request for Blacksmith to add one.
 *
 * **Parts are named for their shape, never for what you might put in them.**
 * `tiles` is a grid of caption-over-value boxes, not "ability scores"; `rows` is
 * a list of thumbnail-label-trailing rows, not "conditions". The first pass at
 * this named three parts after the reference card each was first seen in, and
 * `status` was carrying monsters and players before the ink was dry. A
 * use-case name is a bug report waiting to happen -- the next caller either
 * misuses the name or asks for a near-duplicate part.
 *
 * `text` lists the fields on each part that carry consumer prose and therefore
 * run through the escape -> marks -> enrich pipeline. Every other field is
 * escaped by Handlebars on output.
 */
export const CARD_PARTS = Object.freeze({
    header:   { template: 'part-header',   text: ['title'] },
    identity: { template: 'part-identity', text: [] },
    image:    { template: 'part-image',    text: ['caption'] },
    meter:    { template: 'part-meter',    text: ['label'] },
    band:     { template: 'part-band',     text: ['text'] },
    tiles:    { template: 'part-tiles',    text: [] },
    section:  { template: 'part-section',  text: ['label'] },
    prose:    { template: 'part-prose',    text: [] },
    rows:     { template: 'part-rows',     text: [] },
    badges:   { template: 'part-badges',   text: [] },
    panel:    { template: 'part-panel',    text: ['label'] },
    notes:    { template: 'part-notes',    text: [] },
    actions:  { template: 'part-actions',  text: ['instruction'] },
    richtext: { template: 'part-richtext', text: [] }
});

const PART_PATH = `modules/${MODULE.ID}/templates/parts`;

/** Parts whose body is a full card wrapper rather than a child of section-content. */
const TEMPLATE_PATHS = Object.freeze(
    Object.fromEntries(Object.entries(CARD_PARTS).map(([id, def]) => [id, `${PART_PATH}/${def.template}.hbs`]))
);

// ==================================================================
// ===== TEXT PIPELINE ==============================================
// ==================================================================

/**
 * Escape every HTML-special character.
 *
 * This is what makes "consumers do not pass HTML" enforced at runtime rather
 * than by review: a module that passes `<b>x</b>` sees those characters on the
 * card. Foundry enricher syntax (`@UUID[]{}`, `[[/r]]`, `@Check[]`) uses no
 * HTML-special characters and passes through untouched.
 */
function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Placeholder delimiter for lifted-out code spans. A private-use codepoint,
 * because it must not collide with anything a consumer could legitimately write
 * and must survive HTML escaping. Constructed with String.fromCharCode rather
 * than written inline so this source file stays plain ASCII; an embedded control
 * character makes the file read as binary to git and grep, which cost an hour
 * once already.
 */
const MARK_SENTINEL = String.fromCharCode(0xE000);
const MARK_SENTINEL_PATTERN = new RegExp(MARK_SENTINEL + '(\\d+)' + MARK_SENTINEL, 'g');

/**
 * Convert the three permitted inline marks. Deliberately not markdown: no block
 * syntax, no raw-HTML passthrough. Code spans are lifted out first so that
 * asterisks inside them are not treated as emphasis.
 */
function applyInlineMarks(escaped) {
    const codeSpans = [];
    let out = escaped.replace(/`([^`]+)`/g, (_match, code) => {
        codeSpans.push(code);
        return `${MARK_SENTINEL}${codeSpans.length - 1}${MARK_SENTINEL}`;
    });

    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    return out.replace(MARK_SENTINEL_PATTERN, (_match, i) => `<code>${codeSpans[Number(i)]}</code>`);
}

/**
 * Run Foundry's enrichers. This is what turns `@UUID[...]{Name}` into a document
 * link and `[[/r 1d20]]` into an inline roll. It is async, which is why every
 * render path in this file is async.
 */
async function enrich(html, options = {}) {
    const ns = globalThis.foundry?.applications?.ux?.TextEditor;
    const TE = ns?.implementation ?? ns ?? globalThis.TextEditor;
    if (!TE?.enrichHTML) return html;
    try {
        return String(await TE.enrichHTML(html, { async: true, ...options }));
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Chat Cards | enrichHTML failed', error?.message ?? error, false, false);
        return html;
    }
}

/**
 * The full consumer-text pipeline: escape, then marks, then enrich. The order is
 * load-bearing -- escaping last would strip the tags the marks just produced,
 * and enriching before escaping would let enricher output be escaped.
 */
export async function processText(text, options = {}) {
    if (text === null || text === undefined || text === '') return '';
    return enrich(applyInlineMarks(escapeHtml(text)), options);
}

/**
 * Render one prose block to HTML. Block structure is Blacksmith's; only the text
 * inside comes from the consumer, and it goes through `processText`.
 */
async function renderProseBlock(block, options) {
    if (!block || typeof block !== 'object') return '';

    switch (block.type) {
        case 'paragraph':
            return `<p>${await processText(block.text, options)}</p>`;

        case 'list': {
            const tag = block.ordered ? 'ol' : 'ul';
            const items = await Promise.all((block.items ?? []).map(async (item) => `<li>${await processText(item, options)}</li>`));
            return items.length ? `<${tag}>${items.join('')}</${tag}>` : '';
        }

        case 'table': {
            const rows = await Promise.all((block.rows ?? []).map(async (row) => {
                const [label, value] = Array.isArray(row) ? row : [row?.label, row?.value];
                return `<div class="row-label">${await processText(label, options)}</div>`
                     + `<div class="row-content">${await processText(value, options)}</div>`;
            }));
            return rows.length ? `<div class="section-table">${rows.join('')}</div>` : '';
        }

        case 'quote':
            return `<blockquote>${await processText(block.text, options)}</blockquote>`;

        default:
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | unknown prose block type', String(block.type), false, false);
            return '';
    }
}

// ==================================================================
// ===== RENDERING ==================================================
// ==================================================================

export class ChatCardsManager {

    /** Preload every part template so the first card does not pay compile cost. */
    static async preloadTemplates() {
        try {
            await foundry.applications.handlebars.loadTemplates(Object.values(TEMPLATE_PATHS));
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | Part templates loaded', String(Object.keys(TEMPLATE_PATHS).length), true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | Part template preload failed', error?.message ?? error, false, false);
        }
    }

    /**
     * Render a single part to HTML.
     * @param {object} part - `{ part: 'header', ... }`
     * @param {object} [options] - enrichment options, e.g. `{ relativeTo }`
     * @returns {Promise<string>} HTML, or '' if the part id is unknown
     */
    static async renderPart(part, options = {}) {
        const id = part?.part;
        const definition = CARD_PARTS[id];
        if (!definition) {
            postConsoleAndNotification(MODULE.NAME, 'Chat Cards | Unknown part', String(id), false, false);
            return '';
        }

        const context = await this._prepareContext(id, part, options);

        try {
            return await foundry.applications.handlebars.renderTemplate(TEMPLATE_PATHS[id], context);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Chat Cards | Failed to render part "${id}"`, error?.message ?? error, false, false);
            return '';
        }
    }

    /**
     * Build the template context for a part: run its declared text fields through
     * the pipeline, and expand the parts that carry their own nested content.
     */
    static async _prepareContext(id, part, options) {
        const context = { ...part };

        for (const field of CARD_PARTS[id].text) {
            if (part[field] !== undefined) context[field] = await processText(part[field], options);
        }

        if (id === 'prose') {
            const blocks = await Promise.all((part.blocks ?? []).map((block) => renderProseBlock(block, options)));
            context.html = blocks.join('');
        }

        if (id === 'richtext') {
            // Document-sourced HTML: already authored in a Foundry document, so it
            // is enriched but not escaped. Consumers passing hand-built strings
            // here is the one violation this part cannot detect on its own.
            context.html = await enrich(String(part.html ?? ''), options);
        }

        if (id === 'rows' || id === 'badges' || id === 'notes') {
            context.items = await Promise.all((part.items ?? []).map(async (item) => ({
                ...item,
                // A uuid turns the label into a real document link; without one it
                // is ordinary consumer text and goes through the full pipeline.
                label: item.uuid
                    ? await enrich(`@UUID[${item.uuid}]{${escapeHtml(item.label ?? item.uuid)}}`, options)
                    : await processText(item.label ?? item.text, options),
                sublabel: item.sublabel ? await processText(item.sublabel, options) : '',
                trailing: item.trailing ? await processText(item.trailing, options) : ''
            })));
        }

        if (id === 'tiles') {
            context.items = (part.items ?? []).map((item) => ({ label: item.label, value: item.value }));
            // Column count is stated rather than inferred by the grid. Six boxes
            // must sit on one row; auto-fit sized them right at the width where
            // only five fit, so the sixth wrapped alone.
            context.columns = Math.min(part.columns || context.items.length || 1, 6);
        }

        if (id === 'panel') {
            context.rows = await Promise.all((part.rows ?? []).map(async (row) => ({
                ...row,
                label: await processText(row.label, options),
                value: row.value !== undefined ? await processText(row.value, options) : ''
            })));
        }

        if (id === 'meter') {
            const max = Number(part.max) || 0;
            const value = Number(part.value) || 0;
            context.percent = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
            context.tone = part.tone ?? this._meterTone(context.percent);
        }

        return context;
    }

    static _meterTone(percent) {
        if (percent <= 25) return 'danger';
        if (percent <= 50) return 'warn';
        return 'ok';
    }

    /**
     * Render a full card: theme wrapper plus every part in order.
     * @param {object} card - `{ theme, parts, moduleId, type }`
     * @returns {Promise<string>} the complete card HTML
     */
    static async renderCard(card, options = {}) {
        const parts = Array.isArray(card?.parts) ? card.parts : [];
        const rendered = await Promise.all(parts.map((part) => this.renderPart(part, options)));
        const body = rendered.filter(Boolean).join('');

        const themeClass = this.resolveThemeClass(card?.theme);
        const moduleAttr = card?.moduleId ? ` data-cpb-module="${escapeHtml(card.moduleId)}"` : '';
        const typeAttr = card?.type ? ` data-cpb-card="${escapeHtml(card.type)}"` : '';

        return `<span style="visibility: hidden">coffeepub-hide-header</span>`
             + `<div class="blacksmith-card ${themeClass}"${moduleAttr}${typeAttr}>${body}</div>`;
    }

    /**
     * Resolve a theme id to its CSS class, substituting the world default when the
     * caller did not choose one.
     *
     * The world default is resolved HERE, at post time, and never at render time.
     * The old system left `theme-default` in the markup as a sentinel and rewrote
     * it on every client at display, which meant a consumer could not pin a card
     * to the Tan theme at all.
     */
    static resolveThemeClass(themeId) {
        return this.getThemeById(this.resolveThemeId(themeId)).className;
    }

    /**
     * Resolve a theme id, substituting the world default when none was chosen.
     * Callers store the result, so what lands in the message is always a concrete
     * theme rather than a sentinel to be reinterpreted later.
     */
    static resolveThemeId(themeId) {
        const requested = themeId || getSettingSafely(MODULE.ID, 'defaultCardTheme', 'default');
        return this.getThemeById(requested).id;
    }

    static getThemeById(themeId) {
        const theme = CHAT_CARD_THEMES.find((t) => t.id === themeId);
        if (theme) return theme;
        postConsoleAndNotification(MODULE.NAME, 'Chat Cards | Unknown theme, falling back to Tan', String(themeId), false, false);
        return CHAT_CARD_THEMES[0];
    }
}
