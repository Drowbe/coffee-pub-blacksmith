// ================================================================== 
// ===== IMPORTS ====================================================
// ================================================================== 

import { BLACKSMITH, MODULE_ID, MODULE_TITLE } from './const.js'
import { COFFEEPUB, postConsoleAndNotification, playSound, trimString } from './global.js';

// ================================================================== 
// ===== REGISTER TEMPLATE PARTIALS =================================
// ================================================================== 

document.addEventListener('DOMContentLoaded', () => {
    // Register partials and render templates
    const registerPartialsAndRender = async () => {
        try {
            // PARTIAL TEMPLATES
            const dashboardCharacterTemplate = await fetch('modules/coffee-pub-blacksmith/templates/window-dashboard-character.hbs').then(response => response.text());
            Handlebars.registerPartial('window-dashboard-character', dashboardCharacterTemplate);  

        } catch (error) {
            console.error('Error loading partial templates:', error);
        }
    };

    // Call the function to register partials and render templates
    registerPartialsAndRender();
    postConsoleAndNotification("Called registerPartialsAndRender", "", false, true, false);
});

// ================================================================== 
// ===== CLASS DEFINITION ===========================================
// ================================================================== 

export class BlacksmithWindowDashboard extends FormApplication {
    constructor(options = {}) {
        super(options);
        this.leftGrid = { rows: 3, columns: 5 };
        this.rightGrid = { rows: 3, columns: 5 };
    }

    static get defaultOptions() {
        const defaults = super.defaultOptions;
        const overrides = {
            width: 760, 
            height: 'auto',
            id: MODULE_ID + "-dashboard",
            template: BLACKSMITH.WINDOW_DASHBOARD,
            title: BLACKSMITH.WINDOW_DASHBOARD_TITLE,
            resizable: false,
            classes: ["blacksmith-dashboard-window"],
        };
        const mergedOptions = foundry.utils.mergeObject(defaults, overrides);

        // Load position from localStorage
        const savedPosition = JSON.parse(localStorage.getItem(MODULE_ID + "-dashboardWindowPosition"));
        if (savedPosition) {
            mergedOptions.top = savedPosition.top;
            mergedOptions.left = savedPosition.left;
        }

        return mergedOptions;
    }

    static instance = null;

    static getInstance() {
        if (!this.instance) {
            this.instance = new BlacksmithWindowDashboard();
        }
        return this.instance;
    }

    toggleVisibility() {
        if (this.element.is(":visible")) {
            this.close();
        } else {
            this.render(true);
        }
    }

    getData(options) {
        return {
            ...super.getData(options),
            leftGrid: this.leftGrid,
            rightGrid: this.rightGrid
        };
    }

    setGridDimensions(container, rows, columns) {
        if (container === 'left') {
            this.leftGrid = { rows, columns };
        } else if (container === 'right') {
            this.rightGrid = { rows, columns };
        }
        this.render(false);
    }

    async activateListeners(html) {
        super.activateListeners(html); // Call the parent class's activateListeners

        // Call buildCharacterCard when the window is opened
        await buildCharacterCard(); // Call the function to build and render the character card
    }

    setPosition(options={}) {
        if (!foundry.utils.isEmpty(options)) {
            super.setPosition(options);
        } else {
            const position = this.constructor.defaultOptions;
            if (position.left && position.top) {
                super.setPosition({left: position.left, top: position.top});
            }
        }
        // Remove this line to prevent auto-sizing
        // this.element.css({width: 'auto', height: 'auto'});
    }

    async _onRenderWindow() {
        // Call buildCharacterCard when the window is opened
        postConsoleAndNotification("BLACKSMITH _onRenderWindow rendering window and calling buildCharacterCard", "", false, true, false);

        await buildCharacterCard(); // Call the function to build and render the character card
    }
}

// ================================================================== 
// ===== HOOKS ======================================================
// ================================================================== 

// Call the function to set up the token click listener after the canvas is ready
Hooks.on('canvasReady', () => {

});

// ================================================================== 
// ===== FUNCTIONS ==================================================
// ================================================================== 

async function buildCharacterCard() {
    postConsoleAndNotification("BLACKSMITH buildCharacterCard Building character card", "", false, true, false);

    // Set all variables to "value" using let
    let turnCardStyle = "cardsdark";
    let actorId = "fDrM6DQhcSLR1OgD"; // actor.id
    let userId = "Z0dDQSgJhztlL1Nx"; // user.id
    let tokenId = "qymX2pinGmM0YnSO"; // token.id
    let label = "Favia Gitta";
    let portrait = "assets/images/portraits/campaigns/favia.webp";
    let tokenBackground = "cobblestone";
    let tokenScale = "100";
    let isNPC = false;
    let bloodyPortraitNumber = "80";
    let isDead = false;
    let attributeHP = "15 - Critical";
    let attributehpprogress = "20";
    let isHealthy = false;
    let isHurt = false;
    let isDying = false;
    let isCritical = true;
    let isDeathSaving = false;
    let attributeDEATHSUCCESSdot1 = "off";
    let attributeDEATHSUCCESSdot2 = "off";
    let attributeDEATHSUCCESSdot3 = "off";
    let attributeDEATHFAILUREdot1 = "off";
    let attributeDEATHFAILUREdot2 = "off";
    let attributeDEATHFAILUREdot3 = "off";
    let player = "Alicia Panicucci";
    let abilitySTR = "12";
    let abilityDEX = "14";
    let abilityCON = "8";
    let abilityINT = "16";
    let abilityWIS = "10";
    let abilityCHA = "4";


    // Return an object with the character data
    const CARDDATA ={
        turnCardStyle,
        actorId,
        userId,
        tokenId,
        label,
        portrait,
        tokenBackground,
        tokenScale,
        isNPC,
        bloodyPortraitNumber,
        isDead,
        attributeHP,
        attributehpprogress,
        isHealthy,
        isHurt,
        isDying,
        isCritical,
        isDeathSaving,
        attributeDEATHSUCCESSdot1,
        attributeDEATHSUCCESSdot2,
        attributeDEATHSUCCESSdot3,
        attributeDEATHFAILUREdot1,
        attributeDEATHFAILUREdot2,
        attributeDEATHFAILUREdot3,
        player,
        abilitySTR,
        abilityDEX,
        abilityCON,
        abilityINT,
        abilityWIS,
        abilityCHA
    };
    const templatePath = "modules/coffee-pub-blacksmith/templates/window-dashboard-character.hbs";
    const response = await fetch(templatePath);
    const templateText = await response.text();
    const template = Handlebars.compile(templateText);
    var compiledHtml = "";
    // Play the Sound
    //playSound(strSound,strVolume);
    // POST DEBUG
    //postConsoleAndNotification("CARDDATA.content" , CARDDATA.content, false, true, true);
    // Return the template
    compiledHtml = template(CARDDATA);
    postConsoleAndNotification("buildCharacterCard compiledHtml", compiledHtml, false, true, false);
    document.getElementById('blacksmith-dashboard-container').innerHTML = compiledHtml;
}