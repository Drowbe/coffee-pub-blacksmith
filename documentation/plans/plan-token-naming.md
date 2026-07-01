# Plan: Creature-Type / Subtype Token Naming

Purpose: give token auto-renaming a name source appropriate to the creature's **type** and
**subtype**, instead of a single global random-name table. Keep the existing single table as a
failover so current behavior is unchanged until the new mapping is configured.

Status: **Implemented (Phases 1–2)** — data, resolver, wiring, and per-key settings are in.
In-Foundry verification and Phase 3–4 polish (index invalidation on table CRUD; compendium
source) remain. Files: `resources/naming-taxonomy.json`, `scripts/utility-token-naming.js`,
`scripts/blacksmith.js` (load before registerSettings), `scripts/settings.js` (generated per-key
settings), `scripts/manager-canvas.js` (`_onCreateToken` resolver), `lang/en.json` (header).

---

## Current state (what exists today)

- Settings (`scripts/settings.js`, token-renaming group ~lines 4220-4270):
  - `tokenNameFormat` — how the name is applied (replace/append/number); choices from `resources/config-nameplates.json`.
  - `ignoredTokens` — comma-separated token names to skip.
  - `fuzzyMatch` — partial vs. exact ignore matching.
  - `tokenNameTable` — **single** world RollTable, chosen by name; populated by `getTableChoices()` (`settings.js` ~659-672).
- Rename flow (`scripts/manager-canvas.js` `_onCreateToken`, ~278-413):
  - GM-only, non-linked tokens.
  - Ignored/fuzzy gate, then for `name-*` formats: `game.tables.getName(tokenNameTable)` → `table.roll()` → apply format.
- Creature type is already read elsewhere as `actor.system?.details?.type?.value` (`scripts/manager-encounter.js` ~224, 259). dnd5e also exposes `…type.subtype`, `…type.custom`, `…type.swarm`.

`tokenNameFormat`, `ignoredTokens`, and `fuzzyMatch` are **orthogonal** to this plan — only the *name source* (which table to roll) changes.

---

## Design (locked)

**Explicit table-per-key + alias JSON + global fallback.**

1. **Fixed set of canonical keys** (creature types + a few distinct subtypes). Each key gets its own
   RollTable dropdown in settings (reusing `getTableChoices()`), defaulting to `none`.
2. **Alias JSON** (`resources/`) maps any incoming type/subtype spelling/variation → a canonical key.
   The JSON is also the **single source of truth for the key list**, so the per-key settings are
   generated from it (no duplicated key list in code).
3. **Cascade per token** (specific beats broad; stop at first table that resolves):
   1. `subtype` field → canonical key → assigned table (structured data, strongest signal)
   2. **specific name keyword** → canonical key → assigned table. Only *specific* keys (subtypes +
      roles) match here; *broad* keys (the 14 creature types, incl. generic aliases like
      `human`/`commoner`) are skipped so they can't beat a role/subtype word in the name. Lets
      "Cultist", "Goblin Boss", "Human Cultist" (→ cultist) resolve correctly.
   3. `type` field → canonical key → assigned table (the broad bucket, e.g. `humanoid`)
   4. **global fallback** = existing `tokenNameTable`

   Broad vs. specific is **derived from the JSON**: each key carries `"kind"` — `"type"` (broad),
   `"subtype"`, or `"role"` (both specific). No hardcoded key lists. Tiebreaks: the structured
   `subtype` field beats a role in the name; within the name, first specific word wins (species
   usually leads, e.g. "Goblin Cultist" → goblinoid).
4. **Reuse is free:** point several keys at the same table by selecting it in multiple dropdowns.
5. **Source:** world RollTables now; the resolver should be written so the table lookup can later
   target a **compendium** of RollTables without changing the cascade.

Rejected alternatives (for the record): a single root-folder + first-word table-name convention
(too convention-fragile, silent failures, prefix collisions like Dragon/Dragonborn); explicit
per-subtype settings UI (can't enumerate open-ended subtypes).

### Why a small subtype set

A subtype earns its own table only if its **name pool is genuinely distinct**. Everything else folds
in via aliases or rides the type-level table:

- `elf`, `dwarf`, `gnome`, `goblinoid` are distinct enough to keep.
- `human`, `halfling`, `goliath` are close enough to generic humanoid → no own key; they ride the
  `humanoid` type table.
- `kobold`, `orc` fold into `goblinoid` (short/guttural register).

---

## Canonical key set (18 keys)

### Types (14 — official Foundry/dnd5e set)

`aberration`, `beast`, `celestial`, `construct`, `dragon`, `elemental`, `fey`, `fiend`, `giant`,
`humanoid`, `monstrosity`, `ooze`, `plant`, `undead`

### Subtypes (4 — distinct name pools only)

| Key | Label | Seed aliases (→ this key) |
| --- | --- | --- |
| `elf` | Elves | elves, elven, drow, eladrin |
| `dwarf` | Dwarves | dwarves, dwarven, duergar |
| `gnome` | Gnomes | gnomes, svirfneblin |
| `goblinoid` | Goblinoids | goblinoids, goblin, hobgoblin, bugbear, kobold, orc |

`human`, `halfling`, `goliath` intentionally have **no key** — they cascade to the `humanoid` table.

---

## Alias JSON (`resources/naming-taxonomy.json`)

Each entry = a canonical key + display label + `kind` (`"type"` = broad, `"subtype"`/`"role"` =
specific) + aliases. Both the token's type/subtype string **and** the keys are normalized (lowercase,
trim) and compared, so `orc`/`Orcs`/`orcish` all resolve to `goblinoid`. `canonicalize()` matches the
key itself **or** any alias. This JSON is the single source of truth: the per-key settings, the
broad/specific tiers, and the alias map are all derived from it — no hardcoded lists in code.

A GM can point at their **own** taxonomy via the `namingTaxonomyJson` setting (a file path with a
browse button; defaults to this bundled file). Because the file defines which per-key dropdowns
exist, the setting is `requiresReload: true`, and the path is read (raw, pre-registration) before
`registerSettings()` so the dropdowns rebuild from the chosen file. Invalid/missing custom file →
falls back to the bundled default.

First-pass seed (grow over time):

```jsonc
{
  "aberration":  { "label": "Aberration",  "aliases": ["aberrations", "aberrant"] },
  "beast":       { "label": "Beast",        "aliases": ["beasts", "animal", "animals", "critter", "critters", "wildlife"] },
  "celestial":   { "label": "Celestial",    "aliases": ["celestials", "angel", "angels", "archon", "deva", "empyrean"] },
  "construct":   { "label": "Construct",    "aliases": ["constructs", "golem", "golems", "automaton", "automatons", "animated object", "animated objects"] },
  "dragon":      { "label": "Dragon",       "aliases": ["dragons", "wyrm", "wyrms", "drake", "drakes", "wyrmling", "wyrmlings", "dragonkin"] },
  "elemental":   { "label": "Elemental",    "aliases": ["elementals", "genie", "genies", "djinni", "efreeti", "elemental spirit"] },
  "fey":         { "label": "Fey",          "aliases": ["fae", "faerie", "faeries", "fairy", "fairies", "sprite", "sprites", "pixie"] },
  "fiend":       { "label": "Fiend",        "aliases": ["fiends", "demon", "demons", "devil", "devils", "yugoloth", "yugoloths", "daemon", "infernal"] },
  "giant":       { "label": "Giant",        "aliases": ["giants", "titan", "titans", "ogre", "ogres", "troll", "trolls", "jotun"] },
  "humanoid":    { "label": "Humanoid",     "aliases": ["humanoids", "people", "folk", "person", "mortal", "mortals"] },
  "monstrosity": { "label": "Monstrosity",  "aliases": ["monstrosities", "monster", "monsters"] },
  "ooze":        { "label": "Ooze",         "aliases": ["oozes", "slime", "slimes", "jelly", "jellies", "pudding", "blob", "blobs"] },
  "plant":       { "label": "Plant",        "aliases": ["plants", "fungus", "fungi", "flora", "shambling mound", "vegepygmy"] },
  "undead":      { "label": "Undead",       "aliases": ["undeads", "zombie", "zombies", "skeleton", "skeletons", "ghost", "ghosts", "ghoul", "ghouls", "vampire", "vampires", "lich", "liches", "wraith", "wraiths", "specter", "spectre", "wight", "wights", "revenant", "mummy", "mummies"] },

  "elf":         { "label": "Elves",        "aliases": ["elves", "elven", "drow", "eladrin", "half-elf", "half elf", "shadar-kai", "high elf", "wood elf", "sea elf"] },
  "dwarf":       { "label": "Dwarves",      "aliases": ["dwarves", "dwarven", "duergar", "hill dwarf", "mountain dwarf", "deep dwarf"] },
  "gnome":       { "label": "Gnomes",       "aliases": ["gnomes", "gnomish", "svirfneblin", "rock gnome", "forest gnome", "deep gnome"] },
  "goblinoid":   { "label": "Goblinoids",   "aliases": ["goblinoids", "goblin", "goblins", "hobgoblin", "hobgoblins", "bugbear", "bugbears", "kobold", "kobolds", "orc", "orcs", "orcish", "half-orc", "half orc"] }
}
```

Notes on the seed:
- `human`, `halfling`, `goliath` are deliberately **absent** — they don't match any key, so they fall
  through to the `humanoid` type table (the intended generic-humanoid result).
- `half-elf` → `elf` and `half-orc` → `goblinoid` route mixed-heritage creatures to the more
  distinctive name pool.
- `ogre`/`troll` are 5e `giant`-type creatures; aliasing them is harmless and helps if a token reports
  them as subtype/custom.

---

## Resolution algorithm

```
read details.type:
  type    = (type.value === 'custom') ? type.custom : type.value
  subtype = type.subtype   (free text; may be empty)

key(s) via alias JSON (normalized lookup):
  subKey  = canonicalize(subtype)
  typeKey = canonicalize(type)

table =
     assignedTable(subKey)   // game.tables.getName(setting) if dropdown != 'none'
  || assignedTable(typeKey)
  || game.tables.getName(tokenNameTable)   // existing global failover
  || (no rename)

// assignedTable(key): look up that key's setting value (a table NAME), then game.tables.getName(name).
// Table references are stored by NAME (see Decisions), consistent with tokenNameTable.

roll table → name → existing format/ignored/fuzzy logic (unchanged)
```

- Build an alias→key index from the JSON once (cache); settings lookups are direct map reads.
- Resolve safely for non-dnd5e systems / missing data: empty keys just fall through to global.

---

## Settings UX

- Add one RollTable dropdown per canonical key, **after** the existing token-renaming settings
  (`tokenNameFormat`, `ignoredTokens`, `fuzzyMatch`, `tokenNameTable`).
- Foundry has no collapsible setting groups; use the existing **design-system form styling** to
  group/label the block so it doesn't bury the rest of the options.
- Generate the dropdowns by looping the JSON keys (mirrors the "reusable compendium settings
  function" TODO) so adding a key later is a JSON edit only.
- Each dropdown defaults to `none` → that key cascades. The GM only sets the pools they care about.
- `tokenNameTable` keeps its current role as the **global fallback** (the failover).

---

## Integration points

- `scripts/settings.js` — register generated per-key settings after the token-renaming block; load
  the alias JSON; expose the key list.
- `scripts/manager-canvas.js` `_onCreateToken` (~314-359) — replace the single
  `tokenNameTable` lookup with the cascade resolver; keep format/ignored/fuzzy as-is.
- `resources/naming-taxonomy.json` — new alias/key source of truth.
- New resolver helper (e.g. `scripts/utility-token-naming.js`) — type/subtype read, canonicalize,
  cascade, table lookup; written so the table source can later be a compendium.

---

## Edge cases

- `type.value === 'custom'` → use `type.custom`.
- Subtype not in the key set (e.g. `tiefling`) → falls to the `type` table (`humanoid`), then global.
- Assigned table renamed/deleted → that rung is skipped; cascade continues (table looked up by name,
  same fragility as today's `tokenNameTable`).
- Swarm size is ignored for naming.
- Non-dnd5e or missing type data → straight to global fallback.

---

## Backward compatibility

Nothing changes until at least one per-key table is set. With all keys at `none`, the cascade always
lands on `tokenNameTable` — identical to today.

---

## Rollout phases

1. ~~**Data + resolver**~~ — **Done.** `resources/naming-taxonomy.json`, `scripts/utility-token-naming.js`
   (load/canonicalize/cascade), wired into `_onCreateToken` with the global table as fallback.
2. ~~**Settings UI**~~ — **Done.** Per-key dropdowns generated from the taxonomy under an H3
   "Names by Creature Type" header, after the existing token-renaming settings; each defaults to
   `none` (cascade). Taxonomy loaded in `blacksmith.js` early-ready before `registerSettings()`.
3. **Polish (TODO)** — cache invalidation on table create/delete (alias index is built once at load;
   the resolver re-checks `game.tables.getName` live, so new tables resolve, but the key/alias index
   only refreshes on reload); in-Foundry verification; grow alias coverage.
4. **Later (TODO)** — allow the table source to be a **compendium** of RollTables (no cascade change;
   switch to UUID refs there).

---

## Decisions (resolved)

- **JSON filename:** `resources/naming-taxonomy.json` (mirrors `flag-taxonomy.json`; avoids "schema"
  which connotes a validation schema).
- **Table references stored by name** — consistent with `tokenNameTable` and the name-keyed
  `getTableChoices()` dropdown. Rename-fragility matches today's behavior and degrades gracefully via
  the cascade. Revisit to UUIDs at the compendium phase (cross-pack refs need them).
- **Seed aliases:** first pass captured in the JSON above; grows over time.

## Still open

- None blocking. Alias coverage will expand with real-world use.
