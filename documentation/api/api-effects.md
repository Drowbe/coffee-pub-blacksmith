# Active Effects API

**Audience:** module authors reading Active Effects for display.

Blacksmith exposes a read-only Active Effects API so sibling modules can share one definition of an effect that is suitable for display. It filters disabled and suppressed effects, normalizes Foundry and dnd5e conditions, formats duration, safely enriches descriptions, and lets feature modules register their own classifications without Blacksmith taking ownership of their rules.

## Access

```javascript
const effects = game.modules.get('coffee-pub-blacksmith')?.api?.effects;
if (!effects?.isAvailable?.()) return;
```

Or use the timing-safe bridge:

```javascript
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
const effects = await BlacksmithAPI.getEffects();
```

The convenience global `BlacksmithEffects` is also assigned when Blacksmith reaches ready. Direct module API access is preferred.

## Display effects

```javascript
const rows = await effects.getDisplayEffects(actor);
```

The default query:

- preserves the Actor's Active Effect order;
- excludes disabled and suppressed effects;
- includes temporary effects, effects carrying statuses, effects named like registered dnd5e conditions, and recognized outcome effects;
- labels ordinary conditions as `Effect`;
- includes a duration label when Foundry reports one;
- enriches descriptions only when the current user is a GM or owns the Actor.

Each returned row contains:

```javascript
{
  id,
  uuid,
  name,
  fullName,
  img,
  type,
  typeLabel,
  context,
  conditionIds,
  conditions,
  durationLabel,   // string to display
  remaining,       // { value, unit } to compare, or null — see below
  detail,          // "Type · Context · Remaining Duration"
  descriptionHtml,
  tooltipHtml,
  sourceName
}
```

Options:

```javascript
await effects.getDisplayEffects(actor, {
  includeDisabled: false,
  includeSuppressed: false,
  qualifyingOnly: true,
  includeDescriptions: 'auto', // 'auto', 'always', or 'never'
  enrichDescriptions: true
});
```

Do not use `includeDescriptions: 'always'` in player-facing UI unless the caller has separately established that the user may read the Actor's effect descriptions.

### Duration formatting

`durationLabel` is normalized rather than passed through. Round- and turn-based durations keep Foundry's own label, which already reads the way you would say it ("10 Rounds"). Seconds-based durations are converted to the unit a human would use, because Foundry renders those as raw seconds and a half-hour wound arrives as "1710 Seconds":

| Remaining | Renders as |
|---|---|
| ≤ 120s, combat started | `2 rounds` |
| < 60s | `45 seconds` |
| < 1 hour | `29 minutes` |
| < 1 day | `2 hours` |
| otherwise | `3 days` |

Rounds are only used for a short remainder during an active combat, where "how many of my turns is this" is the question being asked. A long duration stays in wall-clock units even mid-combat, since "285 rounds" answers nothing.

A classifier cannot influence this field — `durationLabel` is computed from the effect's own duration, independent of classification.

## Time remaining

`remaining` is the number to reason about; `durationLabel` is the string to show. Never parse the label.

```javascript
record.remaining   // { value: 1800, unit: 'seconds' }
                   // { value: 5,    unit: 'rounds'  }
                   // null — the effect has no duration at all
```

`null` means permanent, which is not the same as `{ value: 0 }`.

**The unit is part of the answer.** Foundry reports `duration.remaining` in whichever unit the document
happens to carry - seconds for a seconds duration, a decimal count of rounds for a turns duration - and
announces that nowhere. Code that assumes seconds is wrong by a factor of `CONFIG.time.roundTime` on every
rounds-based effect.

**Rounds are not converted to seconds.** A rounds duration advances with the combat tracker, not the world
clock, so quoting it in seconds would state a remainder that is not true. Compare `value` only against
another value of the same `unit`.

Two helpers save writing this yourself:

```javascript
blacksmith.effects.getRemaining(effect)   // same shape, for an effect you already hold
blacksmith.effects.hasExpired(effect)     // true when the clock has run out
```

### What Blacksmith absorbs for you

Times Up rewrites short seconds-based durations into rounds and nulls `duration.seconds`. Where it has
done so, `remaining` reports the seconds anyway, because that effect was authored in seconds and the
rewrite is substrate variance rather than a change of meaning. You never branch on whether Times Up is
installed - see the ownership rules on the wiki.

The `enableTimesUpIntegration` world setting turns that off for diagnosis. It is not a normal operating
mode: with Times Up installed and the integration off, both it and Blacksmith will expire the same effect.

## Expiry

```javascript
const off = blacksmith.effects.onExpired(({ effect, actor, remaining, deletedBy }) => {
  // the clock ran out; unwind your own state
});
```

`deletedBy` is `'times-up'` or `'blacksmith'` - which actor is responsible for removing the document.

**Expired means the clock ran out, not that the document is gone.** To react to removal, listen to
Foundry's `deleteActiveEffect`, which fires whoever did the deleting and reaches every client.

**Do not delete an effect because it expired.** Blacksmith arbitrates: it yields deletion to Times Up when
that is present and enabled, and performs it otherwise, so exactly one actor deletes in every
configuration. A consumer that also deletes reintroduces a race whose loser cannot fail quietly - Foundry
notifies from inside the socket response handler, before the promise rejects, so a `catch` is too late.

**Fires on the GM client only.** It is the authoritative one; firing everywhere would need cross-client
deduplication to say the same thing. Use `deleteActiveEffect` if you need every client.

**Fires once per effect.** An expired effect stays expired on every subsequent tick; the event does not
repeat. Deleting and re-applying the effect arms it again.

## Raw qualifying effects

```javascript
const active = effects.getActiveEffects(actor);
```

This synchronous method applies the same default filtering but returns the original Active Effect documents. Set `qualifyingOnly: false` to return every enabled, unsuppressed Active Effect.

## Conditions

```javascript
const label = effects.getConditionLabel('charmed');
```

Labels are resolved from `CONFIG.statusEffects` and `CONFIG.DND5E.conditionTypes`, then localized.
The normalized condition index is cached for the session. A module that intentionally changes
either configuration collection at runtime should invalidate it after making those changes:

```javascript
effects.refreshConditionIndex();
```

The next condition lookup rebuilds the index. Ordinary Active Effect creation, updates, and
deletion do not require invalidation because they do not change the condition definitions.

## Classifiers

Feature modules can classify effects they own:

```javascript
const unregister = effects.registerClassifier({
  id: 'my-module.outcome',
  priority: 100,
  qualifies: (effect) => Boolean(effect.getFlag('my-module', 'outcome')),
  classify: (effect, context) => {
    const outcome = effect.getFlag('my-module', 'outcome');
    if (!outcome) return null;
    return {
      type: outcome.kind,
      typeLabel: game.i18n.localize(`my-module.${outcome.kind}`),
      name: outcome.displayName,
      context: context.conditionIds
        .map((id) => effects.getConditionLabel(id))
        .join(', ')
    };
  }
});
```

`qualifies` is an optional synchronous predicate used during the default filtering pass. Supply it when a permanent module-owned effect has no status or duration but should still be displayed. A classifier's `classify` function returns `null` when it does not own the effect. Classifiers run in descending priority and stop at the first match. IDs must be unique; use `replace: true` only when deliberately replacing a previously registered classifier with the same ID.

Available registry methods:

- `registerClassifier(definition)` → unregister function
- `unregisterClassifier(id)` → boolean
- `getClassifier(id)` → classifier record or `null`
- `getClassifiers()` → ordered classifier records

Blacksmith includes a low-priority compatibility classifier for Bibliosoph's `coffee-pub-bibliosoph.outcomeBurst` flag. Bibliosoph can replace it with its authoritative classifier without creating a hard dependency in either direction.

## Change notifications

Blacksmith emits `blacksmith.effects.changed` after local `createActiveEffect`, `updateActiveEffect`, and `deleteActiveEffect` hooks:

```javascript
const off = effects.onChanged(({ effect, actor, operation }) => {
  refreshMyDisplay(actor);
});
```

`operation` is `create`, `update`, or `delete`. `onChanged` returns an unsubscribe function. The same payload is available through the ordinary Foundry hook:

```javascript
Hooks.on('blacksmith.effects.changed', (payload) => {});
```

The notification contains Foundry documents and is a local application event, not a socket broadcast.

## Ownership boundary

The API normalizes and presents Active Effects. It does not create, update, disable, delete, expire, or automate them. Bibliosoph remains responsible for injury/critical/fumble rules; Crier remains responsible for turn-card presentation; Blacksmith's combat hover card is one consumer of the same public API.
