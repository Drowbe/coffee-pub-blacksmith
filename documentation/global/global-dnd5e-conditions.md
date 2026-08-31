# Guide: Working with dnd5e Conditions and Active Effects

Practical, hard-won knowledge about Foundry v13 + dnd5e 5.x conditions. Verified core-only — no DFreds, no third-party condition modules.

Most consumers should not need this: `effects.getDisplayEffects(actor)` already handles filtering, labels, durations, and description enrichment. Read this when you are applying or removing effects yourself, or when something in the substrate is behaving unexpectedly.

Originally field notes from Bibliosoph's injury and Check-Up build.

---

## 1. Applying and removing conditions

For any official condition, the only correct call is the core toggle:

```js
await actor.toggleStatusEffect('blinded', { active: true });   // apply
await actor.toggleStatusEffect('blinded', { active: false });  // remove
```

This creates or deletes the system's own condition ActiveEffect with the right icon, name, and rules wiring. **Do not hand-build an ActiveEffect for an official condition** — you get a lookalike that other code, including dnd5e itself, does not recognise as the condition.

- Guard before toggling on: `actor.statuses.has('blinded')`. Toggling an already-active condition off when you meant on is a classic.
- **Do not take a DFreds dependency.** Its API signatures did not match its documentation and it was missing dnd5e 5.x conditions entirely. Core-only has been reliable.
- **Exhaustion is leveled.** `toggleStatusEffect('exhaustion')` gives you level 1; the real level lives at `actor.system.attributes.exhaustion`. If you surface exhaustion, surface the level.
- All of this requires ownership. Gate UI on `actor.isOwner`.

---

## 2. Never hardcode the condition list

The set of legal conditions changed in dnd5e 5.x and will change again. Enumerate at runtime from two registries:

```js
CONFIG.statusEffects          // toggleable — what the token HUD shows; `name` is a LOCALIZATION KEY
CONFIG.DND5E.conditionTypes   // full registry, including pseudo-conditions
```

Always `game.i18n.localize()` before displaying or comparing, and compare lowercased.

### Pseudo-conditions are the trap

`bleeding`, `burning`, `diseased` and friends are flagged `pseudo: true`. They **cannot be toggled** and never get their own effect. A pseudo-condition exists only by riding on another effect's `statuses` array:

```js
await actor.createEmbeddedDocuments('ActiveEffect', [{
    name: 'Gnash Wound', img: '...', statuses: ['bleeding']
}]);
```

It lives and dies with the carrying effect. An add-a-condition picker that offers pseudo-conditions as toggleables will silently fail — either exclude `pseudo` entries from "add", or create a carrier effect.

---

## 3. Descriptions need the enricher

dnd5e condition effects do not store description text. They store **enricher syntax** pointing at the rules journal:

```
@Embed[Compendium.dnd5e.content24.JournalEntry.phbAppendixCRule.JournalEntryPage.QxCrRcgMdUd3gfzz inline]
```

Render `effect.description` raw and your users see exactly that string. Run it through the enricher:

```js
const TextEditorImpl = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
const html = await TextEditorImpl.enrichHTML(effect.description ?? '', {
    relativeTo: effect,
    rollData: actor.getRollData?.() ?? {}
});
```

- It is **async** — build row data with `Promise.all`; do not try to enrich in a synchronous render path.
- Wrap in try/catch and fall back to raw text. A broken embed should not kill the whole list.
- `CONFIG.DND5E.conditionTypes[id].reference` is a UUID straight to the rules page if you would rather link than inline.
- Watch heights: the Exhaustion page embeds a full table. Cap or scroll your container.

`getDisplayEffects` does all of this for you, permission-aware.

---

## 4. Detecting what is actually afflicting an actor

`actor.statuses` is not enough. The battle-tested filter, in order:

```js
const isAffliction = (e) =>
    !e.disabled && !e.isSuppressed && (
        !!e.getFlag(moduleId, flagKey)              // module-stamped
        || e.isTemporary                             // has a duration
        || e.statuses?.size > 0                      // carries condition ids
        || conditionNames.has(e.name.toLowerCase())  // NAME matches a localized condition
    );
```

That last clause matters: GMs hand-author effects named "Frightened" with no duration and no statuses. Every other test misses them. Build `conditionNames` from both registries in §2, localized and lowercased.

The `disabled` / `isSuppressed` exclusions keep toggled-off and unequipped-item effects out.

This is exactly what `EffectsAPI.getActiveEffects()` implements — prefer it over rolling your own.

---

## 5. Removal and the unwind problem

`await effect.delete()` removes any effect regardless of who created it, ownership permitting. Deleting dnd5e's own condition effect is fine — it untoggles cleanly.

The real gotcha: **if the effect conveyed a toggled condition, deleting it may leave the condition behind.** After deleting, check whether any *remaining* effect still conveys that condition, and only then toggle it off. Skipping the still-conveyed check makes removing one of two bleed-inducing wounds cure the bleeding.

Bibliosoph implements this as a global `deleteActiveEffect` hook rather than a callback, so the unwind runs no matter which UI performed the delete. That is the recommended shape — see "Prefer hooks over registry callbacks" in [architecture-ownership](../architecture/architecture-ownership.md).

**Duration display:** `effect.duration.label` gives a localized remaining-time string ("10 Rounds", "1 Minute"). `duration.type === 'none'` means no duration — show nothing.

---

## 6. A conveyed condition legitimately appears twice

When an injury toggles Prone, the Prone condition exists as **its own effect too**. So it correctly appears both inside the injury's row and as an independent row. That is not a dedup bug — the patient can stand up while the injury persists.

To label such rows, match the loose condition's `statuses` against the flagged effects' conveyed conditions and render "via &lt;source name&gt;". `getDisplayEffects` already does this and returns it in `context`.

---

## 7. Miscellaneous, learned the hard way

- **Hooks fire on every client.** `createActiveEffect` / `deleteActiveEffect` reach all clients, so canvas animations can be driven entirely off effect flags with zero socket traffic. Anything that *writes* from such a hook must guard with an active-GM check.
- **`effect.statuses` is a Set; `actor.statuses` is the aggregate** of every condition id currently conveyed by anything. Good for duplicate guards, useless for "which effect conveys it."
- **Treat duplicate applies as success** with a notification, not an error. GMs double-click.
- **Do not model HP damage as an ActiveEffect change.** HP changes applied that way *suppress* rather than damage, and un-suppress on removal. Apply one-time damage immediately via `actor.update`. Routing it through the damage pipeline instead risks a large hit re-triggering damage-threshold automation — an infinite loop.
