import { MODULE } from './const.js';

/**
 * Manages the loading progress indicator during FoundryVTT world loading.
 * This manager is intentionally event-driven: callers advance phases and log
 * activities explicitly, rather than polling Foundry state or repainting on timers.
 */
export class LoadingProgressManager {
    static _overlay = null;
    static _refs = null;
    static _currentPhase = 0;
    static _totalPhases = 5;
    static _isVisible = false;
    static _currentActivity = 'Starting...';
    static _activityHistory = [];
    static _maxHistoryItems = 3;
    static _phaseNames = [
        'Loading modules...',
        'Initializing systems...',
        'Setting up game data...',
        'Preparing canvas...',
        'Finalizing...'
    ];

    static SETTING_KEY = 'coreLoadingProgress';
    static BOOTSTRAP_STORAGE_KEY = `${MODULE.ID}.coreLoadingProgress.bootstrap`;

    /**
     * Check if Stream View is active
     * Stream View hides most UI, so we should not show loading indicators
     * @returns {boolean} True if Stream View is active
     */
    static isStreamView() {
        if (typeof document === 'undefined' || !document.body) return false;
        return document.body.classList.contains('stream') || document.body.classList.contains('no-ui');
    }

    /**
     * Persist a small bootstrap mirror of the loader preference so it can be read
     * before Foundry's settings registry is ready.
     * @param {boolean} value
     */
    static writeBootstrapPreference(value) {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(this.BOOTSTRAP_STORAGE_KEY, value === false ? 'false' : 'true');
        } catch {
            // Non-fatal.
        }
    }

    /**
     * Read the explicit bootstrap mirror. Returns null when absent/invalid.
     * @returns {boolean | null}
     * @private
     */
    static _readBootstrapPreference() {
        try {
            if (typeof localStorage === 'undefined') return null;
            const raw = localStorage.getItem(this.BOOTSTRAP_STORAGE_KEY);
            if (raw === 'false') return false;
            if (raw === 'true') return true;
        } catch {
            // Non-fatal.
        }
        return null;
    }

    /**
     * Normalize a persisted Foundry/local storage setting payload into a boolean.
     * Returns null when no explicit boolean can be determined.
     * @param {unknown} value
     * @returns {boolean | null}
     * @private
     */
    static _coerceStoredBoolean(value) {
        if (typeof value === 'boolean') return value;
        if (value && typeof value === 'object' && 'value' in value) {
            return this._coerceStoredBoolean(value.value);
        }
        if (typeof value === 'string') {
            if (value === 'false') return false;
            if (value === 'true') return true;
            try {
                return this._coerceStoredBoolean(JSON.parse(value));
            } catch {
                return null;
            }
        }
        return null;
    }

    /**
     * Try to read the persisted client setting directly from Foundry's client
     * storage without trusting `game.settings.get()` to be hydrated yet.
     * Returns null when no explicit persisted value is found.
     * @returns {boolean | null}
     * @private
     */
    static _readPersistedClientSetting() {
        try {
            const fullKey = `${MODULE.ID}.${this.SETTING_KEY}`;
            const clientStore = game?.settings?.storage?.get?.('client');
            const raw = clientStore?.get?.(fullKey);
            return this._coerceStoredBoolean(raw);
        } catch {
            return null;
        }
    }

    /**
     * Show the loading progress indicator.
     * Should be called as early as possible (in init hook).
     * Checks the coreLoadingProgress setting - defaults to showing if setting unavailable.
     * Does not show if Stream View is active.
     */
    static show() {
        if (this._isVisible) return;
        if (this.isStreamView()) return;

        const bootstrapPreference = this._readBootstrapPreference();
        if (bootstrapPreference === false) return;
        if (bootstrapPreference == null) {
            const persistedPreference = this._readPersistedClientSetting();
            if (persistedPreference === false) return;
            if (persistedPreference === true) this.writeBootstrapPreference(true);
        }

        try {
            const fullKey = `${MODULE.ID}.${this.SETTING_KEY}`;
            if (game?.settings?.settings?.has?.(fullKey) && game.settings.get(MODULE.ID, this.SETTING_KEY) === false) {
                return;
            }
        } catch {
            // Bootstrap/persisted read above is authoritative for early startup.
        }

        this._isVisible = true;

        const overlay = document.createElement('div');
        overlay.id = 'cpb-loading-progress-overlay';
        overlay.className = 'cpb-loading-progress-overlay';
        overlay.innerHTML = `
            <div class="cpb-loading-progress-card">
                <button class="cpb-loading-progress-close" title="Close progress indicator">
                    <i class="fas fa-times"></i>
                </button>
                <div class="cpb-loading-progress-header">
                    <h2 class="cpb-loading-progress-title">Loading World</h2>
                    <p class="cpb-loading-progress-subtitle">Please wait...</p>
                </div>
                <div class="cpb-loading-progress-bar-container">
                    <div class="cpb-loading-progress-bar">
                        <div class="cpb-loading-progress-bar-fill" style="width: 0%"></div>
                    </div>
                    <div class="cpb-loading-progress-text">
                        <span class="cpb-loading-progress-step">Starting...</span>
                        <span class="cpb-loading-progress-percent">0%</span>
                    </div>
                </div>
                <div class="cpb-loading-progress-activity">
                    <div class="cpb-loading-progress-activity-current">
                        <span class="cpb-loading-progress-activity-icon"><i class="fa-solid fa-spinner"></i></span>
                        <span class="cpb-loading-progress-activity-text">Initializing...</span>
                    </div>
                    <div class="cpb-loading-progress-activity-history"></div>
                </div>
            </div>
        `;

        const closeButton = overlay.querySelector('.cpb-loading-progress-close');
        if (closeButton) closeButton.addEventListener('click', () => this.hide());

        document.body.appendChild(overlay);
        this._overlay = overlay;
        this._refs = {
            fillBar: overlay.querySelector('.cpb-loading-progress-bar-fill'),
            stepText: overlay.querySelector('.cpb-loading-progress-step'),
            percentText: overlay.querySelector('.cpb-loading-progress-percent'),
            activityCurrent: overlay.querySelector('.cpb-loading-progress-activity-text'),
            activityHistory: overlay.querySelector('.cpb-loading-progress-activity-history')
        };

        this._renderAll();

        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
    }

    /**
     * Reconcile current visibility against the real registered setting once
     * settings are available.
     */
    static reconcileVisibilityFromSetting() {
        try {
            const fullKey = `${MODULE.ID}.${this.SETTING_KEY}`;
            if (!game?.settings?.settings?.has?.(fullKey)) return;
            const shouldShow = game.settings.get(MODULE.ID, this.SETTING_KEY) !== false;
            this.writeBootstrapPreference(shouldShow);
            if (!shouldShow && this._isVisible) {
                this.forceHide();
            }
        } catch {
            // Non-fatal; leave current state unchanged.
        }
    }

    /**
     * Render the full loading state once.
     * @private
     */
    static _renderAll() {
        this._renderPhase();
        this._renderActivity();
    }

    /**
     * Render phase/progress UI from current state.
     * @private
     */
    static _renderPhase() {
        if (!this._overlay || !this._refs) return;
        const percentage = Math.round((this._currentPhase / this._totalPhases) * 100);
        const message = this._phaseNames[Math.max(0, this._currentPhase - 1)] || 'Loading...';

        if (this._refs.fillBar) this._refs.fillBar.style.width = `${percentage}%`;
        if (this._refs.stepText) this._refs.stepText.textContent = message;
        if (this._refs.percentText) this._refs.percentText.textContent = `${percentage}%`;
    }

    /**
     * Render activity UI from current state.
     * @private
     */
    static _renderActivity() {
        if (!this._overlay || !this._refs) return;

        if (this._refs.activityCurrent) {
            this._refs.activityCurrent.textContent = this._currentActivity;
        }

        if (!this._refs.activityHistory) return;
        const recentActivities = this._activityHistory.slice(0, this._maxHistoryItems);
        const html = recentActivities
            .map((item, index) => {
                const opacity = 1 - (index * 0.25);
                return `<div class="cpb-loading-progress-activity-item" style="opacity: ${opacity}">${item.text}</div>`;
            })
            .join('');

        if (this._refs.activityHistory.innerHTML !== html) {
            this._refs.activityHistory.innerHTML = html;
        }
    }

    /**
     * Log an activity (what's currently happening).
     * @param {string} activity - Activity description
     */
    static logActivity(activity) {
        if (!activity || activity === this._currentActivity) return;

        this._activityHistory.unshift({
            text: activity,
            timestamp: Date.now()
        });
        if (this._activityHistory.length > this._maxHistoryItems) {
            this._activityHistory = this._activityHistory.slice(0, this._maxHistoryItems);
        }

        this._currentActivity = activity;
        this._renderActivity();
    }

    /**
     * Manually set phase (for explicit phase tracking).
     * @param {number} phase - Phase number (1-5)
     * @param {string} [message] - Optional custom message
     */
    static setPhase(phase, message) {
        this._currentPhase = Math.min(Math.max(phase, 0), this._totalPhases);
        if (message) {
            const idx = this._currentPhase - 1;
            if (idx >= 0 && idx < this._phaseNames.length) this._phaseNames[idx] = message;
        }
        this._renderPhase();
    }

    /**
     * Hide the loading progress indicator.
     * Should be called when ready hook completes.
     */
    static hide() {
        if (!this._isVisible || !this._overlay) return;

        this.logActivity('Complete!');
        this.setPhase(this._totalPhases, 'Complete!');
        this._overlay.classList.remove('visible');

        setTimeout(() => {
            if (this._overlay?.parentNode) this._overlay.parentNode.removeChild(this._overlay);
            this._reset();
        }, 250);
    }

    /**
     * Force hide (for error cases)
     */
    static forceHide() {
        if (this._overlay?.parentNode) this._overlay.parentNode.removeChild(this._overlay);
        this._reset();
    }

    /**
     * Reset in-memory state after hide/forceHide.
     * @private
     */
    static _reset() {
        this._overlay = null;
        this._refs = null;
        this._isVisible = false;
        this._activityHistory = [];
        this._currentActivity = 'Starting...';
        this._currentPhase = 0;
    }
}
