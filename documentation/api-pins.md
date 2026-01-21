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
const pinsAPI = await BlacksmithAPI.get();
if (pinsAPI?.pins) {
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

## API Reference

> **Note**: API methods will be documented here as they are implemented.

---

## Implementation Status

- [ ] Core infrastructure
- [ ] Rendering system
- [ ] Event handling
- [ ] API methods
- [ ] Documentation

---

*This document will be updated as the pins system is developed.*
