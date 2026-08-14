// ==================================================================
// ===== SUITE: api.chatCards =======================================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead; it
// loads this suite itself.
//
// Contract: documentation/api/api-chatcards.md
// Implementation: scripts/manager-chat-cards.js, scripts/api-chat-cards.js
//
// The headless tier asserts the contracts that can be checked from the
// posted message: that consumer HTML is escaped, that enricher syntax
// survives, that the composition is stored, and that a theme resolves to a
// concrete id. Each of those posts a message and deletes it again, so the
// chat log is left as it was found.
//
// The interactive tier posts ONE card per button, deliberately. A card
// showing every part at once proves the parts render and hides everything
// about how they sit together; a card showing one family is something a
// person can actually look at. These leave their messages in the log so
// they can be compared side by side against a reference card.
// ==================================================================

import { requireApi, settingRow, stylesheetContains } from '../harness-lib.js';

// Real art, not a placeholder: the core mystery-man svg is nearly white, so a
// light image border reads as absent against it --
// which is exactly the judgement these cards exist to support.
// Campaign art, so it may not resolve outside the author's install.
const MOD = 'coffee-pub-blacksmith';
const IMG = 'modules/campaigns/images/portraits/elegant-eight/character-favia.webp';

// Foundry's own placeholder: a transparent SVG, so it shows the shared image
// ground through the art. Real portraits are opaque and would hide it.
const PLACEHOLDER = 'icons/svg/mystery-man.svg';

// A real overlay: transparent PNG-style art meant to sit over a portrait. Using
// the placeholder here made the overlay test prove nothing, since one opaque
// silhouette over another shows no stacking at all.
const OVERLAY = 'modules/coffee-pub-blacksmith/images/portraits/blood/blood-60.webp';
const TEST_ACTION = 'harness-card-action';

/** Post, hand the message to `inspect`, then delete it whatever happened. */
async function postAndInspect(parts, inspect, options = {}) {
    const { chatCards } = requireApi('chatCards');
    const message = await chatCards.post({
        moduleId: 'coffee-pub-blacksmith',
        type: 'harness-probe',
        whisper: [game.user.id],
        parts,
        ...options
    });
    if (!message) throw new Error('post() returned null — see the console for why.');
    try {
        return await inspect(message);
    } finally {
        await message.delete().catch(() => {});
    }
}

/** One visible card. Named so the log says which button produced what. */
function card(id, label, parts, { group, note, theme } = {}) {
    return {
        id,
        label,
        tier: 'interactive',
        group,
        note,
        run: async ({ log }) => {
            const { chatCards } = requireApi('chatCards');
            await chatCards.post({
                moduleId: 'coffee-pub-blacksmith',
                type: `harness-${id}`,
                theme,
                parts: typeof parts === 'function' ? parts() : parts
            });
            log(`Posted: ${label}. Compare it against the reference card before ticking anything.`);
        }
    };
}

export default {
    id: 'chat-cards',
    label: 'Chat Cards',
    icon: 'fa-solid fa-comment-dots',

    settings: () => {
        const api = game.modules.get('coffee-pub-blacksmith')?.api;
        const parts = api?.chatCards?.getParts?.() ?? [];
        return [
            settingRow('api.chatCards', api?.chatCards ? 'available' : 'MISSING'),
            settingRow('Parts registered', parts.length ? `${parts.length} — ${parts.join(', ')}` : 'NONE'),
            settingRow('cards-parts.css', stylesheetContains('.blacksmith-part-rows')
                ? 'loaded'
                : 'NOT LOADED — check the @import in styles/default.css'),
            settingRow('Preview image', IMG.split('/').slice(-2).join('/'),
                'campaign art; change IMG at the top of this suite'),
            settingRow('Default card theme', String(game.settings.get('coffee-pub-blacksmith', 'defaultCardTheme') ?? 'unset'),
                'an omitted theme resolves to this at post time')
        ];
    },

    checks: [

        // ---------- HEADLESS ----------

        {
            id: 'surface',
            tier: 'headless',
            group: 'API surface',
            label: 'post, actions, parts and themes are exposed',
            run: async ({ expect }) => {
                const { chatCards } = requireApi('chatCards');
                for (const fn of ['post', 'registerAction', 'unregisterAction',
                                  'getAction', 'getParts', 'getThemes', 'getTheme']) {
                    expect.ok(`chatCards.${fn} is a function`, typeof chatCards[fn] === 'function');
                }
                expect.ok('getParts() is not empty', chatCards.getParts().length > 0);
                expect.ok('getThemes() is not empty', chatCards.getThemes().length > 0);
            }
        },

        {
            id: 'parts-have-templates',
            tier: 'headless',
            group: 'API surface',
            label: 'Every registered part renders to markup rather than to nothing',
            note: 'catches a part whose template is missing or failed to preload',
            run: async ({ expect }) => {
                const { chatCards } = requireApi('chatCards');
                // Minimal viable data per part, so each one produces output.
                const sample = {
                    header: { title: 'x' }, identity: { name: 'x' }, image: { src: IMG },
                    meter: { value: 1, max: 2 }, band: { text: 'x' },
                    tiles: { items: [{ label: 'a', value: 1 }] }, section: { label: 'x' },
                    prose: { blocks: [{ type: 'paragraph', text: 'x' }] },
                    pips: { groups: [{ total: 2, filled: 1 }] },
                    rows: { items: [{ label: 'x' }] }, badges: { items: [{ label: 'x' }] },
                    panel: { label: 'x' }, notes: { items: [{ text: 'x' }] },
                    actions: { buttons: [{ action: 'a', label: 'x' }] },
                    richtext: { html: '<p>x</p>' }
                };
                for (const id of chatCards.getParts()) {
                    const data = sample[id];
                    expect.ok(`sample data exists for part "${id}"`, data !== undefined);
                    if (!data) continue;
                    await postAndInspect([{ part: id, ...data }], (message) => {
                        const body = message.content.replace(/<span style="visibility: hidden">[^<]*<\/span>/, '');
                        const inner = body.replace(/^<div class="blacksmith-card[^"]*"[^>]*>/, '').replace(/<\/div>$/, '');
                        expect.ok(`part "${id}" produced markup`, inner.trim().length > 0);
                    });
                }
            }
        },

        {
            id: 'escaping',
            tier: 'headless',
            group: 'Prose contract',
            label: 'Consumer HTML is escaped, not rendered',
            note: 'the one contract worth halting on — see tools/check-card-prose.mjs',
            run: async ({ expect }) => {
                await postAndInspect(
                    [{ part: 'prose', blocks: [{ type: 'paragraph', text: '<b>x</b><script>alert(1)</script>' }] }],
                    (message) => {
                        expect.ok('angle brackets are escaped', message.content.includes('&lt;b&gt;'));
                        expect.ok('no live bold tag reached the message', !message.content.includes('<b>x</b>'));
                        expect.ok('no script tag reached the message', !message.content.includes('<script'));
                    });
            }
        },

        {
            id: 'marks-and-enrichers',
            tier: 'headless',
            group: 'Prose contract',
            label: 'Inline marks convert and Foundry enricher syntax survives',
            run: async ({ expect }) => {
                const actor = game.actors.contents[0];
                const text = actor
                    ? `**bold** *italic* @UUID[${actor.uuid}]{Link}`
                    : '**bold** *italic*';
                await postAndInspect([{ part: 'prose', blocks: [{ type: 'paragraph', text }] }], (message) => {
                    expect.ok('bold converted', message.content.includes('<strong>bold</strong>'));
                    expect.ok('italic converted', message.content.includes('<em>italic</em>'));
                    expect.ok('no unconverted mark characters remain', !message.content.includes('**'));
                    if (actor) {
                        expect.ok('the @UUID enriched into a document link', message.content.includes('content-link'));
                    }
                });
            }
        },

        {
            id: 'composition-stored',
            tier: 'headless',
            group: 'Storage',
            label: 'The composition and a concrete theme are stored on the message',
            note: 'this is what lets an improved part improve cards that already exist',
            run: async ({ expect }) => {
                await postAndInspect([{ part: 'header', title: 'x' }], (message) => {
                    const stored = message.flags?.['coffee-pub-blacksmith']?.card;
                    expect.ok('flags carry the card payload', !!stored);
                    expect.ok('payload declares its schema version', stored?.v === 1);
                    expect.ok('parts array is stored', Array.isArray(stored?.parts));
                    expect.ok(`theme resolved to a concrete id at post time (got ${stored?.theme})`,
                        typeof stored?.theme === 'string' && stored.theme.length > 0);
                    expect.ok('rendered HTML is baked into content', message.content.length > 0);
                });
            }
        },

        {
            id: 'flags-do-not-collide',
            tier: 'headless',
            group: 'Storage',
            label: "A caller's own flags do not displace the card payload",
            note: 'they share a key when Blacksmith posts its own card',
            run: async ({ expect }) => {
                await postAndInspect([{ part: 'header', title: 'x' }], (message) => {
                    const own = message.flags?.['coffee-pub-blacksmith'];
                    expect.ok('card payload survived alongside caller flags', !!own?.card);
                    expect.ok("the caller's own flag is present too", own?.probe === 'value');
                }, { flags: { probe: 'value' } });
            }
        },

        {
            id: 'theme-pinning',
            tier: 'headless',
            group: 'Themes',
            label: 'A named theme is stored as asked; an unknown one falls back to Tan',
            note: 'theme-default used to be a sentinel that a render hook rewrote. '
                + 'Logs "Unknown theme, falling back to Tan" on purpose -- that is the check working.',
            run: async ({ expect }) => {
                await postAndInspect([{ part: 'header', title: 'x' }], (message) => {
                    expect.ok('blue stored as blue', message.flags['coffee-pub-blacksmith'].card.theme === 'blue');
                    expect.ok('markup carries theme-blue', message.content.includes('theme-blue'));
                }, { theme: 'blue' });

                await postAndInspect([{ part: 'header', title: 'x' }], (message) => {
                    expect.ok('an unknown theme fell back to Tan', message.content.includes('theme-default'));
                }, { theme: 'not-a-real-theme' });
            }
        },

        {
            id: 'action-registry',
            tier: 'headless',
            group: 'Actions',
            label: 'Actions register, resolve, and unregister',
            note: 'logs "registerAction requires moduleId, action, and a function" on purpose '
                + '-- it feeds a non-function in to confirm the rejection.',
            run: async ({ expect }) => {
                const { chatCards } = requireApi('chatCards');
                const handler = () => {};
                expect.ok('registration accepted', chatCards.registerAction('harness', 'probe', handler) === true);
                expect.ok('handler resolves back', chatCards.getAction('harness', 'probe') === handler);
                expect.ok('a non-function is rejected',
                    chatCards.registerAction('harness', 'bad', 'not a function') === false);
                expect.ok('unregistration reports success', chatCards.unregisterAction('harness', 'probe') === true);
                expect.ok('handler is gone', chatCards.getAction('harness', 'probe') === undefined);
            }
        },

        // ---------- INTERACTIVE: one card per button ----------

        {
            id: 'register-actions',
            tier: 'interactive',
            group: 'Start here',
            label: 'Register the handlers the button cards below need',
            note: 'run once per reload, before the cards that have buttons',
            run: async ({ log }) => {
                const { chatCards } = requireApi('chatCards');
                chatCards.registerAction('coffee-pub-blacksmith', TEST_ACTION, ({ value }) =>
                    ui.notifications.info(`Card action fired. value=${value ?? 'none'}`));
                log('Registered. Buttons on the cards below will now report when clicked.');
            }
        },

        card('c-ribbon', 'Ribbon: the corner stamp', [
            { part: 'ribbon', text: 'Executioner' },
            { part: 'header', icon: 'fa-solid fa-trophy', title: 'Round 5 MVP' },
            { part: 'subject', img: IMG, title: 'Cyrus Bing',
              meter: { value: 71, max: 101 } },
            { part: 'prose', blocks: [{ type: 'paragraph', text: 'Cyrus Bing carved a path to victory. 20 damage dealt.' }] },
            { part: 'section', icon: 'fa-solid fa-khanda', label: 'Combat' },
            { part: 'prose', blocks: [{ type: 'table', rows: [['Hits', '2/2'], ['Crits', '0'], ['Kills', '1']] }] }
        ], { group: 'Cards', note: 'the ribbon must clip to the corner without cutting off the gauge markers on other cards' }),

        card('c-ribbon-tones', 'Ribbon tones', [
            { part: 'ribbon', text: 'Fumbled', tone: 'negative' },
            { part: 'header', icon: 'fa-solid fa-face-dizzy', title: 'A Bad Round' },
            { part: 'prose', blocks: [{ type: 'paragraph', text: 'Same shape, different tone.' }] }
        ], { group: 'Cards' }),

        card('c-baseline', 'Baseline: header, section, prose', [
            { part: 'header', icon: 'fa-solid fa-flask', title: 'Baseline' },
            { part: 'section', icon: 'fa-solid fa-paragraph', label: 'A section' },
            { part: 'prose', blocks: [
                { type: 'paragraph', text: 'A paragraph with **bold** and *italic*.' },
                { type: 'list', items: ['First', 'Second'] },
                { type: 'table', rows: [['Label', 'Value'], ['Another', '12']] },
                { type: 'quote', text: 'A quote block.' }
            ] }
        ], { group: 'Cards', note: 'spacing between parts, and whether the four block types read as a family' }),

        card('c-identity', 'Identity and image', [
            { part: 'header', icon: 'fa-solid fa-user', title: 'Identity and Image' },
            { part: 'identity', img: IMG, name: 'Character Name', subtitle: 'Player Name' },
            { part: 'image', src: IMG, overlays: [OVERLAY], caption: 'A caption under the image' }
        ], { group: 'Cards' }),

        card('c-subjects', 'Subjects: image, title, value, bar', [
            { part: 'header', icon: 'fa-solid fa-users', title: 'Subjects' },
            { part: 'section', label: 'Numbered, with a meter -- the party stats shape' },
            { part: 'subject', img: IMG, index: 1, title: 'Cyrus Bing', value: '39s',
              meter: { value: 71, max: 101 } },
            { part: 'subject', img: IMG, index: 2, title: 'Favia Gita', value: '1m 0s',
              meter: { value: 40, max: 101 } },
            { part: 'subject', img: IMG, index: 3, title: 'Kar-ahn', value: '0s',
              meter: { value: 12, max: 101 } },

            { part: 'section', label: 'Icon instead of a number, and a gauge instead of a meter' },
            { part: 'subject', img: IMG, marker: 'fa-solid fa-crown', title: 'Party Leader',
              value: '+45',
              gauge: { min: -100, max: 100, midpoint: 0, markers: [{ at: 45 }] } },

            { part: 'section', label: 'Compact: image beside a title, no bar' },
            { part: 'subject', img: IMG, title: 'Small image next to a title', value: '412 gp' },
            { part: 'subject', img: IMG, marker: 'fa-solid fa-coins', title: 'With a marker too' },

            { part: 'section', label: 'Clickable -- try the mouse, then Tab to it and press Enter' },
            { part: 'subject', img: IMG, index: 4, title: 'Click me', value: 'action',
              moduleId: 'coffee-pub-blacksmith', action: TEST_ACTION, actionValue: 'subject',
              tooltip: 'The whole subject is the target',
              meter: { value: 60, max: 100 } },

            { part: 'section', label: 'No image, no bar -- it degrades to a heading with a value' },
            { part: 'subject', marker: 'fa-solid fa-coins', title: 'Party Funds', value: '412 gp' },
            { part: 'subject', title: 'Nothing but a title' }
        ], { group: 'Cards', note: 'titles should line up whether the marker is a number, an icon, or absent' }),

        card('c-meter-pips', 'Meters and pips', [
            { part: 'header', icon: 'fa-solid fa-heart', title: 'Meters and Pips' },
            { part: 'meter', value: 90, max: 100, label: 'ok, derived above 75' },
            { part: 'meter', value: 70, max: 100, label: 'caution, derived 51-75' },
            { part: 'meter', value: 40, max: 100, label: 'warn, derived 26-50' },
            { part: 'meter', value: 15, max: 100, label: 'danger, derived 1-25' },
            { part: 'meter', value: 0, max: 100, label: 'empty, derived at zero' },
            { part: 'pips',
              center: { icon: 'fa-solid fa-skull', animation: 'pulse',
                        moduleId: 'coffee-pub-blacksmith', action: TEST_ACTION, value: 'skull',
                        tooltip: 'Clickable centre' },
              groups: [{ total: 3, filled: 1, tone: 'positive' }, { total: 3, filled: 2, tone: 'negative' }] },
            { part: 'pips', groups: [{ total: 6, filled: 4, tone: 'neutral' }] }
        ], { group: 'Cards', note: 'compare the bars against the Crier turn card -- same container, same five colours' }),

        card('c-gauges', 'Gauges: all three real instances', [
            { part: 'header', icon: 'fa-solid fa-gauge', title: 'Gauges' },
            { part: 'section', label: 'Reputation: gradient, one marker, midpoint tick' },
            { part: 'gauge', min: -100, max: 100, midpoint: 0,
              stops: [
                  { at: -100, color: 'rgba(150, 40, 30, 0.95)' },
                  { at: -56,  color: 'rgba(194, 86, 61, 0.85)' },
                  { at: -12,  color: 'rgba(186, 162, 92, 0.85)' },
                  { at: 12,   color: 'rgba(186, 162, 92, 0.85)' },
                  { at: 56,   color: 'rgba(78, 150, 80, 0.85)' },
                  { at: 100,  color: 'rgba(58, 160, 70, 0.95)' } ],
              markers: [{ at: 45, tooltip: 'Docks: 45' }],
              label: 'Squire party reputation' },

            { part: 'section', label: 'Balance: two segments, two markers' },
            { part: 'gauge', min: 0, max: 100,
              segments: [{ span: 1, color: 'rgba(160, 38, 27, 0.6)' },
                         { span: 1, color: 'rgba(58, 138, 67, 0.6)' }],
              markers: [{ at: 38 }, { at: 62, from: 'bottom', color: 'rgba(223, 134, 1, 0.95)' }],
              label: "Blacksmith's balance bar" },

            { part: 'section', label: 'Damage ratio: equal segments, flanking icons' },
            { part: 'gauge', min: 0, max: 100, midpoint: 50,
              iconStart: 'fa-solid fa-burst', iconEnd: 'fa-solid fa-heart',
              segments: [{ span: 1, color: 'rgba(160, 38, 27, 0.6)' },
                         { span: 1, color: 'rgba(160, 38, 27, 0.6)' },
                         { span: 1, color: 'rgba(58, 138, 67, 0.6)' },
                         { span: 1, color: 'rgba(58, 138, 67, 0.6)' }],
              markers: [{ at: 62 }],
              label: 'Damage dealt against healing done' },

            { part: 'section', label: 'Two markers on one value, from opposite sides' },
            { part: 'gauge', min: 0, max: 100,
              segments: [{ span: 1, color: 'rgba(160, 38, 27, 0.6)' },
                         { span: 1, color: 'rgba(58, 138, 67, 0.6)' }],
              markers: [{ at: 50, tooltip: 'current, from the top' },
                        { at: 50, from: 'bottom', color: 'rgba(223, 134, 1, 0.95)', tooltip: 'target, from below' }],
              label: 'they should meet without overlapping' },

            { part: 'section', label: 'A colour that is not a colour is dropped, not rendered' },
            { part: 'gauge', min: 0, max: 100,
              segments: [{ span: 1, color: 'red; background-image: url(x)' },
                         { span: 1, color: 'rgba(58, 138, 67, 0.6)' }],
              markers: [{ at: 50 }],
              label: 'the first segment should be absent, and the console should say why' }
        ], { group: 'Cards', note: "compare the first against Squire's party reputation bar" }),

        card('c-bands', 'Bands, all variants', [
            { part: 'header', icon: 'fa-solid fa-bullhorn', title: 'Bands' },
            { part: 'band', text: 'Plain band' },
            { part: 'band', text: 'Large tinted', icon: 'fa-solid fa-circle-exclamation', tone: 'info', size: 'large' },
            { part: 'band', text: 'Large success', tone: 'positive', size: 'large' },
            { part: 'band', text: 'Large failure', tone: 'negative', size: 'large' },
            { part: 'band', lead: 'Arcana', text: 'VS', trail: 'Athletics', tone: 'negative', quiet: true },
            { part: 'band', lead: 'Before', text: 'then', trail: 'After', quiet: true },
            { part: 'band', lead: 'Arcana', icon: 'fa-solid fa-swords', trail: 'Athletics', quiet: true },
            { part: 'band', lead: 'Attacker', icon: 'fa-solid fa-burst', trail: 'Defender',
              tone: 'negative', size: 'large', quiet: true },
            { part: 'band', text: 'Left aligned', align: 'left' },
            { part: 'band', text: 'Right aligned', align: 'right' },
            { part: 'band', icon: 'fa-solid fa-clock', text: 'With an icon', align: 'left' }
        ], { group: 'Cards', note: 'the large text should read as 1.3em of the card, not smaller' }),

        card('c-tiles', 'Tiles at three widths', [
            { part: 'header', icon: 'fa-solid fa-table-cells', title: 'Tiles' },
            { part: 'section', label: 'Six, which must stay on one row' },
            { part: 'tiles', items: [
                { label: 'STR', value: 20 }, { label: 'DEX', value: 19 }, { label: 'CON', value: 20 },
                { label: 'INT', value: 13 }, { label: 'WIS', value: 12 }, { label: 'CHA', value: 12 } ] },
            { part: 'section', label: 'Three' },
            { part: 'tiles', items: [{ label: 'AC', value: 17 }, { label: 'HP', value: 71 }, { label: 'SPD', value: 30 }] },
            { part: 'section', label: 'Eight, which wraps at the cap of six' },
            { part: 'tiles', items: Array.from({ length: 8 }, (_v, i) => ({ label: `S${i + 1}`, value: i + 1 })) }
        ], { group: 'Cards' }),

        card('c-rows-thumbs', 'Rows: thumbnail treatments', [
            { part: 'header', icon: 'fa-solid fa-image', title: 'Row Thumbnails' },
            { part: 'rows', items: [
                { img: IMG, label: 'Default', sublabel: 'contain — fits the whole image' },
                { img: IMG, cover: true, label: 'Cover', sublabel: 'crops square, for a portrait' },
                { img: PLACEHOLDER, label: 'Transparent art', sublabel: 'lands on the shared ground, no flag needed' },
                { icon: 'fa-solid fa-note-sticky', label: 'A sparse glyph', sublabel: 'thin strokes, lots of whitespace' },
                { icon: 'fa-solid fa-scroll', label: 'A dense glyph', sublabel: 'wide and solid -- must sit inset too' },
                { icon: 'fa-solid fa-scroll', label: 'Mixed with images', sublabel: 'the column still lines up' },
                { icon: 'fa-solid fa-scroll', ground: 'rgba(72, 21, 21, 0.85)', iconColor: 'rgba(255, 235, 200, 0.95)',
                  label: 'Quest', sublabel: 'its own ground and icon colour' },
                { icon: 'fa-solid fa-note-sticky', ground: 'rgba(21, 52, 72, 0.85)', iconColor: 'rgba(210, 235, 255, 0.95)',
                  label: 'Note', sublabel: 'a different category, a different palette' },
                { img: IMG, overlays: [OVERLAY], label: 'With an overlay', sublabel: 'blood over the portrait, inside the frame' },
                { icon: 'fa-solid fa-skull', ground: 'red; background-image: url(x)',
                  label: 'Rejected colour', sublabel: 'ground should be the default, console says why' } ] }
        ], { group: 'Cards', note: 'all three the same size, edge and ground; only the fit differs' }),

        card('c-rows-outcomes', 'Rows: outcome tones', [
            { part: 'header', icon: 'fa-solid fa-dice-d20', title: 'Outcome Tones' },
            // Against a DC: the mark reports the outcome, the row stays quiet.
            { part: 'section', label: 'Rolled against a DC' },
            { part: 'rows', items: [
                { label: 'Success', trailing: '18',
                  trailingSize: 'large', trailingIcon: 'fa-solid fa-check', tone: 'positive' },
                { label: 'Failure', trailing: '7',
                  trailingSize: 'large', trailingIcon: 'fa-solid fa-xmark', tone: 'negative' },
                // Crit and fumble are the ONLY rows that fill. Emphasis is what fills them.
                { label: 'Critical -- fills, bolds, shakes', trailing: '20',
                  trailingSize: 'large', trailingIcon: 'fa-solid fa-check',
                  tone: 'positive', emphasis: true, animation: 'shake-y' },
                { label: 'Fumble -- fills, bolds, shakes', trailing: '1',
                  trailingSize: 'large', trailingIcon: 'fa-solid fa-xmark',
                  tone: 'negative', emphasis: true, animation: 'shake-x' } ] },
            // No DC means there is no pass or fail to report, so there is no mark.
            { part: 'section', label: 'Rolled with no DC -- totals only' },
            { part: 'rows', items: [
                { label: 'Just a total', trailing: '15', trailingSize: 'large' },
                { label: 'Still a fumble without a DC', trailing: '1', trailingSize: 'large',
                  tone: 'negative', emphasis: true, animation: 'shake-x' } ] },
            // The die means ROLL ME. It belongs only to a row that has not rolled.
            { part: 'section', label: 'Not yet rolled' },
            { part: 'rows', items: [
                { marker: 'fa-solid fa-dice-d20', label: 'Pending', tone: 'pending' } ] }
        ], { group: 'Cards', note: 'only the crit and fumble rows should be filled; only the pending row should carry a die' }),

        card('c-rows-quiet', 'Rows: quiet trailing, plain rows, links', () => {
            const actor = game.actors.contents[0];
            return [
                { part: 'header', icon: 'fa-solid fa-list', title: 'Rows, quieter' },
                { part: 'section', label: 'Trailing as annotation, not headline' },
                { part: 'rows', items: [
                    { img: IMG, cover: true, label: 'A Character', sublabel: '1450 XP | 550 to lvl 5',
                      trailing: '+50 XP', tone: 'positive' },
                    { img: IMG, cover: true, label: 'Another', sublabel: '1200 XP | **LEVEL UP!**',
                      trailing: '+50 XP', tone: 'positive', emphasis: true },
                    { img: IMG, cover: true, label: 'Absent', sublabel: '900 XP', trailing: 'No Combat', tone: 'pending' } ] },
                { part: 'section', label: 'Plain rows and a document link' },
                { part: 'rows', plain: true, items: [
                    { img: IMG, label: 'Floor is Lava', sublabel: 'Fumble - Nasty' },
                    { img: IMG, label: 'Bloodied', sublabel: 'Effect' } ] },
                { part: 'rows', items: [
                    { img: IMG, uuid: actor?.uuid, label: actor?.name ?? 'No actor', count: 5 } ] }
            ];
        }, { group: 'Cards', note: 'compare against the XP card and the Crier turn card' }),

        card('c-emphasis', 'Badges, panel, notes, actions', [
            { part: 'header', icon: 'fa-solid fa-kit-medical', title: 'Emphasis Blocks' },
            { part: 'badges', items: [
                { icon: 'fa-solid fa-skull', label: 'Poisoned for 4 rounds' },
                { marker: 'fa-solid fa-dice-d20', label: '-1 to ability checks' },
                { label: 'No icon' } ] },
            { part: 'prose', blocks: [{ type: 'paragraph', text: 'Prose above the panel, to check the gap between them.' }] },
            { part: 'panel', icon: 'fa-solid fa-heart-pulse', label: 'Treatment',
              intro: 'Cool your wounds by swimming in a freezing glacier.',
              rows: [
                { icon: 'fa-solid fa-hourglass-half', label: 'Permanent' },
                { icon: 'fa-solid fa-heart-crack', label: '13% of max Hit Points' },
                { icon: 'fa-solid fa-sparkles', label: 'Exhaustion' },
                { icon: 'fa-solid fa-clock', label: 'Duration', value: '5 min' } ] },
            { part: 'notes', items: [{ icon: 'fa-solid fa-check', text: 'Applied to the target.' }] },
            { part: 'actions', instruction: 'Both buttons report their value.', buttons: [
                { moduleId: 'coffee-pub-blacksmith', action: TEST_ACTION, label: 'Primary',
                  icon: 'fa-solid fa-check', value: 'primary' },
                { moduleId: 'coffee-pub-blacksmith', action: TEST_ACTION, label: 'Secondary',
                  icon: 'fa-solid fa-xmark', value: 'secondary' },
                { moduleId: 'coffee-pub-blacksmith', action: TEST_ACTION, label: 'Disabled',
                  icon: 'fa-solid fa-ban', disabled: true } ] }
        ], { group: 'Cards', note: 'the panel should match the injury card, not read tighter than it' }),

        card('c-buttons', 'Buttons: the three weights, and disabled', [
            { part: 'header', icon: 'fa-solid fa-hand-pointer', title: 'Button Weights' },
            { part: 'section', label: 'Primary is listed FIRST here' },
            // Deliberately out of order. The renderer moves the primary button to the
            // right, so a card cannot put the confirm action somewhere unexpected.
            { part: 'actions', instruction: 'It should still render on the right.', buttons: [
                { moduleId: MOD, action: TEST_ACTION, label: 'Confirm', variant: 'primary',
                  icon: 'fa-solid fa-check', value: 'primary' },
                { moduleId: MOD, action: TEST_ACTION, label: 'Cancel', variant: 'secondary',
                  icon: 'fa-solid fa-xmark', value: 'secondary' } ] },
            { part: 'section', label: 'Critical, and the default weight' },
            { part: 'actions', buttons: [
                { moduleId: MOD, action: TEST_ACTION, label: 'No variant given', value: 'default' },
                { moduleId: MOD, action: TEST_ACTION, label: 'Delete', variant: 'critical',
                  icon: 'fa-solid fa-trash', value: 'critical' } ] },
            { part: 'section', label: 'Disabled, and a rejected variant' },
            { part: 'actions', buttons: [
                { moduleId: MOD, action: TEST_ACTION, label: 'Disabled primary', variant: 'primary',
                  icon: 'fa-solid fa-ban', disabled: true },
                // Not in the allowlist -- must fall back to secondary, not reach the class.
                { moduleId: MOD, action: TEST_ACTION, label: 'Bogus variant', variant: 'card-header',
                  value: 'bogus' } ] },
            // Stacked: a list of alternatives rather than a confirm/cancel pair.
            { part: 'section', label: 'Stacked -- one button per row' },
            { part: 'actions', layout: 'stacked', instruction: 'Choose a formation.', buttons: [
                { moduleId: MOD, action: TEST_ACTION, label: 'Line abreast', icon: 'fa-solid fa-grip-lines', value: 'line' },
                { moduleId: MOD, action: TEST_ACTION, label: 'Wedge', icon: 'fa-solid fa-play', value: 'wedge' },
                { moduleId: MOD, action: TEST_ACTION, label: 'Scatter -- a deliberately long label to prove it never wraps',
                  icon: 'fa-solid fa-arrows-to-circle', value: 'scatter' },
                // Listed first again; stacked puts it at the BOTTOM, the same end of
                // the list that "right" means when inline.
                { moduleId: MOD, action: TEST_ACTION, label: 'Deploy', variant: 'primary',
                  icon: 'fa-solid fa-check', value: 'deploy' } ] }
        ], { group: 'Cards', note: 'Confirm on the RIGHT when inline and at the BOTTOM when stacked, both despite being listed first' }),

        card('c-richtext', 'Richtext, from document HTML', [
            { part: 'header', icon: 'fa-solid fa-file-lines', title: 'Richtext' },
            // Every element a journal page can realistically contain. The point is
            // that the CARD governs all of it -- a table authored elsewhere must not
            // arrive carrying its own look.
            { part: 'richtext', html: [
                '<p>A paragraph from a document, with <strong>bold</strong> and <em>italic</em>.</p>',
                '<h1>A heading one</h1>',
                '<h2>A heading two</h2>',
                '<p>Text under the heading.</p>',
                '<h3>A heading three</h3>',
                '<h4>A heading four</h4>',
                '<h5>A heading five</h5>',
                '<h6>A heading six</h6>',
                '<ul><li>An unordered item</li><li>Another</li></ul>',
                '<ol><li>An ordered item</li><li>Another</li></ol>',
                '<table><thead><tr><th>Roll</th><th>Result</th><th>Notes</th></tr></thead>',
                '<tbody>',
                '<tr><td>1-2</td><td>Nothing happens</td><td>Move along</td></tr>',
                '<tr><td>3-5</td><td>A wandering merchant</td><td>Has rope</td></tr>',
                '<tr><td>6</td><td>Something with far too many teeth for the number of eyes it has</td><td>Run</td></tr>',
                '</tbody></table>',
                '<blockquote>And a blockquote.</blockquote>',
                '<hr />',
                '<pre>preformatted text, which should wrap rather than overflow the card when the line is a long one</pre>'
            ].join('') }
        ], { group: 'Cards', note: 'h1-h6 must descend in size; table header smaller than its data, themed not red, never breaking mid-word; hover a truncated header for its tooltip' }),

        {
            id: 'c-themes',
            tier: 'interactive',
            group: 'Cards',
            label: 'One card per theme',
            note: 'posts nine cards; structure must be identical and only colour differ',
            run: async ({ log }) => {
                const { chatCards } = requireApi('chatCards');
                for (const theme of chatCards.getThemes()) {
                    await chatCards.post({
                        moduleId: 'coffee-pub-blacksmith',
                        type: 'harness-theme',
                        theme: theme.id,
                        parts: [
                            { part: 'header', icon: 'fa-solid fa-palette', title: theme.name },
                            { part: 'band', text: theme.id },
                            { part: 'prose', blocks: [{ type: 'paragraph', text: 'Only colour should change.' }] },
                            { part: 'rows', items: [{ icon: 'fa-solid fa-circle', label: 'A row', trailing: '10', tone: 'positive' }] }
                        ]
                    });
                }
                log(`Posted ${chatCards.getThemes().length} theme cards.`);
            }
        },

        {
            id: 'rerender',
            tier: 'interactive',
            group: 'Persistence',
            label: 'Re-render and re-bind after a reload',
            note: 'post, then reload the browser, then click the button on the posted card',
            run: async ({ log }) => {
                const { chatCards } = requireApi('chatCards');
                chatCards.registerAction('coffee-pub-blacksmith', TEST_ACTION, ({ value }) =>
                    ui.notifications.info(`Card action fired. value=${value ?? 'none'}`));
                await chatCards.post({
                    moduleId: 'coffee-pub-blacksmith',
                    type: 'harness-rerender',
                    parts: [
                        { part: 'header', icon: 'fa-solid fa-rotate', title: 'Reload Test' },
                        { part: 'prose', blocks: [{ type: 'paragraph', text: 'Reload the browser, then click below. It should still fire.' }] },
                        { part: 'actions', buttons: [
                            { moduleId: 'coffee-pub-blacksmith', action: TEST_ACTION,
                              label: 'Click me after reloading', icon: 'fa-solid fa-rotate', value: 'after-reload' } ] }
                    ]
                });
                log('Posted. Now reload the browser, re-open this harness, run "Register the handlers" once, and click the card button.');
            }
        }
    ]
};
