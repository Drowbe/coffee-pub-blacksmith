# The World Clock, Calendar and Rests

**Audience:** GMs running a game with Blacksmith, and players who want to know what the clock on the
bar is telling them.

How to read and move the in-world clock, choose how time passes, make a scene's light follow it, keep
a calendar of world events, and run a short or long rest for the party.

The clock shows the game world's own time, kept by Foundry and shaped by the calendar the D&D 5e
system provides. Blacksmith does not invent a calendar of its own: the months, weekdays, seasons and
year come from the system, and Blacksmith shows them, moves through them, and hangs events and rests
off them. The session timer on the same bar runs on real time, not this clock; see
[the timers guide](userguide-timers.md).

## Read the time on the bar

Anyone. The clock sits on the right-hand side of the Blacksmith bar, the first thing in the group of
readouts there. It is a small window onto the sky: the panel's colour is the colour of the sky at the
current in-world time, a sun arcs across it by day and a moon by night, and stars fade in after dusk
and out again before dawn. The time itself sits beside the panel, with a small icon in front of it
showing how time is currently passing (see "Choose how time passes" below).

On a calendar with a twenty-four hour day the time reads in twelve-hour form with **AM** or **PM**.
On any other day length it reads as a zero-padded twenty-four hour time.

The clock does not tick on its own. It changes when something moves world time: the GM stepping it,
a rest, combat rounds, or one of the running time modes. When it moves, it moves on every screen at
once.

The bar shows only the time. The date, the season and whether it is a leap year are one click away
for the GM, at the head of the clock menu. A player sees the sky and the time and nothing else: no
arrows, no menu, and nothing happens when they click it.

If the calendar has not finished loading when the bar first draws, the clock reads `--:--` and the
panel is greyed. It fills in on its own once the calendar is ready.

## Step time forward or back

GM only. Either side of the clock face is a pair of arrows.

| Control | What it does |
|---|---|
| Single arrow, left or right | Moves time back or forward by the **Single Arrow Step** (ten minutes unless changed in settings). Hover to see the exact amount, for example "Forward 10 minutes". |
| Double arrow, left or right | Moves time back or forward by the **Double Arrow Step** (one hour unless changed). |

You can also drag the sun or the moon along the sky. The time follows the pointer while you hold it,
snapping to whole minutes, and is written to the world when you let go. Dragging past the edge of the
panel carries on into the next part of the day: pull the sun off the right-hand edge and the moon
rises at the left as the evening begins, and pull the moon off the left-hand edge to go back to the
previous evening. A press that does not move does nothing.

Going backwards is allowed. Calendar events you rewind past do not fire on the way back; they fire
again when the clock reaches them a second time.

## Open the clock menu

GM only. Left-click or right-click the time (or the small mode icon beside it). The menu opens where
the pointer is.

| Entry | What it does |
|---|---|
| The date | The first line is a readout, not a command: weekday, day, month and year, with the season underneath and "leap year" when the calendar says it is one. |
| **Pause Time** or **Resume Time** | Stops the clock, or starts it again in whatever mode it was in before you paused. Double-clicking the time does the same thing without opening the menu. |
| **Rest and Recovery** | Opens the **Rest** window. See "Rest the party" below. |
| **World Calendar and Events** | Opens the **World Calendar** window. See "Open the World Calendar" below. |
| **Jump to** | A submenu of **Dawn**, **Noon**, **Dusk** and **Midnight**. Each moves the clock forward to the next time that moment comes round. Choosing Dawn at three in the afternoon means tomorrow morning; it never moves the clock backwards. Dawn and Dusk are your **Sunrise** and **Sunset** settings; Noon and Midnight are the middle and the start of the calendar day. |
| **Time Mode: ...** | Shows the current mode, and opens a submenu to change it. See "Choose how time passes" below. |
| **Options** | **Set Time**, **Set Date**, and the darkness control for the current scene. See the next two sections. |

## Set the time of day, or the date

GM only. Both live under **Options** in the clock menu.

**Set Time** opens a small dialog with **Hour** and **Minute** fields, pre-filled with the current
time, and a note that reads "Sets the time of day. The date does not change." The hour field runs to
the last hour of the calendar's day, so a twenty-hour day offers twenty hours. Press **Set Time** to
apply.

**Set Date** opens the D&D 5e system's own date dialog, which knows the calendar's months and leap
years. If the system's calendar is not available, a warning says so and nothing opens.

## Choose how time passes

GM only, and everyone can see the result. Open the clock menu and use the **Time Mode** submenu, or
change **Time Mode** in settings. The current mode is marked in the submenu, and the small icon
before the time on every player's bar shows which mode is running.

| Mode | What it does |
|---|---|
| **Combat** | Blacksmith leaves the clock alone. The game system advances it by the round as combat proceeds. |
| **Real-time** | One second passes in the world for every second at the table. |
| **Slow** | Time passes more slowly than real time, at the **Slow Speed** set in settings. The submenu entry shows the speed, for example "Slow (0.25x)". |
| **Fast** | Time passes more quickly than real time, at the **Fast Speed** set in settings, for example "Fast (60x)". |
| **Paused** | Nothing moves the clock except your own steps, jumps and rests. This is the mode a new world starts in. |

In Real-time, Slow and Fast the clock advances a minute at a time, so the readout ticks over rather
than leaping. At high speeds it steps by several minutes at once; the **Minimum Update Interval**
setting decides how often those steps arrive.

Blacksmith does not change the mode for you when combat starts or ends, or when a rest begins. If
you want the clock to stop for a fight, choose **Combat** or **Pause Time** yourself. A rest moves
the clock by the length of the rest in one jump, whatever mode is running.

The clock is driven from one GM's screen. If no GM is connected, a running mode stops moving the
clock until one returns, and then carries on from wherever it was.

**Pause Time** remembers the mode you were in. **Resume Time**, or a double-click on the time,
returns to it. Reloading does not lose that memory.

## Make a scene's light follow the clock

GM only. Foundry keeps each scene's darkness wherever it was last set. Blacksmith can move it with the
clock instead: bright through the day, dark through the night, and a gradual change either side of
sunrise and sunset. Only the active scene is driven, and only scenes you have said yes for.

There are three ways to say yes, all writing the same answer:

1. **The question that appears on a new scene.** The first time you view a scene nobody has decided
   about, a **Darkness Control** dialog asks "Should the light on <scene> follow the world clock?"
   It comes with three ticked boxes, **Turn on Global Illumination**, **Unlock the Darkness Level**
   and **Turn on Token Vision**, which are the scene settings that let players actually see the
   change. Untick any you would rather set yourself. Press **Yes, follow the clock** or **No, leave
   it alone**. Either answer is remembered and the scene is never asked about again; closing the
   dialog without answering means you are asked next time. Turn **Ask About New Scenes** off in
   settings to stop the question appearing at all.
2. **The scene's configuration.** Open the scene's configuration, go to the **Geography** tab, and
   under **Time of Day** tick **Darkness follows the world clock**. If the scene follows the clock but
   is missing one of the three settings above, a note on the same tab lists what to turn on.
3. **The clock menu.** Under **Options**, the entry **Darkness Control on <scene>** toggles the
   current scene. It shows "(not set)" while the scene has never been decided. If the scene's
   darkness level is locked, a second, greyed entry says so: "Darkness Level Lock is on, so the clock
   cannot change this scene".

Say no for interiors and anywhere else that never sees the sky.

The change plays out on every screen over a couple of seconds each time the clock moves. Through
most of the day and most of the night nothing visibly changes; the movement is concentrated in the
twilight around each horizon. The shape is set in settings: **Sunrise** and **Sunset** say when the
horizons fall, **Twilight Length** says how many minutes the change takes (centred on the horizon,
so a one-hour twilight and a six o'clock sunrise run from half past five to half past six), and
**Darkness at Night** and **Darkness by Day** say how dark each end is.

## Open the World Calendar

GM only from the bar: open the clock menu and choose **World Calendar and Events**. The window is
titled **World Calendar** and shows one month at a time, opening on the month the world is in.

Across the top: buttons for the previous and next year and the previous and next month (hover for
"Previous year", "Previous month", "Next month", "Next year"), and the month name, the year, an
asterisk when the calendar says it is a leap year (hover: "A leap year in this calendar"), and the
season when the calendar declares one.

The grid uses the calendar's own week: however many weekdays it declares, in its own names. The
column headings are abbreviations; hover one for the full name. Days are marked three ways:

| Mark | Meaning |
|---|---|
| Today | The day the world is on. |
| Selected | The day you have clicked. This is where you are looking, not where the world is. |
| Has events | One or more calendar events fall on this day. Hover to read their names. |

A day with a bell on it has a note reminder due that day; hover to read which notes, and when. Those
belong to notes, not to the calendar; see [the notes guide](userguide-notes.md).

Beside the grid, **This month** lists the month's events grouped by day, each with its time, how it
repeats ("once", "every year" or "every month") and who added it. When there are none it reads
"Nothing this month."

Along the bottom: **Today:** followed by today's date; **Back to today** when you have paged away
from the current month; and, once a day is selected, **Go to <day>** and **Add event**. Before a day
is selected the footer says "Select a day".

If the calendar has not finished loading, the window says "The world calendar is not available yet."

## Move between months and days

Anyone with the window open. Use the arrows across the top to page by month or by year. Paging does
not move the world; it only changes what you are looking at. Click a day to select it; click it again
to clear the selection. Clicking a day's heading or an event in the **This month** list selects that
day on the grid and scrolls the list to it. **Back to today** returns to the current month and
selects today.

## Move the world to a day

GM only. Select a day and press **Go to <day>** in the footer. The world moves to that date and keeps
the current time of day: skipping to the fourteenth at three in the afternoon lands on the fourteenth
at three in the afternoon. Unlike the clock menu's jumps, this can move the world backwards, so check
the year across the top before pressing it. The clock on every bar changes at once, and any calendar
event between here and there fires on the way.

## Add a calendar event

Anyone with the window open. A calendar event belongs to the world rather than to a person: a
festival, a market day, a deadline the whole table shares.

Double-click a day, or select a day and press **Add event**. A dialog titled "New event:" and the
date opens with these fields:

| Field | What it is for |
|---|---|
| **Name** | Required. The dialog refuses to save without one: "An event needs a name." |
| **Description** | Optional. Shown when hovering the event's name in the list, and on the announcement when the event arrives. |
| **Repeats** | **Once, this year only**, **Every year on this date**, or **Every month on this day**. |
| **Time** | Hour and minute. Defaults to the current hour. |

Press **Add Event**. The day gains its marker and the event appears under **This month**.

A player's event is written on their behalf by the GM's client, and the list shows the player's name
beside it. A monthly event on a day a month does not have (the thirty-first in a thirty-day month) is
skipped for that month rather than moved.

## Edit or delete a calendar event

The GM can change any event. A player can change only the events they added; other events show no
edit or delete buttons for them.

In the **This month** list each event you may change carries a pen (hover: "Edit this event") and a
cross (hover: "Delete this event"). Double-clicking an event you may change also opens it for
editing. The edit dialog is the add dialog with the fields filled in, titled "Edit event:" and the
date, and saves with **Save Event**. You can change the name, description, repeat and time; to move
an event to a different day, delete it and add it again on the new day.

Deleting asks first, in a dialog titled **Delete event**: "Delete <name> from the calendar?" There is
no undo.

## What happens when an event's time arrives

When the clock reaches or passes an event's date and time, a toast appears on the GM's screen with
the event's name and its description (or "Today on the calendar" when it has none), and stays for
about eight seconds. Nothing is posted to chat and players see nothing. Other Coffee Pub modules can
react to the event in their own ways.

An event fires whether the clock walks to it minute by minute or jumps over it in one step: a rest
that carries the party past midnight fires the next morning's events. Rewinding past an event does
not fire it; it fires again when the clock reaches it once more. A repeating event fires on each
occurrence; a one-off fires once and then stays on the calendar as a record.

## Rest the party

GM only. Open the clock menu and choose **Rest and Recovery**. The **Rest** window opens. Resting
itself is the game system's: hit points, hit dice, spell slots, item uses and exhaustion all recover
exactly as they would from a character sheet. What this window adds is choosing the whole night at
once, for the whole party, and then letting each character take the rest from a chat card.

The window, top to bottom:

| Section | Controls |
|---|---|
| **Rest** | **Long Rest** or **Short Rest**. Switching between them does not lose the ticks below. |
| **Who is resting** | One row per character with portrait, name and current hit points (marked when hurt), each with a checkbox. **All** and **None** tick or clear the lot. |
| **Time Automation** | **Begin a new day**. Follows what the game system would do for the chosen rest: ticked for a long rest, clear for a short one, until you change it. |
| **Provisions** (long rest only) | **Track food**, **Track water**, **Allow foraging**, **Going without causes exhaustion**. These apply to this rest only and start from the matching settings. |
| **Hit Points** (long rest only) | **Remove Temp HP** and **Recover Max HP**, the game system's own long-rest options. |
| **Hit Dice** (short rest only) | **Auto Spend HD**. Ticked, the system spends hit dice until they run out or health is full. Clear, each character chooses their own dice, one at a time, from their card. |

The roster is the world's primary party; a world with no primary party gets every player-owned
character instead. It includes non-player members travelling with the party. If you have tokens
selected on the canvas when you open the window, those characters are added to the roster if they
were not already on it and only they start ticked; with nothing selected, everybody does. A roster
with nobody to show reads "No player characters were found to rest."

Press **Begin Rest**. One card is posted to chat for each ticked character and the window closes.
Pressing it with nobody ticked warns "Nobody is selected to rest." **Cancel** closes without
posting. The window remembers the provisions and hit point boxes as you left them, per GM, and opens
that way next time.

## Take a rest from the card

The character's owner, or the GM. Each card that the Rest window posts shows the character's portrait
and name, a subtitle naming the kind of rest and that they are ready to rest, a health bar with the
numbers on it, and where they stand: **Hit Dice** remaining, **Spell Slots** remaining (only the
slots this rest can restore, so a short rest shows a warlock's pact slots and not a wizard's), and
**Exhaustion** if they have any. Under that is one button, **Begin Long Rest** or **Begin Short
Rest**.

Anyone at the table can see the card. Pressing the button works for the character's owner and for
the GM; anyone else is told the character is not theirs to rest. The GM pressing it is how a
character whose player is away gets their rest. The button works once; a second press while the rest
is still being written does nothing.

The rest runs on the presser's screen with no further dialog, and the same card is rewritten in
place rather than a second one posted:

| Part of the card | What it shows after the rest |
|---|---|
| Subtitle | The kind of rest, how many hours it took, and "new day" when one began. |
| Health bar | Where the character ended up. |
| **Recovered** | One line per thing that came back: **Hit Points**, **Hit Dice** (or **Hit Dice Spent** on a short rest), spell slots by level, **Exhaustion** removed, and any item whose uses recovered. A character who needed nothing sees "Already full:" followed by what was full, or "Nothing needed recovering." |
| **Provisions** (long rest with tracking on) | **Food** and **Water**, each with a tick when eaten or found, a cross when gone without, or an hourglass while a foraging check is still owed. A failed forage shows the roll and "+1 exhaustion" on the row. |
| Foraging (only when owed) | **Survival Check** with the DC, and a **Forage for Food and Water** button. See "Forage" below. |

A player's rest needs a GM connected: the card, the rations and the clock are all written from the
GM's screen. If nobody is, the player is warned "Your rest was not recorded: no GM is connected."

## Spend hit dice on a short rest

The character's owner, or the GM. When a short rest was begun with **Auto Spend HD** clear and the
character is hurt, their rested card carries one button per die size they still have, for example
**Spend d10 (3)** and **Spend d6 (2)** for a multiclass character. Each press rolls one die, heals,
moves the health bar on the card, adds a **Hit Die** line showing how much it healed, and counts the
button down. The dice roll in 3D if you use Dice So Nice. The buttons stay while any dice remain,
even at full health; a die spent at full health is a choice the card does not overrule.

## Forage for food and water

The character's owner, or the GM. With **Track food** or **Track water** on, a long rest eats one
ration and drinks one measure of water from the character's inventory, matching item names against
the **Food Items** and **Water Items** settings. A waterskin is drunk from by the pint and kept; a
stack of rations is eaten one at a time and the last one disappears.

A character who has neither food nor water on them, and whose rest allows foraging, gets a Survival
check instead. With **Players Roll to Forage** on (the default) their card shows the DC and the
**Forage for Food and Water** button; pressing it opens Blacksmith's roll window, titled Foraging,
with the DC already set (see [the rolls guide](userguide-rolls.md)). Closing the window without
rolling leaves the button in place. Once rolled, the button is replaced by a **Survival Check** line
reading "Found food and water" or "Found nothing" with the total. With **Players Roll to Forage**
off, the check is rolled silently as part of the rest and the card shows the result straight away.
The GM can press the button for anyone.

One check covers both food and water, so a character can lose at most one level of exhaustion per
rest. With **Going without causes exhaustion** on, failing the check (or having no check, when
foraging is off) adds a level, and the row says so. With it off, the cross still shows and what it
costs is up to you.

Blacksmith's exhaustion follows the 2024 rules. In a world set to the 2014 rules the GM is warned
once per session that the system will apply the older exhaustion table.

## How much clock time a rest takes

The clock moves by the length of the rest as the game system defines it for the world's rest
variant: normally an hour for a short rest and eight hours for a long one, longer under gritty
realism and shorter under epic heroism. This needs **Rests Move the Clock** on in settings, which it
is by default.

A grouped rest moves the clock once, when the last character has rested, not once per character.
Until then the clock stays put, and a card nobody has pressed holds the whole night: the GM can press
it on the absent player's behalf, or delete the card to drop that character from the rest. Deleting
a card does not stop the others; the clock moves when everyone still holding a card has rested.

The same applies to a rest started elsewhere. A character resting from their own sheet, or accepting
a rest request the game system posted, still gets a Blacksmith card and still moves the clock. If the
system's own "advance time" option was used for that rest, Blacksmith stands down rather than moving
the clock twice.

## Rest from a character sheet or a system request

The character's owner, or the GM. Nothing here needs the Rest window. A rest begun from the game
system's own controls opens the system's rest dialog, and when it finishes Blacksmith posts its card
and moves the clock as above, using the world's **Track Food** and **Track Water** settings rather
than per-rest choices.

Two settings shape that path. **Skip the Rest Confirmation** (on by default) makes accepting a rest
the GM requested through the system rest straight away, instead of opening a dialog whose options
are all locked. A character resting on their own still gets the dialog. **Hide the System's Rest
Card** (on by default) stops the system posting its own rest message alongside Blacksmith's; it is
ignored while **Blacksmith Rest Card** is off, so a rest never reports nothing at all.

## Settings

GM only. In Blacksmith's settings, under **Run the Game** and then **Timers**, two headings carry
everything on this page: **World Clock** and **Rest and Recovery**.

Under **World Clock**:

| Setting | What it does |
|---|---|
| **Time Mode** | The same five modes as the clock menu. Easier to change from the menu. |
| **Slow Speed** | How fast time runs in Slow mode. Each choice says what it means at the table, from "0.05x - an hour of play is three in-world minutes" up to "0.9x - an hour of play is fifty-four in-world minutes". Default 0.25x. |
| **Fast Speed** | How fast time runs in Fast mode, from "2x - a minute of play is two in-world minutes" up to "720x - a minute of play is twelve in-world hours". Default 60x, an hour a minute. |
| **Minimum Update Interval** | The shortest gap, in real seconds, between clock updates while a mode runs. Lower for a smoother fast-forward at the cost of more updates sent to players. |
| **Single Arrow Step** | Minutes the single arrows move time. Default 10. |
| **Double Arrow Step** | Minutes the double arrows move time. Default 60. |
| **Sunrise** | The hour the sun rises. Places dawn on the sky panel, the **Dawn** jump, and the start of scene darkness lifting. Default 6. |
| **Sunset** | The hour the sun sets. Default 18. |
| **Twilight Length** | Minutes the change between day and night takes, centred on sunrise and sunset. Zero makes night fall instantly. Default 60. |
| **Darkness at Night** | How dark a driven scene is at night, from 0 (daylight) to 1 (pitch black). Default 0.85, which keeps moonlight. |
| **Ask About New Scenes** | Whether the **Darkness Control** question appears on a scene nobody has decided about. |
| **Darkness by Day** | How dark a driven scene is at midday. Leave at 0 unless the world is permanently overcast. |

Under **Rest and Recovery**:

| Setting | What it does |
|---|---|
| **Rests Move the Clock** | A rest advances the clock by its length; a grouped rest advances it once. |
| **Blacksmith Rest Card** | Post a Blacksmith card for each character when they rest. |
| **Skip the Rest Confirmation** | Accepting a rest the GM requested rests immediately, without the locked dialog. |
| **Hide the System's Rest Card** | Stop the game system posting its own rest message. Ignored unless the Blacksmith card is on. |
| **Track Food** and **Track Water** | On a long rest, each character eats or drinks from their inventory, or forages. The Rest window starts from these and can change them per rest. |
| **Food Items** and **Water Items** | Comma-separated item names that count, searched in order. Case does not matter. |
| **Allow Foraging** | Whether a character short of food or water gets a Survival check at all. |
| **Going Without Causes Exhaustion** | Whether ending a long rest short of food or water costs a level. |
| **Players Roll to Forage** | Whether the card carries a **Forage** button for the player, or the check is rolled for them. |
| **Foraging DC** | The Survival DC. Default 12. |
