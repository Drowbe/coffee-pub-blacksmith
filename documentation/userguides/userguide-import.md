# Importing

**Audience:** GMs bringing journals, items, actors, and roll tables into Foundry from JSON.

How to open the Import window, get a template or a prompt to write against, check a file before
anything is written, import it, and re-import it later without making duplicates.

## Open the Import window

GM only. Each of Foundry's sidebar directories that Blacksmith can import into -- **Journals**,
**Items**, **Actors**, and **Roll Tables** -- carries an import button in its header. Press it to
open the window for that kind; the **Switch importer** drop-down at the top moves between kinds
without closing the window. Other Coffee Pub modules add their own kinds to the same drop-down.

The window has three parts: **Prompt**, for writing content with an outside tool; **JSON
template**, for writing it by hand; and **Import JSON**, where the file goes in.

## Get a template to write against

GM only. On **JSON template**, choose a template with **Select JSON Template** and press **Copy**,
or **Save As...** to keep it as a file. **Template Only** gives the bare shape; **Template +
Instructions** adds a guide to every field: what it means, what values it accepts, and which are
required. **Guided JSON template** is that guide on screen. The template is the authority on what
an import may contain; a field that is not in it is not imported.

## Get a prompt for an outside tool

GM only. On **Prompt**, choose a **Select Prompt Template** for the kind of content you want, fill
in the fields the template asks for (the narrative templates ask for a location, its image and its
title; the portrait and illustration templates ask for a subject, mood, and setting), add anything
you want under **Additional context**, and press **Copy**. What is copied is a complete prompt that
carries the template's rules and, where the template needs them, catalogues of the actors and items
in the compendiums you have ticked under **Libraries**, so the tool answers in a form the importer
accepts. Building a prompt with large catalogues can take a moment; a working overlay says so.

## Validate before you import

GM only. On **Import JSON**, paste the text into the box or press **Select JSON File**. Press
**Validate** first. Validation reads every entry against the template's rules and reports
**Valid**, **Valid with warnings**, or **Failed**, with the problems listed per entry and a
**Copy Issues** button. Nothing is written to the world by validating, however bad the file. That
is why the two steps are separate: a file can be fixed and validated again as often as you like
without leaving anything behind.

## Import

GM only. Press **Import**. The window works through the entries one at a time and reports
**Imported**, **Imported with warnings**, or **Failed**, with counts of processed, succeeded,
warnings, and failed, and a per-entry list. **Edit and Retry** reopens the text with the failed
entries so you can fix them and run just those again. The report can be copied.

## Where the import lands

GM only. An imported document goes into the **world** first: a journal page into the world journal
named under **Journal name** and **Journal folder**, an item into the Items directory, and so on.
Copying it into a compendium is a second, separate step, done with Foundry's own tools. This matters
when something looks missing: a picker that reads from a compendium will not show a page that is
sitting in the world, and the page is not lost.

## Re-import to update, not duplicate

GM only. Importing an entry that already exists in the world updates that document in place rather
than creating a second one. The fields the entry supplies are rewritten and the rest of the document
is preserved, including anything a subsystem or an editor wrote onto it that the template does not
carry. So the way to change an imported thing is to change the JSON and import it again.

## Settings

GM only. Under **Imports**:

| Setting | What it does |
|---|---|
| **Enhanced Image Guessing** (under **Item Imports**) | Picks an image for an imported item from its name and description when the entry names none. |
| **Narrative Folder**, **Default Narrative Image**, **Default Character Image** (under **Narrative Generator**) | Where new narrative journals go, and the images their cards use when the entry names none. |
| **Encounter Folder**, **Default Encounter Card Image**, **Custom Image** (under **Encounter Generator**) | The same for encounter journals. |
| **Compendium Mapping** | For each kind of document -- actors, items, spells, features, species, backgrounds, classes, journals, roll tables, scenes, and the rest -- the compendiums Blacksmith searches, in priority order. **Priority Slots** says how many, and takes effect after a reload. Imports and the prompts' catalogues both read from here. |
| **Asset Mapping** | The files that supply the suite's shared sounds, images, icons, and nameplates. Each defaults to what ships with the module; clear a field to use only the built-in set, or point it at your own. |
