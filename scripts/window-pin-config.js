// ==================================================================
// ===== WINDOW-PIN-CONFIG – Pin Configuration Window ===============
// ==================================================================
// Application V2 window for configuring pin properties.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/**
 * PinConfigurationWindow - Application V2 window for configuring pins
 */
export class PinConfigurationWindow extends Application {
    constructor(pinId, options = {}) {
        super(options);
        this.pinId = pinId;
        this.sceneId = options.sceneId || canvas?.scene?.id;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'blacksmith-pin-config',
            template: `modules/${MODULE.ID}/templates/window-pin-config.hbs`,
            classes: ['blacksmith', 'pin-config-window'],
            title: 'Configure Pin',
            width: 600,
            height: 700,
            resizable: true,
            minimizable: true
        });
    }

    async getData() {
        // Get pin data
        const { PinManager } = await import('./manager-pins.js');
        const pin = PinManager.get(this.pinId, { sceneId: this.sceneId });
        
        if (!pin) {
            throw new Error(`Pin not found: ${this.pinId}`);
        }

        // Check permissions
        const userId = game.user?.id || '';
        if (!PinManager._canEdit(pin, userId)) {
            throw new Error('Permission denied: you cannot edit this pin.');
        }

        // Prepare form data with defaults
        const data = {
            pin: foundry.utils.deepClone(pin),
            // Shape options
            shapes: [
                { value: 'circle', label: 'Circle', icon: 'fa-circle' },
                { value: 'square', label: 'Square', icon: 'fa-square' },
                { value: 'none', label: 'Icon Only', icon: 'fa-image' }
            ],
            // Text layout options
            textLayouts: [
                { value: 'under', label: 'Under Pin' },
                { value: 'over', label: 'Over Pin' },
                { value: 'around', label: 'Around Pin' }
            ],
            // Text display options
            textDisplays: [
                { value: 'always', label: 'Always' },
                { value: 'hover', label: 'On Hover' },
                { value: 'never', label: 'Never' },
                { value: 'gm', label: 'GM Only' }
            ],
            // Ownership levels for ownership editor
            ownershipLevels: [
                { value: 0, label: 'None' },
                { value: 1, label: 'Limited' },
                { value: 2, label: 'Observer' },
                { value: 3, label: 'Owner' }
            ],
            // Current ownership display
            currentOwnership: pin.ownership || { default: 0 },
            // User list for ownership editor
            users: game.users?.map(u => ({
                id: u.id,
                name: u.name,
                isGM: u.isGM,
                level: pin.ownership?.users?.[u.id] ?? null
            })) || []
        };

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Color picker handlers (if using color inputs)
        html.find('input[type="color"]').on('change', (e) => {
            // Update preview if needed
        });

        // Image/icon preview handler
        html.find('.pin-preview').on('click', () => {
            // Could open image picker here
        });

        // Form submission
        html.find('form').on('submit', (e) => {
            e.preventDefault();
            this._onSubmit(e);
        });

        // Cancel button
        html.find('.cancel-button').on('click', () => {
            this.close();
        });
    }

    async _onSubmit(event) {
        const form = event.target;
        const formData = new FormData(form);
        const updateData = {};

        // Extract all form fields
        // Size
        const width = parseInt(formData.get('size-width')) || 32;
        const height = parseInt(formData.get('size-height')) || 32;
        updateData.size = { w: width, h: height };

        // Style
        updateData.style = {
            fill: formData.get('style-fill') || '#000000',
            stroke: formData.get('style-stroke') || '#ffffff',
            strokeWidth: parseInt(formData.get('style-strokeWidth')) || 2,
            alpha: parseFloat(formData.get('style-alpha')) || 1
        };

        // Shape
        updateData.shape = formData.get('shape') || 'circle';

        // Drop shadow
        updateData.dropShadow = formData.get('dropShadow') === 'true' || formData.get('dropShadow') === 'on';

        // Text properties
        updateData.text = formData.get('text') || '';
        updateData.textLayout = formData.get('textLayout') || 'under';
        updateData.textDisplay = formData.get('textDisplay') || 'always';
        updateData.textColor = formData.get('textColor') || '#ffffff';
        updateData.textSize = parseInt(formData.get('textSize')) || 12;
        updateData.textMaxLength = parseInt(formData.get('textMaxLength')) || 0;
        updateData.textScaleWithPin = formData.get('textScaleWithPin') === 'true' || formData.get('textScaleWithPin') === 'on';

        // Type
        updateData.type = formData.get('type') || 'default';

        // Image/icon
        const image = formData.get('image');
        if (image) {
            updateData.image = image;
        }

        // Ownership (if GM)
        if (game.user?.isGM) {
            const defaultLevel = parseInt(formData.get('ownership-default')) || 0;
            updateData.ownership = { default: defaultLevel };
            
            // User-specific ownership
            const userOwnership = {};
            for (const user of game.users || []) {
                const level = formData.get(`ownership-user-${user.id}`);
                if (level !== null) {
                    const levelNum = parseInt(level);
                    if (!isNaN(levelNum) && levelNum > 0) {
                        userOwnership[user.id] = levelNum;
                    }
                }
            }
            if (Object.keys(userOwnership).length > 0) {
                updateData.ownership.users = userOwnership;
            }
        }

        // Update pin via API
        try {
            const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
            if (!pinsAPI) {
                throw new Error('Pins API not available');
            }

            await pinsAPI.update(this.pinId, updateData, { sceneId: this.sceneId });
            
            ui.notifications.info('Pin configuration updated.');
            this.close();
        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, 'Error updating pin configuration', err?.message || err, false, true);
            ui.notifications.error(`Failed to update pin: ${err.message}`);
        }
    }

    /**
     * Static method to open configuration window for a pin
     * @param {string} pinId - Pin ID to configure
     * @param {Object} [options] - Options
     * @param {string} [options.sceneId] - Scene ID (defaults to active scene)
     * @returns {Promise<PinConfigurationWindow>} - The opened window instance
     */
    static async open(pinId, options = {}) {
        const window = new PinConfigurationWindow(pinId, options);
        await window.render(true);
        return window;
    }
}
