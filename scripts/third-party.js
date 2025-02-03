// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 
import { MODULE_ID } from './const.js';
import { postConsoleAndNotification } from './global.js';
import { CombatTimer } from './combat-timer.js';
import { PlanningTimer } from './planning-timer.js';
import { ChatPanel } from './chat-panel.js';

class ThirdPartyManager {
    static socket = null;
    static isInitialized = false;
    static isSocketReady = false;

    static initialize() {
        postConsoleAndNotification("Third Party Manager | Initializing", "", false, true, false);
        
        // Move socket initialization to socketlib.ready hook
        Hooks.once('socketlib.ready', () => {
            postConsoleAndNotification("Third Party Manager | Setting up socketlib", "", false, true, false);
            this.socket = socketlib.registerModule(MODULE_ID);
            this.registerSocketFunctions();
            this.isInitialized = true;
            this.isSocketReady = true;
            
            // Emit our own ready event for other modules to use
            Hooks.callAll('blacksmith.socketReady');
            postConsoleAndNotification("Third Party Manager | Socket Ready", "", false, true, false);
        });
    }

    static registerSocketFunctions() {
        postConsoleAndNotification("Third Party Manager | Registering socket functions", "", false, true, false);
        
        // Combat Timer
        this.socket.register("syncTimerState", CombatTimer.receiveTimerSync);
        this.socket.register("combatTimerAdjusted", CombatTimer.timerAdjusted);
        
        // Planning Timer
        this.socket.register("syncPlanningTimerState", PlanningTimer.receiveTimerSync);
        this.socket.register("planningTimerAdjusted", PlanningTimer.timerAdjusted);
        this.socket.register("timerCleanup", PlanningTimer.timerCleanup);
        
        // Chat Panel
        this.socket.register("updateLeader", ChatPanel.receiveLeaderUpdate);
        this.socket.register("updateTimer", ChatPanel.receiveTimerUpdate);
    }

    static getSocket() {
        if (!this.isSocketReady) {
            postConsoleAndNotification("Third Party Manager | Error: Socket not ready", "", true, true, false);
            return null;
        }
        return this.socket;
    }

    static async waitForReady() {
        if (this.isSocketReady) return true;
        
        return new Promise((resolve) => {
            Hooks.once('blacksmith.socketReady', () => {
                resolve(true);
            });
        });
    }
}

// Initialize on Foundry load
Hooks.once('init', () => {
    ThirdPartyManager.initialize();
});

export { ThirdPartyManager }; 