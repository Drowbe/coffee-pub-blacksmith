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
 * Every theme is type 'card'. Each colour comes in two: the ordinary one, and a
 * `-dark` variant that changes NOTHING but the card header, which it fills with a
 * dark ground and light text.
 *
 * The `-dark` variants replaced three `theme-announcement-*` themes that darkened the
 * whole card. Those were named for an occasion rather than for a look, and they
 * darkened the ground while leaving every text token at its light value -- readable
 * only for a card that was nothing but a header, which is what they were always used
 * for. The variant now does that one thing honestly.
 */
export const CHAT_CARD_THEMES = Object.freeze([
    { id: 'default', name: 'Tan', className: 'theme-default', type: 'card', description: 'Tan parchment theme with subtle borders' },
    { id: 'amber', name: 'Amber', className: 'theme-amber', type: 'card', description: 'Warm amber and brown narration theme' },
    { id: 'blue', name: 'Blue', className: 'theme-blue', type: 'card', description: 'Blue accent theme' },
    { id: 'green', name: 'Green', className: 'theme-green', type: 'card', description: 'Green accent theme' },
    { id: 'red', name: 'Red', className: 'theme-red', type: 'card', description: 'Red accent theme' },
    { id: 'orange', name: 'Orange', className: 'theme-orange', type: 'card', description: 'Orange accent theme' },
    { id: 'default-dark', name: 'Tan (dark header)', className: 'theme-default-dark', type: 'card', description: 'Tan card with a dark brown header band' },
    { id: 'amber-dark', name: 'Amber (dark header)', className: 'theme-amber-dark', type: 'card', description: 'Amber card with a deep amber header band' },
    { id: 'blue-dark', name: 'Blue (dark header)', className: 'theme-blue-dark', type: 'card', description: 'Blue card with a dark blue header band' },
    { id: 'green-dark', name: 'Green (dark header)', className: 'theme-green-dark', type: 'card', description: 'Green card with a dark green header band' },
    { id: 'red-dark', name: 'Red (dark header)', className: 'theme-red-dark', type: 'card', description: 'Red card with a dark red header band' },
    { id: 'orange-dark', name: 'Orange (dark header)', className: 'theme-orange-dark', type: 'card', description: 'Orange card with a burnt orange header band' }
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
    ribbon:   { template: 'part-ribbon',   text: [] },
    identity: { template: 'part-identity', text: [] },
    subject:  { template: 'part-subject',  text: ['title', 'value'] },
    image:    { template: 'part-image',    text: ['caption'] },
    meter:    { template: 'part-meter',    text: ['label'] },
    gauge:    { template: 'part-gauge',    text: ['label'] },
    band:     { template: 'part-band',     text: ['text', 'lead', 'trail'] },
    tiles:    { template: 'part-tiles',    text: [] },
    section:  { template: 'part-section',  text: ['label'] },
    prose:    { template: 'part-prose',    text: [] },
    pips:     { template: 'part-pips',     text: [] },
    rows:     { template: 'part-rows',     text: [] },
    badges:   { template: 'part-badges',   text: [] },
    panel:    { template: 'part-panel',    text: ['label', 'intro'] },
    notes:    { template: 'part-notes',    text: [] },
    actions:  { template: 'part-actions',  text: ['instruction'] },
    richtext: { template: 'part-richtext', text: [] }
});

const PART_PATH = `modules/${MODULE.ID}/templates/parts`;

/**
 * The weights a card button may carry, mirroring the window buttons in
 * `styles/window-template.css` so one vocabulary covers both surfaces.
 *
 * An allowlist rather than a pass-through, for the same reason `safeColour`
 * exists: `class="card-button-{{variant}}"` with an unchecked value lets a
 * consumer name any class on the page and style its button however it likes,
 * which is the presentation injection this system exists to prevent.
 */
const BUTTON_VARIANTS = new Set(['primary', 'secondary', 'critical']);

/**
 * How a button row arranges itself. `inline` sits them side by side and lets a
 * row that does not fit reflow onto another line; `stacked` gives each button its
 * own full-width row.
 *
 * Allowlisted for the same reason as the variant -- it is interpolated into a
 * class attribute.
 */
const BUTTON_LAYOUTS = new Set(['inline', 'stacked']);

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
 * A CSS colour, or null.
 *
 * The gauge part takes colours from the caller, because on a gauge the colour IS
 * the data -- see the amendment to decision 5 in the plan. Those values reach a
 * style attribute, so they get the same treatment as prose: an allowlist rather
 * than trust. Handlebars escaping stops a value breaking out of the attribute;
 * this stops one smuggling a second declaration in through a semicolon, which
 * escaping alone would happily pass through.
 *
 * Permitted: #hex, rgb()/rgba(), hsl()/hsla(), var(--custom-property), and the
 * plain colour keywords. Anything else is dropped and logged.
 */
const COLOUR_PATTERNS = [
    /^#[0-9a-f]{3,8}$/i,
    /^rgba?\(\s*[\d.\s,%/]+\)$/i,
    /^hsla?\(\s*[\d.\s,%/deg]+\)$/i,
    /^var\(\s*--[\w-]+\s*(,\s*[^;()]*)?\)$/,
    /^[a-z]+$/i
];

function safeColour(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (COLOUR_PATTERNS.some((pattern) => pattern.test(text))) return text;
    postConsoleAndNotification(MODULE.NAME, 'Chat Cards | Rejected a colour that is not a plain CSS colour', text, false, false);
    return null;
}

/** Position of `value` along min..max, as a percentage, clamped. */
function positionOf(value, min, max) {
    const span = Number(max) - Number(min);
    if (!Number.isFinite(span) || span === 0) return 0;
    return Math.max(0, Math.min(100, ((Number(value) - Number(min)) / span) * 100));
}

/**
 * Convert the two permitted inline marks. Deliberately not markdown: no block
 * syntax, no raw-HTML passthrough.
 *
 * There is no inline code mark. A chat card never has inline code -- the case
 * does not arise in play -- and carrying a mark nobody uses means carrying the
 * lifted-out code-span machinery that protected it, which is the fiddliest part
 * of this pipeline. A backtick now passes through as an ordinary character. If a
 * code BLOCK is ever wanted, it belongs in the prose block types, not here.
 */
function applyInlineMarks(escaped) {
    return escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

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

        if (id === 'actions') {
            const buttons = (part.buttons ?? []).map((button) => ({
                ...button,
                variant: BUTTON_VARIANTS.has(button.variant) ? button.variant : 'secondary'
            }));
            // The primary action is ALWAYS the rightmost button, whatever order the
            // caller listed them in. Position carries meaning, so the system owns it
            // rather than the caller: left to each module, every card puts "confirm"
            // somewhere slightly different and a player has to find it again each time.
            context.buttons = [
                ...buttons.filter((button) => button.variant !== 'primary'),
                ...buttons.filter((button) => button.variant === 'primary')
            ];
            context.layout = BUTTON_LAYOUTS.has(part.layout) ? part.layout : 'inline';
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
                trailing: item.trailing ? await processText(item.trailing, options) : '',
                // A thumbnail exists if there is anything to put in it.
                thumb: Boolean(item.img || item.icon),
                // Categorical colour: a quest's palette identifies it the way a
                // reputation ramp reports a value. Validated like any other
                // caller colour before it reaches a style attribute.
                ground: safeColour(item.ground),
                iconColor: safeColour(item.iconColor)
            })));
        }

        if (id === 'pips') {
            // Groups arrive as counts; the template wants an array per slot so it
            // can mark each one filled or empty. The leading group is reversed so
            // that with a centre marker both groups fill outward from it.
            const groups = (part.groups ?? []).slice(0, 2).map((group) => ({
                tone: group.tone ?? 'neutral',
                pips: Array.from({ length: Math.max(0, Number(group.total) || 0) },
                                 (_slot, index) => index < (Number(group.filled) || 0))
            }));

            const center = part.center ?? null;
            context.center = center;
            context.leading = groups[0] ?? null;
            context.trailing = groups[1] ?? null;
            if (center && groups[0]) context.leading.pips = [...groups[0].pips].reverse();
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

        if (id === 'subject') {
            // The bar is a real meter or gauge, rendered through this same
            // renderer rather than reimplemented, so it cannot drift from the
            // standalone part. This is the only place one part renders another.
            const bar = part.meter ? { part: 'meter', ...part.meter }
                : part.gauge ? { part: 'gauge', ...part.gauge }
                : null;
            context.bar = bar ? await this.renderPart(bar, options) : '';
        }

        if (id === 'gauge') {
            const min = Number(part.min ?? 0);
            const max = Number(part.max ?? 100);

            // Two ways to build the track, because the real instances split that
            // way: a reputation scale is a gradient, a damage ratio is blocks.
            const stops = (part.stops ?? [])
                .map((stop) => (typeof stop === 'string' ? { color: stop } : stop))
                .map((stop, index, all) => ({
                    color: safeColour(stop.color),
                    at: stop.at === undefined
                        ? (all.length < 2 ? 0 : (index / (all.length - 1)) * 100)
                        : positionOf(stop.at, min, max)
                }))
                .filter((stop) => stop.color);

            context.segments = (part.segments ?? [])
                .map((segment) => ({ span: Number(segment.span) || 1, color: safeColour(segment.color) }))
                .filter((segment) => segment.color);

            context.trackStyle = stops.length
                ? `background: linear-gradient(to right, ${stops.map(s => `${s.color} ${s.at}%`).join(', ')})`
                : '';

            context.markers = (part.markers ?? []).map((marker) => ({
                percent: positionOf(marker.at, min, max),
                // Hangs from the top unless told otherwise, so two markers can
                // point at the same value from opposite sides without colliding.
                from: marker.from === 'bottom' ? 'bottom' : 'top',
                color: safeColour(marker.color),
                tooltip: marker.tooltip ?? null
            }));

            context.midpoint = part.midpoint === undefined || part.midpoint === null
                ? null
                : positionOf(part.midpoint, min, max);
        }

        if (id === 'meter') {
            const max = Number(part.max) || 0;
            const value = Number(part.value) || 0;
            context.percent = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
            context.tone = part.tone ?? this._meterTone(context.percent);
        }

        return context;
    }

    /**
     * Tone for a meter the caller did not tone itself.
     *
     * Steps at 25/50/75, matching Crier's HP bar, which is where the colours came
     * from too. Assumes DEPLETION: a low value is the alarming one. A meter where
     * a high value is the problem sets its tone explicitly rather than relying on
     * this.
     */
    static _meterTone(percent) {
        if (percent <= 0) return 'empty';
        if (percent <= 25) return 'danger';
        if (percent <= 50) return 'warn';
        if (percent <= 75) return 'caution';
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
        const moduleAttr = card?.moduleId ? ` data-blacksmith-module="${escapeHtml(card.moduleId)}"` : '';
        const typeAttr = card?.type ? ` data-blacksmith-card="${escapeHtml(card.type)}"` : '';

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
