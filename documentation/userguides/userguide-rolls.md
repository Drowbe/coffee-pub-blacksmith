# Rolls

**Audience:** GMs asking the table for rolls, and players answering them.

How to request a roll from one character or the whole party, what every control in the Request a
Roll window does, how a player rolls from the chat card, and how the quick roll library and the
roll builder save a roll you use often.

Rolling your own dice with no request is the Dice Tray's job; see
[the Blacksmith bar guide](userguide-menubar.md).

## Open Request a Roll

GM only. Left-click the dice button on the Blacksmith bar, or use the **Request a Roll** button in
the Blacksmith group of Foundry's scene controls. **Show in Menubar** and **Show in Foundry
Toolbar**, under **Rolling and Progression** and **Request Rolls**, decide which of those two are
present; with the bar's button off, the dice button opens the Dice Tray for the GM as it does for
players, and the request tool is one right-click away.

The window is in two halves. On the left, **Contestants**: who rolls. On the right, **Roll Type**:
what they roll. Along the top, the toggles that shape the request, and at the bottom, **Cancel**
and **Request Roll**.

## Choose who rolls

GM only. The **Contestants** list has three filters: **Canvas** shows the tokens on the current
scene, **Party** shows the player characters, and **NPCs** shows the rest. Type in **Search for
contestants...** to narrow any of them. Each entry shows the portrait, name, level and current hit
points.

**Left-click** an entry to select it as a challenger; click again to drop it. **Deselect All** in
the header clears the lot. The header counts how many are selected, and the request cannot be sent
with nobody chosen.

For a contested roll, **right-click** an entry to make it a defender instead. Right-click again
cycles it back. The list then shows **Challengers** and **Defenders** as two groups.

## Choose what they roll

GM only. Under **Roll Type**, **Find roll type...** searches the whole list, and the tabs group it:

| Tab | What is in it |
|---|---|
| **Quick** | Your favourites, the quick roll library, and rolls you have remembered. See "Fire a quick roll" and "Build your own quick roll" below. |
| **Skill** | Every skill, from Acrobatics to Survival. |
| **Ability** | The six ability checks. |
| **Save** | The six saving throws, plus **Death Save**. |
| **Dice** | The dice builder: a custom formula with no character stat behind it. See "Roll custom dice" below. |
| **Tool** | Tool checks. The list is built from the tools the selected characters actually own. |

Click a roll to select it. With **Explain Roll** on, the request card carries a short explanation of
the chosen skill, ability, save or tool under **About this Roll**, for players who do not know what
it covers. The toggle remembers your choice.

## Set the difficulty and who sees what

GM only. The header carries the request's shape:

| Control | What it does |
|---|---|
| **Cinematic** | Plays the request as a full-screen scene on every player's screen instead of only a chat card. See "Run a roll as a cinematic" below. |
| **Show DC** | Puts the target number on the card where the players can read it. Off, the players roll without knowing it and the GM still sees pass or fail. |
| **Group DC** | Makes it a group roll: one result for the party rather than one per character. See "Ask the whole party" below. |
| **Public Roll** | The roll mode, as in Foundry: **Public Roll**, **Private GM Roll**, **Blind GM Roll**, or **Self Roll**. It decides who can read each result on the card. |
| **DC** | The target number. Leave it empty for a roll with no target, such as an initiative-style comparison or a plain check for the GM to judge. |

The toggles remember how you left them, for you alone.

## Send the request

GM only. Press **Request Roll**. A sound plays and a card is posted to chat headed with the roll's
name, listing every contestant under **Requested Rolls** with an invitation to roll. Contested
requests list **Challengers** and **Defenders** separately. Each row fills in with the result as its
roll comes in, and the card is rebuilt for everyone every time.

Who can read a result follows the roll mode: a public roll shows every total to everyone; a private
or blind GM roll shows a total to the GM and, for a private roll, to the player who rolled it; a
self roll shows it to the roller alone. Everyone else sees that the roll happened and nothing more.

## Roll from the card

The character's owner, or the GM. Click your character's row on the request card. If the character
is not yours you are told you do not have permission. The GM can roll for anyone, which is how an
NPC's roll gets made and how an absent player's character keeps up.

What opens depends on **Rolls from Chat Cards** under **Roll System**. With **Blacksmith Roll System
(Default)** the **Roll Configuration** window opens:

- **Ability** lets you change which ability the check uses, for a skill or a tool.
- **Bonus and Modifiers** takes anything Foundry can roll: a flat bonus like +2, dice like 1d4 for
  Guidance, or several separated by spaces. The named bonuses under it (**Bless**, **Guidance**,
  **Bardic**, **Cover**, **Inspiration**, **Obscured**, and any the GM adds) drop in with one
  click and travel with their name so the formula says what each term is for. The GM can add a
  named bonus with **Add a Named Bonus**, and it is shared with the whole table.
- **Roll Mode** is the same four choices the GM set, and starts on what the request asked for.
- **Roll Normal**, **Roll with Advantage**, and **Roll with Disadvantage** roll it. If the GM asked
  for advantage or disadvantage, that button is marked.

With **Foundry Roll System** the game system's own roll dialog opens instead. Either way the result
lands on the card, is compared against the DC when there is one, and plays a success, failure,
critical or fumble sound. If you have manual rolls turned on, you are asked for the number on your
physical die instead of Foundry rolling. **Dice So Nice Rolls** under **Module Integrations** lets
that module animate the dice when it is installed.

## Ask the whole party

GM only. With **Group DC** on and a DC set, the card judges the party together once every
contestant has rolled: **Group Success** when more than half of them met the DC, **Group Failure**
otherwise, with the count shown as "3 of 5 Succeeded". Until the last roll is in, the card only
shows the results so far. Without a DC a group roll simply collects everyone's totals.

The **Party Rolls (Group Success)** and **Party Rolls (Individual Success)** quick rolls are this
with the party already selected; the individual ones judge each character alone.

## Run a contested roll

GM only. Select the challengers with a left-click and the defenders with a right-click, then choose
the roll. The right-hand side then offers a **Challenger Roll** and a **Defender Roll**, so the two
sides can roll different things: Stealth against Perception, Athletics against Acrobatics, Deception
against Insight. Press **Request Roll**. Once every roll is in, the card declares **Challengers
Win**, **Defenders Win**, or **Stalemate**, comparing the sides' results. The **Stealth Rolls**,
**Grapple Rolls** and **Manipulation Rolls** quick rolls are ready-made contests.

## Run a roll as a cinematic

GM only to start; every player sees it. With **Cinematic** on, pressing **Request Roll** opens a
full-screen scene on every connected screen: the roll's name on a plate across the top, and a card
for each contestant. A player clicks their own card to roll, and the result appears on it for
everyone to watch. The chat card is still posted and still works, so a player who would rather roll
from chat, or who has the scene closed, is not shut out; their roll lands on both.

When the last roll is in, the plate changes to the outcome: group success or failure, or which side
won a contest. The GM can close the scene at any time with its close button or the Escape key, which
closes it for everyone.

## Roll custom dice

GM only. On the **Dice** tab, build a formula by counting dice: each row from **D2** to **D100**
has a count you can step up and down, and **Modifier** adds a flat number. Give any row a label
(**Label (optional)**) to say what it is for, such as "Strength" or "bludgeoning", and the request
shows it. The readout under the rows shows the formula the request will roll. **Name this roll
(optional)** sets the card's title; it defaults to "Custom Dice Roll". **Remember this roll** keeps
the build under **Remembered Rolls** on the Quick tab for next time, and the reset button clears
every die, label and modifier.

A custom dice request has no ability behind it, so the players' Roll Configuration window offers
bonuses and the roll mode but no ability choice.

## Fire a quick roll

GM only. The **Quick** tab is a library of prepared requests, one click each. Blacksmith seeds a
new world with a set of them in categories: **Party Rolls (Individual Success)** and **Party Rolls
(Group Success)** for the common skills, **Stealth Rolls**, **Grapple Rolls**, and **Manipulation
Rolls**. Each row shows its name, a description on hover, and marks for how it plays: individual or
group, contested, cinematic, and its DC.

Click a row's play button to send it straight away with its own contestants, which for a party roll
is the whole party. The play button's icon says where it goes: a film icon plays it as a cinematic,
and a play icon posts it to chat. Click the icon to swap the two for that roll. The other buttons on
a row are **Favorite**, which pins the roll under **Favorites** at the top of the tab for you alone,
**Edit this roll**, and **Delete this roll**.

The library belongs to the world, so a second GM sees the same rolls. Deleting every one of them
leaves the tab empty; the seeded set does not come back on its own.

## Build your own quick roll

GM only. Press **Build a new quick roll** on the Quick tab, or **Edit this roll** on a row, to open
the **Roll Builder**:

| Section | What to set |
|---|---|
| **Details** | **Label** (what the row says, such as "DC 12 Athletics vs Acrobatics"), **Description** (shown on hover), and **Card title** (what heads the chat card and the cinematic plate). |
| **Category** | **File under** an existing category, or choose **New category...** and give it a **New name**. |
| **Who Rolls** | **Whole Party** or **Selected Tokens**. |
| **Roll Type** | **Normal** or **Contested**. |
| **What Is Rolled** | The **Challenger** roll and, for a contest, the **Defender** roll: a skill, ability, save, or tool. |
| **Difficulty** | **DC**. Leave it empty for a roll with no target number. |
| **Success** | **Individual** or **Group**. |
| **Flavor** | **Chat Card** or **Cinematic**, and an **Icon** for the row. |
| **Preview** | The row as it will appear. |

**Save Roll** (or **Save Changes** when editing) writes it to the library. A contest saved without
a defender roll is refused.

## Share a library between worlds

GM only. On the Quick tab, **Export this library to a file** saves every quick roll as a file, and
**Import rolls from a file** reads one back. Importing asks whether to **Merge** the file's rolls into
this world's library or **Replace All**. A file that is not a quick roll library is refused and says
so.

## Settings

GM only unless marked. Under **Rolling and Progression** and **Roll Tools**:

| Setting | What it does |
|---|---|
| **Show in Foundry Toolbar** | Puts **Request a Roll** in the Blacksmith group of Foundry's scene controls. |
| **Show in Menubar** | Makes the GM's left-click on the bar's dice button open Request a Roll. |
| **Theme File** | The theme that styles the request window, the cards and the cinematic scene. |
| **Rolls from Chat Cards** | **Blacksmith Roll System (Default)** opens the Roll Configuration window; **Foundry Roll System** opens the game system's own dialog. |
| **Dice So Nice Rolls** | Lets that module animate Blacksmith's rolls when it is installed. |
| **Midi-QOL Integration** | Reads that module's attack and damage information when it is installed. Blacksmith does the same work itself without it. |
