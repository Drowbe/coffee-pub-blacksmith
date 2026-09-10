# Appearance

**Audience:** GMs and players changing how Blacksmith and Foundry look.

How to choose the chat card theme, restyle or pin the sidebar, and write your own CSS in the editor
without leaving Foundry.

## Choose the chat card theme

GM only. Under **User Experience** and **Chat Cards**, **Default Coffee Pub Theme** picks the look
of every card the suite posts: **Tan**, **Amber**, **Blue**, **Green**, **Red**, or **Orange**, each
also in a **(dark header)** version. Other Coffee Pub modules can override it for their own cards.
**Chat Gap** sets the space between chat messages for everyone, **Remove Chat Card Padding** strips
Foundry's own padding from Coffee Pub cards, and **Hide Roll Table Icon** hides the roll table icon
in the interface.

## Restyle the sidebar

Each person for their own screen. Under **User Experience** and **Sidebars**:

| Setting | What it does |
|---|---|
| **Style Sidebar** | Rounded corners, background colours, and better spacing on Foundry's sidebar. |
| **Pin Open** | Keeps the sidebar in place when its toggle is used. |
| **Combat Chat** | Adds a tab that shows the combat tracker and the chat log together, so a player can follow both at once. Takes effect after a reload. |
| **Manual Rolls** | Adds a button to the sidebar that turns manual dice entry on and off; Foundry's own dice configuration has to allow it. **Player Manual Rolls** lets players use the button too. |

The same manual rolls switch is on the bar's dice button; see
[the Blacksmith bar guide](userguide-menubar.md).

## Write your own CSS

GM only. Press **Open CSS Editor** in the Blacksmith group of Foundry's scene controls. The **CSS
Editor** is a full editor with syntax highlighting, and the CSS you write in it is applied to every
screen in the world, so a GM can restyle any part of Foundry or of the suite from inside the game.
Press **APPLY STYLES** to apply what you have written; **Copy CSS** copies it out, and **Clear
Editor** empties it. Two switches sit beside the editor: **Dark Mode** for the editor itself, and
**Smoothing**, which eases new styles into place rather than snapping them.

The same two switches are under **Developer Tools** and **CSS** as **Dark Mode** and **Smooth
Transition**, and the CSS itself is kept in a world setting, so it survives reloads and travels with
the world.

The design tokens the suite is built on, and how to style a module against them, are for people
writing modules and are in the design system documents rather than here.

## Toasts

The GM. Toasts are the short messages that pop up on screen. **Excluded Users**, under
**Notifications** and **Toasts**, lists the players who should never receive one, for a shared
screen or a streaming view.

## The loading screen

Anyone. While a world loads, Blacksmith shows its own progress screen with the phase it has
reached. It needs no setup; if it ever stalls at the last step, a reload clears it.
