# Note to Squire: Convert the Health Tool to Blacksmith's Tool Window

**From:** Coffee Pub Blacksmith  
**Target:** Squire's floating Health tool  
**Status:** Ready for the first external consumer after the Blacksmith build containing `BlacksmithToolWindowBaseV2` is installed

## What Blacksmith now provides

Blacksmith has a lightweight Application V2 window style for persistent canvas utilities such as Health, Dice Tray, and Macros. It is not a separate window registry or a custom floating `<div>`. It is a specialized base class using Foundry's native Application V2 frame.

The tool receives:

- native dragging, focus, z-order, minimize, and close behavior;
- a compact Blacksmith title bar;
- automatic per-user position persistence;
- an optional compact toolbar and footer;
- a scrollable body owned entirely by Squire;
- optional icon actions placed directly in the title bar;
- the same `registerWindow` / `openWindow` API used by standard Blacksmith windows.

Blacksmith owns the frame and lifecycle. Squire continues to own the Health tool's controls, actor updates, permissions, sounds, and styling inside the body.

## Dependency and timing

Squire should declare Blacksmith as a required module dependency if it subclasses the base at module top level. That guarantees Blacksmith loads first.

The following members are exposed as soon as Blacksmith's module script loads, before `init` and `ready`:

```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

blacksmith.BlacksmithToolWindowBaseV2;
blacksmith.getToolWindowBaseV2();
blacksmith.windowStyles.TOOL; // "tool"
blacksmith.toolTitlebars.FULL; // "full"
blacksmith.toolTitlebars.MICRO; // "micro"
```

Do not import `/modules/coffee-pub-blacksmith/scripts/window-tool-base.js` directly. The `module.api` members are the stable contract.

The window registry is ready later. Register/open windows from `ready`, or after `await BlacksmithAPI.waitForReady()`.

## Recommended Health-tool conversion

1. Remove Squire's custom floating-container, drag, z-index, and close implementations.
2. Remove the Health tool's in-body `X Close` control; Foundry supplies the native close control.
3. Preserve the existing Health controls as Squire-owned body markup.
4. Extend `BlacksmithToolWindowBaseV2`.
5. Keep the tool a singleton unless Squire intentionally wants one Health window per Actor.
6. Re-render the open window when HP, temp HP, max HP, or the displayed Actor changes.
7. Let the base remember its position. Do not save a second copy of the position in Squire.

Example structure:

```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
const ToolWindowBase = blacksmith?.BlacksmithToolWindowBaseV2;

if (!ToolWindowBase) {
    throw new Error('Squire | Blacksmith tool-window API is unavailable.');
}

export class SquireHealthTool extends ToolWindowBase {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'coffee-pub-squire-health-tool',
            classes: ['squire-health-tool-window'],
            position: {
                width: 400,
                height: 'auto'
            },
            window: {
                title: 'Health',
                resizable: false,
                minimizable: true
            },
            windowSizeConstraints: {
                minWidth: 320,
                maxWidth: 520,
                maxHeight: 'calc(100vh - 16px)'
            },
            // Explicit for clarity; true is already the tool-base default.
            rememberPosition: true,
            windowPositionKey: 'squire-health-tool-position'
        }
    );

    constructor({ actorUuid, ...options } = {}) {
        super(options);
        this.actorUuid = actorUuid;
    }

    get actor() {
        return fromUuidSync(this.actorUuid);
    }

    get title() {
        const name = this.actor?.name;
        return name ? `Health: ${name}` : 'Health';
    }

    // Application V2 only calculates its default frame title on first render.
    // Include the current title in every render when the displayed Actor may change.
    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    async getData() {
        const actor = this.actor;
        return {
            appId: this.id,
            bodyContent: actor
                ? this._buildHealthControls(actor)
                : '<p class="squire-health-tool-empty">No actor selected.</p>'
        };
    }

    _buildHealthControls(actor) {
        // Return Squire's existing escaped Health-tool markup here.
        // Keep its buttons as data-action controls rather than inline scripts.
        return `
            <div class="squire-health-tool">
                <!-- Squire-owned health bar and controls -->
            </div>
        `;
    }
}
```

The base template renders `bodyContent` as HTML. Squire must continue escaping Actor-controlled text and should not place executable `<script>` elements in that HTML.

## Actions

Squire may keep its existing event delegation or use the inherited `ACTION_HANDLERS` pattern:

```javascript
static ACTION_HANDLERS = {
    damage: (_event, button) => {
        const app = SquireHealthTool._ref;
        return app?.applyDamage(button.dataset.amount);
    },
    heal: (_event, button) => {
        const app = SquireHealthTool._ref;
        return app?.applyHealing(button.dataset.amount);
    }
};
```

Body buttons should use `data-action="damage"`, `data-action="heal"`, and similar attributes. The inherited delegation is appropriate for the Health tool if it remains a singleton.

For a control that belongs beside the title—not inside the Health body—override `getToolHeaderActions()`:

```javascript
getToolHeaderActions() {
    return [{
        id: 'follow-selection',
        icon: 'fa-solid fa-crosshairs',
        label: 'Follow selected token',
        active: this.followSelection,
        onClick: () => {
            this.followSelection = !this.followSelection;
            return this.render(false);
        }
    }];
}
```

Each action accepts:

```javascript
{
    id,        // required stable string
    icon,      // Font Awesome classes
    label,     // text or localization key; becomes data-tooltip + aria-label
    active,    // optional active-state styling
    disabled,  // optional
    onClick    // optional callback
}
```

Do not recreate close or minimize actions. Foundry already owns them.

## Optional toolbar and footer

Most of the Health tool belongs in `bodyContent`. If Squire later needs a mode selector or status area, `getData()` may also return:

```javascript
{
    toolBarLeft: '...',
    toolBarRight: '...',
    showToolBar: true,
    toolFooterLeft: '...',
    toolFooterRight: '...',
    showToolFooter: true
}
```

Empty toolbar/footer content is omitted automatically.

## Opening and registry

Squire may continue opening its singleton directly:

```javascript
await healthTool.render(true);
healthTool.bringToFront();
```

It should also register the tool if Blacksmith, another Coffee Pub module, or a macro should be able to open it without importing Squire's class:

```javascript
Hooks.once('ready', () => {
    const api = game.modules.get('coffee-pub-blacksmith')?.api;

    api?.registerWindow?.('squire-health', {
        moduleId: 'coffee-pub-squire',
        title: 'Health',
        open: async (options = {}) => SquireHealthController.open(options)
    });
});
```

Then any consumer can use:

```javascript
await game.modules
    .get('coffee-pub-blacksmith')
    ?.api
    ?.openWindow('squire-health', { actorUuid });
```

The registry does not enforce singleton behavior. `SquireHealthController.open()` should reuse the rendered instance and call `bringToFront()` rather than creating duplicates.

## Position behavior

- Tool windows remember their last position in local storage per browser/user by default.
- `windowPositionKey` gives the Health tool a stable key even if its class name changes.
- Set `rememberPosition: false` only if Squire wants every opening positioned afresh.
- Do not combine the Blacksmith position persistence with Squire's old position storage.

## Styling boundary

Blacksmith styles the complete Application V2 shell: parchment title bar and body surface, display typography, gold border, shadow, and title controls. Squire should scope its interior content rules beneath `.squire-health-tool-window` or `.squire-health-tool`.

Do not override generic Foundry selectors such as `.application`, `.window-header`, or `.window-content` globally. If Health needs a deliberate variation, scope it:

```css
.application.blacksmith-window-tool.squire-health-tool-window {
    /* Health-specific frame variables or dimensions */
}

.squire-health-tool-window .squire-health-tool {
    /* Squire-owned body presentation */
}
```

The parchment surface, gold border, display-type title bar, controls, and shadow are core Tool API styling. Squire should receive that complete shell even with an empty `bodyContent`; it only needs to style the Health controls inside the body. Tool-specific frame changes should override the scoped `--blacksmith-tool-*` custom properties rather than replacing the shared frame CSS.

### First-consumer correction

The initial Blacksmith implementation exposed a dark generic Tool shell and kept the parchment shell under the private `.blacksmith-combatant-tool-window` consumer class. Squire correctly identified that this would force consumers either to copy private CSS or invent a parallel theme. Blacksmith has corrected the API:

- parchment is now the default `.blacksmith-window-tool` shell;
- no `blacksmith-window-tool-parchment` class is required or supported;
- the combatant card no longer owns a private frame theme;
- Squire should remove redundant Dice Tray frame/body backgrounds when it wants the shared parchment surface;
- Squire should retain only the CSS needed to lay out and style its dice controls;
- a deliberately dark Squire tool may opt out by overriding the public `--blacksmith-tool-*` properties on its own scoped application class.

Therefore the expected Squire class list is simply:

```javascript
classes: [
    'squire-dicetray-tool-window'
]
```

The inherited base contributes `blacksmith-window-tool`; Squire does not need to repeat it.

For compact, persistently open tools such as Dice Tray or Health, Squire may opt into the shared Micro title bar:

```javascript
static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
    {
        toolTitlebar: 'micro'
    }
);
```

Micro mode is a thin native drag rail with an ellipsis on hover/focus. The same document-level Blacksmith context menu opens on right-click and includes Squire's registered tool actions, Minimize/Restore, Reset Position, and Close. Because it is not a child of the tool frame, it remains usable at the tool's minimum dimensions. Squire should not add another close button or context menu.

The menu also lets the user switch back to Full mode; Full mode's ellipsis offers the inverse switch to Micro. Blacksmith remembers that choice for the specific Squire tool. Squire should leave `allowTitlebarModeToggle` and `rememberTitlebarMode` at their default `true` unless a tool has a concrete reason to lock its chrome.

The same menu offers Blacksmith's shared Light/Dark Tool-shell switch. Blacksmith persists it per Squire tool; Squire should inherit the Tool theme variables and avoid replacing the frame/title/body surface with a competing hard-coded theme.

## Live verification checklist

Before calling the conversion complete:

1. Open Health from its current Squire entry point.
2. Confirm only one Health tool opens; reopening raises the existing instance.
3. Drag it, close it, reopen it, and confirm its position is restored.
4. Minimize and restore it using Foundry's native title controls.
5. Confirm damage, healing, increment/decrement, and amount controls behave exactly as before.
6. Change HP from the Actor sheet and confirm the open tool refreshes.
7. Change the displayed Actor and confirm both body data and title update.
8. Confirm players can only perform actions Squire already authorizes.
9. Confirm no custom `X Close`, duplicate drag listeners, or old floating DOM remains.
10. Reload the world and confirm there are no duplicate hooks or orphaned tool elements.
11. Call `openWindow('squire-health', { actorUuid })` and confirm it reaches the same singleton.
12. Test at narrow viewport sizes; the tool must stay within the configured max width/height and its body must scroll when necessary.

## Important release note

The source contract is ready, but Squire must depend on the first Blacksmith release that includes `BlacksmithToolWindowBaseV2`; Blacksmith `13.11.6` does not contain this unshipped work. Until that build is installed, Squire should retain its existing Health window or guard the new integration with an API capability check.

Authoritative reference: `documentation/api/api-window.md`, section **Lightweight tool/palette style**.
