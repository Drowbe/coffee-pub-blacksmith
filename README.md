# Coffee Pub Blacksmith

A comprehensive FoundryVTT module providing quality of life improvements, aesthetic enhancements, and advanced gaming tools with **enterprise-grade cross-client communication**.

## **🚀 Current Status: FULLY OPERATIONAL**

### **✅ Socket System: PRODUCTION READY**
- **SocketLib Integration**: ✅ **WORKING PERFECTLY**
- **Cross-Client Communication**: ✅ **FULLY FUNCTIONAL**
- **Real-Time Synchronization**: ✅ **ALL FEATURES**
- **Professional Multiplayer Experience**: ✅ **ACHIEVED**

### **✅ Core Features: FULLY FUNCTIONAL**
- **Timer System**: Combat, Planning, and Round timers with cross-client sync
- **Voting System**: Real-time voting with instant results across all clients
- **Module Management**: Centralized module registration and feature management
- **Canvas Tools**: Advanced canvas manipulation and custom layers
- **Statistics Tracking**: Combat and player performance analytics

## **🔧 Recent Major Updates**

### **Socket System Overhaul (COMPLETED)**
- **SocketLib Integration**: Now working perfectly with automatic API detection
- **Cross-Client Communication**: All features now sync in real-time across clients
- **Automatic Fallback**: Native Foundry socket system as backup
- **Professional Quality**: Enterprise-grade socket communication

### **File Organization (COMPLETED)**
- **Consistent Naming**: `manager-*`, `api-*`, `timer-*` pattern
- **Improved Loading**: Better module organization and performance
- **Clean Architecture**: Maintainable and extensible codebase

### **Roll System Development (READY TO CONTINUE)**
- **Socket Issues Resolved**: Development can now proceed unblocked
- **Unified Architecture**: Planned 4-function roll system
- **Window & Cinema Modes**: Both UI presentation methods planned

## **🌟 Key Features**

### **Real-Time Multiplayer Tools**
- **Combat Timers**: Synchronized countdowns across all clients
- **Planning Timers**: Session preparation timing for everyone
- **Voting System**: Instant results visible to all players
- **Cross-Client Sync**: Professional gaming experience

### **Advanced Canvas Management**
- **Custom Layers**: Blacksmith utilities layer
- **Canvas Tools**: Advanced manipulation and management
- **Layer Integration**: Seamless FoundryVTT integration

### **Module Integration System**
- **Centralized Registration**: Easy integration for other modules
- **Feature Management**: Comprehensive module coordination
- **API Access**: Public interfaces for external modules

### **Statistics and Analytics**
- **Combat Tracking**: Detailed encounter analysis
- **Player Performance**: Individual and group statistics
- **Data Export**: Comprehensive reporting capabilities

## **📋 Requirements**

- **FoundryVTT**: Version 12.x (verified compatible)
- **Game System**: D&D5e (fully supported)
- **SocketLib**: **REQUIRED** - now working perfectly
- **libWrapper**: Supported (optional)

## **🚀 Installation**

1. **Install SocketLib** (required dependency):
   - FoundryVTT Admin Panel → Install Module
   - Manifest URL: `https://github.com/farling42/foundryvtt-socketlib/releases/latest/download/module.json`

2. **Install Coffee Pub Blacksmith**:
   - FoundryVTT Admin Panel → Install Module
   - Manifest URL: `https://github.com/Drowbe/coffee-pub-blacksmith/releases/latest/download/module.json`

3. **Enable Both Modules** in your world

## **🔧 Configuration**

### **Socket System**
- **Automatic**: SocketLib detection and integration
- **Fallback**: Native Foundry sockets if needed
- **Cross-Client**: All features sync automatically

### **Timer Settings**
- **Combat Timers**: Customizable countdown displays
- **Planning Timers**: Session preparation tools
- **Round Timers**: Tactical encounter timing

### **UI Customization**
- **Console Styling**: Multiple debug output styles
- **Chat Appearance**: Customizable message formatting
- **Window Themes**: Multiple visual themes available

## **📚 API Documentation**

### **For Developers**
- **Module Registration**: Easy integration with Blacksmith
- **Utility Functions**: Access to common gaming utilities
- **Socket Communication**: Cross-client messaging system
- **Statistics API**: Performance tracking and analytics

### **Integration Example**
```javascript
// Access the Blacksmith API
const blacksmith = game.modules.get('coffee-pub-blacksmith').api;

// Register your module
blacksmith.registerModule('your-module-id', ['feature1', 'feature2']);

// Use Blacksmith utilities
const utils = blacksmith.utils;
```

## **🔄 Development Status**

### **Completed Features**
- ✅ **Socket System**: Production ready with SocketLib
- ✅ **Timer System**: All timer types fully functional
- ✅ **Voting System**: Real-time cross-client voting
- ✅ **Module Management**: Centralized system operational
- ✅ **Canvas Tools**: Advanced canvas manipulation
- ✅ **Statistics API**: Comprehensive tracking system

### **In Development**
- 🚧 **Roll System**: Unified dice rolling architecture
- 🚧 **Window Modes**: Multiple UI presentation options
- 🚧 **Cinema Mode**: Cinematic roll display system

### **Planned Features**
- 📋 **Advanced Roll Types**: Skill, ability, save, tool checks
- 📋 **Roll Result Handling**: Comprehensive result processing
- 📋 **Cross-Client Roll Sync**: Real-time roll synchronization

## **🐛 Known Issues**

### **Resolved Issues**
- ✅ **Socket Communication**: SocketLib now working perfectly
- ✅ **Cross-Client Sync**: All features sync across clients
- ✅ **Module Loading**: Consistent and reliable loading
- ✅ **File Organization**: Clean and maintainable structure

### **Current Status**
- **No Known Issues**: All major problems resolved
- **Production Ready**: Socket system fully operational
- **Development Unblocked**: Roll system development can continue

## **🤝 Contributing**

### **Development Setup**
1. **Clone the repository**
2. **Install dependencies** (if any)
3. **Follow coding standards** (manager-*, api-* naming)
4. **Test thoroughly** before submitting

### **Code Standards**
- **File Naming**: Use consistent `manager-*`, `api-*` patterns
- **Socket Integration**: Leverage the working socket system
- **Cross-Client**: Ensure features work across all clients
- **Error Handling**: Robust error handling and fallbacks

## **📞 Support**

### **Documentation**
- **API Documentation**: `BLACKSMITH-API.md`
- **Architecture Guide**: `BLACKSMITH-ARCHITECTURE.md`
- **Roll System Plan**: `ROLL-MIGRATION-PLAN.md`

### **Issues and Questions**
- **GitHub Issues**: Report bugs and request features
- **Discord**: Join our community for support
- **Documentation**: Comprehensive guides and examples

## **🎯 Roadmap**

### **Immediate (Next 2-4 weeks)**
- **Roll System Development**: Complete unified roll architecture
- **Window Mode Implementation**: Roll configuration interface
- **Cinema Mode Development**: Cinematic roll display

### **Short Term (1-2 months)**
- **Advanced Roll Types**: Comprehensive roll system
- **Result Processing**: Advanced roll result handling
- **Performance Optimization**: Enhanced efficiency

### **Long Term (3+ months)**
- **Additional Game Systems**: Support for other RPG systems
- **Advanced Analytics**: Enhanced statistics and reporting
- **Module Ecosystem**: Expanded third-party integrations

---

**Last Updated**: Current session - Socket system fully functional
**Status**: Production ready with SocketLib integration
**Next Milestone**: Roll system development completion

---

*Coffee Pub Blacksmith - Professional gaming tools for FoundryVTT*

