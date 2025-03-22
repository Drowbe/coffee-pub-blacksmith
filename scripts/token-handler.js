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
        
        // Debug logging
        console.log('Full Token Object:', token);
        console.log('Full Actor Object:', actor);
        console.log('Actor System Data:', actor.system);
        console.log('Actor Details:', actor.system.details);
        console.log('Actor Classes:', actor.system._classes);
        
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
        
        // Get equipped weapons
        const equippedWeapons = actor.items
            .filter(item => item.type === 'weapon' && item.system.equipped)
            .map(item => item.name)
            .join(', ');
            
        // Get prepared spells
        const preparedSpells = actor.items
            .filter(item => item.type === 'spell' && item.system.preparation.prepared)
            .map(item => item.name)
            .join(', ');
            
        // Get level or CR
        const levelOrCR = isMonster ? 
            `CR: ${actor.system.details.cr}` : 
            `Level: ${actor.system.details.level}`;
            
        // Get race and class for characters
        const raceAndClass = isCharacter ? 
            `Race: ${actor.system.details.race || 'Unknown'}\nClass: ${
                actor.items.filter(i => i.type === "class")
                    .map(c => c.name)
                    .join(', ') || 'Unknown'
            }` : 
            '';
            
        // Get hit points
        const hp = `${actor.system.attributes.hp.value}/${actor.system.attributes.hp.max}`;
        
        // Get proficiencies - using the correct path for D&D5E
        const proficiencies = Object.entries(actor.system.skills || {})
            .filter(([_, skill]) => skill.proficient)
            .map(([_, skill]) => {
                // Get the skill name from the CONFIG
                const skillName = CONFIG.DND5E.skills[skill.name]?.label || skill.name;
                return skillName;
            })
            .filter(Boolean)
            .join(', ');
            
        // Get immunities and resistances
        const immunities = actor.system.traits.di?.value || [];
        const resistances = actor.system.traits.dr?.value || [];
        const vulnerabilities = actor.system.traits.dv?.value || [];
        
        // Get additional details
        const gender = actor.system.details.gender || 'Unknown';
        const age = actor.system.details.age || 'Unknown';
        const alignment = actor.system.details.alignment || 'Unknown';
        
        // Build details string
        const details = [
            `Actor Type: ${actor.type}`,
            `Token Name: ${token.name}`,
            `Gender: ${gender}`,
            `Age: ${age}`,
            `Alignment: ${alignment}`,
            raceAndClass,
            levelOrCR,
            `HP: ${hp}`,
            equippedWeapons ? `Equipped Weapons: ${equippedWeapons}` : '',
            preparedSpells ? `Prepared Spells: ${preparedSpells}` : '',
            proficiencies ? `Proficiencies: ${proficiencies}` : '',
            immunities.length > 0 ? `Immunities: ${immunities.join(', ')}` : '',
            resistances.length > 0 ? `Resistances: ${resistances.join(', ')}` : '',
            vulnerabilities.length > 0 ? `Vulnerabilities: ${vulnerabilities.join(', ')}` : ''
        ].filter(Boolean).join('\n');
        
        // Common updates
        nameInput.value = actor.name;
        detailsInput.value = details;
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