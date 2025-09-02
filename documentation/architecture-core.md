# BLACKSMITH ARCHITECTURE DOCUMENTATION

> **For Blacksmith Developers Only**
> 
> This document covers the **internal architecture** of Coffee Pub Blacksmith. 
> 
> **If you're developing another module** that wants to integrate with Blacksmith, see `BLACKSMITH-API.md` for the external API.

## **Overview**
This document outlines the technical architecture and design decisions for the Coffee Pub Blacksmith module. The module has undergone significant architectural improvements and now features a robust, enterprise-grade socket communication system.

## **API Architecture Overview**

### **🔧 Internal APIs (This Document)**
- **Direct Manager Access**: `HookManager.registerHook()`, `ModuleManager.registerModule()`
- **Performance**: Direct access for maximum speed
- **Flexibility**: Full access to internal systems
- **Use Case**: When developing Blacksmith itself

### **🌐 External APIs (BLACKSMITH-API.md)**
- **Bridge Access**: `await BlacksmithAPI.getHookManager()`
- **Stability**: Consistent interface that won't break
- **Safety**: Automatic timing and availability handling
- **Use Case**: When other modules want to integrate with Blacksmith

## **Current Status: PRODUCTION READY + ASSET SYSTEM IN DEVELOPMENT**

### **✅ Major Achievements:**
- **Socket System**: Fully operational with SocketLib integration
- **Cross-Client Communication**: All features sync in real-time
- **File Organization**: Consistent naming and loading patterns
- **Module Architecture**: Clean, maintainable, and extensible

### **🚧 In Development:**
- **Asset Management System**: **PARTIALLY COMPLETED** - Data structure refactored with `value` field
- **Constants Migration**: **MAJOR PROGRESS** - ~90+ constants migrated, data collections established
- **Data Collections**: **COMPLETED** - Centralized asset metadata storage with new structure
- **Asset Lookup Tool**: **COMPLETED** - Flexible, tag-based asset access system

## **Core Architecture Principles**

### **1. Separation of Concerns**
- **Manager Classes**: Handle specific system responsibilities
- **API Classes**: Provide external interfaces
- **Window Classes**: Handle UI presentation
- **Timer Classes**: Manage timing functionality

### **2. Consistent Naming Convention**
- **`manager-*`**: Core management systems
- **`api-*`**: External APIs and interfaces
- **`window-*`**: UI windows and dialogs
- **`timer-*`**: Timer and countdown systems
- **`stats-*`**: Statistics and analytics systems

### **3. Module Loading Optimization**
- **Essential Entry Points**: Only 4 files loaded initially by FoundryVTT
- **Sequential Loading**: Core files load in proper dependency order
- **Import Chain Management**: ES6 imports handle dependencies automatically
- **Performance Focus**: Eliminated race conditions and loading conflicts

## **Socket System Architecture**

### **SocketManager Class (NEW - FULLY FUNCTIONAL)**
**Location**: `scripts/manager-sockets.js`

#### **Design Goals**
- **Bulletproof SocketLib Integration**: Automatic detection and fallback
- **Cross-Client Communication**: Real-time synchronization
- **Professional Quality**: Enterprise-grade socket handling
- **Automatic Recovery**: Seamless fallback when needed

#### **Key Features**
- **Dual Socket Support**: SocketLib + Native Foundry fallback
- **Automatic API Detection**: Global and module scope checking
- **Idempotent Initialization**: Prevents double initialization
- **Graceful Degradation**: Works with or without SocketLib

#### **Architecture Benefits**
- **Reliability**: Multiple fallback mechanisms
- **Performance**: Optimized socket handling
- **Maintainability**: Clean, well-structured code
- **Extensibility**: Easy to add new socket features

### **Socket System Status**
- **SocketLib Integration**: ✅ **WORKING PERFECTLY**
- **Cross-Client Sync**: ✅ **FULLY FUNCTIONAL**
- **Fallback System**: ✅ **READY AS BACKUP**
- **All Features**: ✅ **OPERATIONAL**

## **File Organization and Loading**

### **Module Entry Points (FoundryVTT Loading)**
```json
"esmodules": [
    "scripts/const.js",           // Module constants
    "scripts/api-common.js",      // Global utilities
    "scripts/settings.js",        // Settings management
    "scripts/blacksmith.js"       // Main module file
]
```

### **Import Chain Management**
```
const.js → api-common.js → settings.js → blacksmith.js
    ↓           ↓            ↓           ↓
Constants → Utilities → Settings → Main Module
    ↓           ↓            ↓           ↓
All other modules imported dynamically as needed
```

### **Benefits of This Approach**
- **Eliminates Race Conditions**: Core files load in proper order
- **Prevents Startup Crashes**: Dependencies available when needed
- **Improves Performance**: Only essential files loaded initially
- **Better Error Handling**: Clear dependency chain for debugging

## **Manager Class Architecture**

### **ModuleManager**
**Purpose**: Centralized module registration and feature management
**Key Features**:
- Module registration system
- Feature availability checking
- Inter-module communication coordination

### **UtilsManager**
**Purpose**: Centralized utility function management
**Key Features**:
- Common gaming utilities
- Performance optimization functions
- Cross-module utility sharing

### **CanvasTools**
**Purpose**: Advanced canvas manipulation and layer management
**Key Features**:
- Custom canvas layers
- Advanced canvas operations
- FoundryVTT integration

### **WrapperManager**
**Purpose**: libWrapper integration and management
**Key Features**:
- FoundryVTT system modifications
- Safe wrapper management
- Performance optimization

## **Timer System Architecture**

### **Unified Timer Design**
All timer systems follow the same architectural pattern:
- **Base Timer Class**: Common functionality
- **Specialized Implementations**: Combat, Planning, Round
- **Cross-Client Sync**: Real-time synchronization
- **Socket Integration**: Seamless communication

### **Timer Features**
- **Real-Time Updates**: Synchronized across all clients
- **Multiple Display Modes**: Flexible presentation options
- **Automatic Cleanup**: Resource management
- **Error Handling**: Robust error recovery

## **Voting System Architecture**

### **VoteManager Design**
**Purpose**: In-game voting and decision making
**Key Features**:
- Real-time vote creation and management
- Cross-client vote synchronization
- Multiple vote types support
- Automatic result calculation

### **Architecture Benefits**
- **Scalable**: Handles multiple concurrent votes
- **Reliable**: Robust error handling and recovery
- **User-Friendly**: Intuitive interface design
- **Cross-Client**: Works seamlessly across all clients

## **Asset Management System Architecture (NEW)**

### **Asset Data Structure**
**Purpose**: Centralized, data-driven asset management with flexible categorization
**Key Features**:
- **Rigid Categories**: 19 predefined categories for organizational grouping
- **Flexible Tags**: Unlimited tags for functional classification and searching
- **Data-Driven**: All asset metadata stored in structured collections
- **Auto-Generation**: Constants and UI choices generated automatically

### **Category System Design**
**Rigid Categories (19 total):**

#### **File-Based Assets (13 categories - based on folder structure):**
- **Images (8):** banner, tile, background, misc, pins-map, pins-note, portraits, tokens
- **Sounds (5):** soundtrack, ambience, effects, music, one-shots

#### **Data-Based Assets (6 categories - based on asset type):**
- **Configuration:** theme, compendium, rolltable, setting, macro, journal

### **Data Structure Fields**
```javascript
{
    "name": "Human-readable display name",
    "id": "semantic-identifier",                  // Internal identifier (e.g., "theme-default")
    "value": "asset-value",                       // Asset value (e.g., CSS class, volume level)
    "constantname": "CONSTANTNAME",               // Global constant name
    "path": "modules/coffee-pub-blacksmith/...", // File path or reference
    "tags": ["tag1", "tag2", "tag3"],            // Flexible functional tags
    "type": "image|sound|theme|etc",             // Asset type
    "category": "banner|tile|background|etc"     // Rigid organizational category
}
```

### **Key Design Principles**
- **Category vs Tags**: 
  - **Category**: Rigid, organizational, one-per-asset, maps to folder structure
  - **Tags**: Flexible, functional, many-per-asset, unlimited options
- **ID vs Value vs Path**: 
  - **ID**: Internal identifier for settings and programmatic access (e.g., "theme-default")
  - **Value**: Asset value used for rendering/styling (e.g., CSS class, volume level, Font Awesome class)
  - **Path**: File system location or data reference
- **Constants**: Auto-generated from data collections for backward compatibility

### **Asset Lookup Tool**
**Purpose**: Flexible, tag-based access to all Blacksmith assets
**Key Features**:
- **Tag-Based Search**: Find assets by functional characteristics
- **Category Filtering**: Filter by rigid organizational categories
- **Constant Generation**: Auto-generate global constants
- **Backward Compatibility**: Maintain existing COFFEEPUB constant access

### **Constants Generator**
**Purpose**: Automatically generate constants and UI choices from data collections
**Key Features**:
- **Dynamic Generation**: Constants created at runtime from data
- **UI Choice Building**: Automatic dropdown and choice generation
- **Validation**: Ensure all required constants are available
- **Performance**: Efficient constant generation and caching

### **Data Collection Processor**
**Purpose**: Centralize common data processing tasks
**Key Features**:
- **Choice Building**: Convert data collections to UI choices
- **Filtering**: Apply enabled/disabled status filters
- **Sorting**: Intelligent sorting with priority items
- **Constants Management**: Update and maintain global constants

### **Architecture Benefits**
- **Maintainable**: Single source of truth for all asset metadata
- **Flexible**: Easy to add new assets and categories
- **Searchable**: Rich tagging system for asset discovery
- **Backward Compatible**: Existing code continues to work
- **Performance**: Efficient asset lookup and constant generation

## **Roll System Architecture (In Development)**

### **Unified Roll Design**
**Purpose**: Single source of truth for all roll functionality
**Key Features**:
- 4-function architecture (request, orchestrate, process, deliver)
- Window and Cinema mode support
- Cross-client roll synchronization
- Advanced roll result handling

### **Architecture Benefits**
- **Consistent**: Same logic for all roll types
- **Maintainable**: Single codebase for roll functionality
- **Extensible**: Easy to add new roll types
- **Cross-Client**: Real-time roll synchronization

## **API Design Principles**

### **1. Consistent Interface Design**
- **Method Naming**: Clear, descriptive method names
- **Parameter Structure**: Consistent parameter patterns
- **Return Values**: Predictable return value formats
- **Error Handling**: Comprehensive error handling

### **2. External Module Integration**
- **Easy Registration**: Simple module registration process
- **Feature Discovery**: Automatic feature availability checking
- **Utility Access**: Comprehensive utility function access
- **Event System**: Real-time event coordination

### **3. Performance Considerations**
- **Lazy Loading**: Load features only when needed
- **Caching**: Intelligent caching for frequently used data
- **Resource Management**: Proper cleanup and resource management
- **Optimization**: Performance-focused implementation

## **Error Handling and Recovery**

### **1. Graceful Degradation**
- **Feature Fallbacks**: Alternative implementations when possible
- **Error Recovery**: Automatic recovery from common errors
- **User Feedback**: Clear error messages and status updates
- **Logging**: Comprehensive error logging for debugging

### **2. Robust Socket Handling**
- **Connection Recovery**: Automatic reconnection attempts
- **Fallback Systems**: Native socket fallback when needed
- **Error Isolation**: Socket errors don't crash other features
- **Status Monitoring**: Continuous system health monitoring

## **Performance Optimization**

### **1. Loading Optimization**
- **Minimal Entry Points**: Only essential files loaded initially
- **Dynamic Imports**: Load features only when needed
- **Dependency Management**: Efficient dependency resolution
- **Resource Cleanup**: Proper resource management

### **2. Runtime Optimization**
- **Caching Strategies**: Intelligent data caching
- **Event Optimization**: Efficient event handling
- **Memory Management**: Proper memory cleanup
- **Performance Monitoring**: Continuous performance tracking

## **Security and Safety**

### **1. Input Validation**
- **Parameter Checking**: Validate all input parameters
- **Type Safety**: Ensure proper data types
- **Boundary Checking**: Validate data boundaries
- **Sanitization**: Clean user input data

### **2. Permission Handling**
- **User Permissions**: Respect FoundryVTT user permissions
- **GM-Only Features**: Proper GM restriction enforcement
- **Player Safety**: Prevent unauthorized access to player data
- **System Protection**: Protect against malicious input

## **Testing and Quality Assurance**

### **1. Testing Strategy**
- **Unit Testing**: Individual component testing
- **Integration Testing**: Component interaction testing
- **Cross-Client Testing**: Multi-client functionality testing
- **Performance Testing**: Load and stress testing

### **2. Quality Metrics**
- **Code Coverage**: Comprehensive code coverage
- **Performance Benchmarks**: Performance measurement
- **Error Rates**: Error frequency monitoring
- **User Satisfaction**: User feedback and ratings

## **Future Architecture Plans**

### **1. Asset Management System Completion**
- **19 Categories**: **IN PROGRESS** - Basic structure defined, implementation ongoing
- **Data Migration**: **MAJOR PROGRESS** - Core assets migrated (sounds, volumes, themes, backgrounds, icons)
- **Data Structure**: **COMPLETED** - New `id`/`value`/`path` separation implemented
- **Asset Lookup**: **COMPLETED** - Full tag-based search and filtering capabilities
- **Auto-Scanning**: **PLANNED** - Automatic folder change detection and updates

### **2. Roll System Completion**
- **Unified Architecture**: Complete 4-function roll system
- **Advanced Roll Types**: Comprehensive roll type support
- **Result Processing**: Advanced roll result handling
- **Cross-Client Sync**: Real-time roll synchronization

### **3. Additional Game Systems**
- **System Support**: Support for additional RPG systems
- **Modular Design**: Easy system integration
- **Customization**: Flexible system customization
- **Performance**: Optimized for all supported systems

### **4. Advanced Analytics**
- **Enhanced Statistics**: More comprehensive data collection
- **Data Export**: Advanced data export capabilities
- **Performance Metrics**: Detailed performance analysis
- **User Insights**: User behavior and preference analysis

## **Conclusion**

The Coffee Pub Blacksmith module now features a **robust, enterprise-grade architecture** that provides:

- **✅ Reliable Performance**: Optimized loading and execution
- **✅ Scalable Design**: Easy to extend and maintain
- **✅ Professional Quality**: Production-ready codebase
- **✅ Cross-Client Communication**: Real-time synchronization
- **✅ Comprehensive APIs**: Easy integration for other modules
- **🚧 Asset Management**: New data-driven system partially completed (data structure refactored)

**The architecture is now production-ready and provides a solid foundation for continued development and feature expansion.** 🚀

---

**Last Updated**: Current session - Asset Management System architecture defined
**Status**: Production ready + Asset Management System in development
**Next Milestone**: Asset Management System implementation (19 categories)
