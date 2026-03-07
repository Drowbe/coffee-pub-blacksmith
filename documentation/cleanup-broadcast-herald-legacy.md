# Blacksmith: Broadcast / Herald Legacy Cleanup Report

**Generated:** After Herald module moved to its own project.  
**Scope:** Coffee Pub Blacksmith repo only. Excludes game-data (e.g. monster names containing "Herald") and generic terms (e.g. "broadcast" meaning socket/audio broadcast).

---

## 1. Documentation – Update (legacy references)

### 1.1 `documentation/architecture-blacksmith.md`

| Location | Current text | Action |
|----------|--------------|--------|
| ~line 61 | **BroadcastManager** in list of managers initialized | **Remove** "BroadcastManager" from the list (no longer initialized by Blacksmith). |
| ~line 123 | **Broadcast** — **BroadcastManager** (`manager-broadcast.js`): … See **documentation/architecture-broadcast.md**. | **Remove** this bullet or replace with: "**Broadcast** — Now provided by **Coffee Pub Herald** (`coffee-pub-herald`). See Herald documentation." |
| ~line 222 | Table row: `Broadcast mode \| **architecture-broadcast.md**` | **Remove** row or change to point to Herald (e.g. "Broadcast / streaming → Coffee Pub Herald"). |

### 1.2 `documentation/TODO.md`

| Location | Current text | Action |
|----------|--------------|--------|
| ~line 189–195 | "Tune Default Zoom Levels for Broadcast Modes" — **Location**: `scripts/manager-broadcast.js` | **Update** location to Herald (e.g. `coffee-pub-herald/scripts/manager-herald.js`) or **remove** if Herald repo owns that TODO. |
| ~line 195–202 | "Broadcast: Combat Spectator Mode" — **Location**: `scripts/manager-broadcast.js`, `scripts/settings.js` | **Update** to Herald paths or **remove** / move to Herald’s TODO. |

### 1.3 `documentation/api-menubar.md`

| Location | Current text | Action |
|----------|--------------|--------|
| ~line 238 | "Example: Broadcast View Mode tool uses this…" | **Optional** – Keep as-is (Herald’s View Mode tool is a valid example). |
| ~line 356 | "Used by modules (e.g. Herald) that designate a 'broadcast/cameraman' user…" | **Keep** – Correct; Herald is the module. |
| ~line 359 | "e.g. `'coffee-pub-herald'`" | **Keep** – Correct. |

### 1.4 `documentation/api-core.md` / `documentation/api-sockets.md` / `documentation/architecture-rolls.md`

- Uses of "broadcast" are about **sockets / audio / roll distribution**, not the Broadcast feature. **No change.**

---

## 2. Code – Comments only (no behavior change)

### 2.1 `scripts/api-menubar.js`

| Location | Current text | Action |
|----------|--------------|--------|
| ~2916–2917 | JSDoc: `barTypeId` (e.g. 'broadcast'), `toolId` (e.g. 'broadcast-toggle') | **Keep** – Correct examples for Herald’s bar/tool. |
| ~4133–4134 | "External modules (e.g. Herald)…" and "e.g. 'coffee-pub-herald'" | **Keep** – Correct. |
| ~4171 | "e.g. broadcast user from BroadcastManager or Herald" | **Update** to: "e.g. broadcast user from Herald" (remove "BroadcastManager or"). |

---

## 3. Code – Settings

### 3.1 `scripts/settings.js`

| Location | Current text | Action |
|----------|--------------|--------|
| ~line 90 | `'coffee-pub-herald'` in `arrModuleIDs` (Coffee Pub module list) | **Keep** – Herald is a Coffee Pub module; list is for "active Coffee Pub modules" or similar. No change. |

---

## 4. Styles

### 4.1 `styles/menubar.css`

| Location | Current text | Action |
|----------|--------------|--------|
| ~line 47 | `--blacksmith-menubar-secondary-broadcast-height: 60px;` | **Keep** – Used by `getSecondaryBarHeight('broadcast')` when Herald’s broadcast bar is open. Part of API support for Herald’s bar type. |

---

## 5. CHANGELOG

- All existing **CHANGELOG.md** entries that mention Broadcast, BroadcastManager, or Herald are **historical** and should **stay as-is** (no edits for cleanup).

---

## 6. Other "broadcast" / "herald" hits (no cleanup)

- **resources/monster-mapping.json** – "Herald" in creature names (e.g. "Herald of Blood"). **Keep** – game data.
- **scripts/blacksmith.js** – "Broadcast the final result to other clients". **Keep** – socket broadcast.
- **scripts/api-core.js**, **scripts/manager-sockets.js**, **scripts/api-pins.js**, **scripts/latency-checker.js**, **scripts/journal-page-pins.js**, **scripts/pins-renderer.js**, **scripts/window-skillcheck.js**, **scripts/stats-combat.js** – "broadcast" = socket/audio/roll distribution. **Keep.**
- **scripts/api-menubar.js** – `game.user?.broadcastActivity` and `canvas.ping(..., { broadcast: true })` are Foundry/API usage. **Keep.**

---

## 7. Removed / not present (no action)

- **scripts/manager-broadcast.js** – Already removed. ✓  
- **documentation/architecture-broadcast.md** – Not in Blacksmith (moved to Herald). ✓  
- **Broadcast settings/language keys** – Already removed from Blacksmith. ✓  

---

## 8. Summary checklist

| Item | File(s) | Action |
|------|---------|--------|
| Remove BroadcastManager from init list | architecture-blacksmith.md | ✅ Done |
| Update or remove Broadcast section and table row | architecture-blacksmith.md | ✅ Done |
| Update TODO items that reference manager-broadcast.js | TODO.md | ✅ Done (removed; text provided for Herald) |
| Comment: "BroadcastManager or Herald" → "Herald" | api-menubar.js | ✅ Done |
| Keep Herald in Coffee Pub module list | settings.js | No change |
| Keep broadcast bar height CSS variable | menubar.css | No change (revisit in CRITICAL TODO) |
| Keep CHANGELOG, API docs (Herald examples), and all socket/audio "broadcast" usage | Various | No change |

**Cleanup complete.** Only the CSS variable revisit remains (see TODO.md CRITICAL – REVISIT).
