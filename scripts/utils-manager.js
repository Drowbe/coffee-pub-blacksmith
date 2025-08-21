// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 
import { MODULE, MODULE_ID, MODULE_TITLE, API_VERSION } from './const.js';
import * as GlobalUtils from './global.js';
import { postConsoleAndNotification } from './global.js';

export class UtilsManager {
    static isInitialized = false;
    static API_VERSION = API_VERSION;

    static initialize() {

        this.isInitialized = true;
    }

    static checkInitialized() {
        if (!this.isInitialized) {
            throw new Error(`${MODULE_TITLE} | UtilsManager not initialized`);
        }
    }

    static checkVersion(requiredVersion) {
        const current = this.API_VERSION.split('.').map(n => parseInt(n));
        const required = requiredVersion.split('.').map(n => parseInt(n));
        
        for (let i = 0; i < 3; i++) {
            if (current[i] > required[i]) return true;
            if (current[i] < required[i]) return false;
        }
        return true;
    }

    // Console and Notifications
    static postConsoleAndNotification(strModuleTitle = "BLACKSMITH", message, result = "", blnDebug = false, blnNotification = false) {
        this.checkInitialized();
        return GlobalUtils.postConsoleAndNotification(strModuleTitle, message, result, blnDebug, blnNotification);
    }

    // Time and Formatting
    static formatTime(ms, format = "colon") {
        this.checkInitialized();
        return GlobalUtils.formatTime(ms, format);
    }

    static generateFormattedDate(format) {
        this.checkInitialized();
        return GlobalUtils.generateFormattedDate(format);
    }

    // String Manipulation
    static trimString(str, maxLength) {
        this.checkInitialized();
        return GlobalUtils.trimString(str, maxLength);
    }

    static toSentenceCase(str) {
        this.checkInitialized();
        return GlobalUtils.toSentenceCase(str);
    }

    // Game Entity Helpers
    static getActorId(actorName) {
        this.checkInitialized();
        return GlobalUtils.getActorId(actorName);
    }

    static getTokenImage(tokenDoc) {
        this.checkInitialized();
        return GlobalUtils.getTokenImage(tokenDoc);
    }

    static getPortraitImage(actor) {
        this.checkInitialized();
        return GlobalUtils.getPortraitImage(actor);
    }

    // Sound Management
    static async playSound(sound = 'sound', volume = 0.7, loop = false, broadcast = true) {
        this.checkInitialized();
        return GlobalUtils.playSound(sound, volume, loop, broadcast);
    }

    // Get all utilities as an object
    static getUtils(requiredVersion = API_VERSION) {
        this.checkInitialized();
        
        if (!this.checkVersion(requiredVersion)) {
            throw new Error(`${MODULE_TITLE} | API version mismatch. Required: ${requiredVersion}, Current: ${this.API_VERSION}`);
        }

        return {
            postConsoleAndNotification: (strModuleTitle = "BLACKSMITH", message, result = "", blnDebug = false, blnNotification = false) => 
                this.postConsoleAndNotification(strModuleTitle, message, result, blnDebug, blnNotification),
            formatTime: this.formatTime.bind(this),
            generateFormattedDate: this.generateFormattedDate.bind(this),
            trimString: this.trimString.bind(this),
            toSentenceCase: this.toSentenceCase.bind(this),
            getActorId: this.getActorId.bind(this),
            getTokenImage: this.getTokenImage.bind(this),
            getPortraitImage: this.getPortraitImage.bind(this),
            playSound: this.playSound.bind(this)
        };
    }
} 