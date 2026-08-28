# Fullscreen Window — verification owed

**Proven:** nothing. The code has not been run in a world.

**Not proven:** all of it. The fullscreen base, its four layouts, and the conversion of Request a Roll's
Cinematic mode onto it were written without a live client.

None of this can be a harness check. Every item needs a person to look at a screen, and half of them need
two clients.

Delete each item as it passes. Delete the file when it is empty, and delete
`documentation/plans/plan-fullscreen-window.md` with it.

---

## The shell

- [ ] Paste into a script macro and confirm a bare surface opens, covers everything, and closes on Escape
      and on the X:
      ```js
      const { BlacksmithFullscreenWindowBaseV2 } =
          await import('/modules/coffee-pub-blacksmith/api/blacksmith-api.js');
      class T extends BlacksmithFullscreenWindowBaseV2 {
          static DEFAULT_OPTIONS = foundry.utils.mergeObject(
              foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
              { id: 'bs-fs-probe' });
          async getData() {
              return { appId: this.id, windowTitle: 'Probe', subtitle: 'centered',
                       bodyContent: '<p>' + '.'.repeat(200) + '</p>' };
          }
      }
      await new T().render(true);
      ```
- [ ] It covers the **canvas, sidebar, hotbar, players list, and any open window**. Open a character sheet
      first, then the probe, and confirm the sheet is behind it.
- [ ] It **blocks**: clicking where a token is selects nothing, and clicking a sidebar tab does nothing.
- [ ] A Foundry tooltip and a `ui.notifications.warn(...)` fired while it is open both render **above** it.
      This is what the pinned z-index is for.
- [ ] It fades in rather than appearing instantly, and fades out on close.
- [ ] Open the probe, then open it again without closing: the first is replaced, not buried, and there is
      exactly one `#bs-fs-probe` in the DOM afterwards.
- [ ] After closing, `foundry.applications.instances.get('bs-fs-probe')` is undefined and
      `BlacksmithFullscreenWindowBaseV2.current` is null.
- [ ] Escape with the probe closed still does whatever it did before — deselect a token, close a sheet.
      The listener must not survive the close.
- [ ] Override `onDismiss()` on the probe to log and **not** close. Escape and the X then do nothing,
      while `probe.close()` from the console still closes it.

## Layouts

- [ ] `centered` — panel is width-capped and centred, and a long body scrolls inside it rather than
      growing the panel past the viewport.
- [ ] `bar` — a full-width band, vertically centred, with its drop shadow **not** clipped.
- [ ] `split` — the body's two children sit side by side, and collapse to one column when the window is
      narrowed below 900px.
- [ ] `full` — content runs edge to edge with no panel chrome.
- [ ] An unknown `fullscreenLayout` value falls back to `centered` rather than rendering unlaid-out.

## Backdrop

- [ ] `fullscreenBackdrop: { image, color, opacity: 0.35, blur: 8 }` shows the image at partial strength
      over the colour, with the **content at full strength**. If the text is dimmed too, the image layer
      has collapsed into the surface.
- [ ] `imageBlur: 6` blurs the **image** without blurring the content over it, and without a soft
      fade around the edges of the screen -- the layer is oversized by 40px for exactly that.
- [ ] `fit: 'tile'` repeats; `contain` fits; `cover` fills.
- [ ] A plain Foundry path (`modules/.../thing.webp`) loads -- no 404 in the console. A relative path
      inside a custom property resolves against the *stylesheet*, not the document, so an unresolved
      one is fetched from under `styles/`.
- [ ] A `data:` URI works as an image, and a path containing a parenthesis or a quote loads or fails
      cleanly without breaking the surface's styling.

## Zones

- [ ] Header on by default; tools and action bar absent until `showTools` / `showActionBar` are returned.
- [ ] `showHeader: false` removes the header without leaving a gap.
- [ ] A button in `actionBarRight` with a `data-action` reaches its `ACTION_HANDLERS` entry, and the
      handler's third argument is the instance.

## Cinematic mode — the conversion

This is the live feature. It is the item most likely to have broken.

- [ ] GM requests a skill check in Cinematic mode. The band appears with its background banner, title,
      subtitle, and actor cards, and slides up as the surface fades in — as it did before.
- [ ] The red skull backdrop is visible above and below the band, blurred into texture rather than
      legible detail, and it does not make the band or the card text harder to read. This is a look the
      author has to judge: `opacity`, `blur`, and `imageBlur` in `CinematicOverlay.DEFAULT_OPTIONS` are
      the three knobs.
- [ ] The dice buttons roll. Results appear on the cards.
- [ ] A group roll shows the group results banner over the band at the end.
- [ ] A contested roll shows the VS divider and the winning-side banner.
- [ ] The sequence fades out and closes on its own when every card has a result. Afterwards
      `foundry.applications.instances.get('cpb-cinematic-overlay')` is undefined — if the element is gone
      but the instance is not, the close path is still detaching the element by hand.
- [ ] **New behaviour:** Escape closes the cinematic. It never did before.
- [ ] **GM** clicks the close X (or presses Escape): the cinematic closes on **every** client. That is the
      GM-only broadcast in `_hideCinematicDisplay`, reached through the base's `onDismiss`.
- [ ] **A player** clicks the close X (or presses Escape): it closes for **that player only**. The GM's and
      the other player's cinematics stay up. A player is getting it out of the way, not ending the scene.

### The player closes it and rolls anyway

This is the workflow the whole separation exists for. Two players and a GM.

- [ ] Player A closes the cinematic, then clicks their row on the **chat card**, which opens the roll
      window. Rolling there updates the chat card **and** fills in A's result on Player B's and the GM's
      still-open cinematics. Before the fix the card updated and the overlays waited forever.

      The chat card row is the only other way to complete a requested roll -- the cinematic's dice buttons
      and this window are the codebase's only two `processRoll` call sites. The Dice Tray is a formula
      builder and is not connected to roll requests.
- [ ] With every character now rolled, the group or contested banner appears on the clients that still have
      an overlay, and those overlays fade out on their own. Player A, who has none, sees nothing and
      throws nothing in the console.
- [ ] Player A hears the ordinary roll-result sound, not silence -- the individual sound follows their own
      presentation, not the request's.
- [ ] Conversely, when the sequence ends by itself, each client closes its own surface and **no** close
      message is broadcast — watch for a double-close or a console error on the second client.
- [ ] Run two cinematic requests back to back without closing the first. The second replaces the first.
- [ ] A player who owns none of the requested actors sees the hourglass, not roll buttons.
