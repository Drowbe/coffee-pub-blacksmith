# Coffee Pub Module Setup Prompt

Copy and paste this prompt into your AI coding assistant chat in the new module project:

---

I need to set up a new Coffee Pub module. This is a prototype/starter project that needs to be customized.

## Current State
- This is the `coffee-pub-prototype` module
- The module structure is in place with placeholder values
- Files need to be updated with the actual module name and details

## What Needs to Be Done

1. **Replace all instances of "prototype" with the actual module name** throughout all files:
   - Module ID: `coffee-pub-prototype` → `coffee-pub-[module-name]`
   - File names: `prototype.js` → `[module-name].js`
   - Class names, function names, etc.
   
2. **Update module.json**:
   - Replace "prototype" with actual module name in:
     - `id`: `coffee-pub-prototype` → `coffee-pub-[module-name]`
     - `title`: Update to actual module title
     - `description`: Update to actual module description
     - `manifest`, `download`, `url`, `bugs`: Update GitHub URLs
   - Update `esmodules` array to reference the renamed main JS file
   
3. **Update README.md**:
   - Replace module name in title and throughout
   - Update description
   - Update installation URLs
   
4. **Update scripts/prototype.js** (will be renamed):
   - Rename file to match module name (e.g., `sketch.js` for Coffee Pub Sketch)
   - Update any references if needed
   - The MODULE constants are auto-populated from module.json via const.js, so they should update automatically once module.json is updated
   
5. **Update lang/en.json**:
   - Replace `coffee-pub-prototype` key with actual module ID
   - Update localization keys as needed
   
6. **Update documentation/SETUP_PROMPT.md**:
   - Remove or update this file since setup is complete

## Module Details
- **Module Name**: [Replace with actual name, e.g., "Sketch"]
- **Module ID**: [Replace with actual ID, e.g., "coffee-pub-sketch"]
- **Description**: [Replace with actual description]

## Important Notes
- The `scripts/const.js` file automatically reads from `module.json`, so updating module.json will automatically update MODULE constants
- Maintain the same structure and patterns as shown in the prototype
- All files follow Coffee Pub module conventions
- Integration with Coffee Pub Blacksmith is already set up in the main JS file

Please help me complete this setup by replacing all placeholders and updating file names as needed.

