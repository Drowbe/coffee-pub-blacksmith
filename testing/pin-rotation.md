# Testing: pin rotation

**Audience:** us.

Scope: turning a pin with Shift + wheel (`scripts/manager-pins-renderer.js`) and drawing its rotation (`styles/pins.css`). The schema and taxonomy rules are covered by the Pins suite in the test harness (`rotation-contract` and `rotatable-declaration`); everything here needs a canvas, a selection and a wheel. Remove an item when it passes, and delete this file when it is empty. Results go to the **Verified** line of the CHANGELOG entry, not back into this file.

Setup, as a GM on a scene: register a rotatable type and place a pin of it, with an image pin and a Font Awesome icon pin if you can, and one pin of an ordinary type.

```javascript
const pins = game.modules.get('coffee-pub-blacksmith').api.pins;
pins.registerPinTaxonomy('zz-rotation-probe', 'turner', { label: 'Turner', tags: [], rotatable: true });
await pins.create({ id: foundry.utils.randomID(16), moduleId: 'zz-rotation-probe', type: 'turner', x: 1000, y: 1000, text: 'Turn me', image: 'fa-solid fa-arrow-up' });
await pins.create({ id: foundry.utils.randomID(16), moduleId: 'zz-rotation-probe', type: 'plain', x: 1300, y: 1000, text: 'Not me', image: 'fa-solid fa-arrow-up' });
```

1. Basic turn. Click the Turner pin to select it, put the pointer over the board, hold Shift and scroll. Expected: the arrow turns in 15 degree steps as the wheel moves, scrolling down turns it clockwise, and the map does not zoom.
2. The label stays put. Same pin, text layout `under`. Expected: the pin's border and fill do not turn and the text "Turn me" stays horizontal and where it was while the arrow turns.
3. One write per gesture. Watch `Hooks.on('blacksmith.pins.updated', (d) => console.log(d.patch))`, then scroll ten notches quickly and stop. Expected: one log line with `{ rotation: 150 }` about a moment after you stop, not ten.
4. Persistence. Reload Foundry. Expected: the arrow is still turned to the same angle, and `pins.get(id).rotation` reads it.
5. Not rotatable. Select the Not me pin and Shift + scroll. Expected: nothing turns and the map zooms or scrolls as it normally does.
6. No selection. Click empty canvas so nothing is selected, then Shift + scroll over a rotatable pin. Expected: the pin does not turn; Foundry handles the wheel.
7. Permission. As a player who cannot edit the pin, select it (if you can) and Shift + scroll. Expected: nothing turns. Then give that player ownership of the pin, and repeat: it turns, and the GM client sees it turn after the pause (the player saves through the GM relay).
8. Other clients. With a second client open on the scene, turn the pin on the first. Expected: the second client shows the new angle after the pause, with no reload.
9. Wrap. Turn the pin counter-clockwise past 0. Expected: it passes through 355 with no jump, and `pins.get(id).rotation` reads a value in 0 to 360.
10. Switching pins. Turn pin A, and within a second select pin B and turn it. Expected: A is saved at its angle and B turns from its own, with no cross-over.
11. Deselect saves. Turn a pin and press Escape at once. Expected: the angle is saved without waiting for the pause.
12. Trackpad. On a laptop trackpad, Shift + two-finger scroll. Expected: it turns in 15 degree steps and the page does not scroll sideways.
13. Image pin. Repeat 1 and 2 with an image pin (circle shape and rectangle). Expected: the image turns inside the pin; on a rectangle the corners of the turning image are clipped by the pin and nothing spills out.
14. Zoomed out. Zoom the map out until the pins become dots. Expected: nothing odd; zoom back in and the pin is still turned.
15. The toggle. Open Configure Pin on the Not me pin, General tab. Expected: Can be Rotated (Shift + Mouse Wheel) sits under Allow Duplicates and is off. Turn it on and save, select the pin, Shift + scroll. Expected: it turns. Open Configure Pin on the Turner pin. Expected: the toggle is on. Turn it off and save. Expected: Shift + scroll no longer turns it.
16. The toggle follows the type when untouched. Open Configure Pin on a rotatable-type pin that has never been touched and save without touching the toggle. Expected: it still turns, and `pins.get(id).rotatable` is `undefined`.
17. Update All. On a Turner pin with another Turner pin on the scene, open Configure Pin, enable Update All and tick Permissions, turn the toggle off, save. Expected: after confirming, both pins stop turning.
18. Clean up the probe pins when done.
