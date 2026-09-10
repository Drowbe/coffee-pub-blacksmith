# Coffee Pub Blacksmith

**Audience:** everyone -- players, GMs, contributors, and developers building against the module.

Quality of life, gameplay frameworks, automation, and aesthetic improvements for D&D 5e on Foundry
VTT, and the API hub of the Coffee Pub suite: the other Coffee Pub modules declare Blacksmith as a
dependency and build on the surfaces documented here.

![Blacksmith in play: the menubar, roll requests, the calendar, status effects, pins, votes, and more](assets/product-overview.webp)

This page routes. Each section points at the document that answers the question rather than answering
it here.

## Playing or running a game with it

Start with [getting started](userguides/userguide-getting-started.md): what to install and what changes
on screen in the first five minutes. Then the guides, one per thing you would want to do, in the order
a session tends to meet them:

- [The Blacksmith bar](userguides/userguide-menubar.md): the party leader, movement modes, and the
  tools on the bar.
- [Rolls](userguides/userguide-rolls.md): requesting a roll, the roll window, quick rolls, and the
  roll builder.
- [Combat](userguides/userguide-combat.md): the combat bar, the tracker, initiative, and the dead.
- [Timers](userguides/userguide-timers.md): the session, planning, combat, and round timers.
- [Statistics](userguides/userguide-statistics.md): what gets counted, the MVP, and the stats windows.
- [Experience](userguides/userguide-xp.md): awarding XP when a combat ends.
- [The world clock](userguides/userguide-worldclock.md): the clock, the calendar, events, and resting.
- [Notes](userguides/userguide-notes.md): notes, reminders, and GM notes on sheets.
- [Pins](userguides/userguide-pins.md): pins on the canvas, layers, and tags.
- [Votes](userguides/userguide-votes.md): running a vote and reading the result.
- [Tokens](userguides/userguide-tokens.md): naming, dropped tokens, indicators, and blood.
- [Scenes](userguides/userguide-scenes.md): scene indicators, geography, and darkness.
- [Journals](userguides/userguide-journals.md): journal tools and the encounter toolbar.
- [Importing](userguides/userguide-import.md): bringing journals, items, actors, and tables in from
  JSON.
- [Appearance](userguides/userguide-appearance.md): themes, chat cards, the sidebar, and the CSS
  editor.

Two guides route by who you are rather than what you are doing:
[the player guide](userguides/userguide-player.md) says what a player sees and can do, and
[the GM guide](userguides/userguide-gm.md) walks a session in the order it runs.

## Building a module against Blacksmith

Start with [the Core API](api/api-core.md). It covers declaring the dependency, getting the API object,
the `init` and `ready` timing rules, registering your module, and a table routing every namespaced
surface -- pins, chat cards, campaign context, compendiums, effects, statistics, sockets, GM notes,
toasts, and tags -- to its own reference.

The sidebar lists every API document. The three most often needed after the core are
[the hook manager](api/api-hookmanager.md), [sockets](api/api-sockets.md), and
[the window base](api/api-window.md).

## Styling against Blacksmith

[Design tokens](designsystem/design-tokens.md) are the variables to build on;
[components](designsystem/design-components.md) and [patterns](designsystem/design-patterns.md) cover
what is already built, and [extending](designsystem/design-extending.md) covers adding to it.

## Working on Blacksmith itself

[The architecture map](architecture/architecture-blacksmith.md) is the entry point: bootstrap and
lifecycle, the performance-critical designs, and the traps that have caught people before. Each
subsystem then has its own architecture document, listed in the sidebar.

## Known issues

Defects that are real and unfixed are in [known issues](known-issues.md).
