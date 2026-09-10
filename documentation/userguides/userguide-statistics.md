# Statistics

**Audience:** GMs who want to know how a fight went, and players who want to see how they did.

What Blacksmith counts during a combat, the cards it posts at the end of a round and of a fight,
how the MVP is chosen and tuned, and how to read and manage the party's and each player's records.

## Turn tracking on

GM only. Under **Run the Game**, **Statistics**, and **Tracking**, **Player Statistics** counts
what each character does, and **Combat Statistics** counts the round itself: turn durations, timer
expirations, and the like. Both are on by default. With them off nothing below is recorded.

## What gets counted

Nothing to do; this is what the tracker watches during a fight, for everyone in it:

- **Attacks**: hits, misses, critical hits, and fumbles, and from them each character's accuracy.
- **Damage** dealt and taken, by type and by weapon, and the biggest single hit.
- **Healing** given and received.
- **Kills**, credited to whoever landed the killing blow, plus deaths and revives.
- **Turn time**: how long each turn took, and how long planning took.
- **Notable moments**: the standout damage, healing, and turns of the round.

All of it comes from the game system's own rolls and chat messages; no other module is needed. A
player's rolls reach the GM's tally through Blacksmith's own connection.

## Read the round and combat cards

Everyone the GM shares with. At the end of each round, and again when the combat ends, cards are
posted to chat. **Share With Players** under **Sharing** decides whether the players get them or
the GM alone.

Each card is its own switch, so a table can have as many or as few as it likes:

| Under **Round Summary Sharing** | Under **Combat Summary Sharing** | What it shows |
|---|---|---|
| **Round Summary** | **Combat Summary** | Turn and planning durations, accuracy, and the other headline measures. |
| **Round MVP** | **Combat MVP** | Who did best, with a sentence saying why. |
| **Notable Moments** | **Combat Notable Moments** | The standout moments. |
| **Show Party Breakdown** | **Combat Party Breakdown** | Every party member's numbers, one row each. |

The combat bar's readout shows the same figures live while the fight is on; see
[the combat guide](userguide-combat.md).

## Tune the MVP

GM only. The MVP is scored from each character's counts, and the weights under **MVP Tuning** say
what counts for how much: **Damage Weight** and **Healing Weight** per ten points, **Hit Weight**,
**Miss Weight**, **Crit Weight**, **Fumble Weight**, and **Kill Weight**. A positive weight adds to
the score and a negative one takes away, so a table that wants to punish fumbles sets that weight
below zero. **Normalize MVP Scoring By Party Max** scores each category against the best in the
party for that round or combat, so a high-damage class does not win on raw numbers alone.

## Open the party's records

GM only to open from the bar. On the combat bar's encounter button choose **View Current
Statistics**; the same window also opens from the out-of-combat row's **Statistics** entry. The
**Party Statistics** window has two parts:

- **Lifetime Leaderboard** ranks the players by MVP, with **Total MVP**, **Avg MVP**, **Best
  MVP**, **Encounters**, **Accuracy**, **Damage Dealt**, **Damage Taken**, **Heals Given**,
  **Kills**, **Crits**, and **Fumbles** for each, and under **Actions** a **View Player Stats**
  button and, for the GM, **Clear Player Stats**.
- **Combat History** lists every recorded fight by **Date**, **Encounter**, **Rounds**,
  **Duration**, **MVP**, and the standout figures (**Biggest Hit**, **Most Hits**, **Most Misses**,
  **Most Crits**, **Most Fumbles**, **Top MVP**), each with **Delete this Encounter**.

## Open one player's records

Anyone with the Party Statistics window open. Press **View Player Stats** on a leaderboard row.
**Player Statistics** shows the character's **MVP Score** (**Total Score**, **Average Score**,
**High Score**), **Combats** fought, attacks (**Total Hits**, **Total Misses**, **Hit Rate**,
**Accuracy**), **Damage** (**Total Damage**, **Biggest Hit**, **Damage by Type**, **Damage by
Weapon**), **Total Healing** (**Total Given** and **Total Received**), and **Kills**, **Deaths**,
**Revives**, **Crits**, and **Fumbles**.

## Keep, move, or clear the records

GM only. These records are real campaign data and every clearing asks first and cannot be undone.

| Control | What it does |
|---|---|
| The export button above **Combat History** | Saves every combat and every player's statistics to a file. |
| The import button | Reads such a file back in. |
| **Delete all combat history** | Removes every recorded fight and, with them, every player's statistics. |
| **Delete this Encounter** | Removes one fight and takes its contribution out of every player's statistics. |
| **Clear Player Stats** | Wipes one character's lifetime numbers. |

Export before clearing anything you might want back.
