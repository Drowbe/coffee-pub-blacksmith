# Plan: NPC Scaling

**Status: Planned -- nothing written. Design agreed with the author 2026-11-17.**

Take a goblin and make it a Super Goblin. A party near level 16 finds most stock NPCs trivial, and the
GM wants to raise one without rebuilding it by hand.

## Decisions (author, 2026-11-17)

- **Lives in Blacksmith.** Blacksmith already owns CR knowledge (`EncounterManager`, `manager-xp.js`), so
  the engine and its API live here. Not a sibling module.
- **Two ways to describe a scaling, one way to apply it.** A *CR retarget* ("make this CR 12") and a *named
  template* ("Elite", "Champion", "Super") both produce the same thing: a **scale spec**. One applier consumes
  specs, so there is exactly one write path to test.
- **New actor by default.** Scaling writes a new world actor, never the source. Token-only output exists
  for one-offs.
- **Auto-scale on dropped tokens is expected later.** Not built now, but the API must take it without a
  reshape -- see *Auto-scale*.

## Principles

- **Delta, not absolute.** The guidelines table decides how much to add; the creature's own stats are the
  starting point, so a goblin stays a goblin.
- **An editable guidelines table.** Our own numbers, derived from the published CR guidelines.
- **Preview before applying, and a way back.**
- **Damage must be solved for, not just dice-stepped** -- a one-attack creature cannot reach a high-CR damage
  output by adding dice alone. See *The hard part*.

## The scale spec

A plain, serialisable object -- the unit that is previewed, stored, exported, and applied:

```
{
  version: 1,
  label: "Super",                   // name suffix / template name
  cr:        { to: 12 },            // sets system.details.cr
  hp:        { mode: "target" | "percent" | "flat", value },
  ac:        { add },
  attack:    { add },               // net of the proficiency change, see Traps
  saveDC:    { add },               // net of the proficiency change
  initiative:{ add },
  damage:    { addPerHit },
  resources: { legres, legact },    // counts only
}
```

`specFromCR(actor, targetCR)` fills it from the guidelines table: for each stat, *target-row value minus
the creature's own current value*, so a goblin stays a goblin. A template is a spec with the numbers
written in rather than derived. A spec never names a document, so it can be exported and shared.

## Traps found before writing a line

Verified against dnd5e **6.0.6** (installed). Every `dnd5e.mjs:NNNN` below is true of that version only
and will rot; `tools/check-dnd5e-citations.mjs` is the net.

1. **Proficiency is derived from CR.** `dnd5e.mjs:85610`: an NPC's `attributes.prof` is
   `Proficiency.calculateMod(max(cr, level, 1))`. Setting `details.cr` therefore moves attack bonus and
   save DC on its own. A spec must subtract the proficiency change from the attack and DC amounts it
   adds, or every retarget double-counts. The preview shows the *final* numbers so a miss is visible.
2. **CR also drives XP and spellcaster level** (`:85600`, `:85613`). XP for the scaled creature is correct
   for free; spellcaster level only follows CR when it is not set explicitly. `manager-xp.js` and
   `EncounterManager.getMonsterCR` read `details.cr`, so a scaled NPC is counted at its new CR everywhere.
3. **Attack and damage bonuses moved between dnd5e versions.** 6.0.6 keeps them under `system.rolls.attack.<mwak|rwak|msak|rsak>`
   and `system.rolls.damage.<...>` (`:83778`, `:83784`). Blacksmith supports dnd5e on Foundry 13 and 14, so
   the paths must be read from the *installed* version, not hard-coded from this one. Open: confirm what
   5.x used, and whether 6.0.6 still shims the old `bonuses.*` paths. Using actor-level bonuses is still
   the right idea: one write, no per-item editing, visible on the sheet, and revertable.
4. **Unlinked tokens report the prototype's id and name** (`global-token-actor-identity.md`). Token-only
   output and any provenance lookup must resolve by token or `uuid`, never by `actor.id`.
5. **Hit points.** NPC `hp.formula` is informational and `hp.max` is the stored value; the dnd5e HP bonus
   field is `hp.bonuses.overall` (`:84157`). Decide which one a spec writes before the first line of the
   applier -- it decides whether "revert" is a delete or a recompute.

## Provenance and revert

Every scaled actor carries one flag, written once, in the same `create` call:

```
flags.coffee-pub-blacksmith.npcScaling = { sourceUuid, spec, version, appliedAt }
```

**Rescale and revert both regenerate from `sourceUuid`.** Scaling a Super Goblin again applies the new
spec to the *source*, so scalings never compound and there is no backup to corrupt. "Revert" on a new
actor is "open the source". Token-only output cannot regenerate, so it stores the original value of every
path it touched as one map, in one write -- one key written once cannot be partially overwritten by a second write.

## The hard part: damage output

CR is mostly about damage per round, and the creature's own DPR is not stored anywhere. A goblin has one
attack; its Multiattack, where it has one, is prose.

v1 estimates DPR as the summed average damage of its attack activities, multiplied by a Multiattack count
parsed from the feature text when it is unambiguous, and **shows the estimate in the preview as an
editable number**. The GM corrects a bad guess before applying; the spec then carries the corrected figure.
The applier closes the gap with `damage.addPerHit`. It never edits items or activities, and it never
rewrites Multiattack text.

Open: whether to *add* attacks (a real Multiattack) is v2, and needs a decision about writing items
into the new actor.

## Output modes

| Mode | Writes | Revert |
|---|---|---|
| **New actor** (default) | `Actor.create` from the source's data with the spec applied; name from the spec label; provenance flag | Regenerate from source |
| **Token only** | The token's synthetic actor (an ActorDelta on an unlinked token) | Restore the stored original-values map |

A linked, directory-owned source is never mutated in either mode.

## Surface

- **Engine** -- pure functions in a `utility-` file: guidelines table, `specFromCR`, `applySpec` (returns
  update data, writes nothing), `estimateDPR`. No Foundry globals, so the check can slice them out as
  `check-dice-builder.mjs` does.
- **`api.npcScaling`** -- `preview(target, {cr | template | spec})`, `apply(target, {cr | template | spec,
  output})`, `templates.*`. Blacksmith's own window is its first consumer, not a private path.
- **Window** -- `NpcScalingWindow extends BlacksmithToolWindowBaseV2` (`scripts/window-tool-base.js`):
  target CR or template picker, a table of *stat / now / scaled*, the editable DPR estimate, an output-mode
  switch. See *Blacksmith APIs this builds on* for the controls and the lifecycle.
- **Entry points** -- the toolbar tool and the actor sheet header control first; see the table.
- **Guidelines table** -- bundled data, editable, stored as a world setting seeded from the bundle (the
  quick-rolls seed-once pattern, `QuickRollsManager.seedIfNeeded` / `exportPayload` / `importRolls`), with
  import/export. Settings copy is the author's to write.

## Blacksmith APIs this builds on

Blacksmith is consumer zero (`feedback-blacksmith-is-consumer-zero`): the feature goes through the same
surface a satellite would, and where a satellite would have to jump through a hoop, we fix the hoop.

| Need | API | How it is used |
|---|---|---|
| The window | **Tool window** -- `BlacksmithToolWindowBaseV2`, `api-window.md` | Subclass it. **One window per target**: `NpcScalingWindow.openFor(tokenDocument \| actor)`, which focuses an open one rather than building a second, keyed on `uuid` -- never `actor.id` (see trap 4). Set `rememberPosition: false` where several can be open. Never assign `this.options.toolTheme`; use `setToolTheme()`. Handlers read the instance from `ACTION_HANDLERS`' third argument. Unregistered unless a toolbar tool needs to open it by id. |
| Window controls | **`blacksmith-tool-*`**, `design-components.md` | The *now / scaled* table as a `.blacksmith-tool-section` per stat group; output mode as `.blacksmith-tool-segmented` (new actor / token only); template picker as `.blacksmith-tool-chips` or `.blacksmith-tool-card` rows; `.blacksmith-tool-editable` for the DPR estimate and a template's name (`change` event, `{ value, previous }`; skip a redraw while `api.toolEditable.isEditing`); `.blacksmith-tool-hint` / `-empty`; footer actions in the shared action bar -- Apply is the right-hand primary, secondary on the left. **No colour literals and no window-scoped restyling of a shared component** (`feedback-no-component-overrides`): a missing variant is added to the component. |
| Confirm / ask | **`api.dialog`** | `confirm` before a destructive rescale or a delete-template; `choose` for the output mode when invoked from a macro; `prompt` for a template name, with `validate` rejecting a duplicate; `pickActor` when `api.npcScaling.apply` is called with no target. Dismissal follows the dialog contract (`closeValue`), not a custom cancel. |
| Feedback | **`api.toast`** | One toast on success naming the new actor and its CR, one on refusal. Not `ui.notifications`. |
| The target and its CR | **`api.getMonsterCR`, `api.parseCR`, `api.formatCR`, `api.getPartyCR`** | The same CR parsing and formatting the encounter bar uses, so `1/4` means the same thing everywhere. `getPartyCR` is the default suggestion for "scale to the party". |
| Source actors | **`api.compendiums`** | Resolve a source by name or UUID, including from the GM's mapped NPC compendium, so a GM can scale a stock NPC without importing it first. |
| Entry: toolbar | **`registerToolbarTool`** (`api-toolbar.md`) | A `gmOnly` tool, "Scale NPC", acting on the selected tokens. The toolbar is the registry's reason to exist: this is the one place the window is registered by id. |
| Entry: sheet | **`getHeaderControls` through `HookManager`** | An NPC sheet header control that opens the window for that actor. The hook name is the ApplicationV2 one, not the V1 `getActorSheetHeaderButtons`, and its arguments differ (`manager-hooks.js` legacy table). Registered with `HookManager.registerHook` and a `context`, never a raw `Hooks.on`. |
| Entry: canvas | **`api.uiContextMenu.show`** | Reserved, not v1. Foundry's token right-click is the HUD, not a context menu; adding to it is a separate decision. |
| Provenance tags | **`api.tags`** | Open question: tag a scaled actor so it can be found and filtered in a directory. Decide before phase 2 -- it changes what the spec writes. |
| Players and permissions | **`api.gmRequest`** | **Not used.** Scaling is GM-only end to end and creates a world actor; a player never reaches it, so there is nothing to relay. |
| Logging, hooks, settings | **`postConsoleAndNotification`, `HookManager`, `registerHeader`** | As everywhere. The guidelines table and the template library are world settings under a new heading; `node tools/check-settings-headings.mjs` after. |
| After scaling | **Foundry hook, our own name** | `blacksmith.npcScaling.applied`, fired once with `{ source, result, spec, output }`, so a satellite can react. Documented in `api-npc-scaling.md` with the rest of the surface. |

Two APIs that look relevant and are not: **`api.importer`** -- scaling copies an existing actor and does not
read foreign data, so the declaration model has nothing to declare; and **`api.rolls`** -- nothing here rolls.

## Auto-scale (later, not now)

A `createToken` handler asks `api.npcScaling.apply(token, { cr: partyCR + offset, output: 'token' })`.
Nothing in the API above needs to change for it, provided `apply` takes a token as readily as an actor and
the target CR is an input, not a lookup inside. Party CR already exists: `EncounterManager.getPartyCR`.
The decisions that are still open and **not** for v1: opt-in per scene or per actor (three-valued -- see
the undecided-is-not-no rule), the offset, and what to do with tokens dropped from a compendium.

## Phases

1. **Engine and check.** Table, spec, `specFromCR`, `applySpec`, `estimateDPR`, and
   `tools/check-npc-scaling.mjs` -- proficiency subtraction, CR 1/4 to 12 round trip, never-writes-source.
2. **New-actor output, provenance, API.** `api.npcScaling.preview/apply`; `api-npc-scaling.md`.
3. **Preview window and entry points.**
4. **Templates.** Named presets, export/import, seeded defaults.
5. **Token-only output and batch** (several tokens of one actor).
6. **Auto-scale on drop.**

Architecture doc `architecture-npc-scaling.md` is written when phase 2 lands, with the traps above moved
into it. This plan is deleted when it has been absorbed.

## Verification

In a live world: scale a goblin to CR 12 with new-actor output and confirm the source is unchanged, the
new actor's proficiency, AC, HP, XP and attack bonus match the preview, and the encounter bar counts it at
CR 12. Rescale the result to CR 8 and confirm the numbers are the CR-8 ones, not a stack. Repeat with an
unlinked token copied nineteen times and scaled token-only. Run on dnd5e 6.0.6 and on a 5.x world.
