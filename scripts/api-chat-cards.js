// ==================================================================
// ===== CHAT CARDS API ============================================
// ==================================================================

/**
 * Chat Cards API - Provides access to chat card themes and utilities
 * for external modules to create dropdowns and use Blacksmith's chat card system
 */

/**
 * Available chat card themes for the new CSS-based system
 * These are the themes that can be used with `.blacksmith-card.theme-{name}`
 * 
 * Theme types:
 * - 'card': Regular card themes with light backgrounds (default, blue, green, red, orange)
 * - 'announcement': Announcement themes with dark backgrounds and light header text
 */
export const CHAT_CARD_THEMES = Object.freeze([
    {
        id: 'default',
        name: 'Default',
        className: 'theme-default',
        type: 'card',
        description: 'Light background, subtle borders'
    },
    {
        id: 'blue',
        name: 'Blue',
        className: 'theme-blue',
        type: 'card',
        description: 'Blue accent theme'
    },
    {
        id: 'green',
        name: 'Green',
        className: 'theme-green',
        type: 'card',
        description: 'Green accent theme'
    },
    {
        id: 'red',
        name: 'Red',
        className: 'theme-red',
        type: 'card',
        description: 'Red accent theme'
    },
    {
        id: 'orange',
        name: 'Orange',
        className: 'theme-orange',
        type: 'card',
        description: 'Orange accent theme'
    },
    {
        id: 'announcement-green',
        name: 'Announcement Green',
        className: 'theme-announcement-green',
        type: 'announcement',
        description: 'Dark green background for announcements'
    },
    {
        id: 'announcement-blue',
        name: 'Announcement Blue',
        className: 'theme-announcement-blue',
        type: 'announcement',
        description: 'Dark blue background for announcements'
    },
    {
        id: 'announcement-red',
        name: 'Announcement Red',
        className: 'theme-announcement-red',
        type: 'announcement',
        description: 'Dark red background for announcements'
    }
]);

/**
 * Chat Cards API class
 */
export class ChatCardsAPI {
    /**
     * Get all available chat card themes
     * @param {string} [type] - Optional filter by type: 'card' or 'announcement'
     * @returns {Array<{id: string, name: string, className: string, type: string, description: string}>}
     */
    static getThemes(type = null) {
        const themes = [...CHAT_CARD_THEMES];
        if (type) {
            return themes.filter(t => t.type === type);
        }
        return themes;
    }

    /**
     * Get all card themes (light backgrounds)
     * @returns {Array<{id: string, name: string, className: string, type: string, description: string}>}
     */
    static getCardThemes() {
        return this.getThemes('card');
    }

    /**
     * Get all announcement themes (dark backgrounds)
     * @returns {Array<{id: string, name: string, className: string, type: string, description: string}>}
     */
    static getAnnouncementThemes() {
        return this.getThemes('announcement');
    }

    /**
     * Get themes by type
     * @param {string} type - Theme type: 'card' or 'announcement'
     * @returns {Array<{id: string, name: string, className: string, type: string, description: string}>}
     */
    static getThemesByType(type) {
        return this.getThemes(type);
    }

    /**
     * Get theme choices as an object suitable for Foundry settings dropdowns
     * @param {string} [type] - Optional filter by type: 'card' or 'announcement'
     * @returns {Object<string, string>} Object mapping theme IDs to display names
     */
    static getThemeChoices(type = null) {
        const themes = type ? this.getThemes(type) : CHAT_CARD_THEMES;
        const choices = {};
        for (const theme of themes) {
            choices[theme.id] = theme.name;
        }
        return choices;
    }

    /**
     * Get card theme choices (for regular cards)
     * @returns {Object<string, string>} Object mapping theme IDs to display names
     */
    static getCardThemeChoices() {
        return this.getThemeChoices('card');
    }

    /**
     * Get announcement theme choices (for announcements)
     * @returns {Object<string, string>} Object mapping theme IDs to display names
     */
    static getAnnouncementThemeChoices() {
        return this.getThemeChoices('announcement');
    }

    /**
     * Get theme choices with CSS class names as keys (for direct use in templates)
     * @param {string} [type] - Optional filter by type: 'card' or 'announcement'
     * @returns {Object<string, string>} Object mapping CSS class names to display names
     */
    static getThemeChoicesWithClassNames(type = null) {
        const themes = type ? this.getThemes(type) : CHAT_CARD_THEMES;
        const choices = {};
        for (const theme of themes) {
            choices[theme.className] = theme.name;
        }
        return choices;
    }

    /**
     * Get card theme choices with CSS class names as keys (for direct use in templates)
     * @returns {Object<string, string>} Object mapping CSS class names to display names
     */
    static getCardThemeChoicesWithClassNames() {
        return this.getThemeChoicesWithClassNames('card');
    }

    /**
     * Get announcement theme choices with CSS class names as keys (for direct use in templates)
     * @returns {Object<string, string>} Object mapping CSS class names to display names
     */
    static getAnnouncementThemeChoicesWithClassNames() {
        return this.getThemeChoicesWithClassNames('announcement');
    }

    /**
     * Get a theme by ID
     * @param {string} themeId - The theme ID (e.g., 'default', 'blue')
     * @returns {{id: string, name: string, className: string, type: string, description: string} | null}
     */
    static getTheme(themeId) {
        return CHAT_CARD_THEMES.find(t => t.id === themeId) || null;
    }

    /**
     * Get theme class name for a theme ID
     * @param {string} themeId - The theme ID
     * @returns {string} The CSS class name (e.g., 'theme-default')
     */
    static getThemeClassName(themeId) {
        const theme = this.getTheme(themeId);
        return theme ? theme.className : 'theme-default';
    }
}
