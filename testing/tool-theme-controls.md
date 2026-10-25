# Testing: toggles and badges in Tool windows

**Audience:** us.

Scope: `.blacksmith-toggle` and `.blacksmith-badge` (`styles/window-form-controls.css`) inside a Tool window on each theme. Nothing here can be checked without looking at a window. Remove an item when it passes, and delete this file when it is empty. Results go to the **Verified** line of the CHANGELOG entry, not back into this file.

Use any Tool window that shows both, such as Puppeteer's Group Editor, or open a Tool window from the console and append the markup below to its body.

```html
<div class="blacksmith-toggle-row"><label class="blacksmith-toggle"><input type="checkbox" class="blacksmith-toggle-input"><span class="blacksmith-toggle-slider"></span></label><span class="blacksmith-toggle-label">Off toggle</span></div>
<div class="blacksmith-toggle-row"><label class="blacksmith-toggle"><input type="checkbox" class="blacksmith-toggle-input" checked><span class="blacksmith-toggle-slider"></span></label><span class="blacksmith-toggle-label">On toggle</span></div>
<span class="blacksmith-badge">Plain</span> <span class="blacksmith-badge blacksmith-badge-accent">12</span>
<span class="blacksmith-badge blacksmith-badge-success">Active</span> <span class="blacksmith-badge blacksmith-badge-danger">Error</span> <span class="blacksmith-badge blacksmith-badge-warning">Careful</span>
```

1. Light theme. Expected: both toggle labels are dark and readable; the off toggle has a visible track and border; the on toggle's track is tinted and its border dark; each badge reads clearly, with the status badges in dark green, red and amber.
2. Glass theme. Expected: the same markup reads as it did before this change, light text on a dark surface.
3. The dark Tool theme. Expected: same as Glass.
4. A standard window. Put the same markup in an ordinary Blacksmith window. Expected: no change from before; light labels, pale tints.
5. Hover a toggle on each theme. Expected: the orange ring still shows.
