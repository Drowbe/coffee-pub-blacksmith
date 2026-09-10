# The Blacksmith Bar

**Audience:** players and GMs using the bar across the top of the screen.

How to work the bar: choose a party leader, change how the party moves, and use the tools that sit on
it -- dice, health, conditions, macros, notes, toasts, and compendium search.

## Find your way around the bar

Anyone. The bar runs across the very top of the screen, above Foundry's own interface, and has three
parts:

- **The left side** holds a menu button, a compendium search button, a pins button, and a row of
  icon-only tools: dice, health, macros, status effects, notes, and, for the GM and the party leader,
  send a toast. Hover any of them for its name.
- **The middle** holds labelled buttons. Blacksmith's own are **Encounter**, which opens and closes
  the combat readout under the bar, and, for the GM, **Create** and **Tracker**. Other Coffee Pub
  modules add their own buttons here. When the middle runs out of room a **More tools** button
  collects the rest.
- **The right side** reads, left to right: the world clock, the party leader under a crown, the
  party's movement mode, and the session timer. Players can read all four; the GM can click them.

A strip between the middle and the right carries short notices from Blacksmith when something wants
your attention, each with a close button.

The clock is covered in [the world clock guide](userguide-worldclock.md), the session timer in
[the timers guide](userguide-timers.md), and the combat readout in [the combat guide](userguide-combat.md).

## Choose the party leader

GM only. Click the crown. The menu lists every player-owned character as **Character (Player)**, with
a crown beside the current leader, and offers:

| Entry | What it does |
|---|---|
| **Start a Vote** | Opens the Start a Vote window. See [the votes guide](userguide-votes.md). |
| **Vote for Leader** | Starts a leader vote straight away, letting the players choose. |
| **None** | Clears the leader. |
| A character | Makes that character, and the player who owns them, the leader. |

Opening the menu without a pointer, from the keyboard, gives a **Set Party Leader** dialog with a
drop-down of the same characters instead.

Setting a leader plays a sound and announces the change. The **Leader Changes** setting under
**Notifications** decides whether that is a toast on every screen, a chat card, both, or neither;
the new leader gets their own version of the toast. The leader's name appears on everyone's bar.

## What the party leader can do

The player whose character is the leader. The leader's crown is live on their bar where it is a
readout for everyone else. Clicking it offers **Start a Vote**. The leader also gets the **Start
Vote** button in the Blacksmith toolbar, can fire any toast the GM has shared with them (see "Send a
toast" below), and moves freely when the party is in Conga or Fastest Path mode while everyone else
follows.

## Change how the party moves

GM only to change; everyone can see the current mode on the bar and gets a toast when it changes.
Click the movement readout and choose a mode:

| Mode | What a player can do |
|---|---|
| **Wander** | Move their tokens freely. |
| **Locked** | Nothing. Every move is refused with "Token movement is currently disabled." |
| **Combat** | Move only during their own turn in a started combat. Outside combat, or on someone else's turn, the move is refused and says why. |
| **Conga** | The leader moves freely and the rest of the party follows the leader's exact path, in marching order. A player moving anyone but the leader is refused. |
| **Fastest Path** | As Conga, but followers take the shortest route to their place in line rather than retracing the leader's steps. |
| **Request** | A player's move opens a **Request move** dialog. **Request Move** sends it to the GM, who is asked to allow it; the token moves only when the GM says yes. With no GM connected the request cannot be sent. |

The GM's own tokens are never restricted. Below the modes, **Token Spacing** sets how many grid
squares (**0**, **1**, or **2 Grid Units**) followers keep between one another in Conga and Fastest
Path. Those two modes need a leader with a token on the scene; without one the bar warns you.

When a combat starts the mode switches to Combat on its own, and when the combat ends it returns to
whatever it was before. In Conga and Fastest Path a marching order is posted to chat when it is
worked out, unless **Show Marching Order in Chat** under **Notifications** is off. **Movement
Changes**, in the same place, chooses how a mode change is announced.

## Roll dice from the bar

Anyone. The dice button does different things for different people:

- **A player's left-click** opens the **Dice Tray**.
- **The GM's left-click** opens **Request a Roll**, described in [the rolls guide](userguide-rolls.md).
  With **Show in Menubar** off under the roll settings, the GM gets the Dice Tray instead.
- **Right-click** offers whichever of **Request a Roll** and **Open Dice Tray** the left-click does
  not, plus **Enable Manual Rolls**.

**The Dice Tray** builds a formula from buttons. Click a die (**D2** to **D100**) to add it, and the
operators between to add, subtract, multiply, or divide dice. **Roll with Advantage** and **Roll
with Disadvantage** double the dice and keep the better or worse half; **Keep Highest** and **Keep
Lowest** keep that many dice, one more each click; **Add Bonus** and **Add Penalty** adjust the
total, one more each click. You can also type straight into the formula field. **Roll Formula**
rolls it to chat, **Clear Formula** starts over, and **Recent Rolls** lists what you have rolled with
a re-roll button on each and **Clear History** to empty it.

**Manual rolls** means entering the numbers from your physical dice by hand instead of letting
Foundry roll. Choose **Enable Manual Rolls** to turn it on for yourself; the dice icon stays lit
while it is on, and the same entry turns it off again.

## See and change the party's health

Anyone can look; the GM can act. Click the heart to open **Health**. It lists whatever tokens you
have selected on the canvas, one row each: portrait, name, a health bar with the numbers, and how
many conditions the character has. With nothing selected it shows two summary rows instead,
**Party** and **NPCs**, covering the whole scene, and stays live as hit points change.

The GM's controls sit under the list. Click a row to narrow them to that character or group, or
leave nothing highlighted to act on every listed token. Then use the amount field with the single
arrows to lower or raise hit points by that amount, the double arrows for ten at a time, the heart to
heal fully, and the skull to set hit points to zero. The two people icons select all party or all
non-party tokens on the scene. The sparkles on a row open that character's conditions.

A player sees the same rows without the controls. **Show Health Tool**, under **User Experience**
and **Menubar Tools**, hides or shows the button on your own bar.

## Apply and clear conditions

The owner of the character. Click the sparkles to open **Status Effects**. The window acts on the
token you have selected, or on your own character when nothing is selected; the character's name
sits in the header. Under **Conditions** every condition the game knows is a tile: click one to
add it, click it again to remove it, and a mark on the tile shows it is active. **Exhaustion** shows
its current level on the tile. **Other Effects** lists everything else on the character, from
spells and items, with a remove button on each and a note when one is disabled or suppressed.
Clicking a tile's information button shows the condition's **Description** on the right. **Remove
All** clears every condition at once. **Close** closes the window.

If the selected token is not yours, the tiles are shown but nothing changes, and trying tells you
that you do not have permission. Select a token first: with nothing selected and no character
assigned to you, the window asks you to.

## Keep your macros to hand

Anyone. Click the code icon to open **Macros**, a grid of slots. Drag a macro from Foundry's hotbar
or Macro Directory into the window to add it. On a slot, **left-click** runs the macro,
**right-click** marks it as a favourite, and **middle-click or shift-click** removes it. Favourites
appear in the bar's own right-click menu on the macros button, under **Show Macro Window**, so you
can run one without opening anything. The window is yours alone; other players have their own.

## Write a note

Anyone. Click the sticky note to open **Notes**; right-click for **Quick Note**, which opens a new
note straight away, and a list of your favourite notes. Everything about notes is in
[the notes guide](userguide-notes.md).

## Send a toast

The GM composes; the party leader can send what the GM shares. A toast is a short message that pops
up on other people's screens. Click the bullhorn, or right-click it and choose **Open Send Toast**,
to open **Send Toast**:

| Part | What to do |
|---|---|
| **Recipients** | Tick **Entire Party**, or individual players. Offline players are listed but greyed. Pick at least one. |
| **Template** | Choose a saved look, or start from one of the built-in **Information**, **Important**, or **Announcement** ones. |
| **Title (required)** and **Message (optional)** | What the toast says. |
| Icon, sound, colours, background image, **Adapt to Content** | How it looks and whether it plays a sound. **Preview sound** plays it for you first. |
| **Save as template** | Keeps the current look under a **Template name** for next time. Built-in templates cannot be deleted; your own can. |
| **Enable Leader Access** | Lets the party leader send this template. |
| **Send Toast** | Sends it. |

The leader right-clicks the bullhorn and picks a shared template from the list; each entry says who
it goes to. Until the GM shares one, the list reads "No quick toasts yet".

## Search your compendiums

Anyone. Click the magnifying glass, or press **Ctrl+Space**, to open **Compendium Search**. Type to
search, or leave the field empty and use the filters to browse: a document type, a rarity, and a
price range in gold. **Search all installed compendiums** widens the search past the compendiums in
your **Compendium Mapping** settings, and **Include world documents** adds what is already in the
world. Click a result to open it. Drag a result onto a character sheet to add it; players can do
that while **Players Can Add From Compendium Search** is on. If the button is not on your bar,
**Compendium Search in Menubar** puts it back, and the toolbar button and shortcut work regardless.

## Use the menu on the left

Anyone. The first button on the bar opens a short menu:

| Entry | What it does |
|---|---|
| **Refresh** | Reloads Foundry for you. |
| **Settings** | Opens Foundry's settings. |
| A memory readout | Shows how much memory your browser is using; click it for a full performance report. |
| **GM Quickview On** / **Off** (GM only) | Clarity mode: a brighter view, revealed fog, and highlights on tokens outside current sight. **Toggle Quickview** in Foundry's controls settings does the same from the keyboard. |
| **Hide UI** / **Show UI** | Hides the rest of Foundry's interface for a clean view. **Options** chooses what is included -- the toolbar, the scene controls, the online players list, the macro hotbar, floating chat -- and **Apply on Load** hides them every time you load. |

Under **Developer Tools** and **System**, each person chooses for themselves whether **Show Settings
Tool** and **Show Refresh Tool** put those two on the bar as separate buttons, and whether **Enable
Performance monitor** loads the memory readout at all. **Enable Quickview** under the canvas tools
loads the clarity mode.

## Start a combat from the bar

GM only for **Create**; anyone for the rest. **Create** starts a combat from the selected tokens,
or from every token on the canvas when nothing is selected. **Tracker** opens Foundry's combat
tracker window, and **Encounter** opens the combat readout under the bar. See
[the combat guide](userguide-combat.md).

## Keep a tool window open

Anyone. The **Dice Tray**, **Macros**, and **Health** windows remember whether you left them open
and come back on their own the next time you load. Tool windows have a small header menu in place
of the usual window buttons; on Foundry 14 it also offers **Detach Window** to pop the window out
of the browser tab, and **Re-attach Window** to bring it back.

## See everyone's connection

Anyone. Each name in Foundry's players list carries its round-trip time to the server, in
milliseconds, coloured by how good it is. Two settings under **Developer Tools** and **System
Latency** govern it for the whole world: **Enable System Latency Checks** turns it on, and **Latency
Check Interval** says how many seconds pass between measurements.

## The Blacksmith toolbar in the scene controls

Blacksmith also adds a group to Foundry's scene controls on the left of the screen. What you see
depends on who you are:

| Button | Who | What it does |
|---|---|---|
| **Open CSS Editor** | GM | See [the appearance guide](userguide-appearance.md). |
| **Journal Tools** | GM | See [the journals guide](userguide-journals.md). |
| **Refresh Client** | GM | Reloads Foundry. |
| **Request a Roll** | GM | See [the rolls guide](userguide-rolls.md). |
| **Remove All Blood** and **Restore All Blood** | GM | See [the tokens guide](userguide-tokens.md). |
| **Compendium Search** | Anyone | The same search as the bar's. |
| **Start Vote** | GM and the party leader | See [the votes guide](userguide-votes.md). |

**Display Style**, under **User Experience** and **Toolbar**, chooses **Foundry Default**, **Category
Dividers**, or **Category Labels** for how the group is organised, and **Clear All Targets Button**
adds a button to Foundry's own token tools that clears every token you are targeting.
