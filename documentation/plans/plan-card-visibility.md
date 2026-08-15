# Plan: Card Visibility

**Status: Planned.** Nothing is built. This exists to be dismantled: the design goes to
`documentation/architecture/architecture-chatcards.md`, the surface to
`documentation/api/api-chatcards.md`, the work to `TODO.md`, and the history to `CHANGELOG.md`.

Written 2026-08-14, on the way into the skill check migration (step 5 of `plan-chat-cards.md`), because
skill check is the first card that cannot be composed without it.

The evidence in "What exists today" was read from code and needs one live confirmation, called out where
it matters. The design starts at "The two kinds of hiding".

## The requirement

A card shows a value that not every reader may see. Skill check is the case in hand: a roll requested
under `gmroll`, `blindroll` or `selfroll` shows its total to the entitled reader and an eye icon to
everyone else. The same shape recurs elsewhere -- a secret DC, a hidden monster stat, a GM note on an
otherwise public card -- so it belongs in the parts vocabulary rather than in one card.

## What exists today

Skill check does this with Handlebars conditionals inside `templates/card-skill-check.hbs:91-119`,
branching on `../rollMode`, `../isGM` and `this.actorId == ../requesterId`.

Three findings, in the order they matter:

1. **The roll mode is never applied to the message.** `window-skillcheck.js:1529-1536` calls
   `ChatMessage.create({ ..., rollMode })` with `rollMode` inside the *document data*. Foundry applies a
   roll mode through `ChatMessage.applyRollMode(data, mode)` or the `create` options argument, neither of
   which is used -- `applyRollMode` appears nowhere in `scripts/`, and this path sets no `whisper` and no
   `blind`. So the message is delivered to every client regardless of the mode chosen.

2. **`isGM` is the composer's, baked in.** `window-skillcheck.js:1509` captures `isGM: game.user.isGM`
   into the flags at composition time. The card is rendered once from those flags and stored as a single
   `content` string (`blacksmith.js:2669-2671`, render then `message.update({ content })`), and re-rendered the same way
   after every roll. One stored string cannot show two readers different things, and the value it branches
   on belongs to whoever composed the request -- a GM.

3. **Therefore the hiding does not work.** A GM composing a `gmroll` bakes `isGM: true`, the template takes
   the revealing branch, and that markup is what every player receives. **Confirm this in a live world
   before building on it** -- one GM and one player, request a `gmroll`, have the player roll, and read the
   player's screen. If it hides correctly, finding 1 or 2 is wrong and this plan needs rewriting.

This changes what the work is. It is not "add a feature the old card had". It is "repair a leak, and give
the parts system the vocabulary the repair needs".

## The two kinds of hiding

These are different mechanisms with different guarantees, and conflating them is how a system ends up
claiming privacy it does not have.

**Delivery privacy.** The value never reaches the unentitled client. In Foundry that is `whisper` and
`blind` on the message, which is what a roll mode is for. This is the only kind that actually keeps a
secret.

**Presentation privacy.** The value reaches every client inside the message flags, and the renderer
declines to show it to some of them. A determined player can read it in the console. This is worth having
-- it is what stops a total appearing on screen and spoiling a moment -- but it is a courtesy, not a
control.

**Decision 1: the system offers both, names them differently, and never lets a caller mistake one for the
other.** A composition asking to veil a value gets presentation privacy and says so. A caller wanting
delivery privacy whispers the message, which is a property of the message rather than of a part.

**Decision 2: skill check needs both, in that order.** Fix the roll mode so `gmroll` and `blindroll`
whisper (delivery), and veil the totals so a public `roll` card can still stage a reveal
(presentation). Fixing only the second would leave the leak and dress it up.

## The design

### The veiled value

Anywhere a part accepts a text field, it also accepts a veiled form:

```javascript
{ part: 'rows', items: [
    { label: 'Favia Gita', trailing: { value: '18', readableBy: 'gm', veil: 'fa-solid fa-eye' } }
] }
```

- `value` -- what an entitled reader sees.
- `readableBy` -- who is entitled. `'gm'`, `'owner'` (the actor's owner), `'author'` (whoever posted), or
  an explicit array of user ids. Validated against an allowlist, like `variant` and `tone`, because it
  reaches a render decision.
- `veil` -- what everyone else sees. An icon class or a short string. Defaults to an eye icon.

**Decision 3: resolution happens in the renderer, per client, not in the composer.** The composer runs
once on one machine; the renderer runs in every reader's browser. `manager-chat-cards.js` already
re-renders from flags on each client (`blacksmith.js:2321`), so this is the mechanism that exists rather
than a new one.

**Decision 4: the baked copy contains the VEILED form, always.** The snapshot in `content` is written once
by the poster and is what a client shows before the re-render lands, and what it keeps if the re-render
fails or the module is disabled. Baking the revealed form would leak to every reader in the window before
re-render -- which is exactly the bug we are fixing, reintroduced through the back door. Failing closed
costs an entitled reader a flicker; failing open costs the secret.

**Decision 5: a veiled value is still escaped and processed like any other text.** It goes through the
same escape, marks and enrich pipeline. A veil is about who reads it, not about what it may contain.

### What it does not do

`readableBy` does not remove the value from the flags. It cannot: the flags are how the re-render works.
Anything that must not reach a client at all is a whisper, and the API documentation has to say so plainly
next to `readableBy`, or someone will reach for the wrong one.

## Open questions

- **Does `owner` mean the actor's owner or the token's?** Skill check wants "the player who was asked to
  roll", which is usually but not always the actor owner.
- **Does a veiled value collapse the row, or hold its space?** Holding space keeps a list from reflowing
  as rolls come in, which argues for it.
- **Is `readableBy` per field or per part?** Per field is more precise and more verbose. Skill check needs
  only the trailing value, which argues per field; a GM-only section would want per part.

## The work

1. **Confirm the leak** in a live world, per "What exists today". If it does not reproduce, stop and
   rewrite this plan.
2. **Apply the roll mode properly** in `window-skillcheck.js`, so `gmroll` and `blindroll` whisper. This is
   a bug fix and can ship on its own, ahead of everything below.
3. **Add the veiled value** to `manager-chat-cards.js`: the allowlist, the per-client resolution, and the
   fail-closed baked form.
4. **Extend `tools/check-card-contracts.mjs`** so a `readableBy` outside the allowlist is a build failure,
   and so the baked form cannot contain a revealed value.
5. **Harness card** covering each `readableBy`, an unentitled reader, and the pre-re-render baked state.
6. **Migrate skill check** onto it (step 5 of `plan-chat-cards.md`).

## How it will be verified

Two clients, a GM and a player, because a one-client test cannot see this class of bug at all.

- A `gmroll` request: the player's client must not receive the total in the message at all. Check the
  player's console, not just the screen.
- A public `roll` with veiled totals: the player sees the veil, the GM sees the value, and the *same
  message* shows differently on the two screens at the same time.
- Disable Blacksmith on the player's client and reload: the baked copy must still show the veil.
- Roll, then reload the player's browser: the veil survives a re-render from flags.
