# World Clock API

**Audience:** any module that needs to act when in-world time reaches a moment.

Scheduling against the in-world clock. The implementation and its reasoning live in
`documentation/architecture/architecture-worldclock.md`.

Reached as:

```js
const worldClock = game.modules.get('coffee-pub-blacksmith').api.worldClock;
```

## Why this exists

Core broadcasts `updateWorldTime` on every change, but it only says that the number moved. A consumer that
wants to know dawn broke, or a festival arrived, has to diff the time itself -- and the edge cases are the
whole job. Time jumps by eight hours when a party rests, it runs backwards when a GM corrects a mistake,
and one jump can cross the same daily boundary several times.

## schedule(options)

```js
worldClock.schedule({
  id: 'my-module.dawn',
  dailyAt: 6,
  description: 'Roll the day\'s weather',
  gmOnly: true,
  callback: ({ worldTime, previousWorldTime, crossings, schedule }) => { /* ... */ }
});
```

| Option | Type | Meaning |
|---|---|---|
| `id` | string | Required, unique. Registering the same id again replaces the first. |
| `at` | number | Absolute world time in seconds. Fires once. |
| `dailyAt` | number | Hour of the in-world day. Fires every day. Fractions allowed (`6.5` is half past six). |
| `description` | string | Shown by `list()`. |
| `gmOnly` | boolean | Only fire on a GM client. Default `false`. |
| `callback` | function | Receives one object -- see below. |

Exactly one of `at` and `dailyAt` must be given. Returns the id, or `null` if the registration was
refused; a refusal logs the reason and registers nothing.

The callback receives `{ worldTime, previousWorldTime, crossings, schedule }`.

## unschedule(id)

Returns `true` if something was removed.

## list()

Every registered schedule, for debugging.

## Things worth knowing before you use it

**`crossings` can be greater than one, and you have to decide what that means.** A party resting a week
under gritty realism crosses "every dawn" seven times in one jump. The callback fires **once** with
`crossings: 7`, rather than seven times -- seven separate firings would post seven morning briefings.
Whether that means seven encounter rolls or one summary is yours to decide, which is why the count is
handed over rather than resolved.

**Nothing fires retroactively, and schedules are not persisted.** Registering a moment already past does
not fire it, and a one-shot whose moment passed while the world was closed is missed. Re-register on
`ready` as you would any hook. This is a notification surface, not a queue.

**Rewinding time fires nothing.** "The sun rose" is not true because a GM corrected a mistake. One-shots
are re-armed instead, so rewinding past a moment and reaching it again fires it again.

**`gmOnly` defaults to `false`, so a callback runs on every connected client.** Anything that writes to the
world or posts a message almost certainly wants `gmOnly: true`; without it, five connected players produce
five chat messages.

**A throwing callback is caught and logged**, and does not prevent other schedules from firing.

## Rest and the clock

Not part of this API, but adjacent and often confused with it: a short or long rest advances the world
clock by the length of the rest, controlled by the **Rests Move the Clock** setting.

dnd5e can already do this itself -- its rest configuration carries an `advanceTime` flag and the durations
per rest variant -- but defaults it off. The setting makes it a decision the table takes once. If dnd5e's
own option is enabled too, Blacksmith stands down rather than advancing twice, and a group rest advances
the clock once rather than once per character.
