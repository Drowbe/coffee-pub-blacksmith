# Getting Started with Blacksmith

**Audience:** players and GMs installing Coffee Pub Blacksmith for the first time.

What Blacksmith needs, how to install it, and what changes on screen the moment it is enabled.

## What Blacksmith does

Blacksmith puts a bar across the top of your Foundry screen and fills it with the things a table
reaches for during a session: dice, the party's health, conditions, macros, notes, a party leader,
a movement mode, the in-world clock, and a session timer. During a fight the same bar becomes a
combat readout. It also restyles chat and the sidebar, adds indicators to scenes and tools to
journals, and is the foundation every other Coffee Pub module is built on, so any of them will ask
for it.

## Before you install

- **Foundry VTT version 13 or 14.**
- **The D&D 5e system.** Blacksmith is built for 5e and does not work with other systems.
- **Two free library modules: socketlib and lib-wrapper.** Both are on Foundry's module list, and
  Blacksmith will not run without them.

## Install it

Install the libraries first, then Blacksmith, then enable all three together.

1. In Foundry, go to **Add-on Modules** and **Install Module**.
2. Search for and install **socketlib** and **lib-wrapper**.
3. Install Blacksmith by pasting this manifest URL:
   `https://github.com/Drowbe/coffee-pub-blacksmith/releases/latest/download/module.json`
4. Open your world, go to **Manage Modules**, and enable all three.

## What you will see straight away

**The Blacksmith bar** runs across the very top of the screen, above the rest of the Foundry
interface. Left to right:

- On the left, a menu button, a compendium search button, a pins button, and then a row of icon
  tools: dice, health, macros, status effects, notes, and (for the GM and the party leader) send a
  toast.
- In the middle, an **Encounter** button that opens and closes the combat readout. Other Coffee Pub
  modules add their own labelled buttons here, so you may also see names such as Broadcast,
  Cartographer, Curator, Minstrel, or Librarian.
- On the right, the world clock's time, the party leader's name under a crown, the party's movement
  mode, and the session timer.

**During combat** a second row appears under the bar. It shows the round and turn, the party's
damage, accuracy, biggest hit, kills, and the leading MVP, along with the party's total health and
a portrait strip of every combatant. Between fights the same row shows the party's standing records
instead.

**Chat and the sidebar look different.** Blacksmith restyles chat cards and the sidebar. Both can
be turned off.

**Scenes show indicators** marking which scene is active and which one is being viewed.

**Journals gain a tools button**, and double-clicking a journal in the sidebar opens it.

## Find the settings

Everything is in Foundry's **Configure Settings** window under **Coffee Pub Blacksmith**. The
settings sit under nine top-level headings:

| Heading | What is under it |
|---|---|
| **Getting Started** | Which Coffee Pub modules you have installed. |
| **Campaign Settings** | The campaign's name, rules version, geography, and party. |
| **Imports** | Bringing items, journals, actors, and tables in from outside Foundry, and which compendiums Blacksmith searches. |
| **User Experience** | How Foundry looks: the canvas, pins, sidebars, notes, the bar's tools, the toolbar, scenes, chat cards, and journals. |
| **Run the Game** | Vision, combat, the combat bar, statistics, tokens, and timers. |
| **Notifications** | What gets announced, and whether as a toast, in chat, both, or not at all. |
| **Rolling and Progression** | Roll tools, XP, and milestones. |
| **Automation** | Token configuration, dropped tokens, movement, and encounters. |
| **Developer Tools** | Custom CSS, the bar's menu items, the performance monitor, latency, and the console log. |

Most settings are the GM's and apply to the whole world. A smaller number belong to each person,
such as which tools show on their bar and how a window looks, and players can change those even
when the rest are hidden from them.

## Where to go next

Nothing has to be set up before you play. Enable the module, run a session, and change what gets in
your way. When you want to do a particular thing:

- [The Blacksmith bar](userguide-menubar.md): the party leader, movement modes, and every tool on
  the bar.
- [Rolls](userguide-rolls.md): requesting a roll from the table and the roll window.
- [Combat](userguide-combat.md): the combat bar, the tracker, initiative, and the dead.
- [Timers](userguide-timers.md): the session, planning, combat, and round timers.
- [Statistics](userguide-statistics.md): what gets counted, the MVP, and the stats windows.
- [Experience](userguide-xp.md): awarding XP when a combat ends.
- [The world clock](userguide-worldclock.md): the clock, the calendar, events, and resting.
- [Notes](userguide-notes.md): notes, reminders, and GM notes on sheets.
- [Pins](userguide-pins.md): pins on the canvas, layers, and tags.
- [Votes](userguide-votes.md): running a vote and reading the result.
- [Tokens](userguide-tokens.md): naming, dropped tokens, indicators, and blood.
- [Scenes](userguide-scenes.md): scene indicators, geography, and darkness.
- [Journals](userguide-journals.md): journal tools and the encounter toolbar.
- [Importing](userguide-import.md): bringing content in from JSON.
- [Appearance](userguide-appearance.md): themes, chat cards, the sidebar, and custom CSS.
- [The player guide](userguide-player.md): what a player sees and can do.
- [The GM guide](userguide-gm.md): a session in the order it runs.
