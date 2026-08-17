# Plan: Blacksmith owns the rest card

**Status:** Phases 1-5 implemented, pending live verification. **Phases 6 and 7 -- the GM window, our
request card and the player window -- are not started**, and are windows rather than cards.

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

## The flow this is heading for

Settled with the author 2026-08-17. Blacksmith owns every surface; dnd5e does the rules.

```
1. GM opens OUR rest window          options + who is resting + the food settings
2. OUR request card posts            with a Rest button, one row per character
3. Player clicks -> OUR window       their options, and a Rest button
4. We call the system                actor.longRest() -- dnd5e applies every rule
5. OUR result card posts             recovery, provisions, and a Forage button if owed
6. They roll -> the card updates      the row is rewritten, exhaustion applied
```

Steps 4 and 5 are built. Steps 1-3 and 6 are not.

**The point of the shape is that the system is never the UI, and always the rules.** Every screen is ours,
every calculation is theirs. That is what keeps this from becoming a rest implementation.

## Is any of this a hack?

Asked directly, and worth recording, because the answer changes what is safe to build on.

**No monkey-patching, no private API, one genuine gap.**

| What we do | Standing |
|---|---|
| `dnd5e.preLongRest` / `preShortRest`, mutating `config` | Documented extension point. dnd5e reads `config.chat` and `config.dialog` after the hook, on purpose |
| `dnd5e.restCompleted` | Documented public hook |
| `result.clone`, `result.deltas` | `RestResult` is a documented return type |
| `actor.rollSkill(config, dialog, message)` with `create: false` | Public, and the message config exists for exactly this |
| `game.actors.party.longRest()` | Public |
| Reading `config.request.system.targets` | Public data, but not a documented integration point. The least supported thing here |

**The gap: there is no `preGroupRest`.** A party rest is only ever visible as a series of individual
completions, so the grouping -- who is in this rest, is this the last of them -- has to be reconstructed
from the request id and its roster. That is not a hack, but it is compensating for something the system
does not offer, and it is where the fiddly code lives.

**Owning steps 1-3 removes that gap rather than working around it.** If our window starts the rest, we know
the roster before anything happens, and none of the reconstruction is needed.

## Phase 1, answered

**A result comes back as `blacksmith.rolls.skillCheckResolved`**, emitted from `api-rolls.js:94`, carrying
`actorId`, `total`, `success` and `dc` -- everything a forage outcome needs. The subscription surface is
real and documented in `documentation/api/api-rolls.md`.

**But it only fires for rolls made on Blacksmith's own skill-check card.** `emitSkillCheckRoll` is bound to
that card's rows. So getting a player-rolled forage check means one of two routes, and they are not
equivalent:

**Route A -- Request Roll.** `openRequestRollDialog({ silent: true, actors, initialSkill: 'survival', dc })`
posts a request card and results arrive on the hook above. Entirely supported, nothing new to build.
**It posts a second card**, which sits awkwardly against the reason this plan exists: the request card and
the rest card would both be about the same character's night.

**Route B -- the roll window.** `showRollWindow` is reached through `orchestrateRoll` and expects the
skill-check card's `rollData` -- message id, token id, group and contested state. There is no "open a roll
for this actor, this skill, this DC, give me the total" entry point, and building one is new public API in
`manager-rolls.js`.

**Neither was needed.** `actor.rollSkill(config, dialog, message)` **returns its rolls to the caller**, so
the clicking client already has the total -- no hook subscription, no second card, no new entry point. The
player gets the system's own roll dialog and its own roll message, which is what "let them roll" meant, and
seeing the dice is the point.

The only thing that cannot happen on the clicking client is the WRITE: the card was authored by the GM and
`ChatCardsAPI.update` refuses a user who cannot modify the message. So the outcome is handed to the GM over
the established `executeAsGM` proxy (the same shape `manager-pins.js` and `manager-tags.js` use), and the
GM applies the exhaustion and rewrites the card.

## Phases

| Phase | Work | State |
|---|---|---|
| 1 | How a result comes back | **Answered above** |
| 2 | The per-character result card (step 5) | **Built** -- `scripts/cards-rest.js` |
| 3 | Suppress the system's cards and its confirmation dialog | **Built** -- three settings |
| 4 | Foraging becomes a player roll (step 6) | **Built** -- Forage button, GM proxy, card rewrite |
| 5 | GM resolution for an outstanding check | **Built** -- falls out of 4: the GM may press any button |
| 6 | The GM rest window (step 1) | Not started -- a real window |
| 7 | Our request card (step 2) and the player window (step 3) | Not started; 7 depends on 6 |

**Phases 6 and 7 are windows**, and the window framework is the CRITICAL item on `TODO.md` -- 4 of 15
windows use `window-template.hbs` and the frame is not owned. Two more hand-rolled windows makes that worse.
Worth doing after the framework, or deliberately as further evidence for it, but not by accident.

### How phase 5 came for free

"What if nobody rolls" needed no separate mechanism in the end. **The GM may press any character's Forage
button**, so an outstanding check is resolved by the same control that made it -- there is nothing extra to
build, and nothing extra for a GM to learn. A pending card is simply a card with a button on it, which is
how Foundry already asks for an attack and then a damage roll.

The automatic path is kept behind **Players Roll to Forage**, off which the check is rolled silently as
before. That path now records the roll on the card -- "Survival 7 vs DC 12" -- because a card reporting a
failure and a level of exhaustion with no dice anywhere reads as a broken button, which is exactly how it
read in play.

**4 and 5 must ship together** -- a pending button with no way to resolve it is worse than the automatic
roll it replaced. Foraging is still rolled automatically until they do, which is the behaviour that shipped
before this plan and is no worse for waiting.

## Where it goes

`scripts/manager-rest.js` owns the behaviour. The card composition gets its own file once it is more than a
few lines -- `cards-rest.js`, beside `cards-blacksmith.js` -- but not before.

## Why this is worth doing beyond the tidy-up

**The interruptible rest on `TODO.md` needs exactly this card.** A rest that takes eight in-world hours and
can be stopped partway needs somewhere to show its progress and something to press to interrupt it -- the
same updating per-character card with different rows. Building it here means the harder feature starts with
its hardest piece already solved.
