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
    static _activityUpdateInterval = null;
    static _currentActivity = "Starting...";
    static _activityHistory = [];
    static _maxHistoryItems = 5;
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
                        <span class="cpb-loading-progress-activity-icon">⟳</span>
                        <span class="cpb-loading-progress-activity-text">Initializing...</span>
                    </div>
                    <div class="cpb-loading-progress-activity-history"></div>
                </div>
            </div>
        `;

        // Add click handler for close button
        const closeButton = overlay.querySelector('.cpb-loading-progress-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.hide();
            });
        }

        document.body.appendChild(overlay);
        this._overlay = overlay;

        // Trigger fade-in animation
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });

        // Start polling for loading state
        this._startPolling();
        
        // Start activity updates
        this._startActivityUpdates();
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

            // Detect current loading phase and activities
            let currentPhase = 0;
            let message = "Starting...";
            let activity = "Initializing...";

            // Phase 1: Modules loading (init hook)
            if (typeof Hooks !== 'undefined' && typeof game !== 'undefined') {
                currentPhase = 1;
                message = this._phaseNames[0];
                
                // Detect module loading activities
                if (game.modules) {
                    const moduleCount = game.modules.size;
                    const activeCount = Array.from(game.modules.values()).filter(m => m.active).length;
                    activity = `Loading modules (${activeCount}/${moduleCount})...`;
                    this.logActivity(activity);
                } else {
                    activity = "Loading module system...";
                    this.logActivity(activity);
                }

                // Phase 2: Systems initialized (after init, before setup)
                if (game.modules && game.modules.size > 0) {
                    currentPhase = 2;
                    message = this._phaseNames[1];
                    
                    // Detect system initialization
                    if (game.system) {
                        activity = `Initializing ${game.system.id} system...`;
                        this.logActivity(activity);
                    } else {
                        activity = "Preparing game systems...";
                        this.logActivity(activity);
                    }

                    // Phase 3: Game data setup (setup hook)
                    if (game.actors && game.actors.size >= 0) {
                        currentPhase = 3;
                        message = this._phaseNames[2];
                        
                        // Detect data loading
                        const actorCount = game.actors.size;
                        const itemCount = game.items?.size || 0;
                        const sceneCount = game.scenes?.size || 0;
                        activity = `Loading data (${actorCount} actors, ${itemCount} items, ${sceneCount} scenes)...`;
                        this.logActivity(activity);

                        // Phase 4: Canvas ready (canvasReady hook)
                        if (canvas && canvas.ready) {
                            currentPhase = 4;
                            message = this._phaseNames[3];
                            
                            activity = "Rendering canvas...";
                            this.logActivity(activity);

                            // Phase 5: Ready (ready hook fired)
                            if (game.ready) {
                                currentPhase = 5;
                                message = this._phaseNames[4];
                                
                                activity = "Finalizing initialization...";
                                this.logActivity(activity);
                            }
                        } else if (canvas) {
                            activity = "Preparing canvas layers...";
                            this.logActivity(activity);
                        }
                    } else {
                        activity = "Loading game data...";
                        this.logActivity(activity);
                    }
                }
            } else {
                activity = "Starting FoundryVTT...";
                this.logActivity(activity);
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
     * Start activity updates to show what's happening
     */
    static _startActivityUpdates() {
        if (this._activityUpdateInterval) {
            return;
        }

        // Update activity display periodically
        this._activityUpdateInterval = setInterval(() => {
            if (!this._isVisible || !this._overlay) {
                this._stopActivityUpdates();
                return;
            }

            this._updateActivityDisplay();
        }, 50); // Update every 50ms for smooth activity feed
    }

    /**
     * Stop activity updates
     */
    static _stopActivityUpdates() {
        if (this._activityUpdateInterval) {
            clearInterval(this._activityUpdateInterval);
            this._activityUpdateInterval = null;
        }
    }

    /**
     * Log an activity (what's currently happening)
     * @param {string} activity - Activity description
     */
    static logActivity(activity) {
        if (!activity || activity === this._currentActivity) {
            return; // Don't duplicate
        }

        // Add to history
        const timestamp = Date.now();
        this._activityHistory.unshift({
            text: activity,
            timestamp: timestamp
        });

        // Keep only recent items
        if (this._activityHistory.length > this._maxHistoryItems) {
            this._activityHistory = this._activityHistory.slice(0, this._maxHistoryItems);
        }

        this._currentActivity = activity;
    }

    /**
     * Update the activity display
     */
    static _updateActivityDisplay() {
        if (!this._overlay) {
            return;
        }

        const activityCurrent = this._overlay.querySelector('.cpb-loading-progress-activity-text');
        const activityHistory = this._overlay.querySelector('.cpb-loading-progress-activity-history');

        // Update current activity
        if (activityCurrent) {
            activityCurrent.textContent = this._currentActivity;
        }

        // Update history (show recent activities)
        if (activityHistory && this._activityHistory.length > 0) {
            // Show up to 3 most recent activities (excluding current)
            const recentActivities = this._activityHistory.slice(0, 3);
            activityHistory.innerHTML = recentActivities
                .map((item, index) => {
                    const opacity = 1 - (index * 0.25); // Fade older items
                    return `<div class="cpb-loading-progress-activity-item" style="opacity: ${opacity}">${item.text}</div>`;
                })
                .join('');
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

        // Stop polling and activity updates
        this._stopPolling();
        this._stopActivityUpdates();

        // Log completion
        this.logActivity("Complete!");

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
            this._activityHistory = [];
            this._currentActivity = "Starting...";
        }, 400); // Match CSS transition duration
    }

    /**
     * Force hide (for error cases)
     */
    static forceHide() {
        this._stopPolling();
        this._stopActivityUpdates();
        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
        this._isVisible = false;
        this._activityHistory = [];
        this._currentActivity = "Starting...";
    }
}
