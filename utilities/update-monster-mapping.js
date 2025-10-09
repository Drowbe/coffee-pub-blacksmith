/**
 * Update monster mapping with 2024 Monster Manual data
 */

class MonsterMappingUpdater {
    constructor() {
        this.apiBase = 'https://api.open5e.com';
    }

    /**
     * Fetch monsters from Open5e API
     */
    async fetchMonsters() {
        try {
            postConsoleAndNotification(MODULE.NAME, 'Monster Mapping: Fetching data from Open5e API...', '', false, false);
            
            const response = await fetch(`${this.apiBase}/monsters/`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            postConsoleAndNotification(MODULE.NAME, `Monster Mapping: Fetched ${data.results.length} monsters`, '', false, false);
            
            return data.results;
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Monster Mapping: Error - ${error.message}`, '', false, false);
            return [];
        }
    }

    /**
     * Process monster data into our format
     */
    processMonster(monster) {
        return {
            name: monster.name,
            dnd5eType: this.normalizeType(monster.type),
            dnd5eSubtype: this.extractSubtype(monster.type),
            size: this.normalizeSize(monster.size),
            challengeRating: monster.challenge_rating?.toString() || '0',
            alignment: this.normalizeAlignment(monster.alignment),
            commonClasses: this.extractClasses(monster),
            commonEquipment: this.extractEquipment(monster),
            variations: this.extractVariations(monster)
        };
    }

    normalizeType(type) {
        const typeMap = {
            'aberration': 'aberration',
            'beast': 'beast',
            'celestial': 'celestial',
            'construct': 'construct',
            'dragon': 'dragon',
            'elemental': 'elemental',
            'fey': 'fey',
            'fiend': 'fiend',
            'giant': 'giant',
            'humanoid': 'humanoid',
            'monstrosity': 'monstrosity',
            'ooze': 'ooze',
            'plant': 'plant',
            'undead': 'undead'
        };
        
        const lowerType = type?.toLowerCase() || '';
        for (const [key, value] of Object.entries(typeMap)) {
            if (lowerType.includes(key)) return value;
        }
        return 'monstrosity';
    }

    extractSubtype(type) {
        const subtypes = ['goblinoid', 'elf', 'dwarf', 'halfling', 'gnome', 'orc', 'kobold', 'gnoll', 'lizardfolk', 'yuan-ti', 'gith', 'genasi', 'aasimar', 'metallic', 'chromatic', 'gem', 'shadow', 'dracolich', 'fire', 'water', 'earth', 'air', 'storm', 'ice', 'magma', 'skeleton', 'zombie', 'ghost', 'wraith', 'lich', 'vampire', 'mummy'];
        
        const lowerType = type?.toLowerCase() || '';
        for (const subtype of subtypes) {
            if (lowerType.includes(subtype)) return subtype;
        }
        return null;
    }

    normalizeSize(size) {
        const sizeMap = {
            'tiny': 'tiny', 'small': 'small', 'medium': 'medium',
            'large': 'large', 'huge': 'huge', 'gargantuan': 'gargantuan'
        };
        return sizeMap[size?.toLowerCase()] || 'medium';
    }

    normalizeAlignment(alignment) {
        const alignmentMap = {
            'lawful good': 'lawful good', 'neutral good': 'neutral good', 'chaotic good': 'chaotic good',
            'lawful neutral': 'lawful neutral', 'neutral': 'neutral', 'chaotic neutral': 'chaotic neutral',
            'lawful evil': 'lawful evil', 'neutral evil': 'neutral evil', 'chaotic evil': 'chaotic evil',
            'unaligned': 'unaligned'
        };
        return alignmentMap[alignment?.toLowerCase()] || 'unaligned';
    }

    extractClasses(monster) {
        const classes = ['fighter', 'wizard', 'cleric', 'rogue', 'ranger', 'paladin', 'barbarian', 'monk', 'sorcerer', 'warlock', 'druid', 'bard', 'knight', 'warrior', 'assassin', 'thief', 'priest', 'shaman', 'necromancer', 'enchanter', 'illusionist', 'conjurer', 'evoker', 'abjurer', 'diviner', 'transmuter'];
        
        const searchText = `${monster.name} ${monster.actions || ''} ${monster.traits || ''}`.toLowerCase();
        return classes.filter(cls => searchText.includes(cls));
    }

    extractEquipment(monster) {
        const equipment = ['sword', 'bow', 'staff', 'axe', 'spear', 'mace', 'dagger', 'crossbow', 'wand', 'orb', 'hammer', 'flail', 'whip', 'sling', 'javelin', 'trident', 'halberd', 'glaive', 'scythe', 'scimitar', 'rapier', 'longsword', 'shortsword', 'greatsword', 'battleaxe', 'handaxe', 'warhammer', 'maul', 'club', 'quarterstaff', 'shortbow', 'longbow', 'heavy crossbow', 'light crossbow', 'hand crossbow', 'shield', 'armor', 'leather', 'chain', 'plate', 'robe', 'cloth', 'hide', 'scale', 'ring', 'splint', 'banded'];
        
        const searchText = `${monster.name} ${monster.actions || ''} ${monster.traits || ''}`.toLowerCase();
        return equipment.filter(item => searchText.includes(item));
    }

    extractVariations(monster) {
        const variations = ['ancient', 'young', 'adult', 'wyrmling', 'elder', 'arch', 'greater', 'lesser', 'minor', 'major', 'prime', 'alpha', 'beta', 'gamma', 'skeleton', 'zombie', 'ghost', 'shadow', 'spirit', 'wraith', 'fire', 'ice', 'storm', 'shadow', 'death', 'life', 'nature'];
        
        const searchText = `${monster.name} ${monster.desc || ''}`.toLowerCase();
        return variations.filter(variation => searchText.includes(variation));
    }

    /**
     * Main execution
     */
    async execute() {
        try {
            const monsters = await this.fetchMonsters();
            if (monsters.length === 0) return null;
            
            const processed = monsters.map(monster => this.processMonster(monster));
            const mapping = {};
            
            processed.forEach(monster => {
                const key = monster.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                mapping[key] = monster;
            });
            
            postConsoleAndNotification(MODULE.NAME, `Monster Mapping: Generated mapping with ${Object.keys(mapping).length} monsters`, '', false, false);
            
            return JSON.stringify(mapping, null, 2);
            
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Monster Mapping: Error - ${error.message}`, '', false, false);
            return null;
        }
    }
}

// Make available globally
window.MonsterMappingUpdater = MonsterMappingUpdater;
