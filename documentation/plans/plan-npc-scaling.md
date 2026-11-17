# Plan: NPC Scaling, what is left

**Status: In progress.** The engine, the new-actor output, `api.npcScaling`, the Tool window and its entry
points are written and described in `architecture/architecture-npc-scaling.md` and `api/api-npc-scaling.md`;
they await live verification (`testing/npc-scaling.md`). This plan holds only what is not built.

Author decisions, 2026-11-17: it lives in Blacksmith; a CR retarget and named templates both; a new actor
by default; auto-scale on dropped tokens later.

## Templates

A named template is a spec with the numbers written in rather than derived: "Elite", "Champion", "Super".
`applySpec` already takes one, so this is storage, a picker and an editor, not a new write path.

- **Library.** A world setting seeded once from a bundled set, with export and import, as the quick-rolls
  library is (`QuickRollsManager.seedIfNeeded`, `exportPayload`, `importRolls`). Seeded defaults and the
  seed flag follow that precedent so a world keeps what it built.
- **Window.** A template picker beside the CR select, as `.blacksmith-tool-chips` or
  `.blacksmith-tool-card` rows; saving the current preview as a template; `.blacksmith-tool-editable` for a
  template's name; `api.dialog.prompt` for a new name, with `validate` rejecting a duplicate; `confirm`
  before delete.
- **API.** `api.npcScaling.templates.*` (list, get, save, delete), Blacksmith's window being the first
  consumer. A template names no document, so it exports and imports as plain data.
- **Resources.** A template can carry legendary resistances and actions counts. The engine already writes
  them (`spec.resources`); nothing yet produces them.

## Editable guidelines table

`GUIDELINES` ships as the DMG 2014 numbers. Make it a world setting seeded from that bundle, editable, with
import and export, and pass it to the engine through the `table` parameter it already takes. Settings copy
is the author's to write. **Open question:** whether this system should ship the 2024 DMG numbers instead;
the table is data, so either is a small edit, but the figures need checking against the book.

## Token-only output

Scale an unlinked token's own actor in place, for a one-off, without creating a document.

- Writes the same `updates` to the token's actor (an ActorDelta).
- **Revert** cannot regenerate from a source, so it stores the original value of every path it touched as
  one map in one flag write, and restoring writes it back. One key written once is what prevents a second
  write from clobbering the first.
- **Batch**: several tokens of one actor, each with its own delta.
- The window gains an output switch (`.blacksmith-tool-segmented`) only when this exists; `apply` already
  refuses any output but `'actor'` by name.

## Auto-scale on drop

A `createToken` handler calls `api.npcScaling.apply(token, { cr, output: 'token' })`. The API already takes
a token as readily as an actor and the target CR is an input, so nothing in it needs to change. Not for v1
of this phase:

- **Opt-in is three-valued** (per scene or per actor): `undefined` means never asked, so prompt once and
  write a real boolean either way.
- **The target CR per creature.** `getPartyCR` is a party-wide total for encounter budgeting and is not a
  per-creature rating; the target needs its own rule (for example a fixed offset from the party's average
  level), which is a design decision for the author.
- **What to do with a token dropped from a compendium**, and with one already scaled.

## Smaller open items

- **Tag a scaled actor** through `api.tags` so it can be found and filtered in the directory. Decide first:
  it changes what `apply` writes.
- **Extra attacks.** A one-attack creature scaled far up carries its damage on that attack, and the engine
  can only warn. Adding a real Multiattack means writing items into the new actor, which needs its own
  decision.
- **The live 5.x pass.** The 5.x column of the path table comes from dnd5e's own migration table, not an
  install. `testing/npc-scaling.md` item 13 proves it.
- **Fixed save DCs on features** are not scaled. Rewriting activity DCs is its own piece of work.
- **The dnd5e citation checker is stale.** `tools/check-dnd5e-citations.mjs` still verifies against 5.3.3
  while 6.0.6 is installed, so the repo's existing pointers are unchecked. Not this feature's, but nothing
  here cites a line number so as not to add to it.
