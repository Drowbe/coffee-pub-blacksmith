// ==================================================================
// ===== CHAT CARD PARTS PREVIEW (testing/preview-chat-cards.js) ==
// ==================================================================
// Paste this entire file into a Foundry SCRIPT MACRO and run it as the
// GM. It posts one card per group, exercising every part in the chat
// card library and every variant of the parts that have them.
//
// This is a manual visual check, the same category as everything else in
// utilities/. It exists because most of what can go wrong with a card is
// something only a person can see -- alignment, spacing, whether two
// treatments look like the same family -- and because comparing a fresh
// render against a reference card is how every styling defect in this
// system has actually been found.
//
// The prose pipeline's contract (consumer HTML is escaped, enricher
// syntax survives) is asserted automatically instead:
//   node tools/check-card-prose.mjs
//
// WHAT TO LOOK AT
//   1. Every part appears. A missing block means a template failed and
//      the console will name it.
//   2. Card 2's injection line shows literal angle brackets. If it
//      renders as bold, escaping has regressed -- stop and fix that
//      before anything else.
//   3. Card 1's tiles sit on ONE row, and its pips fill outward from
//      the centre marker.
//   4. Both buttons and the skull fire their notification, before AND
//      after a browser reload.
//
// Docs: documentation/api/api-chatcards.md
// ==================================================================

(async () => {

const cc = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
if (!cc) return ui.notifications.error('Blacksmith chat cards API not available.');

const M = 'coffee-pub-blacksmith';
const IMG = 'icons/svg/mystery-man.svg';
const OVERLAY = 'icons/svg/blood.svg';        // swap if your core lacks it
const actor = game.actors.contents[0] ?? null;

// Actions must be registered before the cards render. Registering here is
// fine for a preview; real modules register once at startup, because a
// handler cannot ride the message to other clients.
cc.registerAction(M, 'preview-action', ({ value }) =>
    ui.notifications.info(`Card action fired. value=${value ?? 'none'}`));

const uuidLine = actor
    ? `A document link: @UUID[${actor.uuid}]{${actor.name}} should render as a pill.`
    : 'No actor in this world, so no link to demonstrate.';

// ------------------------------------------------------------------
// 1. STRUCTURE -- identity, image with overlay, meter, pips, band, tiles
// ------------------------------------------------------------------
await cc.post({
    moduleId: M, type: 'preview-structure',
    parts: [
        { part: 'header', icon: 'fa-solid fa-crown', title: 'Parts Preview: Structure' },
        { part: 'identity', img: IMG, name: actor?.name ?? 'Test Character', subtitle: 'Player Name' },
        { part: 'image', src: IMG, overlays: [OVERLAY], alt: '', caption: 'Image with an overlay and a caption' },
        { part: 'meter', value: 71, max: 101, label: '71 / 101 HP' },
        { part: 'meter', value: 20, max: 101, label: 'Low, so the tone shifts on its own' },
        { part: 'pips',
          center: { icon: 'fa-solid fa-skull', animation: 'pulse',
                    moduleId: M, action: 'preview-action', value: 'skull',
                    tooltip: 'Clickable centre marker' },
          groups: [{ total: 3, filled: 1, tone: 'success' },
                   { total: 3, filled: 2, tone: 'failure' }] },
        { part: 'pips', groups: [{ total: 6, filled: 4, tone: 'neutral' }] },
        { part: 'band', text: 'Plain band' },
        { part: 'tiles', items: [
            { label: 'STR', value: 20 }, { label: 'DEX', value: 19 }, { label: 'CON', value: 20 },
            { label: 'INT', value: 13 }, { label: 'WIS', value: 12 }, { label: 'CHA', value: 12 } ] }
    ]
});

// ------------------------------------------------------------------
// 2. TEXT -- prose blocks, marks, links, richtext, and the escape contract
// ------------------------------------------------------------------
await cc.post({
    moduleId: M, type: 'preview-text',
    parts: [
        { part: 'header', icon: 'fa-solid fa-align-left', title: 'Parts Preview: Text' },
        { part: 'section', icon: 'fa-solid fa-paragraph', label: 'Prose blocks' },
        { part: 'prose', blocks: [
            { type: 'paragraph', text: 'Bold **works**, italic *works*, code `works`.' },
            { type: 'paragraph', text: uuidLine },
            { type: 'paragraph', text: 'Inline roll: [[/r 1d20]] should be clickable.' },
            { type: 'paragraph', text: 'ESCAPE TEST: <b>this must show as literal tags</b>' },
            { type: 'list', items: ['Unordered first', 'Unordered second'] },
            { type: 'list', ordered: true, items: ['Ordered first', 'Ordered second'] },
            { type: 'table', rows: [['Coins', '3 gp'], ['Weight', '12 lb'], ['Rarity', 'Uncommon']] },
            { type: 'quote', text: 'A quote block, for narration and read-aloud text.' }
        ] },
        { part: 'section', icon: 'fa-solid fa-file-lines', label: 'Richtext, for document HTML' },
        { part: 'richtext', html: '<p>Document-sourced <em>HTML</em>, with a <strong>bold</strong> run and a <ul><li>list</li></ul></p>' },
        { part: 'notes', items: [
            { icon: 'fa-solid fa-circle-info', text: 'A footer note.' },
            { icon: 'fa-solid fa-check', text: 'A second footer note.' } ] }
    ]
});

// ------------------------------------------------------------------
// 3. ROWS -- every variant, boxed and plain, with tones and emphasis
// ------------------------------------------------------------------
await cc.post({
    moduleId: M, type: 'preview-rows',
    parts: [
        { part: 'header', icon: 'fa-solid fa-list', title: 'Parts Preview: Rows' },
        { part: 'section', icon: 'fa-solid fa-box', label: 'Boxed rows' },
        { part: 'rows', items: [
            { img: IMG, uuid: actor?.uuid, label: actor?.name ?? 'Linked entity', count: 5 },
            { img: IMG, label: 'Image, label and sub-line', sublabel: 'Secondary text' },
            { icon: 'fa-solid fa-coins', label: 'Icon and trailing value', trailing: '+50 XP' },
            { icon: 'fa-solid fa-gear', label: 'With an action button', sublabel: 'Click the button',
              moduleId: M, action: 'preview-action', value: 'row-button' },
            { label: 'Label only' } ] },
        { part: 'section', icon: 'fa-solid fa-dice-d20', label: 'Outcome tones' },
        { part: 'rows', items: [
            { icon: 'fa-solid fa-dice-d20', label: 'Success', trailing: '18', trailingIcon: 'fa-solid fa-check', tone: 'success' },
            { icon: 'fa-solid fa-dice-d20', label: 'Success, emphasised, shaking', trailing: '20',
              trailingIcon: 'fa-solid fa-check', tone: 'success', emphasis: true, animation: 'shake-y' },
            { icon: 'fa-solid fa-dice-d20', label: 'Failure', trailing: '7', trailingIcon: 'fa-solid fa-xmark', tone: 'failure' },
            { icon: 'fa-solid fa-dice-d20', label: 'Failure, emphasised, shaking', trailing: '1',
              trailingIcon: 'fa-solid fa-xmark', tone: 'failure', emphasis: true, animation: 'shake-x' },
            { icon: 'fa-solid fa-dice-d20', label: 'Tie', trailing: '12', tone: 'tie' },
            { icon: 'fa-solid fa-dice-d20', label: 'Pending', tone: 'pending' } ] },
        { part: 'section', icon: 'fa-solid fa-bars', label: 'Plain rows, no boxes' },
        { part: 'rows', plain: true, items: [
            { img: IMG, label: 'Floor is Lava', sublabel: 'Fumble - Nasty' },
            { img: IMG, label: 'Bloodied', sublabel: 'Effect' },
            { icon: 'fa-solid fa-skull-crossbones', label: 'Poisoned', sublabel: 'Effect - via Gaseous Maximus' } ] }
    ]
});

// ------------------------------------------------------------------
// 4. EMPHASIS -- bands, badges, panel, actions
// ------------------------------------------------------------------
await cc.post({
    moduleId: M, type: 'preview-emphasis', theme: 'orange',
    parts: [
        { part: 'header', icon: 'fa-solid fa-bullhorn', title: 'Parts Preview: Emphasis' },
        { part: 'band', text: 'Stalemate', icon: 'fa-solid fa-circle-exclamation', tone: 'tie', size: 'large' },
        { part: 'band', text: 'Success', tone: 'success', size: 'large' },
        { part: 'band', text: 'Failure', tone: 'failure', size: 'large' },
        { part: 'band', text: 'DC 15' },
        { part: 'band', lead: 'Arcana', text: 'VS', trail: 'Athletics', tone: 'failure', quiet: true },
        { part: 'section', icon: 'fa-solid fa-tags', label: 'Badges' },
        { part: 'badges', items: [
            { icon: 'fa-solid fa-skull', label: 'Poisoned for 4 rounds' },
            { icon: 'fa-solid fa-dice-d20', label: '-1 to ability checks' },
            { label: 'No icon' } ] },
        { part: 'section', icon: 'fa-solid fa-kit-medical', label: 'Panel' },
        { part: 'panel', icon: 'fa-solid fa-heart-pulse', label: 'Treatment',
          intro: 'Cool your wounds by swimming in a freezing glacier.',
          rows: [
            { icon: 'fa-solid fa-hourglass-half', label: 'Permanent' },
            { icon: 'fa-solid fa-heart-crack', label: '13% of max Hit Points' },
            { icon: 'fa-solid fa-sparkles', label: 'Exhaustion' },
            { icon: 'fa-solid fa-clock', label: 'Duration', value: '5 min' } ] },
        { part: 'actions', instruction: 'Both buttons fire the same handler with different values.',
          buttons: [
            { moduleId: M, action: 'preview-action', label: 'Primary', icon: 'fa-solid fa-check', value: 'primary' },
            { moduleId: M, action: 'preview-action', label: 'Secondary', icon: 'fa-solid fa-xmark', value: 'secondary' },
            { moduleId: M, action: 'preview-action', label: 'Disabled', icon: 'fa-solid fa-ban', disabled: true } ] }
    ]
});

// ------------------------------------------------------------------
// 5. THEMES -- the same composition in each theme, to confirm that a
//    theme changes colour and nothing else.
// ------------------------------------------------------------------
for (const theme of cc.getThemes()) {
    await cc.post({
        moduleId: M, type: 'preview-theme', theme: theme.id,
        parts: [
            { part: 'header', icon: 'fa-solid fa-palette', title: `Theme: ${theme.name}` },
            { part: 'band', text: theme.id },
            { part: 'prose', blocks: [{ type: 'paragraph', text: `Structure is identical in every theme. Only colour changes. This is the **${theme.name}** theme.` }] },
            { part: 'rows', items: [{ icon: 'fa-solid fa-circle', label: 'A row', trailing: '10' }] }
        ]
    });
}

ui.notifications.info(`Chat card preview posted: 4 structure cards plus ${cc.getThemes().length} themes.`);

})();
