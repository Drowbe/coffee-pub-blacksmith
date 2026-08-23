# Testing: the filtered compendium query

**Audience:** us.

Scope: what shipped with `api.compendiums.query()` and is not yet proven in a running world. Transitional --
see the testing rules in `CLAUDE.md`. **Remove an item when it passes rather than ticking it, and delete this
file when it is empty.**

**Status: nothing here has been run in a live world.** The engine, the API, the harness assertions and the
palette facets are all written and syntax-clean; no Foundry client has loaded them.

The harness covers everything assertable: run the **Compendium Search & Query** suite, whose Query group
asserts the cap-vs-scan difference, the mundane/common distinction, the gp conversion, the unpriced default
and that the widened projection leaves a plain search unaffected. **Run the harness whole, not per tab** --
the projection-widening check depends on cache state that other checks in the same suite disturb.

What is below is only what a harness cannot reach: how it looks, how it feels, and what happens the first
time a session widens an index.

## The harness first

- [ ] **Run All Headless.** Every existing assertion must still pass, not only the new Query group. The
  refactor moved the whole search scan into `_scan()`, so a regression shows up in the Matching, Ordering
  and Bounds groups rather than in the new checks.

## The palette -- browse mode

The window could not browse before this; below its minimum query length it refused. Everything here is new
behaviour.

- [ ] **Browse with no text.** Open the palette (Ctrl+Space), leave the box empty, set the type to Item and
  pick a rarity. Rows appear, grouped by compendium. The placeholder changes to mention browsing.
- [ ] **Facets are absent where they mean nothing.** Switch the type to All, then to Actor, then to Spell.
  The rarity and price controls disappear each time and come back on Item. A rarity selector on the Spell
  view would look like it should work and could only ever return nothing.
- [ ] **Text plus a facet narrows rather than replaces.** With a rarity set, type three characters. Results
  must be the intersection -- fewer rows than the facet alone, and every row still matching the rarity.
- [ ] **Price fields settle before querying.** Type `150` into the min field. It must run once, when you
  leave the field or press Enter -- not at `1` and again at `15`.
- [ ] **The empty state says the right thing.** With no facet and an empty box it offers both routes ("type
  at least 3 characters, or set a filter to browse"). With a facet set and no matches it says "Nothing
  matches" instead of telling you to type.
- [ ] **Drag from a browse row.** Rows produced by a query carry no `matchType`; confirm dragging one onto a
  character sheet still works, since the drag payload is built from `documentClass` and `uuid`.
- [ ] **Badges read correctly.** A plain longsword shows a muted "Mundane" badge, not "Common" and not a
  blank space. An item priced in silver shows its gold value -- a 50 sp item reads `5 gp`, not `50`.
- [ ] **The status line stays honest.** A browse that fills the 100-row cap says "more available" and must
  **not** say "N compendiums not searched", because a query opens every source. Compare against a text
  search with the same cap, which may legitimately say both.

## The one-time index widening

- [ ] **The first query in a session pauses, and only the first.** Reload the client, open the palette, run
  a plain text search (fast), then set a rarity facet. That first faceted call widens the index of every
  configured Item pack -- watch the status line's millisecond count. Every call after it, including plain
  searches, must be back to normal speed. If the pause repeats on later facet changes, the two-state cache
  in `_getPackIndex` is downgrading when it should not.
- [ ] **A GM with many mapped packs.** The widening cost scales with the number of configured Item sources.
  Worth one look on the real campaign world rather than a test world, to know whether the pause needs
  saying out loud to the user rather than only being noticed.

## Cross-module

- [ ] **Merchant stocks a shop from `query()`.** The reason this exists. Confirm they get a usable candidate
  set without reimplementing the source mapping, and specifically that asking for common and uncommon
  without the `mundane` token visibly returns magic items only -- the trap should be obvious in practice,
  not just documented.
