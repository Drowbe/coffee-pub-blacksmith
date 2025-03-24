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
            `Background: ${data.background}`,
            `Size: ${data.actor.system.traits?.size || 'Unknown'}`,
            data.isCharacter ? `Race: ${data.race || 'Unknown'}\nClass: ${data.className || 'Unknown'}` : '',
            data.isCharacter ? `Level: ${data.classLevel}` : `CR: ${data.actor.system.details.cr || 'Unknown'}`,
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

        // Get complete token data using our existing method
        const tokenData = this.getTokenData(token);
        if (!tokenData) {
            postConsoleAndNotification("CHARACTER | Failed to get token data", "", false, true, false, MODULE_TITLE);
            return;
        }

        // Update biography section directly
        const bioSection = document.querySelector(`#workspace-section-character-biography-${id} .workspace-section-nodivider`);
        if (bioSection) {
            bioSection.innerHTML = token.actor.system.details?.biography?.value || '<p class="workspace-helper-text">No biography available for this character.</p>';
        }

        // Prepare template data
        const templateData = {
            id: id,
            ...tokenData
        };

        // Use the template to update the character section
        const template = 'modules/coffee-pub-blacksmith/templates/window-element-character-details.hbs';
        const characterSection = document.querySelector(`#workspace-section-character-core-${id}`);
        if (characterSection) {
            renderTemplate(template, templateData).then(html => {
                characterSection.outerHTML = html;
                postConsoleAndNotification("CHARACTER | Sections updated with new content", "", false, true, false, MODULE_TITLE);
            }).catch(error => {
                postConsoleAndNotification("CHARACTER | Error rendering template", error.message, false, true, false, MODULE_TITLE);
            });
        }
    }

    static getTokenData(token) {
        if (!token?.actor) return null;
        const actor = token.actor;

        return {
            id: token.id,
            actor: actor,
            isCharacter: actor.type === 'character',
            name: actor.name,
            // Core character info
            className: actor.items.find(i => i.type === "class")?.name || '',
            classLevel: actor.system.details.level,
            background: actor.system.details.background,
            race: actor.system.details.race,
            experience: {
                value: actor.system.details.xp.value,
                max: actor.system.details.xp.max,
                pct: actor.system.details.xp.pct
            },
            // Traits
            senses: Object.entries(actor.system.attributes.senses || {}).reduce((acc, [key, value]) => {
                if (value) acc[key] = value;
                return acc;
            }, {}),
            damageResistances: actor.system.traits.dr,
            damageImmunities: actor.system.traits.di,
            damageVulnerabilities: actor.system.traits.dv,
            armorProficiencies: actor.system.traits.armorProf,
            weaponProficiencies: actor.system.traits.weaponProf,
            languages: actor.system.traits.languages,
            // Biography
            biography: actor.system.details?.biography?.value || '',
            // Abilities
            abilities: Object.entries(actor.system.abilities || {}).reduce((acc, [key, ability]) => {
                acc[key] = {
                    label: CONFIG.DND5E.abilities[key]?.label || key,
                    value: ability.value,
                    mod: ability.mod,
                    proficient: ability.proficient,
                    save: ability.save
                };
                return acc;
            }, {}),
            // Movement
            movement: Object.entries(actor.system.attributes.movement || {})
                .filter(([key]) => key !== 'units')
                .reduce((acc, [key, value]) => {
                    if (value) {
                        acc[key] = { value };
                    }
                    return acc;
                }, {}),
            movementUnits: actor.system.attributes.movement.units,
            // All skills, not just proficient ones
            skills: Object.entries(actor.system.skills || {}).reduce((acc, [key, skill]) => {
                acc[key] = {
                    label: CONFIG.DND5E.skills[key]?.label || key,
                    ability: skill.ability.toUpperCase(),  // The ability abbreviation (STR, DEX, etc.)
                    total: (skill.total >= 0 ? '+' : '') + skill.total,  // The bonus with sign (+5, -1, etc.)
                    baseValue: skill.value * 10 + 10,     // The gray number (15, 9, etc.)
                    isProficient: skill.value > 0,        // Whether to show the proficiency dot
                    mod: skill.mod,
                    passive: skill.passive
                };
                return acc;
            }, {}),
            // Features
            features: actor.items
                .filter(item => item.type === 'feat')
                .map(feat => ({
                    name: feat.name,
                    description: feat.system.description.value,
                    source: feat.system.source,
                    activation: feat.system.activation,
                    duration: feat.system.duration,
                    requirements: feat.system.requirements
                })),
            // Equipped weapons
            equippedWeapons: actor.items
                .filter(item => item.type === 'weapon' && item.system.equipped)
                .map(weapon => ({
                    name: weapon.name,
                    damage: weapon.system.damage?.parts?.[0]?.[0] || '',
                    type: weapon.system.weaponType,
                    properties: weapon.system.properties,
                    proficient: weapon.system.proficient,
                    equipped: weapon.system.equipped
                }))
        };
    }
} 