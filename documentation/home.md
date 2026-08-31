# Coffee Pub Blacksmith

**Audience: everyone -- players, GMs, contributors, and developers building against the module.**

Quality of life, gameplay frameworks, automation, and aesthetic improvements for D&D 5e on Foundry
VTT, and the API hub of the Coffee Pub suite: the other Coffee Pub modules declare Blacksmith as a
dependency and build on the surfaces documented here.

This page routes. Each section points at the document that answers the question rather than answering
it here.

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
