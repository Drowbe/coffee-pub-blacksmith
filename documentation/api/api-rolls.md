# Rolls API — Outcome Classification

**Audience:** Developers integrating with Blacksmith (Bibliosoph, Regent, and other sibling modules).

Blacksmith classifies what rolls *mean* — crit, fumble, success vs DC, hit/miss vs AC — and exposes that meaning for **subscription** (hooks) and **inspection** (`classify()`).

This is separate from **Request a Roll** (`openRequestRollDialog`), which creates skill-check requests. See `api-requestroll.md` for the dialog. Use **this** API when you need to react to crits, fumbles, hits, misses, or check success.

## Getting the API

```javascript
const rolls = game.modules.get('coffee-pub-blacksmith')?.api?.rolls;

// Or via the bridge
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
const blacksmith = await BlacksmithAPI.get();
const rolls = blacksmith?.rolls;
```

| Method | Returns | Use when |
|---|---|---|
| `rolls.isAvailable()` | `boolean` | Guard before any call |

## Subscription (primary surface)

Subscribe with `rolls.on(event, callback, options?)`. Returns a disposer; pass `signal` from an `AbortController` for cleanup.

```javascript
const rolls = game.modules.get('coffee-pub-blacksmith')?.api?.rolls;
if (!rolls?.isAvailable()) return;

const stop = rolls.on('resolved', (outcome) => {
    if (outcome.isCritical) {
        // Bibliosoph: roll injury table, show "Big Hit!", grant reaction, etc.
    }
    if (outcome.isFumble) {
        // Bibliosoph: fumble table
    }
});

// Later: stop();  or controller.abort() if you passed { signal }
```

### Hook events

| `rolls.on()` event | Hook name | When it fires |
|---|---|---|
| `'resolved'` | `blacksmith.rolls.resolved` | Any classified roll outcome (skill check, attack or initiative — not damage) |
| `'skillCheckResolved'` | `blacksmith.rolls.skillCheckResolved` | Request Roll / skill-check card row completed |
| `'attackResolved'` | `blacksmith.rolls.attackResolved` | Attack classified — core dnd5e chat (GM) and optional MIDI workflow |
| `'initiativeResolved'` | `blacksmith.rolls.initiativeResolved` | Initiative rolled and classified — every combatant, including monsters and summons (GM client) |
| `'damageResolved'` | `blacksmith.rolls.damageResolved` | Damage or healing applied to an actor (dnd5e; GM client) |
| `'groupResolved'` | `blacksmith.rolls.groupResolved` | Group skill check: all actors finished (GM client) |

You may also use `Hooks.on('blacksmith.rolls.resolved', ...)` directly.

An `initiative` outcome carries `d20`, `total`, `isCritical`, `isFumble`, `actorId`, `tokenId`,
`combatantId`, `combatId`, `messageId` and `visibility`. `success` and `dc` are present and null:
initiative is not measured against a target number, so "not applicable" is the honest answer and it beats
an absent property. It is emitted for **every** combatant that rolls, monsters and player-owned summons
included — a subscriber that cares about only some of them applies that rule itself, because whose
initiative matters is a table's preference and not a fact about the roll.

`rolls.on()` returns an idempotent disposer. When an `AbortSignal` is supplied, aborting removes
both the Foundry hook and Blacksmith's abort listener; calling the disposer does the same.

**Visibility:** Hidden/blind/GM-only rolls do not deliver payloads to clients who should not see the roll. GMs always receive outcomes on the GM client.

**Midi-QOL is optional.** Blacksmith is fully functional without it: the core dnd5e lanes cover attacks and damage on their own. When Midi is installed, its workflows are leveraged for authoritative hit/miss and crit detection — gated by the Midi-QOL Integration world setting (`enableMidiIntegration`, Roll System > Integrations, default on, applies live). With the setting off, Blacksmith ignores Midi workflows and the core lanes process Midi-generated messages too.

**Exactly once:** Skill-check hooks fire for the actor who just rolled, not for every actor already on the card when a later party member rolls.

### Outcome object (common fields)

```javascript
{
    kind: 'skillCheck' | 'attack' | 'roll',
    source: 'blacksmith.requestRoll' | 'dnd5e.attack' | 'midi.attack' | 'midi.workflow' | 'foundry.roll',
    d20: 20,              // active (kept) d20 face, or null
    total: 18,            // roll total, or null
    isCritical: true,
    isFumble: false,
    success: true,        // vs DC or coarse hit/miss; null if unknown
    dc: 15,               // skill checks; null for attacks
    rollType: 'skill',    // skillCheck only
    rollLabel: 'Perception',
    actorId: 'abc123',
    tokenId: 'def456',
    messageId: 'xyz789',
    visibility: 'public' | 'private' | 'blind' | 'self',
    critMode: 'natural',  // or 'system' when dnd5e crit range used

    // skillCheck only
    isGroupRoll: false,
    groupRoll: { success, successCount, totalCount, allComplete } | null,
    contestedRoll: { winningGroup, group1Highest, group2Highest, isTie } | null,

    // attack only
    targets: [{ uuid, ac, hit }],
    hitTargets: ['Actor.uuid...'],
    missTargets: [],
    unknownTargets: [],
    itemUuid: 'Item....',

    meta: { ts, trigger }  // present on hook payloads only
}
```

### Damage outcome (`damageResolved`)

Fires when dnd5e applies damage or healing to an actor — any path that runs `Actor#applyDamage`
(chat card damage buttons, sheet application, MIDI's automated application). The typed breakdown
comes from `dnd5e.calculateDamage` and the final amount from `dnd5e.applyDamage`, correlated by
actor uuid, so consumers get one normalized event instead of that two-hook dance. Delivery
matches the attack lane: the hook fires on the GM client (a player applying to their own sheet
forwards over the socket). Damage is not a roll, so this event does **not** also fire
`'resolved'`. The event does not carry attacker or item attribution: a consumer that
needs to know who dealt the damage, or with what, must correlate it against a preceding
`attackResolved` itself.

```javascript
{
    kind: 'damage',
    source: 'dnd5e.applyDamage',
    amount: 23,                 // as applied; negative = healing
    tempAbsorbed: 5,            // portion soaked by temp HP (null when unknowable, 
                                // and for healing)
    damages: [                  // typed breakdown from calculateDamage, or null
        { value: 18, type: 'slashing' },
        { value: 5,  type: 'fire' }
    ],
    isHealing: false,           // healing is delivered too, flagged — filter if unwanted
    actorId, actorUuid, tokenId, sceneId,   // token/scene best-effort for linked actors
    hp: { before, after, max, temp },       // before from the pre-application snapshot
    attackerTokenId: null,      // attribution not yet wired — always null today
    itemUuid: null,             // same
    meta: { ts, trigger: 'dnd5e.applyDamage' }
}
```

`hp.before/after/max` makes threshold logic one-liners: `amount >= hp.max / 2` (massive hit),
`hp.before > hp.max / 2 && hp.after <= hp.max / 2` (dropped to bloodied), `hp.after === 0`.

## promptRoll — a roll with no chat card

```javascript
const result = await api.rolls.promptRoll({ actor, value: 'sur', dc: 12, title: 'Foraging' });
if (result) console.log(result.roll.total);
```

Opens the roll window for one actor and resolves with the result. **It creates no chat message and updates
none.** The player still gets the full window: modifiers, named bonuses, advantage, roll mode.

Use it when your module already has somewhere to put the answer -- a card of your own, a window, a running
tally -- and a second chat card would be noise.

| Option | Type | Meaning |
|---|---|---|
| `actor` | Actor | Required. |
| `value` | string | Required. Skill, ability or save key -- `'sur'`, `'dex'`. |
| `type` | string | `'skill'` (default), `'ability'` or `'save'`. |
| `dc` | number | Shown in the window when given. |
| `title` | string | Window heading. Defaults to the roll's own name. |
| `subtitle` | string | |
| `rollMode` | string | Default `'roll'`. |
| `tokenId` | string | |

Resolves to the roll results, or **`null` if the window was closed without rolling** -- which is a normal
outcome, not an error, and means "nothing was decided".

Every other entry point into the roll pipeline is built around a skill-check chat card:
`orchestrateRoll` requires an existing message and throws without one. This is the mode for consumers that
are not that card.

## showDice — dice on screen, nothing in chat

```javascript
const rolls = await actor.rollHitDie({ denomination: 'd10' }, {}, { create: false });
await api.rolls.showDice(rolls);
```

Animates a roll you have already made, and posts nothing.

Foundry has no 3D dice of its own. Dice So Nice supplies them, and it triggers off a chat message being
created -- so the usual way to show a player their dice is to post a roll card, and chat fills with them.
This separates the two: roll however you like, show the dice, and put the result where it belongs.

Takes one `Roll` or an array of them. Honours the world's *Enable Dice So Nice* setting and does nothing
when the module is absent, so a caller never needs to check either. Returns whether anything was shown; a
failed animation is swallowed rather than propagated, because it must never take a roll down with it.

Use it whenever a roll's answer lands somewhere other than a roll card -- your own chat card, a window, a
tracker. `promptRoll` already does this for you; this is for rolls you make yourself, including the
system's own.

It is the module's only route to `game.dice3d`, which is enforced by
`tools/check-rest-clients.mjs`. There were two, and they disagreed about whether to honour the setting.

## Pull API (secondary)

When you already hold a roll or message:

```javascript
const outcome = rolls.classify(message, { tokenId: '...' });
const outcome = rolls.classify(roll, { dc: 15 });
const outcome = rolls.classify({ workflow, attackRoll });
```

| Input | Options | Returns |
|---|---|---|
| `ChatMessage` (skill-check card) | `tokenId` — which row to classify | `skillCheck` outcome or `null` |
| `ChatMessage` (attack) | — | `attack` outcome or `null` |
| Foundry `Roll` or plain result object | `dc`, `actorId`, `tokenId`, `critMode` | `roll` outcome |
| `{ workflow, attackRoll }` | `critMode` | `attack` outcome or `null` |

### `extractActiveD20(rollOrResult)`

Returns the kept d20 face (handles advantage/disadvantage). Shared helper for custom modules.

### Crit mode

| `critMode` | Behavior |
|---|---|
| `'natural'` (default) | Crit = 20, fumble = 1 on active d20 |
| `'system'` | Crit uses dnd5e crit threshold when available; fumble = 1 |

MIDI/system attack rolls may also set `isCritical` / `isFumble` from workflow or roll flags before nat-20 fallback.

## Request a Roll (related, not replaced)

`module.api.openRequestRollDialog` remains the top-level entry for opening the skill-check dialog. It is **not** moved under `rolls` to preserve existing integrations.

| API | Purpose |
|---|---|
| `openRequestRollDialog()` | Open dialog or silent post — `api-requestroll.md` |
| `Hooks.on('blacksmith.requestRollComplete', ...)` | Per-row completion on request-roll cards (legacy; prefer `rolls.on('skillCheckResolved')` for classification) |
| `rolls.on('skillCheckResolved', ...)` | Same timing + normalized crit/success/DC fields |

## Example: Bibliosoph crit reaction

```javascript
Hooks.once('ready', () => {
    const rolls = game.modules.get('coffee-pub-blacksmith')?.api?.rolls;
    if (!rolls?.isAvailable()) return;

    rolls.on('attackResolved', (outcome) => {
        if (!outcome.isCritical || !outcome.actorId) return;
        // Roll Critical Carnage compendium via api.compendiums.resolve, post card, etc.
    });

    rolls.on('skillCheckResolved', (outcome) => {
        if (outcome.isFumble) {
            // Awareness / encounter logic for quick encounters
        }
    });
});
```

## Example: classify an existing chat message

```javascript
const msg = game.messages.get(someId);
const rolls = game.modules.get('coffee-pub-blacksmith')?.api?.rolls;
const outcome = rolls?.classify(msg);
if (outcome?.kind === 'attack' && outcome.hitTargets?.length) {
    console.log('Hit', outcome.hitTargets);
}
```

## Related documentation

- `api-requestroll.md` — Request a Roll dialog
- `api-compendiums.md` — resolving injury/fumble/crit tables (Bibliosoph)
- `api-core.md` — API index
- `../architecture/architecture-rolls.md` — internal roll execution (contributors)
