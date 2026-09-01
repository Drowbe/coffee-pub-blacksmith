# Coffee Pub Blacksmith

![Latest Release](https://img.shields.io/github/v/release/Drowbe/coffee-pub-blacksmith)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/Drowbe/coffee-pub-blacksmith/release.yml?event=push)
![GitHub all releases](https://img.shields.io/github/downloads/Drowbe/coffee-pub-blacksmith/total)
![Foundry v13](https://img.shields.io/badge/foundry-v13-green)
![MIT License](https://img.shields.io/badge/license-MIT-blue)

## What it is

Blacksmith puts the things you reach for most on a bar across the top of your Foundry screen, times
your combats, keeps score, and restyles chat and the sidebar to match. It is also the foundation the
rest of the Coffee Pub modules are built on -- install any of them and they will ask for this one.

![Blacksmith in play: the menubar, roll requests, the calendar, status effects, pins, votes, and more](documentation/assets/product-overview.webp)

Blacksmith is built for a real weekly game and released for yours. It runs every session at my table,
which is the only reason it works as well as it does -- and that is also the shape of what is
promised. It is offered as-is, with no guarantee of stability, compatibility, or support, and things
do change between releases when a session shows they should. **Use at your own risk.** Bugs and
requests go in [Issues](https://github.com/Drowbe/coffee-pub-blacksmith/issues), and they get read.

## What it does

- **A toolbar across the top of the screen** -- dice tray, party health at a glance, status effects for
  the selected token, notes, and your macros, without hunting through menus.
- **Combat and planning timers** that stay in step across every client, with pause, resume, and
  auto-start when someone moves or attacks.
- **Combat statistics** -- hits, misses, damage, healing, kills, crits, and an MVP, per player and per
  session, with leaderboards and history.
- **A richer combat tracker** with drag-and-drop initiative, health bars, and portraits.
- **Movement modes** -- normal, none, combat, follow, and conga line, switched from the toolbar.
- **Themes, styled chat cards, and a styled sidebar**, shared by every Coffee Pub module so the whole
  suite looks like one thing.
- **Token and scene quality of life** -- smart renaming, nameplates, scene indicators, custom mouse
  behaviours, and a live latency readout for everyone at the table.
- **A live CSS editor** with syntax highlighting and search-and-replace, for changing how any of it
  looks without leaving Foundry.

## Requirements

- **FoundryVTT** v13 or v14. Version 12.1.23 was the last build for v12; everything since targets v13.
- **The D&D 5e system.** Blacksmith is built for 5e and does not work with other systems.
- **[socketlib](https://github.com/manuelVo/foundryvtt-socketlib)** and
  **[lib-wrapper](https://github.com/ruipin/fvtt-lib-wrapper)**, both free on Foundry's module list.
  Blacksmith will not run without them.

## Installation

1. In Foundry, go to **Add-on Modules** and **Install Module**.
2. Search for and install **socketlib** and **lib-wrapper**.
3. Install Blacksmith by pasting this manifest URL:
   `https://github.com/Drowbe/coffee-pub-blacksmith/releases/latest/download/module.json`
4. Open your world, go to **Manage Modules**, and enable all three.

## Where to read more

Everything lives in the [wiki](https://github.com/Drowbe/coffee-pub-blacksmith/wiki).

- **Playing or running a game with it** --
  [Getting started](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/userguide-getting-started).
- **Building a module against it** --
  [the Core API](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/api-core), which routes to every
  other surface.
- **Working on Blacksmith itself** --
  [the architecture map](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/architecture-blacksmith).

<!-- global:ai-assistance -->
## AI Assistance and the Illusion of Good Code

I started writing Foundry modules for use at my own table back in 2020. There were already a ton of amazing modules out there, but they either didn't quite do what I wanted or didn't deliver the kind of user experience I was looking for.

I've been a design leader for more than 20 years, but I spent the first half of my career as a developer, so building my own modules seemed like a fun way to kill some time. I'm a pretty good designer. I'm a decent developer. But, over time, my hand-written code and hacks got a little messy (and memory-leaky, and a little buggy. Feels good to say it out loud.).

Today, the Coffee Pub suite of modules is developed with AI assistance, primarily Claude and Cursor, for documentation, refactoring, debugging, and other development work. Every change is reviewed and committed by me, and nothing reaches a release that I haven't crawled and run at my own table. I can't seem to give up my IDE. The UX design, architecture, and ideas still come from my own fever dreams and chronic lack of sleep.

Testing and verifying a change means running it in Foundry so I can watch the console, break things, fix them, and hone the experience. The repositories carry a set of tools for testing the things that are difficult to catch through review and manual testing alone. They help ensure styles don't conflict, shared coding and documentation standards stay consistent, and the suite of modules continues to work well as a system without silently breaking.

Those checks are there because AI-assisted development can move very quickly, and without oversight, engagement, and planning, it can also go confidently off the rails and deliver the illusion of good code. The AI helps me build faster. It doesn't decide what gets built, its architecture, or how it should work. You can blame this human for that.

If the idea of AI-assisted development keeps you up at night or just isn't your jam, no worries at all. I get it. You do you.
<!-- /global:ai-assistance -->

## Coffee Pub Module Suite

Blacksmith is the foundation every other Coffee Pub module is built on. Each one is optional and
installed separately.

| Module | What it adds |
|---|---|
| [Artificer](https://github.com/Drowbe/coffee-pub-artificer) | A crafting, recipe, and blueprint system. |
| [Bibliosoph](https://github.com/Drowbe/coffee-pub-bibliosoph) | In-game player messaging backed by journals, plus injuries, quick encounter building, inspiration, and critical hit announcements. |
| [Cartographer](https://github.com/Drowbe/coffee-pub-cartographer) | Party strategic planning and sketching. |
| [Crier](https://github.com/Drowbe/coffee-pub-crier) | Combat turn announcements with turn cards, round announcements, and status tracking. |
| [Curator](https://github.com/Drowbe/coffee-pub-curator) | Image management: token replacement, portrait replacement, and tile and map placement. |
| [Herald](https://github.com/Drowbe/coffee-pub-herald) | Streaming and broadcast view. Designate a cameraman user for a clean, UI-free view that follows tokens. |
| [Librarian](https://github.com/Drowbe/coffee-pub-librarian) | A codex of people, places, factions and artifacts, and the quests running through them, linked to the canvas. |
| [Merchant](https://github.com/Drowbe/coffee-pub-merchant) | Shops and merchants: mark an actor as a merchant and let players browse and buy from their stock. |
| [Minstrel](https://github.com/Drowbe/coffee-pub-minstrel) | A music, environment, and one-shot manager. |
| [Monarch](https://github.com/Drowbe/coffee-pub-monarch) | Save and load sets of enabled modules. |
| [Regent](https://github.com/Drowbe/coffee-pub-regent) | Optional AI tools: Consult the Regent, plus lookup, character, assistant, encounter, and narrative worksheets. |
| [Scribe](https://github.com/Drowbe/coffee-pub-scribe) | Journal and chat card formatting for sharing snippets of narrative. |
| [Squire](https://github.com/Drowbe/coffee-pub-squire) | A character tray: abilities, items, spells and conditions, with party tools and item transfers. |
| [Vault](https://github.com/Drowbe/coffee-pub-vault) | Optional shared assets for the suite. |

## License

Licensed under the included LICENSE file.
