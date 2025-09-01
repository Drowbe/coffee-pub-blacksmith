// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 
import { MODULE } from './const.js';
import * as GlobalUtils from './api-common.js';
import { postConsoleAndNotification } from './api-common.js';

export class UtilsManager {
    static isInitialized = false;
    static API_VERSION = MODULE.APIVERSION;

    static initialize() {

        this.isInitialized = true;
    }

    static checkInitialized() {
        if (!this.isInitialized) {
            throw new Error(`${MODULE.TITLE} | UtilsManager not initialized`);
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
    static postConsoleAndNotification(strModuleID = "BLACKSMITH", message, result = "", blnDebug = false, blnNotification = false) {
        this.checkInitialized();
        return GlobalUtils.postConsoleAndNotification(strModuleID, message, result, blnDebug, blnNotification);
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

    // Safe Settings Access
    static getSettingSafely(moduleId, settingKey, defaultValue = null) {
        this.checkInitialized();
        return GlobalUtils.getSettingSafely(moduleId, settingKey, defaultValue);
    }

    static setSettingSafely(moduleId, settingKey, value) {
        this.checkInitialized();
        return GlobalUtils.setSettingSafely(moduleId, settingKey, value);
    }

    // Missing functions that Scribe and other modules need:
    static getTokenId(tokenName) {
        this.checkInitialized();
        return GlobalUtils.getTokenId(tokenName);
    }

    static objectToString(obj) {
        this.checkInitialized();
        return GlobalUtils.objectToString(obj);
    }

    static stringToObject(str) {
        this.checkInitialized();
        return GlobalUtils.stringToObject(str);
    }

    static convertSecondsToRounds(numSeconds) {
        this.checkInitialized();
        return GlobalUtils.convertSecondsToRounds(numSeconds);
    }

    static async rollCoffeePubDice(roll = null) {
        this.checkInitialized();
        return GlobalUtils.rollCoffeePubDice(roll);
    }

    static resetModuleSettings(moduleId) {
        this.checkInitialized();
        return GlobalUtils.resetModuleSettings(moduleId);
    }

    static async getOpenAIReplyAsHtml(query) {
        this.checkInitialized();
        return GlobalUtils.getOpenAIReplyAsHtml(query);
    }

    static isPlayerCharacter(entity) {
        this.checkInitialized();
        return GlobalUtils.isPlayerCharacter(entity);
    }

    // Get all utilities as an object
    static getUtils(requiredVersion = this.API_VERSION) {
        this.checkInitialized();
        
        if (!this.checkVersion(requiredVersion)) {
            throw new Error(`${MODULE.TITLE} | API version mismatch. Required: ${requiredVersion}, Current: ${this.API_VERSION}`);
        }

        return {
            postConsoleAndNotification: (strModuleID = "BLACKSMITH", message, result = "", blnDebug = false, blnNotification = false) => 
                this.postConsoleAndNotification(strModuleID, message, result, blnDebug, blnNotification),
            formatTime: this.formatTime.bind(this),
            generateFormattedDate: this.generateFormattedDate.bind(this),
            trimString: this.trimString.bind(this),
            toSentenceCase: this.toSentenceCase.bind(this),
            getActorId: this.getActorId.bind(this),
            getTokenImage: this.getTokenImage.bind(this),
            getPortraitImage: this.getPortraitImage.bind(this),
            playSound: this.playSound.bind(this),
            // Safe Settings Access
            getSettingSafely: this.getSettingSafely.bind(this),
            setSettingSafely: this.setSettingSafely.bind(this),
            
            // Missing functions that Scribe and other modules need:
            getTokenId: GlobalUtils.getTokenId.bind(GlobalUtils),
            objectToString: GlobalUtils.objectToString.bind(GlobalUtils),
            stringToObject: GlobalUtils.stringToObject.bind(GlobalUtils),
            convertSecondsToRounds: GlobalUtils.convertSecondsToRounds.bind(GlobalUtils),
            rollCoffeePubDice: GlobalUtils.rollCoffeePubDice.bind(GlobalUtils),
            resetModuleSettings: GlobalUtils.resetModuleSettings.bind(GlobalUtils),
            getOpenAIReplyAsHtml: this.getOpenAIReplyAsHtml.bind(this),
            isPlayerCharacter: this.isPlayerCharacter.bind(this)
        };
    }
} 