/**
 * Run the monster mapping update
 * Usage: In browser console, run: new MonsterMappingUpdater().execute()
 */

// Example usage:
// const updater = new MonsterMappingUpdater();
// updater.execute().then(result => {
//     if (result) {
//         console.log('Monster mapping generated:');
//         console.log(result);
//         // Copy the result and paste it into monster-mapping.json
//     }
// });

postConsoleAndNotification(MODULE.NAME, 'Monster Mapping: Script loaded. Run "new MonsterMappingUpdater().execute()" to fetch data', '', false, false);
