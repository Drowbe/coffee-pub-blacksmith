import { MODULE } from './const.js';

/**
 * Manages the loading progress indicator during FoundryVTT world loading
 * Tracks overall FoundryVTT loading phases, not just module initialization
 */
export class LoadingProgressManager {
    static _overlay = null;
    static _currentPhase = 0;
    static _totalPhases = 5;
    static _isVisible = false;
    static _pollInterval = null;
    static _phaseNames = [
        "Loading modules...",
        "Initializing systems...",
        "Setting up game data...",
        "Preparing canvas...",
        "Finalizing..."
    ];

    /**
     * Show the loading progress indicator
     * Should be called as early as possible (in init hook)
     */
    static show() {
        if (this._isVisible) {
            return; // Already showing
        }

        this._currentPhase = 0;
        this._isVisible = true;

        // Create overlay element
        const overlay = document.createElement('div');
        overlay.id = 'cpb-loading-progress-overlay';
        overlay.className = 'cpb-loading-progress-overlay';

        overlay.innerHTML = `
            <div class="cpb-loading-progress-card">
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
            </div>
        `;

        document.body.appendChild(overlay);
        this._overlay = overlay;

        // Trigger fade-in animation
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });

        // Start polling for loading state
        this._startPolling();
    }

    /**
     * Start polling to detect FoundryVTT loading phases
     */
    static _startPolling() {
        if (this._pollInterval) {
            return;
        }

        let lastPhase = 0;

        this._pollInterval = setInterval(() => {
            if (!this._isVisible || !this._overlay) {
                this._stopPolling();
                return;
            }

            // Detect current loading phase
            let currentPhase = 0;
            let message = "Starting...";

            // Phase 1: Modules loading (init hook)
            if (typeof Hooks !== 'undefined' && typeof game !== 'undefined') {
                currentPhase = 1;
                message = this._phaseNames[0];

                // Phase 2: Systems initialized (after init, before setup)
                if (game.modules && game.modules.size > 0) {
                    currentPhase = 2;
                    message = this._phaseNames[1];

                    // Phase 3: Game data setup (setup hook)
                    if (game.actors && game.actors.size >= 0) {
                        currentPhase = 3;
                        message = this._phaseNames[2];

                        // Phase 4: Canvas ready (canvasReady hook)
                        if (canvas && canvas.ready) {
                            currentPhase = 4;
                            message = this._phaseNames[3];

                            // Phase 5: Ready (ready hook fired)
                            if (game.ready) {
                                currentPhase = 5;
                                message = this._phaseNames[4];
                            }
                        }
                    }
                }
            }

            // Update if phase changed
            if (currentPhase !== lastPhase) {
                lastPhase = currentPhase;
                this._currentPhase = currentPhase;
                this._updateDisplay(currentPhase, message);
            }
        }, 100); // Poll every 100ms
    }

    /**
     * Stop polling
     */
    static _stopPolling() {
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
        }
    }

    /**
     * Update the display
     * @param {number} phase - Current phase (0-5)
     * @param {string} message - Status message
     */
    static _updateDisplay(phase, message) {
        if (!this._overlay) {
            return;
        }

        // Calculate percentage (0-100%)
        const percentage = Math.round((phase / this._totalPhases) * 100);

        const fillBar = this._overlay.querySelector('.cpb-loading-progress-bar-fill');
        const stepText = this._overlay.querySelector('.cpb-loading-progress-step');
        const percentText = this._overlay.querySelector('.cpb-loading-progress-percent');

        if (fillBar) {
            fillBar.style.width = `${percentage}%`;
        }

        if (stepText) {
            stepText.textContent = message;
        }

        if (percentText) {
            percentText.textContent = `${percentage}%`;
        }
    }

    /**
     * Manually set phase (for explicit phase tracking)
     * @param {number} phase - Phase number (1-5)
     * @param {string} message - Optional custom message
     */
    static setPhase(phase, message) {
        if (!this._isVisible || !this._overlay) {
            return;
        }

        this._currentPhase = Math.min(Math.max(phase, 0), this._totalPhases);
        const displayMessage = message || this._phaseNames[phase - 1] || "Loading...";
        this._updateDisplay(this._currentPhase, displayMessage);
    }

    /**
     * Hide the loading progress indicator
     * Should be called when ready hook completes
     */
    static hide() {
        if (!this._isVisible || !this._overlay) {
            return;
        }

        // Stop polling
        this._stopPolling();

        // Update to 100% before hiding
        this._updateDisplay(this._totalPhases, 'Complete!');

        // Fade out animation
        this._overlay.classList.remove('visible');

        // Remove from DOM after animation
        setTimeout(() => {
            if (this._overlay && this._overlay.parentNode) {
                this._overlay.parentNode.removeChild(this._overlay);
            }
            this._overlay = null;
            this._isVisible = false;
        }, 400); // Match CSS transition duration
    }

    /**
     * Force hide (for error cases)
     */
    static forceHide() {
        this._stopPolling();
        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
        this._isVisible = false;
    }
}
