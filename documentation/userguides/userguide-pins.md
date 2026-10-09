# Working with Pins

**Audience:** GMs and players using map pins in Coffee Pub Blacksmith.

How to place, select, move, copy, delete and manage pins on a scene, and what each person at the table is allowed to do.

## What a pin is

A pin is a marker on the map. Most pins open something when you double-click them, such as a journal page. Other Coffee Pub modules place their own pins too, and those behave the same way for selecting, moving and the right-click menu. Where a pin differs, this guide says so.

## Who can do what

| You want to | Who can |
|---|---|
| See a pin | Anyone allowed to see it. A GM can hide a pin from the players. |
| Select a pin and open its right-click menu | Anyone who can see it. |
| Move, configure or delete a pin | The GM, and a player who owns that pin. |
| Place a new pin | The GM. Players can too if the GM turns on **Player Pin Editing** in the module settings, under Pins. |
| Change who can edit a pin, or hide it from players | GM only. |

## Place a pin from a journal

1. Open a journal page. A pin bar appears at the top of it.
2. Choose **Pin Page** to pin that page, or **Pin Journal** to pin the whole journal.
3. Before placing, pick an icon from the row of icons, and use the three small buttons to set the placement mode, **Pin editing** and **Pin visibility**.
4. Place the pin on the scene.

A page pin opens that page when you double-click it. You can pin the same page more than once.

## Select a pin

Click a pin once. A white outline shows it is selected. Click another pin to move the selection, or click empty map, press Escape, or change scene to clear it.

A single click always selects. It is how the pin tool works and cannot be changed by another module.

## Move a pin

Press on a pin and drag it. Release to drop it. The pin stays selected afterward. Only the GM and the pin's owner can move it.

## Open a pin

Double-click it. What opens is up to the pin: a journal pin opens its page, and pins from other modules open their own windows.

## Keyboard shortcuts

These act on the selected pin. They are ignored while you are typing in any field, and while pins are hidden.

| Key | What it does | Who can |
|---|---|---|
| Delete or Backspace | Deletes the selected pin, exactly as **Delete Pin** in the right-click menu does. | The GM, or the pin's owner |
| Enter | Opens **Configure Pin** for the selected pin. | The GM, or the pin's owner |
| Escape | Clears the selection. | Anyone |
| Ctrl+C | Copies the selected pin. | Anyone, for pins that can be copied |
| Ctrl+V | Pastes the copied pin under the mouse. | Anyone allowed to place pins |
| Ctrl+Z | Brings back the last pin you deleted. | GM only |

On a Mac, use Cmd in place of Ctrl.

### Delete a pin, and bring it back

Select the pin and press Delete or Backspace. There is no confirmation, so if you press it by mistake, press Ctrl+Z within a minute. The pin comes back where it was, with the same settings, and is selected. Undo only works on the scene you deleted it from, and only for the most recent deletion. While no pin is waiting to be restored, Ctrl+Z does what it always did in Foundry.

If you delete with the key, a pin you are not allowed to delete is left alone and the key does nothing.

### Copy and paste a pin

Select a pin and press Ctrl+C, and you will see "Pin copied." Move the mouse to where the copy should go and press Ctrl+V. The copy appears under the mouse and is selected. Press Ctrl+V again for more copies.

Not every pin can be copied. Journal pins can. A pin whose creator has not allowed copies shows "This pin cannot be copied." Copying is last-one-wins, the same as in Foundry: if you press Ctrl+C on a token afterwards, Ctrl+V pastes the token and not the pin. The copied pin is forgotten when you reload.

Paste only works while the mouse is over the map.

## The right-click menu

Right-click a pin. The menu holds, in order:

- Anything the pin's own module adds at the top.
- **Bring Players Here**: pans every player's view to the pin and pings it.
- **Configure Pin**: opens the configuration window. Owners and the GM only.
- **Animate**: plays an animation on the pin for everyone. Choices are Ping, Pulse, Ripple, Flash, Glow, Bounce, three Scale sizes, Rotate and Shake.
- **Layer**: **Bring to Front**, **Bring Forward**, **Send Backward** and **Send to Back**, for when pins overlap. Owners and the GM only.
- **Pin visibility**: **Visible** or **Hidden**. GM only. A hidden pin is not drawn for players, though the GM still sees it dimmed.
- **Pin editing**: **GM only**, **Owner** or **Everyone**, which decides who may move, configure and delete the pin. GM only.
- **Delete Pin**: owners and the GM only.

## Configure a pin

Choose **Configure Pin** from the right-click menu, or select the pin and press Enter. The window has five tabs. Nothing you change is lost by moving between tabs, and **Save** applies all of them. A player who owns the pin sees only the last three.

**General** (GM only):

- **Name**: what the pin is called on the map. It is the pin's own label and applies to this pin only, never to the others when **Update All** is on. A pin made by another module, such as a codex or quest pin, is relabelled by that module when its entry changes, which replaces a name you typed.
- **Linked to**, for a pin that points at something such as a journal page or a note: its name, which opens it when you click. If what it pointed at has been deleted, this row says so instead.
- **Pin editing** and **Pin visibility**, as in the menu.
- **Allow Duplicates of this Pin on the Canvas**, which lets the same pin be placed more than once.

**Tags** (GM only): the tags used to group and hide pins.

**Image**: **Pin Source**, an icon or an image for the pin.

**Appearance**:

- **Pin Design**: **Size**, **Shape** (Circle, Square, Rectangle or None), **Background**, **Border**, **Icon Color** and **Drop shadow**.
- **Text Format**, the pin's text: **Text layout** (below, above, to the right, to the left, arcs above or below, or overlaid), **Text display** (Always, Hover, Never or GM only), **Text color**, **Text size**, **Max characters**, **Chars per line** and **Scale text with pin**.

**Animations**: for **Hover**, **Click**, **Double-click**, **Add (to canvas)** and **Delete**, the first column picks the animation and the second the sound. The Click animation plays when you select the pin.

## When what a pin points at is gone

If the journal page, note or other document a pin opens has been deleted, the GM and the pin's owners see a small broken-link symbol in the corner of the pin, and hovering it explains. Players do not see the symbol. Double-clicking such a pin tells you "What this pin points to no longer exists." and opens nothing. Open **Configure Pin** and look at **Linked to** on the General tab to confirm. To get rid of the pin, select it and press Delete.

For a journal pin the GM can repair it instead. Choose **Relink** beside the missing notice in **Configure Pin**, or right-click the pin and choose **Relink Pin**. It first asks where to look: **Compendiums**, **This World**, or **Compendiums, then World**. A list then shows the journal pages whose name matches what the pin was labelled, each marked Compendium or World with the reason it matched. Pick one and choose **Relink**, or drag a page from the sidebar onto the box, or paste its UUID. It must be the same kind of thing as before, so a page pin takes a page. A pin that pointed at a whole journal takes a page dropped on the box as that page's journal. If the box is refused, it keeps what you dropped and says why. Nothing is chosen for you, and the pin keeps its place and settings. If the new page is named differently from the pin's label, a journal pin asks whether to rename the pin to match, and keeps its label if you say no. Codex entry pins, quest pins and Merchant shop pins can be relinked too. They are searched in this world only, because what they point at lives in the world, so they skip the question. Objective pins and note pins cannot be relinked. The Pins section of the module settings has three options for this: **Relink: Where to Look**, **Relink: Ask Where to Look** and **Relink: Search Every Compendium**.

To repair many at once, open **Manage Pins** and choose **Repair Links** (GM only). It finds every pin on the scene whose document is gone and asks where to look, once. A list then shows each broken pin with a dropdown of matches, **Leave broken** by default. A match is filled in on its own only when exactly one candidate has the same ID or the same name. Nothing changes until you press **Apply**. A checkbox renames journal pins to match their new documents, once for all of them. In **Manage Pin Tags**, **Select** mode has **Relink Selected** for just the pins you ticked. A summary reports how many were relinked and any that failed. Broken pins of a kind that cannot be relinked are counted and left alone.

## Show, hide and find pins

Open the Pins tool on the Blacksmith bar (its tooltip reads "Open Pins"). Left-click opens the **Manage Pins** window; right-click gives a shortcut menu with **Manage Pins**, **Hide All Pins** and any saved profiles.

**Manage Pins** has two tabs:

- **Manage Pin Layers**: show or hide pins by category and by tag, and save the current view as a named profile you can load again. **All Pins** and **No Pins** are always available. **Dim hidden** keeps hidden pins on the map at reduced opacity instead of removing them.
- **Manage Pin Tags**: browse every pin on the scene by category or alphabetically, filter by name, category or tag, and use **Show hidden** to include pins that are currently hidden. The GM can switch on **Select** to edit the tags of many pins at once with **Bulk Edit Tags**, and can use **Manage Custom Pin Tags** and **Delete All** from here.

What you hide here is your own view. It does not change what other players see. To hide a pin from players, use **Pin visibility** on the pin itself.
