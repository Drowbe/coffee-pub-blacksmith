# Scenes

**Audience:** GMs managing scenes, and players who want to know what the scene markers mean.

How to read the scene indicators, change what a click on a scene does, describe where a scene is in
the world, let its light follow the clock, and see clearly as the GM.

## Read the scene indicators

Anyone. With **Show Scene Indicators** on, under **User Experience** and **Scenes**, each scene's
title in the scene directory and the navigation bar carries icons saying which scene is active for
the table and which one you are looking at. The two often differ: the GM can be preparing one scene
while the players are on another.

**Title Alignment**, **Title Size**, **Title Padding**, and **Panel Height** in the same place
change how the scene titles are drawn.

## Change what a click on a scene does

GM only. With **Custom Mouse Behaviors** on, clicks in the scene directory do more than Foundry's
default: a **left-click** views the scene, a **double-click** activates it for everyone, and a
**shift-left-click** opens its configuration.

## Say where a scene is

GM only. Open the scene's configuration and go to the **Geography** tab. Four rows place the scene
in the world, broadest first:

| Field | What goes in it |
|---|---|
| **Realm** | The world or plane, such as a whole setting. |
| **Region** | A kingdom, territory, or expanse within it. |
| **Site** | A city, mine, or stronghold within the region. |
| **Area** | A room, street, or zone within the site. |

A fifth row, **Ambience**, names the kind of terrain: mountain, arctic, coastal, swamp, desert,
underdark, forest, underwater, grassland, urban, hill, or planar. A row left empty reads "Not set".

A new scene starts from the campaign's defaults, the **Realm**, **Region**, **Site**, and **Area**
under **Campaign Settings** and **Geography**; once you change a scene's own rows, they win. What is
written here is stored on the scene, so it travels with the scene when it is exported or duplicated,
and other Coffee Pub modules read it to know where the party is.

## Let the scene's light follow the clock

GM only. The **Time of Day** box on the same **Geography** tab has one switch, **Darkness follows
the world clock**. With it on, the scene brightens and darkens with the in-world time. The clock
guide says how the day is shaped and what else the scene needs turned on; see
[the world clock guide](userguide-worldclock.md).

## See clearly as the GM

GM only. Quickview is a clarity mode for the GM's own screen: a brighter view, the fog revealed,
and a highlight on tokens outside the current line of sight, so you can see the whole scene without
changing anything the players see. Turn it on and off from the menu at the left of the Blacksmith
bar (**GM Quickview On** or **Off**) or with the **Toggle Quickview** shortcut in Foundry's controls
settings. Under **Run the Game** and **Vision**, **Enable Quickview** loads the feature, **Darkness
overlay strength** sets how much of the scene darkness remains while it is on, and **Out-of-sight
token highlight color** picks the highlight.

## Hide the interface

Anyone. **Hide UI** in the same left-hand menu clears Foundry's interface away from the canvas; the
choices of what to hide are under **User Experience** and **Canvas Tools**. See
[the Blacksmith bar guide](userguide-menubar.md).
