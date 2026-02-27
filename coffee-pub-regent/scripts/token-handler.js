// ==================================================================
// ===== REGENT TOKEN HANDLER (moved from Blacksmith) ================
// ==================================================================
import { MODULE } from './const.js';
import { postConsoleAndNotification } from '/modules/coffee-pub-blacksmith/scripts/api-core.js';
import { HookManager } from '/modules/coffee-pub-blacksmith/scripts/manager-hooks.js';

const REGENT_TEMPLATES = "modules/coffee-pub-regent/templates";

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
            const creatureType = data.actor.system.details?.type?.value ||
                               data.actor.system.details?.race?.toLowerCase() ||
                               data.actor.system.details?.creatureType?.toLowerCase() ||
                               '';

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

        this.unregisterTokenHooks();

        if (workspaceId === 'assistant' || workspaceId === 'character') {
            if (!canvas?.ready) {
                postConsoleAndNotification(MODULE.NAME, `Canvas not ready, skipping initial token check`, "", true, false);
                return;
            }

            const selectedTokens = canvas.tokens?.controlled || [];
            postConsoleAndNotification(MODULE.NAME, `Checking for selected tokens: ${selectedTokens.length} found`, "", true, false);

            if (selectedTokens.length > 0) {
                const selectedToken = selectedTokens[0];
                postConsoleAndNotification(MODULE.NAME, `Found selected token: ${selectedToken.name}`, "", true, false);

                setTimeout(() => {
                    if (workspaceId === 'assistant') {
                        this.updateSkillCheckFromToken(workspaceId, selectedToken);
                    } else {
                        this.updateCharacterBiography(workspaceId, selectedToken);
                    }
                }, 100);
            }
        }

        const workspaceIdClosure = workspaceId;

        this.hookId = HookManager.registerHook({
            name: 'controlToken',
            description: 'Token Handler: Handle token control events for workspace updates',
            context: 'token-handler-control',
            priority: 3,
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

        const tokenData = this.getTokenData(token);
        if (!tokenData) {
            postConsoleAndNotification(MODULE.NAME, "CHARACTER | Failed to get token data", "", true, false);
            return;
        }

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
            const sections = [
                { id: `workspace-section-character-core-${id}`, template: `${REGENT_TEMPLATES}/partial-character-core.hbs` },
                { id: `workspace-section-character-abilities-${id}`, template: `${REGENT_TEMPLATES}/partial-character-abilities.hbs` },
                { id: `workspace-section-character-skills-${id}`, template: `${REGENT_TEMPLATES}/partial-character-skills.hbs` },
                { id: `workspace-section-character-features-${id}`, template: `${REGENT_TEMPLATES}/partial-character-features.hbs` },
                { id: `workspace-section-character-weapons-${id}`, template: `${REGENT_TEMPLATES}/partial-character-weapons.hbs` },
                { id: `workspace-section-character-spells-${id}`, template: `${REGENT_TEMPLATES}/partial-character-spells.hbs` },
                { id: `workspace-section-character-biography-${id}`, template: `${REGENT_TEMPLATES}/partial-character-biography.hbs` }
            ];

            for (const section of sections) {
                const element = document.querySelector(`#${section.id}`);
                if (element) {
                    try {
                        const content = await foundry.applications.handlebars.renderTemplate(section.template, templateData);
                        const temp = document.createElement('div');
                        temp.innerHTML = content;
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

        const classItem = actor.items.find(i => i.type === "class");

        return {
            id: token.id,
            actor: actor,
            isCharacter: actor.type === 'character',
            name: actor.name,
            className: classItem?.name || '',
            classLevel: actor.system.details.level,
            background: actor.system.details.background,
            race: actor.system.details.race,
            experience: {
                value: actor.system.details.xp.value,
                max: actor.system.details.xp.max,
                pct: actor.system.details.xp.pct
            },
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
            biography: actor.system.details?.biography?.value || '',
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
            movement: Object.entries(actor.system.attributes.movement || {})
                .filter(([key]) => key !== 'units')
                .reduce((acc, [key, value]) => {
                    if (value) acc[key] = { value };
                    return acc;
                }, {}),
            movementUnits: actor.system.attributes.movement.units,
            skills: Object.entries(actor.system.skills || {}).reduce((acc, [key, skill]) => {
                acc[key] = {
                    label: CONFIG.DND5E.skills[key]?.label || key,
                    ability: skill.ability.toUpperCase(),
                    total: (skill.total >= 0 ? '+' : '') + skill.total,
                    baseValue: skill.value * 10 + 10,
                    isProficient: skill.value > 0,
                    mod: skill.mod,
                    passive: skill.passive
                };
                return acc;
            }, {}),
            features: actor.items
                .filter(item => item.type === 'feat' || item.type === 'class' || item.type === 'background' || item.type === 'race')
                .map(feat => ({
                    name: feat.name,
                    description: feat.system.description.value,
                    source: feat.system.source,
                    type: feat.type,
                    level: feat.system.level,
                    img: feat.img || 'icons/svg/mystery-man.svg'
                })),
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
            spells: actor.items
                .filter(item => item.type === 'spell')
                .sort((a, b) => a.system.level - b.system.level)
                .reduce((acc, spell) => {
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
            spellSlots: Object.entries(actor.system.spells || {}).reduce((acc, [level, slotData]) => {
                if (slotData.max > 0) {
                    acc[level] = { value: slotData.value, max: slotData.max };
                }
                return acc;
            }, {})
        };
    }

    static getItemData(item) {
        if (!item) return null;

        const details = [];

        details.push(`Type: ${item.type}`);
        details.push(`Name: ${item.name}`);

        if (item.system.price?.value && item.system.price?.denomination) {
            details.push(`Value: ${item.system.price.value} ${item.system.price.denomination}`);
        }

        if (item.system.weight) {
            const weight = typeof item.system.weight === 'object' ?
                `${item.system.weight.value || 0} ${item.system.weight.units || 'lbs'}` :
                `${item.system.weight} lbs`;
            details.push(`Weight: ${weight}`);
        }

        if (item.system.rarity) {
            details.push(`Rarity: ${item.system.rarity}`);
        }

        if (item.type === 'equipment' || item.type === 'weapon' || item.type === 'armor') {
            if (item.system.equipped !== undefined) details.push(`Equipped: ${item.system.equipped}`);
            if (item.system.attunement) details.push(`Attunement: ${item.system.attunement}`);
        }

        if (item.type === 'weapon') {
            if (item.system.damage?.parts?.length > 0) {
                const damageStrings = item.system.damage.parts.map(part => part.join(' ')).filter(Boolean);
                if (damageStrings.length > 0) details.push(`Damage: ${damageStrings.join(', ')}`);
            }
            if (item.system.properties) {
                const properties = Object.entries(item.system.properties)
                    .filter(([_, value]) => value === true)
                    .map(([key]) => key);
                if (properties.length > 0) details.push(`Properties: ${properties.join(', ')}`);
            }
        }

        if (item.type === 'armor' && item.system.armor?.value) {
            details.push(`AC: ${item.system.armor.value}`);
        }

        if (item.type === 'consumable') {
            if (item.system.uses?.value !== undefined && item.system.uses?.max) {
                details.push(`Uses: ${item.system.uses.value}/${item.system.uses.max}`);
            }
            if (item.system.consumableType) details.push(`Consumable Type: ${item.system.consumableType}`);
        }

        if (item.type === 'tool') {
            if (item.system.proficient) details.push(`Proficiency: ${item.system.proficient}`);
            if (item.system.ability) details.push(`Ability: ${item.system.ability}`);
        }

        return {
            name: item.name,
            type: 'item',
            description: item.system.description?.value || '',
            details: details.filter(Boolean).join('\n'),
            originalItem: item
        };
    }

    static async updateFormFromItemData(id, data) {
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

        typeSelect.value = 'item';
        nameInput.value = data.name;
        detailsInput.value = data.details;
        biographyInput.value = data.description || '';
        skillCheck.checked = true;
        diceSelect.value = '1d20';

        let selectedSkill = 'Investigation';
        const item = data.originalItem;
        if (item) {
            if (item.system.rarity && item.system.rarity !== 'common') selectedSkill = 'Arcana';
            if (item.type === 'weapon' || item.type === 'armor') {
                if (item.system.rarity && item.system.rarity !== 'common') selectedSkill = 'Arcana';
                else if (item.system.description?.value?.toLowerCase().includes('dwarven') ||
                         item.system.description?.value?.toLowerCase().includes('elven') ||
                         item.system.description?.value?.toLowerCase().includes('ancient')) selectedSkill = 'History';
            }
            if (item.type === 'consumable' && item.system.consumableType === 'potion') {
                if (item.name.toLowerCase().includes('healing') || item.name.toLowerCase().includes('poison')) selectedSkill = 'Medicine';
                else if (item.system.description?.value?.toLowerCase().includes('herb') ||
                         item.system.description?.value?.toLowerCase().includes('alchemical')) selectedSkill = 'Nature';
                else selectedSkill = 'Arcana';
            }
            if (item.type === 'consumable' && item.system.consumableType === 'scroll') selectedSkill = 'Arcana';
            if (item.name.toLowerCase().includes('holy') || item.name.toLowerCase().includes('divine') || item.name.toLowerCase().includes('unholy')) selectedSkill = 'Religion';
            if (item.type === 'equipment' && item.system.rarity && (item.system.rarity === 'artifact' || item.system.rarity === 'legendary')) {
                if (item.name.toLowerCase().includes('holy') || item.name.toLowerCase().includes('divine') || item.name.toLowerCase().includes('unholy')) selectedSkill = 'Religion';
                else selectedSkill = 'Arcana';
            }
            if (item.type === 'loot' || item.name.toLowerCase().includes('jewelry') || item.name.toLowerCase().includes('gem')) selectedSkill = 'History';
        }

        skillSelect.value = selectedSkill;
    }

    static formatCharacterData(tokenData) {
        if (!tokenData) return "";

        let characterText = "";
        characterText += `\nName: ${tokenData.name}`;
        characterText += `\nRace: ${tokenData.race || '-'}`;
        characterText += `\nClass: ${tokenData.className} (Level ${tokenData.classLevel})`;
        characterText += `\nBackground: ${tokenData.background || '-'}`;
        if (tokenData.biography) {
            characterText += "\n\nBiography:";
            characterText += `\n${tokenData.biography}`;
        }
        characterText += "\n\nAbility Scores:";
        for (const [, ability] of Object.entries(tokenData.abilities)) {
            characterText += `\n${ability.label}: ${ability.value} (${ability.mod >= 0 ? '+' : ''}${ability.mod})`;
        }
        characterText += "\n\nSkills:";
        for (const [, skill] of Object.entries(tokenData.skills)) {
            characterText += `\n${skill.label} (${skill.ability}): ${skill.total}`;
        }
        if (tokenData.features?.length > 0) {
            characterText += "\n\nFeatures:";
            tokenData.features.forEach(feature => { characterText += `\n${feature.name}`; });
        }
        if (tokenData.equippedWeapons?.length > 0) {
            characterText += "\n\nEquipped Weapons:";
            tokenData.equippedWeapons.forEach(weapon => {
                characterText += `\n${weapon.name}`;
                if (weapon.damage) characterText += ` (${weapon.damage} damage)`;
                if (weapon.type) characterText += ` - ${weapon.type}`;
                if (weapon.properties) {
                    const props = Object.entries(weapon.properties).filter(([, v]) => v === true).map(([k]) => k);
                    if (props.length > 0) characterText += ` [${props.join(', ')}]`;
                }
                if (weapon.description) characterText += `\nDescription: ${weapon.description}`;
            });
        }
        if (tokenData.spells && Object.keys(tokenData.spells).length > 0) {
            characterText += "\n\nSpells:";
            for (const [level, spells] of Object.entries(tokenData.spells)) {
                if (spells.length > 0) {
                    characterText += `\nLevel ${level}:`;
                    spells.forEach(spell => { characterText += ` ${spell.name},`; });
                    characterText = characterText.slice(0, -1);
                }
            }
        }

        return characterText;
    }
}
