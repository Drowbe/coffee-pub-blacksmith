# Token Naming — Architecture

**Audience:** Contributors to the Blacksmith codebase.

Token auto-renaming picks a name from a RollTable appropriate to the creature's **type** and **subtype**,
instead of one global table. The single global table remains as the failover, so behavior is unchanged
until a GM configures the new mapping.

**Files:**

| File | Role |
|---|---|
| `resources/naming-taxonomy.json` | **Single source of truth** — canonical keys, labels, `kind`, aliases |
| `scripts/utility-token-naming.js` | Resolver: type/subtype read, canonicalize, cascade, table lookup |
| `scripts/settings.js` | Generates one RollTable dropdown per canonical key from the taxonomy |
| `scripts/manager-canvas.js` (`_onCreateToken`) | Calls the resolver during the rename flow |
| `scripts/blacksmith.js` | Loads the taxonomy in early `ready`, **before** `registerSettings()` |

Do not enumerate the keys in this document — the taxonomy file is the source of truth and it grows. Read the file rather than hardcoding a key list here.

---

## 1. Design

**Explicit table-per-key + alias JSON + global fallback.**

- Each canonical key gets its own RollTable dropdown in settings, defaulting to `none`.
- The taxonomy JSON maps any incoming type/subtype spelling → a canonical key, **and** is the source of the
  key list itself — so settings are generated from it and no key list is hardcoded anywhere.
- Point several keys at the same table by selecting it in multiple dropdowns. Reuse is free.
- Table references are stored **by name** (see §6), consistent with the existing `tokenNameTable`.

`tokenNameFormat`, `ignoredTokens`, and `fuzzyMatch` are orthogonal — only the *name source* changes.

## 2. The cascade

Specific beats broad; stop at the first table that resolves:

1. **`subtype` field** → canonical key → assigned table *(structured data, strongest signal)*
2. **Specific name keyword** → canonical key → assigned table
3. **`type` field** → canonical key → assigned table *(the broad bucket, e.g. `humanoid`)*
4. **Global fallback** — the existing `tokenNameTable` setting
5. No table → no rename

**Rung 2 only matches *specific* keys.** Broad keys are skipped there so they can't beat a role or subtype
word in the name — that's what lets "Cultist", "Goblin Boss", and "Human Cultist" resolve correctly.

**Broad vs. specific is derived from the data, not from code.** Each key carries `"kind"`:

| `kind` | Tier |
|---|---|
| `type` | broad |
| `subtype`, `role` | specific |

Tiebreaks: the structured `subtype` field beats a role found in the name; within the name, the first
specific word wins (species usually leads — "Goblin Cultist" → goblinoid).

## 3. Resolution algorithm

```
read details.type:
  type    = (type.value === 'custom') ? type.custom : type.value
  subtype = type.subtype                     // free text; may be empty

canonicalize via the taxonomy (normalized: lowercase, trimmed):
  subKey      = canonicalize(subtype)
  specificKey = specific name keyword from the actor name (canonicalized)
  typeKey     = canonicalize(type)

table =  assignedTable(subKey)                  // 1. subtype field
      || assignedTable(specificKey)             // 2. specific name keyword
      || assignedTable(typeKey)                 // 3. type field
      || game.tables.getName(tokenNameTable)    // 4. global failover
      || (no rename)                            // 5.

roll table → name → existing format/ignored/fuzzy logic (unchanged)
```

`canonicalize()` matches the key itself **or** any alias, so `orc` / `Orcs` / `orcish` all resolve to the
same key. The alias→key index is built once and cached; settings lookups are direct map reads.

## 4. Why the subtype set is small

A subtype earns its own key only if its **name pool is genuinely distinct**. Everything else folds in via
aliases or rides the type-level table — e.g. `human`, `halfling`, and `goliath` deliberately have no key, so
they cascade to the `humanoid` table, which is the intended generic result. Mixed heritage routes to the
more distinctive pool (`half-elf` → elf).

## 5. GM-supplied taxonomy

A GM can point `namingTaxonomyJson` at their own file (path + browse button; defaults to the bundled one).

**Because the file defines which per-key dropdowns exist**, the setting is `requiresReload: true`, and the
path is read raw — before `registerSettings()` — so the dropdowns rebuild from the chosen file. An invalid
or missing custom file falls back to the bundled default.

## 6. Decisions and rationale

- **Filename** `naming-taxonomy.json` mirrors the other `*-taxonomy.json` files (`tag-taxonomy.json`,
  `pin-taxonomy.json`); "schema" was avoided because it connotes a validation schema.
- **Tables referenced by name**, not UUID — consistent with `tokenNameTable` and the name-keyed
  `getTableChoices()` dropdown. Rename-fragility matches today's behavior and degrades gracefully via the
  cascade. Revisit at the compendium phase, where cross-pack refs need UUIDs.
- **Rejected:** a single root-folder + first-word table-name convention (convention-fragile, silent
  failures, prefix collisions like Dragon/Dragonborn). **Rejected:** explicit per-subtype settings UI
  (can't enumerate open-ended subtypes).

## 7. Edge cases

- `type.value === 'custom'` → use `type.custom`.
- Subtype not in the key set (e.g. `tiefling`) → falls to the `type` table (`humanoid`), then global.
- Assigned table renamed or deleted → that rung is skipped; the cascade continues.
- Swarm size is ignored for naming.
- Non-dnd5e system or missing type data → straight to the global fallback.

## 8. Backward compatibility

Nothing changes until at least one per-key table is set. With all keys at `none`, the cascade always lands
on `tokenNameTable` — identical to the previous behavior.
