# Coffee Pub Regent

Optional AI tools for the Coffee Pub ecosystem. Provides "Consult the Regent" and worksheets (Lookup, Character, Assistant, Encounter, Narrative) using OpenAI.

**Requires:** Coffee Pub Blacksmith (and its dependencies). Install and enable Blacksmith first.

## Installation

1. Install **Coffee Pub Blacksmith** and enable it in your world.
2. Install Regent like any other Foundry module:
   - Place the `coffee-pub-regent` folder in your Foundry **Data/modules/** directory (sibling to `coffee-pub-blacksmith`).
   - Or install via manifest/package manager when available.
3. Enable **Coffee Pub Regent** in **Configure Settings → Module Settings**.

## Configuration

Configure your OpenAI API key and model in **Configure Settings → Module Settings → Coffee Pub Regent → Regent (AI)**. Without an API key, the Regent window will open but queries will fail until the key is set.

## Toolbar

When Regent is enabled, it registers six tools on the Blacksmith Utilities toolbar: Consult the Regent, Lookup, Character, Assistant, Encounter, Narrative. GM-only worksheets (Assistant, Encounter, Narrative) appear only for GMs.
