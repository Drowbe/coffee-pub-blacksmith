// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';
import { ChatPanel } from "./chat-panel.js";

// Store the leader's movement path for conga line
const leaderMovementPath = [];
// Track tokens following paths with their current position in the path
const tokenFollowers = new Map(); // token.id -> {marchPosition, pathIndex, moving, etc}
// Track which grid positions are currently occupied
const occupiedGridPositions = new Set(); // "x,y" strings
// Track the current leader token ID to ensure we never move it
let currentLeaderTokenId = null;

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
                    'normal-movement': { icon: 'fa-person-running', name: 'Normal Movement' },
                    'no-movement': { icon: 'fa-person-circle-xmark', name: 'No Movement' },
                    'combat-movement': { icon: 'fa-swords', name: 'Combat Movement' },
                    'conga-movement': { icon: 'fa-people-line', name: 'Conga Line' }
                };
                
                const newType = movementTypes[message.data.movementId];
                if (newType) {
                    if (movementIcon) {
                        movementIcon.className = `fas ${newType.icon} movement-icon`;
                        console.log('Movement icon updated:', newType.icon);
                    }
                    if (movementLabel) {
                        movementLabel.textContent = newType.name;
                        console.log('Movement label updated:', newType.name);
                    }
                }
            }, 100); // Short delay to ensure DOM is updated
        }
    });

    // Register setting if not already registered
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

        return {
            MovementTypes: [
                {
                    id: 'normal-movement',
                    name: 'Normal Movement',
                    description: 'Players can move their tokens on the canvas at will',
                    icon: 'fa-person-running',
                },
                {
                    id: 'no-movement',
                    name: 'No Movement',
                    description: 'Players can not move tokens at all on the canvas.',
                    icon: 'fa-person-circle-xmark'
                },
                {
                    id: 'combat-movement',
                    name: 'Combat Movement',
                    description: 'Players can only move their tokens during their turn in combat.',
                    icon: 'fa-swords'
                },
                {
                    id: 'conga-movement',
                    name: 'Conga Line',
                    description: 'Only the party leader can move freely. Other player tokens will follow the exact path taken by the leader.',
                    icon: 'fa-people-line'
                }
            ].filter(type => !type.gmOnly || isGM) // Filter out GM-only options for non-GMs
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Add click handler for movement types
        html.find('.movement-type').click(async (event) => {
            const movementId = event.currentTarget.dataset.movementId;
            await this._handleMovementChange(movementId);
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
        if (movementId === 'conga-movement') {
            const leader = checkPartyLeader();
            if (!leader) {
                ui.notifications.warn("No party leader set for Conga Line. Please set a party leader in the leader panel (crown icon).");
            } else {
                // Send notification to all players about conga mode and leader
                ChatMessage.create({
                    content: `<strong>Movement mode changed to Conga Line!</strong><br>Follow the party leader: <strong>${leader.name}</strong>`,
                    type: CONST.CHAT_MESSAGE_TYPES.OTHER
                });
            }
        } else {
            // For other movement types, just send notification to everyone
            ChatMessage.create({
                content: `<strong>Movement mode changed to ${movementType.name}</strong>`,
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

// Hook for after a token is updated - used to trigger conga line
Hooks.on('updateToken', (tokenDocument, changes, options, userId) => {
    if (!changes.x && !changes.y) return;
    
    // Only process for GMs to avoid duplicate processing
    if (!game.user.isGM) return;
    
    try {
        const currentMovement = game.settings.get(MODULE_ID, 'movementType');
        if (currentMovement !== 'conga-movement') return;
        
        // Check if this is a token moved by the party leader
        const partyLeaderUserId = game.settings.get(MODULE_ID, 'partyLeader');
        
        // Get the token placeable from the document
        const token = canvas.tokens.get(tokenDocument.id);
        if (!token) {
            console.log('Could not find token placeable, skipping');
            return;
        }
        
        // Only process if this token was moved by the party leader
        // OR if it was moved by GM (to allow reordering)
        const movedByLeader = userId === partyLeaderUserId;
        const movedByGM = game.users.get(userId)?.isGM;
        
        if (!movedByLeader && !movedByGM) {
            console.log('Token not moved by party leader or GM, skipping conga line');
            return;
        }
        
        // If token was moved by leader, add to path and update current leader token
        if (movedByLeader) {
            console.log('Party leader moved a token. Recording path.');
            
            // Set this as the current leader token
            console.log(`Setting current leader token to ${token.name} (${token.id})`);
            currentLeaderTokenId = token.id;
            
            // Get grid-aligned position
            const gridPos = getGridPositionKey(tokenDocument.x, tokenDocument.y);
            
            // Don't add duplicate positions
            if (leaderMovementPath.length > 0) {
                const lastPosition = leaderMovementPath[leaderMovementPath.length - 1];
                if (gridPos === lastPosition.gridPos) return;
            }
            
            // Record the leader's new position
            leaderMovementPath.push({
                x: tokenDocument.x,
                y: tokenDocument.y,
                gridPos: gridPos,
                timestamp: Date.now()
            });
            
            // Keep path at a reasonable length
            if (leaderMovementPath.length > 200) {
                leaderMovementPath.shift();
            }
            
            // Update occupied positions
            occupiedGridPositions.clear();
            occupiedGridPositions.add(gridPos);
        }
        
        // Determine marching order - only if token was moved by GM or if this is first leader move
        if (movedByGM || (movedByLeader && tokenFollowers.size === 0)) {
            determineMarchingOrder(token);
        }
        
        // Process follower movements in order
        processCongaLineMovement();
    } catch (err) {
        console.error('Blacksmith | Error processing conga line movement:', err);
    }
});

// Determine marching order based on proximity to leader
function determineMarchingOrder(leaderToken) {
    console.log('Determining marching order');
    
    // Get all character tokens except the leader
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
    
    console.log('Marching order:', followerTokens.map(t => t.name));
    
    // Assign marching positions
    followerTokens.forEach((followerToken, index) => {
        const marchPosition = index + 1; // 1-based position (leader is 0)
        
        // Create or update follower state
        if (!tokenFollowers.has(followerToken.id)) {
            console.log(`Setting up follower ${followerToken.name} at march position ${marchPosition}`);
            tokenFollowers.set(followerToken.id, {
                marchPosition: marchPosition,
                pathIndex: 0, // Start at beginning of path
                moving: false,
                lastMoveTime: 0
            });
        } else {
            // Update march position only
            const state = tokenFollowers.get(followerToken.id);
            console.log(`Updating ${followerToken.name} march position from ${state.marchPosition} to ${marchPosition}`);
            state.marchPosition = marchPosition;
        }
        
        // Mark current position as occupied
        const gridPos = getGridPositionKey(followerToken.x, followerToken.y);
        occupiedGridPositions.add(gridPos);
    });
}

// Process the conga line movement in order
function processCongaLineMovement() {
    if (leaderMovementPath.length === 0) return;
    
    console.log('Processing conga line movement');
    
    // Get all followers sorted by marching order
    const followers = Array.from(tokenFollowers.entries())
        .sort((a, b) => a[1].marchPosition - b[1].marchPosition);
    
    // Process each follower in order (front to back)
    followers.forEach(([tokenId, state]) => {
        const token = canvas.tokens.get(tokenId);
        if (!token) {
            console.log(`Token ${tokenId} not found, removing from followers`);
            tokenFollowers.delete(tokenId);
            return;
        }
        
        // Schedule update if not already moving
        if (!state.moving) {
            scheduleFollowerUpdate(token);
        }
    });
}

// Schedule a token to update its position
function scheduleFollowerUpdate(token) {
    const state = tokenFollowers.get(token.id);
    if (!state || state.moving) return;

    // Safety check - NEVER move the leader token
    if (token.id === currentLeaderTokenId) {
        console.log(`Token ${token.name} is the active leader token, skipping movement`);
        return;
    }
    
    // Mark as moving to prevent multiple updates
    state.moving = true;
    state.lastMoveTime = Date.now();
    
    // Calculate target position based on marching order
    const targetPos = calculateTargetPosition(token);
    if (!targetPos) {
        // No valid target position yet
        state.moving = false;
        return;
    }
    
    console.log(`Moving ${token.name} to position ${targetPos.x},${targetPos.y} (path index ${state.pathIndex})`);
    
    // Check if the destination position is already occupied
    const destGridPos = getGridPositionKey(targetPos.x, targetPos.y);
    if (occupiedGridPositions.has(destGridPos)) {
        console.log(`Destination ${destGridPos} is occupied, waiting...`);
        state.moving = false;
        return;
    }
    
    // Reserve this position
    const currentGridPos = getGridPositionKey(token.x, token.y);
    occupiedGridPositions.delete(currentGridPos);
    occupiedGridPositions.add(destGridPos);
    
    // One final safety check just in case
    if (token.id === currentLeaderTokenId) {
        console.log(`ABORT: Token ${token.name} is the leader token, aborting movement`);
        occupiedGridPositions.delete(destGridPos);
        occupiedGridPositions.add(currentGridPos);
        state.moving = false;
        return;
    }
    
    // Move the token
    token.document.update({
        x: targetPos.x,
        y: targetPos.y
    }).then(() => {
        // Update state and schedule next movement
        state.pathIndex++;
        state.moving = false;
        
        // Schedule next update for this token
        setTimeout(() => {
            scheduleFollowerUpdate(token);
        }, 100);
        
        // Also trigger updates for tokens behind this one
        setTimeout(() => {
            processCongaLineMovement();
        }, 150);
    }).catch(err => {
        console.error(`Error moving token ${token.name}:`, err);
        state.moving = false;
        
        // Remove reservation on failure
        occupiedGridPositions.delete(destGridPos);
        occupiedGridPositions.add(currentGridPos);
    });
}

// Calculate target position for a token based on its marching order
function calculateTargetPosition(token) {
    const state = tokenFollowers.get(token.id);
    if (!state) return null;
    
    // We want to position each follower at a point on the leader's path
    // based on their marching order (higher = further back in path)
    
    // Calculate target index in the path
    // Leader is at the newest position (path.length - 1)
    // First follower should be one behind (path.length - 2)
    // and so on
    const targetIndex = Math.max(0, leaderMovementPath.length - 1 - state.marchPosition);
    
    // If we haven't reached our target index yet, keep moving forward
    if (state.pathIndex < targetIndex) {
        return leaderMovementPath[state.pathIndex];
    }
    
    // Otherwise, we're at the right relative position
    if (state.pathIndex < leaderMovementPath.length) {
        return leaderMovementPath[state.pathIndex];
    }
    
    return null;
} 