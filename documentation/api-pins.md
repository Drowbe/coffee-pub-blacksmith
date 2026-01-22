# Canvas Pins API Documentation

> **Status**: This API is under development. This document will be updated as implementation progresses.

## Overview

The Canvas Pins API provides a system for creating, managing, and interacting with configurable pins on the FoundryVTT canvas. Pins are visual markers that can be placed on scenes and respond to various user interactions.

## Getting Started

### Accessing the API

```javascript
// Import the Blacksmith API bridge
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

// Get the pins API
const blacksmith = await BlacksmithAPI.get();
const pinsAPI = blacksmith?.pins;
if (pinsAPI) {
    // Pins API is available
}
```

### Checking Availability

```javascript
// Wait for canvas to be ready
Hooks.once('canvasReady', async () => {
    const blacksmith = await BlacksmithAPI.get();
    if (blacksmith?.pins) {
        // Pins API is ready
    }
});
```

## Data Types

### PinData

```typescript
interface PinData {
  id: string; // UUID
  x: number;
  y: number;
  size?: { w: number; h: number };
  style?: { fill?: string; stroke?: string; strokeWidth?: number; alpha?: number };
  text?: string;
  image?: string;
  config?: Record<string, unknown>;
  moduleId: string; // consumer module id
  ownership?: { default: number; users?: Record<string, number> };
  version?: number; // schema version
}
```

### PinEvent

```typescript
interface PinEvent {
  type: 'hoverIn' | 'hoverOut' | 'click' | 'rightClick' | 'middleClick' | 'dragStart' | 'dragMove' | 'dragEnd';
  pin: PinData;
  sceneId: string;
  userId: string;
  modifiers: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean };
  originalEvent: PIXI.FederatedPointerEvent;
}
```

## API Reference

### `pins.create(pinData, options?)`
Create a pin on the active scene.

```javascript
const pin = await pinsAPI.create({
  id: crypto.randomUUID(),
  x: 1200,
  y: 900,
  text: 'Forge',
  moduleId: 'my-module'
});
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `silent` (boolean, optional): skip event emission

### `pins.update(pinId, patch, options?)`
Update properties for an existing pin.

```javascript
await pinsAPI.update(pin.id, { text: 'Hot Forge' });
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `silent` (boolean, optional): skip event emission

### `pins.delete(pinId, options?)`
Delete a pin from a scene.

```javascript
await pinsAPI.delete(pin.id);
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `silent` (boolean, optional): skip event emission

### `pins.get(pinId, options?)`
Get a single pin by id.

```javascript
const pin = pinsAPI.get(pin.id);
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene

### `pins.list(options?)`
List pins with filters.

```javascript
const pins = pinsAPI.list({ moduleId: 'my-module' });
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `moduleId` (string, optional): filter by consumer module

### `pins.on(eventType, handler, options?)`
Register an event handler. Returns a disposer function.

```javascript
const off = pinsAPI.on('click', (evt) => {
  console.log(evt.pin.id, evt.modifiers.shift);
}, { moduleId: 'my-module' });

// later
off();
```

**Options**:
- `pinId` (string, optional): handle events for a specific pin only
- `moduleId` (string, optional): handle events for pins created by this module
- `sceneId` (string, optional): scope to a specific scene
- `signal` (AbortSignal, optional): auto-remove handler on abort
- `dragEvents` (boolean, optional): opt in to `dragStart`/`dragMove`/`dragEnd` if you need them

## Permissions and Errors

- Create/update/delete default to GM-only unless the PinManager configuration allows otherwise.
- `ownership` uses Foundry ownership levels (`CONST.DOCUMENT_OWNERSHIP_LEVELS`); GM always has full access.
- Ownership should be supplied by the calling module per its needs; Blacksmith enforces and validates it.
- API calls validate input and throw on invalid data or missing scene.
- Scene load must never fail due to malformed pin data; invalid pins are dropped or repaired.

## Implementation Status

- [ ] Core infrastructure
- [ ] Rendering system
- [ ] Event handling
- [ ] API methods
- [ ] Documentation
