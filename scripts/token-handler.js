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
        const isCharacter = actor.type === 'character';
        const isNPC = actor.type === 'npc' && token.document.disposition >= 0;
        
        // Update form based on actor type
        if (isMonster) {
            typeSelect.value = 'monster';
            skillSelect.value = 'Nature';
        } else if (isCharacter) {
            typeSelect.value = 'character';
            skillSelect.value = 'History';
        } else if (isNPC) {
            typeSelect.value = 'npc';
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
        const background = actor.system.details.background || 'Unknown';
        const size = actor.system.traits?.size || 'Unknown';
        
        // Get movement speeds
        const movement = actor.system.attributes?.movement || {};
        const speeds = [];
        if (movement.walk) speeds.push(`Walk: ${movement.walk} ${movement.units}`);
        if (movement.burrow) speeds.push(`Burrow: ${movement.burrow} ${movement.units}`);
        if (movement.climb) speeds.push(`Climb: ${movement.climb} ${movement.units}`);
        if (movement.fly) speeds.push(`Fly: ${movement.fly} ${movement.units}${movement.hover ? ' (hover)' : ''}`);
        if (movement.swim) speeds.push(`Swim: ${movement.swim} ${movement.units}`);
        
        // Build details string
        const details = [
            `Actor Type: ${isMonster ? 'monster' : (isCharacter ? 'character' : 'npc')}`,
            `Token Name: ${token.name}`,
            `Gender: ${actor.system.details?.gender || 'Unknown'}`,
            `Age: ${actor.system.details?.age || 'Unknown'}`,
            `Alignment: ${actor.system.details?.alignment || 'Unknown'}`,
            `Background: ${actor.system.details?.background || 'Unknown'}`,
            `Size: ${size}`,
            raceAndClass,
            levelOrCR,
            `HP: ${hp}`,
            
            // Movement
            speeds.length > 0 ? 'Movement:' : '',
            ...speeds.map(speed => `  - ${speed}`),
            
            // Ability Scores
            'Ability Scores:',
            ...Object.entries(actor.system.abilities || {}).map(([key, ability]) => 
                `  - ${CONFIG.DND5E.abilities[key]?.label || key}: ${ability.value} (${ability.mod >= 0 ? '+' : ''}${ability.mod})`
            ),
            
            // Skills
            'Skills:',
            ...Object.entries(actor.system.skills || {})
                .filter(([_, skill]) => skill.value > 0)  // Only show skills with proficiency
                .map(([key, skill]) => {
                    const profValue = skill.value === 0.5 ? 'Half' : 
                                    skill.value === 1 ? 'Proficient' : 
                                    skill.value === 2 ? 'Expert' : '';
                    return `  - ${CONFIG.DND5E.skills[key]?.label || key}: ${profValue}`;
                }),
            
            // Senses
            'Senses:',
            ...Object.entries(actor.system.attributes?.senses || {})
                .filter(([key, value]) => value)
                .map(([key, value]) => `  - ${key}: ${value}`),
            
            // Languages
            actor.system.traits?.languages?.value?.length > 0 ? 
                `Languages:\n  - ${actor.system.traits.languages.value.map(l => CONFIG.DND5E.languages[l] || l).join('\n  - ')}` : '',
            
            // Resistances, Immunities, Vulnerabilities
            actor.system.traits?.dr?.value?.length > 0 ? 
                `Damage Resistances:\n  - ${actor.system.traits.dr.value.map(r => CONFIG.DND5E.damageTypes[r] || r).join('\n  - ')}` : '',
            actor.system.traits?.di?.value?.length > 0 ? 
                `Damage Immunities:\n  - ${actor.system.traits.di.value.map(i => CONFIG.DND5E.damageTypes[i] || i).join('\n  - ')}` : '',
            actor.system.traits?.dv?.value?.length > 0 ? 
                `Damage Vulnerabilities:\n  - ${actor.system.traits.dv.value.map(v => CONFIG.DND5E.damageTypes[v] || v).join('\n  - ')}` : '',
            
            // Proficiencies
            'Weapon Proficiencies:',
            ...Object.entries(actor.system.traits?.weaponProf || {})
                .filter(([_, prof]) => prof)
                .map(([key, _]) => `  - ${CONFIG.DND5E.weaponProficiencies[key] || key}`),
            
            'Armor Proficiencies:',
            ...Object.entries(actor.system.traits?.armorProf || {})
                .filter(([_, prof]) => prof)
                .map(([key, _]) => `  - ${CONFIG.DND5E.armorProficiencies[key] || key}`),
            
            // Equipped items
            equippedWeapons ? `Equipped Weapons:\n  - ${equippedWeapons.split(', ').join('\n  - ')}` : '',
            preparedSpells ? `Prepared Spells:\n  - ${preparedSpells.split(', ').join('\n  - ')}` : ''
        ].filter(Boolean).join('\n');
        
        // Common updates
        nameInput.value = actor.name;
        detailsInput.value = details;
        skillCheck.checked = true;
        diceSelect.value = '1d20';
        
        postConsoleAndNotification("Updated skill check form for token:", token.name, false, true, false);
    }

    static registerTokenHooks(workspaceId) {
        // Check for already selected token when initialized
        if (workspaceId === 'assistant') {
            const selectedToken = canvas.tokens?.controlled[0];
            if (selectedToken) {
                postConsoleAndNotification("Found selected token, updating skill check form", "", false, true, false);
                this.updateSkillCheckFromToken(workspaceId, selectedToken);
            }
        }

        // Register hook for future token selections
        Hooks.on('controlToken', (token, controlled) => {
            if (controlled && workspaceId === 'assistant') {
                postConsoleAndNotification("Token controlled, updating skill check form", "", false, true, false);
                this.updateSkillCheckFromToken(workspaceId, token);
            }
        });
    }
} 