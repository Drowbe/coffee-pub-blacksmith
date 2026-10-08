# Prompt Catalogs for Declared Import Profiles Plan

**Status: Implemented (phase 1), pending Foundry verification.** Written 2026-10-08 from Artificer's request that
a recipe's prompt carry a catalog of real item names, as Area's does. Built as `promptCatalogs` for journal
profiles and documented in `api-importer.md`. Still open: Area adopting the same mechanism, and absorbing this
plan into `architecture-importer.md`, which is what ends it.

## Purpose

A declared journal profile's Prompt Template was the derived schema and nothing else. Area's prompt also embeds
**catalogs**: the names of real actors and items from the GM's compendiums and the world, so a generator
references content that exists instead of inventing it. Recipes need the same for ingredient and result names,
and a name the generator invents is a recipe that cannot be crafted.

Before this, the catalog was Area-only and hardcoded: `buildJournalPrompt` routes four literal keys to authored
prompt files, `applyAreaCatalogSections` substitutes `[ADD-COMPENDIUM-ITEMS-HERE]`, and the checkboxes carry
`showForTemplate: 'area'`.

## Decisions made (2026-10-08)

- **The source is Blacksmith's Compendium Mapping.** The author's ruling: Artificer's own ingredient compendium
  settings exist so Artificer can PROCESS things at craft time, not to CREATE them, and play no part in
  authoring. A declaration therefore cannot name a source, and Blacksmith reads no module's settings.
  A module that wants its bundled packs in the catalog has the GM map them in Blacksmith.
- **Names only, grouped the way Area groups them** (by compendium, then rarity). Grouping by a module's own
  flags was rejected: Artificer's `family` is derived in code (a flag, two legacy maps, then `Environmental`),
  so a declared "group by flag path" would label a plain Longsword `Environmental`.
- **No callback.** A function a module registers was rejected: this effort removed the callback contract on
  purpose (see the Librarian entry in `TODO.md`), and a callback is opaque to the mirror check.

## What was built

A first version invented a control of its own (a single "Available items" checkbox per profile, fed by a new
`query()` call). The author rejected it: the prompt window already has the pattern, and a declared profile must
reuse it. Corrected the same day. What exists now:

- `registry-declarations.js`: `promptCatalogs`, a closed list naming which of Area's catalogs a profile wants
  (`actors`, `items`), journal profiles only, anything else rejected by name.
- `registry-json-import-journals.js`: `getJournalPromptCheckboxes` scopes Area's existing compendium and world
  checkboxes to Area plus every declared profile that asked for that catalog, read each time the window opens.
  `buildDeclaredCatalogSections` builds the section from the same checkbox ids and the same list functions
  (`getCompendiumItemsList`, `getWorldItemsList`) Area uses, and saves the selection the same way.
- `manager-declarations.js`: `buildPromptSchemaText` renders `catalogSections`, staying synchronous so template
  and guide derivation keep running without Foundry.
- `window-json-import.js`: a checkbox group is shown for every template any member is shown for. It was taken
  from the first member alone, which hid a later member scoped to another profile.

## Not built, deliberately

- **Item and actor prompt routes.** They do not carry the author's checkbox answers to the builder, so a catalog
  there would show its checkboxes and never reach the text. Registration rejects `promptCatalogs` on them.
- **Area moving onto a declared catalog**, so Blacksmith is consumer zero. Area still builds its own prompt
  from `applyAreaCatalogSections`; the declared route calls the same list functions but is a second path.
- **The shared `queryImportCatalog` contract** (`utility-rolltable-import-lists.js`), which roll tables and
  actors use for filtered rows. The Area lists are older and name-by-rarity; unifying the two catalog systems
  is its own piece of work.
- **Verification by a generation run.** The only measure of a prompt is what a generator produces from it.
