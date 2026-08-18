// ============================================
// SHOW CARD PARTS - Script Macro
// ============================================
// Posts one chat card demonstrating every part in the chat-card library, each
// labelled with its part id, so the vocabulary can be seen rather than read
// about. The authoritative list is api-chatcards.md; this is the picture.
//
// Paste into a script macro and run it.
//
// It drives itself off `chatCards.getParts()` rather than a list written here,
// so a part added to CARD_PARTS and not demonstrated below is REPORTED in the
// console instead of silently missing from the card. That is the whole reason
// it is worth being a macro rather than a screenshot.
// ============================================

(async () => {
    const chatCards = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
    if (!chatCards) {
        ui.notifications.error('Blacksmith chat cards API not available.');
        return;
    }

    // Whispered by default: this is a developer reference, and a card this long
    // in front of the whole table is noise. Set to false to post it publicly.
    const WHISPER_TO_SELF = true;

    // A core Foundry image, so this runs in any world with no assets of its own.
    const IMG = 'icons/svg/mystery-man.svg';

    // One entry per part id. `label` is what the divider above it says, and it is
    // deliberately the raw part id -- the point is to connect the shape you are
    // looking at to the name you type.
    const EXAMPLES = {
        header: {
            icon: 'fa-solid fa-heading',
            parts: [{ part: 'header', icon: 'fa-solid fa-scroll', title: 'A card title' }]
        },

        // Not shown here. A ribbon is absolutely positioned against the card's own
        // top-right corner, so it cannot appear inline in a list of examples and
        // only one can exist per card. The one on this card IS the demonstration.
        ribbon: {
            icon: 'fa-solid fa-award',
            parts: [{
                part: 'prose',
                blocks: [{ type: 'paragraph', text: 'Look at the *top-right corner of this card*. A ribbon sits outside the card flow and clips against its own corner box, so there can only be one and it cannot be shown inline. Takes `text` and an optional `tone`.' }]
            }]
        },

        identity: {
            icon: 'fa-solid fa-id-badge',
            parts: [{ part: 'identity', img: IMG, name: 'Kar-ahn', subtitle: 'Half-orc barbarian, level 5' }]
        },

        subject: {
            icon: 'fa-solid fa-user-large',
            parts: [
                { part: 'subject', img: IMG, index: 1, title: 'With an index and a meter', value: '71/101',
                  meter: { value: 71, max: 101 } },
                { part: 'subject', img: IMG, marker: 'fa-solid fa-crown', title: 'With a marker and a gauge',
                  gauge: { min: -100, max: 100, midpoint: 0, markers: [{ at: 45 }] } },
                { part: 'subject', title: 'With neither, degrading to a heading', value: '12' }
            ]
        },

        image: {
            icon: 'fa-solid fa-image',
            parts: [{ part: 'image', src: IMG, alt: 'An example image', caption: 'A picture with a caption' }]
        },

        meter: {
            icon: 'fa-solid fa-battery-half',
            parts: [
                { part: 'meter', value: 82, max: 100, label: 'Tone derived from the percentage' },
                { part: 'meter', value: 34, max: 100, label: 'Tone passed as caution', tone: 'caution' },
                { part: 'meter', value: 9, max: 100, label: 'Tone passed as danger', tone: 'danger' }
            ]
        },

        gauge: {
            icon: 'fa-solid fa-gauge-high',
            parts: [
                { part: 'gauge', min: -100, max: 100, midpoint: 0, label: 'A gradient, with stops',
                  stops: [
                      { at: -100, color: 'rgba(150, 40, 30, 0.95)' },
                      { at: 0, color: 'rgba(186, 162, 92, 0.85)' },
                      { at: 100, color: 'rgba(58, 160, 70, 0.95)' }
                  ],
                  markers: [{ at: 45, tooltip: 'Current: 45' }, { at: -20, from: 'bottom', tooltip: 'Last week: -20' }] },
                { part: 'gauge', min: 0, max: 30, label: 'Discrete blocks, with segments',
                  segments: [
                      { span: 1, color: 'rgba(150, 40, 30, 0.95)' },
                      { span: 2, color: 'rgba(186, 162, 92, 0.85)' },
                      { span: 1, color: 'rgba(58, 160, 70, 0.95)' }
                  ],
                  markers: [{ at: 22 }] }
            ]
        },

        band: {
            icon: 'fa-solid fa-flag',
            parts: [
                { part: 'band', text: 'A plain band' },
                { part: 'band', text: 'Tinted and large', icon: 'fa-solid fa-circle-exclamation', tone: 'info', size: 'large' },
                { part: 'band', lead: 'Arcana', text: 'VS', trail: 'Athletics', tone: 'negative', quiet: true }
            ]
        },

        tiles: {
            icon: 'fa-solid fa-table-cells',
            parts: [{ part: 'tiles', items: [
                { label: 'STR', value: '18' }, { label: 'DEX', value: '12' }, { label: 'CON', value: '16' },
                { label: 'INT', value: '8' }, { label: 'WIS', value: '11' }, { label: 'CHA', value: '14' }
            ] }]
        },

        section: {
            icon: 'fa-solid fa-minus',
            parts: [{
                part: 'prose',
                blocks: [{ type: 'paragraph', text: 'Every divider on this card is a `section`. Takes an `icon` and a `label`.' }]
            }]
        },

        prose: {
            icon: 'fa-solid fa-align-left',
            parts: [{ part: 'prose', blocks: [
                { type: 'paragraph', text: 'A paragraph, with **bold** and *italic* marks. HTML is escaped, not rendered.' },
                { type: 'list', items: ['An unordered item', 'Another item'], ordered: false },
                { type: 'list', items: ['A first step', 'A second step'], ordered: true },
                { type: 'table', rows: [['Coins', '3 gp'], ['Weight', '12 lb']] },
                { type: 'quote', text: 'A quote block.' }
            ] }]
        },

        pips: {
            icon: 'fa-solid fa-circle-dot',
            parts: [{ part: 'pips',
                center: { icon: 'fa-solid fa-skull', tooltip: 'The centre is the only click target' },
                groups: [
                    { total: 3, filled: 1, tone: 'positive' },
                    { total: 3, filled: 2, tone: 'negative' }
                ] }]
        },

        // The workhorse, and the one part with real range. Three groups below: rows you
        // CLICK, rows that REPORT, and the presentation flags. The roll buttons on a
        // Request a Roll card are the first group -- see `actorRow` in
        // scripts/cards-skill-check.js, which is this shape and nothing more.
        rows: {
            icon: 'fa-solid fa-list',
            parts: [
                { part: 'prose', blocks: [{ type: 'paragraph', text: '**Rows you act on.** Three mechanisms, not interchangeable. These are inert here -- no handler is registered.' }] },
                { part: 'rows', items: [
                    // EXACTLY the Request a Roll button. A marker rather than a thumbnail,
                    // the whole row as the target, and everything the handler needs packed
                    // into `value`, because a handler receives only that string.
                    { marker: 'fa-solid fa-dice-d20', label: 'clickable: the whole row is the button',
                      clickable: true, moduleId: 'coffee-pub-blacksmith', action: 'demo-inert-row',
                      value: JSON.stringify({ example: true }),
                      tooltip: 'This is the Request a Roll shape' },
                    // The row reports; the button does something TO it.
                    { img: IMG, label: 'action + actionIcon: a button at the end',
                      moduleId: 'coffee-pub-blacksmith', action: 'demo-inert-button',
                      actionIcon: 'fa-solid fa-rotate-right', trailing: '12' },
                    // A readout whose destination is the document itself.
                    { icon: 'fa-solid fa-book', label: 'uuid: the label becomes a document link',
                      uuid: game.user.character?.uuid || game.actors.contents[0]?.uuid }
                ] },

                { part: 'prose', blocks: [{ type: 'paragraph', text: '**Rows that report.** Tone tints, `emphasis` glows and bolds, `trailingIcon` marks the result, `animation` moves it. A critical is `positive` + `emphasis` + `shake-y`; a fumble is `negative` + `shake-x`.' }] },
                { part: 'rows', items: [
                    { img: IMG, cover: true, label: 'A critical', sublabel: 'cover: true crops the portrait square',
                      trailing: '28', trailingSize: 'large', trailingIcon: 'fa-solid fa-check',
                      tone: 'positive', emphasis: true, animation: 'shake-y' },
                    { img: IMG, label: 'An ordinary pass', trailing: '16', trailingSize: 'large',
                      trailingIcon: 'fa-solid fa-check', tone: 'positive' },
                    { icon: 'fa-solid fa-hand-fist', label: 'A fumble', count: 3,
                      trailing: '1', trailingSize: 'large', trailingIcon: 'fa-solid fa-xmark',
                      tone: 'negative', emphasis: true, animation: 'shake-x' },
                    { icon: 'fa-solid fa-hourglass-half', label: 'Awaiting a result', tone: 'pending' }
                ] },

                { part: 'prose', blocks: [{ type: 'paragraph', text: '**Presentation.** `plain: true` drops the boxes.' }] },
                { part: 'rows', plain: true, items: [
                    { icon: 'fa-solid fa-droplet', label: 'Which suits a conditions list' },
                    { icon: 'fa-solid fa-eye-slash', label: 'Icon and text, no container' }
                ] }
            ]
        },

        badges: {
            icon: 'fa-solid fa-tags',
            parts: [{ part: 'badges', items: [
                { icon: 'fa-solid fa-fire', label: 'Burning' },
                { icon: 'fa-solid fa-snowflake', label: 'Chilled' },
                { icon: 'fa-solid fa-bolt', label: 'Shocked' }
            ] }]
        },

        panel: {
            icon: 'fa-solid fa-square',
            parts: [{ part: 'panel', icon: 'fa-solid fa-kit-medical', label: 'Treatment',
                intro: 'each row is a flowing statement, not a label and value column.',
                rows: [
                    { icon: 'fa-solid fa-bed', label: 'Rest until the wound closes.' },
                    { icon: 'fa-solid fa-hand-holding-medical', label: 'A healer may shorten this.' }
                ] }]
        },

        notes: {
            icon: 'fa-solid fa-note-sticky',
            parts: [{ part: 'notes', items: [
                { icon: 'fa-solid fa-circle-info', label: 'A footer annotation.' },
                { icon: 'fa-solid fa-clock', label: 'Another one.' }
            ] }]
        },

        actions: {
            icon: 'fa-solid fa-hand-pointer',
            parts: [{ part: 'actions', instruction: 'These buttons are inert -- no handler is registered for them.',
                buttons: [
                    { action: 'demo-primary', label: 'Primary', icon: 'fa-solid fa-check',
                      variant: 'primary', moduleId: 'coffee-pub-blacksmith' },
                    { action: 'demo-secondary', label: 'Secondary', variant: 'secondary',
                      moduleId: 'coffee-pub-blacksmith' },
                    { action: 'demo-disabled', label: 'Disabled', variant: 'critical',
                      moduleId: 'coffee-pub-blacksmith', disabled: true }
                ] }]
        },

        richtext: {
            icon: 'fa-solid fa-code',
            parts: [
                // KNOWINGLY AGAINST THE GRAIN, and only here. `richtext` is for HTML that
                // already exists in a Foundry document, and building an HTML string in
                // JavaScript to feed it is the thing the API doc warns against, because it
                // is enriched rather than sanitised. It is acceptable in this one file
                // because the string is authored right here rather than generated or
                // fetched -- which is exactly the vetting the part assumes. Do not copy
                // this shape into a module: pass `journalPage.text.content`, or parse
                // generated content into parts.
                { part: 'richtext', html: '<p>Document-sourced HTML, scoped to card typography. Pass <em>journalPage.text.content</em>, never a string you built.</p>' }
            ]
        }
    };

    // The live list is the source of truth for what exists; EXAMPLES is only what
    // this macro knows how to draw. Comparing them is what keeps the card honest.
    const available = chatCards.getParts();
    const undemonstrated = available.filter((id) => !EXAMPLES[id]);
    const stale = Object.keys(EXAMPLES).filter((id) => !available.includes(id));

    const parts = [
        // First in the composition because that is where a reader meets it, though
        // it renders at the corner regardless of order.
        { part: 'ribbon', text: 'Reference', tone: 'info' },
        { part: 'header', icon: 'fa-solid fa-cubes', title: 'Chat Card Parts' },
        { part: 'prose', blocks: [{
            type: 'paragraph',
            text: `Every part in the library, in the order \`getParts()\` returns them. **${available.length} parts.** The divider above each one is its part id -- the name you pass as \`part\`.`
        }] }
    ];

    for (const id of available) {
        const example = EXAMPLES[id];
        if (!example) continue;
        parts.push({ part: 'section', icon: example.icon, label: id });
        parts.push(...example.parts);
    }

    if (undemonstrated.length) {
        parts.push({ part: 'section', icon: 'fa-solid fa-triangle-exclamation', label: 'not demonstrated' });
        parts.push({ part: 'notes', items: undemonstrated.map((id) => ({
            icon: 'fa-solid fa-circle-question',
            label: `${id} -- exists in CARD_PARTS but this macro has no example for it.`
        })) });
    }

    const message = await chatCards.post({
        moduleId: 'coffee-pub-blacksmith',
        type: 'card-parts-reference',
        parts,
        ...(WHISPER_TO_SELF ? { whisper: [game.user.id] } : {})
    });

    if (!message) {
        ui.notifications.error('Card failed to post. See the console.');
        return;
    }

    console.log(`BLACKSMITH | CARD PARTS Posted ${available.length} part(s).`);
    if (undemonstrated.length) {
        console.warn('BLACKSMITH | CARD PARTS No example for:', undemonstrated.join(', '));
    }
    if (stale.length) {
        console.warn('BLACKSMITH | CARD PARTS Example exists for a part that is no longer in CARD_PARTS:', stale.join(', '));
    }
    ui.notifications.info(`Posted ${available.length} card part(s) to chat.`);
})();
