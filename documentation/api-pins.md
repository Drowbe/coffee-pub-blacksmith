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

**Returns**: `Promise<PinData>` - The created pin data with defaults applied

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

**Throws**: 
- `Error` if pin data is invalid
- `Error` if scene not found
- `Error` if permission denied

### `pins.update(pinId, patch, options?)`
Update properties for an existing pin.

**Returns**: `Promise<PinData>` - The updated pin data

```javascript
const updatedPin = await pinsAPI.update(pin.id, { text: 'Hot Forge' });
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `silent` (boolean, optional): skip event emission

**Throws**: 
- `Error` if pin not found
- `Error` if patch data is invalid
- `Error` if scene not found
- `Error` if permission denied

### `pins.delete(pinId, options?)`
Delete a pin from a scene.

**Returns**: `Promise<void>`

```javascript
await pinsAPI.delete(pin.id);
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `silent` (boolean, optional): skip event emission

**Throws**: 
- `Error` if pin not found
- `Error` if scene not found
- `Error` if permission denied

### `pins.get(pinId, options?)`
Get a single pin by id.

**Returns**: `PinData | null` - Pin data if found, `null` if not found

```javascript
const pin = pinsAPI.get(pin.id);
if (pin) {
  console.log('Found pin:', pin.text);
}
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene

**Throws**: 
- `Error` if scene not found

### `pins.list(options?)`
List pins with filters.

**Returns**: `PinData[]` - Array of pin data matching filters

```javascript
const pins = pinsAPI.list({ moduleId: 'my-module' });
console.log(`Found ${pins.length} pins`);
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `moduleId` (string, optional): filter by consumer module

**Throws**: 
- `Error` if scene not found

### `pins.on(eventType, handler, options?)`
Register an event handler. Returns a disposer function.

**Returns**: `() => void` - Disposer function to unregister the handler

```javascript
const off = pinsAPI.on('click', (evt) => {
  console.log(evt.pin.id, evt.modifiers.shift);
}, { moduleId: 'my-module' });

// later
off();
```

**Event Types**:
- `'hoverIn'` - Mouse enters pin
- `'hoverOut'` - Mouse leaves pin
- `'click'` - Left mouse button click
- `'rightClick'` - Right mouse button click
- `'middleClick'` - Middle mouse button click
- `'dragStart'` - Drag operation starts (requires `dragEvents: true`)
- `'dragMove'` - Drag operation continues (requires `dragEvents: true`)
- `'dragEnd'` - Drag operation ends (requires `dragEvents: true`)

**Options**:
- `pinId` (string, optional): handle events for a specific pin only
- `moduleId` (string, optional): handle events for pins created by this module
- `sceneId` (string, optional): scope to a specific scene
- `signal` (AbortSignal, optional): auto-remove handler on abort
- `dragEvents` (boolean, optional): opt in to `dragStart`/`dragMove`/`dragEnd` if you need them

**Throws**: 
- `Error` if eventType is invalid
- `Error` if handler is not a function

## Permissions and Errors

### Permissions
- Create/update/delete default to GM-only unless the PinManager configuration allows otherwise.
- `ownership` uses Foundry ownership levels (`CONST.DOCUMENT_OWNERSHIP_LEVELS`); GM always has full access.
- Ownership should be supplied by the calling module per its needs; Blacksmith enforces and validates it.

### Error Handling
- API calls validate input and throw on invalid data or missing scene.
- Scene load must never fail due to malformed pin data; invalid pins are dropped or repaired.
- All errors are thrown as `Error` objects with descriptive messages.
- Common error scenarios:
  - **Pin not found**: When `get()`, `update()`, or `delete()` is called with non-existent pin ID
  - **Permission denied**: When user lacks required permissions for operation
  - **Invalid data**: When pin data doesn't match schema or validation rules
  - **Scene not found**: When specified scene ID doesn't exist
  - **Invalid event type**: When registering handler with unsupported event type

## Implementation Status

- [ ] Core infrastructure
- [ ] Rendering system
- [ ] Event handling
- [ ] API methods
- [ ] Documentation
