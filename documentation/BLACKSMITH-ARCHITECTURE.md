# BLACKSMITH ARCHITECTURE DOCUMENTATION

## **Overview**
This document outlines the technical architecture and design decisions for the Coffee Pub Blacksmith module. The module has undergone significant architectural improvements and now features a robust, enterprise-grade socket communication system.

## **Current Status: PRODUCTION READY**

### **✅ Major Achievements:**
- **Socket System**: Fully operational with SocketLib integration
- **Cross-Client Communication**: All features sync in real-time
- **File Organization**: Consistent naming and loading patterns
- **Module Architecture**: Clean, maintainable, and extensible

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

### **1. Roll System Completion**
- **Unified Architecture**: Complete 4-function roll system
- **Advanced Roll Types**: Comprehensive roll type support
- **Result Processing**: Advanced roll result handling
- **Cross-Client Sync**: Real-time roll synchronization

### **2. Additional Game Systems**
- **System Support**: Support for additional RPG systems
- **Modular Design**: Easy system integration
- **Customization**: Flexible system customization
- **Performance**: Optimized for all supported systems

### **3. Advanced Analytics**
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

**The architecture is now production-ready and provides a solid foundation for continued development and feature expansion.** 🚀

---

**Last Updated**: Current session - Socket system fully functional
**Status**: Production ready with enterprise-grade architecture
**Next Milestone**: Roll system development completion
