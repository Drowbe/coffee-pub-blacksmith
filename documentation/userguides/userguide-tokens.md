# Tokens

**Audience:** GMs setting up how tokens behave, and players who wonder why the canvas looks the way
it does.

What Blacksmith does to a token when it is dropped, how it turns and sounds as it moves, the rings
and blood it draws on the canvas, and the buttons that clear them.

## Name a token as it is dropped

GM only to set up; it happens on every drop. Under **Automation**, **Dropped Tokens**, and **Token
Renaming**, **Format** chooses how a dropped token is named, including drawing a random name from
the **Random Name Table**, a roll table you pick. **Ignored Tokens** lists names, comma-separated,
that are left alone, and **Fuzzy Match** makes a name match if any part of it contains the word
rather than only when it matches exactly.

Under **Names by Type & Role**, a separate table can be chosen for each creature type and for a few
subtypes and roles: a goblinoid, an elf, a cultist, a thug. The most specific match wins, so a
"Goblin Boss" draws from the goblinoid table while a plain humanoid falls back to the general one,
and anything with no table set falls back to the **Random Name Table**. **Naming Taxonomy (JSON)**
points at the file that defines those categories, if you want your own; the list in settings
rebuilds after a reload.

## Change what a dropped token is set to

GM only. Under **Token Overrides**: **Unlock Token Rotation** clears Foundry's lock so new tokens
can turn; **Disable Token Ring** turns the dynamic ring off on new tokens; and with **Enable Image
Fit Mode** on, **Image Fit Mode** (**Fill**, **Contain**, **Cover**, **Full Width**, or **Full
Height**) is applied to each dropped token's artwork.

## Turn tokens to face the way they move

GM only to set up. With **Token Rotation** on under **Token Configuration**, a token turns to face
the direction it just moved, once it has moved at least the **Minimum Movement Threshold** in grid
units. **Rotation Mode** limits it to **All Tokens**, **Player Tokens Only**, **NPC Tokens Only**,
or **Combat Tokens Only**. A token with Foundry's own lock rotation set is never turned.

## Hear tokens move

GM only to set up; everyone hears it. **Enable Movement Sounds** plays a sound when a token moves
at least the **Movement Sound Distance Threshold** in feet: the **Player Movement Sound** for
player tokens and the **Monster Movement Sound** for the rest, at the **Movement Sound Volume**.

Party movement modes, which decide whether a player may move at all, are set from the bar; see
[the Blacksmith bar guide](userguide-menubar.md). **Follow Distance Threshold** and **Token
Spacing** here tune the Conga and Fastest Path modes: how far a token can fall behind the leader
and still be in the line, and how many squares the line keeps between tokens.

## Mark whose turn it is

GM only to set up; everyone sees it. Under **Run the Game**, **Token Enhancements**, and **Current
Turn**, the token whose turn it is wears a ring: **Style** (**Solid Circle**, **Dashed Circle**,
**Circle with Spikes**, **Circle with Inward Spikes**, or **Rounded Square**), **Animation Type**
(**Pulse (Opacity)**, **Rotate**, **Wobble (Scale)**, or **Fixed (No Animation)**), **Animation
Speed**, **Border Color**, and **Background Color**. **Enable Turn Indicator** under **Shared Token
Indicator Settings** is the master switch for every indicator on this page, and **Border
Thickness**, the border offset, and the opacity settings there are shared by all of them.

## Mark what is targeted

GM only to set up; everyone sees it. Under **Targeted Tokens**, a token somebody has targeted
wears a ring of the same styles. With **Use Player Color for Target Rings** on, each targeting
player's ring takes their own colour from Foundry's user configuration, and several players
targeting one token get concentric rings; off, the **Default Border Color** and **Default
Background Color** are used. **Show Targeter Portraits** floats a small portrait of each targeting
player above the token, with **Portrait Shape**, **Portrait Size**, and **Portrait Image Source**
(**Character Portrait**, **Character Token**, or **Player Avatar**).

## Show blood as creatures are hurt

GM only to set up; **Token Blood Visibility** decides who sees it. Under **Health Indicators**:

- **Blood Damage** draws a pool of blood on the ground under a token that grows as it loses hit
  points, through the **Injured Threshold**, **Bloodied Threshold**, and **Critical Threshold**
  percentages, widest and darkest at zero. Any damage at all shows a small pool.
- **Blood Hit** adds a brief burst from the token the moment it is hit, scaled to the damage, with
  the **Blood Hit Sound**. **Blood Hit Trigger** fires it **When Damage Is Applied** or **On a
  Successful Attack Roll**.
- **Blood Cleanup** removes a pool so many seconds after the token was last hurt, and **Mop the
  Dead** removes a dead token's pool so many seconds after it died. New damage brings the blood
  back.
- **Token Blood Visibility** is **Everyone** or **GM Only**; the latter keeps players from reading
  enemy health off the canvas.

The three thresholds are the same ones the combat bar's portrait rings and the Health window use,
so everything that colours health agrees.

## Clear the blood, or bring it back

GM only. Two buttons in the Blacksmith group of Foundry's scene controls: **Remove All Blood**
clears every pool and burst on every screen, and the cleared tokens stay clean until they next take
damage; **Restore All Blood** redraws every wounded token's pool from its current hit points,
including pools that the cleanup timers had removed.

## Clear your targets

Anyone. With **Clear All Targets Button** on (under **User Experience** and **Toolbar**, your own
choice), a button under Foundry's Select Targets tool clears every token you are targeting. The
combat bar's **Tools** menu has the same **Clear All Targets**.

## A guard against a game system bug

GM only. **Encumbrance Guard (dnd5e workaround)**, under **Developer Tools** and **System**, works
around a game system bug where two quick writes to one actor both try to
create the same encumbrance effect and print an error. It is on by default and does nothing a
player can see; turn it off if a future system release fixes the bug.
