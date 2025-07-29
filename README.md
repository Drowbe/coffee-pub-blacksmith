# Coffee Pub Blacksmith

A Foundry VTT module that provides enhanced tools for Game Masters, including encounter management, token deployment, and journal organization.

## Features

### Encounter Toolbar
The encounter toolbar provides powerful tools for managing encounters directly from journal entries:

- **Token Deployment:** Deploy monsters from encounter data with multiple positioning patterns
- **Combat Integration:** Automatically create combat encounters with deployed tokens
- **CR Calculation:** Real-time Party CR and Monster CR calculation from canvas tokens
- **Content Scanning:** Automatically detect encounter data from journal content in multiple formats

#### Content Scanning Formats
The encounter toolbar can detect encounter data from journal content in these formats:

**JSON Format:**
```json
{
  "encounter": {
    "monsters": [
      "Death Knight",
      "Helmed Horror",
      "Goblin"
    ],
    "difficulty": "medium"
  }
}
```

**Markdown Format:**
```markdown
## Encounter: Goblin Ambush
**Difficulty:** Medium
**Monsters:**
- Death Knight
- Helmed Horror
- Goblin
```

**Plain Text Format:**
```
ENCOUNTER: Goblin Ambush
Difficulty: Medium
Monsters: Death Knight, Helmed Horror, Goblin
```

### Deployment Patterns
Multiple deployment patterns for flexible token placement:

- **Circle Formation:** Tokens placed in a circle around the deployment point
- **Scatter Positioning:** Tokens scattered with random variation to prevent overlaps
- **Grid Positioning:** Tokens placed in a proper square grid formation
- **Sequential Positioning:** Place tokens one at a time with user guidance
- **Line Formation:** Default fallback pattern for backward compatibility

### Settings
- **Enable Encounter Toolbar:** Toggle the encounter toolbar functionality
- **Enable Content Scanning:** Enable automatic detection of encounter data from journal content
- **Deployment Pattern:** Choose the default deployment pattern for tokens
- **Deployment Hidden:** Control whether deployed tokens are hidden by default
- **Encounter Folder:** Specify a folder for deployed actors (optional)

## Installation

1. Download the module files
2. Place them in your Foundry VTT modules directory
3. Enable the module in your world settings
4. Configure the settings as needed

## Usage

### Creating Encounters
1. Create a journal entry with encounter data using one of the supported formats
2. The encounter toolbar will automatically appear if encounter data is detected
3. Use the toolbar buttons to deploy monsters and create combat encounters

### Content Scanning
The module will automatically scan journal content for encounter data when:
- Structured data attributes are not found
- Content scanning is enabled in settings
- The journal entry contains recognizable encounter formats

This makes it easy for GMs to modify encounters by simply editing the journal text without needing to use specific HTML formatting.

## Support

For issues, feature requests, or questions, please refer to the module documentation or contact the development team.

