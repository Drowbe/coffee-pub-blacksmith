# Coffee Pub Regent

Optional AI tools for the Coffee Pub ecosystem. Provides "Consult the Regent" and worksheets (Lookup, Character, Assistant, Encounter, Narrative) using OpenAI.

**Requires:** Coffee Pub Blacksmith (and its dependencies).

## Installation

1. Install **Coffee Pub Blacksmith** first.
2. Create a symlink or copy so Foundry can load Regent:
   - **Development (symlink):** In `Data/modules/`, create a symlink named `coffee-pub-regent` pointing to `coffee-pub-blacksmith/coffee-pub-regent`.
   - **Standalone:** Copy the `coffee-pub-regent` folder to `Data/modules/coffee-pub-regent`.
3. Enable **Coffee Pub Regent** in the game's module settings.

## Configuration

Configure your OpenAI API key and model in **Configure Settings → Module Settings → Regent (AI)**. Without an API key, the Regent window will open but queries will fail until the key is set.

## Toolbar

When Regent is enabled, it registers six tools on the Blacksmith Utilities toolbar (if you use Blacksmith's toolbar): Consult the Regent, Lookup, Character, Assistant, Encounter, Narrative. GM-only worksheets (Assistant, Encounter, Narrative) appear only for GMs.
