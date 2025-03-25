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

    static async updateSkillCheckFromToken(id, token, item = null) {
        postConsoleAndNotification("Updating skill check", `id: ${id}, token: ${token?.name}, item: ${item?.name}`, false, true, false, MODULE_TITLE);
        
        // Handle item drops
        if (item) {
            const data = this.getItemData(item);
            if (!data) {
                postConsoleAndNotification("No data returned from getItemData", "", false, true, false, MODULE_TITLE);
                return;
            }
            await this.updateFormFromItemData(id, data);
            return;
        }

        // Handle token drops (existing functionality)
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
        postConsoleAndNotification("Actor type check", `Actor Type: ${data.actor.type}, Disposition: ${token.document.disposition}, isCharacter: ${data.isCharacter}`, false, true, false, MODULE_TITLE);

        if (data.actor.type === 'npc') {
            if (token.document.disposition < 0) {
                typeSelect.value = 'monster';
                skillSelect.value = 'Nature';
            } else {
                typeSelect.value = 'character';  // NPCs use the "NPC or Character" option
                skillSelect.value = 'History';
            }
        } else if (data.isCharacter) {
            typeSelect.value = 'character';
            skillSelect.value = 'History';
        } else {
            typeSelect.value = 'character';  // Default to "NPC or Character" for unknown types
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
            // Wait for canvas to be ready
            if (!canvas?.ready) {
                postConsoleAndNotification(`Canvas not ready, skipping initial token check`, "", false, true, false, MODULE_TITLE);
                return;
            }

            const selectedTokens = canvas.tokens?.controlled || [];
            postConsoleAndNotification(`Checking for selected tokens: ${selectedTokens.length} found`, "", false, true, false, MODULE_TITLE);
            
            if (selectedTokens.length > 0) {
                const selectedToken = selectedTokens[0];
                postConsoleAndNotification(`Found selected token: ${selectedToken.name}`, "", false, true, false, MODULE_TITLE);
                
                // Use setTimeout to ensure DOM is ready
                setTimeout(() => {
                    if (workspaceId === 'assistant') {
                        this.updateSkillCheckFromToken(workspaceId, selectedToken);
                    } else {
                        this.updateCharacterBiography(workspaceId, selectedToken);
                    }
                }, 100);
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

    static async updateCharacterBiography(id, token) {
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

        // Prepare template data
        const templateData = {
            id: id,
            actor: token.actor,
            tokenData: tokenData,
            isCharacter: tokenData.isCharacter,
            abilities: tokenData.abilities,
            skills: tokenData.skills,
            features: tokenData.features,
            equippedWeapons: tokenData.equippedWeapons,
            movement: tokenData.movement,
            movementUnits: tokenData.movementUnits,
            biography: tokenData.biography
        };

        try {
            // Update each section individually
            const sections = [
                {
                    id: `workspace-section-character-core-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/window-element-character-core.hbs"
                },
                {
                    id: `workspace-section-character-abilities-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/window-element-character-abilities.hbs"
                },
                {
                    id: `workspace-section-character-skills-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/window-element-character-skills.hbs"
                },
                {
                    id: `workspace-section-character-features-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/window-element-character-features.hbs"
                },
                {
                    id: `workspace-section-character-weapons-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/window-element-character-weapons.hbs"
                },
                {
                    id: `workspace-section-character-spells-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/window-element-character-spells.hbs"
                },
                {
                    id: `workspace-section-character-biography-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/window-element-character-biography.hbs"
                }
            ];

            // Update each section
            for (const section of sections) {
                const element = document.querySelector(`#${section.id}`);
                if (element) {
                    try {
                        const content = await renderTemplate(section.template, templateData);
                        // Create a temporary container and set its HTML to get the DOM element
                        const temp = document.createElement('div');
                        temp.innerHTML = content;
                        // Replace the entire element with the new content
                        element.replaceWith(temp.firstElementChild);
                    } catch (error) {
                        console.error(`Error rendering section ${section.id}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error("CHARACTER | Error updating sections:", error);
        }

        postConsoleAndNotification("CHARACTER | Panel updated successfully", "", false, true, false, MODULE_TITLE);
    }

    static getTokenData(token) {
        if (!token?.actor) return null;
        const actor = token.actor;

        // Find the first class item
        const classItem = actor.items.find(i => i.type === "class");

        return {
            id: token.id,
            actor: actor,
            isCharacter: actor.type === 'character',
            name: actor.name,
            // Core character info
            className: classItem?.name || '',
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
            // Direct trait access without transformation
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
                .filter(item => item.type === 'feat' || item.type === 'class' || item.type === 'background' || item.type === 'race')
                .map(feat => ({
                    name: feat.name,
                    description: feat.system.description.value,
                    source: feat.system.source,
                    type: feat.type,
                    level: feat.system.level,
                    img: feat.img || 'icons/svg/mystery-man.svg'  // Use item's icon or default if none
                })),
            // Equipped weapons
            equippedWeapons: actor.items
                .filter(item => item.type === 'weapon' && item.system.equipped)
                .map(weapon => ({
                    name: weapon.name,
                    damage: `${weapon.system.damage?.base?.custom?.formula || weapon.system.damage?.base?.formula || ''}`,
                    type: weapon.system.type?.baseItem || weapon.system.type?.value || '',
                    properties: weapon.system.properties || [],
                    proficient: weapon.system.proficient,
                    equipped: weapon.system.equipped,
                    description: weapon.system.description?.value || '',
                    img: weapon.img || 'icons/svg/sword.svg'
                })),
            // Spells and Spell Slots
            spells: actor.items
                .filter(item => item.type === 'spell')
                .sort((a, b) => a.system.level - b.system.level)  // Sort by level
                .reduce((acc, spell) => {  // Group by level
                    const level = spell.system.level;
                    if (!acc[level]) acc[level] = [];
                    acc[level].push({
                        id: spell.id,
                        name: spell.name,
                        level: level,
                        school: spell.system.school,
                        description: spell.system.description.value,
                        components: spell.system.components,
                        ritual: spell.system.ritual,
                        concentration: spell.system.concentration,
                        preparation: spell.system.preparation,
                        img: spell.img || 'icons/svg/mystery-man.svg'
                    });
                    return acc;
                }, {}),
            // Add spell slots data
            spellSlots: Object.entries(actor.system.spells || {}).reduce((acc, [level, slotData]) => {
                if (slotData.max > 0) {
                    acc[level] = {
                        value: slotData.value,
                        max: slotData.max
                    };
                }
                return acc;
            }, {})
        };
    }

    static getItemData(item) {
        if (!item) return null;

        return {
            name: item.name,
            type: 'item',
            description: item.system.description?.value || '',
            details: [
                `Type: ${item.type}`,
                `Name: ${item.name}`,
                item.system.price ? `Value: ${item.system.price.value} ${item.system.price.denomination}` : '',
                item.system.weight ? `Weight: ${item.system.weight}` : '',
                item.system.rarity ? `Rarity: ${item.system.rarity}` : '',
                item.system.equipped !== undefined ? `Equipped: ${item.system.equipped}` : '',
                item.system.attunement ? `Attunement: ${item.system.attunement}` : '',
                item.system.damage ? `Damage: ${item.system.damage.parts.map(p => p.join(' ')).join(', ')}` : '',
                item.system.armor ? `AC: ${item.system.armor.value}` : ''
            ].filter(Boolean).join('\n')
        };
    }

    static async updateFormFromItemData(id, data) {
        // Get form elements
        const typeSelect = document.querySelector(`#optionType-${id}`);
        const nameInput = document.querySelector(`#inputContextName-${id}`);
        const detailsInput = document.querySelector(`#inputContextDetails-${id}`);
        const biographyInput = document.querySelector(`#inputContextBiography-${id}`);
        
        if (!typeSelect || !nameInput || !detailsInput || !biographyInput) {
            postConsoleAndNotification("Missing form elements for item update", "", false, true, false, MODULE_TITLE);
            return;
        }

        // Update form
        typeSelect.value = 'item';
        nameInput.value = data.name;
        detailsInput.value = data.details;
        biographyInput.value = data.description || '';
    }
}

function formatCharacterData(tokenData) {
    if (!tokenData) return "";
    
    let characterText = "";
    
    // Basic Info
    characterText += `\nName: ${tokenData.name}`;
    characterText += `\nRace: ${tokenData.race || '-'}`;
    characterText += `\nClass: ${tokenData.className} (Level ${tokenData.classLevel})`;
    characterText += `\nBackground: ${tokenData.background || '-'}`;
    
    // Biography (if available)
    if (tokenData.biography) {
        characterText += "\n\nBiography:";
        characterText += `\n${tokenData.biography}`;
    }
    
    // Abilities
    characterText += "\n\nAbility Scores:";
    for (const [key, ability] of Object.entries(tokenData.abilities)) {
        characterText += `\n${ability.label}: ${ability.value} (${ability.mod >= 0 ? '+' : ''}${ability.mod})`;
    }
    
    // Skills
    characterText += "\n\nSkills:";
    for (const [key, skill] of Object.entries(tokenData.skills)) {
        characterText += `\n${skill.label} (${skill.ability}): ${skill.total}`;
    }
    
    // Features
    if (tokenData.features && tokenData.features.length > 0) {
        characterText += "\n\nFeatures:";
        tokenData.features.forEach(feature => {
            characterText += `\n${feature.name}`;
        });
    }
    
    // Equipment with descriptions
    if (tokenData.equippedWeapons && tokenData.equippedWeapons.length > 0) {
        characterText += "\n\nEquipped Weapons:";
        tokenData.equippedWeapons.forEach(weapon => {
            characterText += `\n${weapon.name}`;
            if (weapon.damage) characterText += ` (${weapon.damage} damage)`;
            if (weapon.type) characterText += ` - ${weapon.type}`;
            if (weapon.properties) {
                const props = Object.entries(weapon.properties)
                    .filter(([_, value]) => value === true)
                    .map(([key, _]) => key);
                if (props.length > 0) {
                    characterText += ` [${props.join(', ')}]`;
                }
            }
            if (weapon.description) {
                characterText += `\nDescription: ${weapon.description}`;
            }
        });
    }
    
    // Spells
    if (tokenData.spells && Object.keys(tokenData.spells).length > 0) {
        characterText += "\n\nSpells:";
        for (const [level, spells] of Object.entries(tokenData.spells)) {
            if (spells.length > 0) {
                characterText += `\nLevel ${level}:`;
                spells.forEach(spell => {
                    characterText += ` ${spell.name},`;
                });
                characterText = characterText.slice(0, -1); // Remove trailing comma
            }
        }
    }
    
    return characterText;
} 