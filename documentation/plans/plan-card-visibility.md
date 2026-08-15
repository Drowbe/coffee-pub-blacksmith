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

**Decision 2: the skill check card cannot use delivery privacy at all, so presentation privacy is the
whole of the mechanism -- and the API must say so.**

An earlier draft of this plan said to fix the roll mode by whispering `gmroll` and `blindroll` messages.
That is wrong and would have broken the feature. **The card carries the players' roll buttons**
(`card-skill-check.hbs:124`): a player clicks their own name on the shared card to roll. Whisper it to the
GM and the players never see the card, so nobody can roll. The card is necessarily public, and everything
on it -- including every result -- is necessarily delivered to every client.

The consequence has to be stated rather than hidden: **a determined player can read another player's
blind roll out of the message flags in the console.** No arrangement of a single interactive message
avoids that, because the interaction requires the message and the flags are how the card re-renders.
Anything that must be genuinely secret does not belong on this card; it belongs in a whispered message of
its own, which is a separate feature and not this one.

What the veil buys is the thing actually wanted at a table: the number does not appear on screen. That is
worth building. It is not a control, and the API documentation must not imply it is.

**Decision 2b: the roll mode selects the veil rule.** It stops being a message property and becomes a
composition input:

| Roll mode | Who reads a result |
|---|---|
| `roll` | everyone -- no veil |
| `gmroll` | the GM, and the owner of the rolling actor |
| `blindroll` | the GM only -- not even the roller |
| `selfroll` | the message author only |

This is what `card-skill-check.hbs:92-113` already intends. The bug was never the intent; it was that the
branch is evaluated once, by the composer, and baked.

## The design

### The veiled value

Anywhere a part accepts a text field, it also accepts a veiled form:

```javascript
{ part: 'rows', items: [
    { label: 'Favia Gita', trailing: { value: '18', readableBy: 'gm', veil: 'fa-solid fa-eye' } }
] }
```

- `value` -- what an entitled reader sees.
- `readableBy` -- who is entitled. `'gm'`, `'owner'` (the ACTOR's owner, decision 7), `'author'` (whoever
  posted), or an explicit array of user ids. Validated against an allowlist, like `variant` and `tone`,
  because it reaches a render decision.
- `veil` -- what everyone else sees, rendered in the space the value would have occupied (decision 8). An
  icon class or a short string. Defaults to an eye icon.

It marks that one field and nothing else (decision 6): the `label` beside this `trailing` stays visible to
every reader.

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

## The three questions that were open

Settled 2026-08-14 by the author.

**Decision 6: `readableBy` marks a FIELD, not a part.** Skill check needs exactly that -- the total hides
while the actor's name beside it stays visible -- and veiling the whole row would hide who was asked to
roll, which is the opposite of useful. A part-level veil is a plausible second step if a GM-only block ever
turns up; it is not built on speculation.

**Decision 7: `owner` is the ACTOR's owner.** Ownership lives on the Actor in dnd5e and tokens inherit it,
so the actor is the authoritative record, and skill check rows are keyed by `actorId` already. An unlinked
token whose permissions diverge from its actor is a real case and is not covered; a caller needing it
passes explicit user ids.

**Decision 8: a veiled value holds its space.** The veil renders where the value would have been. A list of
pending rolls then does not reflow as results arrive, and nothing on the card jumps at the moment of a
reveal -- which is exactly the card where results land one at a time and a jump is most visible. A reader
can infer that something is hidden either way, so collapsing buys nothing but movement.

## The work

1. **Confirm the leak** in a live world, per "What exists today". **Done 2026-08-14, from the PLAYER's
   console** on a live blind-roll message:
   - `game.messages.contents.at(-1).whisper` returned `[]`. The roll mode never became a whisper, and the
     message is delivered in full to a player who is not entitled to its results. Finding 1 confirmed.
   - `...flags['coffee-pub-blacksmith'].isGM` returned `true` -- on the player's own machine. The
     composing GM's value is sitting in the player's client, where every render decision keyed to it treats
     that player as a GM. Finding 2 confirmed, observed rather than inferred.

   Finding 3 follows: the content was rendered once with `isGM: true`, took the revealing branch, and that
   markup is what the player holds. The symptom on screen has not been eyeballed and does not need to be
   -- both mechanisms were read directly off the affected client.
2. **Add the veiled value** to `manager-chat-cards.js`: the allowlist, the per-client resolution, and the
   fail-closed baked form. There is no separate roll-mode repair -- see decision 2. The dead `rollMode`
   key in the `ChatMessage.create` data (`window-skillcheck.js:1535`, `:2338`) is removed as part of the
   migration, because it reads as though visibility is handled and it is not.
4. **Extend `tools/check-card-contracts.mjs`** so a `readableBy` outside the allowlist is a build failure,
   and so the baked form cannot contain a revealed value.
5. **Harness card** covering each `readableBy`, an unentitled reader, and the pre-re-render baked state.
6. **Migrate skill check** onto it (step 5 of `plan-chat-cards.md`).

## How it will be verified

Two clients, a GM and a player, because a one-client test cannot see this class of bug at all.

- A `blindroll` request: the player rolls, and the player's SCREEN shows a veil where the total would be
  while the GM's screen shows the number -- the same message, differing on two screens at once. The value
  is still in the player's flags and that is expected (decision 2); do not write a check that asserts
  otherwise, because it would be asserting something the design does not claim.
- A `gmroll` request: the rolling player sees their own total, other players see a veil.
- The player can still click their own roll button in every mode. This is the regression to watch for --
  the card has to stay public and interactive for the veil to be worth anything.
- Disable Blacksmith on the player's client and reload: the baked copy must still show the veil.
- Roll, then reload the player's browser: the veil survives a re-render from flags.
