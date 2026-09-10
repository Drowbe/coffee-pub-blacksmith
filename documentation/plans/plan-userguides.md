# Plan: Blacksmith's user guides

**Status: In progress -- the guide list is settled and the first drafts are written from source; none
has been walked in a running world.** Live scaffolding, opened 2026-09-10 when the author lifted the
2026-08-31 deferral ("write Blacksmith's user guides AFTER the satellites migrate") and asked to take them
on.

**On completion:** the guides are the deliverable and live in `userguides/`; the per-guide unwalked
claims are `TODO.md` entries and are deleted as each guide is walked; the shipped history goes to
`CHANGELOG.md`; and this file is deleted. It is not an archive.

Internal only. Do not add to the `PUBLISH` list in `tools/wiki-sync.mjs`.

---

## What a user guide is, in one paragraph

The rules are in `global/global-documentation-standard.md`, section "User guides", and they bind every
file this plan produces. The short form: a guide says how to USE the thing, not what the thing is;
every section is a verb; every section says who can do it (GM only, any player, the token's owner);
labels are quoted from the screen, taken from `lang/en.json`, never invented and never edited; no class
names, file paths, method names or code; no design rationale; one clause for a sibling-module dependency
and no more; and the uniform header. The earlier `userguide-getting-started.md` failed the first rule --
it was an inventory of the interface written from source -- and is replaced under this plan, not
extended.

## The bar: complete coverage

The standard's test is not a file count. It is: name every feature a user would name, and point at the
guide that covers it. The list below was built from the module itself -- the menubar tools registered
at startup, the toolbar tools, every window, and the settings tree (`scripts/settings.js`, 106 headings
in nine top-level groups) -- not from the architecture folder, which is organised by subsystem and
says nothing about what a person does.

### Features a user would name, and the guide that covers each

| What a user would call it | Where they meet it | Guide |
|---|---|---|
| The Blacksmith bar | Across the top of the screen | `userguide-menubar.md` |
| Party leader | The bar, right side; votes | `userguide-menubar.md`, `userguide-votes.md` |
| Movement modes (normal, none, combat, follow, conga) | The bar, right side | `userguide-menubar.md` |
| Session timer | The bar, right side | `userguide-timers.md` |
| Dice tray | The bar | `userguide-menubar.md` |
| Health window | The bar | `userguide-menubar.md` |
| Status effects window | The bar | `userguide-menubar.md` |
| Macros window | The bar | `userguide-menubar.md` |
| Send a toast | The bar; GM and leader | `userguide-menubar.md` |
| Compendium search | The bar and the toolbar | `userguide-menubar.md` |
| Refresh, settings, the start menu | The bar, left side | `userguide-menubar.md` |
| Detaching a tool window | Any tool window's header | `userguide-menubar.md` |
| Request a roll, the roll window, quick rolls, favourites, the roll builder, contested rolls | Toolbar and the bar; chat cards | `userguide-rolls.md` |
| Combat bar (portraits, readouts, the action buttons) | The bar during combat | `userguide-combat.md` |
| Combat tracker (drag initiative, health bars, portraits, roll remaining) | The sidebar's combat tab | `userguide-combat.md` |
| Defeated creatures, hide and skip the dead | Combat | `userguide-combat.md` |
| Planning, combat and round timers, hurry up | Combat | `userguide-timers.md` |
| Combat statistics, MVP, leaderboards, player and party stats windows, sharing | Chat cards and windows | `userguide-statistics.md` |
| XP awards and milestones | End of combat, XP window | `userguide-xp.md` |
| World clock, calendar, calendar events, time modes | The bar and the calendar window | `userguide-worldclock.md` |
| Resting (short and long, grouped, interruptible) | Rest window, chat cards | `userguide-worldclock.md` |
| Notes, the note editor, note reminders | Notes window | `userguide-notes.md` |
| GM notes on items and actors | Sheets | `userguide-notes.md` |
| Pins, pin layers, pin configuration, journal pins | The canvas | `userguide-pins.md` |
| Votes (leader, yes/no, end time, party plan, character, custom) | Toolbar | `userguide-votes.md` |
| Token renaming, names by creature type, nameplates | Dropping a token | `userguide-tokens.md` |
| Dropped tokens, rotation, movement sounds, overrides | Dropping and moving tokens | `userguide-tokens.md` |
| Turn, target and health indicators; token blood; clear and restore blood | The canvas | `userguide-tokens.md` |
| Clear all targets | Foundry's token toolbar | `userguide-tokens.md` |
| Scene indicators, scene configuration additions, scene geography, darkness | Scenes | `userguide-scenes.md` |
| Journal tools, double-click to open, the encounter toolbar and encounter difficulty | Journals | `userguide-journals.md` |
| JSON import: validate, import, templates, prompts, re-import | Import window | `userguide-import.md` |
| Themes, chat cards, the sidebar styling, the CSS editor and custom CSS | Everywhere | `userguide-appearance.md` |
| Campaign settings, the party, geography, rules version | Settings | `userguide-gm.md` |
| Notifications: toast, chat, both or none, per feature | Settings | `userguide-gm.md` (and `userguide-settings.md`, held) |
| Latency readout, performance monitor | The bar | `userguide-menubar.md` |
| Every setting by name | Settings | `userguide-settings.md`, held (see below) |

Plus the three audience guides the standard always requires: `userguide-getting-started.md` (the first
five minutes, rewritten), `userguide-player.md` (what a player sees and can do, and cannot), and
`userguide-gm.md` (the GM's workflows in the order a session runs, with the JSON import section that
`TODO-GLOBAL` recorded it owes).

**Eighteen files, seventeen written under this plan and one held.** That is a lot, and the standard is
explicit that it should be: "a module with six features has six of these, or a very good reason", and
this module has more than six. Where two features share a guide above (leader and movement modes on the
bar; rest and the clock; GM notes and notes; the encounter toolbar and journal tools) it is because a
user meets them in the same place and would look for them together, not because the guide was getting
long. Split any of them the moment its getting-long symptom appears.

### What is deliberately NOT here

- **Sibling modules' tools on the bar.** The product screenshot shows Encounter, Broadcast, Cartographer,
  Curator, Minstrel and Librarian buttons on the bar. Those are the siblings' registrations, and each
  gets one clause in the menubar guide ("other Coffee Pub modules add their own buttons here") and no
  more, per rule 6.
- **The API and the design system.** A user guide reader does not build against the module.
- **Why anything works the way it does.** Rationale is architecture.

## `userguide-settings.md` stays held

The author deferred it 2026-08-31 because a guide to controls about to change reads as authoritative
and is waste. The settings tree today is nine workflow groups (the same nine the getting-started guide
lists), which is the shape that rework produced, but nothing in `TODO.md` or the CHANGELOG says the
rework is finished. The guide is held until the author says the settings are stable. The GM guide and
the feature guides name the settings a task needs, by on-screen label, which is what a reader at the
table actually wants; the settings guide is the exhaustive reference and can come last without anyone
being stranded.

## Method: source-derived drafts, walked later, unverified claims recorded per guide

None of this can be walked here: there is no running Foundry in this environment and no way to take a
screenshot. The standard anticipates exactly this ("err toward coverage, not toward certainty") and
gives the discipline: write the coverage, and record what is unwalked in `TODO.md` **per guide, not as
one blanket line**, naming the guide most likely to be wrong. That is usually the player guide, because
its claims are read off permission checks rather than seen from a player's client.

Each guide is drafted from four sources, in this order of authority:

1. **`lang/en.json`**, for every label and hint. Settings names and hints are keyed
   `coffee-pub-blacksmith.<key>-Label` and `-Hint`; window titles and button text are elsewhere in the
   same file or in the templates under `templates/`. A guide quotes these and never paraphrases a label.
2. **The templates** (`templates/*.hbs`), for what is actually on screen in a window: which buttons
   exist, what they are called, what order they render in. Source declares things; the template is
   what the user sees.
3. **The scripts**, for what a control does, who may use it (the `game.user.isGM` checks, the
   `gmOnly` and `leaderOnly` flags, the ownership tests), and what happens afterwards.
4. **The architecture and API documents**, read last and trusted least. Most were substantially
   wrong when checked; `TODO-GLOBAL` keeps the verification table.

Two claims are always recorded as unwalked because source cannot settle them: **the order things
appear in on screen**, and **what a player's client shows**. Anything else the writer could not
confirm from the template or the script is recorded too, specifically, not as "this guide is a draft".

## Screenshots

None are added under this plan; there is nothing to capture them from. The one asset that exists,
`assets/product-overview.webp`, is used by the README and `home.md` and is not reused inside a guide
(rule 5: a reader who sees one thing in a capture and another on screen believes the capture).

Two things about that image for the author, since the standard says to check the frame: the caption
under the portrait window reads as a person's name rather than a character's, and the toast recipient
list and marching-order panel carry every name at the table. If any of those are real people, the
image is republished with a scratch world or not at all. This plan does not touch it.

## Order of writing

Shallowest and most-read first, reference last, which is also the sidebar order the publisher renders:

1. `userguide-getting-started.md`, rewritten: the first five minutes only. Its table of tools is
   corrected against the product screenshot (the bar's labelled buttons belong to sibling modules; the
   combat readout row was missing).
2. The feature guides, in the order `home.md` lists them, which is the order the publisher reads.
3. `userguide-player.md` and `userguide-gm.md`, written last because they route into the feature
   guides rather than repeat them.
4. `userguide-settings.md`, when the hold is lifted.

`home.md` gains a "Playing or running a game with it" section listing the guides in reading order,
because `tools/wiki-sync.mjs` takes the feature guides' sidebar order from the links in `home.md` and
falls back to alphabetical otherwise. The README's "Where to read more" keeps its single link to
getting started; the getting-started guide routes onward.

## The importer section, so it is not lost again

`TODO.md` ("The importer is absent from the README and from every user guide") and `TODO-GLOBAL` both
record what the import guide owes, gathered while the importer was rebuilt: that Validate and Import are
separate steps and why; what a template and a prompt are each for; that a re-import UPDATES rather than
duplicates; and that a page lands in the WORLD first and the compendium second, which cost a sibling
real confusion because the picker reads the compendium. `userguide-import.md` carries all four, the GM
guide carries a short section pointing at it, and the README bullet is the author's to add in his own
voice.

## Verification

Per guide, the test the standard sets: a reader who has installed the module finishes the section able
to do the thing. Concretely, before a guide's `TODO.md` entry is deleted, someone has walked it in a
live world with two clients where the guide makes a claim about what a player sees, and every label in
it has been read against the screen. `node tools/check-docs-structure.mjs` passes throughout; it
reports the guide-to-architecture ratio as a prompt, not a target, and the coverage table above is the
real check.
