import { MODULE } from './const.js';

/**
 * Manages the loading progress indicator during module initialization
 */
export class LoadingProgressManager {
    static _overlay = null;
    static _currentStep = 0;
    static _totalSteps = 0;
    static _isVisible = false;

    /**
     * Show the loading progress indicator
     * @param {number} totalSteps - Total number of initialization steps
     */
    static show(totalSteps) {
        if (this._isVisible) {
            return; // Already showing
        }

        this._totalSteps = totalSteps;
        this._currentStep = 0;
        this._isVisible = true;

        // Create overlay element
        const overlay = document.createElement('div');
        overlay.id = 'cpb-loading-progress-overlay';
        overlay.className = 'cpb-loading-progress-overlay';

        overlay.innerHTML = `
            <div class="cpb-loading-progress-card">
                <div class="cpb-loading-progress-header">
                    <h2 class="cpb-loading-progress-title">${MODULE.TITLE}</h2>
                    <p class="cpb-loading-progress-subtitle">Initializing...</p>
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
    }

    /**
     * Update the progress indicator
     * @param {number} step - Current step number (1-based)
     * @param {string} message - Status message for current step
     */
    static update(step, message) {
        if (!this._isVisible || !this._overlay) {
            return;
        }

        this._currentStep = Math.min(step, this._totalSteps);
        const percentage = Math.round((this._currentStep / this._totalSteps) * 100);

        const fillBar = this._overlay.querySelector('.cpb-loading-progress-bar-fill');
        const stepText = this._overlay.querySelector('.cpb-loading-progress-step');
        const percentText = this._overlay.querySelector('.cpb-loading-progress-percent');

        if (fillBar) {
            fillBar.style.width = `${percentage}%`;
        }

        if (stepText) {
            stepText.textContent = message || `Step ${this._currentStep} of ${this._totalSteps}`;
        }

        if (percentText) {
            percentText.textContent = `${percentage}%`;
        }
    }

    /**
     * Hide the loading progress indicator
     */
    static hide() {
        if (!this._isVisible || !this._overlay) {
            return;
        }

        // Update to 100% before hiding
        this.update(this._totalSteps, 'Complete!');

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
        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
        this._isVisible = false;
    }
}
