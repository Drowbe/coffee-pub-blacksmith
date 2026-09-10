# Combat

**Audience:** GMs running a fight with Blacksmith, and players taking part in one.

How to start a combat from the bar, run it from the combat bar and the combat tracker, reorder
initiative, deal with the dead, and read what the bar tells you while the fight is on.

The timers that run during a fight are in [the timers guide](userguide-timers.md); what gets counted
is in [the statistics guide](userguide-statistics.md); and the experience awarded when it ends is in
[the experience guide](userguide-xp.md).

## Open the combat bar

Anyone. The **Encounter** button in the middle of the Blacksmith bar opens and closes a second row
under it. Between fights that row shows the party's standing records and the encounter tools; once
a combat is running it becomes the combat bar, with a portrait for every combatant and the round
and turn controls. **Automatically Show**, under **Run the Game**, **Combat** and **Combat
Menubar**, opens it for you on load and whenever an encounter starts; it is your own choice, not
the GM's.

## Start a combat

GM only. Three ways:

- **Create** on the Blacksmith bar starts a combat from the tokens you have selected, or from every
  token on the canvas when nothing is selected.
- On the combat bar, the encounter button offers **Add Remaining Players**, **Add Remaining
  NPCs**, and **Add All Remaining**, which put onto the tracker whoever on the scene is not yet in
  the fight; and **Delete Encounter**, which removes the combat.
- Foundry's own combat tracker still works exactly as before.

When everyone is in, press the **Begin Combat** button on the bar. Until initiative is rolled,
portraits show a dice icon marked "Waiting for initiative"; a player can click the dice on their own
character to roll, and the GM can click any of them.

## Roll initiative

The GM for anyone; a player for their own character. The initiative button on the combat bar
offers:

| Entry | What it does |
|---|---|
| **Roll Remaining** | Rolls for everyone who has not rolled yet. The GM sees "Every combatant has already rolled initiative." when there is nobody left. |
| **Roll Party** | Rolls for the player characters. |
| **Roll NPCs** | Rolls for everyone else. |
| **Reset Initiative** | Clears every initiative so the round can be rolled again. |

The same **Roll Remaining** button is added to Foundry's combat tracker. Two settings under
**Combat Tracker Tools** roll on your behalf each round: **Roll NPC Initiative** is the GM's and
covers every NPC; **Roll Player Initiative** is each player's own and rolls their characters. **Hide
Initiative Roll Cards** keeps those rolls out of the chat log while the results still reach the
tracker, and **Clear Initiative** wipes everyone's initiative at the top of each round so it is
rolled fresh. **Mid-Combat Additions** decides what happens to an NPC added part-way through:
nothing, an automatic roll, the next available turn, or the end of the order.

A natural 20 on initiative is announced when **Announce Critical Initiative** is on: **Whose Critical
Initiative Counts** chooses player characters only, anything a player owns, or everyone, and **How
to Announce It** chooses a toast, a chat card, or both.

## Reorder initiative by dragging

GM only. Drag a portrait along the combat bar and drop it where you want it; the initiatives are
rewritten so the order sticks. The same works in Foundry's combat tracker: drag a combatant's row
and drop it between two others. Players see the new order but cannot drag.

Right-clicking a portrait gives finer control under **Initiative**: **Clear Initiative** and
**Reroll Initiative** for that one combatant.

## Take turns

GM only for the controls; everyone sees the bar move. On the combat bar, **Previous Turn**, **Next
Turn**, **Previous Round**, and **Next Round** move the fight, **End Turn** ends the current one,
and **End Combat** finishes it. The current combatant's portrait is marked, and the readout above
the portraits shows the round and the turn. Click a portrait to make that combatant the current one;
double-click it to pan the canvas to their token. When the strip is wider than the bar, arrows at
either end scroll it.

A player whose turn it is can end it from the turn timer's **END TURN** overlay in the combat
tracker; see the timers guide.

Two settings under **Combat Tracker Tools** follow the turn for you: **Auto-Select Current
Combatant** selects the token whose turn it is, and **Pan To Current Combatant** pans the GM's canvas
to it without touching the players' views. **Set First Turn** makes the first combatant current once
every initiative is in, and **Clear Targets After Turn** drops your targets whenever the turn
changes. **Add Set Current Icon** puts a button on every row of Foundry's tracker that makes that
combatant current.

## Act on a combatant from the bar

GM only. Right-click a portrait for its menu:

| Entry | What it does |
|---|---|
| **Pan to Token** and **Ping Token** | Find the token on the canvas, or ping it so everyone looks. |
| **Pop Out Combatant Card** | Opens the hover card as its own window. |
| **Hurry Up** | **Send to Player** nudges the player who owns the combatant; **Send to Party** nudges everyone. See the timers guide. |
| **View Character Sheet** and **View Portrait** | Open the sheet, or the portrait image. |
| **Update Participant** | Rewrites the combatant's name and portrait from its current token. |
| **Initiative** | **Clear Initiative** or **Reroll Initiative** for this combatant. |
| **Visibility** | **Toggle Canvas Visibility** hides or reveals the token; **Toggle Combat Visibility** hides or reveals the combatant in the tracker. |
| **Set As Current Combatant** | Makes it their turn. |
| **Toggle Defeated** | Marks the combatant defeated, or brings it back. |
| **Remove from Group** and **Remove from Combat** | Take the combatant out of its group, or out of the fight. |

Hovering a portrait shows a card with the combatant's health and, while **Show Status and
Conditions** is on for you, its active conditions and effects.

## Use the encounter tools

GM only, except where marked. The buttons at the left of the combat bar open menus:

| Button | Entries |
|---|---|
| **Encounter** | **View Current Statistics** and **View Pending Experience**, then the add and delete entries described under "Start a combat". |
| **Combatants** | **Reveal Hidden NPCs**, and **Clear Movement Histories** to forget every token's recorded movement. |
| **Initiatives** | The roll entries described under "Roll initiative". |
| **Tools** | **Select Tokens** and **Select Targets** switch Foundry's token tool; **Clear All Targets** drops your targets (anyone); **Measure Distance** switches to the ruler. |

Between fights the same row offers **Deploy Party**, which places the party's tokens on the scene;
**Quick Encounter**; and **Remove Party**, **Remove NPCs**, and **Remove Monsters**, each of which
asks before deleting that kind of token from the scene.

## Deal with the dead

GM only to change; everyone sees the result. When an NPC in the fight drops to zero hit points,
Blacksmith marks it defeated and puts the defeated status on its token, exactly as the skull button
in Foundry's tracker would, and Foundry skips it in the turn order from then on. Player characters
are left alone at zero: they are making death saves, and only the GM decides they are dead. Heal an
NPC that Blacksmith marked and the mark comes off; one the GM marked by hand stays marked. **Mark
the Dead as Defeated** under **Combat Tracker Tools** turns this off.

On the combat bar a defeated combatant's portrait is greyed under a **Defeated** overlay. With
**Hide the Dead** on, defeated combatants leave the strip and collect behind a **Graveyard** button at
the end of the bar, which counts them and lists them on click; they stay in Foundry's tracker.

## Read the combat readout

Anyone. Above the portraits, while a fight is on:

| Readout | What it shows |
|---|---|
| Round and turn | Where the fight is. |
| **Damage**, **Accuracy**, **Biggest Hit**, **Kills**, **Healing** | The party's totals for this combat. |
| **Leading MVP** | Who is ahead on the MVP score so far. |
| **Party Health** and **NPC Health** | Two bars: the party's remaining hit points above, the threat still standing below. |
| **Encounter difficulty** | The fight's rating from the two sides' challenge ratings, such as "Trivial". |

Clicking the party health bar opens the Health window described in
[the Blacksmith bar guide](userguide-menubar.md). Between fights the readout shows the standing
records instead: combats fought, the biggest hit on record, most hits, most misses, most fumbles,
fewest misses, criticals and fumbles on record, and the party's experience. Where a record shows a
portrait, that is who holds it.

## Change how the bar and the tracker look

Each person for the bar; the GM for what players may see. Under **Combat Menubar**: **Size In
Combat** sets the bar's height and with it the portrait size; **Portrait Shape** chooses **Square**
or **Round**; **Show Status and Conditions** puts conditions on the hover cards. **Hide Enemy Health
Bars**, the GM's, keeps enemy health off the players' bars, and its twin under **Combat Tracker
Behaviors** does the same in Foundry's tracker.

Under **Combat Tracker Behaviors**, Foundry's tracker gains **Show Health Bar** and **Show
Portraits** for every row, and each person can choose **Automatically Open** for the tracker window
and **Make Resizable** so it can be dragged to size.

Turn announcements as each combatant comes up are Crier's.
