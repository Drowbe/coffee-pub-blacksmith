// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 
import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';

// ================================================================== 
// ===== CONSTANTS ==================================================
// ================================================================== 


// ================================================================== 
// ===== TOKEN HANDLER CLASS =========================================
// ================================================================== 
export class TokenHandler {
    static hookId = null; // Store the hook ID for later unregistration

    static async updateSkillCheckFromToken(id, token, item = null) {
        postConsoleAndNotification(MODULE.NAME, "Updating skill check", `id: ${id}, token: ${token?.name}, item: ${item?.name}`, true, false);
        
        // Handle item drops
        if (item) {
            const data = this.getItemData(item);
            if (!data) {
                postConsoleAndNotification(MODULE.NAME, "No data returned from getItemData", "", true, false);
                return;
            }
            await this.updateFormFromItemData(id, data);
            return;
        }

        // Handle token drops (existing functionality)
        const data = this.getTokenData(token);
        if (!data) {
            postConsoleAndNotification(MODULE.NAME, "No data returned from getTokenData", "", true, false);
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
            postConsoleAndNotification(MODULE.NAME, "Missing form elements", JSON.stringify(missingElements), true, false);
            return;
        }

        // Update form based on actor type
        postConsoleAndNotification(MODULE.NAME, "Actor type check", `Actor Type: ${data.actor.type}, Disposition: ${token.document.disposition}, isCharacter: ${data.isCharacter}`, true, false);

        // Set type based on disposition
        if (data.actor.type === 'npc') {
            if (token.document.disposition < 0) {
                typeSelect.value = 'monster';
            } else {
                typeSelect.value = 'character';  // NPCs use the "NPC or Character" option
            }
        } else if (data.isCharacter) {
            typeSelect.value = 'character';
        } else {
            typeSelect.value = 'character';  // Default to "NPC or Character" for unknown types
        }

        // Determine skill based on creature type
        let selectedSkill = 'History'; // Default for characters/NPCs
        if (typeSelect.value === 'monster') {
            // Get creature type, accounting for possible system variations
            const creatureType = data.actor.system.details?.type?.value || 
                               data.actor.system.details?.race?.toLowerCase() ||
                               data.actor.system.details?.creatureType?.toLowerCase() || 
                               '';

            // Map creature type to skill
            switch (creatureType.toLowerCase()) {
                case 'aberration':
                    selectedSkill = 'Arcana';
                    break;
                case 'beast':
                    selectedSkill = 'Nature';
                    break;
                case 'celestial':
                    selectedSkill = 'Religion';
                    break;
                case 'construct':
                    selectedSkill = 'Arcana';
                    break;
                case 'dragon':
                    selectedSkill = 'Arcana';
                    break;
                case 'elemental':
                    selectedSkill = 'Arcana';
                    break;
                case 'fey':
                    // For Fey, we'll default to Arcana, but you might want to add logic to choose between Arcana and Nature
                    selectedSkill = 'Arcana';
                    break;
                case 'fiend':
                    selectedSkill = 'Religion';
                    break;
                case 'giant':
                    selectedSkill = 'History';
                    break;
                case 'humanoid':
                    selectedSkill = 'History';
                    break;
                case 'monstrosity':
                    selectedSkill = 'Nature';
                    break;
                case 'ooze':
                    selectedSkill = 'Nature';
                    break;
                case 'plant':
                    selectedSkill = 'Nature';
                    break;
                case 'undead':
                    selectedSkill = 'Religion';
                    break;
                default:
                    // If we can't determine the type, use Nature for monsters
                    selectedSkill = 'Nature';
            }
        }

        // Update form elements
        nameInput.value = data.name;
        detailsInput.value = this.formatCharacterData(data);
        biographyInput.value = data.biography || '';
        skillCheck.checked = true;
        skillSelect.value = selectedSkill;
        diceSelect.value = '1d20';

        postConsoleAndNotification(MODULE.NAME, "Form updated successfully", `Token: ${token.name}`, true, false);
    }

    static registerTokenHooks(workspaceId) {
        postConsoleAndNotification(MODULE.NAME, "Registering token hooks", `workspaceId: ${workspaceId}`, true, false);

        // Unregister any existing hooks first
        this.unregisterTokenHooks();

        // Check for already selected token when initialized
        if (workspaceId === 'assistant' || workspaceId === 'character') {
            // Wait for canvas to be ready
            if (!canvas?.ready) {
                postConsoleAndNotification(MODULE.NAME, `Canvas not ready, skipping initial token check`, "", true, false);
                return;
            }

            const selectedTokens = canvas.tokens?.controlled || [];
            postConsoleAndNotification(MODULE.NAME, `Checking for selected tokens: ${selectedTokens.length} found`, "", true, false);
            
            if (selectedTokens.length > 0) {
                const selectedToken = selectedTokens[0];
                postConsoleAndNotification(MODULE.NAME, `Found selected token: ${selectedToken.name}`, "", true, false);
                
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
        
        // Register controlToken hook
        this.hookId = HookManager.registerHook({
            name: 'controlToken',
            description: 'Token Handler: Handle token control events for workspace updates',
            context: 'token-handler-control',
            priority: 3, // Normal priority - UI enhancement
            callback: (token, controlled) => {
                if (!controlled) return;
                
                postConsoleAndNotification(MODULE.NAME, "Token control hook fired", `workspaceId: ${workspaceIdClosure}, token: ${token?.name}`, true, false);
                
                if (workspaceIdClosure === 'assistant') {
                    postConsoleAndNotification(MODULE.NAME, "Token controlled, updating skill check form", "", true, false);
                    this.updateSkillCheckFromToken(workspaceIdClosure, token);
                } else if (workspaceIdClosure === 'character') {
                    postConsoleAndNotification(MODULE.NAME, "Token controlled, updating character panel", "", true, false);
                    this.updateCharacterBiography(workspaceIdClosure, token);
                }
            }
        });
        
        // Log hook registration
        postConsoleAndNotification(MODULE.NAME, "Hook Manager | controlToken", "token-handler-control", true, false);

        return this.hookId;
    }

    static unregisterTokenHooks() {
        if (this.hookId !== null) {
            postConsoleAndNotification(MODULE.NAME, "Unregistering token hooks", "", true, false);
            HookManager.removeCallback(this.hookId);
            this.hookId = null;
        }
    }

    static async updateCharacterBiography(id, token) {
        postConsoleAndNotification(MODULE.NAME, "CHARACTER | Updating character biography", `id: ${id}, token: ${token?.name}`, true, false);
        
        if (!token?.actor) {
            postConsoleAndNotification(MODULE.NAME, "CHARACTER | No actor data available", "", true, false);
            return;
        }

        // Get complete token data using our existing method
        const tokenData = this.getTokenData(token);
        if (!tokenData) {
            postConsoleAndNotification(MODULE.NAME, "CHARACTER | Failed to get token data", "", true, false);
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
                    template: "modules/coffee-pub-blacksmith/templates/partial-character-core.hbs"
                },
                {
                    id: `workspace-section-character-abilities-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/partial-character-abilities.hbs"
                },
                {
                    id: `workspace-section-character-skills-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/partial-character-skills.hbs"
                },
                {
                    id: `workspace-section-character-features-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/partial-character-features.hbs"
                },
                {
                    id: `workspace-section-character-weapons-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/partial-character-weapons.hbs"
                },
                {
                    id: `workspace-section-character-spells-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/partial-character-spells.hbs"
                },
                {
                    id: `workspace-section-character-biography-${id}`,
                    template: "modules/coffee-pub-blacksmith/templates/partial-character-biography.hbs"
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
                        postConsoleAndNotification(MODULE.NAME, `Error rendering section ${section.id}:`, error, false, false);
                    }
                }
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "CHARACTER | Error updating sections:", error, false, false);
        }

        postConsoleAndNotification(MODULE.NAME, "CHARACTER | Panel updated successfully", "", true, false);
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

        // Build details array with safe property access
        const details = [];
        
        // Basic item info
        details.push(`Type: ${item.type}`);
        details.push(`Name: ${item.name}`);
        
        // Price
        if (item.system.price?.value && item.system.price?.denomination) {
            details.push(`Value: ${item.system.price.value} ${item.system.price.denomination}`);
        }
        
        // Weight - handle weight as an object with value and units
        if (item.system.weight) {
            const weight = typeof item.system.weight === 'object' ? 
                `${item.system.weight.value || 0} ${item.system.weight.units || 'lbs'}` : 
                `${item.system.weight} lbs`;
            details.push(`Weight: ${weight}`);
        }
        
        // Rarity
        if (item.system.rarity) {
            details.push(`Rarity: ${item.system.rarity}`);
        }
        
        // Equipment specific properties
        if (item.type === 'equipment' || item.type === 'weapon' || item.type === 'armor') {
            if (item.system.equipped !== undefined) {
                details.push(`Equipped: ${item.system.equipped}`);
            }
            if (item.system.attunement) {
                details.push(`Attunement: ${item.system.attunement}`);
            }
        }
        
        // Weapon specific properties
        if (item.type === 'weapon') {
            if (item.system.damage?.parts?.length > 0) {
                const damageStrings = item.system.damage.parts
                    .map(part => part.join(' '))
                    .filter(Boolean);
                if (damageStrings.length > 0) {
                    details.push(`Damage: ${damageStrings.join(', ')}`);
                }
            }
            
            if (item.system.properties) {
                const properties = Object.entries(item.system.properties)
                    .filter(([_, value]) => value === true)
                    .map(([key, _]) => key);
                if (properties.length > 0) {
                    details.push(`Properties: ${properties.join(', ')}`);
                }
            }
        }
        
        // Armor specific properties
        if (item.type === 'armor' && item.system.armor?.value) {
            details.push(`AC: ${item.system.armor.value}`);
        }
        
        // Consumable specific properties
        if (item.type === 'consumable') {
            if (item.system.uses?.value !== undefined && item.system.uses?.max) {
                details.push(`Uses: ${item.system.uses.value}/${item.system.uses.max}`);
            }
            if (item.system.consumableType) {
                details.push(`Consumable Type: ${item.system.consumableType}`);
            }
        }

        // Tool specific properties
        if (item.type === 'tool') {
            if (item.system.proficient) {
                details.push(`Proficiency: ${item.system.proficient}`);
            }
            if (item.system.ability) {
                details.push(`Ability: ${item.system.ability}`);
            }
        }

        return {
            name: item.name,
            type: 'item',
            description: item.system.description?.value || '',
            details: details.filter(Boolean).join('\n'),
            originalItem: item // Pass through the original item for skill selection
        };
    }

    static async updateFormFromItemData(id, data) {
        // Get form elements
        const typeSelect = document.querySelector(`#optionType-${id}`);
        const nameInput = document.querySelector(`#inputContextName-${id}`);
        const detailsInput = document.querySelector(`#inputContextDetails-${id}`);
        const biographyInput = document.querySelector(`#inputContextBiography-${id}`);
        const skillCheck = document.querySelector(`#blnSkillRoll-${id}`);
        const skillSelect = document.querySelector(`#optionSkill-${id}`);
        const diceSelect = document.querySelector(`#optionDiceType-${id}`);
        
        if (!typeSelect || !nameInput || !detailsInput || !biographyInput || !skillCheck || !skillSelect || !diceSelect) {
            postConsoleAndNotification(MODULE.NAME, "Missing form elements for item update", "", true, false);
            return;
        }

        // Update basic form fields
        typeSelect.value = 'item';
        nameInput.value = data.name;
        detailsInput.value = data.details;
        biographyInput.value = data.description || '';
        skillCheck.checked = true;
        diceSelect.value = '1d20';

        // Determine the appropriate skill check based on item type and properties
        let selectedSkill = 'Investigation'; // Default skill

        const item = data.originalItem; // We'll need to pass this through from getItemData
        if (item) {
            // Magic Items (General)
            if (item.system.rarity && item.system.rarity !== 'common') {
                selectedSkill = 'Arcana';
            }

            // Weapons & Armor
            if (item.type === 'weapon' || item.type === 'armor') {
                if (item.system.rarity && item.system.rarity !== 'common') {
                    selectedSkill = 'Arcana';
                } else if (item.system.description?.value?.toLowerCase().includes('dwarven') ||
                         item.system.description?.value?.toLowerCase().includes('elven') ||
                         item.system.description?.value?.toLowerCase().includes('ancient')) {
                    selectedSkill = 'History';
                }
            }

            // Potions
            if (item.type === 'consumable' && item.system.consumableType === 'potion') {
                if (item.name.toLowerCase().includes('healing') || 
                    item.name.toLowerCase().includes('poison')) {
                    selectedSkill = 'Medicine';
                } else if (item.system.description?.value?.toLowerCase().includes('herb') ||
                         item.system.description?.value?.toLowerCase().includes('alchemical')) {
                    selectedSkill = 'Nature';
                } else {
                    selectedSkill = 'Arcana';
                }
            }

            // Scrolls & Tomes
            if (item.type === 'consumable' && item.system.consumableType === 'scroll') {
                selectedSkill = 'Arcana';
            }
            if (item.name.toLowerCase().includes('holy') || 
                item.name.toLowerCase().includes('divine') ||
                item.name.toLowerCase().includes('unholy')) {
                selectedSkill = 'Religion';
            }

            // Artifacts or Wondrous Items
            if (item.type === 'equipment' && item.system.rarity && 
                (item.system.rarity === 'artifact' || item.system.rarity === 'legendary')) {
                if (item.name.toLowerCase().includes('holy') || 
                    item.name.toLowerCase().includes('divine') ||
                    item.name.toLowerCase().includes('unholy')) {
                    selectedSkill = 'Religion';
                } else {
                    selectedSkill = 'Arcana';
                }
            }

            // Currency, Jewelry, Art Objects
            if (item.type === 'loot' || 
                item.name.toLowerCase().includes('jewelry') || 
                item.name.toLowerCase().includes('gem')) {
                selectedSkill = 'History';
            }
        }

        skillSelect.value = selectedSkill;
    }

    static formatCharacterData(tokenData) {
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
} 
