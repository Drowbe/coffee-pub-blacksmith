# Experience

**Audience:** GMs awarding experience points.

How the XP Distribution window opens when a fight ends, how it works out what each adversary was
worth and what happened to it, how to add milestone experience, and how the result reaches the
character sheets.

## Open the window

GM only. With **Enable Distribution** on, under **Rolling and Progression**, **XP Distribution**,
and **XP Configuration**, the **Experience Distribution** window opens by itself when a combat
ends. It can also be opened at any time from the combat bar: **View Pending Experience** on the
encounter button during a fight, or **Party Experience** on the out-of-combat row, which is how a
milestone gets awarded with no fight at all.

With **Auto Distribute** on, the window is skipped and the experience is awarded the moment the
combat ends, using everything below at its defaults.

## Check each adversary's resolution

GM only. The window's top half lists every adversary from the fight under **Adversary Name**,
**Level**, and **Experience Points**, with a **Resolution** for each and the **Multiplier** and
**Adjusted** value it produces. Blacksmith works out the resolution from what happened during the
fight, and remembers it even for a monster whose token was looted and cleared before the end:

| Resolution | Meaning | Multiplier by default |
|---|---|---|
| **Defeated** | Killed or knocked out. | Full value. |
| **Negotiated** | Talked down. | Full value. |
| **Captured** | Taken alive. | Full value. |
| **Escaped** | Got away. | Half. |
| **Ignored** | Never engaged. | Nothing. |
| **Removed** | Taken out of the fight by the GM. | Nothing. |

Change any resolution from its drop-down and the adjusted values and the total follow. The
multipliers are the **Defeated**, **Negotiated**, **Captured**, **Escaped**, and **Ignored**
settings under **XP Multipliers**.

## Choose how the total is worked out

GM only. **Calculation Method** chooses between **D&D 5e RAW (CR-based XP Calculations)**, which
values each adversary from its challenge rating, and **Narrative/Goal-Based XP (Manual Entry)**,
for tables that award by story rather than by kill. **Party Size Handling** chooses **D&D 5e RAW
(No Multipliers)** or **House Rules (Scale for Party Size)**; the window shows the party size it is
using as **Distribution Size**.

## Add a milestone

GM only. The window has two switches: **Experience Points**, on when there was a fight, and
**Milestones**, on when there was not. Turn on **Milestones** to add a story award alongside or
instead of the monster experience: give it a **Title**, a **Category** (**Combat**, **Discovery**,
**Narrative**, **Notable Moment**, **Quest**, or **Other**), a **Description**, and the
**Experience Points** it is worth. The milestone is shared out along with everything else.

## Award it

GM only. The bottom of the window lists each **Party Member** with their share, and **Total XP**
and **Per Player** above them. Press the apply button to write the experience onto every character
sheet; the cancel button closes the window and awards nothing. The window then closes and an **XP
Distribution Complete** card is posted to chat summarising **Monster XP**, **Milestone XP**, the
resolutions, and each character's award. **Share Results** decides whether the players see that
card or only the GM does.
