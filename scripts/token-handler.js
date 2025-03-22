// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 
import { postConsoleAndNotification } from './global.js';

// ================================================================== 
// ===== TOKEN HANDLER CLASS =========================================
// ================================================================== 
export class TokenHandler {
    static async updateSkillCheckFromToken(id, token) {
        if (!token) return;
        
        // Get form elements
        const typeSelect = document.querySelector(`#optionType-${id}`);
        const nameInput = document.querySelector(`#inputContextName-${id}`);
        const detailsInput = document.querySelector(`#inputContextDetails-${id}`);
        const skillCheck = document.querySelector(`#blnSkillRoll-${id}`);
        const skillSelect = document.querySelector(`#optionSkill-${id}`);
        const diceSelect = document.querySelector(`#optionDiceType-${id}`);
        
        if (!typeSelect || !nameInput || !detailsInput || !skillCheck || !skillSelect || !diceSelect) {
            postConsoleAndNotification("Missing form elements for skill check update", "", false, true, false);
            return;
        }
        
        // Get actor data
        const actor = token.actor;
        if (!actor) return;
        
        // Check actor type
        const isMonster = actor.type === 'npc' && token.document.disposition < 0;
        const isCharacter = actor.type === 'character' || (actor.type === 'npc' && token.document.disposition >= 0);
        
        // Update form based on actor type
        if (isMonster) {
            typeSelect.value = 'monster';
            skillSelect.value = 'Nature';
        } else if (isCharacter) {
            typeSelect.value = 'character';
            skillSelect.value = 'History';
        }
        
        // Common updates
        nameInput.value = actor.name;
        detailsInput.value = `Actor Type: ${actor.type}\nToken Name: ${token.name}`;
        skillCheck.checked = true;
        diceSelect.value = '1d20';
        
        postConsoleAndNotification("Updated skill check form for token:", token.name, false, true, false);
    }

    static registerTokenHooks(workspaceId) {
        Hooks.on('controlToken', (token, controlled) => {
            if (controlled && workspaceId === 'assistant') {
                postConsoleAndNotification("Token controlled, updating skill check form", "", false, true, false);
                this.updateSkillCheckFromToken(workspaceId, token);
            }
        });
    }
} 