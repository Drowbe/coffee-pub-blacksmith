/**
 * Script to fetch monster data from Open5e API and create monster-mapping.json
 * Run this with: node scripts/fetch-monster-data.js
 */

const fs = require('fs');
const path = require('path');

async function fetchMonsterData() {
    try {
        console.log('Fetching monster data from Open5e API...');
        
        const response = await fetch('https://api.open5e.com/monsters/?limit=1000');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`Fetched ${data.results.length} monsters`);
        
        // Transform the data into our monster mapping format
        const monsterMapping = {
            monsters: {}
        };
        
        for (const monster of data.results) {
            const name = monster.name.toLowerCase().trim();
            
            // Skip if we already have this monster (handle duplicates)
            if (monsterMapping.monsters[name]) {
                continue;
            }
            
            // Extract common equipment from actions and special abilities
            const equipment = extractEquipment(monster);
            
            // Extract common classes/roles from the monster data
            const classes = extractClasses(monster);
            
            // Create variations array for better matching
            const variations = [name];
            if (monster.name !== name) {
                variations.push(monster.name.toLowerCase());
            }
            
            monsterMapping.monsters[name] = {
                dnd5eType: monster.type?.toLowerCase() || 'unknown',
                dnd5eSubtype: monster.subtype?.toLowerCase() || null,
                size: monster.size?.toLowerCase() || 'medium',
                challengeRating: monster.challenge_rating || 0,
                alignment: monster.alignment?.toLowerCase() || null,
                commonClasses: classes,
                commonEquipment: equipment,
                variations: variations,
                // Additional useful data
                armorClass: monster.armor_class || 10,
                hitPoints: monster.hit_points || 1,
                speed: monster.speed || {},
                languages: monster.languages || [],
                // Source reference
                source: 'open5e.com'
            };
        }
        
        // Write the monster mapping file
        const outputPath = path.join(__dirname, '..', 'resources', 'monster-mapping.json');
        fs.writeFileSync(outputPath, JSON.stringify(monsterMapping, null, 2));
        
        console.log(`✅ Monster mapping created with ${Object.keys(monsterMapping.monsters).length} monsters`);
        console.log(`📁 Saved to: ${outputPath}`);
        
        // Show some examples
        console.log('\n📋 Sample monsters:');
        const sampleMonsters = Object.keys(monsterMapping.monsters).slice(0, 5);
        for (const monsterName of sampleMonsters) {
            const monster = monsterMapping.monsters[monsterName];
            console.log(`  - ${monsterName}: ${monster.dnd5eType} (${monster.dnd5eSubtype || 'no subtype'}) - ${monster.size}`);
        }
        
    } catch (error) {
        console.error('❌ Error fetching monster data:', error.message);
        process.exit(1);
    }
}

function extractEquipment(monster) {
    const equipment = new Set();
    
    // Extract from actions
    if (monster.actions) {
        for (const action of monster.actions) {
            const text = action.desc?.toLowerCase() || '';
            // Look for common weapon/equipment mentions
            const weaponMatches = text.match(/\b(bow|sword|axe|spear|mace|dagger|crossbow|staff|hammer|club|whip|sling|javelin|trident|halberd|glaive|scythe|scimitar|rapier|longsword|shortsword|greatsword|battleaxe|handaxe|warhammer|maul|quarterstaff|shortbow|longbow|heavy crossbow|light crossbow|hand crossbow)\b/g);
            if (weaponMatches) {
                weaponMatches.forEach(weapon => equipment.add(weapon));
            }
        }
    }
    
    // Extract from special abilities
    if (monster.special_abilities) {
        for (const ability of monster.special_abilities) {
            const text = ability.desc?.toLowerCase() || '';
            const weaponMatches = text.match(/\b(bow|sword|axe|spear|mace|dagger|crossbow|staff|hammer|club|whip|sling|javelin|trident|halberd|glaive|scythe|scimitar|rapier|longsword|shortsword|greatsword|battleaxe|handaxe|warhammer|maul|quarterstaff|shortbow|longbow|heavy crossbow|light crossbow|hand crossbow)\b/g);
            if (weaponMatches) {
                weaponMatches.forEach(weapon => equipment.add(weapon));
            }
        }
    }
    
    return Array.from(equipment).slice(0, 10); // Limit to 10 most common
}

function extractClasses(monster) {
    const classes = new Set();
    
    // Look for class-like terms in the monster's name or description
    const name = monster.name.toLowerCase();
    const description = monster.desc?.toLowerCase() || '';
    
    const classTerms = [
        'archer', 'fighter', 'wizard', 'mage', 'merchant', 'rogue', 'cleric', 'paladin', 
        'ranger', 'barbarian', 'monk', 'sorcerer', 'warlock', 'druid', 'bard', 'knight', 
        'warrior', 'assassin', 'thief', 'priest', 'shaman', 'necromancer', 'enchanter', 
        'illusionist', 'conjurer', 'evoker', 'abjurer', 'diviner', 'transmuter', 'warlord',
        'captain', 'commander', 'leader', 'chief', 'boss', 'master', 'elite', 'veteran'
    ];
    
    for (const term of classTerms) {
        if (name.includes(term) || description.includes(term)) {
            classes.add(term);
        }
    }
    
    return Array.from(classes).slice(0, 8); // Limit to 8 most common
}

// Run the script
if (require.main === module) {
    fetchMonsterData();
}

module.exports = { fetchMonsterData };
