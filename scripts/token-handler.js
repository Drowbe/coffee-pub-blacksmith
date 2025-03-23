// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 
import { postConsoleAndNotification } from './global.js';

// ================================================================== 
// ===== CONSTANTS ==================================================
// ================================================================== 
const MODULE_TITLE = "BLACKSMITH";

// ================================================================== 
// ===== TOKEN HANDLER CLASS =========================================
// ================================================================== 
export class TokenHandler {
    static hookId = null; // Store the hook ID for later unregistration

    static async updateSkillCheckFromToken(id, token) {
        postConsoleAndNotification("Updating skill check from token", `id: ${id}, token: ${token?.name}`, false, true, false, MODULE_TITLE);
        const data = this.getTokenData(token);
        if (!data) {
            postConsoleAndNotification("No data returned from getTokenData", "", false, true, false, MODULE_TITLE);
            return;
        }

        // Get form elements - using original IDs
        const typeSelect = document.querySelector(`#optionType-${id}`);
        const nameInput = document.querySelector(`#inputContextName-${id}`);
        const detailsInput = document.querySelector(`#inputContextDetails-${id}`);
        const biographyInput = document.querySelector(`#inputContextBiography-${id}`);
        const skillCheck = document.querySelector(`#blnSkillRoll-${id}`);
        const skillSelect = document.querySelector(`#optionSkill-${id}`);
        const diceSelect = document.querySelector(`#optionDiceType-${id}`);
        
        if (!typeSelect || !nameInput || !detailsInput || !biographyInput || !skillCheck || !skillSelect || !diceSelect) {
            const missingElements = {
                typeSelect: !!typeSelect,
                nameInput: !!nameInput,
                detailsInput: !!detailsInput,
                biographyInput: !!biographyInput,
                skillCheck: !!skillCheck,
                skillSelect: !!skillSelect,
                diceSelect: !!diceSelect
            };
            postConsoleAndNotification("Missing form elements", JSON.stringify(missingElements), false, true, false, MODULE_TITLE);
            return;
        }

        // Update form based on actor type
        if (data.actor.type === 'npc' && token.document.disposition < 0) {
            typeSelect.value = 'monster';
            skillSelect.value = 'Nature';
        } else if (data.isCharacter) {
            typeSelect.value = 'character';
            skillSelect.value = 'History';
        } else {
            typeSelect.value = 'npc';
            skillSelect.value = 'History';
        }

        // Format details text using the data from getTokenData
        const details = [
            `Actor Type: ${typeSelect.value}`,
            `Token Name: ${data.name}`,
            `Gender: ${data.actor.system.details.gender || 'Unknown'}`,
            `Age: ${data.actor.system.details.age || 'Unknown'}`,
            `Alignment: ${data.actor.system.details.alignment || 'Unknown'}`,
            `Background: ${data.actor.system.details.background || 'Unknown'}`,
            `Size: ${data.actor.system.traits?.size || 'Unknown'}`,
            data.isCharacter ? `Race: ${data.actor.system.details.race || 'Unknown'}\nClass: ${data.className || 'Unknown'}` : '',
            data.isCharacter ? `Level: ${data.actor.system.details.level}` : `CR: ${data.actor.system.details.cr || 'Unknown'}`,
            `HP: ${data.actor.system.attributes.hp.value}/${data.actor.system.attributes.hp.max}`,
            
            // Abilities
            'Ability Scores:',
            ...Object.entries(data.abilities).map(([key, ability]) => 
                `  - ${ability.label}: ${ability.value} (${ability.mod >= 0 ? '+' : ''}${ability.mod})`
            ),
            
            // Skills
            'Skills:',
            ...Object.values(data.skills).map(skill => 
                `  - ${skill.label}: ${skill.proficiency}`
            ),
            
            // Equipment
            data.equippedWeapons.length > 0 ? 
                `Equipped Weapons:\n  - ${data.equippedWeapons.map(w => w.name).join('\n  - ')}` : ''
        ].filter(Boolean).join('\n');

        // Update form
        nameInput.value = data.name;
        detailsInput.value = details;
        biographyInput.value = data.biography || '';
        skillCheck.checked = true;
        diceSelect.value = '1d20';

        postConsoleAndNotification("Form updated successfully", `Token: ${token.name}`, false, true, false, MODULE_TITLE);
    }

    static registerTokenHooks(workspaceId) {
        postConsoleAndNotification("Registering token hooks", `workspaceId: ${workspaceId}`, false, true, false, MODULE_TITLE);

        // Unregister any existing hooks first
        this.unregisterTokenHooks();

        // Check for already selected token when initialized
        if (workspaceId === 'assistant' || workspaceId === 'character') {
            const selectedToken = canvas.tokens?.controlled[0];
            if (selectedToken) {
                postConsoleAndNotification(`Found selected token, updating ${workspaceId} panel`, "", false, true, false, MODULE_TITLE);
                if (workspaceId === 'assistant') {
                    this.updateSkillCheckFromToken(workspaceId, selectedToken);
                } else {
                    this.updateCharacterBiography(workspaceId, selectedToken);
                }
            }
        }

        // Register hook for future token selections with explicit workspaceId closure
        const workspaceIdClosure = workspaceId; // Ensure workspaceId is captured in closure
        this.hookId = Hooks.on('controlToken', (token, controlled) => {
            if (!controlled) return;
            
            postConsoleAndNotification("Token control hook fired", `workspaceId: ${workspaceIdClosure}, token: ${token?.name}`, false, true, false, MODULE_TITLE);
            
            if (workspaceIdClosure === 'assistant') {
                postConsoleAndNotification("Token controlled, updating skill check form", "", false, true, false, MODULE_TITLE);
                this.updateSkillCheckFromToken(workspaceIdClosure, token);
            } else if (workspaceIdClosure === 'character') {
                postConsoleAndNotification("Token controlled, updating character panel", "", false, true, false, MODULE_TITLE);
                this.updateCharacterBiography(workspaceIdClosure, token);
            }
        });

        return this.hookId;
    }

    static unregisterTokenHooks() {
        if (this.hookId !== null) {
            postConsoleAndNotification("Unregistering token hooks", "", false, true, false, MODULE_TITLE);
            Hooks.off('controlToken', this.hookId);
            this.hookId = null;
        }
    }

    static updateCharacterBiography(id, token) {
        postConsoleAndNotification("CHARACTER | Updating character biography", `id: ${id}, token: ${token?.name}`, false, true, false, MODULE_TITLE);
        
        if (!token?.actor) {
            postConsoleAndNotification("CHARACTER | No actor data available", "", false, true, false, MODULE_TITLE);
            return;
        }

        // Create the template data object
        const templateData = {
            id: id,
            actor: token.actor,
            isCharacter: token.actor.type === 'character',
            biography: token.actor.system.details?.biography?.value || ''
        };
        postConsoleAndNotification("CHARACTER | Template data prepared", JSON.stringify(templateData), false, true, false, MODULE_TITLE);

        // Get the sections
        const detailsSection = document.querySelector(`#workspace-section-character-details-${id} .workspace-section-content`);
        const biographySection = document.querySelector(`#workspace-section-character-biography-${id} .character-biography`);

        if (!detailsSection || !biographySection) {
            postConsoleAndNotification("CHARACTER | Character sections not found", "", false, true, false, MODULE_TITLE);
            return;
        }

        // Update the sections using the template
        const template = 'modules/coffee-pub-blacksmith/templates/window-element-character-details.hbs';
        renderTemplate(template, templateData).then(html => {
            detailsSection.innerHTML = html;
            biographySection.innerHTML = templateData.biography || '<p class="no-biography">No biography available for this character.</p>';
            postConsoleAndNotification("CHARACTER | Sections updated with new content", "", false, true, false, MODULE_TITLE);
        }).catch(error => {
            postConsoleAndNotification("CHARACTER | Error rendering template", error.message, false, true, false, MODULE_TITLE);
        });
    }

    static getTokenData(token) {
        if (!token?.actor) return null;
        const actor = token.actor;

        return {
            id: token.id,
            actor: actor,
            isCharacter: actor.type === 'character',
            name: actor.name,
            className: actor.items.find(i => i.type === "class")?.name || '',
            biography: actor.system.details?.biography?.value || '',
            abilities: Object.entries(actor.system.abilities || {}).reduce((acc, [key, ability]) => {
                acc[key] = {
                    label: CONFIG.DND5E.abilities[key]?.label || key,
                    value: ability.value,
                    mod: ability.mod
                };
                return acc;
            }, {}),
            movement: Object.entries(actor.system.attributes.movement || {})
                .filter(([key]) => key !== 'units')
                .reduce((acc, [key, value]) => {
                    if (value) {
                        acc[key] = { value };
                    }
                    return acc;
                }, {}),
            movementUnits: actor.system.attributes.movement.units,
            skills: Object.entries(actor.system.skills || {}).reduce((acc, [key, skill]) => {
                if (skill.value > 0) {
                    acc[key] = {
                        label: CONFIG.DND5E.skills[key]?.label || key,
                        total: skill.total,
                        value: skill.value,
                        proficiency: skill.value === 0.5 ? 'half-proficient' : 
                                   skill.value === 1 ? 'proficient' : 
                                   skill.value === 2 ? 'expert' : ''
                    };
                }
                return acc;
            }, {}),
            equippedWeapons: actor.items
                .filter(item => item.type === 'weapon' && item.system.equipped)
                .map(weapon => ({
                    name: weapon.name,
                    damage: weapon.system.damage?.parts?.[0]?.[0] || ''
                }))
        };
    }
} 