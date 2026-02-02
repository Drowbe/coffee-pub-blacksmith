// ==================================================================
// ===== UI CONTEXT MENU – Shared menu with optional flyouts =========
// ==================================================================

export class UIContextMenu {
    static _openMenus = new Map(); // id -> { root, close }

    static close(id) {
        const entry = this._openMenus.get(id);
        if (entry?.close) {
            entry.close();
        }
    }

    static closeAll() {
        for (const id of this._openMenus.keys()) {
            this.close(id);
        }
    }

    /**
     * Show a context menu at screen coordinates.
     * @param {Object} options
     * @param {string} options.id - Unique menu id
     * @param {number} options.x - clientX
     * @param {number} options.y - clientY
     * @param {{ module?: Array, core?: Array, gm?: Array }|Array} options.zones - zones object or flat items array
     * @param {string} [options.className] - Extra class for styling
     * @param {string} [options.zoneClass] - Class to use for flat items zone (default core)
     */
    static show(options) {
        const { id, x, y, zones, className = '', zoneClass = 'core', maxWidth = 300 } = options || {};
        if (!id) throw new Error('UIContextMenu.show requires an id');

        this.close(id);

        const menu = document.createElement('div');
        menu.id = id;
        menu.className = `context-menu ${className}`.trim();
        menu.style.visibility = 'hidden';
        menu.style.left = '0px';
        menu.style.top = '0px';
        if (maxWidth) {
            menu.style.maxWidth = `${maxWidth}px`;
        }

        const root = document.body;

        const appendZone = (zoneName, items) => {
            if (!items?.length) return;
            const zone = document.createElement('div');
            zone.className = `context-menu-zone context-menu-zone-${zoneName}`;
            items.forEach((item) => {
                this._appendItem(zone, item, menu, id);
            });
            menu.appendChild(zone);
        };

        const addSeparator = () => {
            const sep = document.createElement('div');
            sep.className = 'context-menu-separator';
            menu.appendChild(sep);
        };

        if (Array.isArray(zones)) {
            appendZone(zoneClass, zones);
        } else {
            appendZone('module', zones?.module);
            if (zones?.module?.length) addSeparator();
            appendZone('core', zones?.core);
            if (zones?.gm?.length) addSeparator();
            appendZone('gm', zones?.gm);
        }

        root.appendChild(menu);

        this._positionMenu(menu, x, y);

        const clickClose = (e) => {
            if (!menu.isConnected) return;
            if (!menu.contains(e.target)) {
                this.close(id);
            }
        };
        const keyClose = (e) => {
            if (e.key === 'Escape') {
                this.close(id);
            }
        };

        const close = () => {
            this._closeSubmenu(menu);
            document.removeEventListener('click', clickClose);
            document.removeEventListener('keydown', keyClose);
            menu.remove();
            this._openMenus.delete(id);
        };

        this._openMenus.set(id, { root: menu, close });

        setTimeout(() => {
            document.addEventListener('click', clickClose);
            document.addEventListener('keydown', keyClose);
        }, 10);
    }

    static _appendItem(zoneEl, item, rootMenu, rootId) {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.className = 'context-menu-separator';
            zoneEl.appendChild(sep);
            return;
        }

        const menuItemEl = document.createElement('div');
        menuItemEl.className = 'context-menu-item';
        if (item.disabled) {
            menuItemEl.classList.add('is-disabled');
        }

        const iconHtml = item.icon
            ? (typeof item.icon === 'string' && item.icon.trim().startsWith('<')
                ? item.icon
                : `<i class="${item.icon}"></i>`)
            : '';
        const label = item.name || '';
        const description = item.description || '';

        if (iconHtml) {
            const iconWrap = document.createElement('span');
            iconWrap.className = 'context-menu-item-icon';
            iconWrap.innerHTML = iconHtml;
            menuItemEl.appendChild(iconWrap);
        }

        const content = document.createElement('span');
        content.className = 'context-menu-item-content';
        const labelEl = document.createElement('span');
        labelEl.className = 'context-menu-item-label';
        labelEl.textContent = label;
        content.appendChild(labelEl);
        if (description) {
            const descEl = document.createElement('span');
            descEl.className = 'context-menu-item-description';
            descEl.textContent = description;
            content.appendChild(descEl);
        }
        menuItemEl.appendChild(content);

        if (item.submenu && Array.isArray(item.submenu) && item.submenu.length) {
            menuItemEl.classList.add('has-submenu');
            const arrow = document.createElement('span');
            arrow.className = 'context-menu-submenu-arrow';
            arrow.textContent = '›';
            menuItemEl.appendChild(arrow);

            menuItemEl.addEventListener('mouseenter', () => {
                this._closeSubmenu(rootMenu);
                const submenu = this._buildSubmenu(menuItemEl, item.submenu, rootId);
                rootMenu._activeSubmenu = submenu;
            });
        } else if (!item.disabled) {
            menuItemEl.addEventListener('click', async () => {
                if (typeof item.callback === 'function') {
                    try {
                        await item.callback();
                    } catch (err) {
                        console.error('BLACKSMITH | CONTEXT MENU Item error', err);
                    }
                }
                UIContextMenu.close(rootId);
            });
        }

        zoneEl.appendChild(menuItemEl);
    }

    static _buildSubmenu(anchorEl, items, rootId) {
        const submenu = document.createElement('div');
        submenu.className = 'context-menu context-menu-submenu';
        submenu.style.visibility = 'hidden';
        submenu.style.left = '0px';
        submenu.style.top = '0px';

        const zone = document.createElement('div');
        zone.className = 'context-menu-zone context-menu-zone-core';
        items.forEach((item) => {
            this._appendItem(zone, item, submenu, rootId);
        });
        submenu.appendChild(zone);
        document.body.appendChild(submenu);

        const rect = anchorEl.getBoundingClientRect();
        const x = rect.right + 6;
        const y = rect.top;
        this._positionMenu(submenu, x, y);

        let closeTimeout = null;
        const SUBMENU_LEAVE_DELAY_MS = 200;

        const scheduleClose = () => {
            if (closeTimeout) return;
            closeTimeout = setTimeout(() => {
                closeTimeout = null;
                if (!submenu.isConnected) return;
                submenu.remove();
                anchorEl.removeEventListener('mouseleave', closeOnLeave);
                submenu.removeEventListener('mouseleave', closeOnLeave);
                submenu.removeEventListener('mouseenter', cancelClose);
                anchorEl.removeEventListener('mouseenter', cancelClose);
            }, SUBMENU_LEAVE_DELAY_MS);
        };

        const cancelClose = () => {
            if (closeTimeout) {
                clearTimeout(closeTimeout);
                closeTimeout = null;
            }
        };

        const closeOnLeave = (e) => {
            if (!submenu.isConnected) return;
            const target = e.relatedTarget;
            if (target && submenu.contains(target)) return;
            if (target && anchorEl.contains(target)) return;
            scheduleClose();
        };

        anchorEl.addEventListener('mouseleave', closeOnLeave);
        submenu.addEventListener('mouseleave', closeOnLeave);
        submenu.addEventListener('mouseenter', cancelClose);
        anchorEl.addEventListener('mouseenter', cancelClose);

        return submenu;
    }

    static _closeSubmenu(rootMenu) {
        const submenu = rootMenu?._activeSubmenu;
        if (submenu && submenu.isConnected) {
            submenu.remove();
        }
        if (rootMenu) {
            rootMenu._activeSubmenu = null;
        }
    }

    static _positionMenu(menu, x, y) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 8;

        const menuRect = menu.getBoundingClientRect();
        let finalX = x;
        let finalY = y;

        if (x + menuRect.width + padding > viewportWidth) {
            finalX = viewportWidth - menuRect.width - padding;
        }
        if (finalX < padding) {
            finalX = padding;
        }
        if (y + menuRect.height + padding > viewportHeight) {
            finalY = viewportHeight - menuRect.height - padding;
        }
        if (finalY < padding) {
            finalY = padding;
        }

        menu.style.left = `${finalX}px`;
        menu.style.top = `${finalY}px`;
        menu.style.visibility = 'visible';
    }
}
