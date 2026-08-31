import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { HookManager } from './manager-hooks.js';

// ==================================================================
// ===== SCENE CONFIG TAB REGISTRY ==================================
// ==================================================================
//
// One injector for every module that wants a tab in Scene Configuration.
//
// Before this existed each module wrote its own `renderSceneConfig` handler and
// re-derived the same ApplicationV2 render-cycle handling: in Foundry v13 the tab
// nav is rebuilt on every render pass while the tab body container persists, so a
// naive inject that only checks the nav appends a fresh panel every time. Getting
// that wrong costs a duplicated panel or a tab that vanishes between reloads, and
// it is not discoverable from the outside — the sheet simply looks wrong.
//
// Persistence is deliberately NOT part of this API. Foundry's own SceneConfig form
// submission writes any input named `flags.<moduleId>.<path>` straight onto the
// document, so a tab that names its inputs correctly is saved with no further work.
// There is no `save` callback because no consumer needs one; adding it before one
// does would be surface nobody can exercise.

/** @type {Map<string, {id: string, label: string, icon: string, moduleId: string, render: Function}>} */
const registeredTabs = new Map();

/** Context used for HookManager registration and disposal. */
const SCENE_CONFIG_CONTEXT = 'blacksmith-scene-config';

let _hooksRegistered = false;

// ==================================================================
// ===== REGISTRATION ===============================================
// ==================================================================

/**
 * Register a tab to be injected into Scene Configuration.
 *
 * @param {string} tabId - Unique identifier. Becomes the `data-tab` value, so prefix it with your module id.
 * @param {Object} tabData - Tab configuration.
 * @param {string} tabData.label - Text shown on the tab button.
 * @param {string} [tabData.icon] - Font Awesome classes, e.g. 'fa-solid fa-mountain-sun'. Classes only, not markup.
 * @param {Function} tabData.render - `(scene, app) => string`. MUST be synchronous — see the note below.
 * @param {string} [tabData.moduleId] - Owning module id. Used for ownership checks and disposal.
 * @returns {boolean} Success status.
 *
 * The `render` callback must return an HTML string synchronously. It runs inside a render
 * hook, and Foundry v13 replaces every template part on each pass
 * (`HandlebarsApplicationMixin#_replaceHTML` calls `priorElement.replaceWith`), so any
 * `await` lets a later pass detach the nav and body nodes captured beforehand. The tab then
 * lands on orphaned DOM and is simply absent, with nothing thrown and nothing logged. Cache
 * whatever the callback needs ahead of time rather than fetching it here.
 */
export function registerSceneConfigTab(tabId, tabData) {
    try {
        if (!tabId || typeof tabId !== 'string') {
            postConsoleAndNotification(MODULE.NAME, 'Scene Config | registerSceneConfigTab: tabId must be a non-empty string', tabId, false, false);
            return false;
        }

        if (!tabData || typeof tabData !== 'object') {
            postConsoleAndNotification(MODULE.NAME, `Scene Config | registerSceneConfigTab: tabData must be an object (tab: ${tabId})`, tabData, false, false);
            return false;
        }

        // A tab with no render callback would add a button that opens an empty panel. Rejecting
        // it here follows registerToolbarTool's precedent with onClick: a registration that
        // cannot produce anything is refused rather than stored and returned as a success.
        if (typeof tabData.render !== 'function') {
            postConsoleAndNotification(
                MODULE.NAME,
                `Scene Config | registerSceneConfigTab: render must be a function (tab: ${tabId}) — the tab would open an empty panel, so it is rejected.`,
                { tabId, received: typeof tabData.render },
                false,
                false
            );
            return false;
        }

        if (!tabData.label || typeof tabData.label !== 'string') {
            postConsoleAndNotification(
                MODULE.NAME,
                `Scene Config | registerSceneConfigTab: label must be a non-empty string (tab: ${tabId}) — the button would have no text.`,
                { tabId, received: tabData.label },
                false,
                false
            );
            return false;
        }

        // Reject a DIFFERENT module claiming an id that is already taken, and allow the same
        // module to re-register its own tab so it can refresh its configuration. Same rule as
        // the toolbar registry, and for the same reason: a silent overwrite makes the victim's
        // tab vanish while its registration call still reports success.
        const existing = registeredTabs.get(tabId);
        const incomingModuleId = tabData.moduleId || MODULE.ID;
        if (existing && existing.moduleId !== incomingModuleId) {
            postConsoleAndNotification(
                MODULE.NAME,
                `Scene Config | Tab id "${tabId}" is already registered by "${existing.moduleId}" — refusing to overwrite it for "${incomingModuleId}". Tab ids must be unique; prefix yours with your module id.`,
                { tabId, owner: existing.moduleId, rejected: incomingModuleId },
                false,
                false
            );
            return false;
        }

        registeredTabs.set(tabId, {
            id: tabId,
            label: tabData.label,
            icon: typeof tabData.icon === 'string' ? tabData.icon : '',
            moduleId: incomingModuleId,
            render: tabData.render
        });

        postConsoleAndNotification(MODULE.NAME, `Scene Config API: Registered tab "${tabId}"`, { moduleId: incomingModuleId }, true, false);
        return true;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `Scene Config | registerSceneConfigTab failed unexpectedly (tab: ${tabId})`, error?.message || error, false, false);
        return false;
    }
}

/**
 * Unregister a Scene Configuration tab.
 * @param {string} tabId - Unique identifier for the tab.
 * @returns {boolean} Success status.
 */
export function unregisterSceneConfigTab(tabId) {
    try {
        if (!registeredTabs.has(tabId)) return false;
        registeredTabs.delete(tabId);
        postConsoleAndNotification(MODULE.NAME, `Scene Config API: Unregistered tab "${tabId}"`, '', true, false);
        return true;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `Scene Config | unregisterSceneConfigTab failed unexpectedly (tab: ${tabId})`, error?.message || error, false, false);
        return false;
    }
}

/**
 * Get all registered Scene Configuration tabs.
 * @returns {Map} Copy of the registry.
 */
export function getRegisteredSceneConfigTabs() {
    return new Map(registeredTabs);
}

/**
 * Check whether a tab id is registered.
 * @param {string} tabId - Unique identifier for the tab.
 * @returns {boolean}
 */
export function isSceneConfigTabRegistered(tabId) {
    return registeredTabs.has(tabId);
}

// ==================================================================
// ===== INJECTION ==================================================
// ==================================================================

export class SceneConfigManager {

    /**
     * Register the render hooks. Safe to call more than once.
     */
    static initialize() {
        if (_hooksRegistered) return;
        _hooksRegistered = true;

        // Both hooks fire for the same render pass. Whichever lands second finds the tab
        // already complete and returns without touching the DOM; a genuine re-render rebuilds
        // the nav without our button, so the guard correctly falls through and re-injects.
        HookManager.registerHook({
            name: 'renderSceneConfig',
            description: 'Blacksmith: Inject registered tabs into Scene Configuration',
            context: SCENE_CONFIG_CONTEXT,
            priority: 3,
            callback: (app, html) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                SceneConfigManager.injectTabs(app, html);
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        HookManager.registerHook({
            name: 'renderApplicationV2',
            description: 'Blacksmith: Inject registered tabs into Scene Configuration (ApplicationV2)',
            context: SCENE_CONFIG_CONTEXT,
            priority: 3,
            callback: (app, html) => {
                //  ------------------- BEGIN - HOOKMANAGER CALLBACK -------------------
                // renderApplicationV2 fires for every ApplicationV2 render in Foundry v13, so this
                // is a hot path. With nothing registered there is no work to do at all, and that is
                // the common case for a world running Blacksmith alone.
                if (registeredTabs.size === 0) return;
                const appName = app?.constructor?.name ?? '';
                const isSceneConfig = appName === 'SceneConfig' || app?.document?.documentName === 'Scene';
                if (isSceneConfig) SceneConfigManager.injectTabs(app, html);
                //  ------------------- END - HOOKMANAGER CALLBACK ---------------------
            }
        });

        postConsoleAndNotification(MODULE.NAME, 'Scene Config: Injector registered (renderSceneConfig, renderApplicationV2)', '', true, false);
    }

    /**
     * Normalize whatever the render hook handed us into a queryable root.
     * v13 passes an HTMLElement; older callers and some paths pass jQuery.
     */
    static _resolveRoot(html) {
        if (!html) return null;
        if (html instanceof HTMLElement) return html;
        if (html instanceof DocumentFragment) return html;
        if (html[0] instanceof HTMLElement) return html[0];
        if (typeof html.querySelector === 'function') return html;
        return null;
    }

    /**
     * Inject every registered tab. Synchronous end to end — see registerSceneConfigTab.
     * @param {Application} app - The SceneConfig application.
     * @param {HTMLElement|jQuery} html - The render root.
     */
    static injectTabs(app, html) {
        if (registeredTabs.size === 0) return;

        const root = this._resolveRoot(html) || this._resolveRoot(app?.element) || this._resolveRoot(app?._element);
        if (!root) return;

        const form = root.matches?.('form') ? root : (root.querySelector?.('form') ?? root);
        const tabsNav = form.querySelector?.('.sheet-tabs[data-group], .tabs[data-group], .sheet-tabs, .tabs, nav.tabs');
        if (!tabsNav) return;

        const scene = app?.document ?? null;
        if (!scene) return;

        const firstTabWithGroup = tabsNav.querySelector?.('[data-group]');
        const dataGroup = firstTabWithGroup?.dataset?.group || tabsNav.dataset.group || 'sheet';
        const useButton = tabsNav.firstElementChild?.tagName?.toLowerCase() === 'button';

        const tabBodyHost = form.querySelector('.tab[data-tab]')?.parentElement
            ?? form.querySelector('.sheet-body')
            ?? form;

        for (const tab of registeredTabs.values()) {
            // One failing tab must not cost every other tab on the sheet.
            try {
                this._injectOneTab(tab, { app, scene, form, tabsNav, tabBodyHost, dataGroup, useButton });
            } catch (error) {
                postConsoleAndNotification(
                    MODULE.NAME,
                    `Scene Config | Tab "${tab.id}" (${tab.moduleId}) threw while rendering and was skipped`,
                    error?.message || error,
                    false,
                    false
                );
            }
        }
    }

    /**
     * Inject a single tab, replacing any stale copy of it.
     */
    static _injectOneTab(tab, { app, scene, form, tabsNav, tabBodyHost, dataGroup, useButton }) {
        const navSelector = `[data-tab="${CSS.escape(tab.id)}"]`;
        const panelSelector = `.tab[data-tab="${CSS.escape(tab.id)}"]`;

        // Both halves present means this render pass is already done — the second of the two
        // hooks is landing. Anything else is stale and gets rebuilt, because the nav is
        // recreated on every pass while the body container survives: checking only the nav
        // would append a second panel each time.
        const existingNav = tabsNav.querySelector(navSelector);
        const existingPanel = form.querySelector(panelSelector);
        if (existingNav && existingPanel) return;

        existingNav?.remove();
        existingPanel?.remove();

        const content = tab.render(scene, app);
        if (typeof content !== 'string') {
            postConsoleAndNotification(
                MODULE.NAME,
                `Scene Config | Tab "${tab.id}" (${tab.moduleId}) render did not return a string; tab skipped`,
                { received: typeof content },
                false,
                false
            );
            return;
        }

        // Mirrors templates/generic/tab-navigation.hbs exactly. The <span> around the label is
        // load-bearing, not decoration: core lays a tab out as icon above label, and a bare text
        // node is one flex item alongside the icon rather than a line of its own. A single-word
        // label with an icon happens to look right either way, which is what makes this easy to
        // ship broken — a two-word label without an icon wraps, putting half of it where the icon
        // belongs. `inert` on the icon matches core and keeps it out of the accessibility tree.
        const tabButton = document.createElement(useButton ? 'button' : 'a');
        if (useButton) tabButton.type = 'button';
        tabButton.dataset.action = 'tab';
        tabButton.dataset.tab = tab.id;
        tabButton.dataset.group = dataGroup;
        if (tab.icon) {
            const icon = document.createElement('i');
            icon.className = tab.icon;
            icon.toggleAttribute('inert', true);
            tabButton.appendChild(icon);
        }
        const labelSpan = document.createElement('span');
        labelSpan.textContent = tab.label;
        tabButton.appendChild(labelSpan);
        tabsNav.appendChild(tabButton);

        const panel = document.createElement('div');
        panel.className = 'tab blacksmith-scene-config-tab';
        panel.dataset.tab = tab.id;
        panel.dataset.group = dataGroup;
        panel.innerHTML = content;
        // Insert immediately BEFORE the footer, anchoring on a core element.
        //
        // ApplicationV2 renders SceneConfig's parts as flat siblings: the tab nav, one element per
        // tab body, then `footer.form-footer` holding Save
        // (`client/applications/sheets/scene-config.mjs:38-44`, `templates/generic/form-footer.hbs`).
        // Appending to the container therefore lands the panel AFTER the footer, and the sheet
        // renders with Save Changes above the tab's own content.
        //
        // The obvious fix -- insert after the last `.tab[data-tab]` -- is wrong in a way that only
        // shows up with a second module installed. Render hooks fire in registration order and
        // module scripts load alphabetically, so a module earlier in the alphabet injects BEFORE
        // this runs; "the last tab panel" is then ITS panel, and this inherits whatever position it
        // chose. Anchoring on the footer is independent of who else has already injected.
        const footer = form.querySelector('footer.form-footer') ?? form.querySelector('footer');
        if (footer?.parentElement) footer.before(panel);
        else tabBodyHost.appendChild(panel);

        // Carry the app's active-tab state onto what we just injected.
        //
        // A `.tab` is `display: none` until it also has `.active`, and ApplicationV2 applies that
        // class during its own render, to its own parts (`changeTab`, application.mjs:1118 and
        // :1124). Our nav button and panel are added afterwards, so they start with no active class
        // at all. That is invisible while the user arrives by CLICKING the tab -- the click handler
        // sets it -- and breaks the moment the sheet OPENS with our tab already selected, which is
        // what happens as soon as it is the remembered tab: the nav renders active, the panel does
        // not, and the tab body is empty.
        //
        // Clicking does not recover it either: changeTab returns early when the group is already on
        // the requested tab (`:1112`), so the class is never applied and the tab stays blank.
        const activeTab = app?.tabGroups?.[dataGroup];
        if (activeTab !== undefined) {
            const isActive = activeTab === tab.id;
            tabButton.classList.toggle('active', isActive);
            panel.classList.toggle('active', isActive);
        }
    }

    /**
     * Remove the render hooks. Used by disposeByContext during teardown.
     */
    static dispose() {
        HookManager.disposeByContext(SCENE_CONFIG_CONTEXT);
        _hooksRegistered = false;
    }
}
