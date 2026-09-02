// ==================================================================
// ===== DICE TRAY WINDOW ===========================================
// ==================================================================
//
// A formula builder: click dice and operators to assemble an expression,
// then roll it to chat. Adopted from Squire, where it was split across a
// panel class and a window shell; here it is one file, because Blacksmith
// has no panel layer for it to be the other half of.
//
// The actor this window names is cosmetic. Rolls go through
// `ChatMessage.getSpeaker()` with no argument, so the speaker is resolved by
// Foundry from the user's own token and character -- it never came from the
// window's actor, in Squire either. The actor is the title and nothing else.
//
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { BlacksmithToolWindowBaseV2 } from './window-tool-base.js';
import { HookManager } from './manager-hooks.js';
import { registerWindow } from './api-windows.js';
import { MenuBar } from './api-menubar.js';
import { setToolWindowState } from './manager-tool-windows.js';
// BOTH OF THESE CLOSE AN IMPORT CYCLE, and both are safe because nothing here touches
// them at module-evaluation time -- every use is inside a click handler or a menu
// builder. The cycle runs window-dicetray -> window-skillcheck -> manager-sockets ->
// api-menubar -> ui-journal-encounter -> blacksmith -> window-dicetray, which is the
// same shape manager-rolls and window-skillcheck have had for a long time.
//
// If you ever need one of these AT EVALUATION -- to extend a class, or to read a static
// into a module-level constant -- this breaks, silently, as `undefined` in whichever
// file the graph happens to reach second. Keep the uses deferred.
import { SkillCheckDialog } from './window-skillcheck.js';
import { SidebarStyle } from './ui-sidebar-style.js';

export const DICE_TRAY_WINDOW_ID = 'blacksmith-dice-tray';

/** Height with the roll history showing. Without it the window measures its own content instead. */
const HEIGHT_WITH_HISTORY = 280;

/** How many past rolls the history keeps. */
const HISTORY_LIMIT = 10;

/**
 * The actor whose name titles the window.
 *
 * Squire resolved this from its tray's "current character", which also moved when
 * an actor sheet was opened. Blacksmith uses canvas selection with the user's own
 * character as the fallback, which is the right meaning for a hub-level tool and
 * matches what the Health window does.
 *
 * @returns {Actor|null}
 */
function getCurrentActor() {
    return canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
}

export class DiceTrayWindow extends BlacksmithToolWindowBaseV2 {
    static ROOT_CLASS = 'blacksmith-window-tool-root';

    /** The open instance, so the menubar tool raises it rather than opening a second one. */
    static activeWindow = null;

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'blacksmith-dicetray-window',
            classes: ['blacksmith-dicetray-tool-window'],
            position: {
                width: 400,
                height: HEIGHT_WITH_HISTORY
            },
            window: {
                title: 'Dice Tray',
                resizable: false,
                minimizable: true
            },
            windowSizeConstraints: {
                minWidth: 300,
                maxWidth: 520,
                maxHeight: HEIGHT_WITH_HISTORY
            },
            toolTitlebar: 'micro',
            rememberPosition: true,
            windowPositionKey: 'blacksmith-dice-tray-micro-position'
        }
    );

    static PARTS = {
        body: {
            template: 'modules/coffee-pub-blacksmith/templates/window-tool-template.hbs'
        }
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        const showRecentRolls = game.settings.get(MODULE.ID, 'diceTrayShowRecentRolls');
        opts.id = opts.id ?? DiceTrayWindow.DEFAULT_OPTIONS.id;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, DiceTrayWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        // Inherited from Squire and load-bearing: with the history hidden the window has
        // no content tall enough to size against, so it opens at a smaller fixed height and
        // _fitHiddenHistoryHeight() measures the real content once it has rendered.
        opts.position.height = showRecentRolls ? HEIGHT_WITH_HISTORY : 150;
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, DiceTrayWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);

        this.currentFormula = '';
        this.rollHistory = [];
        this.showRecentRolls = showRecentRolls;
        this.actor = getCurrentActor();
        this._registeredActor = null;
        this._registerActor(this.actor);
        this._hookContext = `dicetray:${this.id}`;

        // Follow the selection so the title stays honest. Registered through HookManager
        // so closing the window disposes it by context rather than leaking a listener.
        HookManager.registerHook({
            name: 'controlToken',
            description: 'Dice Tray: retitle for the selected token',
            priority: 4,
            context: this._hookContext,
            callback: () => {
                // --- BEGIN - HOOKMANAGER CALLBACK ---
                void this.updateActor(getCurrentActor());
                // --- END - HOOKMANAGER CALLBACK ---
            }
        });
    }

    get title() {
        return `Dice Tray: ${this.actor?.name || 'No Character'}`;
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.window ??= {};
        options.window.title = this.title;
    }

    // ==============================================================
    // ===== TITLEBAR ===============================================
    // ==============================================================

    getToolHeaderActions() {
        return [
            ...(super.getToolHeaderActions?.() ?? []),
            {
                id: 'toggle-recent-rolls',
                icon: 'fa-solid fa-clock-rotate-left',
                label: this.showRecentRolls ? 'Hide Recent Rolls' : 'Show Recent Rolls',
                active: this.showRecentRolls,
                onClick: () => this._toggleRecentRolls()
            }
        ];
    }

    async _toggleRecentRolls() {
        this.showRecentRolls = !this.showRecentRolls;
        await game.settings.set(MODULE.ID, 'diceTrayShowRecentRolls', this.showRecentRolls);
        await this.render(false);
        if (this.showRecentRolls) {
            this.setPosition({ height: HEIGHT_WITH_HISTORY });
            return;
        }

        await new Promise((resolve) => requestAnimationFrame(resolve));
        this._fitHiddenHistoryHeight();
    }

    /**
     * Shrink the window to exactly its content when the history is hidden.
     *
     * Measures the last child's bottom edge rather than the content box, because the
     * content box keeps the height it had while the history was visible.
     */
    _fitHiddenHistoryHeight() {
        if (this.showRecentRolls || !this.element) return;
        const body = this.element?.querySelector?.('.blacksmith-window-tool-body');
        const content = this.element?.querySelector?.('#blacksmith-dicetray-content');
        const frameHeight = this.element?.getBoundingClientRect?.().height || 0;
        const bodyHeight = body?.getBoundingClientRect?.().height || 0;
        const contentRect = content?.getBoundingClientRect?.();
        const contentStyle = content ? getComputedStyle(content) : null;
        const lastChild = content?.lastElementChild;
        const lastChildBottom = lastChild?.getBoundingClientRect?.().bottom;
        const paddingBottom = parseFloat(contentStyle?.paddingBottom || '0') || 0;
        const contentHeight = contentRect && Number.isFinite(lastChildBottom)
            ? Math.ceil(lastChildBottom - contentRect.top + paddingBottom)
            : (contentRect?.height || 0);
        const chromeHeight = Math.max(0, frameHeight - bodyHeight);
        this.setPosition({ height: Math.ceil(chromeHeight + contentHeight) });
    }

    // ==============================================================
    // ===== RENDER =================================================
    // ==============================================================

    async getData() {
        const content = await foundry.applications.handlebars.renderTemplate(
            'modules/coffee-pub-blacksmith/templates/window-dicetray.hbs',
            {
                actor: this.actor,
                showRecentRolls: this.showRecentRolls,
                rollHistory: this.rollHistory
            }
        );

        return {
            appId: this.id,
            bodyContent: content
        };
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        this._activateDiceListeners(this.element);
        if (!this.showRecentRolls) {
            requestAnimationFrame(() => this._fitHiddenHistoryHeight());
        }
    }

    // ==============================================================
    // ===== LISTENERS ==============================================
    // ==============================================================

    _activateDiceListeners(root) {
        if (!root) return;
        const panel = root.querySelector?.('#blacksmith-dicetray-content') ?? root;
        if (!panel) return;

        // Dice: left click adds one, right click removes one.
        panel.querySelectorAll('.blacksmith-dice-icon').forEach((icon) => {
            icon.addEventListener('click', (ev) => {
                ev.preventDefault();
                this._onDieClick(ev, panel);
            });
            icon.addEventListener('contextmenu', (ev) => {
                ev.preventDefault();
                this._onDieClick(ev, panel);
            });
        });

        panel.querySelectorAll('.blacksmith-operator-icon').forEach((icon) => {
            icon.addEventListener('click', (ev) => this._onOperatorClick(ev, panel));
        });

        panel.querySelectorAll('.blacksmith-modifier-icon').forEach((icon) => {
            icon.addEventListener('click', (ev) => {
                ev.preventDefault();
                this._onModifierClick(ev, panel);
            });
            icon.addEventListener('contextmenu', (ev) => {
                ev.preventDefault();
                this._onModifierClick(ev, panel);
            });
        });

        panel.querySelectorAll('.blacksmith-roll-button').forEach((button) => {
            button.addEventListener('click', () => {
                if (button.classList.contains('advantage')) {
                    this._onAdvantageClick(true, panel);
                } else if (button.classList.contains('disadvantage')) {
                    this._onAdvantageClick(false, panel);
                } else {
                    this._onRollClick(panel);
                }
            });
        });

        const clearButton = panel.querySelector('.blacksmith-clear-button');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                const input = panel.querySelector('.blacksmith-formula-input');
                if (input) {
                    input.value = '';
                    this.currentFormula = '';
                }
            });
        }

        const formulaInput = panel.querySelector('.blacksmith-formula-input');
        if (formulaInput) {
            formulaInput.addEventListener('input', (ev) => {
                this.currentFormula = ev.target.value;
            });
        }

        const historyClear = panel.querySelector('.history-clear');
        if (historyClear) {
            historyClear.addEventListener('click', (ev) => {
                ev.stopPropagation();
                this.rollHistory = [];
                const historyList = panel.querySelector('.blacksmith-history-list');
                if (historyList) {
                    historyList.innerHTML = '<div class="history-entry empty-message">No recent rolls</div>';
                }
            });
        }

        panel.querySelectorAll('.history-entry[data-formula] .reroll-button').forEach((button) => {
            button.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const formula = button.closest('.history-entry')?.dataset.formula;
                if (!formula) return;
                this.currentFormula = formula;
                const input = panel.querySelector('.blacksmith-formula-input');
                if (input) input.value = formula;
                this._onRollClick(panel);
            });
        });
    }

    // ==============================================================
    // ===== FORMULA BUILDING =======================================
    // ==============================================================

    _onDieClick(event, panel) {
        const die = event.currentTarget.dataset.die;
        const input = panel.querySelector('.blacksmith-formula-input');
        if (!input) return;
        const isRightClick = event.type === 'contextmenu';

        let formula = input.value;

        // A trailing bonus/penalty applies to the whole roll, so it is lifted off before
        // the dice terms are edited and put back afterwards.
        const bonusMatch = formula.match(/\s*([\+\-]\d+)$/);
        const bonus = bonusMatch ? ` ${bonusMatch[1]}` : '';
        const cleanFormula = bonusMatch ? formula.slice(0, -bonusMatch[0].length) : formula;

        if (!cleanFormula && !isRightClick) {
            formula = `1${die}${bonus}`;
        } else if (cleanFormula) {
            const lastDieMatch = cleanFormula.match(new RegExp(`(\\d+)${die}$`));
            if (lastDieMatch) {
                const currentCount = parseInt(lastDieMatch[1]);
                if (isRightClick) {
                    if (currentCount <= 1) {
                        if (cleanFormula.trim() === `1${die}`) {
                            formula = '';
                        } else {
                            formula = cleanFormula.replace(new RegExp(`\\s*[+\\-*\\/]?\\s*${currentCount}${die}$`), '') + bonus;
                        }
                    } else {
                        formula = cleanFormula.replace(new RegExp(`${currentCount}${die}$`), `${currentCount - 1}${die}`) + bonus;
                    }
                } else {
                    formula = cleanFormula.replace(new RegExp(`${currentCount}${die}$`), `${currentCount + 1}${die}`) + bonus;
                }
            } else if (!isRightClick) {
                const endsWithOperator = cleanFormula.trim().match(/[\+\-\*\/]\s*$/);
                if (!endsWithOperator) {
                    formula = cleanFormula.trim() + ' + ' + `1${die}${bonus}`;
                } else {
                    formula = cleanFormula + `1${die}${bonus}`;
                }
            }
        }

        input.value = formula;
        this.currentFormula = formula;
    }

    _onOperatorClick(event, panel) {
        const op = event.currentTarget.dataset.op;
        const input = panel.querySelector('.blacksmith-formula-input');
        if (!input) return;

        input.value += ` ${op} `;
        this.currentFormula = input.value;
    }

    _onModifierClick(event, panel) {
        const mod = event.currentTarget.dataset.mod;
        const input = panel.querySelector('.blacksmith-formula-input');
        if (!input) return;
        const isRightClick = event.type === 'contextmenu';

        let formula = input.value;
        if (!formula) return;

        // Bonus and penalty apply to the whole roll rather than to a dice term.
        if (mod === 'bonus' || mod === 'penalty') {
            const cleanFormula = formula.replace(/\s*[\+\-]\d+$/, '');
            const operator = mod === 'bonus' ? '\\+' : '\\-';
            const bonusRegex = new RegExp(` ${operator}(\\d+)$`);
            const bonusMatch = formula.match(bonusRegex);

            if (bonusMatch) {
                const currentNum = parseInt(bonusMatch[1]);
                if (isRightClick) {
                    formula = currentNum <= 1
                        ? cleanFormula
                        : cleanFormula + ` ${mod === 'bonus' ? '+' : '-'}${currentNum - 1}`;
                } else {
                    formula = cleanFormula + ` ${mod === 'bonus' ? '+' : '-'}${currentNum + 1}`;
                }
            } else if (!isRightClick) {
                formula = cleanFormula + ` ${mod === 'bonus' ? '+' : '-'}1`;
            }

            input.value = formula;
            this.currentFormula = formula;
            return;
        }

        const bonusMatch = formula.match(/\s*([\+\-]\d+)$/);
        const bonus = bonusMatch ? bonusMatch[1] : '';
        const cleanFormula = bonusMatch ? formula.slice(0, -bonusMatch[0].length) : formula;

        // Matches a dice term that may already carry a kh/kl modifier.
        const lastDiceTerm = cleanFormula.match(/\d*d\d+(?:kh\d+|kl\d+)?(?=[^\d]*(?:\+|-|\*|$))/g);
        if (!lastDiceTerm) return;

        const currentTerm = lastDiceTerm[lastDiceTerm.length - 1];
        const baseDice = currentTerm.match(/\d*d\d+/)[0];

        if (mod === 'kh' || mod === 'kl') {
            const currentModRegex = new RegExp(`${baseDice}(${mod}\\d+)?`);
            const currentModMatch = currentTerm.match(currentModRegex);

            if (currentModMatch && currentModMatch[1]) {
                const currentNum = parseInt(currentModMatch[1].substring(2));
                if (isRightClick) {
                    formula = currentNum <= 1
                        ? cleanFormula.replace(currentTerm, baseDice) + (bonus || '')
                        : cleanFormula.replace(currentTerm, `${baseDice}${mod}${currentNum - 1}`) + (bonus || '');
                } else {
                    formula = cleanFormula.replace(currentTerm, `${baseDice}${mod}${currentNum + 1}`) + (bonus || '');
                }
            } else if (!isRightClick) {
                formula = cleanFormula.replace(currentTerm, `${baseDice}${mod}1`) + (bonus || '');
            }
        }

        input.value = formula;
        this.currentFormula = formula;
    }

    // ==============================================================
    // ===== ROLLING ================================================
    // ==============================================================

    async _onRollClick(panel) {
        if (!this.currentFormula) return;

        try {
            let formula = this.currentFormula.replace(/^\/r\s*/, '');
            let displayFormula = this.currentFormula.replace(/^\/r\s*/, '');

            const roll = new Roll(formula);
            await roll.evaluate();

            displayFormula = displayFormula
                .replace(/([+\-*/])/g, ' $1 ')
                .replace(/\s+/g, ' ')
                .trim();

            const bonusMatch = displayFormula.match(/\s*([\+\-]\d+)$/);
            if (bonusMatch) {
                displayFormula = displayFormula.slice(0, -bonusMatch[0].length) + ` ${bonusMatch[1]} Bonus`;
            }

            const description = this._describeRoll(formula, bonusMatch);

            const flavorHtml = `<div class="dice-roll-description">
                ${description ? `<div class="description">${description}</div>` : ''}
                <div class="roll-formula"><strong>Rolling:</strong> ${displayFormula}</div>
            </div>`;

            const tooltip = await roll.getTooltip();
            // Speaker comes from Foundry, not from this.actor -- see the file header.
            await roll.toMessage({
                speaker: ChatMessage.getSpeaker(),
                flavor: flavorHtml,
                content: `<div class="dice-roll">
                    <div class="dice-result">
                        <div class="dice-formula">${displayFormula}</div>
                        <div class="dice-tooltip" style="display: none;">
                            ${tooltip}
                        </div>
                        <h4 class="dice-total">${roll.total}</h4>
                    </div>
                </div>`
            });

            this._addToHistory(displayFormula, roll.total);

            const input = panel.querySelector('.blacksmith-formula-input');
            if (input) input.value = '';
            this.currentFormula = '';

        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, 'Dice Tray: roll failed', err?.message ?? err, false, false);
            ui.notifications.error('Invalid dice formula');
        }
    }

    /**
     * Plain-language summary of what the formula does, shown above the result.
     * Returns an empty string when there is nothing worth saying.
     */
    _describeRoll(formula, bonusMatch) {
        const diceTerms = formula.match(/\d*d\d+(?:kh\d+|kl\d+)?/g) || [];
        const hasBonus = bonusMatch !== null;
        let description = '';

        if (diceTerms.length === 1) {
            const term = diceTerms[0];
            if (term.includes('kh')) {
                const keepNum = parseInt(term.match(/kh(\d+)/)[1]);
                description = `Keep the ${keepNum} highest roll${keepNum > 1 ? 's' : ''}`;
            } else if (term.includes('kl')) {
                const keepNum = parseInt(term.match(/kl(\d+)/)[1]);
                description = `Keep the ${keepNum} lowest roll${keepNum > 1 ? 's' : ''}`;
            }
        } else if (diceTerms.length > 1) {
            const modifiers = [];
            diceTerms.forEach((term) => {
                if (term.includes('kh')) {
                    const keepNum = parseInt(term.match(/kh(\d+)/)[1]);
                    modifiers.push(`keep ${keepNum} highest from ${term.split('kh')[0]}`);
                } else if (term.includes('kl')) {
                    const keepNum = parseInt(term.match(/kl(\d+)/)[1]);
                    modifiers.push(`keep ${keepNum} lowest from ${term.split('kl')[0]}`);
                }
            });
            if (modifiers.length > 0) description = modifiers.join(', ');
        }

        if (hasBonus) {
            const bonusNum = parseInt(bonusMatch[1]);
            description = description
                ? `${description} and ${bonusNum > 0 ? 'add' : 'subtract'} ${Math.abs(bonusNum)}`
                : `${bonusNum > 0 ? 'Add' : 'Subtract'} ${Math.abs(bonusNum)}`;
        }

        return description;
    }

    _onAdvantageClick(isAdvantage, panel) {
        if (!this.currentFormula) return;

        try {
            const bonusMatch = this.currentFormula.match(/\s*([\+\-]\d+)$/);
            const bonus = bonusMatch ? bonusMatch[1] : '';
            const cleanFormula = bonusMatch ? this.currentFormula.slice(0, -bonusMatch[0].length) : this.currentFormula;

            // Double every dice term and keep half, which is advantage generalised past 2d20.
            const parts = cleanFormula.split(/(?=[+\-*])/);
            const transformedParts = parts.map((part) => {
                const cleanPart = part.trim().replace(/^[+\-*]\s*/, '');
                const diceMatch = cleanPart.match(/(\d+)d(\d+)/);
                if (!diceMatch) return part;

                const [, count, sides] = diceMatch;
                const doubledCount = parseInt(count) * 2;
                const keepCount = Math.floor(doubledCount / 2);
                const keepMod = isAdvantage ? 'kh' : 'kl';
                const operator = part.match(/^[+\-*]/)?.[0] || '';
                return `${operator} ${doubledCount}d${sides}${keepMod}${keepCount}`;
            });

            const newFormula = transformedParts.join('').trim() + (bonus ? ` ${bonus}` : '');

            const input = panel.querySelector('.blacksmith-formula-input');
            if (input) input.value = newFormula;
            this.currentFormula = newFormula;

            this._onRollClick(panel);
        } catch (err) {
            postConsoleAndNotification(MODULE.NAME, 'Dice Tray: advantage transform failed', err?.message ?? err, false, false);
            ui.notifications.error('Invalid formula for advantage/disadvantage');
        }
    }

    // ==============================================================
    // ===== HISTORY ================================================
    // ==============================================================

    _addToHistory(formula, result) {
        this.rollHistory.unshift({ formula, result });
        this.rollHistory = this.rollHistory.slice(0, HISTORY_LIMIT);

        // Appended directly rather than re-rendering: a re-render would rebuild the
        // formula input and lose focus mid-session.
        const panelElement = this.element?.querySelector?.('#blacksmith-dicetray-content');
        if (!panelElement) return;

        const historyList = panelElement.querySelector('.blacksmith-history-list');
        if (!historyList) return;

        historyList.querySelector('.empty-message')?.remove();

        const historyEntry = document.createElement('div');
        historyEntry.classList.add('history-entry');
        historyEntry.dataset.formula = formula;

        const historyFormula = document.createElement('span');
        historyFormula.classList.add('history-formula');
        historyFormula.textContent = `${formula} = ${result}`;

        const rerollButton = document.createElement('i');
        rerollButton.className = 'fa-solid fa-dice reroll-button';
        rerollButton.dataset.tooltip = 'Re-roll this formula';
        historyEntry.append(historyFormula, rerollButton);

        rerollButton.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.currentFormula = formula;
            const input = panelElement.querySelector('.blacksmith-formula-input');
            if (input) input.value = formula;
            this._onRollClick(panelElement);
        });

        historyList.insertBefore(historyEntry, historyList.firstChild);

        const entries = Array.from(historyList.children);
        if (entries.length > HISTORY_LIMIT) entries[entries.length - 1].remove();
    }

    // ==============================================================
    // ===== ACTOR TRACKING =========================================
    // ==============================================================

    _registerActor(actor) {
        if (!actor || this._registeredActor === actor) return;
        this._unregisterActor();
        actor.apps[this.id] = this;
        this._registeredActor = actor;
    }

    _unregisterActor() {
        if (!this._registeredActor) return;
        delete this._registeredActor.apps[this.id];
        this._registeredActor = null;
    }

    async updateActor(actor) {
        if (this.actor === (actor || null)) return;
        this._unregisterActor();
        this.actor = actor || null;
        this._registerActor(this.actor);
        await this.render(false);
    }

    // ==============================================================
    // ===== LIFECYCLE ==============================================
    // ==============================================================

    _onClose(options) {
        this._unregisterActor();
        HookManager.disposeByContext(this._hookContext);
        DiceTrayWindow.activeWindow = null;
        void setToolWindowState('diceTray', false);
        super._onClose?.(options);
    }
}

/**
 * Open the dice tray, or raise it if it is already open.
 * @returns {Promise<DiceTrayWindow>}
 */
export async function openDiceTray() {
    try {
        if (DiceTrayWindow.activeWindow) {
            DiceTrayWindow.activeWindow.bringToFront?.();
            return DiceTrayWindow.activeWindow;
        }

        const window = new DiceTrayWindow();
        DiceTrayWindow.activeWindow = window;
        await window.render(true);
        await setToolWindowState('diceTray', true);
        return window;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, 'Dice Tray: failed to open', error?.message ?? error, false, false);
        ui.notifications.error('Failed to open dice tray');
    }
}

/** Register the window and its menubar tool. */
/**
 * Whether this user's dice tool leads with Request a Roll.
 *
 * A GM, unless they have turned the menubar entry off. `requestRollShowInMenubar` used
 * to decide whether a SECOND icon appeared; with the two tools merged it decides
 * whether this one leads with the request window, which is the same question asked of
 * the surface that survived.
 */
function isRequestRollAvailable() {
    return !!game.user?.isGM && getSettingSafely(MODULE.ID, 'requestRollShowInMenubar', true);
}

function openRequestRoll() {
    new SkillCheckDialog().render(true);
}

/** The dice tool's id in the menubar registry. */
const DICE_TOOL_ID = 'dice-tray';

/** The icon's colour while manual rolls are on. Off, it inherits the menubar's own. */
const MANUAL_ROLLS_COLOR = 'rgba(231, 91, 1, 0.9)';

/**
 * Colour the menubar icon to say whether manual rolls are on.
 *
 * MANUAL ROLLS CHANGE EVERY ROLL AT THE TABLE and nothing else on screen says so. It
 * used to be a lit sidebar button; with the control moved into a context menu, the
 * state went with it -- and a state you can only see by opening the menu that changes
 * it is a state you will forget is on.
 *
 * Pushed rather than computed at render: `iconColor` is a plain string the template
 * draws straight, deliberately, so a tool cannot report state by handing the menubar a
 * function.
 */
function syncDiceToolIcon() {
    MenuBar.updateMenubarToolIconColor(
        DICE_TOOL_ID,
        SidebarStyle.isManualRollsEnabled() ? MANUAL_ROLLS_COLOR : null
    );
}

/**
 * The dice tool's right-click menu.
 *
 * Everything to do with rolling, in one place, in the order a hand reaches for it: the
 * windows first, then the toggle that changes how every roll behaves, then -- for a GM
 * -- the saved rolls that fire without opening anything.
 */
function buildDiceToolMenu() {
    const items = [];

    if (isRequestRollAvailable()) {
        items.push({
            name: 'Request a Roll',
            icon: 'fa-solid fa-dice-d20',
            description: 'Ask the table for a roll',
            onClick: () => openRequestRoll()
        });
    }

    items.push({
        name: 'Open Dice Tray',
        icon: 'fa-solid fa-dice-six',
        description: 'Build a formula and roll it yourself',
        onClick: () => openDiceTray()
    });

    // Gated by the same two settings that used to decide whether the sidebar button
    // appeared: the user's own preference, and the GM's permission for players.
    if (SidebarStyle.canToggleManualRolls()) {
        const on = SidebarStyle.isManualRollsEnabled();
        items.push({ separator: true });
        items.push({
            name: on ? 'Disable Manual Rolls' : 'Enable Manual Rolls',
            // A CHECKMARK when it is on, which is how this menu marks an active state
            // everywhere else. The label says which way the click goes, so the icon is
            // free to say which way things currently stand.
            icon: on ? 'fa-solid fa-check' : 'fa-solid fa-hand-pointer',
            description: on
                ? 'Every die is entered by hand'
                : 'Enter every die roll by hand instead of rolling it',
            onClick: async () => {
                await SidebarStyle.toggleManualRolls();
                syncDiceToolIcon();
            }
        });
    }

    // The favourites and the quick roll library, as flyouts. GM only: they request
    // rolls FROM other people, which is not a thing a player does.
    if (isRequestRollAvailable()) {
        const rollMenu = SkillCheckDialog.requestRollMenuItems();
        if (rollMenu.length) {
            items.push({ separator: true });
            items.push(...rollMenu);
        }
    }

    return items;
}

export function registerDiceTray() {
    // Registry and menubar are imported directly rather than reached through
    // `module.api`, which attaches its window methods from an async dynamic import
    // and so is not guaranteed to be populated at this point.
    BlacksmithToolWindowBaseV2.migratePositionKey('squire-dice-tray-micro-position', 'blacksmith-dice-tray-micro-position');

    registerWindow(DICE_TRAY_WINDOW_ID, {
        moduleId: MODULE.ID,
        title: 'Dice Tray',
        open: async () => openDiceTray()
    });

    // ONE MENUBAR ENTRY FOR ROLLING.
    //
    // This and Request a Roll used to be two icons a pixel apart doing the same job --
    // "I want to roll something" -- with no relationship between them, and a third
    // control, Manual Rolls, sat under the sidebar's pin button where nothing else had
    // anything to do with dice. All three are here now.
    //
    // The left click differs by role because the two roles want different things from
    // it: a player wants their own dice, and a GM almost always wants to ask somebody
    // else for a roll. Everything either of them might want instead is one right-click
    // away, so neither is shut out of the other's tool.
    MenuBar.registerMenubarTool('dice-tray', {
        icon: 'fa-solid fa-dice',
        // The state as it stands at registration -- manual rolls survive a reload, so
        // the icon has to open already lit rather than waiting for the first change.
        iconColor: SidebarStyle.isManualRollsEnabled() ? MANUAL_ROLLS_COLOR : null,
        name: 'dice-tray',
        title: null,
        tooltip: () => (isRequestRollAvailable() ? 'Request a Roll' : 'Dice Tray'),
        onClick: () => {
            if (isRequestRollAvailable()) openRequestRoll();
            else openDiceTray();
        },
        zone: 'left',
        group: 'general',
        order: 200,
        moduleId: MODULE.ID,
        gmOnly: false,
        leaderOnly: false,
        visible: true,
        contextMenuItems: () => buildDiceToolMenu()
    });

    // MANUAL ROLLS CAN CHANGE FROM ANYWHERE: another client, Foundry's own Dice
    // Configuration sheet, or a macro. The icon is persistent, so unlike the context
    // menu -- which is built fresh every time it opens -- it has to be told.
    //
    // This is the one branch of the sidebar button's old settings hook that had to
    // survive the move. The other three watched settings that only decided whether the
    // button existed, and a menu reads those when it opens.
    HookManager.registerSettingChangeCallback({
        description: 'Dice tool: colour the menubar icon while manual rolls are on',
        context: 'dice-tool-manual-rolls',
        priority: 4,
        callback: (moduleId, settingKey) => {
            // --- BEGIN - HOOKMANAGER CALLBACK ---
            if (moduleId === 'core' && settingKey === 'diceConfiguration') syncDiceToolIcon();
            // --- END - HOOKMANAGER CALLBACK ---
        }
    });

    return true;
}
