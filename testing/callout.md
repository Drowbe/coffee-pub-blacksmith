# Testing: callout

**Audience:** us.

Scope: the data box that points at the canvas (`scripts/api-callout.js`, `styles/callout.css`) and the pin callout on hover (`scripts/utility-pin-callout.js`, the Callout section in Configure Pin). Nothing here has run in Foundry. Remove an item when it passes, and delete this file when it is empty. Results go to the **Verified** line of the CHANGELOG entry, not back into this file.

Setup, as a GM on a scene, in the browser console:

```javascript
const pins = game.modules.get('coffee-pub-blacksmith').api.pins;
const callout = game.modules.get('coffee-pub-blacksmith').api.callout;
await pins.create({ id: foundry.utils.randomID(16), moduleId: 'zz-callout-probe', type: 'shop', x: 1500, y: 1200, text: 'The Gilded Anvil', image: 'fa-solid fa-hammer', calloutDisplay: 'hover', config: { callout: { subtitle: 'Blacksmith, Phlan', badges: [{ text: 'Open', variant: 'success' }, 'Smith'], body: 'Mends armour and sharpens blades.\nClosed on festival days.', rows: [{ label: 'Gold', value: '1,240 gp', icon: 'fa-solid fa-coins' }, { label: 'Stock', value: 'Fair' }], footer: 'Last visited 3 days ago' } } });
pins.registerContextMenuItem('zz-callout-probe-hi', { name: 'Say hi', icon: '<i class="fa-solid fa-hand"></i>', moduleId: 'zz-callout-probe', onClick: (pin) => ui.notifications.info(`Hi from ${pin.text}`) });
```

1. Pin callout shows. Put the pointer on the Gilded Anvil pin. Expected: a dark box opens beside it with the hammer icon in a tile, the title, "Blacksmith, Phlan", a green Open badge and a Smith badge, the two body lines (the break kept), Gold and Stock rows with the values on the right, the footer, and two buttons, Say hi (with its hand icon) and Configure Pin (with a cog). A tail points at the pin.
2. It follows. With the box open, scroll the wheel to zoom and drag the canvas. Expected: the box stays next to the pin and the tail keeps pointing at it. The box does not change size.
3. It goes. Move the pointer off the pin and the box. Expected: the box closes about a fifth of a second later.
4. Crossing the gap. Move from the pin onto the box slowly, then press Say hi. Expected: the box stays open the whole way; the notification "Hi from The Gilded Anvil" appears and the box closes.
5. Press hides it. With the box open, press the pin (left button, then right button on a second try). Expected: the box closes at once; right button opens the pin's menu with Say hi in it.
6. Edges. Drag the canvas until the pin is at the top edge, then the right edge. Expected: the box flips below the pin, then to its left, always fully on screen; the tail still points at the pin.
7. Off screen. Pan until the pin is outside the view with the box open (hold the pointer still). Expected: the box is not drawn, and is drawn again when the pin returns.
8. The option. Open Configure Pin on the pin and the Appearance tab. Expected: a Label section (Text layout, Text display, colour, size) and, under it, a Callout section whose Show select reads Hover. Set Show to Never and save. Expected: no box on hover. Set it back to Hover.
9. A plain pin. Create a pin with no `config.callout` and `calloutDisplay: 'hover'`. Expected: a small box with the title, and the type's name as the subtitle if the type is registered. No empty gaps for the missing parts.
10. Existing pins. Hover a pin made before this change. Expected: no box.
11. Update All. In Configure Pin on one of several pins of the same type, turn on Update All, tick it on the Callout section with Show set to Hover and save. Expected: the other pins of that type show the box on hover.
12. Player. As a player, hover a pin that has Hover set. Expected: the box shows, without Configure Pin unless the player can edit the pin, and without any button whose context-menu item is `gmOnly`.
13. Scene change. Open a box and switch scene by clicking in the sidebar while the pointer is still on the pin. Expected: the box is gone and none is left over.
14. Delete. With the box open, delete the pin with the Delete key. Expected: the box closes.
15. API, point anchor.

```javascript
callout.show('zz:point', { anchor: { x: 1800, y: 1200 }, title: 'Phlan ↔ Melvaunt', subtitle: 'Road', icon: 'fa-solid fa-route', badges: ['Trade route', { text: 'Dangerous', variant: 'danger' }], rows: [{ label: 'Distance', value: '55 mi' }, { label: 'On foot', value: '3 days' }], actions: [{ label: 'Close it', onClick: () => {} }] });
```

   Expected: the box opens at that scene point and stays there while panning. It does not close when the pointer leaves it. Then `callout.update('zz:point', { title: 'Changed' })` changes the title in place, `callout.isOpen('zz:point')` is true, and `callout.hide('zz:point')` closes it.
16. API, escaping. `callout.show('zz:esc', { anchor: { x: 1800, y: 1200 }, title: '<img src=x onerror=alert(1)>', rows: [{ label: '<b>x</b>', value: '<i>y</i>' }], icon: 'x" onmouseover="alert(1)' })`. Expected: the title and rows show as literal text, no alert, and no icon tile is drawn. Clean up with `callout.hideAll('zz:')`.
17. API, bad input. `callout.show('zz:bad', { anchor: {}, title: 'x' })`. Expected: a `TypeError` naming the anchor. The same with no title names the title.
18. API, other anchors. `callout.show('zz:token', { anchor: { uuid: canvas.tokens.placeables[0].document.uuid }, title: 'A token' })`. Expected: the box points at that token and follows it as you pan.
19. API, abort. Show a callout with `signal: ac.signal` and call `ac.abort()`. Expected: it closes.
20. Look. Open a box under Foundry's light theme as well as the dark one. Expected: the box is a dark panel with readable light text and readable button labels in both.
21. The tabs. Open Configure Pin. Expected: the tabs read General, Tags, Pin, Appearance, Animations. Pin holds Pin Design (Size, Shape, Background, Border, Icon Color, Drop shadow) above Pin Source; Appearance holds Label and Callout and no Pin Design. Switch between tabs, change a value on each and save. Expected: every change is kept. As a player who owns a pin: Pin, Appearance and Animations only.
22. Callout appearance. In the Callout section set Width 360, Background #1d3557, Border #e63946 with width 3, Icon Color #ffd166, Drop shadow off, Text color #f1faee, Text size 15, then save and hover the pin. Expected: a wider box, a blue fill, a red 3px border (the tail carries the same border), a yellow icon, no shadow, and light 15px text; the subtitle, row labels and footer are the same colour, fainter; the Open and Smith badges and the buttons are readable against the blue.
23. Colour pairs. In the Callout section type #00ff00 in a colour box and pick a colour with its swatch. Expected: the swatch follows the text and the text follows the swatch. Type red, then save. Expected: no error, and the box keeps its previous colour for that field.
24. Limits. Set Width 50, Border width 20, Text size 3 and save. Reopen. Expected: 160, 8 and 8.
25. Default and a new pin. Turn on Default for the type, tick Default on Callout only and save. Create another pin of that type with `pins.create({ ...fields, ...pins.getDefaultPinDesign(moduleId, type) })`. Expected: it has the same `calloutDisplay` and `calloutStyle`, and shows the same box on hover.
26. Image. In the Callout section set Image to None and save. Expected: the box has no picture tile and the title sits at the left. Set it to Mirror pin. Expected: the pin's own image or icon, as before. Set it to Custom image. Expected: a URL box, Browse, Image Fit and a preview appear (Zoom level only when the fit is Zoom). Browse to an image, set Cover, save and hover. Expected: that image in the tile. Try Contain, Fill, Actual Size, Scale Down and Zoom at 150%. Expected: the tile shows each fit, with Zoom cropping rather than growing the tile. A Custom image with an empty URL shows no tile.
27. API style.

```javascript
callout.show('zz:style', { anchor: { x: 1800, y: 1200 }, title: 'Styled', style: { fill: '#1d3557', stroke: '#e63946', strokeWidth: 2, shape: 'square', textColor: '#ffffff', textSize: 14, dropShadow: false } });
```

   Expected: the box looks as set. Then `callout.update('zz:style', { style: {} })`. Expected: back to the stock dark panel. Then `callout.show('zz:bad', { anchor: { x: 1800, y: 1200 }, title: 'Bad', style: { fill: 'red; background: url(x)', stroke: 'javascript:1' } })`. Expected: the stock panel, nothing else changed. Clean up with `callout.hideAll('zz:')`.
28. Read-out. `callout.show('zz:ro', { anchor: { x: 1800, y: 1200 }, title: 'Read-out', rows: [{ label: 'Distance', value: '5 mi' }], interactive: false })`, then drag the canvas with the pointer starting over the box. Expected: the canvas pans (the box never takes the pointer) and the box shows no buttons. `callout.show('zz:ro', { anchor: { x: 1800, y: 1200 }, title: 'x', interactive: false, actions: [{ label: 'A', onClick() {} }] })`. Expected: a `TypeError` about actions. `callout.update('zz:ro', { interactive: true })` on the open one. Expected: the box takes the pointer again.
29. Corners. For each of `top-left`, `top-right`, `bottom-left`, `bottom-right`: `callout.show('zz:c', { anchor: { x: 1800, y: 1200 }, title: 'Corner', rows: [{ label: 'a', value: 'b' }], side: '<corner>' })`. Expected: the box sits that way off the anchor, clear of it on both axes, with the tail on the edge facing the anchor, near the corner. Pan until the anchor is near the screen edge. Expected: the box flips to another corner or side to stay on screen and the tail still points at the anchor. `side: 'diagonal'` throws a `TypeError`.
30. Gap. `callout.show('zz:g', { anchor: { x: 1800, y: 1200 }, title: 'Gap', side: 'right', gap: 2 })` then `gap: 40`. Expected: the box sits nearer, then farther, from the anchor. `gap: 'x'` throws a `TypeError`. Clean up with `callout.hideAll('zz:')`.
