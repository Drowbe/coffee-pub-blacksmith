# Health API

**Audience:** developers of Coffee Pub modules that colour, sort, or branch on how hurt a creature is.

Scope: reading hit points and classifying them into severity tiers, so every module in the suite draws the
same line between injured and bloodied.

Mechanism and design rationale live in `architecture/architecture-tool-windows.md`.

## What it is for

A module that shows health in colour needs boundaries, and every module that invents its own gets different
ones. The result a GM sees is a portrait ring, a bar, and a token indicator disagreeing about whether a
creature is bloodied.

These functions are that single definition. The boundaries are world settings, so a GM configures them once
and every consumer follows.

## Reading hit points

```js
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

blacksmith.getActorHP(actor);              // { value, max } or null when unreadable
blacksmith.getHealthPercent(actor);        // 0-100, or null when unreadable
blacksmith.getHealthPercentForHP(hp);      // same, from a raw { value, max }
```

`getActorHP` resolves the shapes Blacksmith supports (`system.attributes.hp`, `system.vitals.hp`,
`system.hp`) and returns `null` rather than zero when an actor has no readable hit points -- an actor with
no HP is not an actor at 0 HP, and the two must not be conflated.

`getHealthPercentForHP` is the same answer for callers holding the HP object rather than the Actor -- a
Handlebars helper, most often. It clamps to 0-100 and returns `null` when there is no usable max **or no
usable value**: an actor with a max and no readable value is missing data, not a corpse, and answering `0`
would classify it as dead.

Use one of these rather than dividing by hand. The arithmetic is exactly trivial enough that every module
writes it slightly differently and nobody checks -- guarding `max > 0` in one place, clamping in another,
and rendering `NaN%` everywhere else.

## Severity

```js
blacksmith.getHealthSeverity(percent);          // from a 0-100 percentage
blacksmith.getHealthSeverityForHP({value, max}); // from a raw pair
```

Both return one of:

| Value | Meaning |
|---|---|
| `healthy` | Undamaged. |
| `hurt` | Damaged, but above the Injured threshold. |
| `injured` | At or below the Injured threshold. |
| `bloodied` | At or below the Bloodied threshold. |
| `critical` | At or below the Critical threshold. |
| `dead` | At or below 0. |
| `null` | No readable hit points. |

Boundaries are inclusive: a creature at exactly the Bloodied threshold is `bloodied`.

`hurt` has no threshold of its own. It distinguishes a scratch from an untouched creature, which some
consumers care about and others do not; a consumer that does not should treat it as `healthy`.

## Thresholds

```js
const { injured, bloodied, critical } = blacksmith.getHealthThresholds();
```

The configured percentages, defaulting to 75 / 50 / 25. Reads settings directly, so it needs no window open
and no manager instance -- a tray handle that rebuilds on every render can call it safely.

## Mapping severity to your own classes

Blacksmith does not know your CSS. Map the returned string yourself:

```js
const SEVERITY_CLASS = {
    healthy: 'my-healthbar-healthy',
    hurt: 'my-healthbar-healthy',
    injured: 'my-healthbar-injured',
    bloodied: 'my-healthbar-bloodied',
    critical: 'my-healthbar-critical',
    dead: 'my-healthbar-dead'
};

const cls = SEVERITY_CLASS[blacksmith.getHealthSeverityForHP(hp) ?? 'healthy'];
```

## Party totals

```js
blacksmith.getPartyHealthSummary(); // { current, max, percent, currentDisplay, maxDisplay }
blacksmith.getPartyActorHp(actor);  // { current, max }
```

Aggregates across the configured party roster. `getPartyActorHp` returns zeroes rather than `null` for an
unreadable actor, because it is a summing helper; use `getActorHP` when the difference matters.
