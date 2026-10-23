// ==================================================================
// ===== CANVAS API ================================================
// ==================================================================
// Exposed as `module.api.canvas`. The layer a module draws on is a separate surface
// (`api.getCanvasLayer()`); this is what a module asks of the canvas itself.
// See documentation/api/api-canvas.md.

import { CanvasPickManager, PICKABLE_TYPES, PICK_CONTAINMENT, PICK_LEVELS } from './manager-canvas-pick.js';

export const CanvasAPI = {
    /**
     * Let the user drag a box on the canvas, across every layer, and resolve with the documents in it.
     * Does not change the selection or the active layer. Esc cancels.
     * @param {object} [options]
     * @param {string[]} [options.types] Document names to include. Default: all of `pickTypes`.
     * @param {'centre'|'inside'|'intersects'} [options.containment='centre']
     * @param {'current'|'all'} [options.levels='current']
     * @param {string} [options.prompt] Hint shown while picking.
     * @param {AbortSignal} [options.signal] Aborting cancels the pick.
     * @returns {Promise<{rect: {x:number,y:number,width:number,height:number}, documents: foundry.abstract.Document[]}|null>}
     *   `null` when cancelled.
     */
    pickArea: (options) => CanvasPickManager.pickArea(options),

    /** Cancel the open pick, if any; its promise resolves `null`. */
    cancelPick: () => CanvasPickManager.cancel(),

    /** The document names `pickArea` can return. */
    pickTypes: PICKABLE_TYPES,
    pickContainment: PICK_CONTAINMENT,
    pickLevels: PICK_LEVELS
};
