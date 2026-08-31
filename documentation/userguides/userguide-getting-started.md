# Getting Started with Blacksmith

**Audience: players and GMs installing Coffee Pub Blacksmith for the first time.**

What Blacksmith needs, how to install it, and what changes on screen the moment it is enabled.

## What Blacksmith does

Blacksmith adds a toolbar across the top of your Foundry screen, restyles chat and the sidebar,
and brings a set of tools you reach without hunting through menus: a dice tray, party health at a
glance, status effects for the selected token, notes, and a macro launcher.

For a GM it adds more: combat and planning timers, session statistics, encounter tools, XP
awards, and journal tools.

It is also the foundation the rest of the Coffee Pub modules are built on. If you install any
other Coffee Pub module, it will ask for this one.

## Before you install

- **Foundry VTT version 13.** Version 14 is supported.
- **The D&D 5e system.** Blacksmith is built for 5e and does not work with other systems.
- **Two free library modules: socketlib and lib-wrapper.** Both are on Foundry's module list.
  Blacksmith will not run without them.

## Installing

Install the libraries first, then Blacksmith, then enable all of them together.

1. In Foundry, go to **Add-on Modules** and **Install Module**.
2. Search for and install **socketlib** and **lib-wrapper**.
3. Install Blacksmith by pasting this manifest URL:
   `https://github.com/Drowbe/coffee-pub-blacksmith/releases/latest/download/module.json`
4. Open your world, go to **Manage Modules**, and enable all three.

## What you will see straight away

**The Blacksmith bar** appears across the very top of the screen, above the rest of the Foundry
interface. It is where most of what you will use day to day lives.

Everyone gets these tools:

| Tool | What it does |
|---|---|
| Dice Tray | Roll dice without typing a chat command. |
| Health | The party's hit points at a glance. |
| Status Effects for the selected token | Apply and clear conditions on whatever token you have selected. |
| Notes | Your own notes, kept in the world. |
| Macro window | Your macros. Right-click it for your favourites. |
| Send a toast | Pop a short message on screen for other people. Available to the GM and the party leader. |

The GM gets additional tools on the same bar, including requesting a roll from the party and
starting combat.

**Chat and the sidebar look different.** Blacksmith restyles chat cards and the sidebar by
default. Both can be turned off.

**Scenes show indicators** marking which scene is active and which one players are viewing.

**Journals gain extra tools**, and double-clicking a journal opens it directly.

## Finding the settings

Everything is in Foundry's **Configure Settings** window, under **Coffee Pub Blacksmith**. The
settings are grouped into these areas, in this order:

| Area | What is in it |
|---|---|
| Getting Started | Which Coffee Pub modules you have. |
| Campaign Settings | Your campaign's name, rules version, geography, and party. |
| Imports | Bringing items and journals in from outside Foundry, and which compendiums to use. |
| User Experience | How Foundry looks: the canvas, pins, sidebars, chat cards, scenes, journals. |
| Run the Game | Vision, combat, statistics, tokens, and timers. |
| Notifications | What gets announced, and whether as a toast, in chat, both, or not at all. |
| Rolling and Progression | Roll tools, XP, and milestones. |
| Automation | Token configuration, dropped tokens, and encounters. |
| Developer Tools | Custom CSS and the debug log. |

Most settings are the GM's and apply to the whole world. A smaller number are yours alone -- the
ones controlling how things look on your own screen -- and players can change those even though
the rest are greyed out or hidden.

## Where to go next

Blacksmith does a lot, and none of it has to be set up before you play. Enable it, run a session,
and change what gets in your way.
