# Testing: Actor import under declarations

**Audience:** us.

Scope: the Actor kind's move onto the declaration model, which has shipped and is not yet proven in a
running world. This is a transitional document -- see the testing rules in `CLAUDE.md`. **Remove an item
when it passes rather than ticking it, and delete this file when it is empty.**

**Status: the harness half is finished, and the Sidekick and Character profiles are proven end to end.**
The Importer Declarations suite passes **214/214** in a running world as of 2026-08-31, Actor group
included, with no regression in the Item or Roll Table groups. Sidekick and Character were imported and
their exports checked on 2026-08-31: the envelope is consumed and removed, and a Character's foundations
link post-create. Rollback is proven too -- an unresolvable foundation fails at the link step and leaves no
Actor behind. What remains is everything the harness cannot reach -- construction resolves named
items, spells and features against the configured compendiums, and that is where an Actor import has always
actually failed.

Results go to the **Verified** line of the relevant `CHANGELOG.md` entry, not back into this file.

## Owed

- [ ] **Run All Headless across every suite.** Only `importer-declarations` has been run. Nested validation
      and case folding are shared model changes, so a full run is what shows nothing else moved.

- [ ] **Import `testing/import-json/actor-import-npc.json`.** The plain case, and the one that proves
      passthrough: the created Actor must carry its whole stat block, and the result screen must not
      report undeclared fields.

- [ ] **Break one on purpose.** Set `sidekick.role` to something outside the three, or `sidekick.level` to
      44, and confirm the failure names the field as `sidekick.role` / `sidekick.level` rather than as a
      blanket validation failure. Nested paths are new and are the point of the change.

- [ ] **Open the Import Actor window for each of the four profiles.** The JSON template and the authoring
      guide are now composed from the declaration plus a native body; check that the envelope keys appear
      for the right profiles, that the stat block is still there, and that Portrait Image still offers a
      prompt and no JSON.
