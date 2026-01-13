// ==================================================================
// ===== SIDEBAR COMBAT (CHAT LOG + COMBAT TAB) ======================
// ===== Foundry v13+ ===============================================
// ==================================================================

// IMMEDIATE LOG - Should appear as soon as file loads
console.log("SIDEBAR INJECTION | ===== FILE STARTING EXECUTION =====", Date.now());

// Log BEFORE import
console.log("SIDEBAR INJECTION | About to import MODULE from const.js");

import { MODULE } from "./const.js";

// Log AFTER import
console.log("SIDEBAR INJECTION | Import successful", { moduleId: MODULE?.ID });

try {

  const TAB_ID = "cpb-chat-combat";
  const SETTING_SPLIT = "chatCombatSplit";

  /**
   * Turn logging on/off here.
   * You asked for logs prefixed with: "SIDEBAR INJECTION | "
   */
  const DEBUG = true;
  const LOG_PREFIX = "SIDEBAR INJECTION | ";
  function slog(...args) {
    if (!DEBUG) return;
    console.log(LOG_PREFIX, ...args);
  }
  function swarn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }
  function serr(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  // Immediate log to verify file is loaded
  console.log(LOG_PREFIX + "FILE LOADED", { moduleId: MODULE?.ID, tabId: TAB_ID, timestamp: Date.now() });

  // Log BEFORE registering init hook
  console.log(LOG_PREFIX + "About to register Hooks.once('init')");
  
  Hooks.once("init", () => {
    slog("Hooks.once(init) fired");

    console.log(LOG_PREFIX + "Inside init hook, about to register setting");
    
    game.settings.register(MODULE.ID, SETTING_SPLIT, {
      name: "Chat+Combat Split",
      scope: "client",
      config: false,
      type: Number,
      default: 0.5
    });

    slog("setting registered", `${MODULE.ID}.${SETTING_SPLIT}`);
    console.log(LOG_PREFIX + "Setting registered successfully");
  });

  // Log BEFORE registering ready hook
  console.log(LOG_PREFIX + "About to register Hooks.once('ready')");
  
  // Also try ready hook as fallback
  Hooks.once("ready", () => {
    slog("Hooks.once(ready) fired");
    // Try to inject immediately on ready
    setTimeout(() => {
      tryInjectElements();
    }, 100);
  });

  // Log BEFORE registering renderApplication hook
  console.log(LOG_PREFIX + "About to register Hooks.on('renderApplication')");

  /**
   * Use renderApplication hook - renderSidebar doesn't exist in FoundryVTT
   * Filter for Sidebar application
   */
  Hooks.on("renderApplication", (app, html, data) => {
    // Log EVERY renderApplication call to see what's happening (first few only)
    const appName = app?.constructor?.name;
    if (DEBUG && (appName === "Sidebar" || appName === "SidebarV2" || app?.id === "sidebar")) {
      console.log(LOG_PREFIX + "renderApplication called", { 
        appName: appName,
        appId: app?.id,
        appKeys: Object.keys(app || {})
      });
    }
    
    // Check if this is the Sidebar application - try multiple ways
    const isSidebar = app && (
      appName === "Sidebar" || 
      appName === "SidebarV2" ||
      app?.id === "sidebar" ||
      app?.element?.id === "sidebar"
    );
    
    if (!isSidebar) {
      return;
    }
    
    slog("renderApplication fired for Sidebar", { appId: app?.id, appName: app?.constructor?.name });
    try {
      // Handle both jQuery and native DOM
      let root = html;
      if (html && (html.jquery || typeof html.find === 'function')) {
        root = html[0] || html.get?.(0) || html;
      }
      if (html?.[0]) root = html[0];
      if (!(root instanceof HTMLElement)) {
        swarn("renderApplication root is not an HTMLElement", { rootType: typeof root, htmlType: typeof html });
        return;
      }

      const sidebarTabs = root.querySelector("#sidebar-tabs");
      const sidebarContent = root.querySelector("#sidebar-content");

      slog("sidebar nodes found?", {
        sidebarTabs: !!sidebarTabs,
        sidebarContent: !!sidebarContent
      });

      if (!sidebarTabs || !sidebarContent) return;

      const tabsMenu = sidebarTabs.querySelector("menu.flexcol") ?? sidebarTabs;
      slog("tabs menu node", { isMenu: tabsMenu?.tagName, hasFlexcol: tabsMenu?.classList?.contains("flexcol") });

      // Inject UI
      const injectedBtn = injectTabButton(tabsMenu);
      const injectedSection = injectTabSection(sidebarContent);

      slog("injection results", { injectedBtn, injectedSection });

      // Rebind Foundry's sidebar tabs so new trigger/panel is recognized
      const rebound = rebindSidebarTabs();
      slog("rebind result", { rebound });

      // Wire behaviors (idempotent)
      wireMounting(root);
      wireSplitDrag(root);
      applySplitFromSetting(root);

      // Verify presence
      const btn = root.querySelector(`#sidebar-tabs button[data-tab="${TAB_ID}"]`);
      const section = root.querySelector(`#sidebar-content section#${TAB_ID}`);

      slog("post-inject verify", {
        hasButton: !!btn,
        hasSection: !!section,
        buttonAriaPressed: btn?.getAttribute("aria-pressed") ?? null
      });

      // If active, mount immediately
      if (btn?.getAttribute("aria-pressed") === "true") {
        slog("tab already active, mounting now");
        mountChatCombat(root);
      }
    } catch (err) {
      serr("renderApplication exception", err);
    }
  });

  console.log(LOG_PREFIX + "All hooks registered, file execution complete");

  /**
   * Fallback injection function (like SidebarPin pattern)
   */
  function tryInjectElements() {
    const sidebarTabs = document.getElementById('sidebar-tabs');
    const sidebarContent = document.getElementById('sidebar-content');
    
    if (!sidebarTabs || !sidebarContent) {
      slog("tryInjectElements: elements not found yet", { 
        hasTabs: !!sidebarTabs, 
        hasContent: !!sidebarContent 
      });
      return false;
    }

    const tabsMenu = sidebarTabs.querySelector("menu.flexcol") ?? sidebarTabs;
    
    // Check if already injected
    if (sidebarTabs.querySelector(`button[data-tab="${TAB_ID}"]`)) {
      slog("tryInjectElements: already injected");
      return true;
    }

    slog("tryInjectElements: injecting elements");
    const injectedBtn = injectTabButton(tabsMenu);
    const injectedSection = injectTabSection(sidebarContent);
    
    if (injectedBtn || injectedSection) {
      // Pass document as root since we're working with global elements
      wireMounting(document);
      wireSplitDrag(document);
      applySplitFromSetting(document);
      return true;
    }
    
    return false;
  }

  function injectTabButton(tabsMenu) {
    if (!tabsMenu) {
      swarn("injectTabButton: no tabsMenu");
      return false;
    }

    // Already injected
    if (tabsMenu.querySelector(`button[data-tab="${TAB_ID}"]`)) {
      slog("injectTabButton: already present");
      return false;
    }

    const combatBtn = tabsMenu.querySelector('button[data-tab="combat"][data-group="primary"]');
    if (!combatBtn) {
      swarn("injectTabButton: combat button not found in tabsMenu");
      return false;
    }

    const combatLi = combatBtn.closest("li");
    if (!combatLi) {
      swarn("injectTabButton: combat <li> not found");
      return false;
    }

    const li = document.createElement("li");
    li.innerHTML = `
      <button type="button"
              class="ui-control plain icon fa-solid fa-columns"
              data-action="tab"
              data-tab="${TAB_ID}"
              role="tab"
              aria-pressed="false"
              data-group="primary"
              aria-label="Chat + Combat"
              aria-controls="${TAB_ID}">
      </button>
      <div class="notification-pip"></div>
    `;

    combatLi.insertAdjacentElement("afterend", li);
    slog("injectTabButton: inserted after combat");
    return true;
  }

  function injectTabSection(sidebarContent) {
    if (!sidebarContent) {
      swarn("injectTabSection: no sidebarContent");
      return false;
    }

    // Already injected
    if (sidebarContent.querySelector(`section#${TAB_ID}`)) {
      slog("injectTabSection: already present");
      return false;
    }

    const combatSection = sidebarContent.querySelector('section#combat[data-tab="combat"]');
    if (!combatSection) {
      swarn("injectTabSection: combat section not found");
      return false;
    }

    const section = document.createElement("section");
    section.id = TAB_ID;
    section.className = "tab sidebar-tab flexcol";
    section.setAttribute("data-tab", TAB_ID);
    section.setAttribute("data-group", "primary");

    section.innerHTML = `
      <div class="cpb-split">
        <div class="cpb-pane cpb-pane-top">
          <div class="cpb-mount" data-mount="chat-log"></div>
        </div>

        <div class="cpb-divider" role="separator" aria-orientation="horizontal" tabindex="0"></div>

        <div class="cpb-pane cpb-pane-bottom">
          <div class="cpb-mount" data-mount="combat"></div>
        </div>
      </div>
    `;

    combatSection.insertAdjacentElement("afterend", section);
    slog("injectTabSection: inserted after #combat");
    return true;
  }

  /**
   * Rebind Foundry's sidebar tab controller so injected triggers/panels are recognized.
   * v13 commonly stores controllers on ui.sidebar._tabs (array).
   */
  function rebindSidebarTabs() {
    try {
      const sidebar = ui?.sidebar;
      if (!sidebar) {
        swarn("rebindSidebarTabs: ui.sidebar missing");
        return false;
      }

      const el = sidebar.element instanceof HTMLElement ? sidebar.element : sidebar.element?.[0];
      if (!el) {
        swarn("rebindSidebarTabs: sidebar.element missing", { elementType: typeof sidebar.element });
        return false;
      }

      const tabs = sidebar._tabs ?? [];
      slog("rebindSidebarTabs: found tabs controllers", { count: tabs.length, keys: Object.keys(sidebar) });

      let boundAny = false;
      for (const t of tabs) {
        if (typeof t?.bind === "function") {
          t.bind(el);
          boundAny = true;
        }
      }

      if (!boundAny) swarn("rebindSidebarTabs: no bindable tabs controllers found");
      return boundAny;
    } catch (err) {
      serr("rebindSidebarTabs exception", err);
      return false;
    }
  }

  function wireMounting(root) {
    // root can be a DOM element or we use document
    // If root is already the sidebar-tabs element, use it directly
    let sidebarTabs;
    if (root && root.id === "sidebar-tabs") {
      sidebarTabs = root;
    } else if (root && root.querySelector) {
      sidebarTabs = root.querySelector("#sidebar-tabs");
    } else {
      sidebarTabs = document.getElementById("sidebar-tabs");
    }
      
    if (!sidebarTabs) {
      swarn("wireMounting: no #sidebar-tabs", { rootType: typeof root, rootId: root?.id });
      return;
    }

    if (sidebarTabs.dataset.cpbCombinedWired === "true") {
      slog("wireMounting: already wired");
      return;
    }
    sidebarTabs.dataset.cpbCombinedWired = "true";

    sidebarTabs.addEventListener("click", (ev) => {
      const button = ev.target.closest('button[data-action="tab"][data-group="primary"]');
      if (!button) return;

      slog("tab click", { tab: button.dataset.tab });

      // v13-safe fallback: force activation for our injected tab
      if (button.dataset.tab === TAB_ID) {
        ev.preventDefault();
        ev.stopPropagation();

        if (typeof ui.sidebar?.activateTab === "function") {
          slog("forcing activateTab", TAB_ID);
          ui.sidebar.activateTab(TAB_ID);
        } else {
          swarn("ui.sidebar.activateTab not available");
        }

        queueMicrotask(() => {
          slog("mount after activateTab microtask");
          // Use document as root for mounting
          const docRoot = (root && root.querySelector) ? root : document;
          mountChatCombat(docRoot);
        });

        return;
      }

      // leaving our tab: restore content
      queueMicrotask(() => {
        slog("unmount after other tab click microtask");
        // Use document as root for unmounting
        const docRoot = (root && root.querySelector) ? root : document;
        unmountChatCombat(docRoot);
      });
    });

    slog("wireMounting: click handler attached");
  }

  function mountChatCombat(root) {
    const combined = root.querySelector(`#${TAB_ID}`);
    if (!combined) {
      swarn("mountChatCombat: combined section missing");
      return;
    }

    ensureRestoreMarker(root, "chat", "chat-log");
    ensureRestoreMarker(root, "combat", "combat");

    // Mount chat log only (.chat-scroll)
    const chatSection = root.querySelector('section#chat[data-tab="chat"]');
    const chatScroll = chatSection?.querySelector(".chat-scroll") ?? null;
    const chatLogMount = combined.querySelector('.cpb-mount[data-mount="chat-log"]');

    slog("mountChatCombat: chat nodes", {
      hasChatSection: !!chatSection,
      hasChatScroll: !!chatScroll,
      hasChatLogMount: !!chatLogMount
    });

    if (chatScroll && chatLogMount && chatLogMount.dataset.mounted !== "true") {
      chatLogMount.appendChild(chatScroll);
      chatLogMount.dataset.mounted = "true";
      slog("mountChatCombat: mounted chat-scroll");
    }

    // Mount combat children (do not move the section itself)
    const combatMount = combined.querySelector('.cpb-mount[data-mount="combat"]');
    const combatSection = root.querySelector('section#combat[data-tab="combat"]');

    slog("mountChatCombat: combat nodes", {
      hasCombatSection: !!combatSection,
      hasCombatMount: !!combatMount
    });

    if (combatSection && combatMount && combatMount.dataset.mounted !== "true") {
      const kids = Array.from(combatSection.children).filter((el) => !el.classList.contains("cpb-restore"));
      for (const el of kids) combatMount.appendChild(el);
      combatMount.dataset.mounted = "true";
      slog("mountChatCombat: mounted combat children", kids.length);
    }
  }

  function unmountChatCombat(root) {
    restoreToMarker(root, "chat", "chat-log", () => {
      const combined = root.querySelector(`#${TAB_ID}`);
      return combined?.querySelector('.cpb-mount[data-mount="chat-log"]') ?? null;
    });

    restoreToMarker(root, "combat", "combat", () => {
      const combined = root.querySelector(`#${TAB_ID}`);
      return combined?.querySelector('.cpb-mount[data-mount="combat"]') ?? null;
    });
  }

  function ensureRestoreMarker(root, sectionId, key) {
    const section = root.querySelector(`section#${sectionId}[data-tab="${sectionId}"]`);
    if (!section) {
      swarn("ensureRestoreMarker: section missing", { sectionId, key });
      return;
    }

    const selector = `.cpb-restore[data-restore="${sectionId}:${key}"]`;
    if (section.querySelector(selector)) return;

    const marker = document.createElement("div");
    marker.className = "cpb-restore";
    marker.setAttribute("data-restore", `${sectionId}:${key}`);
    marker.style.display = "none";
    section.appendChild(marker);
  }

  function restoreToMarker(root, sectionId, key, getMount) {
    const section = root.querySelector(`section#${sectionId}[data-tab="${sectionId}"]`);
    if (!section) return;

    const marker = section.querySelector(`.cpb-restore[data-restore="${sectionId}:${key}"]`);
    if (!marker) return;

    const mount = getMount?.();
    if (!mount || mount.dataset.mounted !== "true") return;

    const nodes = Array.from(mount.childNodes);
    for (const n of nodes) section.insertBefore(n, marker);

    mount.dataset.mounted = "false";
  }

  function wireSplitDrag(root) {
    const combined = root.querySelector(`#${TAB_ID}`);
    if (!combined) return;

    const divider = combined.querySelector(".cpb-divider");
    const split = combined.querySelector(".cpb-split");
    if (!divider || !split) return;

    if (divider.dataset.cpbWired === "true") return;
    divider.dataset.cpbWired = "true";

    divider.addEventListener("pointerdown", (e) => {
      e.preventDefault();

      const rect = split.getBoundingClientRect();
      divider.setPointerCapture?.(e.pointerId);

      const onMove = (ev) => {
        const offset = ev.clientY - rect.top;
        const ratio = clamp(offset / rect.height, 0.15, 0.85);
        split.style.setProperty("--cpb-split", `${Math.round(ratio * 100)}%`);
        game.settings.set(MODULE.ID, SETTING_SPLIT, ratio);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        divider.releasePointerCapture?.(e.pointerId);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    });

    divider.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 0.05 : 0.02;
      const current = clamp(game.settings.get(MODULE.ID, SETTING_SPLIT) ?? 0.5, 0.15, 0.85);

      if (e.key === "ArrowUp") {
        game.settings.set(MODULE.ID, SETTING_SPLIT, clamp(current - step, 0.15, 0.85));
        applySplitFromSetting(root);
      }

      if (e.key === "ArrowDown") {
        game.settings.set(MODULE.ID, SETTING_SPLIT, clamp(current + step, 0.15, 0.85));
        applySplitFromSetting(root);
      }
    });
  }

  function applySplitFromSetting(root) {
    // root can be a DOM element or we use document
    const combined = (root && root.querySelector)
      ? root.querySelector(`#${TAB_ID}`)
      : document.getElementById(TAB_ID);
      
    if (!combined) return;

    const split = combined.querySelector(".cpb-split");
    if (!split) return;

    const ratio = clamp(game.settings.get(MODULE.ID, SETTING_SPLIT) ?? 0.5, 0.15, 0.85);
    split.style.setProperty("--cpb-split", `${Math.round(ratio * 100)}%`);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

} catch (error) {
  console.error("SIDEBAR INJECTION | ===== FATAL ERROR IN FILE =====", error);
  console.error("SIDEBAR INJECTION | Error stack:", error?.stack);
}
