# Blacksmith 13.7.6 — Pin editing & pin visibility (module author note)

**Audience:** Developers of Coffee Pub modules (Squire, Artificer, Quests, Curator, Minstrel, etc.) that use Blacksmith pins. You do **not** need access to the Blacksmith repository.

**Requires:** [Coffee Pub Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith) **13.7.6+** (pin schema **v7**).

**API reference (authoritative):** [API: Pins](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins)

This note is the **only** document you need for the 13.7.6 permission changes. Method signatures, CRUD, events, taxonomy, visibility profiles, `reconcile()`, GM tools, and the full `PinData` shape are documented on the wiki.

---

## TL;DR

Blacksmith now separates:

1. **Pin editing** — who can change the **map marker** (`config.blacksmithAccess`)
2. **Pin visibility** — whether the **marker** appears on the map for other players (`config.blacksmithVisibility`)

**Your module** still owns **click / double-click behavior** and **journal / quest / note / image** view and edit rights. Do not use pin visibility or pin editing to replace document permissions.

| UI (Configure Pin) | Stored in `pin.config` | Values |
|--------------------|------------------------|--------|
| **Pin editing** | `blacksmithAccess` | `gm` · `private` · `public` |
| **Pin visibility** | `blacksmithVisibility` | `visible` · `hidden` |

- **`hidden`:** other players who can view the pin **do not see the marker**. GM always sees every pin (**50% opacity** on canvas). Pin owners still see their own hidden pins.
- **Removed:** visibility mode `owner` (world data migrates to `visible`). Use `ownership.users` for solo-player markers.
- **Players** cannot set pin visibility in Blacksmith UI (GM-only).

Most modules need **no API changes** unless you assumed old “dimmed hidden” behavior or used `owner` visibility / legacy access strings.

---

## Getting the Pins API

No imports from Blacksmith. Use the exposed API at runtime:

```javascript
const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
if (!pins?.isAvailable()) return;   // Blacksmith not loaded or API not exposed
await pins.whenReady();             // wait until canvas + active scene (use before create at init/ready)
```

| Method | Use when |
|--------|----------|
| `pins.isAvailable()` | Guard before any pins call |
| `pins.isReady()` | Sync check: API + canvas + scene |
| `pins.whenReady()` | Async wait before `create` / `place` at `init` or `ready` |

Always pass **`moduleId: 'your-module-json-id'`** on pins you create so you can filter with `pins.list({ moduleId })` and scope `pins.on(..., { moduleId })`.

Full patterns: [API: Pins — Usage](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins).

---

## Pin data you care about (13.7.6)

Relevant fields on each pin (see wiki for the full `PinData` interface):

```javascript
{
  id: 'uuid',
  moduleId: 'coffee-pub-your-module',
  type: 'journal-pin',           // coarse category key
  tags: ['quest', 'active'],     // fine labels; required for good UX — no `group` field
  x, y,                         // placed pins only
  ownership: {
    default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,  // who can *view* the pin record
    users: { /* optional per-user overrides */ }
  },
  config: {
    blacksmithAccess: 'gm',            // pin editing: gm | private | public
    blacksmithVisibility: 'visible',   // pin visibility: visible | hidden
    // your module may store journalId, questId, etc. here — Blacksmith ignores unknown keys
  },
  version: 7                     // set by Blacksmith on migrate; do not rely on writing old versions
}
```

**Legacy values normalized on read (you should not write these in new code):**

| Legacy | Becomes |
|--------|---------|
| `blacksmithAccess`: `none`, `read` | `gm` |
| `blacksmithAccess`: `pin` | `private` |
| `blacksmithAccess`: `full` | `public` |
| `blacksmithVisibility`: `owner` | `visible` |

---

## What Blacksmith controls vs what you control

| Layer | Blacksmith | Your module |
|-------|------------|-------------|
| Marker on map | Position, icon, label, drag, delete, Configure Pin, ping, pan | — |
| Pin editing | Who edits the **pin record** | — |
| Pin visibility | Whether **others** see the **marker** | — |
| Click / double-click | DOM events → `pins.on(...)` (see editing rules below) | **Your handler** — open sheet, quest, no-op |
| Linked content | — | Journal / quest / note **view & edit** (Foundry ownership or your rules) |

### Pin visibility (`blacksmithVisibility`)

| Value | Other players (already pass pin view / `ownership`) | GM | Pin owner (can edit pin) |
|-------|-----------------------------------------------------|-----|---------------------------|
| `visible` | Marker shown | Shown | Shown |
| `hidden` | **Not on map** | Shown at **50% opacity** | Shown |

**Not the same as:**

- **Client filter profiles** — `setGlobalVisibility`, `setModuleVisibility`, `setTagVisibility`, Manage Pins saved profiles. These are **per-user overlay filters** and do not change stored `blacksmithVisibility`. Wiki: [visibility filters](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins).
- **`ownership.default`** — whether the user may view the pin record at all (`pins.list()` / internal `_canView`).

### Pin editing (`blacksmithAccess`)

| Value | Who can edit / move / delete / Configure Pin |
|-------|-----------------------------------------------|
| `gm` | GM only |
| `private` | Pin owner + GM |
| `public` | Users with OWNER on the pin + GM |

**Interaction details:**

- **`private` (Owner):** users who cannot edit the pin **do not get mousedown** on the marker (no click, no context menu on the shell).
- **`gm` (GM only) editing:** clicks **still fire** for players. Your click handler must **no-op** or check permissions if the linked document is GM-only.

### Solo “only I should see this marker”

Use **ownership**, not a special visibility mode:

```javascript
await pins.create({
  moduleId: 'coffee-pub-your-module',
  type: 'journal-pin',
  tags: ['personal'],
  ownership: {
    default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
    users: { [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
  },
  config: {
    blacksmithAccess: 'private',
    blacksmithVisibility: 'visible'
  },
  sceneId: canvas.scene.id,
  x, y
});
```

---

## What you must do (checklist)

### Required if you use pin permissions

- [ ] Stop writing `config.blacksmithVisibility: 'owner'`.
- [ ] Do not assume **hidden** pins are **dimmed** for players — they are **off the map**.
- [ ] Gate **content** in your **`pins.on('click')` / `doubleClick`** handlers (and any “open from pin id” paths).
- [ ] For `blacksmithAccess: 'gm'`, enforce GM-only **content** in your handler (Blacksmith may still deliver the click event).

### Recommended

- [ ] Use `pin.config` permission fields only for **marker** UX, not quest/journal business logic.
- [ ] Use `pins.list({ moduleId, sceneId })` (or unplaced list) when syncing UI — do not rely only on canvas hits (hidden pins have no marker for some users).
- [ ] Register taxonomy on `ready` before creating pins (wiki: `registerPinTaxonomy`).
- [ ] Use **`tags[]`**, not removed **`group`** field.

### Usually unchanged

- [ ] `pins.create`, `update`, `delete`, `get`, `list`, `place`, `unplace`, `on` — same API (wiki).
- [ ] World pin data — **auto-migrated** when a GM loads the world (no script in your module).
- [ ] Client visibility profiles — unchanged; still separate from per-pin visibility.

---

## Code patterns

### Register taxonomy (once per `ready`)

```javascript
Hooks.once('ready', () => {
  const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
  if (!pins?.isAvailable()) return;

  pins.registerPinTaxonomy('coffee-pub-your-module', {
    pinCategories: {
      'journal-pin': {
        label: 'Journal Pin',
        tags: ['location', 'quest', 'npc', 'gm-notes']
      }
    }
  });
});
```

### Create pin with 13.7.6 permissions

```javascript
const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
await pins.whenReady();

await pins.create({
  moduleId: 'coffee-pub-your-module',
  type: 'journal-pin',
  tags: ['main-quest'],
  text: 'Quest marker',
  image: '<i class="fa-solid fa-scroll"></i>',
  ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
  config: {
    blacksmithAccess: 'gm',
    blacksmithVisibility: 'visible',
    journalId: journal.uuid  // your module’s key — example only
  },
  sceneId: canvas.scene.id,
  x: 1200,
  y: 800
});
```

### Read permissions

```javascript
const pin = await pins.get(pinId, { sceneId: canvas.scene.id });
const access = pin?.config?.blacksmithAccess ?? 'gm';
const visibility = pin?.config?.blacksmithVisibility ?? 'visible';
```

### Click handler — open content safely

```javascript
const MODULE_ID = 'coffee-pub-your-module';
const controller = new AbortController();

Hooks.once('canvasReady', () => {
  const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
  if (!pins?.isReady()) return;

  pins.on('click', async (evt) => {
    const { pin } = evt;
    const journalUuid = pin.config?.journalId;
    if (!journalUuid) return;

    const doc = await fromUuid(journalUuid);
    if (!doc?.testUserPermission(game.user, 'LIMITED')) {
      ui.notifications.warn('You cannot view this entry.');
      return;
    }
    doc.sheet.render(true);
  }, { moduleId: MODULE_ID, signal: controller.signal });
});

Hooks.on('unloadModule', (id) => {
  if (id !== MODULE_ID) return;
  controller.abort();
});
```

Event shape: `{ type, pin, sceneId, userId, modifiers, originalEvent }` — wiki: [PinEvent](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins).

### Hide marker from players (GM reveal later)

```javascript
const pin = await pins.get(pinId, { sceneId });
await pins.update(pinId, {
  config: { ...pin.config, blacksmithVisibility: 'hidden' }
}, { sceneId });
```

Players lose the marker; GM sees dimmed preview; your quest/journal rules are unchanged until you update them separately.

### Update pin editing only

```javascript
await pins.update(pinId, {
  config: { ...pin.config, blacksmithAccess: 'private' }
}, { sceneId });
```

`pins.update` only changes fields in the patch — it does not clear `ownership` unless you include `ownership` in the patch (wiki).

---

## Stop using / replace

| Stop | Use instead |
|------|-------------|
| `blacksmithVisibility: 'owner'` | `'visible'` + `ownership.users` for solo pins |
| Hidden = dimmed on player clients | Hidden = **not rendered** on overlay |
| Legacy access: `none`, `read`, `pin`, `full` | `gm`, `private`, `public` |
| `group` on pins | `tags[]` |
| Pin visibility to gate journal/quest content | Document permission checks in **your** click handler |
| Player UI to toggle `blacksmithVisibility` | GM uses Blacksmith Configure Pin / context menu / Manage Pins |

---

## Hooks & sync (wiki has payloads)

**Pin interaction** — register via API (preferred):

```javascript
pins.on('click' | 'doubleClick' | 'hoverIn' | 'hoverOut' | 'rightClick' | ..., handler, options);
```

**Foundry hooks** (optional sync):

| Hook | When |
|------|------|
| `blacksmith.pins.created` | Pin created |
| `blacksmith.pins.updated` | Pin updated |
| `blacksmith.pins.deleted` | Single pin deleted |
| `blacksmith.pins.deletedAll` | Bulk delete (no per-pin ids) |
| `blacksmith.pins.deletedAllByType` | Bulk delete by type |
| `blacksmith.pins.placed` / `unplaced` | Placement changed |
| `blacksmith.pins.resolveOwnership` | Override default ownership resolution |

If you store `pinId` on journals/quests/notes: on **bulk** delete, `blacksmith.pins.deleted` does **not** run per pin — listen for `deletedAll` / `deletedAllByType` and run `pins.reconcile(yourItems, { moduleId, getPinId, setPinId, clearPinId })`, then **persist your own flags** (reconcile does not write scene data). Wiki: [reconcile](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins).

---

## World data migration (no action in your module)

When a **GM** opens a world/scene, Blacksmith migrates stored pins:

- **v6:** legacy access → `blacksmithAccess` + `blacksmithVisibility`
- **v7:** `owner` visibility → `visible`

Migrated pins are **saved back** to scene flags and the unplaced pin store (GM only). Players do not run migration.

---

## Testing

Test each scenario with **two clients** (GM + player) on the same scene:

1. `blacksmithVisibility: 'visible'` — player sees marker; click does what your handler allows.
2. `blacksmithVisibility: 'hidden'` — player **no marker**; GM sees dimmed marker.
3. `blacksmithAccess: 'private'` — non-owner cannot click marker; owner + GM can edit.
4. `blacksmithAccess: 'gm'` — player may still get click event; your handler must block GM-only content.
5. Solo pin via `ownership.users` — only that user (and GM) sees marker when visibility is `visible`.

---

## Where to look on the wiki

| Topic | Wiki section (API: Pins) |
|-------|---------------------------|
| Full `PinData` / `PinEvent` | Data structures |
| `create`, `update`, `delete`, `get`, `list` | API Reference |
| `place`, `unplace` | Placement |
| `on`, context menu | Events |
| `registerPinTaxonomy`, tags | Taxonomy |
| Client filters vs per-pin visibility | Visibility / profiles |
| `reconcile` | Reconciliation |
| `requestGM`, `createAsGM` | GM proxy |
| Configure Pin UI | Pin configuration window |

**Link:** https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins

---

*Blacksmith 13.7.6 — Coffee Pub. Questions about pin shell behavior: this note + wiki. Questions about your module’s journals/quests: your module’s ownership and click handlers.*
