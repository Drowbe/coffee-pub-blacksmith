# ARCHITECTURE MIGRATION PLAN

## CURRENT STATE ANALYSIS

### 1. BLACKSMITH.JS ANALYSIS NEEDED
- **Is it a "God Module"?** - Need to analyze current responsibilities
- **What does it actually do today?** - Current functionality breakdown
- **Import analysis** - What's being imported and why
- **Initialization flow** - How everything gets set up
- **Hook management** - Current hook registration patterns

### 2. GOD MODULE INDICATORS (PRELIMINARY ANALYSIS)
- **File Size**: 1835+ lines (massive for a single file)
- **Import Count**: 30+ different imports from various systems
- **Multiple Responsibilities**: 
  - Module initialization (ModuleManager, UtilsManager, HookManager)
  - System initialization (CombatTimer, PlanningTimer, RoundTimer, CombatTracker, VoteManager)
  - Canvas management (hookCanvas, addToolbarButton)
  - Socket management (SocketManager)
  - API exposure (module.api)
  - Caching (templates, settings, DOM elements)
- **Mixed Concerns**: Infrastructure, business logic, UI management, caching

### 2. CURRENT ARCHITECTURE ASSESSMENT
- **Manager files** - What's working well
- **Service files** - What needs to be created
- **Hook patterns** - Current hook management approach
- **Module dependencies** - What depends on what

## ENDSTATE VISION

### BLACKSMITH AS COFFEE PUB MODULE ECOSYSTEM CORE

Blacksmith will become the **central hub** for all Coffee Pub modules, providing:

- **Module Registration & Management** - Register, activate, deactivate modules
- **Inter-Module Communication** - Coordinate between all Coffee Pub modules
- **Shared Infrastructure** - Common tools, variables, and managers for all modules
- **Hook Coordination** - Prevent conflicts (e.g., no duplicate hooks on tokens)
- **Universal Debugging** - Shared `postConsoleAndNotification` system
- **Shared Variables** - Common `COFFEEPUB` variables across all modules
- **Premium vs Free Management** - Module licensing and feature control
- **Theme & Settings Management** - Universal theming and configuration
- **Toolbar Management** - Centralized toolbar for all modules

### MODULE EXTRACTION STRATEGY

**Services that will become separate modules:**
- **`service-regent.js`** → `coffee-pub-regent` (AI tools)
- **`service-combat.js`** → `coffee-pub-combat` (Combat tools)
- **`service-rolling.js`** → `coffee-pub-rolling` (Rolling tools)
- **`service-encounters.js`** → `coffee-pub-encounters` (Encounter tools)
- **`service-journal.js`** → `coffee-pub-journal` (Journal tools)

**Services that stay in Blacksmith core:**
- **`manager-hooks.js`** - Hook coordination (shared infrastructure)
- **`manager-sockets.js`** - Inter-module communication (shared infrastructure)
- **`manager-modules.js`** - Module management (core functionality)
- **`manager-themes.js`** - Theme management (core functionality)

## TARGET ARCHITECTURE

### 1. FLAT STRUCTURE (CONFIRMED)
```
scripts/
├── manager-*.js               # Shared infrastructure (hooks, sockets, modules)
├── service-*.js               # Feature-specific services (combat, rolling, tokens)
├── window-*.js                # UI components
├── timer-*.js                 # Timer functionality
├── stats-*.js                 # Statistics functionality
└── [existing files]           # Keep current working structure
```

### 2. NAMING CONVENTIONS
- **`manager-*.js`** - For things that "manage" (hooks, sockets, modules)
- **`service-*.js`** - For feature-specific business logic
- **`window-*.js`** - For UI components
- **`timer-*.js`** - For timer functionality
- **`stats-*.js`** - For statistics functionality

### 3. SERVICE SCOPE GUIDELINES
- **Target: 200-500 lines per service**
- **Single responsibility principle**
- **Maintainable and testable**
- **Extractable to separate modules later**

## MIGRATION PHASES

### Phase 1: CURRENT STATE ANALYSIS (IMMEDIATE)
- [ ] Analyze `blacksmith.js` - Is it a God Module?
- [ ] Document current architecture
- [ ] Identify what's working vs. what's broken
- [ ] Map current dependencies and imports

### Phase 2: COMPLETE EXISTING WORK (HIGH PRIORITY)
- [ ] Fix rolls system (currently half-done)
- [ ] Complete hooks migration (currently half-done)
- [ ] Ensure all current functionality works
- [ ] No new features until current work is complete

### Phase 3: SERVICE ARCHITECTURE (FUTURE)
- [ ] Create service classes
- [ ] Move business logic to services
- [ ] HookManager routes to services
- [ ] Maintain flat structure

### Phase 4: MODULE EXTRACTION (FUTURE)
- [ ] Extract services to separate modules
  - [ ] `service-regent.js` → `coffee-pub-regent` (AI tools)
  - [ ] `service-combat.js` → `coffee-pub-combat` (Combat tools)
  - [ ] `service-rolling.js` → `coffee-pub-rolling` (Rolling tools)
  - [ ] `service-encounters.js` → `coffee-pub-encounters` (Encounter tools)
  - [ ] `service-journal.js` → `coffee-pub-journal` (Journal tools)
- [ ] Module registration system
- [ ] Inter-module communication
- [ ] Premium vs. Free management
- [ ] Shared infrastructure coordination

## KEY QUESTIONS TO ANSWER

### 1. BLACKSMITH.JS ANALYSIS
- What are the current responsibilities?
- Is it doing too many things?
- What can be extracted to services?
- What should stay in core?

### 2. CURRENT WORK COMPLETION
- What's blocking the rolls system?
- What's blocking the hooks migration?
- What dependencies are missing?
- What needs to be finished first?

### 3. ARCHITECTURE DECISIONS
- Which managers should stay as managers?
- Which should become services?
- How should HookManager route to services?
- What's the right scope for each service?

## NEXT STEPS

1. **Create this document** ✅ (COMPLETED)
2. **Analyze blacksmith.js** - Understand current state
3. **Complete existing work** - Fix rolls and hooks
4. **Plan service architecture** - Design the target state
5. **Execute migration** - Move to new architecture

## IMMEDIATE PRIORITIES

### 1. COMPLETE EXISTING WORK FIRST (NO NEW ARCHITECTURE)
- **Rolls System** - Currently half-done, needs completion
- **Hooks Migration** - Currently half-done, needs completion
- **All current functionality** must work before any new work

### 2. NO GOD MODULE REFACTORING YET
- **Document current state** - Understand what we have
- **Complete broken functionality** - Fix what's not working
- **Plan extraction strategy** - Design the target architecture
- **Execute migration** - Move to new architecture only after current work is complete

## NOTES

- **Flat structure confirmed** - No folder complexity
- **Manager naming for infrastructure** - Hooks, sockets, modules
- **Service naming for features** - Combat, rolling, tokens
- **Complete current work first** - No new features until current work is complete
- **Endstate vision**: Blacksmith becomes Coffee Pub module ecosystem core
