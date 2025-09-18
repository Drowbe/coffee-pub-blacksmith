/**
 * Simple merge script - run this in console
 */

// Copy and paste this into your browser console:

// 1. First, load the new data from temp.json
fetch('modules/coffee-pub-blacksmith/resources/temp.json')
  .then(response => response.json())
  .then(newData => {
    console.log('Loaded new data:', Object.keys(newData).length, 'monsters');
    
    // 2. Load the old data
    fetch('modules/coffee-pub-blacksmith/resources/monster-mapping.json')
      .then(response => response.json())
      .then(oldData => {
        console.log('Loaded old data:', Object.keys(oldData.monsters).length, 'monsters');
        
        // 3. Create merged result
        const mergedData = {
          "monsters": { ...newData } // Start with all new data
        };
        
        // 4. Enhance with old rich data where available
        Object.keys(oldData.monsters).forEach(key => {
          if (mergedData.monsters[key]) {
            // Merge: keep new data but enhance with old rich data
            mergedData.monsters[key] = {
              ...mergedData.monsters[key], // New data
              ...oldData.monsters[key], // Old rich data (overwrites new data)
              // Ensure we keep the new name if it's different
              name: mergedData.monsters[key].name || oldData.monsters[key].name
            };
            console.log(`Enhanced ${key} with rich data`);
          } else {
            // Add old data that's not in new data
            mergedData.monsters[key] = oldData.monsters[key];
            console.log(`Added ${key} from old data`);
          }
        });
        
        console.log(`Merge complete! Total monsters: ${Object.keys(mergedData.monsters).length}`);
        console.log('Merged data:', JSON.stringify(mergedData, null, 2));
        
        // Copy this result and paste it into monster-mapping.json
      });
  });
