// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';
import { ChatPanel } from "./chat-panel.js";

// Store the leader's movement path for conga line
const leaderMovementPath = [];
// Track tokens following paths with their current position in the path
const tokenFollowers = new Map(); // token.id -> {marchPosition, moving}
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
                    'conga-movement': { icon: 'fa-people-line', name: 'Conga' }
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
                    name: 'Normal',
                    description: 'Players can move their tokens on the canvas at will',
                    icon: 'fa-person-running',
                },
                {
                    id: 'no-movement',
                    name: 'None',
                    description: 'Players can not move tokens at all on the canvas.',
                    icon: 'fa-person-circle-xmark'
                },
                {
                    id: 'combat-movement',
                    name: 'Combat',
                    description: 'Players can only move their tokens during their turn in combat.',
                    icon: 'fa-swords'
                },
                {
                    id: 'conga-movement',
                    name: 'Conga',
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
                    
                    // Reset state for conga line
                    lastLeaderMoveTime = Date.now();
                    marchingOrderJustDetermined = false;
                    
                    // Force calculation of initial marching order
                    calculateMarchingOrder(leaderToken);
                    
                    // Get marching order as text for the chat message
                    let marchingOrderText = `<strong>Leader:</strong> ${leaderToken.name}<br>`;
                    
                    // Sort followers by march position
                    const sortedFollowers = Array.from(tokenFollowers.entries())
                        .sort((a, b) => a[1].marchPosition - b[1].marchPosition);
                    
                    // Add each follower to the text
                    sortedFollowers.forEach(([tokenId, state]) => {
                        const token = canvas.tokens.get(tokenId);
                        if (token) {
                            marchingOrderText += `<strong>Position ${state.marchPosition}:</strong> ${token.name}<br>`;
                        }
                    });
                    
                    // Send notification to all players about conga mode, leader, and marching order
                    ChatMessage.create({
                        content: `<strong>Movement mode changed to Conga Line!</strong><br>Follow the party leader: <strong>${leader.name}</strong><br><br><strong>Marching Order:</strong><br>${marchingOrderText}`,
                        type: CONST.CHAT_MESSAGE_TYPES.OTHER
                    });
                } else {
                    ui.notifications.warn("Could not find a leader token on the canvas. Make sure the party leader has at least one token placed.");
                }
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
        if (!token) return;
        
        // Only process if this token was moved by the party leader
        // OR if it was moved by GM (to allow reordering)
        const movedByLeader = userId === partyLeaderUserId;
        const movedByGM = game.users.get(userId)?.isGM;
        const isNotLeaderToken = token.id !== currentLeaderTokenId;
        
        if (!movedByLeader && !movedByGM) return;
        
        // If token was moved by leader, record the path
        if (movedByLeader) {
            console.log(`BLACKSMITH | MOVEMENT | Leader moved token: ${token.name}`);
            
            // Set this as the current leader token
            currentLeaderTokenId = token.id;
            
            // Get the position
            const position = {
                x: tokenDocument.x,
                y: tokenDocument.y,
                gridPos: getGridPositionKey(tokenDocument.x, tokenDocument.y)
            };
            
            // Don't add duplicate positions
            if (leaderMovementPath.length > 0) {
                const lastPosition = leaderMovementPath[leaderMovementPath.length - 1];
                if (position.gridPos === lastPosition.gridPos) return;
            }
            
            // Add to leader path
            leaderMovementPath.push(position);
            
            // Keep path at a reasonable length
            if (leaderMovementPath.length > 200) {
                leaderMovementPath.shift();
            }
            
            // Important fix: Always trigger follower movement when leader moves
            console.log(`BLACKSMITH | MOVEMENT | Leader moved - triggering follower movement. Path length: ${leaderMovementPath.length}`);
            // Schedule the follower movement on a slight delay to allow the leader position to update fully
            setTimeout(() => {
                if (!processingCongaMovement && leaderMovementPath.length >= 2) {
                    console.log('BLACKSMITH | MOVEMENT | Initiating conga line movement after leader moved');
                    processCongaLine();
                } else {
                    console.log('BLACKSMITH | MOVEMENT | Not enough path points or already processing movement');
                }
            }, 100);
            
            // CRITICAL: Never recalculate marching order after a leader move
            return;
        }
        
        // ONLY determine marching order if:
        // 1. Starting conga line (tokenFollowers is empty)
        // 2. GM manually moved a NON-LEADER token for reordering
        const isGMMoveOfFollower = movedByGM && !movedByLeader && isNotLeaderToken;
        const isFirstTimeSetup = tokenFollowers.size === 0;
        
        if ((isFirstTimeSetup || isGMMoveOfFollower) && !marchingOrderJustDetermined) {
            console.log('BLACKSMITH | MOVEMENT | Determining marching order - first setup or GM reordering');
            
            // Find all player-owned tokens except the leader
            const followerTokens = canvas.tokens.placeables.filter(t => 
                t.id !== currentLeaderTokenId && 
                t.actor && 
                t.actor.hasPlayerOwner
            );
            
            // Sort by distance to leader (closest first)
            followerTokens.sort((a, b) => {
                const leaderToken = canvas.tokens.get(currentLeaderTokenId);
                if (!leaderToken) return 0;
                
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
                console.log(`BLACKSMITH | MOVEMENT | Set ${followerToken.name} to position ${index + 1}`);
            });
            
            // Prevent multiple calculations
            marchingOrderJustDetermined = true;
            setTimeout(() => marchingOrderJustDetermined = false, 1000);
        }
    } catch (err) {
        console.error('BLACKSMITH | MOVEMENT | Error in conga movement:', err);
    }
});

// Process the conga line movement
function processCongaLine() {
    // Safety check - if already processing or no path points, exit
    if (processingCongaMovement) {
        console.log('BLACKSMITH | MOVEMENT | Already processing conga movement, skipping');
        return;
    }
    
    if (leaderMovementPath.length < 2) {
        console.log('BLACKSMITH | MOVEMENT | Not enough path points for conga movement');
        return;
    }
    
    processingCongaMovement = true;
    console.log('BLACKSMITH | MOVEMENT | Processing conga line movement');
    
    // Get the leader token
    const leaderToken = canvas.tokens.get(currentLeaderTokenId);
    if (!leaderToken) {
        console.log('BLACKSMITH | MOVEMENT | Leader token not found, aborting conga movement');
        processingCongaMovement = false;
        return;
    }
    
    // Sort tokens by march position
    const sortedFollowers = Array.from(tokenFollowers.entries())
        .filter(([tokenId]) => {
            // Filter out tokens that no longer exist
            const token = canvas.tokens.get(tokenId);
            return !!token;
        })
        .sort((a, b) => a[1].marchPosition - b[1].marchPosition);
    
    console.log(`BLACKSMITH | MOVEMENT | Moving ${sortedFollowers.length} followers in order`);
    
    // Debug follower info
    sortedFollowers.forEach(([tokenId, state]) => {
        const token = canvas.tokens.get(tokenId);
        console.log(`BLACKSMITH | MOVEMENT | Follower: ${token?.name}, Position: ${state.marchPosition}`);
    });
    
    // Move tokens one by one
    moveNextTokenInLine(sortedFollowers, 0);
}

// Move a token in the conga line
function moveNextTokenInLine(sortedFollowers, index) {
    // If we're done with all followers, finish
    if (index >= sortedFollowers.length) {
        processingCongaMovement = false;
        console.log('BLACKSMITH | MOVEMENT | Finished moving all followers');
        return;
    }
    
    const [tokenId, state] = sortedFollowers[index];
    const token = canvas.tokens.get(tokenId);
    
    // Skip if token doesn't exist or is already moving
    if (!token || state.moving) {
        console.log(`BLACKSMITH | MOVEMENT | Skipping token ${token?.name} - doesn't exist or is already moving`);
        moveNextTokenInLine(sortedFollowers, index + 1);
        return;
    }
    
    // Mark as moving
    state.moving = true;
    
    // Get leader token
    const leaderToken = canvas.tokens.get(currentLeaderTokenId);
    if (!leaderToken) {
        console.log('BLACKSMITH | MOVEMENT | Leader token not found during movement');
        state.moving = false;
        moveNextTokenInLine(sortedFollowers, index + 1);
        return;
    }

    // Calculate position directly behind leader based on marching order
    const gridSize = canvas.grid.size;
    let targetPosition;

    // For first follower, position directly behind leader based on leader's facing
    if (state.marchPosition === 1) {
        targetPosition = {
            x: leaderToken.x,
            y: leaderToken.y + gridSize,  // Default to positioning below if no clear direction
            gridPos: getGridPositionKey(leaderToken.x, leaderToken.y + gridSize)
        };

        // If leader has moved, use that to determine direction
        if (leaderMovementPath.length >= 2) {
            const lastPos = leaderMovementPath[leaderMovementPath.length - 1];
            const prevPos = leaderMovementPath[leaderMovementPath.length - 2];
            
            // Calculate direction vector
            const dx = lastPos.x - prevPos.x;
            const dy = lastPos.y - prevPos.y;
            
            // Position first follower opposite to leader's movement direction
            if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
                const normalizedDx = dx !== 0 ? -Math.sign(dx) * gridSize : 0;
                const normalizedDy = dy !== 0 ? -Math.sign(dy) * gridSize : 0;
                
                targetPosition = {
                    x: leaderToken.x + normalizedDx,
                    y: leaderToken.y + normalizedDy,
                    gridPos: getGridPositionKey(leaderToken.x + normalizedDx, leaderToken.y + normalizedDy)
                };
            }
        }
    } else {
        // For subsequent followers, position behind previous follower
        const previousFollower = sortedFollowers[index - 1];
        const prevToken = canvas.tokens.get(previousFollower[0]);
        
        if (prevToken) {
            targetPosition = {
                x: prevToken.x,
                y: prevToken.y + gridSize,  // Stack vertically by default
                gridPos: getGridPositionKey(prevToken.x, prevToken.y + gridSize)
            };
        }
    }

    if (!targetPosition) {
        console.log(`BLACKSMITH | MOVEMENT | No target position found for ${token.name}`);
        state.moving = false;
        moveNextTokenInLine(sortedFollowers, index + 1);
        return;
    }
    
    const currentPos = getGridPositionKey(token.x, token.y);
    if (currentPos === targetPosition.gridPos) {
        console.log(`BLACKSMITH | MOVEMENT | ${token.name} already at target position ${targetPosition.gridPos}, skipping`);
        state.moving = false;
        moveNextTokenInLine(sortedFollowers, index + 1);
        return;
    }
    
    // Move the token
    console.log(`BLACKSMITH | MOVEMENT | Moving ${token.name} to position ${targetPosition.x},${targetPosition.y} (position ${state.marchPosition} in line)`);
    token.document.update({
        x: targetPosition.x,
        y: targetPosition.y
    }).then(() => {
        state.moving = false;
        
        // Move next token immediately - no delay needed since we're stacking
        moveNextTokenInLine(sortedFollowers, index + 1);
    }).catch(err => {
        console.error(`BLACKSMITH | MOVEMENT | Error moving token ${token.name}:`, err);
        state.moving = false;
        moveNextTokenInLine(sortedFollowers, index + 1);
    });
}

// Calculate the marching order based on proximity to a leader token
function calculateMarchingOrder(leaderToken) {
    console.log('BLACKSMITH | MOVEMENT | Calculating initial marching order around leader token:', leaderToken.name);
    
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
    
    console.log('BLACKSMITH | MOVEMENT | Initial marching order:', followerTokens.map(t => t.name));
    
    // Set marching order
    followerTokens.forEach((followerToken, index) => {
        tokenFollowers.set(followerToken.id, {
            marchPosition: index + 1,
            moving: false
        });
        console.log(`BLACKSMITH | MOVEMENT | Set ${followerToken.name} to initial position ${index + 1}`);
    });
} 