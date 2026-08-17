# Plan: Blacksmith owns the rest card

**Status:** Planned. Nothing here is built. The batched provisions card that exists today is transitional
and this replaces it.

**Outcome:** feature.

Replace the system's rest chat output with **one Blacksmith card per character** that shows everything that
character's rest did -- what they recovered, what they ate -- and updates itself when a foraging check the
player rolls themselves comes back.

## What is wrong with today

Three complaints, one cause.

**The system's cards are plain, and ours is separate from them.** A five-character long rest posts five
system recovery cards and then one Blacksmith provisions card, in two visual languages, so the answer to
"how did Nik's night go" is split across two messages that do not look related.

**Foraging is rolled for the player, not by them.** `_forage()` calls `actor.rollSkill()` with the dialog
and chat suppressed, so the one roll in the whole feature -- the one deciding whether a character loses a
level of exhaustion -- happens invisibly, with no chance to spend inspiration or apply a bonus.

**Provisioning is synchronous, and that is the constraint that has to break.** Everything happens inside
`dnd5e.restCompleted`: consume, roll, apply exhaustion, report. A player-rolled check cannot work that way,
because the answer arrives minutes later or never.

## One card per character

The system's shape was right; its cards just did too little. Keeping one per character is what makes the
rest of this simple:

- **A card is about one actor**, so its state is that actor's state. No batching, no roster, no waiting for
  a group before anything can be shown.
- **A pending roll belongs to the card it is on.** "Who has not rolled" needs no bookkeeping -- it is
  visible in chat.
- **The batched provisions card goes away entirely**, and with it `_report` and the accumulate-then-flush
  machinery. Each character's provisions become two lines on their own card.

The grouping logic that decides when the CLOCK advances is unaffected and stays exactly as it is. That is a
question about the rest as a whole; this is a question about one character.

## The shape change

Today:

```
rest completes -> consume, roll, apply exhaustion -> accumulate -> post one summary at the end
```

After:

```
each character's rest completes -> post THEIR card: recovery, provisions, and a Forage button if needed
                                -> they roll, whenever they get to it
                                -> the result updates that card and applies its consequence
```

**The rest still completes on time.** The clock advances when the last character rests, exactly as now.
Foraging resolves afterwards and lands late. Blocking the night on a check nobody has clicked would put the
party at the mercy of one player who stepped away, and the rest genuinely did happen.

## The card

| Part | Carries |
|---|---|
| `identity` | portrait, name, "Long Rest -- 8 hours, new day" |
| `rows` | recovery: hit points, hit dice, spell slots, item uses, exhaustion removed |
| `rows` | provisions: food and water, each ate / foraged / went without |
| `actions` | **Forage** -- only while a check is outstanding |

Recovery comes from the `result` that `dnd5e.restCompleted` already hands us: `deltas.hitPoints`,
`deltas.hitDice`, `updateData`, `updateItems`, `newDay`. **This is not optional.** Suppressing the system's
cards without showing it would be a net loss of information dressed as a tidy-up, which is the one way this
feature could make things worse.

## The state lives on the message

A card that updates cannot keep its state in memory. A reload loses it, and no other client ever had it --
the GM who posted the card may not be the one who reloads.

`ChatCardsAPI.getCard(message)` reads the stored composition and `update(message, ...)` rewrites it, so
**the card's own flag is the state**. The card records which actor it is for and whether a forage check is
outstanding; the result handler reads it, changes those rows, and writes it back. Nothing else is
remembered anywhere.

## Do not rebuild what exists

- **Resting.** dnd5e owns it entirely. This changes only what is *shown*.
- **Roll delivery.** `api.requestroll` already does "ask this actor for this check, the player rolls it,
  the result comes back" -- `openRequestRollDialog({ silent: true, actors, initialSkill, dc })` posts a
  request without opening the dialog. A second path for foraging would be a parallel implementation of the
  module's own feature.
- **Card actions.** `ChatCardsAPI.registerAction(moduleId, action, handler)` plus the delegated dispatcher
  at `blacksmith.js:2476` bind buttons on every client and survive re-render; the handler receives
  `{ message, value, event, button }`. `part-rows` supports a trailing button and a whole-row target, and
  its own comment names "an actor waiting to roll" as the case it was written for.

What is genuinely new is **a card that updates**, and the rule for a roll that never comes.

## Suppressing the system's cards

`config.chat = false` in `dnd5e.preLongRest` and `dnd5e.preShortRest`. One line, behind a setting so a
table that prefers the system's cards keeps them.

Only once ours carries the recovery data. Until then both post, which is noisier than today but never
loses anything -- an acceptable state to sit in between phases, and a bad one to ship.

## What if nobody rolls

The case that decides the design. Four options:

1. **Leave it pending forever.** Honest, and the card is a standing record of what is owed.
2. **Time out as a failure.** Punishes a player for being away from the keyboard.
3. **Time out as a success.** Makes the mechanic toothless -- never rolling becomes the winning move.
4. **The GM resolves it.** An explicit action on the card.

**Take 1 and 4 together.** A pending card stays pending, and the GM can resolve it -- rolling for that
character, or waiving it. Nothing auto-punishes and nothing expires, which matters when the stake is a
level of exhaustion rather than something cosmetic.

Per-character cards make this cheaper than it would otherwise be: an outstanding check is one card sitting
in chat with a button on it, not a row inside a summary that has to be found.

## Phases

| Phase | Work |
|---|---|
| 1 | Verify how `api.requestroll` reports a result back -- hook, socket, or card flag. The only unknown, and everything after it depends on the answer. |
| 2 | The per-character card: identity, recovery from `result`, provisions. Replaces the batched summary; system cards still on. |
| 3 | Suppress the system's cards, behind a setting, now ours carries the same information. |
| 4 | Foraging becomes a player roll: a Forage button, the result updating the card and applying exhaustion. |
| 5 | GM resolution for an outstanding check. |

Phases 2 and 3 are worth having on their own. **4 and 5 must ship together** -- a pending button with no
way to resolve it is worse than the automatic roll it replaced.

## Where it goes

`scripts/manager-rest.js` owns the behaviour. The card composition gets its own file once it is more than a
few lines -- `cards-rest.js`, beside `cards-blacksmith.js` -- but not before.

## Why this is worth doing beyond the tidy-up

**The interruptible rest on `TODO.md` needs exactly this card.** A rest that takes eight in-world hours and
can be stopped partway needs somewhere to show its progress and something to press to interrupt it -- the
same updating per-character card with different rows. Building it here means the harder feature starts with
its hardest piece already solved.
