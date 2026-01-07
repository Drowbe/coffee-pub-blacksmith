// ================================================================== 
// ===== TOKEN DEPLOYMENT API =======================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/**
 * Shared token deployment API for use by encounter toolbar, party tools, and other features
 */

/**
 * Get default token data structure
 * @returns {Object} Default token data
 */
export function getDefaultTokenData() {
    // In v13, use CONFIG.Token.defaults if available
    if (CONFIG.Token?.defaults) {
        return foundry.utils.deepClone(CONFIG.Token.defaults);
    }
    
    // Fallback: Create a default token data structure
    return {
        displayName: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
        displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
        disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
        vision: true,
        lockRotation: false,
        actorLink: false,
        hidden: false
    };
}

/**
 * Validate a UUID and ensure it's a valid actor reference
 * @param {string} uuid - The UUID to validate
 * @returns {Promise<string|null>} Validated UUID or null
 */
export async function validateActorUUID(uuid) {
    try {
        // Check if it's a valid UUID format for actors
        // Accept both compendium references (Compendium.module.collection.Actor.id) and world actors (Actor.id)
        if (!uuid.includes('Compendium.') && !uuid.startsWith('Actor.')) {
            postConsoleAndNotification(MODULE.NAME, `Token API: Invalid UUID format`, uuid, true, false);
            return null;
        }
        
        // Try to load the actor to validate it exists
        const actor = await fromUuid(uuid);
        if (!actor) {
            postConsoleAndNotification(MODULE.NAME, `Token API: Could not load actor with UUID`, uuid, true, false);
            return null;
        }
        
        return uuid;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `Token API: Error validating UUID`, { uuid, error }, true, false);
        return null;
    }
}

/**
 * Get target position from canvas click
 * @param {boolean} allowMultiple - Whether to allow multiple clicks (CTRL key)
 * @returns {Promise<Object|null>} Position result with {position: {x, y}, isAltHeld: boolean} or null if cancelled
 */
export async function getTargetPosition(allowMultiple = false) {
    return new Promise((resolve) => {
        postConsoleAndNotification(MODULE.NAME, "Token API: Setting up click handler for target position", `Allow multiple: ${allowMultiple}`, true, false);
        
        // Use FoundryVTT's canvas pointer handling
        const handler = (event) => {
            postConsoleAndNotification(MODULE.NAME, "Token API: Canvas pointer event! Event type", event.type, true, false);
            
            // Only handle pointerdown events (clicks)
            if (event.type !== 'pointerdown') {
                return;
            }
            
            // Ignore right-clicks (button 2)
            if (event.data.originalEvent && event.data.originalEvent.button === 2) {
                postConsoleAndNotification(MODULE.NAME, "Token API: Right-click ignored by main handler", "", true, false);
                return;
            }
            
            // Use FoundryVTT's built-in coordinate conversion
            const stage = canvas.stage;
            const globalPoint = new PIXI.Point(event.global.x, event.global.y);
            const localPoint = stage.toLocal(globalPoint);
            
            // Use the exact click position first, then snap to grid square center
            let position = { x: localPoint.x, y: localPoint.y };
            
            // Get the grid size and calculate grid square center
            const gridSize = canvas.scene.grid.size;
            
            // Snap to top-left of the grid square (token coordinates are top-left, not center)
            const snappedX = Math.floor(localPoint.x / gridSize) * gridSize;
            const snappedY = Math.floor(localPoint.y / gridSize) * gridSize;
            
            position = { x: snappedX, y: snappedY };
            
            // Check if CTRL is held down for multiple deployments
            const isCtrlHeld = event.data.originalEvent && event.data.originalEvent.ctrlKey;
            // Check if ALT is held down for invisible deployment
            const isAltHeld = event.data.originalEvent && event.data.originalEvent.altKey;
            
            // If not allowing multiple or CTRL not held, remove the handler
            if (!allowMultiple || !isCtrlHeld) {
                canvas.stage.off('pointerdown', handler);
                document.removeEventListener('keyup', keyUpHandler);
                postConsoleAndNotification(MODULE.NAME, "Token API: Click handler removed, resolving position", "", true, false);
            } else {
                postConsoleAndNotification(MODULE.NAME, "Token API: CTRL held, keeping handler for multiple deployments", "", true, false);
            }
            
            // Resolve with the position and key states
            if (position) {
                const result = {
                    position: position,
                    isAltHeld: isAltHeld
                };
                postConsoleAndNotification(MODULE.NAME, "Token API: Resolving position", result, true, false);
                resolve(result);
            } else {
                postConsoleAndNotification(MODULE.NAME, "Token API: No valid position obtained, resolving null", "", true, false);
                resolve(null);
            }
        };
        
        // Key up handler to detect when CTRL is released
        const keyUpHandler = (event) => {
            if (event.key === 'Control' && allowMultiple) {
                canvas.stage.off('pointerdown', handler);
                document.removeEventListener('keyup', keyUpHandler);
                resolve(null);
            }
        };
        
        // Right-click handler to detect cancellation
        const rightClickHandler = (event) => {
            if (event.data.originalEvent && event.data.originalEvent.button === 2) {
                postConsoleAndNotification(MODULE.NAME, "Token API: Right-click detected, cancelling deployment", "", true, false);
                canvas.stage.off('pointerdown', handler);
                canvas.stage.off('pointerdown', rightClickHandler);
                document.removeEventListener('keyup', keyUpHandler);
                resolve(null);
            }
        };
        
        // Add the event listeners
        canvas.stage.on('pointerdown', handler);
        canvas.stage.on('pointerdown', rightClickHandler);
        document.addEventListener('keyup', keyUpHandler);
    });
}

/**
 * Calculate circle position for token deployment
 * @param {Object} centerPosition - Center position {x, y}
 * @param {number} index - Token index (0-based)
 * @param {number} totalTokens - Total number of tokens
 * @returns {Object} Position {x, y}
 */
export function calculateCirclePosition(centerPosition, index, totalTokens) {
    if (index === 0) {
        return { x: centerPosition.x, y: centerPosition.y };
    }
    const radius = 100;
    const angleStep = (2 * Math.PI) / (totalTokens - 1);
    const angle = (index - 1) * angleStep;
    const x = centerPosition.x + (radius * Math.cos(angle));
    const y = centerPosition.y + (radius * Math.sin(angle));
    return { x, y };
}

/**
 * Check if a grid square is occupied by an existing token
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} gridSize - Grid size
 * @returns {boolean} True if occupied
 */
export function isGridSquareOccupied(x, y, gridSize) {
    const snappedX = Math.floor(x / gridSize) * gridSize;
    const snappedY = Math.floor(y / gridSize) * gridSize;

    return canvas.tokens.placeables.some(token => {
        const tokenX = Math.floor(token.x / gridSize) * gridSize;
        const tokenY = Math.floor(token.y / gridSize) * gridSize;
        return tokenX === snappedX && tokenY === snappedY;
    });
}

/**
 * Calculate scatter position for token deployment
 * @param {Object} centerPosition - Center position {x, y}
 * @param {number} index - Token index (0-based)
 * @param {number} totalTokens - Total number of tokens
 * @returns {Object} Position {x, y}
 */
export function calculateScatterPosition(centerPosition, index, totalTokens) {
    // Calculate scatter formation using grid-based random placement
    const gridSize = canvas.scene.grid.size;
    
    // If this is the first token (index 0), place it exactly at the clicked position
    if (index === 0) {
        postConsoleAndNotification(MODULE.NAME, `Token API: Scatter position ${index} (first token at clicked position)`, centerPosition, true, false);
        return centerPosition;
    }
    
    // For subsequent tokens, use random scatter placement with no overlaps
    const gridWidth = totalTokens;
    const gridHeight = totalTokens;
    
    // Create an array of all possible positions
    const allPositions = [];
    for (let row = 0; row < gridHeight; row++) {
        for (let col = 0; col < gridWidth; col++) {
            allPositions.push({ row, col });
        }
    }
    
    // Shuffle the positions randomly
    for (let i = allPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]];
    }
    
    // Take exactly the number of tokens we need (excluding the first token which is already placed)
    const selectedPositions = allPositions.slice(0, totalTokens - 1);
    
    // Get the position for this specific token (index - 1 because first token is already placed)
    const tokenPosition = selectedPositions[index - 1];
    
    // Calculate the actual position using scene grid size
    let x = centerPosition.x + ((tokenPosition.col - Math.floor(gridWidth / 2)) * gridSize);
    let y = centerPosition.y + ((tokenPosition.row - Math.floor(gridHeight / 2)) * gridSize);
    
    // Snap to top-left of the grid square
    x = Math.floor(x / gridSize) * gridSize;
    y = Math.floor(y / gridSize) * gridSize;
    
    // Check if this position is already occupied by an existing token
    if (isGridSquareOccupied(x, y, gridSize)) {
        postConsoleAndNotification(MODULE.NAME, `Token API: Position occupied, trying next available position`, { x, y }, true, false);
        
        // Find the next available position
        for (let i = index; i < selectedPositions.length; i++) {
            const nextPosition = selectedPositions[i];
            let nextX = centerPosition.x + ((nextPosition.col - Math.floor(gridWidth / 2)) * gridSize);
            let nextY = centerPosition.y + ((nextPosition.row - Math.floor(gridHeight / 2)) * gridSize);
            
            nextX = Math.floor(nextX / gridSize) * gridSize;
            nextY = Math.floor(nextY / gridSize) * gridSize;
            
            if (!isGridSquareOccupied(nextX, nextY, gridSize)) {
                postConsoleAndNotification(MODULE.NAME, `Token API: Found available position`, { x: nextX, y: nextY }, true, false);
                return { x: nextX, y: nextY };
            }
        }
        
        // If no position found in the grid, place it at a random offset
        const randomOffset = Math.floor(Math.random() * 3) + 1; // 1-3 grid squares away
        const randomDirection = Math.floor(Math.random() * 4); // 0-3 for different directions
        
        let fallbackX = x;
        let fallbackY = y;
        
        switch (randomDirection) {
            case 0: fallbackX += randomOffset * gridSize; break; // Right
            case 1: fallbackX -= randomOffset * gridSize; break; // Left
            case 2: fallbackY += randomOffset * gridSize; break; // Down
            case 3: fallbackY -= randomOffset * gridSize; break; // Up
        }
        
        postConsoleAndNotification(MODULE.NAME, `Token API: Using fallback position`, { x: fallbackX, y: fallbackY }, true, false);
        return { x: fallbackX, y: fallbackY };
    }
    
    return { x, y };
}

/**
 * Calculate square/grid position for token deployment
 * @param {Object} centerPosition - Center position {x, y}
 * @param {number} index - Token index (0-based)
 * @param {number} totalTokens - Total number of tokens
 * @returns {Object} Position {x, y}
 */
export function calculateSquarePosition(centerPosition, index, totalTokens) {
    // Calculate square formation - grid-based square block
    const gridSize = canvas.scene.grid.size;
    const spacing = gridSize;
    
    // Calculate the dimensions of the square
    const sideLength = Math.ceil(Math.sqrt(totalTokens));
    
    // Calculate row and column for this token
    const row = Math.floor(index / sideLength);
    const col = index % sideLength;
    
    // Calculate position in grid square centers
    let x = centerPosition.x + (col * spacing);
    let y = centerPosition.y + (row * spacing);
    
    // Snap to top-left of the grid square
    x = Math.floor(x / gridSize) * gridSize;
    y = Math.floor(y / gridSize) * gridSize;
    
    postConsoleAndNotification(MODULE.NAME, `Token API: Square position ${index} (row ${row}, col ${col}, sideLength ${sideLength}, gridSize ${gridSize})`, { x, y }, true, false);
    return { x, y };
}

/**
 * Get deployment pattern display name
 * @param {string} pattern - Pattern identifier
 * @returns {string} Display name
 */
export function getDeploymentPatternName(pattern) {
    const patternNames = {
        "circle": "Circle",
        "line": "Linear", 
        "scatter": "Scattered",
        "grid": "Grid",
        "sequential": "Sequential"
    };
    return patternNames[pattern] || "Unknown Pattern";
}

/**
 * Deploy tokens to the canvas
 * @param {string[]} actorUUIDs - Array of actor UUIDs to deploy
 * @param {Object} options - Deployment options
 * @param {string} options.deploymentPattern - Pattern: "circle", "line", "scatter", "grid", "sequential"
 * @param {boolean} options.deploymentHidden - Whether tokens should be hidden
 * @param {boolean} options.isAltHeld - Whether ALT key is held (overrides hidden setting)
 * @param {Object} options.position - Optional pre-set position {x, y} (skips click handler)
 * @param {Function} options.onActorPrepared - Callback before token creation: (actor, worldActor) => void
 * @param {Function} options.onTokenCreated - Callback after token creation: (token) => void
 * @param {Function} options.onProgress - Progress callback: (current, total, message) => void
 * @param {Function} options.getTooltipContent - Function to get tooltip content: (tokenCount, patternName) => string
 * @returns {Promise<Array>} Array of created token documents
 */
export async function deployTokens(actorUUIDs, options = {}) {
    // Check if user has permission to create tokens
    if (!game.user.isGM) {
        return [];
    }
    
    if (!actorUUIDs || actorUUIDs.length === 0) {
        return [];
    }
    
    const deploymentPattern = options.deploymentPattern || "line";
    const deploymentHidden = options.deploymentHidden || false;
    
    // Create tooltip for non-sequential deployments
    let tooltip = null;
    let mouseMoveHandler = null;
    const deployedTokens = [];
    
    try {
        if (deploymentPattern !== "sequential") {
            tooltip = document.createElement('div');
            tooltip.className = 'encounter-tooltip';
            document.body.appendChild(tooltip);
            
            mouseMoveHandler = (event) => {
                tooltip.style.left = (event.data.global.x + 15) + 'px';
                tooltip.style.top = (event.data.global.y - 40) + 'px';
            };
            
            // Show initial tooltip
            const patternName = getDeploymentPatternName(deploymentPattern);
            let tooltipContent = '';
            
            if (options.getTooltipContent) {
                // Handle both async and sync getTooltipContent functions
                const result = options.getTooltipContent(actorUUIDs.length, patternName);
                tooltipContent = result instanceof Promise ? await result : result;
            } else {
                tooltipContent = `
                    <div class="monster-name">Deploying Tokens</div>
                    <div class="progress">${patternName} - Click to place ${actorUUIDs.length} tokens</div>
                `;
            }
            
            tooltip.innerHTML = tooltipContent;
            tooltip.classList.add('show');
            canvas.stage.on('mousemove', mouseMoveHandler);
        }
        
        // Handle sequential deployment (one-by-one placement)
        if (deploymentPattern === "sequential") {
            return await deployTokensSequential(actorUUIDs, options);
        }
        
        // Validate we have a scene
        if (!canvas.scene) {
            postConsoleAndNotification(MODULE.NAME, "Token API: No active scene for deployment", "", false, false);
            if (tooltip && tooltip.parentNode) {
                tooltip.remove();
            }
            if (mouseMoveHandler) {
                canvas.stage.off('mousemove', mouseMoveHandler);
            }
            return [];
        }
        
        // Get the target position
        let positionResult;
        if (options.position) {
            // Use provided position
            positionResult = {
                position: options.position,
                isAltHeld: options.isAltHeld || false
            };
            postConsoleAndNotification(MODULE.NAME, "Token API: Using provided position", positionResult.position, true, false);
        } else {
            // Get position from canvas click
            const isSingleToken = actorUUIDs.length === 1;
            postConsoleAndNotification(MODULE.NAME, "Token API: Waiting for canvas click", `Single token: ${isSingleToken}`, true, false);
            positionResult = await getTargetPosition(isSingleToken);
        }
        
        if (!positionResult) {
            // User cancelled or no position obtained
            postConsoleAndNotification(MODULE.NAME, "Token API: Position selection cancelled or failed", "", false, false);
            if (tooltip && tooltip.parentNode) {
                tooltip.remove();
            }
            if (mouseMoveHandler) {
                canvas.stage.off('mousemove', mouseMoveHandler);
            }
            return [];
        }
        
        postConsoleAndNotification(MODULE.NAME, "Token API: Position obtained", positionResult.position, true, false);
        
        const position = positionResult.position;
        const isAltHeld = positionResult.isAltHeld;
        
        // First, count valid tokens to get the total
        let validTokenCount = 0;
        for (let i = 0; i < actorUUIDs.length; i++) {
            const uuid = actorUUIDs[i];
            const validatedId = await validateActorUUID(uuid);
            if (validatedId) {
                const actor = await fromUuid(validatedId);
                if (actor) {
                    validTokenCount++;
                } else {
                    postConsoleAndNotification(MODULE.NAME, `Token API: Could not load actor from UUID`, uuid, true, false);
                }
            } else {
                postConsoleAndNotification(MODULE.NAME, `Token API: Invalid UUID format`, uuid, true, false);
            }
        }
        
        postConsoleAndNotification(MODULE.NAME, `Token API: Valid token count`, `${validTokenCount} of ${actorUUIDs.length}`, true, false);
        
        if (validTokenCount === 0) {
            postConsoleAndNotification(MODULE.NAME, "Token API: No valid actors found for deployment", "", false, false);
            if (tooltip && tooltip.parentNode) {
                tooltip.remove();
            }
            if (mouseMoveHandler) {
                canvas.stage.off('mousemove', mouseMoveHandler);
            }
            return [];
        }
        
        // Deploy each token at this position
        let validTokenIndex = 0;
        for (let i = 0; i < actorUUIDs.length; i++) {
            const uuid = actorUUIDs[i];
            
            try {
                // Validate the UUID
                const validatedId = await validateActorUUID(uuid);
                if (!validatedId) {
                    postConsoleAndNotification(MODULE.NAME, `Token API: Could not validate UUID, skipping`, uuid, true, false);
                    continue;
                }
                
                const actor = await fromUuid(validatedId);
                
                if (actor) {
                    // Call onActorPrepared callback if provided (for compendium handling, folder creation, etc.)
                    let worldActor = actor;
                    if (options.onActorPrepared) {
                        worldActor = await options.onActorPrepared(actor, worldActor) || worldActor;
                    }
                    
                    // Calculate position based on pattern
                    let tokenPosition;
                    if (deploymentPattern === "circle") {
                        tokenPosition = calculateCirclePosition(position, validTokenIndex, validTokenCount);
                    } else if (deploymentPattern === "scatter") {
                        tokenPosition = calculateScatterPosition(position, validTokenIndex, validTokenCount);
                    } else if (deploymentPattern === "grid") {
                        tokenPosition = calculateSquarePosition(position, validTokenIndex, validTokenCount);
                    } else {
                        // Default to line formation
                        const gridSize = canvas.scene.grid.size;
                        tokenPosition = {
                            x: position.x + (validTokenIndex * gridSize),
                            y: position.y
                        };
                    }
                    
                    // Create token data
                    const tokenData = foundry.utils.mergeObject(
                        getDefaultTokenData(),
                        worldActor.prototypeToken.toObject(),
                        { overwrite: false }
                    );
                    
                    // Set token properties
                    tokenData.x = tokenPosition.x;
                    tokenData.y = tokenPosition.y;
                    tokenData.actorId = worldActor.id;
                    tokenData.actorLink = worldActor.prototypeToken.actorLink;
                    tokenData.hidden = isAltHeld ? true : deploymentHidden;
                    
                    // Honor lock rotation setting
                    const defaultTokenData = getDefaultTokenData();
                    if (defaultTokenData.lockRotation !== undefined) {
                        tokenData.lockRotation = defaultTokenData.lockRotation;
                    }
                    
                    // Create the token on the canvas
                    const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
                    
                    // Verify the token was created
                    if (createdTokens && createdTokens.length > 0) {
                        const token = createdTokens[0];
                        deployedTokens.push(token);
                        
                        // Call onTokenCreated callback if provided
                        if (options.onTokenCreated) {
                            await options.onTokenCreated(token);
                        }
                        
                        // Call progress callback if provided
                        if (options.onProgress) {
                            options.onProgress(validTokenIndex + 1, validTokenCount, `Deployed ${token.name}`);
                        }
                        
                        validTokenIndex++;
                    }
                }
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Token API: Failed to deploy token ${uuid}`, error, false, false);
            }
        }
        
        // Update tooltip to show completion
        if (tooltip) {
            const patternName = getDeploymentPatternName(deploymentPattern);
            tooltip.innerHTML = `
                <div class="monster-name">Deployment Complete</div>
                <div class="progress">${patternName} - Deployed ${deployedTokens.length} tokens</div>
            `;
            
            // Remove tooltip after a short delay
            setTimeout(() => {
                if (tooltip && tooltip.parentNode) {
                    tooltip.remove();
                }
                if (mouseMoveHandler) {
                    canvas.stage.off('mousemove', mouseMoveHandler);
                }
            }, 2000);
        }
        
        return deployedTokens;
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, "Token API: Error deploying tokens", error, false, false);
        return [];
    } finally {
        // Clean up tooltip and handlers for non-sequential deployments
        if (deploymentPattern !== "sequential" && tooltip) {
            if (tooltip.parentNode) {
                tooltip.remove();
            }
            if (mouseMoveHandler) {
                canvas.stage.off('mousemove', mouseMoveHandler);
            }
        }
    }
}

/**
 * Deploy tokens sequentially (one-by-one placement)
 * @param {string[]} actorUUIDs - Array of actor UUIDs to deploy
 * @param {Object} options - Deployment options
 * @param {boolean} options.deploymentHidden - Whether tokens should be hidden
 * @param {Function} options.onActorPrepared - Callback before token creation: (actor, worldActor) => void
 * @param {Function} options.onTokenCreated - Callback after token creation: (token) => void
 * @param {Function} options.getTooltipContent - Function to get tooltip content for each token: (actorName, index, total) => string
 * @returns {Promise<Array>} Array of created token documents
 */
export async function deployTokensSequential(actorUUIDs, options = {}) {
    // Check if user has permission to create tokens
    if (!game.user.isGM) {
        return [];
    }
    
    if (!actorUUIDs || actorUUIDs.length === 0) {
        return [];
    }
    
    // Validate we have a scene
    if (!canvas.scene) {
        postConsoleAndNotification(MODULE.NAME, "Token API: No active scene for deployment", "", false, false);
        return [];
    }
    
    const deploymentHidden = options.deploymentHidden || false;
    
    // Set cursor to indicate placement mode
    canvas.stage.cursor = 'crosshair';
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'encounter-tooltip';
    document.body.appendChild(tooltip);
    
    // Mouse move handler for tooltip
    const mouseMoveHandler = (event) => {
        tooltip.style.left = (event.data.global.x + 15) + 'px';
        tooltip.style.top = (event.data.global.y - 40) + 'px';
    };
    
    const deployedTokens = [];
    
    try {
        // Prepare all actors first (without placing tokens)
        const actors = [];
        for (let i = 0; i < actorUUIDs.length; i++) {
            const uuid = actorUUIDs[i];
            
            try {
                // Validate the UUID
                const validatedId = await validateActorUUID(uuid);
                if (!validatedId) {
                    postConsoleAndNotification(MODULE.NAME, `Token API: Could not validate UUID, skipping`, uuid, true, false);
                    continue;
                }
                
                const actor = await fromUuid(validatedId);
                
                if (actor) {
                    // Call onActorPrepared callback if provided (for compendium handling, folder creation, etc.)
                    let worldActor = actor;
                    if (options.onActorPrepared) {
                        worldActor = await options.onActorPrepared(actor, worldActor) || worldActor;
                    }
                    
                    // Update prototype token settings if needed
                    if (worldActor !== actor || actor.pack) {
                        const defaultTokenData = getDefaultTokenData();
                        const prototypeTokenData = foundry.utils.mergeObject(defaultTokenData, worldActor.prototypeToken.toObject(), { overwrite: false });
                        await worldActor.update({ prototypeToken: prototypeTokenData });
                    }
                    
                    // Always refresh the actor from the world collection to ensure it's fully synced
                    // This is especially important after Actor.create() or update()
                    if (worldActor?.id) {
                        const refreshedActor = game.actors.get(worldActor.id);
                        if (refreshedActor) {
                            worldActor = refreshedActor;
                        }
                    }
                    
                    // Ensure we have a valid actor with a name before adding to array
                    if (worldActor && typeof worldActor.name === 'string') {
                        actors.push(worldActor);
                    } else {
                        postConsoleAndNotification(MODULE.NAME, `Token API: Actor missing name property, skipping`, worldActor?.id || 'unknown', true, false);
                    }
                }
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, `Token API: Error preparing actor ${uuid}`, error, true, false);
            }
        }
        
        if (actors.length === 0) {
            postConsoleAndNotification(MODULE.NAME, "Token API: No valid actors prepared for sequential deployment", "", false, false);
            return [];
        }
        
        // Now place tokens one by one
        for (let i = 0; i < actors.length; i++) {
            const actor = actors[i];
            
            // Ensure we have a fresh reference and get the name
            // Refresh from world collection to ensure all properties are synced
            let currentActor = actor;
            if (actor?.id) {
                const freshActor = game.actors.get(actor.id);
                if (freshActor) {
                    currentActor = freshActor;
                }
            }
            
            // Get actor name - ensure it's a string, not a Promise
            let actorName = currentActor?.name;
            if (typeof actorName !== 'string') {
                // If name is not a string, try to get it from the actor's data
                actorName = currentActor?.system?.name || currentActor?.data?.name || 'Unknown Actor';
            }
            
            // Final fallback
            if (!actorName || typeof actorName !== 'string') {
                actorName = 'Unknown Actor';
            }
            
            // Update tooltip content
            let tooltipContent = '';
            if (options.getTooltipContent) {
                tooltipContent = options.getTooltipContent(actorName, i + 1, actors.length);
            } else {
                tooltipContent = `
                    <div class="monster-name">${actorName}</div>
                    <div class="progress">Click to place (${i + 1} of ${actors.length})</div>
                `;
            }
            
            tooltip.innerHTML = tooltipContent;
            tooltip.classList.add('show');
            
            // Add mouse move handler
            canvas.stage.on('mousemove', mouseMoveHandler);
            
            // Get position for this token
            const positionResult = await getTargetPosition(false);
            
            // Remove mouse move handler
            canvas.stage.off('mousemove', mouseMoveHandler);
            
            // Check if user cancelled
            if (!positionResult) {
                postConsoleAndNotification(MODULE.NAME, "Token API: Sequential deployment cancelled by user", "", false, false);
                break; // Exit the loop and return deployed tokens so far
            }
            
            const position = positionResult.position;
            const isAltHeld = positionResult.isAltHeld;
            
            // Create token data
            const defaultTokenData = getDefaultTokenData();
            const tokenData = foundry.utils.mergeObject(defaultTokenData, actor.prototypeToken.toObject(), { overwrite: false });
            
            // Set position and linking
            tokenData.x = position.x;
            tokenData.y = position.y;
            tokenData.actorId = actor.id;
            tokenData.actorLink = actor.prototypeToken.actorLink;
            tokenData.hidden = isAltHeld ? true : deploymentHidden;
            
            // Honor lock rotation setting
            if (defaultTokenData.lockRotation !== undefined) {
                tokenData.lockRotation = defaultTokenData.lockRotation;
            }
            
            // Create the token
            const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
            if (createdTokens && createdTokens.length > 0) {
                const token = createdTokens[0];
                deployedTokens.push(token);
                
                // Call onTokenCreated callback if provided
                if (options.onTokenCreated) {
                    await options.onTokenCreated(token);
                }
            }
        }
        
        // Show completion tooltip briefly
        if (deployedTokens.length > 0) {
            tooltip.innerHTML = `
                <div class="monster-name">Deployment Complete</div>
                <div class="progress">Deployed ${deployedTokens.length} of ${actors.length} tokens</div>
            `;
            setTimeout(() => {
                if (tooltip && tooltip.parentNode) {
                    tooltip.remove();
                }
            }, 2000);
        }
        
        return deployedTokens;
        
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, "Token API: Error in sequential deployment", error, false, false);
        return [];
    } finally {
        // Clean up
        canvas.stage.off('mousemove', mouseMoveHandler);
        if (tooltip && tooltip.parentNode) {
            tooltip.remove();
        }
        canvas.stage.cursor = 'default';
    }
}


