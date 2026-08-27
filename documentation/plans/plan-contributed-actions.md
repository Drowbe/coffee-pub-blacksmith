# Plan: contributed actions by subject

**Status: Planned -- nothing implemented, and it has a prerequisite.** Live scaffolding, moved out of
`TODO.md` 2026-08-27. A module declares that an action belongs to a subject, a surface declares that it
displays that subject, and Blacksmith matches the two without knowing what either means.

**On completion:** the routing model folds into
`documentation/architecture/architecture-menubar.md`, the registration surface into
`documentation/api/api-menubar.md`, the work items become `TODO.md` entries, shipped history goes to
`CHANGELOG.md`, and this file is deleted. It is not an archive.

Internal only. Do not add to the `PUBLISH` list in `tools/wiki-sync.mjs`.

---

## Contributed actions by subject (menubar routing)

Let a module declare that an action belongs to a **subject**, and let a surface declare that it displays
that subject; Blacksmith matches the two and offers the action wherever the subject appears. Squire
registering a party-health tool would then also reach the combat bar's party health bar, without Blacksmith
knowing what Squire or health are. The test for the implementation: if it ever needs an
`if (subject === 'health')` branch, the design has gone wrong — this is routing, not knowledge.

**Declared, never inferred.** Matching on names, icons, or tool ids would guess, and would guess wrong
exactly where it matters: "health" means party health on the combat bar, one actor's health on a portrait
hover card, and monster health on a third item. A wrong wire is not cosmetic, it is a control acting on the
wrong target. Both sides naming a subject cannot mis-fire, and it mirrors the existing `zone` / `group`
system — placement by declaration.

**Do not surface the contributing module in the UI.** Players have no awareness of installed modules, their
names, or their capabilities, and no reason to acquire any. Their economy is *action and context*: they know
the thing they want to do, not what provides it. Group and label contributed actions by what they do, the
way pins group by category rather than by owning module. Naming the provider is a developer's mental model
leaking into a player's surface.

Error isolation is already handled: `UIContextMenu` wraps every item callback in its own try/catch
(`ui-context-menu.js:172`), and the existing provider call sits in a try. Nothing further is needed there —
and the framing that a user should be able to attribute a failure to a module is the same fallacy as above.

**Prerequisite**: confirm the `hasCustomTemplate` gate on the secondary-bar context-menu path
(`api-menubar.js:3420`, `:3431`) works for hybrid bars — the combat bar is the hybrid one, so nothing here
lands without it. Tracked separately below.

**Fold in the existing hand-wired exceptions** when the registry exists; each is this feature special-cased
for one module:

- `manager-combatbar.js:2950` calls `getCombatContextMenuItems` on `coffee-pub-curator` by name to get the
  portrait menu's image-replacement rows. This is the closest precedent and the natural proving ground —
  generalising it removes a hard-coded sibling reference from the hub even if no second consumer appears.
- `api-effects.js:61`, `:278` read a `coffee-pub-bibliosoph` flag (`outcomeBurst`) directly to classify an
  effect. Different shape — data rather than action — but the same coupling.
- Quick Encounter reaches its provider through `hasQuickEncounterTool()` / `openQuickEncounterWindow()`,
  which is looser but still a named capability rather than a declared subject. The provider is
  **Bibliosoph**. Leave the row where it is for now — it only opens the tool and the tool does the rest, so
  there is nothing to re-route until the registry exists.

**Wanted wiring, once it exists**: clicking the combat bar's party health bar should open whatever the
party-health tool provides. Called out as very handy — it is the case that motivated the idea.
