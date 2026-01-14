// ==================================================================
// ===== SIDEBAR COMBAT (CHAT LOG + COMBAT TAB) ======================
// ===== Foundry v13+ ===============================================
// ==================================================================

import { MODULE } from "./const.js";
import { getSettingSafely } from "./api-core.js";

const TAB_ID = "cpb-chat-combat";
const SETTING_SPLIT = "chatCombatSplit";
const SETTING_ENABLED = "sidebarCombatChatEnabled";

try {
  Hooks.once("init", () => {
    game.settings.register(MODULE.ID, SETTING_SPLIT, {
      name: "Chat+Combat Split",
      scope: "client",
      config: false,
      type: Number,
      default: 0.5
    });
  });

  // Listen for setting changes to add/remove tab dynamically
  Hooks.on("settingChange", (moduleId, settingKey, value) => {
    if (moduleId === MODULE.ID && settingKey === SETTING_ENABLED) {
      // When setting changes, trigger sidebar re-render to add/remove tab
      if (ui?.sidebar) {
        ui.sidebar.render();
      }
    }
  });

  // Also try ready hook as fallback
  Hooks.once("ready", () => {
    // Try to inject immediately on ready
    setTimeout(() => {
      tryInjectElements();
    }, 100);
  });

  /**
   * Use renderApplication hook - renderSidebar doesn't exist in FoundryVTT
   * Filter for Sidebar application
   */
  Hooks.on("renderApplication", (app, html, data) => {
    // Check if this is the Sidebar application - try multiple ways
    const appName = app?.constructor?.name;
    const isSidebar = app && (
      appName === "Sidebar" || 
      appName === "SidebarV2" ||
      app?.id === "sidebar" ||
      app?.element?.id === "sidebar"
    );
    
    if (!isSidebar) {
      return;
    }
    
    try {
      // Handle both jQuery and native DOM
      let root = html;
      if (html && (html.jquery || typeof html.find === 'function')) {
        root = html[0] || html.get?.(0) || html;
      }
      if (html?.[0]) root = html[0];
      if (!(root instanceof HTMLElement)) {
        return;
      }

      const sidebarTabs = root.querySelector("#sidebar-tabs");
      const sidebarContent = root.querySelector("#sidebar-content");

      if (!sidebarTabs || !sidebarContent) return;

      // Check if feature is enabled
      if (!getSettingSafely(MODULE.ID, SETTING_ENABLED, true)) {
        // Setting disabled - remove tab if it exists
        removeInjectedElements(root);
        return;
      }

      const tabsMenu = sidebarTabs.querySelector("menu.flexcol") ?? sidebarTabs;

      // Inject UI
      injectTabButton(tabsMenu);
      injectTabSection(sidebarContent);

      // Rebind Foundry's sidebar tabs so new trigger/panel is recognized
      rebindSidebarTabs();

      // Wire behaviors (idempotent)
      wireMounting(root);
      wireSplitDrag(root);
      applySplitFromSetting(root);

      // Verify presence and mount if active
      const btn = root.querySelector(`#sidebar-tabs button[data-tab="${TAB_ID}"]`);
      if (btn?.getAttribute("aria-pressed") === "true") {
        mountChatCombat(root);
      }
    } catch (err) {
      console.error("Sidebar Combat: renderApplication exception", err);
    }
  });

  /**
   * Remove injected elements if setting is disabled
   */
  function removeInjectedElements(root) {
    const sidebarTabs = root.querySelector("#sidebar-tabs");
    const sidebarContent = root.querySelector("#sidebar-content");
    
    if (!sidebarTabs || !sidebarContent) return;

    // Remove tab button
    const tabButton = sidebarTabs.querySelector(`button[data-tab="${TAB_ID}"]`);
    if (tabButton) {
      const tabLi = tabButton.closest("li");
      if (tabLi) {
        tabLi.remove();
      }
    }

    // Remove tab section
    const tabSection = sidebarContent.querySelector(`section#${TAB_ID}`);
    if (tabSection) {
      // Unmount if currently active
      unmountChatCombat(root);
      tabSection.remove();
    }

    // Clear wired state
    if (sidebarTabs.dataset.cpbCombinedWired === "true") {
      delete sidebarTabs.dataset.cpbCombinedWired;
    }
  }

  /**
   * Fallback injection function (like SidebarPin pattern)
   */
  function tryInjectElements() {
    // Check if feature is enabled
    if (!getSettingSafely(MODULE.ID, SETTING_ENABLED, true)) {
      return false;
    }

    const sidebarTabs = document.getElementById('sidebar-tabs');
    const sidebarContent = document.getElementById('sidebar-content');
    
    if (!sidebarTabs || !sidebarContent) {
      return false;
    }

    const tabsMenu = sidebarTabs.querySelector("menu.flexcol") ?? sidebarTabs;
    
    // Check if already injected
    if (sidebarTabs.querySelector(`button[data-tab="${TAB_ID}"]`)) {
      return true;
    }

    injectTabButton(tabsMenu);
    injectTabSection(sidebarContent);
    
    wireMounting(document);
    wireSplitDrag(document);
    applySplitFromSetting();
    return true;
  }

  function injectTabButton(tabsMenu) {
    if (!tabsMenu) {
      return false;
    }

    // Already injected
    if (tabsMenu.querySelector(`button[data-tab="${TAB_ID}"]`)) {
      return false;
    }

    const combatBtn = tabsMenu.querySelector('button[data-tab="combat"][data-group="primary"]');
    if (!combatBtn) {
      return false;
    }

    const combatLi = combatBtn.closest("li");
    if (!combatLi) {
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
    return true;
  }

  function injectTabSection(sidebarContent) {
    if (!sidebarContent) {
      return false;
    }

    // Already injected
    if (sidebarContent.querySelector(`section#${TAB_ID}`)) {
      return false;
    }

    const combatSection = sidebarContent.querySelector('section#combat[data-tab="combat"]');
    if (!combatSection) {
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
        return false;
      }

      const el = sidebar.element instanceof HTMLElement ? sidebar.element : sidebar.element?.[0];
      if (!el) {
        return false;
      }

      const tabs = sidebar._tabs ?? [];

      let boundAny = false;
      for (const t of tabs) {
        if (typeof t?.bind === "function") {
          t.bind(el);
          boundAny = true;
        }
      }

      return boundAny;
    } catch (err) {
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
      return;
    }

    if (sidebarTabs.dataset.cpbCombinedWired === "true") {
      return;
    }
    sidebarTabs.dataset.cpbCombinedWired = "true";

    sidebarTabs.addEventListener("click", (ev) => {
      const button = ev.target.closest('button[data-action="tab"][data-group="primary"]');
      if (!button) return;

      // v13-safe fallback: force activation for our injected tab
      if (button.dataset.tab === TAB_ID) {
        ev.preventDefault();
        ev.stopPropagation();

        if (typeof ui.sidebar?.activateTab === "function") {
          ui.sidebar.activateTab(TAB_ID);
        }

        queueMicrotask(() => {
          // Use document as root for mounting
          const docRoot = (root && root.querySelector) ? root : document;
          mountChatCombat(docRoot);
        });

        return;
      }

      // leaving our tab: restore content
      queueMicrotask(() => {
        // Use document as root for unmounting
        const docRoot = (root && root.querySelector) ? root : document;
        unmountChatCombat(docRoot);
      });
    });
  }

  function mountChatCombat(root) {
    const combined = root.querySelector(`#${TAB_ID}`);
    if (!combined) {
      return;
    }

    // For chat: Clone the chat-scroll instead of moving it (don't break core chat tab)
    const chatSection = root.querySelector('section#chat[data-tab="chat"]');
    const chatScroll = chatSection?.querySelector(".chat-scroll") ?? null;
    const chatLogMount = combined.querySelector('.cpb-mount[data-mount="chat-log"]');

    if (chatScroll && chatLogMount && chatLogMount.dataset.mounted !== "true") {
      // Clone the chat-scroll instead of moving it (don't break core chat tab)
      const chatClone = chatScroll.cloneNode(true);
      chatClone.id = chatScroll.id ? `${chatScroll.id}-clone` : 'chat-scroll-clone';
      chatLogMount.appendChild(chatClone);
      chatLogMount.dataset.mounted = "true";
      
      // Scroll to bottom initially
      const scrollToBottom = (element) => {
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      };
      scrollToBottom(chatClone);
      
      // Sync updates: watch for new messages and update clone
      const observer = new MutationObserver(() => {
        if (chatLogMount.dataset.mounted === "true" && chatScroll.parentElement) {
          // Only update if original is still in place (not moved)
          const currentClone = chatLogMount.querySelector('.chat-scroll');
          if (currentClone) {
            const newClone = chatScroll.cloneNode(true);
            newClone.id = currentClone.id;
            chatLogMount.replaceChild(newClone, currentClone);
            
            // Scroll to bottom after updating
            scrollToBottom(newClone);
          }
        }
      });
      observer.observe(chatScroll, { childList: true, subtree: true });
      // Store observer reference on mount element for cleanup
      chatLogMount._chatObserver = observer;
    }

    // Mount the ENTIRE combat section so Foundry's #combat/.combat-sidebar CSS still applies
    const combatMount = combined.querySelector('.cpb-mount[data-mount="combat"]');
    const combatSection = root.querySelector('section#combat[data-tab="combat"]');

    if (combatSection && combatMount && combatMount.dataset.mounted !== "true") {
      ensureCombatPlaceholder(root); // create placeholder right after original #combat location
      combatMount.appendChild(combatSection);
      
      // IMPORTANT: combat is still a Foundry "tab" section.
      // If it is not .active, Foundry CSS hides it (display: none).
      combatSection.classList.add("active");
      
      // Some themes/modules also set inline display on tabs, so force it sane.
      combatSection.style.display = "flex";
      combatSection.style.flexDirection = "column";
      combatSection.style.height = "100%";
      
      combatMount.dataset.mounted = "true";
    }
  }

  function unmountChatCombat(root) {
    const combined = root.querySelector(`#${TAB_ID}`);
    
    // For chat: Just remove the clone (original was never moved, so nothing to restore)
    const chatLogMount = combined?.querySelector('.cpb-mount[data-mount="chat-log"]');
    if (chatLogMount && chatLogMount.dataset.mounted === "true") {
      // Disconnect observer if it exists
      if (chatLogMount._chatObserver) {
        chatLogMount._chatObserver.disconnect();
        chatLogMount._chatObserver = null;
      }
      // Clear the clone
      chatLogMount.innerHTML = '';
      chatLogMount.dataset.mounted = "false";
    }

    // Restore the ENTIRE combat section to its original location
    const ph = root.querySelector(`.cpb-combat-placeholder[data-for="${TAB_ID}"]`);
    const combatMount = combined?.querySelector('.cpb-mount[data-mount="combat"]');
    const combatSection = combatMount?.querySelector('section#combat[data-tab="combat"]');

    if (ph && combatSection) {
      ph.insertAdjacentElement("beforebegin", combatSection);
      
      // Revert what we forced while mounted.
      // Let Foundry decide active/inactive based on the actual selected tab.
      combatSection.classList.remove("active");
      combatSection.style.display = "";
      combatSection.style.flexDirection = "";
      combatSection.style.height = "";
      
      combatMount.dataset.mounted = "false";
    }
  }

  function ensureCombatPlaceholder(root) {
    const sidebarContent = root.querySelector("#sidebar-content");
    const combatSection = root.querySelector('section#combat[data-tab="combat"]');
    if (!sidebarContent || !combatSection) return null;

    let ph = sidebarContent.querySelector(`.cpb-combat-placeholder[data-for="${TAB_ID}"]`);
    if (!ph) {
      ph = document.createElement("div");
      ph.className = "cpb-combat-placeholder";
      ph.dataset.for = TAB_ID;
      ph.style.display = "none";
      combatSection.insertAdjacentElement("afterend", ph);
    }
    return ph;
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
  console.error("Sidebar Combat: Fatal error", error);
}
