# Pins

**Audience:** GMs marking up a scene, and players reading and, where allowed, placing pins.

How to put a pin on the canvas, open what it points at, move it and change how it looks, decide who
can see and edit it, and manage every pin on a scene by layer and tag.

A pin is a marker on the canvas that points at something: a journal page, a note, or whatever
another Coffee Pub module puts there. Librarian's codex and quest pins, for instance, are pins like
these.

## Place a pin

The GM; a player when **Player Pin Editing** is on under **User Experience** and **Pins**. Pins are
placed from the thing they point at:

- **A journal page.** Open the journal and press **Pin this page** on its toolbar. The toolbar
  lets you choose the pin's icon from a set (**Book** is the default, or the page's first image),
  set **Placement** to **Single** or **Multiple** (whether the page may be pinned more than once),
  and set the new pin's visibility and who may edit it. Then click the map where the pin should
  go. Pinning the journal itself, rather than one page, opens it as the sidebar would, at its first
  page.
- **A note.** Press **Place on the map** in the Notes window or the note editor, then click the
  map. See [the notes guide](userguide-notes.md).

Escape cancels a placement.

## Open, move, and act on a pin

Anyone who can see the pin. **Left-click** a pin to open what it points at; a journal you cannot
read tells you so. If you may edit the pin, **drag** it to move it; a journal pin asks "Move journal
pin?" first. **Right-click** for the pin's menu:

| Entry | Who | What it does |
|---|---|---|
| **Configure Pin** | Whoever may edit it | Opens the window described below. |
| **Bring to Front**, **Bring Forward**, **Send Backward**, **Send to Back** | Whoever may edit it | Changes which pin sits on top where they overlap. |
| **Pin visibility** | GM | **Visible** or **Hidden**. A hidden pin is seen by the GM only. |
| **Pin editing** | GM | **GM only**, **Owner**, or **Everyone**: who may move, configure, and delete it. |
| **Bring Players Here** | GM | Pans every player's view to the pin. |
| **Delete Pin** | Whoever may edit it | Removes the pin; the journal page or note it pointed at is untouched. |

A hidden pin and a locked pin each show a small badge so the GM can tell at a glance.

## Change how a pin looks and behaves

Whoever may edit the pin. **Configure Pin** opens a window of sections:

| Section | What it sets |
|---|---|
| **Icon** | A **Suggested** icon for the pin's kind, or any **Other** icon, and its **Icon Color**. |
| **Image** | A picture instead of an icon, with **Image Fit** (**Cover**, **Contain**, **Fill**, **Scale Down**, **Actual Size**, or **Zoom**). |
| Text | **Text display** (**Always**, **Hover**, **Never**, or **GM only**), **Text layout** (above, below, left, right, overlay, or an arc above or below), **Text size**, **Text color**, **Chars per line**, **Max characters**, and **Scale text with pin**. |
| **Shape** | **None**, **Circle**, **Square**, or **Rectangle**, with **Size**, **Background**, **Border**, and **Drop shadow**. |
| **Click**, **Hover**, **Delete** | An animation for each: **Ping**, **Pulse**, **Ripple**, **Flash**, **Glow**, **Bounce**, **Scale**, **Rotate**, or **Shake** on click and hover, and **Fade**, **Dissolve**, or a shrink on delete. |
| **Zoom level** | How large the pin draws as the canvas zooms. |
| **Tags** | Tags for filtering, from the taxonomy or your own. |
| **Pin visibility** and **Pin editing** | The same two choices as the right-click menu. |

Two boxes at the bottom reach past this one pin. **Use as Default** saves the checked sections as
your own default for every new pin of this type, and **Update All Matching Pins** applies the
checked sections to every pin of the same type on this scene. Neither touches other people's
defaults.

## Manage every pin on the scene

Anyone for looking and for their own view; the GM for changes. The pins button at the left of the
Blacksmith bar opens **Manage Pins** for the current scene. It lists every pin grouped by category
under **Global**, **System**, and **Custom**, with a **Filter pins by name, category, or tag...**
field and, on each row, **Pan to pin**, **Configure pin**, and **Delete pin**.

What you see on the canvas is yours to choose and does not affect anyone else:

- **Hide** and show a whole category or a single tag, **Hide All** and **Show All** for the lot.
- **Dim Hidden** draws hidden pins faintly instead of removing them, and **Hide Unused** drops
  empty categories from the list.
- The profile drop-down keeps a set of choices: **All Pins** and **No Pins** are built in, and
  **New Pin Visibility Profile** saves the current filters under a name to return to later.

The GM's controls change the scene for everyone: **Manage Custom Pin Tags** to add tags, rename a
tag everywhere it is used, strip it from this scene or from all scenes, or delete it globally; a
select mode with **Bulk Edit Pin Tags** to retag many pins at once; **Delete All** for every pin on
the scene, and a per-category delete, each asking first.

## Pins on other people's screens

The GM decides. A pin's **Pin visibility** decides whether players see it at all, and its **Pin
editing** decides who may change it: **GM only**, its **Owner**, or **Everyone**. **Player Pin
Editing** in settings is the master switch for whether players may create pins in the first place;
it does not stop a player editing a pin they already own.
