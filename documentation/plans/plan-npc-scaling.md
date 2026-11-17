# Plan: NPC Scaling, what is left

**Status: In progress.** The engine, the new-actor output, `api.npcScaling`, the Tool window and its entry
points are written and described in `architecture/architecture-npc-scaling.md` and `api/api-npc-scaling.md`;
they await live verification (`testing/npc-scaling.md`). This plan holds only what is not built.

Author decisions, 2026-11-17: it lives in Blacksmith; a CR retarget and named templates both; a new actor
by default; auto-scale on dropped tokens later.

## Templates: what is left

The library, picker, editor, export and import are built (`architecture/architecture-npc-scaling.md`).
Left:

- **Per-type tuning.** A template applies the same numbers to every creature. A template that cares about
  what a creature is (more hit points for a brute, more save DC for a caster) is a different feature.
- **Restore the built-ins.** A GM who deletes them has no button to get them back; importing an export from
  another world, or `api.npcScaling.templates.save` by hand, does it today.

## The guidelines table: what is left

Building a table from a compendium is built (`architecture/architecture-npc-scaling.md`). Left:

- **Hand-editing a row, and exporting or importing a table.** A built table is replaced whole; a GM who
  disagrees with one figure rebuilds from different packs or waits for this.
- **Save DC is a blunt column.** A sample's DC is the highest of its spell DC and its save activities' DCs, so
  a creature with one punishing breath weapon reads high. Only the spell DC is scaled by it, so the effect is
  small; a better column would separate the two.
- **Settings copy** for a toggle or a default, if one is ever wanted, is the author's to write.

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
