// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';
import { ChatPanel } from "./chat-panel.js";

// ================================================================== 
// ===== STATE VARIABLES ============================================
// ================================================================== 

// Store the leader's movement path for conga line
let leaderMovementPath = [];
// Track tokens following paths with their current position in the path
const tokenFollowers = new Map(); // token.id -> {marchPosition, moving, currentPathIndex}
// Track which grid positions are currently occupied
const occupiedGridPositions = new Set(); // "x,y" strings
// Track the current leader token ID to ensure we never move it
let currentLeaderTokenId = null;
// Track the last time the leader moved
let lastLeaderMoveTime = Date.now();
// Track consecutive moves without leader movement
const MAX_MOVES_WITHOUT_LEADER = 10;
// Flag to indicate if marching order was just determined
let marchingOrderJustDetermined = false;
// Flag to track if the conga line movement is currently being processed
let processingCongaMovement = false;
// Add this near the top with other state variables
const tokenOriginalPositions = new Map(); // Store original positions separately

// Add state variable for pre-combat movement mode
let preCombatMovementMode = null;

// Add state variable for token spacing
let tokenSpacing = 0;

// ================================================================== 
// ===== SHARED MOVEMENT FUNCTIONS ==================================
// ================================================================== 

// Validate if token movement is allowed and return movement context
function validateMovement(tokenDocument, changes, userId) {
    const currentMovement = game.settings.get(MODULE_ID, 'movementType');
    const partyLeaderUserId = game.settings.get(MODULE_ID, 'partyLeader');
    const movedByLeader = userId === partyLeaderUserId;
    const movedByGM = game.users.get(userId)?.isGM;
    
    return {
        currentMovement,
        partyLeaderUserId,
        movedByLeader,
        movedByGM,
        isValid: (currentMovement === 'follow-movement' || currentMovement === 'conga-movement')
    };
}

// Handle leader movement and path recording
function handleLeaderMovement(token, tokenDocument) {
    currentLeaderTokenId = token.id;
    
    const position = {
        x: tokenDocument.x,
        y: tokenDocument.y,
        gridPos: getGridPositionKey(tokenDocument.x, tokenDocument.y)
    };
    
    const startPosition = {
        x: tokenDocument._source.x,
        y: tokenDocument._source.y,
        gridPos: getGridPositionKey(tokenDocument._source.x, tokenDocument._source.y)
    };

    if (leaderMovementPath.length === 0) {
        leaderMovementPath.push(startPosition);
        console.log(`BLACKSMITH | MOVEMENT | Started new leader path at: ${startPosition.x},${startPosition.y}`);
    }
    
    return { position, startPosition };
}

// Process follower movement based on movement mode
function processFollowerMovement(mode, sortedFollowers) {
    if (!sortedFollowers || sortedFollowers.length === 0) return;
    
    if (mode === 'follow-movement') {
        processFollowMovement(sortedFollowers);
    } else if (mode === 'conga-movement') {
        processCongaMovement(sortedFollowers);
    }
}

// Get sorted followers array for movement processing
function getSortedFollowers() {
    return Array.from(tokenFollowers.entries())
        .filter(([tokenId]) => {
            const token = canvas.tokens.get(tokenId);
            return !!token;
        })
        .sort((a, b) => a[1].marchPosition - b[1].marchPosition);
}

// Check if a token is being moved as part of automated movement
function isAutomatedMovement(token, changes) {
    return tokenFollowers.has(token.id) && 
           (processingCongaMovement || changes.flags?.[MODULE_ID]?.congaMovement);
}

// Handle initial setup or GM reordering of tokens
function handleTokenOrdering(token, isFirstTimeSetup, isGMMoveOfFollower) {
    if ((isFirstTimeSetup || isGMMoveOfFollower) && !marchingOrderJustDetermined) {
        console.log('BLACKSMITH | MOVEMENT | Determining marching order - first setup or GM reordering');
        calculateMarchingOrder(token);
        marchingOrderJustDetermined = true;
        setTimeout(() => marchingOrderJustDetermined = false, 1000);
    }
}

// ================================================================== 
// ===== EXISTING CODE BELOW ========================================
// ================================================================== 

// Make sure settings are registered right away
Hooks.once('init', () => {
    // Register socket listeners for movement changes
    game.socket.on(`module.${MODULE_ID}`, (message) => {
        if (message.type === 'movementChange' && !game.user.isGM) {
            ui.notifications.info(`Movement type changed to: ${message.data.name}`);
            
            // Force refresh of the chat panel for consistent update
            ui.chat.render();
            
            // Also try immediate update if elements exist
            setTimeout(() => {
                const movementIcon = document.querySelector('.movement-icon');
                const movementLabel = document.querySelector('.movement-label');
                
                const movementTypes = {
                    'normal-movement': { icon: 'fa-person-running', name: 'Normal' },
                    'no-movement': { icon: 'fa-person-circle-xmark', name: 'None' },
                    'combat-movement': { icon: 'fa-swords', name: 'Combat' },
                    'follow-movement': { icon: 'fa-person-walking-arrow-right', name: 'Follow' },
                    'conga-movement': { icon: 'fa-people-pulling', name: 'Conga' }
                };
                
                const newType = movementTypes[message.data.movementId];
                if (newType) {
                    if (movementIcon) {
                        movementIcon.className = `fas ${newType.icon} movement-icon`;
                        console.log('BLACKSMITH | MOVEMENT | Movement icon updated:', newType.icon);
                    }
                    if (movementLabel) {
                        movementLabel.textContent = newType.name;
                        console.log('BLACKSMITH | MOVEMENT | Movement label updated:', newType.name);
                    }
                }
            }, 100); // Short delay to ensure DOM is updated
        }
    });

    // Register movement type setting if not already registered
    if (!game.settings.settings.has(`${MODULE_ID}.movementType`)) {
        game.settings.register(MODULE_ID, 'movementType', {
            name: 'Current Movement Type',
            hint: 'The current movement restriction type for all players',
            scope: 'world',
            config: false,
            type: String,
            default: 'normal-movement'
        });
    }

    // Register token spacing setting
    if (!game.settings.settings.has(`${MODULE_ID}.tokenSpacing`)) {
        game.settings.register(MODULE_ID, 'tokenSpacing', {
            name: 'Token Spacing',
            hint: 'Number of grid spaces to maintain between tokens in formation',
            scope: 'world',
            config: false,
            type: Number,
            default: 0
        });
    }
});

export class MovementConfig extends Application {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'movement-config',
            template: 'modules/coffee-pub-blacksmith/templates/movement-window.hbs',
            title: 'Configure Movement',
            width: 300,
            height: 'auto',
            classes: ['coffee-pub-blacksmith', 'movement-config']
        });
    }

    getData() {
        // Check if user is GM or current leader
        const isGM = game.user.isGM;
        const currentSpacing = game.settings.get(MODULE_ID, 'tokenSpacing') || 0;

        return {
            currentSpacing,
            MovementTypes: [
                {
                    id: 'normal-movement',
                    name: 'Free',
                    description: 'All party members can move their tokens at will without limitations but potential consequences. Move wisely.',
                    icon: 'fa-person-walking',
                },
                {
                    id: 'no-movement',
                    name: 'Locked',
                    description: 'Movement is completly locked down for all party members.',
                    icon: 'fa-person-circle-xmark'
                },
                {
                    id: 'combat-movement',
                    name: 'Combat',
                    description: 'Movement is locked down while combat is active or manually enabled. Players can only move their tokens during their turn in combat.',
                    icon: 'fa-swords'
                },
                {
                    id: 'follow-movement',
                    name: 'Follow',
                    description: 'The party leader moves freely while the reamining party loosely follows them in line.',
                    icon: 'fa-person-walking-arrow-right'
                },
                {
                    id: 'conga-movement',
                    name: 'Conga',
                    description: 'The party leader moves freely while the ramaining party will follow the exact path set by the leader.',
                    icon: 'fa-people-pulling'
                }
            ].filter(type => !type.gmOnly || isGM)
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Add click handler for movement types
        html.find('.movement-type').click(async (event) => {
            const movementId = event.currentTarget.dataset.movementId;
            await this._handleMovementChange(movementId);
        });

        // Add change handler for spacing slider
        html.find('.token-spacing-slider').on('input change', async (event) => {
            const spacing = parseInt(event.currentTarget.value);
            await game.settings.set(MODULE_ID, 'tokenSpacing', spacing);
            tokenSpacing = spacing; // Update the local variable
            
            // Update the display value
            html.find('.spacing-value').text(spacing);
        });
    }

    async _handleMovementChange(movementId) {
        // Only GM can change movement
        if (!game.user.isGM) return;

        // Store the movement type in game settings
        await game.settings.set(MODULE_ID, 'movementType', movementId);

        // Get the movement type name for the notification
        const movementType = this.getData().MovementTypes.find(t => t.id === movementId);
        if (!movementType) return;

        // Special handling for conga movement
        if (movementId === 'conga-movement' || movementId === 'follow-movement') {
            const leader = checkPartyLeader();
            if (!leader) {
                ui.notifications.warn(`No party leader set for ${movementType.name}. Please set a party leader in the leader panel (crown icon).`);
            } else {
                // Find the leader's token(s)
                const partyLeaderUserId = game.settings.get(MODULE_ID, 'partyLeader');
                // Find all leader's characters
                const leaderCharacters = game.actors.filter(a => 
                    a.hasPlayerOwner && a.ownership[partyLeaderUserId] === 3
                );
                
                // Find a token on the canvas owned by the leader
                const leaderTokens = canvas.tokens.placeables.filter(t => 
                    t.actor && leaderCharacters.some(a => a.id === t.actor.id)
                );
                
                if (leaderTokens.length > 0) {
                    // Use the first leader token for now
                    const leaderToken = leaderTokens[0];
                    currentLeaderTokenId = leaderToken.id;
                    
                    console.log(`BLACKSMITH | MOVEMENT | Setting initial leader token to ${leaderToken.name} (${leaderToken.id})`);
                    
                    // Reset state for movement
                    lastLeaderMoveTime = Date.now();
                    marchingOrderJustDetermined = false;
                    
                    // Force calculation of initial marching order
                    calculateMarchingOrder(leaderToken);
                    
                    // Get current spacing
                    const spacing = game.settings.get(MODULE_ID, 'tokenSpacing');
                    const spacingText = spacing > 0 ? `${spacing} grid space${spacing > 1 ? 's' : ''}` : '';
                    
                    // Create marching order array for chat card
                    const marchingOrder = [{
                        name: leaderToken.name,
                        position: "Point"
                    }];
                    
                    // Add followers to marching order
                    Array.from(tokenFollowers.entries())
                        .sort((a, b) => a[1].marchPosition - b[1].marchPosition)
                        .forEach(([tokenId, state], index, array) => {
                            const token = canvas.tokens.get(tokenId);
                            if (token) {
                                let position;
                                if (index === 0) {
                                    position = "Vanguard";
                                } else if (index === array.length - 1) {
                                    position = "Rear Guard";
                                } else {
                                    position = "Center";
                                }
                                marchingOrder.push({
                                    name: token.name,
                                    position: position
                                });
                            }
                        });

                    // For conga/follow movement
                    const templateData = {
                        isPublic: true,
                        isMovementChange: true,
                        movementIcon: movementType.icon,
                        movementLabel: movementType.name,
                        movementDescription: movementType.description,
                        movementMarchingOrder: marchingOrder,
                        spacingText: spacingText    
                    };

                    const content = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-cards.hbs', templateData);

                    // Send chat message
                    ChatMessage.create({
                        content: content,
                        type: CONST.CHAT_MESSAGE_TYPES.OTHER
                    });
                } else {
                    ui.notifications.warn("Could not find a leader token on the canvas. Make sure the party leader has at least one token placed.");
                }
            }
        } else {
            // For other movement types
            const basicTemplateData = {
                isPublic: true,
                isMovementChange: true,
                movementIcon: movementType.icon,
                movementLabel: movementType.name,
                movementDescription: movementType.description
            };

            const basicContent = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-cards.hbs', basicTemplateData);

            // Send chat message
            ChatMessage.create({
                content: basicContent,
                type: CONST.CHAT_MESSAGE_TYPES.OTHER
            });
        }

        // Force refresh of the chat panel
        ui.chat.render();

        // Update chat panel locally immediately for GM
        const movementIcon = document.querySelector('.movement-icon');
        const movementLabel = document.querySelector('.movement-label');
        
        if (movementIcon) movementIcon.className = `fas ${movementType.icon} movement-icon`;
        if (movementLabel) movementLabel.textContent = movementType.name;

        // Notify all users about the movement change
        game.socket.emit(`module.${MODULE_ID}`, {
            type: 'movementChange',
            data: {
                movementId,
                name: movementType.name
            }
        });

        // Clear any existing path when changing modes
        if (movementId !== 'conga-movement') {
            leaderMovementPath.length = 0;
            tokenFollowers.clear();
        }

        // Close the config window
        this.close();
    }

    // Helper method to get current movement type
    static getCurrentMovementType() {
        return game.settings.get(MODULE_ID, 'movementType') || 'normal-movement';
    }
} 

// Add debug function to check the current leader
function checkPartyLeader() {
    const partyLeaderUserId = game.settings.get(MODULE_ID, 'partyLeader');
    const leaderPlayer = game.users.get(partyLeaderUserId);
    
    if (!leaderPlayer) {
        ui.notifications.warn("No party leader set. Please set a party leader in settings.");
        return null;
    }
    
    console.log("Current party leader user:", leaderPlayer.name);
    console.log("Leader User ID:", partyLeaderUserId);
    
    // Find tokens owned by this player
    const leaderCharacters = game.actors.filter(a => 
        a.hasPlayerOwner && a.ownership[partyLeaderUserId] === 3
    );
    
    console.log("Leader's characters:", leaderCharacters.map(a => a.name));
    
    return leaderPlayer;
}

// Add hook for token movement restrictions
Hooks.on('preUpdateToken', (tokenDocument, changes, options, userId) => {
    // Skip if no position change
    if (!changes.x && !changes.y) return true;

    try {
        if (!game.settings.settings.get(`${MODULE_ID}.movementType`)) {
            // If setting doesn't exist yet, allow movement
            return true;
        }

        const currentMovement = game.settings.get(MODULE_ID, 'movementType');
        
        // Check if this is conga mode
        if (currentMovement === 'conga-movement') {
            console.log('Conga movement - checking if token can move');
            
            // If user is GM, always allow
            if (game.user.isGM) return true;
            
            // Get party leader user
            const partyLeaderUserId = game.settings.get(MODULE_ID, 'partyLeader');
            
            // If the moving user is the party leader, allow movement
            if (game.user.id === partyLeaderUserId) {
                console.log('User is party leader, allowing movement');
                return true;
            }
            
            // Non-leader tokens can't be moved manually in conga mode
            ui.notifications.warn("In Conga mode, only the leader can move tokens freely. Other tokens will follow automatically.");
            return false;
        }
        
        // Handle other movement types as before
        if (game.user.isGM) return true;
        
        // If no movement is allowed
        if (currentMovement === 'no-movement') {
            ui.notifications.warn("Token movement is currently disabled.");
            return false;
        }
        
        // If combat movement is enabled
        if (currentMovement === 'combat-movement') {
            const combat = game.combat;
            if (!combat?.started) {
                ui.notifications.warn("Token movement is only allowed during combat.");
                return false;
            }
            
            const currentCombatant = combat.current.tokenId;
            if (tokenDocument.id !== currentCombatant) {
                ui.notifications.warn("You can only move tokens during your turn in combat.");
                return false;
            }
        }
    } catch (err) {
        console.warn('Blacksmith | Movement type setting not registered yet, allowing movement', err);
    }
    
    // Allow movement in all other cases
    return true;
});

// Calculate the grid position for a token
function getGridPositionKey(x, y) {
    // Round to the nearest grid cell to handle potential floating point issues
    const gridSize = canvas.grid.size;
    const gridX = Math.round(x / gridSize) * gridSize;
    const gridY = Math.round(y / gridSize) * gridSize;
    return `${gridX},${gridY}`;
}

// Create path points between two positions
function createPathPoints(startPos, endPos) {
    const gridSize = canvas.grid.size;
    // Calculate distance in grid units
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    const steps = Math.max(Math.floor(distance / gridSize), 1);
    
    // For each step, create a path point
    const result = [];
    for (let i = 1; i <= steps; i++) {
        const x = startPos.x + (dx * i / steps);
        const y = startPos.y + (dy * i / steps);
        const gridPos = getGridPositionKey(x, y);
        
        // Don't add duplicate positions
        if (result.length > 0 && result[result.length - 1].gridPos === gridPos) {
            continue;
        }
        
        const point = { x, y, gridPos };
        result.push(point);
        console.log(`BLACKSMITH | MOVEMENT | Added path point: ${x},${y} (${gridPos})`);
    }
    
    return result;
}

// Record a step in the leader's movement path
function recordLeaderPathStep(startPos, endPos) {
    console.log(`BLACKSMITH | MOVEMENT | Recording path from ${startPos.x},${startPos.y} to ${endPos.x},${endPos.y} (${Math.max(Math.abs(endPos.x - startPos.x), Math.abs(endPos.y - startPos.y)) / 20} steps)`);
    
    // Create path points from start to end
    const points = createPathPoints(startPos, endPos);
    
    // Add points to the beginning of the path
    prependToPath(points);
}

// Hook for after a token is updated - used to trigger conga line
Hooks.on('updateToken', (tokenDocument, changes, options, userId) => {
    if (!changes.x && !changes.y) return;
    
    // Only process for GMs to avoid duplicate processing
    if (!game.user.isGM) return;
    
    try {
        // Validate movement and get context
        const movementContext = validateMovement(tokenDocument, changes, userId);
        if (!movementContext.isValid) return;
        
        // Get the token placeable from the document
        const token = canvas.tokens.get(tokenDocument.id);
        if (!token) return;
        
        // Check if this is automated movement (e.g. part of conga line)
        if (isAutomatedMovement(token, changes)) {
            console.log(`BLACKSMITH | MOVEMENT | Skipping processing for automated movement of token ${token.name}`);
            return;
        }
        
        // Handle leader movement - either by leader or GM moving leader's token
        const isLeaderToken = token.id === currentLeaderTokenId;
        if (movementContext.movedByLeader || (isLeaderToken && movementContext.movedByGM)) {
            console.log(`BLACKSMITH | MOVEMENT | Leader token moved by ${movementContext.movedByLeader ? 'leader' : 'GM'}: ${token.name}`);
            
            const { position, startPosition } = handleLeaderMovement(token, tokenDocument);
            
            // Calculate and add new path points
            const newPathPoints = recordLeaderPathStep(startPosition, position);
            trimPathPoints();
            
            // If no followers yet, calculate initial marching order
            if (tokenFollowers.size === 0) {
                console.log('BLACKSMITH | MOVEMENT | No followers yet, calculating initial marching order');
                calculateMarchingOrder(token);
            }
            
            // Process follower movement after a short delay
            setTimeout(() => {
                if (leaderMovementPath.length >= 2) {
                    console.log(`BLACKSMITH | MOVEMENT | Initiating ${movementContext.currentMovement} after leader moved`);
                    const sortedFollowers = getSortedFollowers();
                    processFollowerMovement(movementContext.currentMovement, sortedFollowers);
                } else {
                    console.log('BLACKSMITH | MOVEMENT | Not enough path points to move followers');
                }
            }, 100);
            
            return;
        }
        
        // Handle GM reordering or initial setup
        const isGMMoveOfFollower = movementContext.movedByGM && !movementContext.movedByLeader && token.id !== currentLeaderTokenId;
        const isFirstTimeSetup = tokenFollowers.size === 0;
        
        handleTokenOrdering(token, isFirstTimeSetup, isGMMoveOfFollower);
        
    } catch (err) {
        console.error('BLACKSMITH | MOVEMENT | Error in movement processing:', err);
    }
});

// Process follow movement - tokens follow in formation behind leader
function processFollowMovement(sortedFollowers) {
    // Safety check - if no path points, exit
    if (leaderMovementPath.length < 2) {
        console.log('BLACKSMITH | MOVEMENT | Not enough path points for follow movement');
        return;
    }
    
    console.log("BLACKSMITH | MOVEMENT | Leader path length:", leaderMovementPath.length);
    
    // Set processing flag
    processingCongaMovement = true;
    
    // Get the leader token
    const leaderToken = canvas.tokens.get(currentLeaderTokenId);
    if (!leaderToken) {
        console.log('BLACKSMITH | MOVEMENT | Leader token not found, aborting follow movement');
        processingCongaMovement = false;
        return;
    }
    
    // Get current spacing setting
    const spacing = game.settings.get(MODULE_ID, 'tokenSpacing');
    
    // Move tokens one by one with spacing
    moveNextTokenInLine(sortedFollowers, 0, spacing);
}

// Move a token in the line
function moveNextTokenInLine(sortedFollowers, index, spacing = 0) {
    // If we're done with all followers, finish
    if (index >= sortedFollowers.length) {
        processingCongaMovement = false;
        tokenOriginalPositions.clear();
        console.log('BLACKSMITH | MOVEMENT | Finished moving all followers');
        return;
    }
    
    const [tokenId, state] = sortedFollowers[index];
    const token = canvas.tokens.get(tokenId);
    
    // Skip if token doesn't exist
    if (!token) {
        console.log(`BLACKSMITH | MOVEMENT | Skipping token - doesn't exist`);
        moveNextTokenInLine(sortedFollowers, index + 1, spacing);
        return;
    }

    // Get the target position based on marching order and spacing
    const adjustedPosition = state.marchPosition + (state.marchPosition * spacing);
    const targetPosition = leaderMovementPath[adjustedPosition];

    if (!targetPosition) {
        console.log(`BLACKSMITH | MOVEMENT | No path point for position ${adjustedPosition}`);
        moveNextTokenInLine(sortedFollowers, index + 1, spacing);
        return;
    }

    const currentPos = getGridPositionKey(token.x, token.y);
    if (currentPos === targetPosition.gridPos) {
        console.log(`BLACKSMITH | MOVEMENT | ${token.name} already at position ${adjustedPosition}`);
        moveNextTokenInLine(sortedFollowers, index + 1, spacing);
        return;
    }

    // Store original position in our map before moving
    tokenOriginalPositions.set(token.id, { x: token.x, y: token.y });
    
    // Debug info
    console.log(`BLACKSMITH | MOVEMENT | Moving ${token.name} to position ${adjustedPosition}: ${targetPosition.x},${targetPosition.y}`);
    
    // Move the token - add flag to indicate this is an automated movement
    token.document.update({
        x: targetPosition.x,
        y: targetPosition.y,
        flags: {
            [MODULE_ID]: {
                congaMovement: true
            }
        }
    }).then(() => {
        // Move to next token
        moveNextTokenInLine(sortedFollowers, index + 1, spacing);
    }).catch(err => {
        console.error(`BLACKSMITH | MOVEMENT | Error moving token ${token.name}:`, err);
        moveNextTokenInLine(sortedFollowers, index + 1, spacing);
    });
}

// Process conga movement - tokens follow leader's exact path
function processCongaMovement(sortedFollowers) {
    // Safety check - if no path points, exit
    if (leaderMovementPath.length < 2) {
        console.log('BLACKSMITH | MOVEMENT | Not enough path points for conga movement');
        return;
    }
    
    console.log("BLACKSMITH | MOVEMENT | Leader path length:", leaderMovementPath.length);
    console.log("BLACKSMITH | MOVEMENT | Full path array:", leaderMovementPath);
    
    // Set processing flag
    processingCongaMovement = true;
    
    // Get the leader token
    const leaderToken = canvas.tokens.get(currentLeaderTokenId);
    if (!leaderToken) {
        console.log('BLACKSMITH | MOVEMENT | Leader token not found, aborting conga movement');
        processingCongaMovement = false;
        return;
    }

    // Store all followers' current positions and their target indices
    const followerStates = sortedFollowers.map(([tokenId, state]) => {
        const token = canvas.tokens.get(tokenId);
        if (!token) return null;
        
        // Find where in the path the token currently is
        const currentPos = { x: token.x, y: token.y };
        let currentIndex = leaderMovementPath.length - 1;
        let isOnPath = false;
        
        // Find the closest point in the path to the token's current position
        for (let i = 0; i < leaderMovementPath.length; i++) {
            const pathPoint = leaderMovementPath[i];
            if (Math.abs(pathPoint.x - currentPos.x) < 1 && Math.abs(pathPoint.y - currentPos.y) < 1) {
                currentIndex = i;
                isOnPath = true;
                console.log(`BLACKSMITH | MOVEMENT | ${token.name} starting at path index ${currentIndex}`);
                break;
            }
        }
        
        return {
            token,
            currentIndex,
            targetIndex: state.marchPosition,
            state,
            isOnPath
        };
    }).filter(f => f !== null);

    // Move all tokens one step at a time
    function moveAllTokensOneStep() {
        // Check if all tokens have reached their targets
        const allDone = followerStates.every(f => f.currentIndex <= f.targetIndex);
        if (allDone) {
            console.log('BLACKSMITH | MOVEMENT | All tokens have reached their targets');
            
            // Find the highest index any token is at (excluding completed tokens)
            const highestIndex = Math.max(...followerStates.map(f => f.targetIndex));
            console.log('BLACKSMITH | MOVEMENT | Trimming path - highest token index:', highestIndex);
            
            // Trim the path to remove points past the last token
            if (highestIndex < leaderMovementPath.length - 1) {
                leaderMovementPath = leaderMovementPath.slice(0, highestIndex + 1);
                console.log('BLACKSMITH | MOVEMENT | Path trimmed to length:', leaderMovementPath.length);
            }
            
            processingCongaMovement = false;
            return;
        }

        // Check if this is first-turn movement (any tokens not on path)
        const isFirstTurn = followerStates.some(f => !f.isOnPath);
        
        // Move each token that hasn't reached its target yet
        const promises = followerStates.map((follower, index) => {
            // Skip if token has reached its target
            if (follower.currentIndex <= follower.targetIndex) {
                return Promise.resolve();
            }

            // For first turn, only move if previous tokens are on path
            if (isFirstTurn) {
                const previousTokensOnPath = followerStates
                    .slice(0, index)
                    .every(f => f.isOnPath || f.currentIndex <= f.targetIndex);
                
                if (!previousTokensOnPath) {
                    console.log(`BLACKSMITH | MOVEMENT | ${follower.token.name} waiting for previous tokens`);
                    return Promise.resolve();
                }
            }

            const position = leaderMovementPath[follower.currentIndex - 1];
            console.log(`BLACKSMITH | MOVEMENT | ${follower.token.name} moving to index ${follower.currentIndex - 1}`);

            return follower.token.document.update({
                x: position.x,
                y: position.y,
                flags: {
                    [MODULE_ID]: {
                        congaMovement: true
                    }
                }
            }).then(() => {
                follower.currentIndex--;
                // Mark token as on path after first movement
                if (!follower.isOnPath && follower.currentIndex < leaderMovementPath.length - 1) {
                    follower.isOnPath = true;
                }
            });
        });

        // After all tokens have moved one step, wait then move again
        Promise.all(promises).then(() => {
            setTimeout(() => {
                moveAllTokensOneStep();
            }, 100);
        });
    }

    // Start the movement
    moveAllTokensOneStep();
}

// Calculate the marching order based on proximity to a leader token
function calculateMarchingOrder(leaderToken) {
    // Reset marching order
    tokenFollowers.clear();
    
    // Find all player-owned tokens except the leader
    const followerTokens = canvas.tokens.placeables.filter(t => 
        t.id !== leaderToken.id && 
        t.actor && 
        t.actor.hasPlayerOwner
    );
    
    // Sort by distance to leader (closest first)
    followerTokens.sort((a, b) => {
        const distA = Math.hypot(a.x - leaderToken.x, a.y - leaderToken.y);
        const distB = Math.hypot(b.x - leaderToken.x, b.y - leaderToken.y);
        return distA - distB;
    });
    
    // Set marching order
    followerTokens.forEach((followerToken, index) => {
        tokenFollowers.set(followerToken.id, {
            marchPosition: index + 1,
            moving: false
        });
        console.log(`BLACKSMITH | MOVEMENT | Set ${followerToken.name} to initial position ${index + 1}`);
    });
}

// Function to prepend new points to the path array
function prependToPath(newPoints) {
    leaderMovementPath.unshift(...newPoints);
}

// Function to trim old points from the path that are no longer needed
function trimPathPoints() {
    // Find the highest march position that has been reached
    const maxReachedPosition = Math.max(...Array.from(tokenFollowers.values())
        .map(f => f.currentPathIndex || 0));
    
    // If we have a valid position, trim the path
    if (maxReachedPosition > 0) {
        leaderMovementPath = leaderMovementPath.slice(0, maxReachedPosition + 1);
    }
}

// Add hooks for combat automation
Hooks.on('createCombat', async (combat) => {
    try {
        if (!game.user.isGM) return;
        
        // Store current movement mode
        preCombatMovementMode = game.settings.get(MODULE_ID, 'movementType');
        console.log(`BLACKSMITH | MOVEMENT | Combat started. Storing previous mode: ${preCombatMovementMode}`);
        
        // Get the previous mode's name
        const prevModeType = MovementConfig.prototype.getData().MovementTypes.find(t => t.id === preCombatMovementMode);
        // Get the combat mode type
        const combatModeType = MovementConfig.prototype.getData().MovementTypes.find(t => t.id === 'combat-movement');
        
        // Switch to combat movement mode
        if (preCombatMovementMode !== 'combat-movement') {
            await game.settings.set(MODULE_ID, 'movementType', 'combat-movement');
            
            // For combat start
            const combatTemplateData = {
                isPublic: true,
                isMovementChange: true,
                movementIcon: 'fa-swords',
                movementLabel: 'Combat',
                movementDescription: `When combat ends <strong>${prevModeType.name} Mode</strong> will be restored.<br><br>${combatModeType.description}`
            };

            const combatContent = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-cards.hbs', combatTemplateData);

            ChatMessage.create({
                content: combatContent,
                type: CONST.CHAT_MESSAGE_TYPES.OTHER
            });
            
            // Update UI
            const movementIcon = document.querySelector('.movement-icon');
            const movementLabel = document.querySelector('.movement-label');
            
            if (movementIcon) movementIcon.className = 'fas fa-swords movement-icon';
            if (movementLabel) movementLabel.textContent = 'Combat';
            
            // Notify other clients
            game.socket.emit(`module.${MODULE_ID}`, {
                type: 'movementChange',
                data: {
                    movementId: 'combat-movement',
                    name: 'Combat'
                }
            });
        }
    } catch (err) {
        console.error('BLACKSMITH | MOVEMENT | Error in combat start handling:', err);
    }
});

Hooks.on('deleteCombat', async (combat) => {
    try {
        if (!game.user.isGM) return;
        if (!preCombatMovementMode) return;
        
        console.log(`BLACKSMITH | MOVEMENT | Combat ended. Restoring previous mode: ${preCombatMovementMode}`);
        
        // Get the movement type info
        const movementType = MovementConfig.prototype.getData().MovementTypes.find(t => t.id === preCombatMovementMode);
        if (!movementType) return;
        
        // Restore previous movement mode
        await game.settings.set(MODULE_ID, 'movementType', preCombatMovementMode);
        
        // For combat end
        const endCombatTemplateData = {
            isPublic: true,
            isMovementChange: true,
            movementIcon: movementType.icon,
            movementLabel: movementType.name,
            movementDescription: `${movementType.name} Mode restored.<br><br>${movementType.description}`
        };

        const endCombatContent = await renderTemplate('modules/coffee-pub-blacksmith/templates/chat-cards.hbs', endCombatTemplateData);

        ChatMessage.create({
            content: endCombatContent,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });
        
        // Update UI
        const movementIcon = document.querySelector('.movement-icon');
        const movementLabel = document.querySelector('.movement-label');
        
        if (movementIcon) movementIcon.className = `fas ${movementType.icon} movement-icon`;
        if (movementLabel) movementLabel.textContent = movementType.name;
        
        // Notify other clients
        game.socket.emit(`module.${MODULE_ID}`, {
            type: 'movementChange',
            data: {
                movementId: preCombatMovementMode,
                name: movementType.name
            }
        });
        
        // Clear the stored mode
        preCombatMovementMode = null;
    } catch (err) {
        console.error('BLACKSMITH | MOVEMENT | Error in combat end handling:', err);
    }
}); 

