# Coffee Pub Module Setup Prompt

Copy and paste this prompt into your AI coding assistant chat in the new module project:

---

I need to set up a new Coffee Pub module. This is a prototype/starter project that needs to be customized.

## Module Details

**IMPORTANT**: If module details are not provided below, please ask me for:
- **Module Name**: The display name (e.g., "Cartographer", "Sketch")
- **Module ID**: The full module identifier (e.g., "coffee-pub-cartographer", "coffee-pub-sketch")
- **Description**: A brief description of what the module does
- **GitHub Repository**: The GitHub username/repo (e.g., "Drowbe/coffee-pub-cartographer")

**Provided Module Details** (if any):
- **Module Name**: [Fill in or leave blank for AI to ask]
- **Module ID**: [Fill in or leave blank for AI to ask]
- **Description**: [Fill in or leave blank for AI to ask]
- **GitHub Repository**: [Fill in or leave blank for AI to ask]

## Current State
- This is the `coffee-pub-prototype` module
- The module structure is in place with placeholder values
- Files need to be updated with the actual module name and details
- **The folder has already been renamed** to match the module ID (e.g., `coffee-pub-cartographer`)

## Critical Requirements

⚠️ **FOLDER NAME MUST MATCH MODULE ID**: The folder name must exactly match the `id` field in `module.json` for FoundryVTT to load the module correctly.

⚠️ **DO NOT MODIFY DOCUMENTATION FILES**: Files in the `documentation/` folder are reference documentation and should remain as "prototype" examples. Do not replace "prototype" in:
- `documentation/getting-started.md`
- `documentation/SETUP_PROMPT.md` (this file)

## Order of Operations

Follow this exact order to avoid broken references:

1. **Update `module.json` first** (including the `esmodules` array)
2. **Rename `scripts/prototype.js`** to match the module name
3. **Update all other files** with replacements
4. **Verify all changes** using the checklist below

## What Needs to Be Done

### 1. Update `module.json`
Update the following fields:
- `id`: `coffee-pub-prototype` → `coffee-pub-[module-name]`
- `title`: Update to actual module title (e.g., "Coffee Pub Cartographer")
- `description`: Update to actual module description
- `manifest`: Update GitHub URL (e.g., `https://github.com/Drowbe/coffee-pub-[module-name]/releases/latest/download/module.json`)
- `download`: Update GitHub URL (e.g., `https://github.com/Drowbe/coffee-pub-[module-name]/releases/latest/download/coffee-pub-[module-name].zip`)
- `url`: Update GitHub URL (e.g., `https://github.com/Drowbe/coffee-pub-[module-name]`)
- `bugs`: Update GitHub URL (e.g., `https://github.com/Drowbe/coffee-pub-[module-name]/issues`)
- **`esmodules` array**: Update `scripts/prototype.js` → `scripts/[module-name].js`

### 2. Rename `scripts/prototype.js`
- Rename file to: `scripts/[module-name].js` (e.g., `scripts/cartographer.js`)
- The MODULE constants are auto-populated from `module.json` via `const.js`, so they will update automatically once `module.json` is updated
- No code changes needed in this file unless there are hardcoded references

### 3. Update `README.md`
- Replace module name in title (e.g., "# Coffee Pub Cartographer")
- Update description
- Update all GitHub URLs in installation section
- Update module name in "Configure Settings" section
- Update badge URLs if present

### 4. Update `lang/en.json`
- Replace the top-level key `coffee-pub-prototype` with the actual module ID (e.g., `coffee-pub-cartographer`)
- Keep all localization keys and structure the same

### 5. Update `CHANGELOG.md`
- Update any references to "prototype" in the changelog entries
- Keep the format and structure the same

### 6. Update `styles/default.css`
- Update the comment header from "COFFEE PUB PROTOTYPE STYLES" to "COFFEE PUB [MODULE-NAME] STYLES" (e.g., "COFFEE PUB CARTOGRAPHER STYLES")

### 7. Update `.github/workflows/release.yml`
- Replace `coffee-pub-prototype.zip` with `coffee-pub-[module-name].zip` in two places:
  - In the "Create Zip File" step (zip command)
  - In the "Create Release" step (files list)
- Update the default version in `workflow_dispatch` inputs if needed (currently set to `1.0.0`)

### 8. Update `documentation/SETUP_PROMPT.md`
- **Option A**: Delete this file after setup is complete
- **Option B**: Add a note at the top that setup is complete and this file can be removed

## Files That Should NOT Be Modified

**DO NOT** replace "prototype" in these files (they are reference documentation):
- `documentation/getting-started.md` - Template documentation
- `documentation/SETUP_PROMPT.md` - This file (setup prompt template)

## Important Notes

- The `scripts/const.js` file automatically reads from `module.json`, so updating `module.json` will automatically update all `MODULE` constants throughout the codebase
- Maintain the same structure and patterns as shown in the prototype
- All files follow Coffee Pub module conventions
- Integration with Coffee Pub Blacksmith is already set up in the main JS file
- The folder name must match the module ID exactly (case-sensitive)

## Verification Checklist

After completing the setup, verify:

- [ ] `module.json` `id` field matches the folder name exactly
- [ ] `module.json` `esmodules` array references the renamed JS file
- [ ] `scripts/prototype.js` has been renamed to `scripts/[module-name].js`
- [ ] All GitHub URLs in `module.json` are updated
- [ ] `README.md` title and URLs are updated
- [ ] `lang/en.json` top-level key is updated to match module ID
- [ ] `CHANGELOG.md` references are updated (if any)
- [ ] `styles/default.css` comment header is updated
- [ ] `.github/workflows/release.yml` zip file name is updated (both occurrences)
- [ ] Documentation files in `documentation/` folder are unchanged
- [ ] No broken file references remain
- [ ] All "prototype" references in code/config files are replaced (except documentation)

## Context-Aware Replacements

When replacing "prototype":
- ✅ **DO replace** in: code files, configuration files, user-facing text, file names
- ❌ **DON'T replace** in: documentation files (`documentation/` folder), example comments that show the pattern

Please help me complete this setup by replacing all placeholders and updating file names as needed. If any module details are missing, please ask me for them before proceeding.

