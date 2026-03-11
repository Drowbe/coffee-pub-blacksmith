import { MODULE } from './const.js';
import { getSettingSafely, postConsoleAndNotification, formatTime, playSound } from './api-core.js';
import { RoundTimer } from './timer-round.js';
import { CombatTracker } from './combat-tracker.js';
import { UIContextMenu } from './ui-context-menu.js';
import { easeHorizontalScroll } from './combat-bar-scroll.js';
import { HookManager } from './manager-hooks.js';

export class CombatBarManager {
    static initialize(menuBar) {
        if (menuBar.__combatBarManagerInitialized) return;
        menuBar.__combatBarManagerInitialized = true;
        menuBar.__combatBarUserClosed = false;

        this._installMenuBarPatches(menuBar);
        menuBar.secondaryBarToolMapping.set('combat', 'combat-bar');
        this.registerCombatHooks(menuBar);
        this.registerCombatBarEvents(menuBar);
        this.registerCombatCleanupHook(menuBar);
        this.checkActiveCombatOnLoad(menuBar);
        this.registerCombatPartial().catch((error) => {
            postConsoleAndNotification(MODULE.NAME, "Menubar: Error registering combat partial", error?.message || error, true, false);
        });
        const ensureCombatType = async () => {
            try {
                if (!menuBar.secondaryBarTypes?.has?.('combat')) {
                    await CombatBarManager.registerCombatBarType(menuBar);
                }
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, "Menubar: Error registering combat secondary bar type", error?.message || error, true, false);
            }
        };
        if (game.ready) {
            ensureCombatType();
        } else {
            Hooks.once('ready', ensureCombatType);
        }
    }

    static _installMenuBarPatches(menuBar) {
        if (menuBar.__combatBarPatchesInstalled) return;
        menuBar.__combatBarPatchesInstalled = true;

        const originalRegisterSecondaryBarTypes = menuBar.registerSecondaryBarTypes.bind(menuBar);
        menuBar.registerSecondaryBarTypes = async function (...args) {
            await originalRegisterSecondaryBarTypes(...args);
            if (!menuBar.secondaryBarTypes?.has?.('combat')) {
                await CombatBarManager.registerCombatBarType(menuBar);
            }
        };

        const originalOpenSecondaryBar = menuBar.openSecondaryBar.bind(menuBar);
        menuBar.openSecondaryBar = function (typeId, options = {}) {
            if (typeId === 'combat') {
                if (menuBar.__combatBarUserClosed) return false;
                const combat = game.combat;
                const data = combat ? CombatBarManager.getCombatData(combat) : {
                    combatants: [],
                    currentRound: 0,
                    currentTurn: 0,
                    currentCombatant: '',
                    isGM: game.user.isGM,
                    isActive: false,
                    actionButton: null
                };
                return originalOpenSecondaryBar(typeId, { ...options, data });
            }
            return originalOpenSecondaryBar(typeId, options);
        };

        const originalCloseSecondaryBar = menuBar.closeSecondaryBar.bind(menuBar);
        menuBar.closeSecondaryBar = function (userInitiated = false, syncButtons = true) {
            if (userInitiated && menuBar.secondaryBar.type === 'combat') {
                menuBar.__combatBarUserClosed = true;
            }
            CombatBarManager.hideCombatantHoverCard(menuBar);
            return originalCloseSecondaryBar(userInitiated, syncButtons);
        };

        const originalToggleSecondaryBar = menuBar.toggleSecondaryBar.bind(menuBar);
        menuBar.toggleSecondaryBar = function (typeId, options = {}) {
            if (typeId === 'combat' && (!menuBar.secondaryBar.isOpen || menuBar.secondaryBar.type !== 'combat')) {
                menuBar.__combatBarUserClosed = false;
            }
            return originalToggleSecondaryBar(typeId, options);
        };

        const originalUpdateSecondaryBar = menuBar.updateSecondaryBar.bind(menuBar);
        menuBar.updateSecondaryBar = function (data) {
            if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                menuBar.secondaryBar.data = data;
                menuBar.renderMenubar(true);
                return true;
            }
            return originalUpdateSecondaryBar(data);
        };

        const originalPrepareSecondaryBarData = menuBar._prepareSecondaryBarData.bind(menuBar);
        menuBar._prepareSecondaryBarData = function () {
            const data = originalPrepareSecondaryBarData();
            if (data?.isOpen && data.type === 'combat' && !data.data) {
                const combat = game.combat;
                data.data = combat ? CombatBarManager.getCombatData(combat) : {
                    combatants: [],
                    currentRound: 0,
                    currentTurn: 0,
                    currentCombatant: '',
                    isGM: game.user.isGM,
                    isActive: false,
                    actionButton: null
                };
            }
            return data;
        };

        const originalRenderMenubar = menuBar.renderMenubar.bind(menuBar);
        menuBar.renderMenubar = async function (...args) {
            const result = await originalRenderMenubar(...args);
            if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                requestAnimationFrame(() => {
                    CombatBarManager.updateCombatPortraitScrollArrows(menuBar);
                    CombatBarManager.attachCombatPortraitScrollListener(menuBar);
                    setTimeout(() => CombatBarManager.updateCombatPortraitScrollArrows(menuBar), 100);
                });
            }
            return result;
        };
    }
    static async registerCombatPartial() {
        const combatBarTemplate = await fetch('modules/coffee-pub-blacksmith/templates/partials/menubar-combat.hbs')
            .then(response => response.text());
        Handlebars.registerPartial('menubar-combat', combatBarTemplate);
    }

    static async registerCombatBarType(menuBar) {
        await menuBar.registerSecondaryBarType('combat', {
            height: menuBar.getSecondaryBarHeight('combat'),
            persistence: 'manual',
            autoCloseDelay: 10000,
            templatePath: 'modules/coffee-pub-blacksmith/templates/partials/menubar-combat.hbs'
        });
    }

    static registerCombatHooks(menuBar) {
        const combatUpdateHookId = HookManager.registerHook({
            name: 'updateCombat',
            description: 'MenuBar: Update combat bar on combat changes',
            context: 'menubar-combat-update',
            priority: 3,
            callback: (_combat, updateData) => {
                const shouldUpdate = updateData.turn !== undefined ||
                    updateData.round !== undefined ||
                    updateData.combatants !== undefined;
                if (shouldUpdate) CombatBarManager.updateCombatBar(menuBar);
            }
        });

        const combatCreateHookId = HookManager.registerHook({
            name: 'createCombat',
            description: 'MenuBar: Open combat bar when combat is created',
            context: 'menubar-combat-create',
            priority: 3,
            callback: () => {
                const shouldShowCombatBar = game.settings.get(MODULE.ID, 'menubarCombatShow');
                if (shouldShowCombatBar) CombatBarManager.openCombatBar(menuBar);
            }
        });

        const combatantCreateHookId = HookManager.registerHook({
            name: 'createCombatant',
            description: 'MenuBar: Open combat bar when combatants are added',
            context: 'menubar-combatant-create',
            priority: 3,
            callback: (combatant) => {
                if (combatant.combat.combatants.size === 1) {
                    const shouldShowCombatBar = game.settings.get(MODULE.ID, 'menubarCombatShow');
                    if (shouldShowCombatBar) CombatBarManager.openCombatBar(menuBar);
                } else if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                    CombatBarManager.updateCombatBar(menuBar);
                }
            }
        });

        const combatantUpdateHookId = HookManager.registerHook({
            name: 'updateCombatant',
            description: 'MenuBar: Update combat bar when combatants are updated',
            context: 'menubar-combatant-update',
            priority: 3,
            callback: (_combatant, updateData) => {
                const initiativeUpdated = updateData.initiative !== undefined;
                if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                    CombatBarManager.updateCombatBar(menuBar);
                    if (initiativeUpdated) menuBar.renderMenubar();
                }
            }
        });

        const combatantDeleteHookId = HookManager.registerHook({
            name: 'deleteCombatant',
            description: 'MenuBar: Update combat bar when combatants are removed',
            context: 'menubar-combatant-delete',
            priority: 3,
            callback: () => {
                if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                    CombatBarManager.updateCombatBar(menuBar);
                }
            }
        });

        const combatDeleteHookId = HookManager.registerHook({
            name: 'deleteCombat',
            description: 'MenuBar: Close combat bar when combat is deleted',
            context: 'menubar-combat-delete',
            priority: 3,
            callback: () => {
                CombatBarManager.closeCombatBar(menuBar);
            }
        });

        const combatTrackerRenderHookId = HookManager.registerHook({
            name: 'renderApplication',
            description: 'MenuBar: Update combat tracker button when combat tracker window opens',
            context: 'menubar-combat-tracker-render',
            priority: 3,
            callback: (app) => {
                if (app && app.appId === 'combat') menuBar.renderMenubar(true);
            }
        });

        const combatTrackerCloseHookId = HookManager.registerHook({
            name: 'closeApplication',
            description: 'MenuBar: Update combat tracker button when combat tracker window closes',
            context: 'menubar-combat-tracker-close',
            priority: 3,
            callback: (app) => {
                if (app && app.appId === 'combat') menuBar.renderMenubar(true);
            }
        });

        const updateActorHookId = HookManager.registerHook({
            name: 'updateActor',
            description: 'MenuBar: Update combat bar when actor HP changes',
            context: 'menubar-actor-update',
            priority: 3,
            callback: (actor, updateData) => {
                if (CombatBarManager.isCombatBarActive(menuBar)) CombatBarManager.handleActorHpChange(menuBar, actor, updateData);
                if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'party') {
                    menuBar._refreshPartyBarInfo();
                }
            }
        });

        const updateTokenHookId = HookManager.registerHook({
            name: 'updateToken',
            description: 'MenuBar: Update combat bar when token HP changes',
            context: 'menubar-token-update',
            priority: 3,
            callback: (token, updateData) => {
                if (CombatBarManager.isCombatBarActive(menuBar)) CombatBarManager.handleTokenHpChange(menuBar, token, updateData);
            }
        });

        const combatSizeSettingHookId = HookManager.registerHook({
            name: 'settingChange',
            description: 'MenuBar: Refresh combat bar when combat size changes',
            context: 'menubar-combat-size-change',
            priority: 3,
            callback: (module, key, value) => {
                if (module !== MODULE.ID || key !== 'menubarCombatSize') return;
                document.documentElement.style.setProperty('--blacksmith-menubar-secondary-combat-height', `${value}px`);
                if (game.combat && menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                    CombatBarManager.updateCombatBar(menuBar);
                }
            }
        });

        menuBar._registeredHooks = {
            combatUpdateHookId,
            combatCreateHookId,
            combatantCreateHookId,
            combatantUpdateHookId,
            combatantDeleteHookId,
            combatDeleteHookId,
            combatTrackerRenderHookId,
            combatTrackerCloseHookId,
            updateActorHookId,
            updateTokenHookId,
            combatSizeSettingHookId
        };

        postConsoleAndNotification(MODULE.NAME, "MenuBar: Combat hooks registered", "", true, false);
    }

    static registerCombatCleanupHook(menuBar) {
        Hooks.once('ready', () => {
            HookManager.registerHook({
                name: 'unloadModule',
                description: 'MenuBar: Cleanup on module unload',
                context: 'menubar-cleanup',
                priority: 3,
                callback: (moduleId) => {
                    if (moduleId === MODULE.ID) menuBar._cleanupCombatBarEvents();
                }
            });
        });
    }
    static updateCombatPortraitScrollArrows(_menuBar) {
        const wrapper = document.querySelector('.combat-portraits-scroll-wrapper');
        if (!wrapper) return;
        const portraits = wrapper.querySelector('.combat-portraits');
        const leftBtn = wrapper.querySelector('.combat-scroll-arrow[data-control="scrollCombatantsLeft"]');
        const rightBtn = wrapper.querySelector('.combat-scroll-arrow[data-control="scrollCombatantsRight"]');
        if (!portraits || !leftBtn || !rightBtn) return;

        const contentWidth = portraits.scrollWidth;
        const visibleWidth = portraits.clientWidth;
        const overflowing = contentWidth > visibleWidth + 1 || (visibleWidth < 80 && contentWidth > 0);
        wrapper.classList.toggle('combat-portraits-overflowing', overflowing);

        if (!overflowing) {
            leftBtn.disabled = false;
            rightBtn.disabled = false;
            return;
        }

        const tolerance = 2;
        const maxScrollLeft = Math.max(0, contentWidth - visibleWidth);
        const currentScrollLeft = portraits.scrollLeft || 0;
        leftBtn.disabled = currentScrollLeft <= tolerance;
        rightBtn.disabled = currentScrollLeft >= (maxScrollLeft - tolerance);
    }

    static attachCombatPortraitScrollListener(menuBar) {
        const wrapper = document.querySelector('.combat-portraits-scroll-wrapper');
        const portraits = wrapper?.querySelector('.combat-portraits');
        if (!portraits || portraits.dataset.scrollListenerAttached === 'true') return;
        portraits.dataset.scrollListenerAttached = 'true';
        portraits.addEventListener('scroll', () => CombatBarManager.updateCombatPortraitScrollArrows(menuBar), { passive: true });
        if (wrapper) {
            const ro = new ResizeObserver(() => {
                requestAnimationFrame(() => CombatBarManager.updateCombatPortraitScrollArrows(menuBar));
            });
            ro.observe(wrapper);
        }
    }

    static cleanupCombatBarEvents(menuBar) {
        if (menuBar._combatBarClickHandler) {
            document.removeEventListener('click', menuBar._combatBarClickHandler);
            menuBar._combatBarClickHandler = null;
        }
        if (menuBar._combatBarDblClickHandler) {
            document.removeEventListener('dblclick', menuBar._combatBarDblClickHandler);
            menuBar._combatBarDblClickHandler = null;
        }
        if (menuBar._combatBarHoverMoveHandler) {
            document.removeEventListener('mousemove', menuBar._combatBarHoverMoveHandler);
            menuBar._combatBarHoverMoveHandler = null;
        }
        if (menuBar._combatBarContextMenuHandler) {
            document.removeEventListener('contextmenu', menuBar._combatBarContextMenuHandler);
            menuBar._combatBarContextMenuHandler = null;
        }

        CombatBarManager.hideCombatantHoverCard(menuBar);
        UIContextMenu.close('blacksmith-combat-portrait-context-menu');
        menuBar.removeClickHandlers();
        menuBar._stopTimerUpdates();
        postConsoleAndNotification(MODULE.NAME, "MenuBar: Combat bar event handlers and timer intervals cleaned up", "", true, false);
    }

    static checkActiveCombatOnLoad(menuBar) {
        try {
            const combat = game.combats.active;
            if (combat && combat.combatants.size > 0) {
                postConsoleAndNotification(MODULE.NAME, "Combat Bar: Combat with combatants found on load", "", true, false);
                setTimeout(() => {
                    const shouldShowCombatBar = getSettingSafely(MODULE.ID, 'menubarCombatShow', false);
                    if (shouldShowCombatBar) CombatBarManager.openCombatBar(menuBar);
                }, 500);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error checking active combat on load", { error }, false, false);
        }
    }

    static updateCombatBar(menuBar, combatData = null) {
        try {
            if (menuBar._isUserExcluded(game.user)) return false;
            if (!menuBar.secondaryBar.isOpen || menuBar.secondaryBar.type !== 'combat') return false;

            const combat = game.combats.active;
            if (!combat) return CombatBarManager.closeCombatBar(menuBar);

            const data = combatData || CombatBarManager.getCombatData(combat);
            CombatBarManager.hideCombatantHoverCard(menuBar);
            return menuBar.updateSecondaryBar(data);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error updating combat bar", { error }, false, false);
            return false;
        }
    }

    static getCombatData(combat) {
        try {
            if (!combat) return {};

            const hideNpcHealthSetting = game.settings.get(MODULE.ID, 'menubarCombatHideHealthBars');
            const hideNpcHealth = hideNpcHealthSetting && !game.user.isGM;
            const isGM = game.user.isGM;

            const combatants = combat.combatants.map(combatant => {
                const token = combatant.token;
                const actor = combatant.actor;
                const isHidden = combatant.hidden || token?.hidden;
                if (!isGM && isHidden) return null;

                let currentHP = 0;
                let maxHP = 0;
                let healthPercentage = 100;
                let healthCircumference = 0;
                let healthDashOffset = 0;
                let healthClass = 'combat-portrait-ring-healthy';
                let healthRingHidden = false;

                const secondaryHeightStr = getComputedStyle(document.documentElement).getPropertyValue('--blacksmith-menubar-secondary-combat-height');
                const secondaryHeight = parseInt(secondaryHeightStr, 10) || 50;
                const size = Math.floor(secondaryHeight * 0.8);
                const strokeWidth = Math.max(2, Math.floor(size * 0.05));
                const radius = (size / 2) - (strokeWidth / 2);

                if (actor) {
                    const isNpc = !actor.hasPlayerOwner;
                    if (hideNpcHealth && isNpc) healthRingHidden = true;
                    if (actor.system?.attributes?.hp) {
                        currentHP = actor.system.attributes.hp.value || 0;
                        maxHP = actor.system.attributes.hp.max || 1;
                    } else if (actor.system?.hitPoints) {
                        currentHP = actor.system.hitPoints.value || 0;
                        maxHP = actor.system.hitPoints.max || 1;
                    }
                    if (maxHP > 0) healthPercentage = Math.max(0, Math.min(100, (currentHP / maxHP) * 100));
                    const circumference = 2 * Math.PI * radius;
                    const dashOffset = currentHP <= 0 ? 0 : circumference - (healthPercentage / 100) * circumference;
                    healthCircumference = circumference;
                    healthDashOffset = dashOffset;
                    if (currentHP <= 0) healthClass = 'combat-portrait-ring-dead';
                    else if (healthPercentage >= 75) healthClass = 'combat-portrait-ring-healthy';
                    else if (healthPercentage >= 50) healthClass = 'combat-portrait-ring-injured';
                    else if (healthPercentage >= 25) healthClass = 'combat-portrait-ring-bloodied';
                    else healthClass = 'combat-portrait-ring-critical';
                }

                let isActuallyDead = false;
                if (actor) {
                    if (actor.type === "character") isActuallyDead = combatant.isDefeated || false;
                    else isActuallyDead = (actor.system?.attributes?.hp?.value || 0) <= 0;
                }

                return {
                    id: combatant.id,
                    name: token?.name || actor?.name || 'Unknown',
                    portrait: actor?.img || token?.img || 'modules/coffee-pub-blacksmith/images/portraits/portrait-noimage.webp',
                    initiative: combatant.initiative || 0,
                    isCurrent: combatant.id === combat.current.combatantId,
                    isDefeated: isActuallyDead,
                    needsInitiative: combatant.initiative === null,
                    canRollInitiative: combatant.initiative === null && combatant.isOwner && !isActuallyDead,
                    currentHP,
                    maxHP,
                    healthPercentage,
                    healthCircumference,
                    healthDashOffset: healthRingHidden ? 0 : healthDashOffset,
                    healthClass: healthRingHidden ? 'combat-portrait-ring-hidden' : healthClass,
                    healthRingHidden,
                    svgSize: size,
                    svgCenter: size / 2,
                    svgRadius: radius,
                    svgStrokeWidth: strokeWidth,
                    isHidden
                };
            }).filter(combatant => combatant !== null);

            combatants.sort((a, b) => b.initiative - a.initiative);

            let actionButton = null;
            if (game.user.isGM) {
                actionButton = !combat.started
                    ? { control: 'beginCombat', label: 'Begin Combat', tooltip: 'Begin Combat', icon: 'fa-play', text: 'Begin Combat', type: 'begin' }
                    : { control: 'endCombat', label: 'End Combat', tooltip: 'End Combat', icon: 'fa-stop', text: 'End Combat', type: 'end' };
            } else {
                const currentCombatant = combat.combatants.get(combat.current.combatantId);
                const isPlayerTurn = currentCombatant && currentCombatant.isOwner;
                if (combat.started && isPlayerTurn) {
                    actionButton = { control: 'endTurn', label: 'End Turn', tooltip: 'End Turn', icon: 'fa-flag-checkered', text: 'End Turn', type: 'turn' };
                }
            }

            const currentRound = combat.round || 0;
            const totalTurns = Array.isArray(combat.turns) ? combat.turns.length : combat.combatants.size;
            const currentTurnIndex = typeof combat.turn === 'number' ? combat.turn : 0;
            const currentTurn = Math.min(currentTurnIndex + 1, Math.max(totalTurns, 1));
            const currentCombatantName = combat.combatant?.name || 'No Active Turn';
            const totalCombatDurationBase = combat.getFlag(MODULE.ID, 'totalCombatDuration') || 0;
            const stats = combat.getFlag(MODULE.ID, 'stats') || {};
            const accumulated = stats.accumulatedTime || 0;
            const roundStart = stats.roundStartTimestamp || 0;
            const isActive = RoundTimer?.isActive ?? true;
            const runningRound = (roundStart && isActive) ? Math.max(0, Date.now() - roundStart) : 0;
            const currentRoundDurationMs = accumulated + runningRound;
            const totalCombatDurationMs = totalCombatDurationBase + currentRoundDurationMs;

            return {
                combatants,
                actionButton,
                currentRound,
                currentTurn,
                totalTurns,
                currentCombatant: currentCombatantName,
                totalCombatDuration: formatTime(totalCombatDurationMs || 0, 'hh:mm:ss'),
                currentRoundDuration: formatTime(currentRoundDurationMs || 0, 'hh:mm:ss'),
                isGM: game.user.isGM,
                isActive: combat.started || false
            };
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error gathering combat data", { error }, false, false);
            return {};
        }
    }

    static isCombatBarActive(menuBar) {
        return menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat';
    }

    static didHpChange(updateData) {
        if (!updateData) return false;
        const targets = [
            'system.attributes.hp.value',
            'system.attributes.hp.temp',
            'system.attributes.hp.max',
            'system.attributes.hp.base',
            'system.attributes.hp.bonus',
            'system.vitals.hp.value',
            'system.vitals.hp.temp',
            'system.vitals.hp.max',
            'system.hitPoints.value',
            'system.hitPoints.max',
            'system.hp.value',
            'system.hp.max',
            'actorData.system.attributes.hp.value',
            'actorData.system.attributes.hp.temp',
            'actorData.system.attributes.hp.max',
            'actorData.system.hitPoints.value',
            'actorData.system.hitPoints.max',
            'actorData.system.hp.value',
            'actorData.system.hp.max'
        ];
        const flat = foundry.utils.flattenObject(updateData || {});
        const changed = targets.some(path => flat[path] !== undefined);
        if (changed) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: HP change detected in update data', { paths: targets.filter(path => flat[path] !== undefined), values: flat }, true, false);
        }
        return changed;
    }

    static handleActorHpChange(menuBar, actor, updateData) {
        try {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: updateActor received', { actorId: actor?.id, updateData }, true, false);
            if (!CombatBarManager.isCombatBarActive(menuBar)) return;
            if (!CombatBarManager.didHpChange(updateData)) return;
            const combat = game.combats?.active;
            if (!combat) return;
            const isCombatant = combat.combatants.some(combatant => combatant.actor?.id === actor?.id);
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Actor HP change evaluated', { isCombatant }, true, false);
            if (!isCombatant) return;
            CombatBarManager.updateCombatBar(menuBar);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Failed to process actor HP change', { actorId: actor?.id, error }, true, false);
        }
    }

    static handleTokenHpChange(menuBar, token, updateData) {
        try {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: updateToken received', { tokenId: token?.id, updateData }, true, false);
            if (!CombatBarManager.isCombatBarActive(menuBar)) return;
            const hpChanged = CombatBarManager.didHpChange(updateData);
            const hiddenChanged = 'hidden' in updateData;
            if (!hpChanged && !hiddenChanged) return;
            const combat = game.combats?.active;
            if (!combat) return;
            const tokenId = token?.id;
            const actorId = token?.actor?.id;
            const isCombatant = combat.combatants.some(combatant => combatant.token?.id === tokenId || combatant.actor?.id === actorId);
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Token change evaluated', { isCombatant, hpChanged, hiddenChanged }, true, false);
            if (!isCombatant) return;
            CombatBarManager.updateCombatBar(menuBar);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Failed to process token change', { tokenId: token?.id, error }, true, false);
        }
    }

    static openCombatBar(menuBar, combatData = null) {
        try {
            if (menuBar._isUserExcluded(game.user)) return false;
            const combatHeight = game.settings.get(MODULE.ID, 'menubarCombatSize');
            document.documentElement.style.setProperty('--blacksmith-menubar-secondary-combat-height', `${combatHeight}px`);
            const combat = game.combats.active;
            if (!combat) return false;
            const data = combatData || CombatBarManager.getCombatData(combat);
            return menuBar.openSecondaryBar('combat', { data, persistence: 'manual' });
        } catch (_error) {
            return false;
        }
    }

    static closeCombatBar(menuBar) {
        try {
            if (menuBar._isUserExcluded(game.user)) return true;
            if (menuBar.secondaryBar.isOpen && menuBar.secondaryBar.type === 'combat') {
                menuBar.__combatBarUserClosed = false;
                CombatBarManager.hideCombatantHoverCard(menuBar);
                return menuBar.closeSecondaryBar();
            }
            return true;
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error closing combat bar", { error }, false, false);
            return false;
        }
    }

    static async toggleCombatTracker() {
        try {
            if (CombatTracker.isCombatTrackerOpen()) {
                await CombatTracker.closeCombatTracker();
            } else {
                CombatTracker.openCombatTracker();
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error toggling combat tracker", error, false, false);
        }
    }

    static async rollInitiativeForCombatant(_menuBar, combatant, _event = null) {
        try {
            if (!combatant?.actor) return;

            if (!combatant.isOwner && !game.user.isGM) {
                ui.notifications.warn(`You don't have permission to roll initiative for ${combatant.name}`);
                return;
            }

            postConsoleAndNotification(MODULE.NAME, `Combat Bar: Rolling initiative for ${combatant.name}`, "", true, false);

            if (ui.combat) {
                try {
                    const el = ui.combat.element.querySelector(`[data-combatant-id="${combatant.id}"] .combatant-control[data-control="rollInitiative"]`);
                    if (el) {
                        el.click();
                        return;
                    }
                } catch (_trackerError) { /* fallback below */ }
            }

            if (game.dnd5e && combatant.actor.rollInitiative) {
                const rollMethod = combatant.actor.rollInitiative.toString();
                if (rollMethod.includes('dialog') || rollMethod.includes('Dialog')) {
                    await combatant.actor.rollInitiative();
                } else {
                    await combatant.actor.rollInitiative({});
                }
            } else {
                await combatant.rollInitiative();
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Combat Bar: Error rolling initiative for ${combatant?.name || 'combatant'}`, error, true, false);
        }
    }

    static registerCombatBarEvents(menuBar) {
        if (menuBar._combatBarClickHandler) return;

        menuBar._combatBarClickHandler = async (event) => {
            if (event.target.closest('.combatbar-button[data-control="toggleTracker"]')) {
                event.preventDefault();
                event.stopPropagation();
                await menuBar.toggleCombatTracker();
                return;
            }

            const combatPortrait = event.target.closest('[data-combatant-id]');
            if (combatPortrait) {
                const isInitiativeDice = event.target.closest('.combat-portrait-initiative-dice');
                const isDeadOverlay = event.target.closest('.combat-portrait-dead-overlay');
                const isInteractiveElement = event.target.closest('a, button, .combatant-control');
                if (!isInitiativeDice && !isDeadOverlay && !isInteractiveElement) {
                    const combatantId = combatPortrait.getAttribute('data-combatant-id');
                    if (combatantId) {
                        event.preventDefault();
                        event.stopPropagation();
                        CombatBarManager.panToCombatant(menuBar, combatantId, { selectToken: game.user.isGM });
                        return;
                    }
                }
            }

            if (event.target.closest('.combatbar-button[data-control="previousRound"]')) {
                event.preventDefault();
                event.stopPropagation();
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.previousRound();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Previous round", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error going to previous round", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="nextRound"]')) {
                event.preventDefault();
                event.stopPropagation();
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.nextRound();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Next round", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error going to next round", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="previousTurn"]')) {
                event.preventDefault();
                event.stopPropagation();
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.previousTurn();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Previous turn", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error going to previous-turn turn", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="nextTurn"]')) {
                event.preventDefault();
                event.stopPropagation();
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.nextTurn();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Next turn", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error going to next turn", error, true, false);
                }
                return;
            }

            const scrollLeftBtn = event.target.closest('.combat-scroll-arrow[data-control="scrollCombatantsLeft"]');
            const scrollRightBtn = event.target.closest('.combat-scroll-arrow[data-control="scrollCombatantsRight"]');
            if (scrollLeftBtn || scrollRightBtn) {
                event.preventDefault();
                event.stopPropagation();
                const bar = event.target.closest('.combat-tracker-bar');
                const portraits = bar?.querySelector('.combat-portraits');
                if (portraits) {
                    const first = portraits.querySelector('.combat-portrait-container');
                    const step = first ? first.offsetWidth + (parseInt(getComputedStyle(portraits).gap, 10) || 2) : Math.floor(portraits.clientWidth * 0.4);
                    const delta = scrollLeftBtn ? -step : step;
                    easeHorizontalScroll(portraits, delta, 220, () => CombatBarManager.updateCombatPortraitScrollArrows(menuBar));
                    setTimeout(() => CombatBarManager.updateCombatPortraitScrollArrows(menuBar), 400);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="beginCombat"]')) {
                event.preventDefault();
                event.stopPropagation();
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.startCombat();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Combat started", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error starting combat", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="endCombat"]')) {
                event.preventDefault();
                event.stopPropagation();
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.endCombat();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Combat ended", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error ending combat", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="endTurn"]')) {
                event.preventDefault();
                event.stopPropagation();
                try {
                    const combat = game.combat;
                    if (combat) {
                        await combat.nextTurn();
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Turn ended", "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error ending turn", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combatbar-button[data-control="rollInitiative"]')) {
                event.preventDefault();
                event.stopPropagation();
                try {
                    const combat = game.combat;
                    if (!combat) {
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: No active combat found", "", true, false);
                        return;
                    }
                    const autoRollEnabled = game.settings.get(MODULE.ID, 'combatTrackerRollInitiativePlayer');
                    const ownedPCsNeedingInitiative = combat.combatants.filter(c =>
                        c?.actor && c.actor.type === "character" && c.isOwner && c.initiative === null
                    );
                    if (ownedPCsNeedingInitiative.length === 0) {
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: No owned characters need initiative", "", true, false);
                        return;
                    }
                    if (autoRollEnabled) {
                        postConsoleAndNotification(MODULE.NAME, "Combat Bar: Using core auto-roll functionality", "", true, false);
                        const CT = await import('./combat-tracker.js');
                        await CT.CombatTracker._rollInitiativeForPlayerCharacters(combat);
                    } else {
                        const nextCombatant = ownedPCsNeedingInitiative[0];
                        await CombatBarManager.rollInitiativeForCombatant(menuBar, nextCombatant, event);
                        postConsoleAndNotification(MODULE.NAME, `Combat Bar: Rolled initiative for ${nextCombatant.name}`, "", true, false);
                    }
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, "Combat Bar: Error rolling initiative", error, true, false);
                }
                return;
            }

            if (event.target.closest('.combat-portrait-initiative-dice a[data-control="rollInitiative"]')) {
                event.preventDefault();
                event.stopPropagation();
                const button = event.target.closest('a');
                const combatantId = button?.dataset?.combatantId;
                if (!combatantId) return;
                try {
                    const combat = game.combat;
                    if (!combat) return;
                    const combatant = combat.combatants.get(combatantId);
                    if (!combatant) return;
                    await CombatBarManager.rollInitiativeForCombatant(menuBar, combatant, event);
                    CombatBarManager.updateCombatBar(menuBar);
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, `Combat Bar: Error rolling initiative for combatant ${combatantId}`, error, true, false);
                }
            }
        };

        menuBar._combatBarDblClickHandler = async (event) => {
            if (!game.user.isGM) return;
            const portrait = event.target.closest('[data-combatant-id]');
            if (!portrait) return;
            const isInitiativeDice = event.target.closest('.combat-portrait-initiative-dice');
            const isDeadOverlay = event.target.closest('.combat-portrait-dead-overlay');
            const isInteractiveElement = event.target.closest('a, button, .combatant-control');
            if (isInitiativeDice || isDeadOverlay || isInteractiveElement) return;
            const combatantId = portrait.getAttribute('data-combatant-id');
            if (!combatantId) return;
            event.preventDefault();
            event.stopPropagation();
            await CombatBarManager.setCurrentCombatant(menuBar, combatantId);
        };

        document.addEventListener('click', menuBar._combatBarClickHandler);
        document.addEventListener('dblclick', menuBar._combatBarDblClickHandler);

        menuBar._combatBarHoverMoveHandler = (event) => {
            const portrait = event.target?.closest?.('.blacksmith-menubar-secondary .combat-portrait-container[data-combatant-id]');
            if (!portrait || !CombatBarManager.isCombatBarActive(menuBar)) {
                CombatBarManager.hideCombatantHoverCard(menuBar);
                return;
            }
            const combatantId = portrait.getAttribute('data-combatant-id');
            if (!combatantId) {
                CombatBarManager.hideCombatantHoverCard(menuBar);
                return;
            }
            if (menuBar._combatHoverCardCombatantId !== combatantId || !menuBar._combatHoverCardEl) {
                CombatBarManager.showCombatantHoverCard(menuBar, combatantId, event);
            } else {
                CombatBarManager.positionCombatantHoverCard(menuBar, event);
            }
        };
        document.addEventListener('mousemove', menuBar._combatBarHoverMoveHandler);

        menuBar._combatBarContextMenuHandler = (event) => {
            const portrait = event.target?.closest?.('.blacksmith-menubar-secondary .combat-portrait-container[data-combatant-id]');
            if (!portrait || !CombatBarManager.isCombatBarActive(menuBar)) return;
            const combatantId = portrait.getAttribute('data-combatant-id');
            if (!combatantId) return;
            event.preventDefault();
            event.stopPropagation();
            CombatBarManager.hideCombatantHoverCard(menuBar);
            CombatBarManager.showCombatantPortraitContextMenu(menuBar, combatantId, event.clientX, event.clientY);
        };
        document.addEventListener('contextmenu', menuBar._combatBarContextMenuHandler);

        postConsoleAndNotification(MODULE.NAME, "MenuBar: Combat bar event handlers registered", "", true, false);
    }

    static showCombatantHoverCard(menuBar, combatantId, event) {
        const combat = game.combats?.active;
        const combatant = combat?.combatants?.get(combatantId);
        if (!combatant) {
            CombatBarManager.hideCombatantHoverCard(menuBar);
            return;
        }

        const hoverData = CombatBarManager.getCombatantHoverData(combatant);
        if (!hoverData) {
            CombatBarManager.hideCombatantHoverCard(menuBar);
            return;
        }

        if (!menuBar._combatHoverCardEl) {
            const card = document.createElement('div');
            card.id = 'blacksmith-combat-hover-card';
            card.className = 'blacksmith-combat-hover-card';
            document.body.appendChild(card);
            menuBar._combatHoverCardEl = card;
        }

        menuBar._combatHoverCardEl.innerHTML = CombatBarManager.buildCombatantHoverCardHtml(hoverData);
        menuBar._combatHoverCardEl.classList.add('is-visible');
        menuBar._combatHoverCardCombatantId = combatantId;
        CombatBarManager.positionCombatantHoverCard(menuBar, event);
    }

    static positionCombatantHoverCard(menuBar, event) {
        if (!menuBar._combatHoverCardEl || !event) return;
        const card = menuBar._combatHoverCardEl;
        const offset = 16;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = card.getBoundingClientRect();

        let x = event.clientX + offset;
        let y = event.clientY + offset;

        if (x + rect.width + 8 > vw) x = event.clientX - rect.width - offset;
        if (y + rect.height + 8 > vh) y = vh - rect.height - 8;
        if (x < 8) x = 8;
        if (y < 8) y = 8;

        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
    }

    static hideCombatantHoverCard(menuBar) {
        if (menuBar._combatHoverCardEl) {
            menuBar._combatHoverCardEl.remove();
            menuBar._combatHoverCardEl = null;
        }
        menuBar._combatHoverCardCombatantId = null;
    }

    static getCombatantHoverData(combatant) {
        const token = combatant?.token;
        const actor = combatant?.actor;
        if (!actor && !token) return null;

        let currentHP = 0;
        let maxHP = 0;
        if (actor?.system?.attributes?.hp) {
            currentHP = Number(actor.system.attributes.hp.value ?? 0);
            maxHP = Number(actor.system.attributes.hp.max ?? 0);
        } else if (actor?.system?.hitPoints) {
            currentHP = Number(actor.system.hitPoints.value ?? 0);
            maxHP = Number(actor.system.hitPoints.max ?? 0);
        }
        const hpPercent = maxHP > 0 ? Math.max(0, Math.min(100, (currentHP / maxHP) * 100)) : 0;
        const damagePercent = maxHP > 0 ? Math.max(0, Math.min(100, 100 - hpPercent)) : 0;
        const bloodStep = Math.round(damagePercent / 5) * 5;
        const bloodValue = currentHP <= 0 ? 101 : Math.max(0, Math.min(100, bloodStep));
        const bloodOverlay = `modules/coffee-pub-blacksmith/images/portraits/blood/blood-${bloodValue}.webp`;

        const ownerUsers = (game.users?.contents || [])
            .filter((u) => actor?.testUserPermission?.(u, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
        const nonGmOwners = ownerUsers
            .filter((u) => !u?.isGM)
            .map((u) => u.name)
            .slice(0, 2);
        const hasGmOwner = ownerUsers.some((u) => !!u?.isGM);
        const ownerLabel = nonGmOwners.length
            ? nonGmOwners.join(', ')
            : (hasGmOwner ? 'NPC' : (actor?.type ? String(actor.type).toUpperCase() : 'COMBATANT'));
        const isNpc = !!actor && !actor.hasPlayerOwner;
        const limitedForPlayer = !game.user?.isGM && isNpc;

        return {
            name: token?.name || actor?.name || combatant?.name || 'Unknown',
            portrait: actor?.img || token?.img || 'modules/coffee-pub-blacksmith/images/portraits/portrait-noimage.webp',
            subtitle: ownerLabel,
            initiative: combatant?.initiative,
            currentHP,
            maxHP,
            hpPercent,
            stats: CombatBarManager.getCombatantPrimaryStats(actor),
            bloodOverlay,
            limitedForPlayer
        };
    }

    static getCombatantPrimaryStats(actor) {
        const stats = [];
        const pushStat = (label, rawValue) => {
            if (label == null || rawValue == null) return;
            const n = Number(rawValue);
            if (!Number.isFinite(n)) return;
            stats.push({ label: String(label).slice(0, 3).toUpperCase(), value: Math.round(n) });
        };

        const abilities = actor?.system?.abilities;
        if (abilities && typeof abilities === 'object') {
            Object.entries(abilities).forEach(([key, data]) => {
                const v = data?.value ?? data?.total ?? data?.score ?? data?.mod;
                pushStat(key, v);
            });
        }

        if (stats.length === 0) {
            const systemStats = actor?.system?.stats;
            if (systemStats && typeof systemStats === 'object') {
                Object.entries(systemStats).forEach(([key, data]) => {
                    const v = data?.value ?? data?.total ?? data?.score ?? data?.mod ?? data;
                    pushStat(key, v);
                });
            }
        }

        return stats.slice(0, 6);
    }

    static buildCombatantHoverCardHtml(data) {
        const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        const statsHtml = (data.stats || []).length
            ? data.stats.map((s) => `
                <div class="combat-hover-stat">
                    <span class="combat-hover-stat-label">${esc(s.label)}</span>
                    <span class="combat-hover-stat-value">${esc(s.value)}</span>
                </div>`).join('')
            : `<div class="combat-hover-stat-empty">No ability scores</div>`;

        const hpLabel = data.maxHP > 0 ? `${data.currentHP}/${data.maxHP}` : 'HP N/A';
        const initiativeLabel = Number.isFinite(data.initiative) ? String(data.initiative) : '-';
        const bloodOverlayHtml = data.bloodOverlay
            ? `<img class="combat-hover-blood" src="${esc(data.bloodOverlay)}" alt="" aria-hidden="true">`
            : '';

        if (data.limitedForPlayer) {
            return `
                <div class="combat-hover-header">
                    <span class="combat-hover-name">${esc(data.name)}</span>
                </div>
                <div class="combat-hover-image-wrap">
                    <img class="combat-hover-image" src="${esc(data.portrait)}" alt="${esc(data.name)}">
                    ${bloodOverlayHtml}
                </div>
                <div class="combat-hover-hp-wrap">
                    <div class="combat-hover-row">
                        <span class="combat-hover-initiative">Init ${esc(initiativeLabel)}</span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="combat-hover-header">
                <span class="combat-hover-name">${esc(data.name)}</span>
            </div>
            <div class="combat-hover-image-wrap">
                <img class="combat-hover-image" src="${esc(data.portrait)}" alt="${esc(data.name)}">
                ${bloodOverlayHtml}
            </div>
            <div class="combat-hover-hp-wrap">
                <div class="combat-hover-hp-bar"><span class="combat-hover-hp-fill" style="width:${data.hpPercent}%"></span></div>
                <div class="combat-hover-row">
                    <span class="combat-hover-subtitle">${esc(data.subtitle)}</span>
                    <span class="combat-hover-initiative">Init ${esc(initiativeLabel)}</span>
                </div>
                <div class="combat-hover-hp-text">${esc(hpLabel)}</div>
            </div>
            <div class="combat-hover-stats">${statsHtml}</div>
        `;
    }

    static panToCombatant(_menuBar, combatantId, options = {}) {
        try {
            const { selectToken = false } = options;
            const combat = game.combat;
            if (!combat) return;
            const combatant = combat.combatants.get(combatantId);
            if (!combatant) return;
            const token = combatant.token;
            if (!token) return;
            const canvasToken = canvas.tokens.get(token.id);
            if (!canvasToken) return;

            if (!game.user.isGM) {
                try {
                    const isHidden = canvasToken.document?.hidden || false;
                    if (isHidden) return;
                    if (!canvasToken.visible) return;
                    const tokenDocument = canvasToken.document || token;
                    if (tokenDocument?.testUserVisibility) {
                        const isVisible = tokenDocument.testUserVisibility(game.user);
                        if (!isVisible) return;
                    }
                } catch (_error) {
                    return;
                }
            }

            canvas.animatePan({ x: canvasToken.x, y: canvasToken.y });
            if (selectToken && game.user.isGM) {
                try {
                    canvasToken.control({ releaseOthers: true });
                } catch (error) {
                    postConsoleAndNotification(MODULE.NAME, 'Menubar: Failed to select token after pan', error?.message || error, true, false);
                }
            }

            if (canvasToken.visible && typeof canvasToken.setHighlight === 'function') {
                canvasToken.setHighlight();
                setTimeout(() => {
                    if (canvasToken.clearHighlight && typeof canvasToken.clearHighlight === 'function') {
                        canvasToken.clearHighlight();
                    }
                }, 2000);
            } else if (canvasToken.visible && canvasToken.emit) {
                canvasToken.emit('hoverIn');
                setTimeout(() => {
                    if (canvasToken.emit) {
                        canvasToken.emit('hoverOut');
                    }
                }, 2000);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error panning to combatant", error, false, false);
        }
    }

    static getCombatantContext(combatantId) {
        const combat = game.combat;
        if (!combat) return null;
        const combatant = combat.combatants.get(combatantId);
        if (!combatant) return null;
        const tokenDoc = combatant.token || null;
        const canvasToken = tokenDoc ? canvas.tokens.get(tokenDoc.id) : null;
        const actor = combatant.actor || null;
        return { combat, combatant, tokenDoc, canvasToken, actor };
    }

    static canOpenCombatantSheet(actor) {
        if (!actor) return false;
        if (game.user?.isGM) return true;
        try {
            return actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
        } catch (_error) {
            return !!actor.isOwner;
        }
    }

    static async pingCombatant(_menuBar, combatantId) {
        try {
            const context = CombatBarManager.getCombatantContext(combatantId);
            if (!context?.canvasToken) return;
            const token = context.canvasToken;
            const center = token.center || { x: token.x + (token.w / 2), y: token.y + (token.h / 2) };
            if (typeof canvas?.ping === 'function') {
                try { await canvas.ping(center, { broadcast: true, style: 'alert' }); return; } catch (_e1) { /* noop */ }
                try { await canvas.ping(center, { broadcast: true }); return; } catch (_e2) { /* noop */ }
                try { await canvas.ping(center); return; } catch (_e3) { /* noop */ }
            }
            if (typeof game.user?.broadcastActivity === 'function') {
                game.user.broadcastActivity({ ping: center });
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Error pinging combatant token', error?.message || error, false, false);
        }
    }

    static async sendHurryUp(_menuBar, combatantId) {
        try {
            const context = CombatBarManager.getCombatantContext(combatantId);
            if (!context?.combatant) return;
            const targetName = context.combatant.name || 'Unknown';
            const hurryMessages = [
                "If you don't make a move soon, {name}, I'm rolling to adopt your turn as my new pet. I'll call it Procrastination Jr.",
                "{name}, your character isn't actually frozen in time, just your decision-making skills.",
                "By the time you pick, {name}, our torches will burn out, and we'll have to roleplay in the dark. No pressure.",
                "Hurry up, {name}, or I'm rolling a persuasion check to convince the DM to skip you!",
                "We're waiting, {name}, not writing a novel. Unless you are, in which case, finish Chapter 1 already!",
                "{name}, we're all aging in real-time here. Even the elf is starting to grow gray hairs.",
                "If you don't decide soon, {name}, I'm calling a bard to write a song about how long this turn took.",
                "{name}, at this rate, the dice are going to roll themselves out of sheer boredom.",
                "C'mon, {name}! Even a gelatinous cube moves faster than this.",
                "{name}, if this turn were a quest, we'd already have failed the time limit."
            ];
            const message = hurryMessages[Math.floor(Math.random() * hurryMessages.length)].replace(/{name}/g, targetName);
            await ChatMessage.create({
                content: message,
                speaker: ChatMessage.getSpeaker()
            });

            const hurryUpSound = game.settings.get(MODULE.ID, 'hurryUpSound');
            if (hurryUpSound !== 'none') {
                const volume = game.settings.get(MODULE.ID, 'timerSoundVolume');
                playSound(hurryUpSound, volume);
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Menubar: Error sending Hurry Up message', error?.message || error, false, false);
        }
    }

    static showCombatantPortraitContextMenu(menuBar, combatantId, x, y) {
        const context = CombatBarManager.getCombatantContext(combatantId);
        if (!context?.combatant) return;

        const { combat, combatant, canvasToken, actor } = context;
        const canViewSheet = CombatBarManager.canOpenCombatantSheet(actor);
        const coreItems = [];
        const gmItems = [];

        coreItems.push({
            name: 'Pan to Token',
            icon: 'fa-solid fa-location-crosshairs',
            disabled: !canvasToken,
            callback: async () => {
                CombatBarManager.panToCombatant(menuBar, combatantId, { selectToken: game.user.isGM });
            }
        });

        coreItems.push({
            name: 'Ping Token',
            icon: 'fa-solid fa-signal-stream',
            disabled: !canvasToken,
            callback: async () => {
                await CombatBarManager.pingCombatant(menuBar, combatantId);
            }
        });

        coreItems.push({
            name: 'Hurry Up',
            icon: 'fa-solid fa-rabbit-running',
            callback: async () => {
                await CombatBarManager.sendHurryUp(menuBar, combatantId);
            }
        });

        coreItems.push({
            name: 'View Character Sheet',
            icon: 'fa-solid fa-user',
            disabled: !canViewSheet,
            callback: async () => {
                if (!canViewSheet || !actor?.sheet) return;
                actor.sheet.render(true);
            }
        });

        if (game.user.isGM) {
            gmItems.push({
                name: 'Set As Current Combatant',
                icon: 'fa-solid fa-crosshairs',
                callback: async () => {
                    await CombatBarManager.setCurrentCombatant(menuBar, combatantId);
                }
            });

            gmItems.push({
                name: 'Toggle Visibility',
                icon: combatant.hidden ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash',
                callback: async () => {
                    await combatant.update({ hidden: !combatant.hidden });
                }
            });

            const curatorApi = game.modules.get('coffee-pub-curator')?.api;
            if (curatorApi?.getCombatContextMenuItems) {
                const curatorContext = { combat, combatantId, canvasToken, x, y };
                const items = curatorApi.getCombatContextMenuItems(curatorContext);
                if (Array.isArray(items)) {
                    for (const item of items) {
                        gmItems.push(item);
                    }
                }
            }

            gmItems.push({
                name: 'Remove from Combat',
                icon: 'fa-solid fa-trash',
                callback: async () => {
                    await combat.deleteEmbeddedDocuments('Combatant', [combatantId]);
                }
            });
        }

        UIContextMenu.show({
            id: 'blacksmith-combat-portrait-context-menu',
            x,
            y,
            zones: {
                core: coreItems,
                gm: gmItems
            }
        });
    }

    static async setCurrentCombatant(_menuBar, combatantId) {
        try {
            const combat = game.combat;
            if (!combat || !game.combats.has(combat.id)) return;
            const combatant = combat.combatants.get(combatantId);
            if (!combatant) return;
            const turnIndex = combat.turns.findIndex(turn => turn.id === combatantId);
            if (turnIndex === -1) return;
            await combat.update({ turn: turnIndex });
            postConsoleAndNotification(MODULE.NAME, `Set current combatant to ${combatant.name}`, "", true, false);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, "Error setting current combatant", error, false, false);
        }
    }
}
