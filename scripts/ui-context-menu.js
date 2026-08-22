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
     * @param {HTMLElement} [options.root] - Root element to append menu to (default: document.body). Use when the trigger is in a popout window.
     * @param {string} [options.className] - Extra class for styling
     * @param {string} [options.zoneClass] - Class to use for flat items zone (default core)
     */
    static show(options) {
        const { id, x, y, zones, root: rootOption, className = '', zoneClass = 'core', maxWidth = 300 } = options || {};
        if (!id) throw new Error('UIContextMenu.show requires an id');

        this.close(id);

        const root = rootOption || document.body;
        const doc = root.ownerDocument || document;

        const menu = doc.createElement('div');
        menu.id = id;
        menu.className = `context-menu ${className}`.trim();
        menu.style.visibility = 'hidden';
        menu.style.left = '0px';
        menu.style.top = '0px';
        if (maxWidth) {
            menu.style.maxWidth = `${maxWidth}px`;
        }

        const appendZone = (zoneName, items) => {
            if (!items?.length) return;
            const zone = doc.createElement('div');
            zone.className = `context-menu-zone context-menu-zone-${zoneName}`;
            zone.dataset.zoneName = zoneName;
            items.forEach((item) => {
                this._appendItem(zone, item, menu, id, doc);
            });
            menu.appendChild(zone);
        };

        const addSeparator = () => {
            const sep = doc.createElement('div');
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

        // Dismissal listens on `pointerdown` in the CAPTURE phase, on every document the menu might
        // be dismissed from.
        //
        // Capture, because a consumer whose UI calls stopPropagation() on its own clicks would
        // otherwise trap the menu open forever -- the event never reaches the document, so the
        // outside-click handler never runs. A map that swallows clicks to place things on it does
        // exactly that, and the menu could then only be closed by clicking an item inside it.
        //
        // `pointerdown` rather than `click`, because it removes the need to guess how long to wait
        // before arming. This used to attach after 150ms so the opening click could not immediately
        // close the menu, which both swallowed a genuine outside click inside that window and broke if
        // the consumer opened the menu on pointerdown instead. A pointerdown listener armed on the next
        // tick cannot see the gesture that opened the menu, whichever event that gesture was.
        //
        // Both documents, because `root` may belong to a popped-out window: a menu inside a popout
        // would otherwise ignore every click in the main window.
        const docs = new Set([doc, document].filter(Boolean));

        const pointerClose = (e) => {
            if (!menu.isConnected) return;
            // A submenu is appended to its own document body rather than inside the menu, so it is not
            // covered by menu.contains and has to be checked separately or clicking one closes the lot.
            const submenu = menu._activeSubmenu;
            if (menu.contains(e.target)) return;
            if (submenu?.contains?.(e.target)) return;
            this.close(id);
        };

        const keyClose = (e) => {
            if (e.key !== 'Escape') return;
            // Stop here. Foundry's ApplicationV2 also closes on Escape, so without this the keypress
            // dismissed the menu AND the window behind it -- which reads as Escape closing the window
            // and ignoring the menu. Capture phase plus stopPropagation is what puts us first.
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            this.close(id);
        };

        const close = () => {
            this._closeSubmenu(menu);
            for (const d of docs) {
                d.removeEventListener('pointerdown', pointerClose, true);
                d.removeEventListener('keydown', keyClose, true);
            }
            menu.remove();
            this._openMenus.delete(id);
        };

        this._openMenus.set(id, { root: menu, close });

        // Next tick, not a timed delay: by the time this runs the opening gesture has been dispatched.
        setTimeout(() => {
            if (!menu.isConnected) return;
            for (const d of docs) {
                d.addEventListener('pointerdown', pointerClose, true);
                d.addEventListener('keydown', keyClose, true);
            }
        }, 0);
    }

    static _appendItem(zoneEl, item, rootMenu, rootId, doc = document) {
        if (item.separator) {
            const sep = doc.createElement('div');
            sep.className = 'context-menu-separator';
            zoneEl.appendChild(sep);
            return;
        }

        // AN INFORMATION BLOCK IS NOT A DISABLED ITEM. `disabled` was the closest
        // thing available and it read wrong: a row that highlights on hover, dims
        // itself and shows a not-allowed cursor tells the reader something has been
        // taken away from them. A date at the top of a clock menu was never an
        // action, so it should not look like a broken one.
        //
        // It takes `name`, optional `description`, optional `icon`, and optional
        // `image` (a src, rendered above the text). `html` is accepted for callers
        // that need markup and is inserted as-is -- the caller owns that string, the
        // same contract `icon` already has when passed as markup.
        if (item.information) {
            const info = doc.createElement('div');
            info.className = 'context-menu-information';

            if (item.image) {
                const img = doc.createElement('img');
                img.className = 'context-menu-information-image';
                img.src = item.image;
                img.alt = '';
                info.appendChild(img);
            }

            if (item.html) {
                const body = doc.createElement('div');
                body.className = 'context-menu-information-body';
                body.innerHTML = item.html;
                info.appendChild(body);
            } else {
                if (item.icon) {
                    const iconWrap = doc.createElement('span');
                    iconWrap.className = 'context-menu-information-icon';
                    iconWrap.innerHTML = typeof item.icon === 'string' && item.icon.trim().startsWith('<')
                        ? item.icon
                        : `<i class="${item.icon}"></i>`;
                    info.appendChild(iconWrap);
                }
                if (item.name) {
                    const title = doc.createElement('div');
                    title.className = 'context-menu-information-title';
                    title.textContent = item.name;
                    info.appendChild(title);
                }
                if (item.description) {
                    const note = doc.createElement('div');
                    note.className = 'context-menu-information-note';
                    note.textContent = item.description;
                    info.appendChild(note);
                }
            }

            zoneEl.appendChild(info);
            return;
        }

        const menuItemEl = doc.createElement('div');
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
            const iconWrap = doc.createElement('span');
            iconWrap.className = 'context-menu-item-icon';
            iconWrap.innerHTML = iconHtml;
            menuItemEl.appendChild(iconWrap);
        }

        const content = doc.createElement('span');
        content.className = 'context-menu-item-content';
        const labelEl = doc.createElement('span');
        labelEl.className = 'context-menu-item-label';
        labelEl.textContent = label;
        content.appendChild(labelEl);
        if (description) {
            const descEl = doc.createElement('span');
            descEl.className = 'context-menu-item-description';
            descEl.textContent = description;
            content.appendChild(descEl);
        }
        menuItemEl.appendChild(content);

        if (item.submenu && Array.isArray(item.submenu) && item.submenu.length) {
            menuItemEl.classList.add('has-submenu');
            const arrow = doc.createElement('span');
            arrow.className = 'context-menu-submenu-arrow';
            arrow.textContent = '›';
            menuItemEl.appendChild(arrow);

            // A flyout keeps its parent zone's tint — a GM-zone submenu that
            // rendered in the core colour would read as a different class of
            // action than the row that opened it.
            const zoneName = zoneEl.dataset?.zoneName || 'core';
            menuItemEl.addEventListener('mouseenter', () => {
                this._closeSubmenu(rootMenu);
                const submenu = this._buildSubmenu(menuItemEl, item.submenu, rootId, zoneName);
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

    static _buildSubmenu(anchorEl, items, rootId, zoneName = 'core') {
        const doc = anchorEl.ownerDocument || document;
        const submenu = doc.createElement('div');
        submenu.className = 'context-menu context-menu-submenu';
        submenu.style.visibility = 'hidden';
        submenu.style.left = '0px';
        submenu.style.top = '0px';

        const zone = doc.createElement('div');
        zone.className = `context-menu-zone context-menu-zone-${zoneName}`;
        zone.dataset.zoneName = zoneName;
        items.forEach((item) => {
            this._appendItem(zone, item, submenu, rootId, doc);
        });
        submenu.appendChild(zone);
        doc.body.appendChild(submenu);

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
