// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { MODULE_TITLE, MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';
import { ChatPanel } from "./chat-panel.js";

// Store the leader's movement path for conga line
const leaderMovementPath = [];
// Track tokens following paths with their current position in the path
const tokenFollowers = new Map(); // token.id -> {pathIndex: number, moving: boolean}

// Make sure settings are registered right away
Hooks.once('init', () => {
    // Register socket listeners for movement changes
    game.socket.on(`module.${MODULE_ID}`, (message) => {
        if (message.type === 'movementChange' && !game.user.isGM) {
            ui.notifications.info(`Movement type changed to: ${message.data.name}`);
            
            // Update chat panel for players
            const chatPanel = document.querySelector('.coffee-pub-blacksmith.chat-panel');
            if (chatPanel) {
                const movementIcon = chatPanel.querySelector('.movement-icon');
                const movementLabel = chatPanel.querySelector('.movement-label');
                
                const movementTypes = {
                    'normal-movement': { icon: 'fa-person-walking', name: 'Normal' },
                    'no-movement': { icon: 'fa-person-circle-xmark', name: 'None' },
                    'combat-movement': { icon: 'fa-swords', name: 'Combat' },
                    'conga-movement': { icon: 'fa-people-pulling', name: 'Conga' }
                };
                
                const newType = movementTypes[message.data.movementId];
                if (newType) {
                    if (movementIcon) movementIcon.className = `fas ${newType.icon} movement-icon`;
                    if (movementLabel) movementLabel.textContent = newType.name;
                }
            }
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
                    icon: 'fa-people-pulling'
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
                ui.notifications.info(`Conga Line initiated! ${leader.name} is the party leader.`);
            }
        }

        // Force refresh of the chat panel
        ui.chat.render();

        // Update chat panel locally immediately for GM
        const movementIcon = document.querySelector('.movement-icon');
        const movementLabel = document.querySelector('.movement-label');
        
        if (movementIcon) movementIcon.className = `fas ${movementType.icon} movement-icon`;
        if (movementLabel) movementLabel.textContent = movementType.name;

        // Notify all users
        game.socket.emit(`module.${MODULE_ID}`, {
            type: 'movementChange',
            data: {
                movementId,
                name: movementType.name
            }
        });

        // Post notification for GM
        ui.notifications.info(`Movement type changed to: ${movementType.name}`);

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
        
        // Only process if this token was moved by the party leader
        if (userId !== partyLeaderUserId) {
            console.log('Token not moved by party leader, skipping conga line');
            return;
        }
        
        console.log('Party leader moved a token. Recording path.');
        
        // Get the token placeable from the document
        const token = canvas.tokens.get(tokenDocument.id);
        if (!token) {
            console.log('Could not find token placeable, skipping');
            return;
        }
        
        // Get the grid size for proper spacing
        const gridSize = canvas.grid.size;
        
        // Record the leader's new position
        // Ensure we're snapping to grid coordinates
        const newPos = {
            x: Math.round(tokenDocument.x / gridSize) * gridSize,
            y: Math.round(tokenDocument.y / gridSize) * gridSize,
            timestamp: Date.now()
        };
        
        // Check if this is a new grid position
        const lastPos = leaderMovementPath.length > 0 ? leaderMovementPath[leaderMovementPath.length - 1] : null;
        if (lastPos && lastPos.x === newPos.x && lastPos.y === newPos.y) {
            // Same grid position, don't record duplicate
            console.log('Duplicate position, not recording');
            return;
        }
        
        // Add to the path
        leaderMovementPath.push(newPos);
        console.log('Added new position to path:', newPos, 'Total path points:', leaderMovementPath.length);
        
        // Keep path at a reasonable length
        if (leaderMovementPath.length > 500) {
            leaderMovementPath.shift();
        }
        
        // Get all character tokens except the leader's current token
        const followerTokens = canvas.tokens.placeables.filter(t => 
            t.id !== token.id && 
            t.actor && 
            t.actor.hasPlayerOwner
        );
        
        console.log('Found follower tokens:', followerTokens.length);
        
        // Sort by distance to leader (closest first)
        followerTokens.sort((a, b) => {
            const distA = Math.hypot(a.x - tokenDocument.x, a.y - tokenDocument.y);
            const distB = Math.hypot(b.x - tokenDocument.x, b.y - tokenDocument.y);
            return distA - distB;
        });
        
        // Process followers - add new ones or update existing ones
        followerTokens.forEach((followerToken, index) => {
            if (!tokenFollowers.has(followerToken.id)) {
                // New follower - set up initial state
                console.log('Setting up new follower:', followerToken.name);
                
                // The position in line determines how many grid spaces behind they are
                const positionInLine = index + 1;
                
                // Calculate target index for this follower (leader's position - follower's position)
                const targetPathIndex = Math.max(0, leaderMovementPath.length - 1 - positionInLine);
                
                // If we're just starting, set followers slightly behind each other
                const startPathIndex = Math.max(0, targetPathIndex - 3);
                
                tokenFollowers.set(followerToken.id, {
                    positionInLine: positionInLine,
                    pathIndex: startPathIndex,
                    targetPathIndex: targetPathIndex,
                    moving: false,
                    lastMoveTime: 0
                });
                
                console.log(`Set up follower ${followerToken.name} at position ${positionInLine}, starting at index ${startPathIndex}, target ${targetPathIndex}`);
            } else {
                // Existing follower - update position in line
                const followerState = tokenFollowers.get(followerToken.id);
                followerState.positionInLine = index + 1;
                
                // Reset stuck followers
                if (followerState.moving === true && Date.now() - followerState.lastMoveTime > 5000) {
                    console.log('Resetting stuck follower:', followerToken.name);
                    followerState.moving = false;
                }
                
                console.log(`Updated follower ${followerToken.name}: position=${followerState.positionInLine}`);
            }
        });
        
        // After processing all followers, update their movements
        setTimeout(() => {
            updateAllFollowers();
        }, 100);
        
    } catch (err) {
        console.error('Blacksmith | Error processing conga line movement:', err);
    }
});

// Function to update all followers' positions
function updateAllFollowers() {
    console.log('Updating all followers');
    
    // Get tokens in proper order
    const tokenIds = Array.from(tokenFollowers.keys());
    const tokens = tokenIds
        .map(id => canvas.tokens.get(id))
        .filter(t => t != null);
    
    if (tokens.length === 0) {
        console.log('No follower tokens found');
        return;
    }
    
    console.log(`Found ${tokens.length} follower tokens`);
    
    // Sort by position in line
    tokens.sort((a, b) => {
        const posA = tokenFollowers.get(a.id).positionInLine;
        const posB = tokenFollowers.get(b.id).positionInLine;
        return posA - posB;
    });
    
    // Set target path index for each token based on position
    tokens.forEach((token, idx) => {
        const followerState = tokenFollowers.get(token.id);
        // Calculate each token's target position in the path
        // First follower is 1 step behind leader, second is 2 steps behind, etc.
        const targetIndex = Math.max(0, leaderMovementPath.length - 1 - (idx + 1));
        followerState.targetPathIndex = targetIndex;
        
        console.log(`Token ${token.name}: Position=${idx+1}, Currently at=${followerState.pathIndex}, Target=${targetIndex}`);
    });
    
    // Process followers from front to back
    tokens.forEach(token => {
        moveFollowerToNextPosition(token);
    });
}

// Function to move a follower to its next position
function moveFollowerToNextPosition(token) {
    const followerState = tokenFollowers.get(token.id);
    if (!followerState) {
        console.log(`No follower state for token ${token.name}`);
        return;
    }
    
    if (followerState.moving) {
        console.log(`Token ${token.name} is already moving`);
        return;
    }
    
    console.log(`Checking movement for ${token.name}: pathIndex=${followerState.pathIndex}, targetIndex=${followerState.targetPathIndex}`);
    
    // If we've reached our target position, no need to move further
    if (followerState.pathIndex >= followerState.targetPathIndex) {
        console.log(`Token ${token.name} has reached its target position`);
        return;
    }
    
    // Get the next position to move to
    const nextPos = leaderMovementPath[followerState.pathIndex];
    if (!nextPos) {
        console.log(`No position found for ${token.name} at index ${followerState.pathIndex}`);
        return;
    }
    
    console.log(`Moving ${token.name} to position:`, nextPos);
    
    // Start moving
    followerState.moving = true;
    followerState.lastMoveTime = Date.now();
    
    // Move the token to the next position
    token.document.update({
        x: nextPos.x,
        y: nextPos.y
    }).then(() => {
        // Update follower state
        followerState.pathIndex++;
        followerState.moving = false;
        console.log(`${token.name} moved to index ${followerState.pathIndex-1}. Next index: ${followerState.pathIndex}`);
        
        // Schedule the next movement, with faster catch-up if we're far behind
        const distanceFromTarget = followerState.targetPathIndex - followerState.pathIndex;
        // Speed up if we're far behind
        const speedFactor = Math.max(1, Math.min(5, distanceFromTarget));
        // Base delay is shorter for tokens that need to catch up
        const delay = Math.max(50, 250 / speedFactor);
        
        setTimeout(() => {
            moveFollowerToNextPosition(token);
        }, delay);
    }).catch(err => {
        console.error(`Error moving token ${token.name}:`, err);
        followerState.moving = false;
    });
} 