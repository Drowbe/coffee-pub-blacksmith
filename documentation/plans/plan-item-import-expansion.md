# Plan: Item Import Expansion

Status: **Implemented through Feature/Spell profiles; physical-item hardening planned**

## Outcome

Turn the equipment-oriented flat item importer into a safe general dnd5e Item ingestion path, and let NPC
imports embed genuinely custom features, spells, and gear without requiring a pre-existing world or
compendium document. Preserve plain-name resolution as the convenient path for official content.

## Next phase — Harden existing physical-item schemas

Harden Weapon, Equipment, Tool, Consumable, Container, and Loot mappings against the current dnd5e schema.
Move them onto the explicit type maps and shared modern activity builders now used by Feature and Spell.

## Later — Remaining dnd5e Item types

Evaluate Race, Background, Class, Subclass, Backpack, and Facility individually. Advancement-bearing types
need dedicated schemas and verification; they must not be enabled merely by adding dropdown labels.
