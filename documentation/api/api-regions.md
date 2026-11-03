# Regions API

**Audience:** module authors who want a Region behaviour: something that happens when a token walks into, out of or across a shape drawn on the map.

A Region behaviour is the entry in a region's **Behaviors** tab, such as Foundry's Teleport Token or a module's Open Merchant. Foundry already lets a module add one; this API does it for you and names it the same way in every Coffee Pub module.

Access it at `game.modules.get('coffee-pub-blacksmith').api.regions`.

## What you do, and what it does for you

You declare the behaviour in `module.json`, call `registerBehavior` from your own `init` hook, and describe the behaviour: its fields and what runs on an event. Blacksmith holds the parts that are easy to get wrong:

- **Timing.** Registration must happen during `init`. Foundry builds a scene's behaviours long before `ready`, and one whose type it does not yet know breaks every token move on that scene until the world is reloaded. A call after `init` throws.
- **The class.** It is built inside the call, not at module scope, because it extends a Foundry class that may not exist yet when your script is evaluated.
- **The name.** The Create Behavior list shows `CP <Module>: <Label>`, built from your module's own title with `Coffee Pub ` removed: `CP Merchant: Open Merchant`. You pass only the label.
- **Who runs it.** A region event fires on every client. By default your handler runs only on the client of the user who caused the event.

## The declaration

Foundry reads `module.json` before any script runs, so this cannot be done for you:

```json
"documentTypes": {
  "RegionBehavior": {
    "openShop": {}
  }
}
```

The key is the `name` you pass. If it is missing, `registerBehavior` logs a warning that names the module and the line to add.

## Example

```javascript
Hooks.once('init', () => {
  game.modules.get('coffee-pub-blacksmith').api.regions.registerBehavior({
    moduleId: 'coffee-pub-merchant',
    name: 'openShop',
    label: 'Open Merchant',
    icon: 'fa-solid fa-shop',
    fields: (fields) => ({
      merchant: new fields.DocumentUUIDField({
        type: 'Actor',
        label: 'BEHAVIOR.TYPES.openShop.FIELDS.merchant.label',
        hint: 'BEHAVIOR.TYPES.openShop.FIELDS.merchant.hint'
      }),
      once: new fields.BooleanField({
        label: 'BEHAVIOR.TYPES.openShop.FIELDS.once.label',
        hint: 'BEHAVIOR.TYPES.openShop.FIELDS.once.hint'
      })
    }),
    events: {
      tokenMoveIn: async function (event) {
        // `this` is the behaviour: this.merchant, this.once, this.parent (the RegionBehavior document)
        openShopFor(await fromUuid(this.merchant));
      }
    }
  });
});
```

## `registerBehavior(spec)`

Returns the type, `<moduleId>.<name>`, or `null` on a Foundry that has no region behaviours (a warning is logged).

| Field | Type | Meaning |
|---|---|---|
| `moduleId` | string | Your module id. Namespaces the type. Required |
| `name` | string | The sub-type, lower camel case, matching the `module.json` key. Required |
| `label` | string | The behaviour's name without the module prefix. A string that is a localization key is localized; any other string is used as it is. Required |
| `icon` | string | Font Awesome classes. Default `fa-solid fa-draw-polygon` |
| `fields` | `(fields) => schema` | Returns the schema. Receives `foundry.data.fields`. Required |
| `events` | object | A handler per event; see below |
| `localizationPrefixes` | string[] | Default `['BEHAVIOR.TYPES.<name>', 'BEHAVIOR.TYPES.base']` |

Throws a `TypeError` on a bad spec, and an `Error` when called after `init` or when the type is already registered.

### Field labels and hints

Give each field a `label` and a `hint` that are localization keys, as the example does. Foundry also fills a model's labels from the prefixes (`BEHAVIOR.TYPES.<name>.FIELDS.<field>.label`), but a key you name yourself works whatever the order, and shows up in a search of your language file.

### Events

`events` is keyed by a `CONST.REGION_EVENTS` value: `tokenEnter`, `tokenExit`, `tokenMoveIn`, `tokenMoveOut`, `tokenMoveWithin`, `tokenPreMove`, and the rest. An unknown key throws.

A value is a function, or `{ handler, run }`:

| `run` | The handler runs on |
|---|---|
| `'mover'` (default) | The client of the user who caused the event. An event with no user runs on the active GM |
| `'activeGM'` | The active GM's client only. Use it for a write |
| `'everyone'` | Every client |

`this` inside a handler is the behaviour, and the argument is Foundry's event.

To give one event two jobs with different rules, pass an array. The handlers run in order, each with its own `run`:

```javascript
events: {
  tokenMoveIn: [
    async function (event) { openShopFor(await fromUuid(this.merchant)); },          // the mover's client
    { run: 'activeGM', handler: function () { if (this.once) this.parent.update({ disabled: true }); } } // one write, by the GM
  ]
}
```

A region event reaches every client, and a handler that only runs for the mover never runs on the GM's client when a player moves. A write that has to happen once belongs in an `activeGM` handler, not behind a GM check inside a `mover` one.

`tokenMoveIn` is the one for a token walking in. `tokenEnter` also fires for a token created inside the region or dropped in by a teleport, which is rarely a walk.
