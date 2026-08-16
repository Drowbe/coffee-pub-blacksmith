# Plan: the window framework should own the frame

**Status: Planned.** Nothing implemented. Opened 2026-08-16.

Blacksmith's window API today provides a **zone contract** and base classes; the consumer owns the markup.
`api-window.md:24` states it plainly: *"Blacksmith does not inject content into your template; it only
provides the zone contract."* This plan proposes reversing that for everything except the body: Blacksmith
owns the header, footer, action bar, section chrome and window styling, and a consumer supplies content.

That is the same verdict `plan-chat-cards.md:81` reached about cards, which cited the Window API as the
model **not** to copy. Cards proved the opposite arrangement works. This extends it.

## Why this is critical rather than tidy

**We are building on it.** Every window shipped against the current contract is another copy of the frame
to migrate later, and the suite is adding windows faster than it is consolidating them.

**The failure mode is silent and cross-module.** On 2026-08-16 the roll window began rendering Regent's
markup instead of its own. `Handlebars.partials` is one global namespace, registration is last-one-wins,
Blacksmith registered `partial-unified-header` -- a name with nothing in it saying whose it is -- and Regent
registers the same name from a forked copy. Both `await` a fetch, so the winner was a race. Symptoms: a
portrait filling the window, a name shrunk to nothing, a die where a face should be; nothing logged, and it
changed between loads with no edit to either file. Blacksmith's side is fixed (`blacksmith-unified-header`),
but the conditions that produced it are untouched.

**The reachable thing was the wrong thing.** Regent forked `unified-header.hbs` -- a second header system
used by two Blacksmith windows and not part of the frame -- rather than `window-template.hbs`, which is the
frame. It is named "unified header" and it was globally reachable as a partial. Nothing about the real frame
was more discoverable. Given that, forking was rational.

## The evidence, gathered 2026-08-16

**Of 15 `BlacksmithWindowBaseV2` subclasses in Blacksmith, 4 render `window-template.hbs`.** The other
eleven bring their own template: `manager-journal-tools.js`, `manager-rolls.js`, `manager-xp.js`,
`window-gmtools.js`, `window-pin-configuration.js`, `window-skillcheck.js`, `window-stats-party.js`,
`window-stats-player.js`, `window-status-effects.js`, `window-tool-base.js`, `window-vote-config.js`.

The base class supplies behaviour, not markup -- its own header says "subclasses set PARTS, getData(),
ROOT_CLASS". `ROOT_CLASS` defaults to `blacksmith-window-template-root`, so the stylesheet assumes the
frame's structure while nothing produces it.

**Two header systems exist.** `window-template.hbs` has one (`blacksmith-window-template-header-*`);
`unified-header.hbs` has another (`cpb-dialog-header-*`), used only by the roll window and the skill check
dialog, and it is the one that leaked into another module.

**The button vocabulary is in the same state**: `blacksmith-window-btn-*` is defined once and used by 3 of
15 windows. Everything else invents its own, and two of those inventions were found unstyled entirely
(`btn-secondary` in the pin config; the whole Tags widget's stylesheet loaded by nothing).

## Sequence

Each step is a gate for the next. Do not skip to the last.

1. **Migrate Blacksmith's own eleven onto `window-template.hbs`.** This is the honest test of whether the
   frame is sufficient, and it is the same gate the card migration used: delete the window's own template,
   and if the window cannot be rebuilt, the frame is missing something -- add it to the frame rather than
   letting the window keep a template. Record what each window would lose.
2. **Retire `unified-header.hbs`.** Once the roll window and skill check dialog use the frame's header, it
   has no callers and the collision surface is gone rather than renamed around.
3. **Standardise sections.** Section chrome is currently per-window; it should be part of the frame.
4. **Revise the contract in `api-window.md`.** The "does not inject content" sentence becomes the opposite
   for everything but the body. Only after 1-3, or we publish a promise we have not tested.
5. **Parts for window content.** Same shape as chat cards, and last on purpose: a parts library for bodies
   is only worth building once the frame around it is settled. Cards worked because the frame was never in
   question; here the frame IS the question.

## Every module gets audited

This is not Blacksmith-only work -- the point is a frame the suite uses, so the suite's windows decide
whether it is sufficient. Audit each for: windows implemented, whether they use the frame or their own
markup, forked copies of Blacksmith templates, and locally invented button/section classes.

**Minstrel and Artificer are the most complex by a wide margin** and should be surveyed FIRST rather than
last, because they are the ones most likely to need something the frame does not have. A frame validated
only against simple windows will fail on them after everything else has migrated to it.

Also known to matter:

- **Regent** -- forked `partial-unified-header.hbs`, the fork that caused the collision above. Its query
  window is the largest single consumer surface.
- **Squire** -- its `ACTION_HANDLERS` singleton lookups are already tracked in `TODO-GLOBAL.md`; the same
  audit should confirm whether its windows use the frame.

## What this plan is not

It is not a rewrite of Application V2 handling, and it does not touch the registry (`registerWindow` /
`openWindow`), which works and is unrelated. It is about who owns the markup around the content.
