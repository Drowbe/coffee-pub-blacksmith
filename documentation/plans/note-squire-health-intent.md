# Note to Squire: claim the `party-health` intent

**Status:** Both sides shipped. Delete once verified in a live world with Squire enabled.

Squire added `intents: ['party-health']` and reported that `hasIntentHandler` still returned false.
They were right: `registerMenubarTool` builds a normalised copy of the caller's data and `intents` was
not among the fields copied, so the claim was accepted and discarded. Fixed in Blacksmith — see the
note at the end of this file.

**Audience:** Whoever works on `coffee-pub-squire` next.

## What Blacksmith added

Blacksmith's combat bar draws party and monster health bars in its data row. Clicking them should open
a health panel — but Blacksmith does not have one, and Squire does.

Naming `squire-health` inside Blacksmith would put a sibling's tool id in the hub, which is the coupling
the suite's module boundaries exist to prevent. So Blacksmith asks for a **capability** instead, and any
module may claim it.

Three methods are now on `game.modules.get('coffee-pub-blacksmith').api`:

| Method | Does |
|---|---|
| `invokeMenubarTool(toolId, context?)` | Runs a registered tool's `onClick` by id |
| `invokeIntent(intent, context?)` | Runs whichever registered tool claims that intent |
| `hasIntentHandler(intent)` | Whether anything claims it |

Full description in `documentation/api/api-menubar.md`.

## What Squire needs to do

One line. Squire already registers the tool at `scripts/squire.js:2115`:

```javascript
const healthOk = blacksmith.registerMenubarTool('squire-health', {
    // ... existing icon, name, onClick, zone, order ...
    intents: ['party-health']          // <- add this
});
```

`intents` is an array because a tool may reasonably answer to more than one capability. Unknown keys were
already ignored by `registerMenubarTool`, so adding it is safe against older Blacksmith builds — it does
nothing until a Blacksmith new enough to read it is installed.

## What happens then

The combat bar's health bars become clickable and open Squire's health panel, passing
`{ source: 'combat-bar', itemId: 'party-health' | 'monster-health' }` as the second argument to `onClick`.
Squire may ignore that context entirely; it is there so a handler can tell which surface called it.

Until Squire claims the intent, the bars stay inert readouts and show no pointer cursor. Blacksmith gates
the *affordance* on `hasIntentHandler`, not just the call, so a user never sees a control that does
nothing.

## Why an intent rather than a direct call

Worth stating because it is the reusable part, not a detail of this feature.

A surface that names a module can only ever work with that module, and every such name is a dependency the
hub cannot honour if the sibling is absent, renamed, or replaced. A surface that names a *capability*
works with whatever provides it and degrades to nothing when nothing does. That is the only shape that
lets Blacksmith offer integration points without Blacksmith knowing what is installed.

The same mechanism is open to any other capability worth sharing. If Squire wants Blacksmith surfaces to
be able to reach one of its other tools, claim an intent for it and tell us the name.

## The bug Squire found, and what it says about this API

`registerMenubarTool` does not store the object it is given. It builds a **normalised copy**, field by
field, which is deliberate: a registration cannot then smuggle in properties the menubar would have to
defend against later. The cost is that every supported field must be listed in that copy or it is
silently dropped — and `intents` was not. The lookup had been written and the copy had not, so a module
could claim an intent, receive `true` from registration, and never be found.

Two things worth carrying forward. **A field added to this API has to be added to the normalised copy
too**, or it does not exist. And **registration returning `true` means the tool was accepted, not that
every field on it was**; a caller cannot tell the difference, which is why the failure was invisible from
Squire's side and had to be reported rather than observed.
