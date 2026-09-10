# Journals

**Audience:** GMs working with journals, and players who open them.

How to open a journal with a double-click, run an encounter straight from a journal page, and
repair the links in a journal or search and replace across the world.

## Open a journal with a double-click

Anyone. With **Enable Journal Double-Click** on, under **User Experience** and **Journal Tools**,
double-clicking a journal in the sidebar opens it.

## Run an encounter from a journal page

GM only. A journal page that carries encounter data -- a page brought in through
[import](userguide-import.md), or, with **Enable Content Scanning** on, one whose text lists its
monsters -- shows an encounter toolbar at the top when it is opened. **Enable Encounter Toolbar**,
under **Automation** and **Encounters**, turns the toolbar on.

The toolbar reads, left to right:

| Part | What it shows or does |
|---|---|
| **Party CR** and **Monster CR** | The challenge rating of the party on the canvas and of the page's monsters. With **Enable Real-time CR Updates** on, both follow tokens as they are added, moved, and removed. |
| **Encounter Difficulty** | **Trivial**, **Easy**, **Moderate**, **Hard**, **Deadly**, or **Impossible**, from the two ratings. |
| **DEPLOY** | Places every monster and NPC on the page: click the button, then click the canvas where they should go. Hold **Alt** to place them hidden. |
| One button per monster, with its portrait and CR | Places that one monster. Hold **Ctrl** to place several, **Alt** to place hidden. |
| The pattern button | Cycles the **Monster Deployment Pattern**: **Circle Formation**, **Line Formation**, **Scatter Positioning**, **Grid Positioning**, or **Sequential Positioning**. |
| The visibility button | Toggles **Deploy Hidden**, so what you place next arrives hidden or visible. |
| **CANVAS** | **Clear Tokens**, **Clear Monsters**, **Clear NPCs**, and **Reveal Hidden**, acting on the current scene. |

Each of those is also a setting under **Encounters**, so a pattern or the hidden default can be
set once rather than cycled every time.

## Repair a journal's links

GM only. Open a journal and choose **Journal Tools** from the controls menu in its header, or press
**Journal Tools** in the Blacksmith group of Foundry's scene controls. **Enable Journal Tools**
under **Journal Tools** puts the entry in the journal header.

The window's **Entity Migration** tab upgrades the links in a journal to point at your compendiums.
Choose the journal under **Journal Filter**, tick what to migrate under **Entities to Migrate**
(**Actors**, **Items**, and **World Macros**, which only work in journals once the macro exists in
the world), and decide under **Processing Settings** whether to search the world's own actors and
items **FIRST** or **LAST** before the compendiums. Press **Update Links**. The **Status** line
follows the pages as they are processed, and **Results** reports what was upgraded, fixed, or left
alone, with a button to copy the report. Processing can be stopped after the current page.

## Search and replace across the world

GM only. The **Search & Replace** tab of the same window finds text and file paths across your
documents and, if you ask it to, replaces them. Set the **Search Criteria**: the **Current Text**,
the **New Text**, **Case Sensitive**, and the **Match Mode** (**All Text**, **Filenames Only**, or
**Paths Only**). Choose the **Document Types** (**Journals**, **Actors**, **Items**, **Scenes**,
**Playlists**, and **Roll Tables**), a **Folder Filter** or **All Folders and Types**, and the
**Target Fields** (**Images**, **Text**, and **Audio**).

**Run Report** lists every match without changing anything; **Mass Replace** changes them all and
asks first, because it cannot be undone. Always back up your world before a mass change.
