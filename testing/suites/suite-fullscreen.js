// ==================================================================
// ===== FULLSCREEN WINDOW SUITE ====================================
// ==================================================================
//
// The third window presentation: a viewport-covering, blocking surface.
// See documentation/api/api-window.md and scripts/window-fullscreen-base.js.
//
// The interactive tier here is a TUNER, not a set of demos. Every animation
// dial is a slider on a panel beside the surface, and "Copy CSS" puts the
// current values on the clipboard in the shape the stylesheets want. Tuning
// in devtools and then trying to remember what you settled on is how a good
// setting gets lost.
//
// Timings are judged, not asserted -- "is the slam too frantic at six cards"
// has no pass condition. What the headless tier does assert is the contract
// underneath: that the chain derives rather than hard-codes, that the base
// numbers and seeds staged items, and that entrance and exit both resolve to
// a real duration. Those are the things that break silently.
// ==================================================================

import { requireApi } from '../harness-lib.js';

const SURFACE_ID = 'bs-fs-harness';
const PANEL_ID = 'bs-fs-harness-panel';

// `scope: 'stage'` writes to the surface element and needs a replay to be seen.
// `scope: 'band'` writes to the cinematic band and applies immediately.
const DIALS = [
    { group: 'Entrance', prop: '--fs-stage-surface-duration', label: 'Surface', min: 0, max: 800, step: 10, unit: 'ms', scope: 'stage' },
    { group: 'Entrance', prop: '--fs-stage-panel-duration', label: 'Panel', min: 0, max: 1200, step: 10, unit: 'ms', scope: 'stage' },
    { group: 'Entrance', prop: '--fs-stage-content-duration', label: 'Content', min: 0, max: 1200, step: 10, unit: 'ms', scope: 'stage' },
    { group: 'Entrance', prop: '--fs-stage-item-duration', label: 'Item', min: 0, max: 1600, step: 10, unit: 'ms', scope: 'stage' },
    { group: 'Entrance', prop: '--fs-stage-item-stagger', label: 'Item stagger', min: 0, max: 400, step: 5, unit: 'ms', scope: 'stage' },

    { group: 'Exit', prop: '--fs-exit-item-duration', label: 'Item', min: 0, max: 1200, step: 10, unit: 'ms', scope: 'stage' },
    { group: 'Exit', prop: '--fs-exit-item-stagger', label: 'Item stagger', min: 0, max: 300, step: 5, unit: 'ms', scope: 'stage' },
    { group: 'Exit', prop: '--fs-exit-content-duration', label: 'Content', min: 0, max: 1200, step: 10, unit: 'ms', scope: 'stage' },
    { group: 'Exit', prop: '--fs-exit-panel-duration', label: 'Panel', min: 0, max: 1200, step: 10, unit: 'ms', scope: 'stage' },
    { group: 'Exit', prop: '--fs-exit-surface-duration', label: 'Surface', min: 0, max: 1200, step: 10, unit: 'ms', scope: 'stage' },

    { group: 'Ambient', prop: '--cpb-vs-flare-duration', label: 'VS flare', min: 0.6, max: 8, step: 0.1, unit: 's', scope: 'band' },
    { group: 'Ambient', prop: '--cpb-title-glow-duration', label: 'Title glow', min: 0.6, max: 12, step: 0.1, unit: 's', scope: 'band' },
    { group: 'Ambient', prop: '--cpb-bar-drift-duration', label: 'Band drift', min: 4, max: 60, step: 1, unit: 's', scope: 'band' },
    { group: 'Ambient', prop: '--cpb-bar-sheen-duration', label: 'Band sheen', min: 4, max: 60, step: 1, unit: 's', scope: 'band' },
    { group: 'Ambient', prop: '--cpb-card-gloss-duration', label: 'Gloss floor', min: 2, max: 40, step: 1, unit: 's', scope: 'band' },
    { group: 'Ambient', prop: '--cpb-card-gloss-spread', label: 'Gloss spread', min: 0, max: 30, step: 1, unit: 's', scope: 'band' },

    { group: 'Layout', prop: '--cpb-plate-overlap', label: 'Plate overlap', min: 0, max: 60, step: 1, unit: 'px', scope: 'band' },
    { group: 'Layout', prop: '--cpb-band-border-width', label: 'Band border', min: 0, max: 40, step: 1, unit: 'px', scope: 'band' }
];

const BANNER = 'modules/coffee-pub-blacksmith/themes/request-roll/images/panel-08.webp';
const PORTRAITS = [
    'icons/svg/mystery-man.svg', 'icons/svg/angel.svg', 'icons/svg/aura.svg',
    'icons/svg/blood.svg', 'icons/svg/eye.svg', 'icons/svg/skull.svg'
];

const state = { preset: 'slide', cards: 6, contested: true, values: {} };

// ---------- the sample surface -------------------------------------------

function cardHtml(name, img) {
    return `
        <div class="cpb-cinematic-card" data-fs-stage="items">
            <img src="${img}" alt="">
            <div class="cpb-cinematic-actor-name">${name}</div>
            <div class="cpb-cinematic-roll-area">
                <div class="cpb-cinematic-roll-result success">18</div>
            </div>
        </div>`;
}

function bodyHtml() {
    const cards = Array.from({ length: state.cards },
        (_, i) => cardHtml(`Tester ${i + 1}`, PORTRAITS[i % PORTRAITS.length]));
    const half = Math.ceil(cards.length / 2);
    const inner = state.contested
        ? `<div class="cpb-cinematic-actor-group cpb-cinematic-actor-group-challengers" data-fs-from="left">
               <div class="cpb-cinematic-card-grid">${cards.slice(0, half).join('')}</div>
           </div>
           <div class="cpb-cinematic-vs-divider" data-fs-stage="content"><span class="cpb-cinematic-vs-flame">VS</span></div>
           <div class="cpb-cinematic-actor-group cpb-cinematic-actor-group-defenders" data-fs-from="right">
               <div class="cpb-cinematic-card-grid">${cards.slice(half).join('')}</div>
           </div>`
        : cards.join('');

    return `
        <div id="cpb-cinematic-bar" style="background-image: url('${BANNER}');">
            <div class="cpb-cinematic-plate-slot cpb-cinematic-plate-slot-title">
                <div class="cpb-cinematic-plate cpb-cinematic-plate-title" data-fs-stage="content" style="background-image: url('${BANNER}');"><span class="cpb-cinematic-plate-text">Acrobatics</span></div>
            </div>
            <div class="cpb-cinematic-actors-container ${state.contested ? 'contested' : ''}">${inner}</div>
            <div class="cpb-cinematic-plate-slot cpb-cinematic-plate-slot-detail">
                <div class="cpb-cinematic-plate cpb-cinematic-plate-detail" data-fs-stage="content" style="background-image: url('${BANNER}');">
                    <span class="cpb-cinematic-plate-detail-line">Acrobatics vs Acrobatics &bull; DC 13</span>
                </div>
            </div>
        </div>`;
}

/**
 * Build the sample surface class on demand.
 *
 * Built inside the function rather than at module scope because `extends` needs the
 * base resolved, and a suite is imported by the harness with a cache-buster -- doing
 * it lazily keeps the import side-effect free.
 */
async function surfaceClass() {
    const { BlacksmithFullscreenWindowBaseV2, BLACKSMITH_FULLSCREEN_LAYOUTS } =
        await import('/modules/coffee-pub-blacksmith/api/blacksmith-api.js');

    return class HarnessSurface extends BlacksmithFullscreenWindowBaseV2 {
        static DEFAULT_OPTIONS = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
            {
                id: SURFACE_ID,
                classes: ['blacksmith-window-fullscreen', 'cpb-cinematic'],
                fullscreenLayout: BLACKSMITH_FULLSCREEN_LAYOUTS.BAR,
                fullscreenBackdrop: {
                    image: 'modules/coffee-pub-blacksmith/images/backgrounds/background-skull-red.webp',
                    color: 'rgba(0, 0, 0, 0.42)', blur: 12, saturate: 115,
                    opacity: 0.4, imageBlur: 6, fit: 'cover'
                }
            }
        );

        async getData() {
            return { appId: this.id, showHeader: false, bodyContent: bodyHtml() };
        }
    };
}

function surfaceEl() { return document.getElementById(SURFACE_ID); }
function bandEl() { return surfaceEl()?.querySelector('#cpb-cinematic-bar') ?? null; }

function applyValues() {
    for (const d of DIALS) {
        const v = state.values[d.prop];
        if (v == null) continue;
        const el = d.scope === 'stage' ? surfaceEl() : bandEl();
        el?.style.setProperty(d.prop, `${v}${d.unit}`);
    }
}

async function openSurface() {
    // Rebuilt rather than re-rendered: `data-fs-entered` deliberately stops a re-render
    // replaying the entrance, which is precisely what a tuner needs to do.
    const existing = foundry.applications.instances.get(SURFACE_ID);
    if (existing) await existing.close();
    const Surface = await surfaceClass();
    await new Surface({ fullscreenAnimation: state.preset }).render(true);
    applyValues();
}

async function closeSurface() {
    await foundry.applications.instances.get(SURFACE_ID)?.close();
}

// ---------- the tuner panel ----------------------------------------------

function seedFromComputed() {
    for (const d of DIALS) {
        const el = d.scope === 'stage' ? surfaceEl() : bandEl();
        const raw = el ? getComputedStyle(el).getPropertyValue(d.prop).trim() : '';
        const n = parseFloat(raw);
        state.values[d.prop] = Number.isFinite(n) ? n : (d.min + d.max) / 2;
    }
}

function syncInputs(panel) {
    for (const input of panel.querySelectorAll('input[type="range"]')) {
        const d = DIALS.find((x) => x.prop === input.dataset.prop);
        input.value = state.values[d.prop];
        input.nextElementSibling.textContent = `${input.value}${d.unit}`;
    }
}

function buildPanel(animations, log) {
    document.getElementById(PANEL_ID)?.remove();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = `position:fixed;top:12px;left:12px;z-index:200050;width:330px;
        max-height:calc(100vh - 24px);overflow:auto;padding:12px 14px;background:rgba(14,14,16,.96);
        border:1px solid rgba(255,255,255,.18);border-radius:8px;color:#eee;
        font:12px/1.4 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.7);`;

    const groups = [...new Set(DIALS.map((d) => d.group))];
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong style="font-size:13px">Fullscreen animation</strong>
            <button data-act="close" style="background:none;border:none;color:#bbb;cursor:pointer;font-size:16px">&times;</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            ${Object.values(animations).map((p) =>
                `<button data-preset="${p}" style="flex:1;padding:5px;border-radius:4px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#fff;cursor:pointer">${p}</button>`).join('')}
        </div>
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
            <label style="flex:1">Cards <input data-act="cards" type="number" min="1" max="12" value="${state.cards}" style="width:46px;background:#000;color:#fff;border:1px solid #444;border-radius:3px"></label>
            <label style="flex:1"><input data-act="contested" type="checkbox" ${state.contested ? 'checked' : ''}> Contested</label>
        </div>
        ${groups.map((g) => `
            <div style="margin:10px 0 4px;font-weight:700;color:#d9b26a">${g}</div>
            ${DIALS.filter((d) => d.group === g).map((d) => `
                <label style="display:flex;align-items:center;gap:6px;margin:3px 0">
                    <span style="flex:1">${d.label}</span>
                    <input data-prop="${d.prop}" type="range" min="${d.min}" max="${d.max}" step="${d.step}" style="flex:1.3">
                    <output style="width:54px;text-align:right;color:#9ecbff"></output>
                </label>`).join('')}`).join('')}
        <div style="display:flex;gap:6px;margin-top:12px">
            <button data-act="replay" style="flex:1;padding:7px;border-radius:4px;border:none;background:#c15701;color:#fff;font-weight:700;cursor:pointer">Replay</button>
            <button data-act="exit" style="flex:1;padding:7px;border-radius:4px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#fff;cursor:pointer">Play exit</button>
        </div>
        <button data-act="copy" style="width:100%;margin-top:6px;padding:7px;border-radius:4px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#fff;cursor:pointer">Copy CSS</button>
        <div data-act="status" style="margin-top:8px;color:#8a8;min-height:14px"></div>`;

    const markPreset = () => panel.querySelectorAll('[data-preset]').forEach((b) => {
        b.style.background = b.dataset.preset === state.preset ? '#c15701' : 'rgba(255,255,255,.06)';
    });
    markPreset();

    panel.addEventListener('input', (e) => {
        const input = e.target.closest('input[type="range"]');
        if (!input) return;
        const d = DIALS.find((x) => x.prop === input.dataset.prop);
        state.values[d.prop] = Number(input.value);
        input.nextElementSibling.textContent = `${input.value}${d.unit}`;
        applyValues();
    });

    panel.addEventListener('change', async (e) => {
        if (e.target.dataset.act === 'cards') { state.cards = Number(e.target.value) || 1; await openSurface(); }
        if (e.target.dataset.act === 'contested') { state.contested = e.target.checked; await openSurface(); }
    });

    panel.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const status = panel.querySelector('[data-act="status"]');
        if (btn.dataset.preset) {
            state.preset = btn.dataset.preset;
            markPreset();
            await openSurface();
            seedFromComputed();
            syncInputs(panel);
            applyValues();
            return;
        }
        switch (btn.dataset.act) {
            case 'replay': await openSurface(); break;
            case 'exit': await closeSurface(); break;
            case 'close': await closeSurface(); panel.remove(); break;
            case 'copy': {
                const block = (scope, file, selector) =>
                    `/* ${file} */\n${selector} {\n` +
                    DIALS.filter((d) => d.scope === scope)
                        .map((d) => `    ${d.prop}: ${state.values[d.prop]}${d.unit};`).join('\n') +
                    `\n}`;
                const css = [
                    block('stage', 'styles/window-fullscreen.css',
                        `.blacksmith-window-fullscreen[data-fs-animation="${surfaceEl()?.dataset.fsAnimation ?? state.preset}"]`),
                    block('band', 'styles/window-roll-cinematic.css', '#cpb-cinematic-bar')
                ].join('\n\n');
                await navigator.clipboard.writeText(css);
                status.textContent = 'CSS on the clipboard.';
                log(css);
                setTimeout(() => { status.textContent = ''; }, 2500);
                break;
            }
        }
    });

    document.body.appendChild(panel);
    return panel;
}

// ==================================================================

export default {
    id: 'fullscreen',
    label: 'Fullscreen Window',
    icon: 'fa-solid fa-expand',

    settings: () => {
        const api = game.modules.get('coffee-pub-blacksmith')?.api;
        return [
            { label: 'Presets', value: Object.values(api?.fullscreenAnimations ?? {}).join(', ') || 'unavailable' },
            { label: 'Layouts', value: Object.values(api?.fullscreenLayouts ?? {}).join(', ') || 'unavailable' },
            { label: 'Reduced motion', value: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'ON - every preset collapses to a fade' : 'off' }
        ];
    },

    checks: [
        // ---------- HEADLESS: the contract under the timings ----------
        {
            id: 'api-surface',
            label: 'Base class and constants are exposed',
            tier: 'headless',
            group: 'API',
            run: async ({ expect }) => {
                const api = requireApi();
                expect.ok('BlacksmithFullscreenWindowBaseV2 on module.api',
                    typeof api.BlacksmithFullscreenWindowBaseV2 === 'function');
                expect.ok('getFullscreenWindowBaseV2() returns it',
                    api.getFullscreenWindowBaseV2?.() === api.BlacksmithFullscreenWindowBaseV2);
                for (const key of ['fullscreenLayouts', 'fullscreenFits', 'fullscreenAnimations',
                    'fullscreenStages', 'fullscreenFrom']) {
                    expect.ok(`api.${key} is present`, !!api[key] && typeof api[key] === 'object');
                }
                expect.ok('windowStyles carries FULLSCREEN', api.windowStyles?.FULLSCREEN === 'fullscreen');
            }
        },
        {
            id: 'api-bridge',
            label: 'The bridge exports everything module.api does',
            tier: 'headless',
            group: 'API',
            note: 'a consumer subclassing at load time uses the bridge, not module.api',
            run: async ({ expect }) => {
                const bridge = await import('/modules/coffee-pub-blacksmith/api/blacksmith-api.js');
                const api = requireApi();
                expect.ok('same base class object',
                    bridge.BlacksmithFullscreenWindowBaseV2 === api.BlacksmithFullscreenWindowBaseV2);
                expect.ok('BLACKSMITH_FULLSCREEN_ANIMATIONS exported', !!bridge.BLACKSMITH_FULLSCREEN_ANIMATIONS);
                expect.ok('BLACKSMITH_FULLSCREEN_STAGES exported', !!bridge.BLACKSMITH_FULLSCREEN_STAGES);
                expect.ok('BLACKSMITH_FULLSCREEN_LAYOUTS exported', !!bridge.BLACKSMITH_FULLSCREEN_LAYOUTS);
                expect.ok('BLACKSMITH_FULLSCREEN_FITS exported', !!bridge.BLACKSMITH_FULLSCREEN_FITS);
                expect.ok('BLACKSMITH_FULLSCREEN_FROM exported', !!bridge.BLACKSMITH_FULLSCREEN_FROM);
            }
        },
        {
            id: 'stage-chain',
            label: 'Every preset resolves a real entrance and exit duration',
            tier: 'headless',
            group: 'Stage chain',
            note: 'the base reads these back; a preset that resolves to 0 closes instantly',
            run: async ({ expect, log }) => {
                const api = requireApi();
                const probe = document.createElement('div');
                probe.className = 'blacksmith-window-fullscreen';
                probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:10px;height:10px';
                document.body.appendChild(probe);
                try {
                    const concrete = Object.values(api.fullscreenAnimations)
                        .filter((p) => p !== api.fullscreenAnimations.RANDOM);
                    for (const preset of concrete) {
                        probe.dataset.fsAnimation = preset;
                        const cs = getComputedStyle(probe);
                        const entrance = cs.getPropertyValue('--fs-stage-total').trim();
                        const exit = cs.getPropertyValue('--fs-exit-total').trim();
                        expect.ok(`${preset}: entrance total resolves`, entrance !== '');
                        expect.ok(`${preset}: exit total resolves`, exit !== '');
                        expect.ok(`${preset}: entrance is non-zero`, parseFloat(entrance) > 0);
                        log(`${preset}: in ${entrance || '?'}, out ${exit || '?'}`);
                    }
                } finally {
                    probe.remove();
                }
            }
        },
        {
            id: 'item-seeding',
            label: 'Staged items get an index, a seed, and a count',
            tier: 'headless',
            group: 'Stage chain',
            note: 'the stagger and the ambient desync both depend on these',
            run: async ({ expect }) => {
                await openSurface();
                try {
                    const surface = surfaceEl();
                    const items = surface?.querySelectorAll('[data-fs-stage="items"]') ?? [];
                    expect.ok('items were rendered', items.length > 0);
                    const indices = [...items].map((el) => el.style.getPropertyValue('--fs-index'));
                    expect.ok('every item has --fs-index', indices.every((v) => v !== ''));

                    // Each group carries the full run 0..n-1, but ORDER depends on the
                    // edge: left and top count with the DOM, right and bottom against it,
                    // so a mirrored layout arrives as pairs. Asserting DOM order for every
                    // group would be asserting the bug this replaced.
                    const byGroup = new Map();
                    for (const el of items) {
                        const key = el.closest('[data-fs-from]')?.dataset.fsFrom ?? '';
                        if (!byGroup.has(key)) byGroup.set(key, []);
                        byGroup.get(key).push(el.style.getPropertyValue('--fs-index'));
                    }
                    expect.ok('each group carries a full 0..n-1 run',
                        [...byGroup.values()].every((g) =>
                            [...g].map(Number).sort((a, b) => a - b).join(',')
                            === g.map((_, i) => String(i)).join(',')));
                    for (const [key, g] of byGroup) {
                        if (g.length < 2) continue;
                        // Filled AWAY from the edge it enters through, so nothing flies
                        // over a card already parked. From the left, the last slot in the
                        // DOM is index 0; from the right, the first.
                        const fillsFromFarEnd = key === 'left' || key === 'top' || key === '';
                        expect.ok(`${key || 'default'} group fills away from its entry edge`,
                            (fillsFromFarEnd ? g[g.length - 1] : g[0]) === '0');
                    }

                    const seeds = [...items].map((el) => el.style.getPropertyValue('--fs-random'));
                    expect.ok('every item has --fs-random', seeds.every((v) => v !== ''));
                    expect.ok('seeds are not all identical', new Set(seeds).size > 1);
                    expect.ok('--fs-stage-item-count is published',
                        surface.style.getPropertyValue('--fs-stage-item-count') !== '');

                    // Contested: the two sides are numbered independently, so they arrive
                    // in step. One continuous run across both would land every challenger
                    // before the first defender moved.
                    const left = [...surface.querySelectorAll('[data-fs-from="left"] [data-fs-stage="items"]')];
                    const right = [...surface.querySelectorAll('[data-fs-from="right"] [data-fs-stage="items"]')];
                    if (left.length && right.length) {
                        // The pairing test: the two INNERMOST cards are both index 0, so
                        // the confrontation forms at the divider and grows outward. For
                        // the left group that is the last element in DOM order; for the
                        // right group, the first.
                        expect.ok('the innermost cards of each side pair up at index 0',
                            left[left.length - 1].style.getPropertyValue('--fs-index') === '0'
                            && right[0].style.getPropertyValue('--fs-index') === '0');
                        expect.ok('item count is the largest side, not the total',
                            Number(surface.style.getPropertyValue('--fs-stage-item-count'))
                            === Math.max(left.length, right.length) - 1);
                    }
                } finally {
                    await closeSurface();
                }
            }
        },
        {
            id: 'theme-setting',
            label: 'Every roll type has a banner AND an entrance',
            tier: 'headless',
            group: 'Theme',
            note: 'ANIM<TYPE> mirrors BACK<TYPE> in theme-requestroll.json',
            run: async ({ expect, log }) => {
                const api = requireApi();
                const { resolveRequestRollSetting, resolveRequestRollCinematicBanner, getRequestRollThemeJson } =
                    await import('/modules/coffee-pub-blacksmith/scripts/utility-theme-request-roll.js');

                const json = await getRequestRollThemeJson();
                expect.ok('the theme declares a settings section', Array.isArray(json?.settings));

                // The six that open a band. The results-bar banners have no entrance --
                // they drop over a surface that is already up.
                const SUFFIXES = ['SKILLCHECK', 'ABILITYCHECK', 'SAVINGTHROW',
                    'DICEROLL', 'TOOLCHECK', 'CONTESTEDROLL'];
                const known = Object.values(api.fullscreenAnimations);

                for (const suffix of SUFFIXES) {
                    const banner = await resolveRequestRollCinematicBanner(`BACK${suffix}`);
                    const anim = await resolveRequestRollSetting(`ANIM${suffix}`);
                    expect.ok(`BACK${suffix} resolves a banner`, banner !== '');
                    expect.ok(`ANIM${suffix} resolves an entrance`, anim !== '');
                    expect.ok(`ANIM${suffix} names a preset the base knows`, known.includes(anim));
                    log(`${suffix}: ${anim} over ${banner.split('/').pop()}`);
                }

                expect.ok('an unknown constant resolves empty, not undefined',
                    (await resolveRequestRollSetting('NO_SUCH_SETTING')) === '');
            }
        },
        {
            id: 'random-resolves-once',
            label: 'random resolves to a real preset, and keeps it',
            tier: 'headless',
            group: 'Stage chain',
            note: 'a preset that changed mid-life would exit differently from how it entered',
            run: async ({ expect, log }) => {
                const api = requireApi();
                const previous = state.preset;
                state.preset = api.fullscreenAnimations.RANDOM;
                try {
                    await openSurface();
                    const app = foundry.applications.instances.get(SURFACE_ID);
                    const first = surfaceEl()?.dataset.fsAnimation;
                    expect.ok('resolved to a concrete preset',
                        !!first && first !== 'random'
                        && Object.values(api.fullscreenAnimations).includes(first));
                    expect.ok('the getter agrees with the attribute', app.fullscreenAnimation === first);
                    // Read repeatedly: a fresh draw each time is the bug.
                    expect.ok('stable across reads',
                        app.fullscreenAnimation === first && app.fullscreenAnimation === first);
                    log(`random drew "${first}" this time`);
                } finally {
                    await closeSurface();
                    state.preset = previous;
                }
            }
        },
        {
            id: 'entrance-total-tracks-items',
            label: 'The entrance duration grows with the item count',
            tier: 'headless',
            group: 'Stage chain',
            note: 'a total read before the count is published cuts later items mid-flight',
            run: async ({ expect, log }) => {
                // Milliseconds, whatever unit CSS reports. The chain resolves to `s`
                // once the numbers grow past a second, and a bare parseFloat then reads
                // 3.06s as 3.06ms -- which compared a total in seconds against a last
                // finish in milliseconds and failed a check the feature was passing.
                // The base has `_readCssMs` for exactly this; the mistake was reading
                // the value a second way rather than the same way.
                const asMs = (raw) => {
                    const value = String(raw ?? '').trim();
                    if (!value) return 0;
                    const parsed = parseFloat(value);
                    if (!Number.isFinite(parsed)) return 0;
                    return value.endsWith('ms') ? parsed
                        : value.endsWith('s') ? parsed * 1000
                            : parsed;
                };
                const read = () => asMs(getComputedStyle(surfaceEl())
                    .getPropertyValue('--fs-stage-total'));
                const previous = { cards: state.cards, contested: state.contested };
                state.contested = false;
                try {
                    state.cards = 2;
                    await openSurface();
                    const few = read();
                    state.cards = 8;
                    await openSurface();
                    const many = read();
                    log(`2 items: ${few}ms, 8 items: ${many}ms`);
                    expect.ok('both totals resolve to a number', few > 0 && many > 0);
                    expect.ok('more items means a longer entrance', many > few);

                    // The window the base actually waits for has to cover the last item's
                    // delay plus its flight, or `data-fs-entered` truncates it.
                    const el = surfaceEl();
                    // The latest arrival across every item, not `:last-of-type` -- with
                    // mirrored groups the highest index is not the last element in the DOM,
                    // and with several groups there is no single "last" one at all.
                    const finishes = [...el.querySelectorAll('[data-fs-stage="items"]')].map((item) => {
                        const ics = getComputedStyle(item);
                        return (parseFloat(ics.animationDelay) || 0) * 1000
                            + (parseFloat(ics.animationDuration) || 0) * 1000;
                    });
                    const lastFinish = Math.max(0, ...finishes);
                    log(`total ${Math.round(many)}ms; last item finishes ${Math.round(lastFinish)}ms`);
                    expect.ok('the total outlasts the last item', many + 1 >= lastFinish);
                } finally {
                    await closeSurface();
                    state.cards = previous.cards;
                    state.contested = previous.contested;
                }
            }
        },
        {
            id: 'singleton',
            label: 'A second surface replaces the first',
            tier: 'headless',
            group: 'Lifecycle',
            run: async ({ expect }) => {
                await openSurface();
                await openSurface();
                try {
                    expect.ok('exactly one surface in the DOM',
                        document.querySelectorAll('.blacksmith-window-fullscreen').length === 1);
                    const api = requireApi();
                    expect.ok('the base reports it as current',
                        api.BlacksmithFullscreenWindowBaseV2.current?.id === SURFACE_ID);
                } finally {
                    await closeSurface();
                }
                expect.ok('current is null once closed',
                    requireApi().BlacksmithFullscreenWindowBaseV2.current === null);
                expect.ok('nothing left in the DOM',
                    document.getElementById(SURFACE_ID) === null);
            }
        },
        {
            id: 'scroll-lock',
            label: 'The document is locked while open and released after',
            tier: 'headless',
            group: 'Lifecycle',
            run: async ({ expect }) => {
                const cls = 'blacksmith-fullscreen-scroll-lock';
                await openSurface();
                expect.ok('body is locked while open', document.body.classList.contains(cls));
                await closeSurface();
                expect.ok('body is released after close', !document.body.classList.contains(cls));
            }
        },

        // ---------- INTERACTIVE: the tuner ----------
        {
            id: 'tuner',
            label: 'Open the tuner',
            tier: 'interactive',
            group: 'Tuning',
            note: 'sliders for every dial; Copy CSS puts the result on the clipboard',
            run: async ({ log }) => {
                const api = requireApi();
                await openSurface();
                seedFromComputed();
                const panel = buildPanel(api.fullscreenAnimations, log);
                syncInputs(panel);
                applyValues();
                log('Tuner open. Sliders seed from the live stylesheet, so what you see is what is committed. ' +
                    'Entrance and Exit need Replay / Play exit; Ambient applies as you drag.');
            }
        },
        {
            id: 'reduced-motion',
            label: 'Check it against reduced motion',
            tier: 'interactive',
            group: 'Tuning',
            note: 'turn the OS setting on first; every preset should collapse to a plain fade',
            run: async ({ log }) => {
                const on = matchMedia('(prefers-reduced-motion: reduce)').matches;
                await openSurface();
                log(on
                    ? 'Reduced motion is ON. Nothing should slam, spin, drift, or glint -- the surface fades and that is all.'
                    : 'Reduced motion is OFF, so this is the normal presentation. Turn it on in the OS and run this again.');
            }
        }
    ]
};
