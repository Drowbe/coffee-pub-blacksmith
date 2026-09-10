# Timers

**Audience:** GMs keeping a session and its fights to time, and players watching the clock.

How to set the session timer on the bar, run the planning and turn timers in the combat tracker,
read the round timer, and nudge a slow player.

All four timers run on real time. The in-world clock is a different thing; see
[the world clock guide](userguide-worldclock.md).

## Set the session timer

GM only to set; everyone can read it. The session timer is the last readout on the right of the
Blacksmith bar. Before it is set it reads **Set Time**; while it runs it counts down in hours and
minutes; inside the warning window it adds seconds and the readout changes colour; and when it
runs out it reads **Time's Up!**.

Click it for the menu:

| Entry | What it does |
|---|---|
| **Default Time** | Starts the timer with the default from settings. The entry shows what that is. |
| **Last Used** | Starts it with whatever you set last time. |
| **Set Duration** | A submenu from half an hour up to eight hours in half-hour steps, and **Custom...** for anything else, up to ten hours. |
| **Set Time** | A submenu of end times on the half hour, and **Custom...**. The timer counts down to that clock time. |

Opening the menu from the keyboard gives the **Set Session Time** dialog instead, with a **Session
Duration** in hours and minutes and a box to make it the new default.

When the remaining time reaches the **Warning Threshold** the **Warning Message** is announced and
the **Warning Sound** plays; when it runs out, the **Session Over Message** and **Session Over
Sound**. **Session Timer** under **Notifications** chooses whether those announcements arrive as a
toast, a chat card, both, or neither.

The settings sit under **Run the Game**, **Timers**, and **Session Timer**: **Default Time** chooses
between a **Fixed Duration** in minutes and a **Specific Time** end on the half hour, and the GM's
client applies that default on its own when a new game day starts or the last timer has expired.

## Run the planning timer

GM only to control; players see it. At the start of each round, before the first turn, a planning
bar appears at the top of Foundry's combat tracker, labelled with the **Timer Label** (**Planning**
unless you change it) and counting down the **Planning Duration**. It is for the players to plan
the round.

It starts paused. Click the bar to start it, and click again to pause; with **Auto-Start** on it
runs the moment it appears. It ends when it runs out, announcing the **Planning Ended Message** with
the **Planning Ended Sound**, or when you move to the first turn. As it nears the end it warns at
the **Critical Threshold** with the **Critical Message** and **Critical Sound**. **Enable Planning
Timer** turns the whole thing off.

**Planning Timer** under **Notifications** chooses the channel for its announcements, with a switch
for each: **Send Starting Message**, **Send Pause/Resume Messages**, **Critical Threshold Message**,
and **Send Planning Ended Message**.

## Run the turn timer

GM only to control; the current player can end their turn from it. Once every initiative is rolled,
a bar appears under the current combatant in Foundry's combat tracker, labelled with the **Timer
Label** (**Turn** unless you change it) and counting down the **Turn Duration**. The same time is
drawn into the combat bar's readout.

Whether it starts on its own is up to two settings: **Auto-Start Turn Timer** starts it the moment
the turn begins, and **Activity Trigger** starts it when the active combatant moves their token,
attacks, deals damage, or targets something. Otherwise it waits until you click it. Clicking the
bar pauses and resumes it, and the **Pause/Resume Sound** plays at the **Sound Volume** set under
**Global Settings**.

What each person sees on the bar:

- **The player whose turn it is** sees an **END TURN** overlay on it. Clicking that ends their turn
  without waiting for the GM.
- **Every other player** sees a hurry-up overlay instead. Clicking it nudges the current player; see
  "Nudge a slow player" below.
- **The GM** sees the plain bar and controls it.

At the **Critical Threshold**, a percentage of the turn, the **Critical Message** is announced with
the **Critical Sound**; the message can carry the combatant's name. When time runs out the
**Expired Message** is announced, and with **Auto-Advance Turn** on the turn ends by itself and the
**Auto Advance Message** says so. **Enable Turn Timer** turns the timer off.

**Combat Timer** under **Notifications** chooses the channel, with **Turn Starting Notification**,
**Send Pause/Resume Messages**, **Critical Threshold Messages**, and **Turn Ended Notification** as
its switches.

## Read the round timer

Anyone. With **Enable Round Timer** on, the combat tracker's header shows two clocks: **Round
Duration**, how long the current round has taken, and **Total Combat Duration**, how long the whole
fight has. Nothing controls them; they simply run.

## Keep the timers to yourself

GM only. **GM-Only Timers**, under **Global Settings**, hides the planning and turn timers from the
players' trackers; the session timer is unaffected. **Show Timer Popup Notifications** turns the
timers' pop-up announcements on or off for everyone, and the **Notification Override List** names
the characters, comma-separated, whose players should still see them when they are off.

## Nudge a slow player

The GM, or any player who is not the current one. Right-click a portrait on the combat bar and
choose **Hurry Up**, then **Send to Player** to nudge the player who owns it or **Send to Party** to
nudge everyone; a player clicks the hurry-up overlay on the turn timer. The target sees a **HURRY
UP!** toast, and the sender is told the nudge went. **Hurry Up Nudges** under **Notifications** picks
the channel, and **'Hurry Up' Sound** picks what plays.
