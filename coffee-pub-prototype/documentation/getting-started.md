# Getting Started with Coffee Pub Module Development

## Overview

This prototype provides a **starter template** for creating new Coffee Pub modules that integrate with **Coffee Pub Blacksmith**. Use this as a foundation to quickly bootstrap your module development while maintaining consistency across the Coffee Pub ecosystem.

## What This Prototype Provides

### Pre-Configured Structure
- **Module scaffolding** with proper FoundryVTT structure
- **Blacksmith API integration** already set up and ready
- **Settings registration** pattern included
- **Localization support** with English language file
- **Basic styling** structure
- **Documentation templates** (README, CHANGELOG)

### What You Get
- ✅ Proper `module.json` structure for FoundryVTT v13
- ✅ Module constants auto-extracted from `module.json`
- ✅ Blacksmith API integration boilerplate
- ✅ Settings registration pattern
- ✅ Localization file structure
- ✅ MIT License template
- ✅ Documentation templates

## Prerequisites

Before you begin, you should have:

### Required Knowledge
- **Basic JavaScript** knowledge
- **FoundryVTT module development** basics
- Understanding of **FoundryVTT v13** API changes
- Familiarity with **Coffee Pub Blacksmith** ecosystem

### Required Tools
- **FoundryVTT v13** installed and running
- **Coffee Pub Blacksmith** module installed and enabled
- **Code editor** (VS Code, Cursor, etc.)
- **Git** (optional but recommended)

### Recommended Reading
Before starting your module, familiarize yourself with:
- [Coffee Pub Blacksmith Wiki](https://github.com/Drowbe/coffee-pub-blacksmith/wiki) - Comprehensive documentation
- [FoundryVTT v13 API Documentation](https://foundryvtt.com/api/) - Official Foundry API reference
- Coffee Pub Blacksmith API documentation (included in Blacksmith's documentation)

## Expected Workflow

### Step 1: Copy the Prototype
1. Copy the entire `coffee-pub-prototype/` folder
2. Paste it into your FoundryVTT `Data/modules/` directory
3. Rename the folder to match your module name:
   - Example: `coffee-pub-prototype` → `coffee-pub-sketch`

### Step 2: Use AI Assistant to Customize
1. Open the renamed folder in your code editor
2. Open the AI chat in your editor (Cursor, VS Code with Copilot, etc.)
3. Copy the prompt from `documentation/SETUP_PROMPT.md`
4. Paste it into the AI chat
5. Provide your module details when prompted:
   - Module name (e.g., "Sketch")
   - Module ID (e.g., "coffee-pub-sketch")
   - Description
   - Any specific requirements

### Step 3: Verify and Test
1. The AI will help you replace all "prototype" references
2. Review the changes to ensure everything is updated correctly
3. Restart FoundryVTT
4. Enable your new module in the module settings
5. Check the console for any errors
6. Verify Blacksmith integration is working

## What Gets Replaced

When you customize the prototype, the following will be updated:

### File Names
- `scripts/prototype.js` → `scripts/[your-module-name].js`
  - Example: `scripts/sketch.js` for Coffee Pub Sketch

### Module Configuration (`module.json`)
- `id`: `coffee-pub-prototype` → `coffee-pub-[your-module-name]`
- `title`: Update to your module's display name
- `description`: Update to your module's description
- GitHub URLs: Update manifest, download, URL, and bugs links

### Code References
- All instances of "prototype" in code will be replaced
- Localization keys in `lang/en.json`
- Module constants (auto-populated from `module.json` via `const.js`)

### Documentation
- `README.md`: Module name and description
- `CHANGELOG.md`: Initial release entry

## Understanding the Structure

### Core Files

#### `module.json`
The module manifest file. This is what FoundryVTT reads to identify your module. Key sections:
- **id**: Unique module identifier (must match folder name)
- **compatibility**: FoundryVTT version requirements
- **relationships**: Dependencies (Blacksmith is required)
- **esmodules**: List of JavaScript files to load

#### `scripts/const.js`
Automatically extracts module information from `module.json`. You typically don't need to modify this file. It provides:
- `MODULE.ID`: Your module ID
- `MODULE.NAME`: Short name (extracted from ID)
- `MODULE.TITLE`: Display title
- `MODULE.VERSION`: Version number
- Other metadata

#### `scripts/[your-module-name].js`
Your main module file. This is where:
- Blacksmith API integration happens
- Module initialization occurs
- Your main functionality lives

#### `scripts/settings.js`
Where you register your module's settings. The pattern is already set up - add your settings here.

### Important Patterns

#### Blacksmith Integration
The prototype includes the standard Blacksmith API integration pattern:
```javascript
// Module registration with Blacksmith
BlacksmithModuleManager.registerModule(MODULE.ID, {
    name: MODULE.NAME,
    version: MODULE.VERSION
});
```

#### Settings Registration
Settings are registered during the `ready` hook:
```javascript
export const registerSettings = () => {
    game.settings.register(MODULE.ID, 'settingName', {
        // Settings configuration
    });
};
```

#### Module Constants
Always use `MODULE.ID`, `MODULE.NAME`, etc. from `const.js` rather than hardcoding values. This ensures consistency and makes refactoring easier.

## Setting Expectations

### Development Time
- **Simple modules**: 4-8 hours
- **Medium complexity**: 8-20 hours  
- **Complex modules**: 20+ hours

### What You'll Need to Build
Depending on your module's features, you may need:
- Custom UI components (windows, dialogs)
- Canvas manipulation (if drawing/interacting on canvas)
- Hook registrations (for FoundryVTT events)
- Socket communication (for cross-client sync)
- Settings management (configuration options)
- Localization (multiple language support)

### Coffee Pub Blacksmith Integration
Your module will leverage Blacksmith's APIs:
- **HookManager**: Centralized hook registration and management
- **ModuleManager**: Inter-module communication
- **Utils**: Common utilities (logging, settings helpers)
- **Toolbar API**: Register tools in Blacksmith/Foundry toolbars
- **Menubar API**: Add items to the menubar
- **Socket System**: Cross-client communication

## Next Steps After Setup

1. **Review Blacksmith Documentation**
   - [Coffee Pub Blacksmith Wiki](https://github.com/Drowbe/coffee-pub-blacksmith/wiki)
   - Focus on API documentation relevant to your module's needs

2. **Plan Your Features**
   - Define what your module will do
   - Identify which Blacksmith APIs you'll need
   - Plan your settings structure

3. **Start Small**
   - Get a basic version working first
   - Test Blacksmith integration
   - Add features incrementally

4. **Follow Coffee Pub Patterns**
   - Use the same naming conventions
   - Follow the same code organization
   - Use Blacksmith's utilities when possible

## Common Tasks

### Adding a Setting
1. Add setting registration in `scripts/settings.js`
2. Add localization in `lang/en.json`
3. Use `game.settings.get(MODULE.ID, 'settingName')` to read values

### Registering a Hook
```javascript
// Use Blacksmith's HookManager
BlacksmithHookManager.registerHook({
    name: 'hookName',
    description: 'Description',
    context: MODULE.ID,
    priority: 3,
    callback: (args) => {
        // Your hook logic
    }
});
```

### Using Blacksmith Utilities
```javascript
// Safe settings access
const value = BlacksmithUtils.getSettingSafely(MODULE.ID, 'settingName', defaultValue);

// Logging
BlacksmithUtils.postConsoleAndNotification(
    MODULE.NAME,
    'Message',
    'Details',
    false, // debug flag
    false  // show notification
);
```

### Adding a Toolbar Tool
```javascript
// Use Blacksmith's toolbar API
blacksmith.registerToolbarTool('my-tool', {
    icon: "fa-solid fa-icon",
    name: "my-tool",
    title: "My Tool",
    button: true,
    visible: true,
    onClick: () => {
        // Tool action
    }
});
```

## Troubleshooting

### Module Not Loading
- Check `module.json` for syntax errors
- Verify all file paths in `esmodules` array are correct
- Check browser console for JavaScript errors

### Blacksmith Integration Failing
- Ensure Coffee Pub Blacksmith is installed and enabled
- Check that you're using the `ready` hook (not `init`)
- Verify module registration code is correct
- Check console for Blacksmith availability warnings

### Settings Not Appearing
- Ensure `registerSettings()` is called in the `ready` hook
- Check that settings are registered before being accessed
- Verify localization keys match in `lang/en.json`

## Resources

### Official Documentation
- **Coffee Pub Blacksmith Wiki**: https://github.com/Drowbe/coffee-pub-blacksmith/wiki
  - API Reference
  - Architecture documentation
  - Best practices
  - Migration guides

### FoundryVTT Resources
- [FoundryVTT API Documentation](https://foundryvtt.com/api/)
- [FoundryVTT Module Development Guide](https://foundryvtt.wiki/en/development/guides)
- [FoundryVTT v13 Migration Guide](https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide)

### Coffee Pub Examples
- Study other Coffee Pub modules for patterns
- Coffee Pub Blacksmith codebase for reference
- Existing modules in the Coffee Pub ecosystem

## Support

If you run into issues:
1. Check the [Coffee Pub Blacksmith Wiki](https://github.com/Drowbe/coffee-pub-blacksmith/wiki) first
2. Review existing Coffee Pub modules for examples
3. Check FoundryVTT console for error messages
4. Use Blacksmith's debugging utilities to trace issues

## Conclusion

This prototype gives you a solid foundation for building Coffee Pub modules. By following the patterns and using Blacksmith's APIs, you can focus on your module's unique features rather than boilerplate code.

Remember:
- **Keep it simple** - Start with a working basic version
- **Use Blacksmith APIs** - Don't reinvent the wheel
- **Follow patterns** - Consistency helps everyone
- **Test thoroughly** - Especially Blacksmith integration
- **Document as you go** - Future you will thank you

Good luck with your module development!

