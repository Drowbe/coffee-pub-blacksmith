# Memory Diagnostic Playbook

## Goals
- Detect runaway memory usage during typical combat sessions.
- Pinpoint which subsystem (menubar, token overlays, timers) leaks DOM/PIXI nodes.
- Capture reproducible evidence before patching.

## Prerequisites
- Chrome or Edge DevTools access.
- GM session with representative combat features enabled.

## Procedure

### 1. Baseline Snapshot
1. Load a representative scene and open DevTools (**F12**).
2. Memory tab → **Take snapshot**; label `baseline`.
3. Console: record `canvas.stage.children.length`, `Object.keys(PIXI.utils.TextureCache).length`.

### 2. Timed Monitoring
1. Every 10–15 minutes:
   - Take another heap snapshot (`snapshot-01`, `snapshot-02`…).
   - Re-log stage/texture counts.
2. Chrome Task Manager (Shift+Esc): monitor the tab’s JS and GPU memory columns.

### 3. Timeline Recording
1. DevTools **Performance** tab → **Record** while running typical combat actions (turn changes, targeting, menubar usage).
2. Stop after ~60s; review JS Heap/GPU tracks for upward trends.

### 4. Feature Isolation
1. Repeat monitoring with individual systems disabled (menubar, token indicators, round timer).
2. If memory growth disappears when a feature is off, flag that subsystem.

### 5. Snapshot Diff Analysis
1. Memory tab → compare `baseline` vs later snapshots.
2. Sort by “Objects allocated between snapshots.”
3. Look for:
   - PIXI `Graphics`/`Container` counts increasing.
   - Collections (`_targetedIndicators`, `_turnIndicator`) gaining entries.
   - Detached DOM nodes referencing menubar elements.

### 6. Report Findings
Document:
- Snapshot timestamps and heap sizes.
- Object types with runaway growth.
- Which feature toggle flattened the curve.
- Repro steps to trigger the leak.

Use the findings to implement targeted cleanup (destroy graphics, clear intervals, stop timers when scenes unload).
{
  "cells": [],
  "metadata": {
    "language_info": {
      "name": "python"
    }
  },
  "nbformat": 4,
  "nbformat_minor": 2
}