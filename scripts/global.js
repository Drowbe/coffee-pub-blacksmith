// ================================================================== 
// ===== GLOBAL =====================================================
// ================================================================== 
// Put any functions or reusable code here for use in ALL modules.
// This code should be identical in every COFFEEPUB module.
//
// If you need to share code withing THIS module, it should go in
// the "common.js" file.
// ================================================================== 

// ================================================================== 
// ===== VARIABLE EXPORTS ===========================================
// ================================================================== 

// CORE CONSTANTS
export const MODULE_AUTHOR = 'COFFEE PUB'

// ================================================================== 
// ===== SAFE SETTINGS ACCESS =======================================
// ================================================================== 

/**
 * Safely get a setting value, returning a default if the setting isn't registered yet
 * @param {string} moduleId - The module ID
 * @param {string} settingKey - The setting key
 * @param {*} defaultValue - Default value to return if setting isn't ready
 * @returns {*} The setting value or default
 */
export function getSettingSafely(moduleId, settingKey, defaultValue = null) {
    if (!game?.settings?.settings?.has(`${moduleId}.${settingKey}`)) {
        return defaultValue;
    }
    return game.settings.get(moduleId, settingKey);
}

/**
 * Safely set a setting value, only if the setting is registered
 * @param {string} moduleId - The module ID
 * @param {string} settingKey - The setting key
 * @param {*} value - The value to set
 * @returns {Promise<boolean>} True if successful, false if setting not ready
 */
export async function setSettingSafely(moduleId, settingKey, value) {
    if (!game?.settings?.settings?.has(`${moduleId}.${settingKey}`)) {
        return false;
    }
    try {
        await game.settings.set(moduleId, settingKey, value);
        return true;
    } catch (error) {
        return false;
    }
}
// GLOBAL VARS
export const COFFEEPUB = {
    // SHARED MODULE VARIABLES
    blnDebugOn: false, // Display debug bessages
    blnFancyConsole: false, // Display Colorful Console
    strConsoleDebugStyle: "simple", // Display colors but not boxes
    strDEFAULTCARDTHEME: "cardsdefault", // Default Card Theme

    arrTHEMECHOICES: [], // Theme list for drop downs
    arrMACROCHOICES: [], // Macro list for drop downs
    arrTABLECHOICES: [], // Table list for drop downs
    arrCOMPENDIUMCHOICES: [], // Compendium list for drop downs
    arrBACKGROUNDIMAGECHOICES: [], // Background Image list for drop downs
    arrICONCHOICES: [], // Icon list for drop downs
    arrSOUNDCHOICES: [], // Sound list for drop downs

    strDEFAULTSOUNDFILE: "modules/coffee-pub-blacksmith/sounds/interface-open-01.mp3",
    strDEFAULTSOUNDVOLUME: "0.7",

    SOUNDVOLUMELOUD: "0.8",
    SOUNDVOLUMENORMAL: "0.5",
    SOUNDVOLUMESOFT: "0.3",

    SOUNDERROR01: "modules/coffee-pub-blacksmith/sounds/interface-error-01.mp3",
    SOUNDERROR02: "modules/coffee-pub-blacksmith/sounds/interface-error-02.mp3",
    SOUNDERROR03: "modules/coffee-pub-blacksmith/sounds/interface-error-03.mp3",
    SOUNDERROR04: "modules/coffee-pub-blacksmith/sounds/interface-error-04.mp3",
    SOUNDERROR05: "modules/coffee-pub-blacksmith/sounds/interface-error-05.mp3",
    SOUNDERROR06: "modules/coffee-pub-blacksmith/sounds/interface-error-06.mp3",
    SOUNDERROR07: "modules/coffee-pub-blacksmith/sounds/interface-error-07.mp3",
    SOUNDERROR08: "modules/coffee-pub-blacksmith/sounds/interface-error-08.mp3",
    SOUNDERROR09: "modules/coffee-pub-blacksmith/sounds/interface-error-09.mp3",
    SOUNDERROR10: "modules/coffee-pub-blacksmith/sounds/interface-error-10.mp3",
    SOUNDERROR11: "modules/coffee-pub-blacksmith/sounds/interface-error-11.mp3",

    SOUNDNOTIFICATION01: "modules/coffee-pub-blacksmith/sounds/interface-notification-01.mp3",
    SOUNDNOTIFICATION02: "modules/coffee-pub-blacksmith/sounds/interface-notification-02.mp3",
    SOUNDNOTIFICATION03: "modules/coffee-pub-blacksmith/sounds/interface-notification-03.mp3",
    SOUNDNOTIFICATION04: "modules/coffee-pub-blacksmith/sounds/interface-notification-04.mp3",
    SOUNDNOTIFICATION05: "modules/coffee-pub-blacksmith/sounds/interface-notification-05.mp3",
    SOUNDNOTIFICATION06: "modules/coffee-pub-blacksmith/sounds/interface-notification-06.mp3",
    SOUNDNOTIFICATION07: "modules/coffee-pub-blacksmith/sounds/interface-notification-07.mp3",
    SOUNDNOTIFICATION08: "modules/coffee-pub-blacksmith/sounds/interface-notification-08.mp3",
    SOUNDNOTIFICATION09: "modules/coffee-pub-blacksmith/sounds/interface-notification-09.mp3",
    SOUNDNOTIFICATION10: "modules/coffee-pub-blacksmith/sounds/interface-notification-10.mp3",
    SOUNDNOTIFICATION11: "modules/coffee-pub-blacksmith/sounds/interface-notification-11.mp3",
    SOUNDNOTIFICATION12: "modules/coffee-pub-blacksmith/sounds/interface-notification-12.mp3",
    SOUNDNOTIFICATION13: "modules/coffee-pub-blacksmith/sounds/interface-notification-13.mp3",
    SOUNDNOTIFICATION14: "modules/coffee-pub-blacksmith/sounds/interface-notification-14.mp3",
    SOUNDNOTIFICATION15: "modules/coffee-pub-blacksmith/sounds/interface-notification-15.mp3",

    SOUNDBUTTON01: "modules/coffee-pub-blacksmith/sounds/interface-button-01.mp3",
    SOUNDBUTTON02: "modules/coffee-pub-blacksmith/sounds/interface-button-02.mp3",
    SOUNDBUTTON03: "modules/coffee-pub-blacksmith/sounds/interface-button-03.mp3",   
    SOUNDBUTTON04: "modules/coffee-pub-blacksmith/sounds/interface-button-04.mp3",
    SOUNDBUTTON05: "modules/coffee-pub-blacksmith/sounds/interface-button-05.mp3",
    SOUNDBUTTON06: "modules/coffee-pub-blacksmith/sounds/interface-button-06.mp3",
    SOUNDBUTTON07: "modules/coffee-pub-blacksmith/sounds/interface-button-07.mp3",
    SOUNDBUTTON08: "modules/coffee-pub-blacksmith/sounds/interface-button-08.mp3",
    SOUNDBUTTON09: "modules/coffee-pub-blacksmith/sounds/interface-button-09.mp3",
    SOUNDBUTTON10: "modules/coffee-pub-blacksmith/sounds/interface-button-10.mp3",
    SOUNDBUTTON11: "modules/coffee-pub-blacksmith/sounds/interface-button-11.mp3",
    SOUNDBUTTON12: "modules/coffee-pub-blacksmith/sounds/interface-button-12.mp3",

    SOUNDPOP01: "modules/coffee-pub-blacksmith/sounds/interface-pop-01.mp3",
    SOUNDPOP02: "modules/coffee-pub-blacksmith/sounds/interface-pop-02.mp3",
    SOUNDPOP03: "modules/coffee-pub-blacksmith/sounds/interface-pop-03.mp3",

    SOUNDEFFECTBOOK01: "modules/coffee-pub-blacksmith/sounds/book-flip-01.mp3",
    SOUNDEFFECTBOOK02: "modules/coffee-pub-blacksmith/sounds/book-flip-02.mp3",
    SOUNDEFFECTBOOK03: "modules/coffee-pub-blacksmith/sounds/book-open-02.mp3",
    SOUNDEFFECTBOOK04: "modules/coffee-pub-blacksmith/sounds/book-take-01.mp3",

    SOUNDEFFECTCHEST01: "modules/coffee-pub-blacksmith/sounds/chest-open.mp3",
    SOUNDEFFECTCHEST02: "modules/coffee-pub-blacksmith/sounds/chest-treasure.mp3",

    SOUNDEFFECTWEAPON01: "modules/coffee-pub-blacksmith/sounds/weapon-sword-blade-swish.mp3",
    SOUNDEFFECTWEAPON02: "modules/coffee-pub-blacksmith/sounds/greataxe.mp3",
    SOUNDEFFECTWEAPON03: "modules/coffee-pub-blacksmith/sounds/arrow.mp3",

    SOUNDEFFECTINSTRUMENT01: "modules/coffee-pub-blacksmith/sounds/sadtrombone.mp3",
    SOUNDEFFECTINSTRUMENT02: "modules/coffee-pub-blacksmith/sounds/fanfare-harp.mp3",
    SOUNDEFFECTINSTRUMENT03: "modules/coffee-pub-blacksmith/sounds/bell.mp3",
    SOUNDEFFECTINSTRUMENT04: "modules/coffee-pub-blacksmith/sounds/gong.mp3",

    SOUNDEFFECTREACTION01: "modules/coffee-pub-blacksmith/sounds/reaction-ahhhhh.mp3",
    SOUNDEFFECTREACTION02: "modules/coffee-pub-blacksmith/sounds/reaction-oooooh.mp3",
    SOUNDEFFECTREACTION03: "modules/coffee-pub-blacksmith/sounds/reaction-yay.mp3",
    SOUNDEFFECTREACTION04: "modules/coffee-pub-blacksmith/sounds/battlecry.mp3",

    SOUNDEFFECTGENERAL01: "modules/coffee-pub-blacksmith/sounds/rustling-grass.mp3",
    SOUNDEFFECTGENERAL02: "modules/coffee-pub-blacksmith/sounds/spell-magic-circle.mp3",
    SOUNDEFFECTGENERAL03: "modules/coffee-pub-blacksmith/sounds/synth.mp3",
    SOUNDEFFECTGENERAL04: "modules/coffee-pub-blacksmith/sounds/beast-owl-hoot.mp3",
    SOUNDEFFECTGENERAL05: "modules/coffee-pub-blacksmith/sounds/charm.mp3",
    SOUNDEFFECTGENERAL06: "modules/coffee-pub-blacksmith/sounds/clatter.mp3",
    SOUNDEFFECTGENERAL07: "modules/coffee-pub-blacksmith/sounds/fire-candle-blow.mp3",
    SOUNDEFFECTGENERAL08: "modules/coffee-pub-blacksmith/sounds/general-cocktail-ice.mp3",
    SOUNDEFFECTGENERAL09: "modules/coffee-pub-blacksmith/sounds/general-toilet-flush.mp3",

    BANNERHEROES01: "modules/coffee-pub-blacksmith/images/banners/banners-heros-1.webp",
    BANNERHEROES02: "modules/coffee-pub-blacksmith/images/banners/banners-heros-2.webp",
    BANNERHEROES03: "modules/coffee-pub-blacksmith/images/banners/banners-heros-3.webp",
    BANNERHEROES04: "modules/coffee-pub-blacksmith/images/banners/banners-narration-crypt-1.webp",
    BANNERHEROES05: "modules/coffee-pub-blacksmith/images/banners/banners-narration-crypt-2.webp",
    BANNERHEROES06: "modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-1.webp",
    BANNERHEROES07: "modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-2.webp",
    BANNERHEROES08: "modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-3.webp",
    BANNERHEROES09: "modules/coffee-pub-blacksmith/images/banners/banners-narration-forest-4.webp",
    BANNERHEROES10: "modules/coffee-pub-blacksmith/images/banners/banners-narration-jungle-1.webp",

    BANNERMONSTER01: "modules/coffee-pub-blacksmith/images/banners/banners-dragon.webp",
    BANNERMONSTER02: "modules/coffee-pub-blacksmith/images/banners/banners-minotaur.webp",
    BANNERMONSTER03: "modules/coffee-pub-blacksmith/images/banners/banners-wraith-1.webp",
    BANNERMONSTER04: "modules/coffee-pub-blacksmith/images/banners/banners-wraith-2.webp",

    BANNERLANDSCAPE01: "modules/coffee-pub-blacksmith/images/banners/banners-landscape-winter-1.webp",
    BANNERLANDSCAPE02: "modules/coffee-pub-blacksmith/images/banners/banners-landscape-winter-2.webp",
    BANNERLANDSCAPE03: "modules/coffee-pub-blacksmith/images/banners/banners-landscape-winter-3.webp",
    BANNERLANDSCAPE04: "modules/coffee-pub-blacksmith/images/banners/banners-mountains.webp",
    BANNERLANDSCAPE05: "modules/coffee-pub-blacksmith/images/banners/banners-mushrooms-1.webp",
    BANNERLANDSCAPE06: "modules/coffee-pub-blacksmith/images/banners/banners-mushrooms-2.webp",
    BANNERLANDSCAPE07: "modules/coffee-pub-blacksmith/images/banners/banners-path-2.webp",
    BANNERLANDSCAPE08: "modules/coffee-pub-blacksmith/images/banners/banners-path.webp",

    BANNEROOPS01: "modules/coffee-pub-blacksmith/images/banners/banners-oops-1.webp",
    BANNEROOPS02: "modules/coffee-pub-blacksmith/images/banners/banners-oops-2.webp",
    BANNEROOPS03: "modules/coffee-pub-blacksmith/images/banners/banners-oops-3.webp",
    BANNEROOPS04: "modules/coffee-pub-blacksmith/images/banners/banners-oops-4.webp",
    BANNEROOPS05: "modules/coffee-pub-blacksmith/images/banners/banners-oops-5.webp",
    BANNEROOPS06: "modules/coffee-pub-blacksmith/images/banners/banners-oops-6.webp",
    BANNEROOPS07: "modules/coffee-pub-blacksmith/images/banners/banners-oops-7.webp",
    BANNEROOPS08: "modules/coffee-pub-blacksmith/images/banners/banners-oops-8.webp",
    BANNEROOPS09: "modules/coffee-pub-blacksmith/images/banners/banners-oops-9.webp",
    BANNEROOPS10: "modules/coffee-pub-blacksmith/images/banners/banners-oops-10.webp",
    BANNEROOPS11: "modules/coffee-pub-blacksmith/images/banners/banners-oops-11.webp",

    BANNERDAMAGEACID01: "modules/coffee-pub-blacksmith/images/banners/banners-damage-acid-1.webp",
    BANNERDAMAGEACID02: "modules/coffee-pub-blacksmith/images/banners/banners-damage-acid-2.webp",
    BANNERDAMAGEACID03: "modules/coffee-pub-blacksmith/images/banners/banners-damage-acid-3.webp",

    BANNERDAMAGEBLUDGEONING01: "modules/coffee-pub-blacksmith/images/banners/banners-damage-bludgeoning-1.webp",
    BANNERDAMAGEBLUDGEONING02: "modules/coffee-pub-blacksmith/images/banners/banners-damage-bludgeoning-2.webp",
    BANNERDAMAGEBLUDGEONING03: "modules/coffee-pub-blacksmith/images/banners/banners-damage-bludgeoning-3.webp",

    BANNERDAMAGECOLD01: "modules/coffee-pub-blacksmith/images/banners/banners-damage-cold-1.webp",
    BANNERDAMAGECOLD02: "modules/coffee-pub-blacksmith/images/banners/banners-damage-cold-2.webp",
    BANNERDAMAGECOLD03: "modules/coffee-pub-blacksmith/images/banners/banners-damage-cold-3.webp",
    BANNERDAMAGECOLD04: "modules/coffee-pub-blacksmith/images/banners/banners-damage-cold-4.webp",

    BANNERDAMAGEFIRE01: "modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-1.webp",
    BANNERDAMAGEFIRE02: "modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-2.webp",  
    BANNERDAMAGEFIRE03: "modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-3.webp",
    BANNERDAMAGEFIRE04: "modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-4.webp",
    BANNERDAMAGEFIRE05: "modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-5.webp",
    BANNERDAMAGEFIRE06: "modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-6.webp",

    BANNERDAMAGEFORCE01: "modules/coffee-pub-blacksmith/images/banners/banners-damage-force-1.webp",
    BANNERDAMAGEFORCE02: "modules/coffee-pub-blacksmith/images/banners/banners-damage-force-2.webp",
    BANNERDAMAGEFORCE03: "modules/coffee-pub-blacksmith/images/banners/banners-damage-force-3.webp",
    BANNERDAMAGEFORCE04: "modules/coffee-pub-blacksmith/images/banners/banners-damage-force-4.webp",

    BANNERDAMAGELIGHTNING01: "modules/coffee-pub-blacksmith/images/banners/banners-damage-lightning-1.webp",
    BANNERDAMAGELIGHTNING02: "modules/coffee-pub-blacksmith/images/banners/banners-damage-lightning-2.webp",
    BANNERDAMAGELIGHTNING03: "modules/coffee-pub-blacksmith/images/banners/banners-damage-lightning-3.webp",
    BANNERDAMAGELIGHTNING04: "modules/coffee-pub-blacksmith/images/banners/banners-damage-lightning-4.webp",

    BANNERDAMAGENECROTIC01: "modules/coffee-pub-blacksmith/images/banners/banners-damage-necrotic-1.webp",
    BANNERDAMAGENECROTIC02: "modules/coffee-pub-blacksmith/images/banners/banners-damage-necrotic-2.webp",
    BANNERDAMAGENECROTIC03: "modules/coffee-pub-blacksmith/images/banners/banners-damage-necrotic-3.webp",
    BANNERDAMAGENECROTIC04: "modules/coffee-pub-blacksmith/images/banners/banners-damage-necrotic-4.webp",
    BANNERDAMAGENECROTIC05: "modules/coffee-pub-blacksmith/images/banners/banners-damage-necrotic-5.webp",

    BANNERDAMAGEPIERCING01: "modules/coffee-pub-blacksmith/images/banners/banners-damage-piercing-1.webp",
    BANNERDAMAGEPIERCING02: "modules/coffee-pub-blacksmith/images/banners/banners-damage-piercing-2.webp",
    BANNERDAMAGEPIERCING03: "modules/coffee-pub-blacksmith/images/banners/banners-damage-piercing-3.webp",

    BANNERDAMAGEPOISON01: "modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-1.webp",
    BANNERDAMAGEPOISON02: "modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-2.webp",
    BANNERDAMAGEPOISON03: "modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-3.webp",
    BANNERDAMAGEPOISON04: "modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-4.webp",
    BANNERDAMAGEPOISON05: "modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-5.webp",

    BANNERDAMAGEPSYCHIC01: "modules/coffee-pub-blacksmith/images/banners/banners-damage-psychic-1.webp",
    BANNERDAMAGEPSYCHIC02: "modules/coffee-pub-blacksmith/images/banners/banners-damage-psychic-2.webp",
    BANNERDAMAGEPSYCHIC03: "modules/coffee-pub-blacksmith/images/banners/banners-damage-psychic-3.webp",
    BANNERDAMAGEPSYCHIC04: "modules/coffee-pub-blacksmith/images/banners/banners-damage-psychic-4.webp",

    BANNERDAMAGERADIANT01: "modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-1.webp",
    BANNERDAMAGERADIANT02: "modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-2.webp",
    BANNERDAMAGERADIANT03: "modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-3.webp",
    BANNERDAMAGERADIANT04: "modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-4.webp",

    BANNERDAMAGESLASHING01: "modules/coffee-pub-blacksmith/images/banners/banners-damage-slashing-1.webp",
    BANNERDAMAGESLASHING02: "modules/coffee-pub-blacksmith/images/banners/banners-damage-slashing-2.webp",
    BANNERDAMAGESLASHING03: "modules/coffee-pub-blacksmith/images/banners/banners-damage-slashing-3.webp",
    BANNERDAMAGESLASHING04: "modules/coffee-pub-blacksmith/images/banners/banners-damage-slashing-4.webp",

    TILEGROUND01: "modules/coffee-pub-blacksmith/images/tiles/tile-brick.webp",
    TILEGROUND02: "modules/coffee-pub-blacksmith/images/tiles/tile-cobblestone.webp",
    TILEGROUND03: "modules/coffee-pub-blacksmith/images/tiles/tile-dessert.webp",
    TILEGROUND04: "modules/coffee-pub-blacksmith/images/tiles/tile-dirt.webp",
    TILEGROUND05: "modules/coffee-pub-blacksmith/images/tiles/tile-grass.webp",
    TILEGROUND06: "modules/coffee-pub-blacksmith/images/tiles/tile-rock.webp",
    TILEGROUND07: "modules/coffee-pub-blacksmith/images/tiles/tile-stone.webp",
    TILEGROUND08: "modules/coffee-pub-blacksmith/images/tiles/tile-stonefloor.webp",

    TILECLOTH01: "modules/coffee-pub-blacksmith/images/tiles/tile-cloth-light.webp",
    TILECLOTH02: "modules/coffee-pub-blacksmith/images/tiles/tile-clothdark.webp",
    TILECLOTH03: "modules/coffee-pub-blacksmith/images/tiles/tile-denim-50.webp",
    TILECLOTH04: "modules/coffee-pub-blacksmith/images/tiles/tile-denim-65.webp",
    TILECLOTH05: "modules/coffee-pub-blacksmith/images/tiles/tile-denim-75.webp",
    TILECLOTH06: "modules/coffee-pub-blacksmith/images/tiles/tile-denim-80.webp",
    TILECLOTH07: "modules/coffee-pub-blacksmith/images/tiles/tile-denim-85.webp",
    TILECLOTH08: "modules/coffee-pub-blacksmith/images/tiles/tile-denim-dark-090.webp",

    TILEPAPER01: "modules/coffee-pub-blacksmith/images/tiles/tile-parchment-tan.webp",
    TILEPAPER01: "modules/coffee-pub-blacksmith/images/tiles/tile-parchment-white.webp",
    TILEPAPER02: "modules/coffee-pub-blacksmith/images/tiles/tile-parchment.webp",

    // Skill Check Specific Sounds
    SOUNDCINEMATICOPEN: "modules/coffee-pub-blacksmith/sounds/fanfare-intro-1.mp3",
    SOUNDDICEROLL: "modules/coffee-pub-blacksmith/sounds/general-dice-rolling.mp3",
    SOUNDSUCCESS: "modules/coffee-pub-blacksmith/sounds/fanfare-success-2.mp3",
    SOUNDFAILURE: "modules/coffee-pub-blacksmith/sounds/fanfare-failure-1.mp3",
    SOUNDVERSUS: "modules/coffee-pub-blacksmith/sounds/fanfare-intro-2.mp3",
    SOUNDROLLCOMPLETE: "modules/coffee-pub-blacksmith/sounds/interface-notification-03.mp3",
    SOUNDROLLCRITICAL: "modules/coffee-pub-blacksmith/sounds/fanfare-success-1.mp3",
    SOUNDROLLFUMBLE: "modules/coffee-pub-blacksmith/sounds/sadtrombone.mp3",

    // Cinematic Backgrounds
    BACKSKILLCHECK: "modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-2.webp",
    BACKABILITYCHECK: "modules/coffee-pub-blacksmith/images/banners/banners-damage-cold-3.webp",
    BACKSAVINGTHROW: "modules/coffee-pub-blacksmith/images/banners/banners-damage-bludgeoning-4.webp",
    BACKDICEROLL: "modules/coffee-pub-blacksmith/images/banners/banners-damage-psychic-2.webp",
    BACKTOOLCHECK: "modules/coffee-pub-blacksmith/images/banners/banners-damage-poison-3.webp",
    BACKCONTESTEDROLL: `modules/coffee-pub-blacksmith/images/banners/banners-damage-fire-6.webp`,

    // Define sound volume levels
    SOUNDVOLUMEMAX: 1.0,
    SOUNDVOLUMENORMAL: 0.8,
}

// ================================================================== 
// ===== VARIABLE IMPORTS ===========================================
// ================================================================== 

// Grab the module data
import { MODULE_TITLE, MODULE_ID } from './const.js';

// ================================================================== 
// ===== GLOBAL FUNCTIONS ===========================================
// ================================================================== 

/**
 * Format milliseconds into a time string
 * @param {number} ms - milliseconds to format
 * @param {string} format - "colon", "verbose", "extended", "rounds", or any format+rounds (e.g. "verbose+rounds") (default: "colon")
 * @returns {string} formatted time string
 */
export function formatTime(ms, format = "colon") {
    // Ensure we're working with a positive number
    ms = Math.max(0, ms);
    
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    // Check if we need to append rounds
    const includeRounds = format.includes("+rounds");
    const baseFormat = format.replace("+rounds", "");
    
    let timeString = "";
    
    if (baseFormat === "verbose") {
        timeString = `${minutes}m ${seconds}s`;
    }
    else if (baseFormat === "extended") {
        let remainingSeconds = totalSeconds;
        let years, months, weeks, days, hours, mins;
        
        mins = Math.floor(remainingSeconds / 60);
        remainingSeconds %= 60;
        hours = Math.floor(mins / 60);
        mins %= 60;
        days = Math.floor(hours / 24);
        hours %= 24;
        weeks = Math.floor(days / 7);
        days %= 7;
        months = Math.floor(weeks / 4.34524);
        weeks %= 4.34524;
        years = Math.floor(months / 12);
        months %= 12;

        timeString = '';
        if (years > 0) timeString += `${years} YR `;
        if (months > 0) timeString += `${months} MO `;
        if (weeks > 0) timeString += `${Math.floor(weeks)} WK `;
        if (days > 0) timeString += `${days} DAY `;
        if (hours > 0) timeString += `${hours} HR `;
        if (mins > 0) timeString += `${mins} MIN `;
        if (remainingSeconds > 0) timeString += `${remainingSeconds} SEC`;
        
        timeString = timeString.trim() || '0 SEC';
    }
    else if (baseFormat === "rounds") {
        const rounds = Math.floor(totalSeconds / 6);
        return `${rounds} ROUNDS`;
    }
    else {
        // Default to colon format
        timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Append rounds if requested
    if (includeRounds) {
        const rounds = Math.floor(totalSeconds / 6);
        timeString += ` (${rounds} ROUNDS)`;
    }
    
    return timeString;
}

// ************************************
// ** UTILITY Convert Seconds
// ************************************
export function convertSecondsToRounds(numSeconds) {
    if (numSeconds === "0" || isNaN(numSeconds)) {
      return "Permanent";
    }
    // Calculate the total number of rounds
    let rounds = Math.floor(numSeconds / 6);
    let years, months, weeks, days, hours, minutes, seconds;
    minutes = Math.floor(numSeconds / 60);
    numSeconds %= 60;
    hours = Math.floor(minutes / 60);
    minutes %= 60;
    days = Math.floor(hours / 24);
    hours %= 24;
    weeks = Math.floor(days / 7);
    days %= 7;
    months = Math.floor(weeks / 4.34524);
    weeks %= 4.34524;
    years = Math.floor(months / 12);
    months %= 12;
    let timeString = '';
    if (years > 0) timeString += `${years} YR `;
    if (months > 0) timeString += `${months} MO `;
    if (weeks > 0) timeString += `${Math.floor(weeks)} WK `;
    if (days > 0) timeString += `${days} DAY `;
    if (hours > 0) timeString += `${hours} HR `;
    if (minutes > 0) timeString += `${minutes} MIN `;
    if (numSeconds > 0) timeString += `${numSeconds} SEC `;
    // Add rounds to the output string
    timeString += `(${rounds} ROUNDS)`;
    return timeString;
  }

// ************************************
// ** UTILITY Convert Array to String
// ************************************

export function objectToString(obj) {
    let str = '';
    for (let key in obj) {
        if (str !== '') {
            str += '|'; 
        }
        str += key + '=' + obj[key];
    }
    return str;
}


// ************************************
// ** UTILITY Convert String to Array
// ************************************

export function stringToObject(str) {
    //postConsoleAndNotification("Converting string to object: ", str, false, true, false);
    let obj = {};
    if (str) {
        let pairs = str.split('|');
        for (let pair of pairs) {
            let [key, value] = pair.split('=');
            obj[key] = value;
        }
    } else {
        postConsoleAndNotification("Can't convert an empty string: ", str, false, false, false);
    }
    return obj;
}

// ************************************
// ** UTILITY Convert string to Sentence Case
// ************************************ 
export function toSentenceCase(str) {
    if ((str === null) || (str === ''))
        return false;
    else
        str = str.toString();
 
    return str.replace(/\w\S*/g,
        function (txt) {
            return txt.charAt(0).toUpperCase() +
                txt.substr(1).toLowerCase();
        });
}

// ************************************
// ** UTILITY Get Actor ID by Name
// ************************************ 
export function getActorId(actorName) {
    return game.actors.getName(actorName)?.id ?? "";
}



// ************************************
// ** UTILITY Get Token Image with Name
// ************************************ 
export function getTokenImage(tokenDoc) {
    if (!tokenDoc) return null;
    
    // For V12, first try to get img directly
    if (tokenDoc.img) return tokenDoc.img;
    
    // If no direct img, try texture path
    if (tokenDoc.texture?.src) return tokenDoc.texture.src;
    
    // If neither exists, return null
    return null;
}

// ************************************
// ** UTILITY Get Portrait Image with Name
// ************************************ 
export function getPortraitImage(actor) {
    // Get the actor's portrait data.
    const portraitData = actor.img || actor.prototypeToken.texture.src; // Check both possible fields

    //postConsoleAndNotification("IN getPortraitImage. portraitData:", portraitData, false, true, false);

    // If the portrait data is not set, return an empty string.
    if (!portraitData) {
        return "";
    }
    // Return the portrait image URL.
    return portraitData;
}

// ************************************
// ** UTILITY Get Token ID with Name
// ************************************ 
export function getTokenId(tokenName) {
    // Get the list of all tokens on the canvas.
    const tokens = canvas.tokens.placeables;
  
    // Find the token with the given name.
    const token = tokens.find(e => e.name === tokenName);
  
    // If the token was found, return its ID.
    if (token) {
        return token.id;
    }
    // If the token was not found, return an empty string.
    return "";
}

// ************************************
// ** UTILITY Truncate String
// ************************************ 
// adds a "..." to a string if it is too long
export function trimString(str, maxLength) {
    // check if the string length is more than the maximum length
    if (str.length > maxLength) {
        // if more, cut the string at the maximum length and append with '...'
        str = str.substring(0, maxLength - 3) + '...';
    }
    // if not, return the original string
    return str;
}

// ************************************
// ** UTILITY Convert date to words
// ************************************ 
export function generateFormattedDate(format) {
    // Format the current date to: "(year-month-day hour:minute AM/PM)"
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // January is 0!
    const day = now.getDate();
    const hours = now.getHours() <= 12 ? now.getHours() : now.getHours() - 12;
    const minutes = now.getMinutes();
    const am_pm = now.getHours() >= 12 ? 'PM' : 'AM';
    // If hours or minutes are less than 10, prepend a '0'
    const paddedHours = hours < 10 ? `0${hours}` : hours;
    const paddedMinutes = minutes < 10 ? `0${minutes}` : minutes;

    // Formatted time in 12-hour format
    const formattedTime = `${paddedHours}:${paddedMinutes} ${am_pm}`;
    const formattedDate = `${year}-${month}-${day}`;
    const formattedDateTime = `${formattedDate} ${formattedTime}`;

    // Return based on the format parameter
    if (format === 'time') {
        return formattedTime;
    } else if (format === 'date') {
        return formattedDate;
    } else {
        return formattedDateTime;
    }
}


// ************************************
// ** UTILITY Reset Settings
// ************************************

export function resetModuleSettings(moduleId) {
    // Get the module
    const module = game.modules.get(moduleId);
    postConsoleAndNotification("A Setting Reset has been called for: ", module, false, false, true) 
    // Reset all settings to their default values
    module.settings.reset();
    postConsoleAndNotification("Module settings reset: ", module, false, false, true) 
} 

// ************************************
// ** BLACKSMITH VARIABLE SHARING
// ************************************
// This code will be executed whenever any BLACKSMITH variable in the "coffee-pub-blacksmith" module is pushed
// postConsoleAndNotification("The updated BLACKSMITH object is...", newBlacksmith, false, true, false);
export function registerBlacksmithUpdatedHook() {
    Hooks.on("blacksmithUpdated", (newBlacksmith) => {
        // BLACKSMITH VARIABLE COLLECTION
        // RICH CONSOLE
        COFFEEPUB.blnFancyConsole = newBlacksmith.blnFancyConsole;
        //postConsoleAndNotification("The updated COFFEEPUB.blnFancyConsole: ", COFFEEPUB.blnFancyConsole, false, true, false);
        // DEBUG ON/OFF
        COFFEEPUB.blnDebugOn = newBlacksmith.blnDebugOn;
        //postConsoleAndNotification("The updated COFFEEPUB.blnDebugOn: ", COFFEEPUB.blnDebugOn, false, true, false);
        // DEBUG STYLE
        COFFEEPUB.strConsoleDebugStyle = newBlacksmith.strConsoleDebugStyle;
        //postConsoleAndNotification("The updated COFFEEPUB.strConsoleDebugStyle: ", COFFEEPUB.strConsoleDebugStyle, false, true, false);
        // Get the default theme
        COFFEEPUB.strDEFAULTCARDTHEME = newBlacksmith.strDefaultCardTheme;
        //postConsoleAndNotification("The updated COFFEEPUB.strDEFAULTCARDTHEME: ", COFFEEPUB.strDEFAULTCARDTHEME, false, true, false);
        // Get the Themes list
        COFFEEPUB.arrTHEMECHOICES = newBlacksmith.arrThemeChoices;
        //postConsoleAndNotification("The updated COFFEEPUB.arrTHEMECHOICES: ", COFFEEPUB.arrTHEMECHOICES, false, true, false);
        // Get the Macro list
        COFFEEPUB.arrMACROCHOICES = newBlacksmith.arrMacroChoices;
        //postConsoleAndNotification("The updated COFFEEPUB.arrMACROCHOICES: ", COFFEEPUB.arrMACROCHOICES, false, true, false);
        // Get the Table list
        COFFEEPUB.arrCOMPENDIUMCHOICES = newBlacksmith.arrCompendiumChoices;
        //postConsoleAndNotification("The updated COFFEEPUB.arrCOMPENDIUMCHOICES: ", COFFEEPUB.arrCOMPENDIUMCHOICES, false, true, false);
        // Get the Table list
        COFFEEPUB.arrTABLECHOICES = newBlacksmith.arrTableChoices;
        //postConsoleAndNotification("The updated COFFEEPUB.arrTABLECHOICES: ", COFFEEPUB.arrTABLECHOICES, false, true, false);
        // Get the Image list
        COFFEEPUB.arrBACKGROUNDIMAGECHOICES = newBlacksmith.arrBackgroundImageChoices;
        //postConsoleAndNotification("The updated COFFEEPUB.arrBACKGROUNDIMAGECHOICES: ", COFFEEPUB.arrBACKGROUNDIMAGECHOICES, false, true, false)
        // Get the Image list
        COFFEEPUB.arrICONCHOICES = newBlacksmith.arrIconChoices;
        //postConsoleAndNotification("The updated COFFEEPUB.arrICONCHOICES: ", COFFEEPUB.arrICONCHOICES, false, true, false);
        // Get the Sound list
        COFFEEPUB.arrSOUNDCHOICES = newBlacksmith.arrSoundChoices;
        postConsoleAndNotification("The updated COFFEEPUB.arrSOUNDCHOICES: ", COFFEEPUB.arrSOUNDCHOICES, false, true, false);
        // Get the OpenAI Variables
        COFFEEPUB.strOpenAIAPIKey = newBlacksmith.strOpenAIAPIKey;
        COFFEEPUB.strOpenAIModel = newBlacksmith.strOpenAIModel;
        COFFEEPUB.strOpenAIGameSystems = newBlacksmith.strOpenAIGameSystems;
        COFFEEPUB.strOpenAIPrompt = newBlacksmith.strOpenAIPrompt;
        COFFEEPUB.strOpenAITemperature = newBlacksmith.strOpenAITemperature;
        //postConsoleAndNotification("Updated the OpenAI Variables.", "", false, true, false);
        postConsoleAndNotification("Completed updating the BLACKSMITH object.", "", false, true, false);
    });
}

// ************************************
// ** UTILITY Play Sound 
// ************************************

/**
 * Clamp a number between a minimum and maximum value.
 * @param {number} value - The number to clamp.
 * @param {number} min - The minimum value.
 * @param {number} max - The maximum value.
 * @returns {number} - The clamped value.
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Play a sound with specified path and volume.
 * @param {string} [sound='sound'] - The path to the sound file.
 * @param {number} [volume=0.7] - The volume of the sound (0 to 1).
 * @param {boolean} [loop=false] - Whether the sound should loop.
 * @param {boolean|object} [broadcast=true] - If true, plays for all clients. If false, plays only for the local client.
 *                                           Can also be an object to configure specific recipients.
 * @returns {Promise<void>}
 */
export async function playSound(sound = 'sound', volume = 0.7, loop = false, broadcast = true) {
    if (sound === 'none') return;

    try {
        await foundry.audio.AudioHelper.play({
            src: sound,
            volume: clamp(volume, 0, 1),
            autoplay: true,
            loop: loop
        }, broadcast);
    } catch (error) {
        postConsoleAndNotification(`Blacksmith | Global.js | Failed to play sound: ${sound}`, error, false, false, true);
    }
}

// // ************************************
// // ** UTILITY Roll Dice 
// // ************************************
/**
 * Show the 3D Dice animation for the Roll made by the User.
 *
 * @param {Roll} roll an instance of Roll class to show 3D dice animation.
 * @param {User} user the user who made the roll (game.user by default).
 * @param {Boolean} synchronize if the animation needs to be shown to other players. Default: false
 * @param {Array} whisper list of users or userId who can see the roll, set it to null if everyone can see. Default: null
 * @param {Boolean} blind if the roll is blind for the current user. Default: false 
 * @param {String} A chatMessage ID to reveal when the roll ends. Default: null
 * @param {Object} An object using the same data schema than ChatSpeakerData. 
 *        Needed to hide NPCs roll when the GM enables this setting.
 * @param options Object with 2 booleans: ghost (default: false) and secret (default: false)
 * @returns {Promise<boolean>} when resolved true if the animation was displayed, false if not.
 *game.dice3d.showForRoll(roll, user, synchronize, whisper, blind, chatMessageID, speaker, {ghost:false, secret:false})
 * @param {Roll|string|null} roll - Optional. Either a Roll object or a string defining the dice roll (like "2d20"). 
 * If not provided it will default roll "2d20".
 * EXAMPLES:
 * rollCoffeePubDice(); // here roll is undefined, so inside the function it'll default to null.
 * rollCoffeePubDice("3d20"); // roll parameter will be "3d20" inside the function.
 * rollCoffeePubDice(new Roll("1d8")); // roll parameter will be a Roll object inside the function.
 */
 export async function rollCoffeePubDice(roll = null) {
    // Only do this if they have Dice So Nice
    if(game.dice3d) {
        // Check if roll is passed in, if not generate a roll
        if (!roll) {
            roll = await new Roll("2d20").evaluate();
        } 
        // If a string is passed, parse it into a roll
        else if (typeof roll === 'string') {
            roll = await new Roll(roll).evaluate();
        }
        //postConsoleAndNotification(`BIBLIOSOPH: rollCoffeePubDice roll`, roll, false, true, false);
        var user = game.user;
        var synchronize = true;
        var whisper = null;
        var blind = false;
        var chatMessageID = null;
        var speaker = null;

        // Show dice roll
        try {
            let displayed = await game.dice3d.showForRoll(roll, user, synchronize, whisper, blind, chatMessageID, speaker, {ghost:false, secret:false});
            if(!displayed) {
                postConsoleAndNotification(`Dice So Nice roll was not displayed for dice type ${roll}`, undefined, false, true, false);
            }
        } catch(err) {
            // Use my custom error function
            postConsoleAndNotification(`Error occurred in Dice So Nice`, err.message, false, true, false);
        };
    }
}

// ************************************
// ** UTILITY OPEN AI
// ************************************
// Not all of this is exported and is just used in the global.js file
// these are not exported.
let history = [];
function pushHistory(...args) {
	const maxHistoryLength = game.settings.get(MODULE_ID, 'openAIContextLength');

	history.push(...args);
	// Only limit history if maxHistoryLength is greater than 0
	if (maxHistoryLength > 0 && history.length > maxHistoryLength) {
		history = history.slice(history.length - maxHistoryLength);
	}

	return history;
}
// -- FUNCTION TO CALL OPENAI TXT --
async function callGptApiText(query) {
    // right off make sure there is data to process.
    if (!query) {
        return "What madness is this? You query me with silence? I received no words.";
    }
   
    var strErrorMessage = "";
    const apiKey = COFFEEPUB.strOpenAIAPIKey;
    const model = COFFEEPUB.strOpenAIModel;
    const prompt = COFFEEPUB.strOpenAIPrompt;
    const temperature = COFFEEPUB.strOpenAITemperature;
    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    const promptMessage = {role: 'user', content: prompt};
    const queryMessage = {role: 'user', content: query};

    // Get message history based on context length setting
    const maxHistoryLength = game.settings.get(MODULE_ID, 'openAIContextLength');
    const history = maxHistoryLength > 0 ? pushHistory().slice(-maxHistoryLength) : pushHistory();
    const messages = history.concat(promptMessage, queryMessage);

    // Set max tokens based on model
    let max_tokens;
    if (model.includes('gpt-4-turbo')) {
        max_tokens = 4096;  // GPT-4 Turbo max completion tokens
    } else if (model.includes('gpt-4')) {
        max_tokens = 8192;  // Standard GPT-4 max completion tokens
    } else {
        max_tokens = 4096;  // Default for other models
    }

    postConsoleAndNotification(`BLACKSMITH: Using model ${model} with max_tokens ${max_tokens}`, "", false, true, false);

    const requestBody = {
        model,
        messages,
        temperature: temperature,
        max_tokens: max_tokens,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
        top_p: 1
    };

    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(120000) // Increased to 120 second timeout
    };

    // Enhanced error handling
    const handleError = async (response, error = null) => {
        let errorMessage = "";
        
        if (error) {
            if (error.name === "AbortError") {
                errorMessage = "The request timed out. The response may be too large - try breaking your request into smaller parts.";
            } else {
                errorMessage = `An unexpected error occurred: ${error.message}`;
            }
        } else if (response) {
            const status = response.status;
            try {
                const data = await response.json();
                switch (status) {
                    case 401:
                        errorMessage = "Invalid API key. Please check your OpenAI API key in settings.";
                        break;
                    case 429:
                        errorMessage = "Rate limit exceeded. Please wait a moment before trying again.";
                        break;
                    case 500:
                        errorMessage = "OpenAI server error. Please try again later.";
                        break;
                    case 413:
                        errorMessage = "The request is too large. Try breaking it into smaller parts.";
                        break;
                    default:
                        errorMessage = data?.error?.message || "Unknown error occurred";
                }
            } catch (e) {
                errorMessage = "Could not decode API response";
            }
        }
        
        return `My mind is clouded. ${errorMessage}`;
    };

    try {
        let response = null;
        // Implement exponential backoff for retries with longer initial wait
        for (let retries = 0, backoffTime = 2000; retries < 4; retries++, backoffTime *= 2) {
            if (retries > 0) {
                await new Promise(r => setTimeout(r, backoffTime));
                postConsoleAndNotification(`BLACKSMITH: Retry attempt ${retries} after ${backoffTime}ms wait`, "", false, true, false);
            }
            
            try {
                response = await fetch(apiUrl, requestOptions);
                
                if (response.ok) {
                    const data = await response.json();
                    const replyMessage = data.choices[0].message;
                    const usage = data.usage;
                    
                    // Calculate cost based on model
                    let cost = 0;
                    if (model === 'gpt-4-turbo-preview') {
                        cost = (usage.prompt_tokens * 0.01 + usage.completion_tokens * 0.03) / 1000;
                    } else if (model === 'gpt-4') {
                        cost = (usage.prompt_tokens * 0.03 + usage.completion_tokens * 0.06) / 1000;
                    } else if (model === 'gpt-3.5-turbo') {
                        cost = (usage.prompt_tokens * 0.0005 + usage.completion_tokens * 0.0015) / 1000;
                    }
                    
                    // Add usage and cost to the message
                    replyMessage.usage = usage;
                    replyMessage.cost = cost;
                    
                    // Update history with the latest exchange
                    pushHistory(queryMessage, replyMessage);
                    return replyMessage;
                }
                
                // If we get a 429 (rate limit) or 500 (server error), retry with backoff
                if (response.status !== 429 && response.status !== 500) {
                    break;
                }
            } catch (fetchError) {
                // If it's not a timeout error, break the retry loop
                if (fetchError.name !== "AbortError") {
                    throw fetchError;
                }
                // For timeout errors, continue with retry
                postConsoleAndNotification(`BLACKSMITH: Request timed out, will retry`, "", false, true, false);
            }
        }
        
        // If we get here, all retries failed or we got a non-retryable error
        return await handleError(response);
    } catch (error) {
        return await handleError(null, error);
    }
}
// -- FUNCTION TO CALL OPENAI IMAGE --
async function callGptApiImage(query) {
    //postConsoleAndNotification("In callGptApiImage(): query =", query, false, true, false);    
    const apiKey = COFFEEPUB.strOpenAIAPIKey;
    const apiUrl = 'https://api.openai.com/v1/images';
    const requestBody = {
        model: "dall-e-3",
        prompt: query,
        n: 1,
        size: "1024x1024",
    };
    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
    };
    const response = await fetch(apiUrl, requestOptions);
    //postConsoleAndNotification("In callGptApiImage(): response =", response, false, true, false);   
    const data = await response.json();
    //postConsoleAndNotification("In callGptApiImage(): data =", data, false, true, false);   
    const image_url = data.data[0].url;
    //postConsoleAndNotification("In callGptApiImage(): image_url =", image_url, false, true, false); 
    return image_url;  // Returns an URL to the Draft response where it could be used 
}
// This is Exported
// -- CALL FOR OPENAI QUERY --
export async function getOpenAIReplyAsHtml(query) {
    postConsoleAndNotification("In getOpenAIReplyAsHtml(query): query =", query, false, true, false);  
	
    const response = await callGptApiText(query);
    
    if (typeof response === 'string') {
        // If it's an error message or simple string
        return response;
    }

    let content = response.content;

    // Clean up JSON responses
    if (content.includes('{') && content.includes('}')) {
        try {
            // Find the first { and last }
            const startIndex = content.indexOf('{');
            const endIndex = content.lastIndexOf('}') + 1;
            
            // Extract just the JSON part
            content = content.substring(startIndex, endIndex);
            
            // Remove any trailing quotes or text
            content = content.replace(/['"`]+$/, '');

            // Parse and validate the JSON
            const jsonObj = JSON.parse(content);
            
            // Ensure linkedEncounters is properly formatted
            if (jsonObj.linkedEncounters) {
                jsonObj.linkedEncounters = jsonObj.linkedEncounters.map(encounter => ({
                    uuid: encounter.uuid || "",
                    name: encounter.name || "",
                    synopsis: encounter.synopsis || "",
                    keyMoments: Array.isArray(encounter.keyMoments) ? encounter.keyMoments : []
                }));
            }
            
            // Convert back to string
            content = JSON.stringify(jsonObj, null, 2);
        } catch (e) {
            postConsoleAndNotification("Error processing JSON", e, false, false, true);
            // Keep the original content if JSON processing fails
        }
    } else {
        // For non-JSON content, format as HTML
        content = /<\/?[a-z][\s\S]*>/i.test(content) || !content.includes('\n') ?
            content : content.replace(/\n/g, "<br>");
            
        // Clean up empty paragraphs and code blocks
        content = content.replaceAll("<p></p>", "")
                        .replace(/```\w*\n?/g, "") // Removes any code block markers with optional language
                        .trim();
    }

    response.content = content;
    return response;
}

// ************************************
// ** UTILITY Post to Console
// ************************************
// postConsoleAndNotification("This is the message.", Variable Goes Here, Divider (true/false), Debug (true/false), Notification (true/false))
// Obvious Note: Do not "debug" the "debug" using this function as it will call itself.

export function postConsoleAndNotification(strModuleTitle = "BLACKSMITH", message, result = "", blnDebug = false, blnNotification = false) {

    // Set default styles based on module
    let moduleStyles = {
        BLACKSMITH: {
            titleColor: 'color: #FF7340',
            captionBorder: "border: 1px dotted #A4C76A",
            captionBackground: "background: #2D3F11",
            captionFontColor: "color: #A4C76A"
        },
        CRIER: {
            titleColor: 'color: #9999ff',
            captionBorder: "border: 1px dotted #7B7BBF",
            captionBackground: "background: #2B2B94",
            captionFontColor: "color: #9999ff"
        },
        BIBLIOSOPH: {
            titleColor: 'color: #cccc00',
            captionBorder: "border: 1px dotted #E9E936",
            captionBackground: "background: #64640A",
            captionFontColor: "color: #cccc00"
        },
        SCRIBE: {
            titleColor: 'color: #33cccc',
            captionBorder: "border: 1px dotted #2C9090",
            captionBackground: "background: #104545",
            captionFontColor: "color: #33cccc"
        },
        SQUIRE: {
            titleColor: 'color: #A333CC',
            captionBorder: "border: 1px dotted #732D88",
            captionBackground: "background: #670B83",
            captionFontColor: "color: #CAA5DA"
        },
        BUBO: {
            titleColor: 'color: #ff3377',
            captionBorder: "border: 1px dotted #ED6B96",
            captionBackground: "background: #550922",
            captionFontColor: "color: #ff3377"
        }
    };

    // Get styles for the current module, defaulting to BLACKSMITH if not found
    const currentStyles = moduleStyles[strModuleTitle] || moduleStyles.BLACKSMITH;

    var strTitleColor = currentStyles.titleColor;
    var strFancyCaptionBorder = currentStyles.captionBorder;
    var strFancyCaptionBackground = currentStyles.captionBackground;
    var strFancyCaptionFontColor = currentStyles.captionFontColor;

    // === COMMON ICONS ===
    const MODULE_CONSOLE_COMMON_ICON_FLAME = String.fromCodePoint(0x1F525);
    const MODULE_CONSOLE_COMMON_ICON_MARTINI = String.fromCodePoint(0x1F378);
    const MODULE_CONSOLE_COMMON_ICON_TUMBLER = String.fromCodePoint(0x1F943);
    const MODULE_CONSOLE_COMMON_ICON_COFFEE = String.fromCodePoint(0x2615);
    const MODULE_CONSOLE_COMMON_ICON_BUG = String.fromCodePoint(0x1FAB0);
    const MODULE_CONSOLE_COMMON_ICON_SKULL = String.fromCodePoint(0x1F480);
    const MODULE_CONSOLE_COMMON_ICON_MAGNIFYING = String.fromCodePoint(0x1F50E);
    const MODULE_CONSOLE_COMMON_PIPE = '•';
    const MODULE_CONSOLE_COMMON_STYLE_PIPE = [
        'color: #D9D7CD',
        'font-weight:900',
        'margin-right: 3px',
        'margin-left: 3px',
    ].join(';');

    // === NORMAL CONSOLE STYLES ===

    var MODULE_CONSOLE_NORMAL_STYLE_AUTHOR = [
        strFancyCaptionFontColor,
        'font-weight:900',
        'margin-right: 0px',
    ].join(';');
    var MODULE_CONSOLE_NORMAL_STYLE_MODULE = [
        strTitleColor,
        'font-weight:900',
        'margin-right: 8px',
    ].join(';');
    var MODULE_CONSOLE_NORMAL_STYLE_TEXT = [
        'color: #c1c1c1',
    ].join(';');


    // === DEBUG CONSOLE STYLES ===
    
    // --- FANCY DEBUG ---
    var MODULE_CONSOLE_DEBUG_STYLE_FANCY_CAPTION = [
        strFancyCaptionFontColor,
        strFancyCaptionBackground,
        strFancyCaptionBorder,
        'font-size: 14px',
        'font-weight:900',
        'border-radius: 4px',
        'padding-top: 6px',
        'padding-bottom: 3px',
        'padding-left: 10px',
        'padding-right: 10px',
        'margin-top: 8px',
        'margin-bottom: 8px',
        'margin-left: 0px',
        'margin-right: 8px',
    ].join(';');
    var MODULE_CONSOLE_DEBUG_STYLE_FANCY_LABEL_MESSAGE = [
        'color: #FF7340',
        'font-weight:900',
        'margin-right: 3px',
    ].join(';');
    var MODULE_CONSOLE_DEBUG_STYLE_FANCY_TEXT_MESSAGE = [
        // 'color: #D8E8D9',
        'all: unset;',
    ].join(';');
    var MODULE_CONSOLE_DEBUG_STYLE_FANCY_LABEL_RESULT = [
        'color: #5CC9F5',
        'font-weight:900',
        'margin-right: 3px',
    ].join(';');
    // not used right now
    var MODULE_CONSOLE_DEBUG_STYLE_FANCY_TEXT_RESULT = [
        'all: unset;',
    ].join(';');

    // --- SIMPLE DEBUG ---

    var MODULE_CONSOLE_DEBUG_STYLE_SIMPLE_AUTHOR = [
        strFancyCaptionFontColor,
        'font-weight:900',
        'margin-right: 0px',
    ].join(';');
    var MODULE_CONSOLE_DEBUG_STYLE_SIMPLE_MODULE = [
        strTitleColor,
        'font-weight:900',
        'margin-right: 8px',
    ].join(';');

    var MODULE_CONSOLE_DEBUG_STYLE_SIMPLE_LABEL_MESSAGE = [
        strTitleColor,
        'font-weight:900',
        'margin-right: 3px',
    ].join(';');
    var MODULE_CONSOLE_DEBUG_STYLE_SIMPLE_TEXT_MESSAGE = [
        'color: #D8E8D9',
    ].join(';');
    var MODULE_CONSOLE_DEBUG_STYLE_SIMPLE_LABEL_RESULT = [
        'color: #5CC9F5',
        'font-weight:900',
        'margin-right: 3px',
    ].join(';');
    var MODULE_CONSOLE_DEBUG_STYLE_SIMPLE_TEXT_RESULT = [
        'all: unset;',
    ].join(';');

    // --- PLAIN DEBUG ---

    var MODULE_CONSOLE_DEBUG_STYLE_PLAIN_AUTHOR = [
        'color: #A4C76A',
        'font-weight:900',
        'margin-right: 0px',
    ].join(';');
    var MODULE_CONSOLE_DEBUG_STYLE_PLAIN_MODULE = [
        strTitleColor,
        'font-weight:900',
        'margin-right: 8px',
    ].join(';');
    var MODULE_CONSOLE_DEBUG_STYLE_PLAIN_TEXT_MESSAGE = [
       'all: unset;',
    ].join(';');
    // Set variables
    var strConsoleMessage = "";
    var strNotificationMessage = "";
    var strResultFlag = "";
    var strMessageFlag = "";
    
    // Check for mandatory message
    if (!message) {
        throw new Error("Message parameter is mandatory for postConsoleAndNotification");
    }
    
    var strMessage = message;
    var strResult = result;
    if (!strResult){
        //They are not passing a variable or array
    } 
    // Build the Debug
    strNotificationMessage = MODULE_AUTHOR + " " + MODULE_CONSOLE_COMMON_PIPE + " " + strModuleTitle + ": " + strMessage + " | " + strResult;

    if (blnDebug == true) {
        // It is a debug message.
        if (COFFEEPUB.blnDebugOn) {
            // Debug Mode is ON so display it.
            if (COFFEEPUB.blnFancyConsole) {
                // Add the VALUE tag if needed
                if (strMessage){
                    //They are passing a variable or array
                    strMessageFlag = "%c\nMESSAGE:%c"; // 4,5
                } else {
                    strMessageFlag = "";
                    MODULE_CONSOLE_DEBUG_STYLE_FANCY_LABEL_MESSAGE = "";
                    MODULE_CONSOLE_DEBUG_STYLE_FANCY_TEXT_MESSAGE = "";
                }
                if (strResult){
                    //They are passing a variable or array
                    strResultFlag = "%c\nRESULTS:%c";
                } else {
                    strResultFlag = "";
                    MODULE_CONSOLE_DEBUG_STYLE_FANCY_LABEL_RESULT = "";
                    MODULE_CONSOLE_DEBUG_STYLE_FANCY_TEXT_RESULT = "";
                }
                if (COFFEEPUB.strConsoleDebugStyle == "fancy") {
                    // FANCY STYLE
                    // BUILD Content
                    strConsoleMessage = "%c" + MODULE_CONSOLE_COMMON_ICON_BUG + " " + MODULE_AUTHOR + " " + MODULE_CONSOLE_COMMON_PIPE  + " " + strModuleTitle + " DEBUG" + strMessageFlag + strMessage + strResultFlag;
                    // PUBLISH with Styles
                    console.info(strConsoleMessage, MODULE_CONSOLE_DEBUG_STYLE_FANCY_CAPTION, MODULE_CONSOLE_DEBUG_STYLE_FANCY_LABEL_MESSAGE, MODULE_CONSOLE_DEBUG_STYLE_FANCY_TEXT_MESSAGE, MODULE_CONSOLE_DEBUG_STYLE_FANCY_LABEL_RESULT,MODULE_CONSOLE_DEBUG_STYLE_FANCY_TEXT_RESULT, strResult);
                } else if (COFFEEPUB.strConsoleDebugStyle == "simple") {
                    // SIMPLE STYLE
                    // BUILD Content
                    strConsoleMessage = "%c" + MODULE_CONSOLE_COMMON_ICON_BUG + " " + MODULE_AUTHOR + "%c" + MODULE_CONSOLE_COMMON_PIPE + "%c" + strModuleTitle  + " DEBUG" + strMessageFlag + strMessage + strResultFlag;
                    // PUBLISH with Styles
                    console.info(strConsoleMessage, MODULE_CONSOLE_DEBUG_STYLE_SIMPLE_AUTHOR, MODULE_CONSOLE_COMMON_STYLE_PIPE, MODULE_CONSOLE_DEBUG_STYLE_SIMPLE_MODULE, MODULE_CONSOLE_DEBUG_STYLE_SIMPLE_LABEL_MESSAGE, MODULE_CONSOLE_DEBUG_STYLE_SIMPLE_TEXT_MESSAGE, MODULE_CONSOLE_DEBUG_STYLE_SIMPLE_LABEL_RESULT,MODULE_CONSOLE_DEBUG_STYLE_SIMPLE_TEXT_RESULT, strResult );
                } else {
                    // PLAIN STYLE
                    strConsoleMessage =  "%c" + MODULE_AUTHOR + " " + MODULE_CONSOLE_COMMON_PIPE + "%c" + strModuleTitle + " DEBUG: %c" + strMessage;
                    console.info(strConsoleMessage, MODULE_CONSOLE_DEBUG_STYLE_PLAIN_AUTHOR, MODULE_CONSOLE_DEBUG_STYLE_PLAIN_MODULE, MODULE_CONSOLE_DEBUG_STYLE_PLAIN_TEXT_MESSAGE, strResult);
                }
            } else {
                // UNSTYLED NOT-FANCY CONSOLE
                strConsoleMessage = MODULE_AUTHOR + " " + MODULE_CONSOLE_COMMON_PIPE + " " + strModuleTitle + " DEBUG: " + strMessage;
                console.info(strConsoleMessage, strResult);
            }
            if (blnNotification){
                ui.notifications.warn(strNotificationMessage, {permanent: true, console: false});
            }
        }   
    } else {
        // Normal Mode (NOT DEBUG)
        if (COFFEEPUB.blnFancyConsole) {
            strConsoleMessage = "%c" + MODULE_AUTHOR + "%c" + MODULE_CONSOLE_COMMON_PIPE + "%c" + strModuleTitle + "%c" + strMessage;
            console.info(strConsoleMessage, MODULE_CONSOLE_NORMAL_STYLE_AUTHOR, MODULE_CONSOLE_COMMON_STYLE_PIPE, MODULE_CONSOLE_NORMAL_STYLE_MODULE, MODULE_CONSOLE_NORMAL_STYLE_TEXT, strResult);
        } else {
            strConsoleMessage = MODULE_AUTHOR + " " + MODULE_CONSOLE_COMMON_PIPE + " " + strModuleTitle + ": " + strMessage;
            console.info(strConsoleMessage, strResult);
        }
        if (blnNotification){
            ui.notifications.info(strNotificationMessage, {permanent: false, console: false});
        }
    }
}

/**
 * Checks if a combatant or actor is a player character
 * @param {Object} entity - The combatant or actor to check
 * @returns {boolean} - True if the entity is a player character
 */
export function isPlayerCharacter(entity) {
    postConsoleAndNotification('isPlayerCharacter - Checking entity:', entity, false, true, false);

    // If we're passed a combatant, check its actor
    if (entity?.actor) {
        const result = entity.actor.hasPlayerOwner || 
                      entity.actor.type === 'character' ||
                      game.users.find(u => u.character?.name === entity.name);
        postConsoleAndNotification('isPlayerCharacter - Combatant check result:', {
            name: entity.name,
            hasPlayerOwner: entity.actor.hasPlayerOwner,
            type: entity.actor.type,
            isPC: result
        }, false, true, false);
        return result;
    }
    
    // If we're passed an actor directly
    if (entity?.type === 'actor') {
        const result = entity.hasPlayerOwner || 
                      entity.type === 'character' ||
                      game.users.find(u => u.character?.id === entity.id);
        postConsoleAndNotification('isPlayerCharacter - Actor check result:', {
            name: entity.name,
            hasPlayerOwner: entity.hasPlayerOwner,
            type: entity.type,
            isPC: result
        }, false, true, false);
        return result;
    }
    
    // If we're passed just a name
    if (typeof entity === 'string') {
        // First try to find a player character with this name
        const playerActor = game.actors.find(a => 
            a.name === entity && 
            (a.hasPlayerOwner || a.type === 'character' || game.users.find(u => u.character?.id === a.id))
        );
        
        // If no player character found, check if any user has this character name
        const isUserCharacter = game.users.some(u => u.character?.name === entity);
        
        postConsoleAndNotification('isPlayerCharacter - Name check result:', {
            name: entity,
            foundPlayerActor: !!playerActor,
            isUserCharacter,
            isPC: !!playerActor || isUserCharacter
        }, false, true, false);
        
        return !!playerActor || isUserCharacter;
    }
    
    postConsoleAndNotification('isPlayerCharacter - No valid entity type found', "", false, true, false);
    return false;
}