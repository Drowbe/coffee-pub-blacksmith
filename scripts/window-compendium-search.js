// ==================================================================
// ===== WINDOW-COMPENDIUM-SEARCH - search-as-you-type picker =======
// ==================================================================
// A persistent palette over api.compendiums.search(): type, get grouped
// candidates from the GM's configured compendiums, drag one onto a
// character sheet (or the canvas, for Actors).
//
// A Tool window rather than a standard window because the whole point is
// to keep it open beside a sheet while dragging. It is deliberately NOT
// GM-only: a player dragging gear onto their own sheet is the main case.
//
// Results are painted into the results container directly rather than by
// re-rendering the Application. Re-rendering on every keystroke would
// rebuild the search input and drop focus and caret position, which is
// fatal for a search-as-you-type control.
//
// Dragging works through Foundry's native contract: a `text/plain`
// payload of {type: <document class>, uuid}. Every core sheet drop
// handler reads it through TextEditor.getDragEventData, so an item lands
// on a dnd5e character sheet, and an Actor lands on the canvas as a
// token, with no cooperation needed from either side.
//
// TWO MODES, and the second is why the economics facets are here rather
// than only in the API. With text, this runs api.compendiums.search():
// the cap stops the scan, because the head of the GM's priority order is
// the best answer to something somebody typed. With NO text but a rarity
// or price facet set, it runs api.compendiums.query() instead and the
// window becomes a browser -- every configured source opened, the cap
// applied to the output. Before the facets there was no way to browse at
// all: below MIN_QUERY_LENGTH the palette simply refused.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification, getSettingSafely } from './api-core.js';
import { BlacksmithToolWindowBaseV2 } from './window-tool-base.js';
import { registerWindow } from './api-windows.js';
import { compendiumManager } from './manager-compendiums.js';
import { normalizeType, getDocumentClass, getDocumentSubtype, getTypeLabel } from './utility-compendium-types.js';

const APP_ID = 'blacksmith-compendium-search';
const PREFS_SETTING = 'compendiumSearchPreferences';

/** Keystroke settle time before a query runs. Long enough to skip a fast typist's intermediate states. */
const DEBOUNCE_MS = 140;

/**
 * TWO LIMITS, because the cap does two different jobs and one number could only be wrong
 * for one of them.
 *
 * In SEARCH mode the cap stops the scan (`stopAtLimit: true`), so it is a work budget:
 * once it is full, remaining compendiums are never opened. Raising it costs real time on
 * a generic query. 200 is comfortably past what a 3+ character query returns in practice,
 * and short enough that "a" against a full content library does not open everything
 * installed before it gives up.
 *
 * In BROWSE mode the cap does not stop anything (`stopAtLimit: false`) -- every configured
 * source is opened either way and the cap only trims the array. So it buys nothing but DOM
 * nodes, and 100 was simply too few to browse with: one subtype across a few packs is
 * several hundred rows, and cutting it at 100 hid most of a set the user asked to see. The
 * cost of 500 rows is ~3000 elements built once with lazy images, which is not a number a
 * browser notices; the honest ceiling is where a plain list stops being scrollable, and
 * that is thousands, not hundreds.
 */
const SEARCH_LIMIT = 200;
const BROWSE_LIMIT = 500;

/**
 * Three, not the API's default of two. Searching every mapped type at once opens far
 * more packs per keystroke, and two characters against a full SRD plus third-party
 * content is thousands of hits that the limit then throws most of away — expensive
 * work for a list nobody can read. The API default stays 2 for callers scoped to one
 * type; this is the palette's own floor.
 */
const MIN_QUERY_LENGTH = 3;

const ANY_SUBTYPE = '';

/** Rarity-selector sentinel: do not filter on rarity at all. */
const ANY_RARITY = '';

/**
 * The token for gear nobody marked magical. Not a dnd5e key -- dnd5e stores `""` --
 * which is exactly why it needs a name: an option labelled "Common" that quietly
 * excluded every plain longsword would be the same silent wrong answer the API
 * exists to prevent.
 */
const RARITY_MUNDANE = 'mundane';

/** Type-selector sentinel: search every mapped type at once. */
const ALL_TYPES = '__all__';

/**
 * Whether the system ships a rich hover card for Items.
 *
 * dnd5e renders one from `Item5e.richTooltip()` (dnd5e.mjs:23569, verified against
 * 5.3.3) and fills it in through a MutationObserver on the shared tooltip element
 * (`Tooltips5e`, dnd5e.mjs:82063): a `data-tooltip` holding a `<section class="loading"
 * data-uuid="...">` is swapped for the real card once it resolves. That is the same
 * declarative contract the system's own chat templates use, so we drive it rather than
 * rebuilding the card.
 *
 * Checked, not assumed, because the spinner is what the user is left staring at if the
 * system never replaces it. A system with no `richTooltip` gets plain text instead.
 */
function systemHasRichItemTooltips() {
    return typeof CONFIG?.Item?.documentClass?.prototype?.richTooltip === 'function';
}

export class CompendiumSearchWindow extends BlacksmithToolWindowBaseV2 {

    static ROOT_CLASS = 'blacksmith-window-tool-root';

    /**
     * The open instance, assigned before the first render is awaited.
     *
     * This used to read `foundry.applications.instances.get(APP_ID)` instead, which looks
     * like the tidier answer -- the id is already that map's key -- but the map is only
     * written after the first render COMPLETES (`client/applications/api/application.mjs:511`,
     * five awaits into `_doRender`). For the whole of that render the window is invisible
     * to the lookup, so two rapid opens both miss and both construct, and the second
     * overwrites the first in Foundry's own registry while the first stays in the DOM.
     *
     * Assigning a static synchronously, before any await, is what actually closes that.
     */
    static activeWindow = null;

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: APP_ID,
            // Listed in full: mergeObject replaces arrays rather than merging them,
            // so omitting the base class here would strip the Tool shell styling.
            classes: ['blacksmith-window-tool', 'blacksmith-compendium-search-window'],
            position: { width: 420, height: 620 },
            window: { title: 'Compendium Search', resizable: true, minimizable: true, icon: 'fa-solid fa-magnifying-glass' },
            windowSizeConstraints: { minWidth: 320, minHeight: 300 }
        }
    );

    /**
     * Open the window, focusing the existing one instead of opening a second.
     * A fixed `id` means two live instances would collide in the DOM, and a
     * palette is a thing you want one of.
     * @returns {Promise<CompendiumSearchWindow>}
     */
    static async open() {
        if (CompendiumSearchWindow.activeWindow) {
            CompendiumSearchWindow.activeWindow.bringToFront?.();
            return CompendiumSearchWindow.activeWindow;
        }
        const win = new CompendiumSearchWindow();
        // Assigned before the await, not after. See the note on activeWindow.
        CompendiumSearchWindow.activeWindow = win;
        await win.render({ force: true });
        return win;
    }

    constructor(options = {}) {
        super(options);

        let prefs = {};
        try {
            prefs = game.settings.get(MODULE.ID, PREFS_SETTING) || {};
        } catch { /* setting not registered yet */ }

        // Read before _availableTypes(), which depends on it: with the mapping bypassed,
        // every type is reachable and the "has a configured source" filter would be a lie.
        this._allSources = !!prefs.allSources;
        // Off by default, and separate from _allSources. The world is not a compendium, so
        // "search all installed compendiums" has no business quietly including it -- which
        // it did, and the World heading it produced read as a bug rather than a choice.
        this._includeWorld = !!prefs.includeWorld;

        const types = this._availableTypes();
        // All types by default: a palette you reach for mid-session should answer
        // "where is that thing" without first being told what kind of thing it is.
        this._type = (prefs.type === ALL_TYPES || types.includes(prefs.type))
            ? prefs.type
            : ALL_TYPES;
        this._subtype = typeof prefs.subtype === 'string' ? prefs.subtype : ANY_SUBTYPE;
        // Dropped unless the restored type can actually SHOW this control. Type and subtype
        // are always saved together, so they cannot disagree by ordinary use -- but a saved
        // type whose pack has since been uninstalled falls back to All above and would
        // strand its subtype here. That subtype now decides whether an empty box browses,
        // so a stranded one is a filter narrowing results with no control to clear it.
        if (this._subtype !== ANY_SUBTYPE
            && !this._availableSubtypes().some(s => s.value === this._subtype)) {
            this._subtype = ANY_SUBTYPE;
        }
        this._rarity = typeof prefs.rarity === 'string' ? prefs.rarity : ANY_RARITY;
        this._priceMin = Number.isFinite(prefs.priceMin) ? prefs.priceMin : null;
        this._priceMax = Number.isFinite(prefs.priceMax) ? prefs.priceMax : null;
        this._query = '';
        this._timer = null;
        // Monotonic token so a slow query that resolves after a newer one cannot
        // repaint stale results — the classic search-as-you-type ordering bug.
        this._token = 0;
    }

    // ==============================================================
    // ===== RENDER =================================================
    // ==============================================================

    /**
     * Types the picker can offer.
     *
     * Normally the ones with a source configured, because an unmapped type can only
     * disappoint. Unscoped, that filter is exactly backwards: every type is reachable
     * through some installed pack, and hiding the ones the GM never mapped would remove
     * the case the toggle exists for.
     */
    _availableTypes() {
        try {
            const types = compendiumManager.getTypes();
            if (this._allSources) return types;
            return types.filter(type => compendiumManager.getSearchOrderForType(type).length > 0);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Search: could not read mapped types', error, false, false);
            return [];
        }
    }

    /** What this._type means to the API: one token, or every mapped type. */
    _searchTypes() {
        return this._type === ALL_TYPES ? this._availableTypes() : this._type;
    }

    /**
     * Document subtypes offered for the current type.
     * Empty for synthetic types (Spell, Feature, Class, ...) — their subtype is
     * already fixed by the mapping, so a second filter would only contradict it —
     * and empty in All mode, where subtypes from different document classes would
     * be pooled into one list that means nothing.
     */
    _availableSubtypes() {
        if (this._type === ALL_TYPES) return [];
        const canonical = normalizeType(this._type);
        if (getDocumentSubtype(canonical)) return [];
        const documentClass = getDocumentClass(canonical);
        const labels = CONFIG?.[documentClass]?.typeLabels ?? {};

        const subtypes = [];
        for (const value of game.documentTypes?.[documentClass] ?? []) {
            if (!value || value === 'base') continue;

            // A registered type the system never translated is one the system never
            // shows. dnd5e keeps `backpack` registered purely so old documents rewrite
            // themselves to `container` on load (dnd5e.mjs:22973), and leaves it out of
            // its lang file for that reason -- its own compendium browser
            // (dnd5e.mjs:22942) and create dialog (dnd5e.mjs:24479) drop it by name.
            // No live document carries the type, so offering it is a filter that can
            // only ever return nothing, under a label that is a raw i18n key.
            const key = labels[value];
            if (key && !game.i18n.has(key)) continue;

            // Only for a type whose system gave no label key at all -- a raw token is
            // still better than dropping a type somebody deliberately registered.
            subtypes.push({
                value,
                label: key ? game.i18n.localize(key)
                    : String(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase())
            });
        }

        return subtypes.sort((a, b) => a.label.localeCompare(b.label));
    }

    /**
     * Whether rarity and price mean anything for the current type.
     *
     * Same rule `_availableSubtypes` uses, and for the same reason: hidden in All mode,
     * where the facet would be pooled across document classes that mostly have no such
     * field, and hidden for a SYNTHETIC type, whose subtype is already fixed by the
     * mapping. That second half is what keeps a rarity selector off the Spell view --
     * a spell's document class is Item, but a spell carries neither field, so the facet
     * could only ever return nothing under a control that looks like it should work.
     */
    _economicsApply() {
        if (this._type === ALL_TYPES) return false;
        const canonical = normalizeType(this._type);
        if (!canonical || getDocumentSubtype(canonical)) return false;
        return getDocumentClass(canonical) === 'Item';
    }

    /** Rarity options for the selector: the system's keys, plus the mundane token. */
    _availableRarities() {
        const rarities = [{ value: RARITY_MUNDANE, label: 'Mundane (no rarity)' }];
        for (const [key, label] of Object.entries(CONFIG?.DND5E?.itemRarity ?? {})) {
            rarities.push({ value: key, label: game.i18n.localize(label) });
        }
        return rarities;
    }

    /**
     * Whether this user may drag a result out onto a sheet.
     *
     * The palette hands out Foundry's native drag payload, so a result lands on any sheet
     * the user owns and CREATES the document there. That is the right mechanism and it is
     * also a write path: for a player who owns a character, an unpoliced palette is a
     * "give yourself any item in the game" tool. Some tables want exactly that. Others do
     * not, and the split that matters is narrower than it looks -- a player reading how
     * grappling works needs the compendium open, not write access to their own sheet.
     *
     * So browsing is never gated and adding is, which is one boolean rather than a ladder
     * of permissions Blacksmith would then have to own. A module with a richer policy is
     * welcome to have one; this is the floor, and it belongs here because the write path
     * is ours. Raised by the Squire maintainer.
     */
    _canAddFromResults() {
        if (game.user?.isGM) return true;
        return !!getSettingSafely(MODULE.ID, 'compendiumSearchPlayerAdd', true);
    }

    /**
     * Whether any filter is narrowing the result set -- which is also the test for
     * whether an empty search box browses instead of refusing.
     *
     * SUBTYPE COUNTS, and for a long time it did not. Only the economics facets did, so
     * choosing "Weapon" with an empty box was told to type three characters while
     * choosing "Rare" with an empty box browsed -- and because the facets persist across
     * sessions and the query does not, whether a subtype browsed depended on a rarity the
     * user had set some other day. That is indistinguishable from a bug from the outside.
     * A subtype is a request for a set, exactly as a rarity is.
     *
     * Type alone is deliberately still not enough. "All Items" is every mapped pack read
     * out alphabetically, capped -- a list that answers nothing and costs the most.
     */
    _hasFacets() {
        if (this._subtype !== ANY_SUBTYPE) return true;
        return this._economicsApply()
            && (this._rarity !== ANY_RARITY || this._priceMin !== null || this._priceMax !== null);
    }

    /** The price window as the API wants it, or null when neither end is set. */
    _priceFilter() {
        if (this._priceMin === null && this._priceMax === null) return null;
        const window = {};
        if (this._priceMin !== null) window.min = this._priceMin;
        if (this._priceMax !== null) window.max = this._priceMax;
        return window;
    }

    async getData() {
        const esc = foundry.utils.escapeHTML;
        const types = this._availableTypes();

        const typeOptions = [
            `<option value="${ALL_TYPES}"${this._type === ALL_TYPES ? ' selected' : ''}>All types</option>`,
            ...types.map(type => `<option value="${esc(type)}"${type === this._type ? ' selected' : ''}>${esc(getTypeLabel(type))}</option>`)
        ].join('');

        const subtypes = this._availableSubtypes();
        const subtypeSelect = subtypes.length ? `
            <select class="blacksmith-input bcs-subtype" name="bcs-subtype" data-tooltip="Restrict to one document subtype">
                <option value="${ANY_SUBTYPE}"${this._subtype === ANY_SUBTYPE ? ' selected' : ''}>Any subtype</option>
                ${subtypes.map(s => `<option value="${esc(s.value)}"${s.value === this._subtype ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}
            </select>` : '';

        const economics = this._economicsApply();
        const rarityOptions = economics ? [
            `<option value="${ANY_RARITY}"${this._rarity === ANY_RARITY ? ' selected' : ''}>Any rarity</option>`,
            ...this._availableRarities().map(r =>
                `<option value="${esc(r.value)}"${r.value === this._rarity ? ' selected' : ''}>${esc(r.label)}</option>`)
        ].join('') : '';

        const economicsFilters = economics ? `
            <select class="blacksmith-input bcs-rarity" name="bcs-rarity"
                    data-tooltip="Restrict to one rarity. Mundane is gear with no rarity set, which is most equipment.">${rarityOptions}</select>
            <input type="number" class="blacksmith-input bcs-price-min" name="bcs-price-min" min="0" step="1"
                   placeholder="min gp" data-tooltip="Lowest price in gold pieces. Unpriced items are excluded whenever either end is set."
                   value="${this._priceMin ?? ''}">
            <input type="number" class="blacksmith-input bcs-price-max" name="bcs-price-max" min="0" step="1"
                   placeholder="max gp" data-tooltip="Highest price in gold pieces"
                   value="${this._priceMax ?? ''}">` : '';

        // The placeholder tells the truth about which mode is reachable. With a facet set
        // the window browses on an empty box, and promising "3+ characters" would hide
        // that the user can simply stop typing.
        const placeholder = this._hasFacets()
            ? 'Search, or leave empty to browse the filter...'
            : `Search (${MIN_QUERY_LENGTH}+ characters)...`;

        const controls = types.length ? `
            <div class="bcs-controls">
                <input type="search" class="blacksmith-input bcs-query" name="bcs-query"
                       placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"
                       value="${esc(this._query)}">
                <div class="bcs-filters">
                    <select class="blacksmith-input bcs-type" name="bcs-type" data-tooltip="What to search for">${typeOptions}</select>
                    ${subtypeSelect}
                    ${economicsFilters}
                </div>
            </div>` : '';

        const bodyContent = types.length
            ? '<div class="bcs-results" data-results></div>'
            : `<div class="bcs-empty bcs-unmapped">
                   <i class="fa-solid fa-triangle-exclamation"></i>
                   <p>No compendiums are mapped yet.</p>
                   <p class="bcs-empty-hint">Configure them in Campaign Settings, under Compendium Mapping — or turn on <strong>Search all installed compendiums</strong> in the title bar to look at everything installed.</p>
               </div>`;

        return {
            appId: this.id,
            toolBarLeft: controls,
            showToolBar: types.length > 0,
            bodyContent,
            showToolFooter: types.length > 0,
            toolFooterLeft: '<span class="bcs-status" data-status></span>',
            toolFooterRight: `<span class="bcs-hint">${this._canAddFromResults() ? 'Drag onto a sheet' : 'Click to open'}</span>`
        };
    }

    getToolHeaderActions() {
        return [{
            // A gesture, not a filter -- "look wider right now" -- so it sits in the title
            // bar beside Reload rather than in the filter row with the things that describe
            // WHAT you are looking for. It is also why the state is client-scoped: it is
            // this user's reach, not a property of the world.
            id: 'all-sources',
            // An atlas, not a globe: this widens which COMPENDIUMS are read, and a globe
            // reads as world data. Foundry's own compendium sidebar tab uses the same glyph.
            icon: 'fa-solid fa-atlas',
            // One label in both states. The pressed state carries the difference -- the base
            // class marks it `is-active` in the title bar and prefixes a check in the
            // context menu it falls back to on a micro title bar -- and a label that
            // rewrote itself would read as a second, different control in that menu.
            label: 'Search all installed compendiums',
            active: this._allSources,
            onClick: async () => {
                this._allSources = !this._allSources;
                void this._savePreferences();
                // A full render: the status line, the placeholder and the type list all
                // change with this, and the header button's own pressed state is reapplied
                // by the base class on render.
                await this.render(false);
                this._getRoot()?.querySelector('.bcs-query')?.focus();
            }
        }, {
            // The globe belongs HERE and not on the atlas: this one really is world data.
            id: 'include-world',
            icon: 'fa-solid fa-globe',
            label: 'Include world documents',
            active: this._includeWorld,
            onClick: async () => {
                this._includeWorld = !this._includeWorld;
                void this._savePreferences();
                await this.render(false);
                this._getRoot()?.querySelector('.bcs-query')?.focus();
            }
        }, {
            id: 'refresh',
            icon: 'fa-solid fa-arrows-rotate',
            label: 'Reload compendium indexes',
            onClick: () => {
                compendiumManager.clearCache();
                return this._search({ immediate: true });
            }
        }];
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        const root = this._getRoot();
        if (!root) return;

        const query = root.querySelector('.bcs-query');
        const type = root.querySelector('.bcs-type');
        const subtype = root.querySelector('.bcs-subtype');
        const results = root.querySelector('[data-results]');
        if (!query || !results) return;

        // Every control is freshly created by this render, so binding here cannot
        // stack listeners across renders.
        query.addEventListener('input', () => {
            this._query = query.value;
            this._search();
        });
        // Escape clears rather than closing the palette — closing on Escape would
        // make an accidental keypress throw away the search you were mid-way through.
        query.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            event.preventDefault();
            query.value = '';
            this._query = '';
            void this._search({ immediate: true });
        });

        type?.addEventListener('change', async () => {
            this._type = type.value;
            this._subtype = ANY_SUBTYPE;
            void this._savePreferences();
            // The subtype list belongs to the type, so this one needs a real
            // re-render. Focus is restored below, which is why it is tolerable here
            // and not on every keystroke.
            await this.render(false);
            this._getRoot()?.querySelector('.bcs-query')?.focus();
        });

        // A filter change can flip the window between search and browse mode, and the
        // placeholder says which mode is live -- so these re-render rather than repainting
        // rows in place. Focus goes back to the box for the same reason it does after a
        // type change. Declared here because the subtype control uses it too.
        const onFacetChange = async () => {
            void this._savePreferences();
            await this.render(false);
            this._getRoot()?.querySelector('.bcs-query')?.focus();
        };

        // Re-renders rather than repainting rows in place, because a subtype now flips the
        // window between search and browse mode and the placeholder is what says which is
        // live. It used to repaint, which was correct only while subtype was a pure filter.
        subtype?.addEventListener('change', () => {
            this._subtype = subtype.value;
            void onFacetChange();
        });

        const rarity = root.querySelector('.bcs-rarity');
        const priceMin = root.querySelector('.bcs-price-min');
        const priceMax = root.querySelector('.bcs-price-max');

        rarity?.addEventListener('change', () => {
            this._rarity = rarity.value;
            void onFacetChange();
        });

        // `change`, not `input`: a number field fires per digit, so typing "150" would run
        // a browse at 1 and again at 15 before the number the user meant.
        const readPrice = (field) => {
            const value = Number(field.value);
            return field.value.trim() === '' || !Number.isFinite(value) || value < 0 ? null : value;
        };
        priceMin?.addEventListener('change', () => {
            this._priceMin = readPrice(priceMin);
            void onFacetChange();
        });
        priceMax?.addEventListener('change', () => {
            this._priceMax = readPrice(priceMax);
            void onFacetChange();
        });

        // Delegated, so rows repainted by _paint() need no rebinding.
        results.addEventListener('dragstart', (event) => this._onDragStart(event));
        results.addEventListener('click', (event) => void this._onRowClick(event));

        void this._search({ immediate: true });
    }

    _onClose(options) {
        clearTimeout(this._timer);
        if (CompendiumSearchWindow.activeWindow === this) CompendiumSearchWindow.activeWindow = null;
        return super._onClose?.(options);
    }

    // ==============================================================
    // ===== SEARCH =================================================
    // ==============================================================

    /**
     * Run the current query and repaint. Debounced unless `immediate`.
     * @param {object} [options]
     * @param {boolean} [options.immediate=false]
     */
    async _search({ immediate = false } = {}) {
        clearTimeout(this._timer);
        if (!immediate) {
            this._timer = setTimeout(() => void this._search({ immediate: true }), DEBOUNCE_MS);
            return;
        }

        const mine = ++this._token;
        const started = performance.now();

        const hasText = this._query.trim().length >= MIN_QUERY_LENGTH;
        const rarity = this._rarity !== ANY_RARITY && this._economicsApply() ? [this._rarity] : null;
        const priceGp = this._economicsApply() ? this._priceFilter() : null;

        let report = { results: [], truncated: false, skippedSources: [] };
        try {
            if (hasText) {
                report = await compendiumManager.searchDetailed(this._query, this._searchTypes(), {
                    itemType: this._subtype || null,
                    limit: SEARCH_LIMIT,
                    minLength: MIN_QUERY_LENGTH,
                    rarity,
                    priceGp,
                    allSources: this._allSources,
                    includeWorld: this._includeWorld
                });
            } else if (this._hasFacets()) {
                // Browse mode. No text to match, so the scan is complete and the cap
                // applies to the output -- which is the behaviour that makes browsing
                // honest, since a stop-scan cap would show only the first pack's contents
                // and look exactly the same.
                report = await compendiumManager.queryDetailed({
                    type: this._searchTypes(),
                    subtypes: this._subtype ? [this._subtype] : null,
                    rarity,
                    priceGp,
                    limit: BROWSE_LIMIT,
                    allSources: this._allSources,
                    includeWorld: this._includeWorld
                });
            }
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Search: search failed', error, false, false);
        }

        if (mine !== this._token) return;   // superseded by a later keystroke
        this._paint(report, Math.round(performance.now() - started));
    }

    /**
     * Repaint the results list.
     *
     * Built as DOM nodes rather than an HTML string: these are arbitrary document
     * names out of whatever compendiums the world has installed, and this window
     * has no business interpreting them as markup.
     *
     * @param {{results: Array<object>, truncated: boolean, skippedSources: string[]}} report
     * @param {number} elapsed - Milliseconds the query took, for the status line
     */
    _paint(report, elapsed) {
        const root = this._getRoot();
        const list = root?.querySelector('[data-results]');
        const status = root?.querySelector('[data-status]');
        if (!list) return;

        const results = report.results ?? [];
        const esc = foundry.utils.escapeHTML;
        // Hoisted out of the row loop: it is a capability question about the system, not
        // about any one result.
        const richTooltips = systemHasRichItemTooltips();
        const canAdd = this._canAddFromResults();
        // Shown when either widening is live, because either can put a source in the list
        // that the GM did not map. With both off the order IS the mapping and every chip
        // would read "mapped".
        const showMapping = this._allSources || this._includeWorld;
        list.replaceChildren();

        if (!results.length) {
            const empty = document.createElement('div');
            empty.className = 'bcs-empty';
            // "Type at least N characters" is only true when there is no facet to browse
            // by. With one set, an empty box is a valid request that simply matched
            // nothing, and telling the user to type would send them the wrong way.
            empty.textContent = (this._query.trim().length < MIN_QUERY_LENGTH && !this._hasFacets())
                ? `Type at least ${MIN_QUERY_LENGTH} characters, or set a filter to browse.`
                : 'Nothing matches.';
            list.appendChild(empty);
            if (status) status.textContent = '';
            return;
        }

        let currentSource = null;

        for (const result of results) {
            if (result.source !== currentSource) {
                currentSource = result.source;
                // Two elements, not one string. Several packages ship a pack literally
                // called "Equipment", so the pack name alone is ambiguous and the two
                // concatenated is a mouthful — the package is the quiet second line.
                const header = document.createElement('div');
                header.className = 'bcs-group';

                const packLabel = document.createElement('span');
                packLabel.className = 'bcs-group-pack';
                packLabel.textContent = result.sourceLabel;
                header.appendChild(packLabel);

                // BOTH answers get a chip, not just the unwelcome one. Marking only the
                // unmapped sources made them the loudest thing on screen -- the eye goes
                // to the one run of colour -- so the compendiums the GM actually curated
                // read as the exception. Two chips at equal weight scan in one pass and
                // neither reads as an alarm.
                //
                // Only while unscoped, because that is the only state where the question
                // is live. With the toggle off every source is mapped, and a chip on every
                // heading would be decoration.
                if (showMapping) {
                    const mapped = result.mapped !== false;
                    const mark = document.createElement('span');
                    mark.className = 'bcs-group-mark';
                    mark.dataset.mapped = String(mapped);
                    mark.textContent = mapped ? 'mapped' : 'not mapped';
                    // The world is a source but not a compendium, so it gets its own
                    // wording -- and points at the setting that actually governs it, which
                    // is Search World First/Last and not the pack priority slots.
                    const isWorld = result.source === 'world';
                    if (mapped) {
                        mark.dataset.tooltip = isWorld
                            ? 'Your world’s own documents. Included because Search World First or Last is on for this type.'
                            : 'This compendium is in your Compendium Mapping.';
                    } else {
                        mark.dataset.tooltip = isWorld
                            ? 'Your world’s own documents, not a compendium. Shown because Include world documents is on; to search them always, turn on Search World First or Last for this type.'
                            : 'This compendium is not in your Compendium Mapping. It is shown because Search all installed compendiums is on.';
                    }
                    header.appendChild(mark);
                }

                if (result.sourcePackage && result.sourcePackage !== result.sourceLabel) {
                    const packageLabel = document.createElement('span');
                    packageLabel.className = 'bcs-group-package';
                    packageLabel.textContent = result.sourcePackage;
                    header.appendChild(packageLabel);
                }

                list.appendChild(header);
            }

            const row = document.createElement('div');
            // No tier in browse mode -- nothing was matched against -- so no tier class
            // rather than a `bcs-tier-null` nothing styles.
            row.className = result.matchType ? `bcs-row bcs-tier-${result.matchType}` : 'bcs-row';
            row.draggable = canAdd;
            row.dataset.uuid = result.uuid;
            // Straight off the result. Deriving it from the type token searched is a
            // way to get the drag payload subtly wrong, so the API hands it over.
            row.dataset.documentClass = result.documentClass;
            row.dataset.tooltip = canAdd
                ? `${result.name} — click to open, drag to add`
                : `${result.name} — click to open`;

            const thumb = document.createElement('img');
            thumb.className = 'bcs-thumb';
            thumb.src = result.img || 'icons/svg/mystery-man.svg';
            thumb.alt = '';
            thumb.loading = 'lazy';
            // Explicitly false so the icon is not itself a drag source. The row stays
            // draggable and the browser walks up to it, which is what keeps the payload
            // the {type, uuid} object rather than the image's file URL -- the reason the
            // icon used to be pointer-events: none. It needs pointers back to be hoverable.
            thumb.draggable = false;
            if (richTooltips && result.documentClass === 'Item') {
                // The system's own contract: a placeholder it recognises, swapped for the
                // real card when the document resolves. Built as a string because that is
                // what data-tooltip is -- Foundry runs it through cleanHTML and injects it
                // (client/helpers/interaction/tooltip-manager.mjs:243, v13), and `section`,
                // `class` and `data-*` all survive that pass.
                thumb.dataset.tooltip = `<section class="loading" data-uuid="${esc(result.uuid)}"><i class="fa-solid fa-spinner fa-spin-pulse"></i></section>`;
            } else {
                // No card for this document class, so say something true rather than
                // leaving a spinner that never resolves.
                thumb.dataset.tooltip = 'Click to open, drag to add';
            }

            const name = document.createElement('span');
            name.className = 'bcs-name';
            name.textContent = result.name;

            const badge = document.createElement('span');
            badge.className = 'bcs-type-badge';
            // Subtype when there is one ('weapon', 'spell', 'npc'), which also happens
            // to be what tells an Item row from an Actor row in All mode. Types with no
            // subtype (JournalEntry, Scene) fall back to the class so no row is unlabelled.
            badge.textContent = result.type ?? result.documentClass ?? '';

            row.append(thumb, name, badge);

            // Only when the call actually asked about economics -- these are null on a
            // plain search, and a badge reading "0 gp" on every row would be worse than
            // no badge. A blank rarity is rendered as the mundane label rather than as
            // nothing, so the row says which it is instead of leaving the user to guess.
            if (typeof result.rarity === 'string') {
                const rarityBadge = document.createElement('span');
                rarityBadge.className = 'bcs-rarity-badge';
                rarityBadge.dataset.rarity = result.rarity || RARITY_MUNDANE;
                rarityBadge.textContent = result.rarity
                    ? (game.i18n.localize(CONFIG?.DND5E?.itemRarity?.[result.rarity] ?? result.rarity))
                    : 'Mundane';
                row.appendChild(rarityBadge);
            }
            if (typeof result.priceGp === 'number' && result.priceGp > 0) {
                const priceBadge = document.createElement('span');
                priceBadge.className = 'bcs-price-badge';
                // Converted to gold by the API, so a 50 sp item reads 5 gp here rather
                // than sorting as though it cost fifty.
                priceBadge.textContent = `${Number(result.priceGp.toFixed(2))} gp`;
                row.appendChild(priceBadge);
            }

            list.appendChild(row);
        }

        if (status) {
            const sources = new Set(results.map(r => r.source)).size;
            // Reported, not inferred: `results.length === limit` over-reports, because a
            // scan that fills the cap exactly with the last available candidate is complete.
            const skipped = report.skippedSources?.length ?? 0;
            const more = report.truncated
                ? ` — more available${skipped ? `, ${skipped} compendium${skipped === 1 ? '' : 's'} not searched` : ''}`
                : '';
            // Said out loud, because an unscoped scan is the one state where a result can
            // come from a compendium the GM deliberately left out of the mapping -- and
            // the row's own heading names the pack without saying that.
            const scopes = [];
            if (this._allSources) scopes.push('all installed');
            if (this._includeWorld) scopes.push('world');
            const scope = scopes.length ? ` — ${scopes.join(' + ')}` : '';
            status.textContent = `${results.length} in ${sources} source${sources === 1 ? '' : 's'}${scope} (${elapsed}ms)${more}`;
            status.classList.toggle('is-truncated', !!report.truncated);
        }
    }

    // ==============================================================
    // ===== DRAG AND CLICK =========================================
    // ==============================================================

    /**
     * Hand Foundry its native drag payload.
     *
     * `{type, uuid}` on `text/plain` is what TextEditor.getDragEventData parses and
     * what every core `_onDrop*` handler expects, so the drop target does the rest:
     * a dnd5e character sheet embeds the Item, the canvas places an Actor as a token,
     * a journal builds a link.
     */
    _onDragStart(event) {
        const row = event.target?.closest?.('.bcs-row');
        if (!row?.dataset?.uuid) return;

        // Checked here as well as on the row's `draggable`, because hiding an affordance is
        // not authorisation: the attribute is one line of devtools away, and this listener
        // is what actually hands over the payload. Re-read rather than cached from the last
        // paint, so a GM turning the setting off takes effect on the next drag.
        if (!this._canAddFromResults()) {
            event.preventDefault();
            return;
        }

        event.dataTransfer.setData('text/plain', JSON.stringify({
            type: row.dataset.documentClass,
            uuid: row.dataset.uuid
        }));
        event.dataTransfer.effectAllowed = 'copy';

        // Drag the icon rather than the whole row: the row is as wide as the window
        // and its ghost covers the sheet you are aiming at.
        const thumb = row.querySelector('.bcs-thumb');
        if (thumb) event.dataTransfer.setDragImage(thumb, 16, 16);
    }

    /** Click opens the document's own sheet — the compendium-sidebar convention. */
    async _onRowClick(event) {
        const row = event.target?.closest?.('.bcs-row');
        if (!row?.dataset?.uuid) return;
        try {
            const doc = await fromUuid(row.dataset.uuid);
            doc?.sheet?.render(true);
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, `Compendium Search: could not open ${row.dataset.uuid}`, error, false, false);
        }
    }

    // ==============================================================
    // ===== PREFERENCES ============================================
    // ==============================================================

    /** Type, subtype and the facets persist; the query deliberately does not — a stale search on open is noise. */
    async _savePreferences() {
        try {
            await game.settings.set(MODULE.ID, PREFS_SETTING, {
                type: this._type,
                subtype: this._subtype,
                rarity: this._rarity,
                priceMin: this._priceMin,
                priceMax: this._priceMax,
                allSources: this._allSources,
                includeWorld: this._includeWorld
            });
        } catch (error) {
            postConsoleAndNotification(MODULE.NAME, 'Compendium Search: could not save preferences', error, false, false);
        }
    }
}

// ==================================================================
// ===== ENTRY POINTS ===============================================
// ==================================================================
// Menubar tool and keybinding, registered at module scope in the same
// shape as window-skillcheck.js and utility-core.js. Both rely on this
// file being reached from the static import graph — blacksmith.js
// imports it for exactly that reason. The toolbar's `await import()`
// then resolves from the module cache and costs nothing.
//
// The keybinding must register during `init`: Foundry builds its
// keybinding registry there, and a later call is dropped.

/**
 * Ctrl+Space opens (or focuses) the palette.
 *
 * Registered as `editable`, so it shows up in Configure Controls and a user whose
 * OS already claims Ctrl+Space — it is the input-method switcher on some Windows
 * and macOS setups with more than one keyboard layout — can rebind it there.
 * Not `restricted`: players use this to equip their own characters.
 */
function registerCompendiumSearchKeybinding() {
    if (!game?.keybindings?.register) return;
    try {
        const KM = foundry?.helpers?.interaction?.KeyboardManager;
        const controlMod = KM?.MODIFIER_KEYS?.CONTROL;
        const modifiers = controlMod != null ? [controlMod] : ['Control'];
        const precedence = (typeof CONST !== 'undefined' && CONST.KEYBINDING_PRECEDENCE_NORMAL !== undefined)
            ? CONST.KEYBINDING_PRECEDENCE_NORMAL
            : undefined;
        game.keybindings.register(MODULE.ID, 'openCompendiumSearch', {
            name: MODULE.ID + '.keybindingCompendiumSearch-Name',
            hint: MODULE.ID + '.keybindingCompendiumSearch-Hint',
            editable: [{ key: 'Space', modifiers }],
            restricted: false,
            ...(precedence !== undefined ? { precedence } : {}),
            onDown: () => {
                void CompendiumSearchWindow.open();
                // Swallow the event so the browser does not also scroll the page.
                return true;
            }
        });
    } catch (error) {
        console.error('Coffee Pub Blacksmith | Compendium Search keybinding registration failed', error);
    }
}

Hooks.once('init', () => {
    registerCompendiumSearchKeybinding();
});

/** Make the window openable by id from any module or macro. */
export function registerCompendiumSearchWindow() {
    registerWindow(APP_ID, {
        moduleId: MODULE.ID,
        title: 'Compendium Search',
        open: async () => CompendiumSearchWindow.open()
    });
}

Hooks.once('ready', () => {
    const api = game.modules.get(MODULE.ID)?.api;
    if (!api?.registerMenubarTool) return;
    api.registerMenubarTool('compendium-search', {
        // The magnifying glass here and fa-book-atlas on the scene-controls tool:
        // the menubar reads as actions, the scene-controls row as subject matter.
        icon: "fa-solid fa-magnifying-glass",
        name: "compendium-search",
        // Icon only. An empty title renders no label, the same way the left zone's
        // menu/settings/refresh tools do; the tooltip carries the meaning on hover.
        title: "",
        tooltip: "Search your compendiums; drag a result onto a sheet",
        onClick: () => void CompendiumSearchWindow.open(),
        // Left zone, with the other always-available client tools (menu, settings,
        // refresh) rather than the middle zone's play-state tools.
        zone: "left",
        group: "general",
        groupOrder: 100,
        order: 3,
        moduleId: "blacksmith-core",
        gmOnly: false,
        leaderOnly: false,
        visible: () => getSettingSafely(MODULE.ID, 'compendiumSearchShowInMenubar', true),
        toggleable: false,
        active: false,
        iconColor: null,
        buttonNormalTint: null,
        buttonSelectedTint: null
    });
});

export default CompendiumSearchWindow;
