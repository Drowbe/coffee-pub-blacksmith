// ==================================================================
// ===== MANAGER-REGION-BEHAVIORS.JS ================================
// ==================================================================
//
// Blacksmith's own Region behaviours, registered through its own `api.regions` the way a satellite would.
// They are the first consumer of that API and they are glue: each one hands a region event to an API
// Blacksmith already owns, and holds no feature code of its own.
//
//   Request a Roll   A token walks in, and a roll request for it is posted to chat (`api.openRequestRollDialog`,
//                    silent). The classic trap or hazard.
//   Show Callout     A token enters, and a data box (`api.callout`) opens on the region, until the token leaves.
//   Play Sound       A token walks in, and a sound plays: for the whole table, or for the one who walked in.
//   Toggle Tile      A token walks in, and a tile on the scene is shown, hidden or flipped. A pit that appears.
//   Show Toast       A token walks in, and a toast (`api.toast`) appears, as a small notice or a billboard.
//   Post to Chat     A token walks in, and read-aloud text is posted to chat as a card (`api.chatCards`).
//   Change Movement  A token enters, and its movement type becomes swim, fly, crawl and so on, until it leaves.
//   Party Movement   A token walks in, and the party's movement mode changes: Locked, Combat, Conga and so on.
//
// All are declared in module.json under `documentTypes.RegionBehavior`, and registered from `init` by
// blacksmith.js once `module.api` exists. See documentation/api/api-regions.md.

import { MODULE } from './const.js';
import { playSound } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { getMovementTypes, setMovementType } from './token-movement.js';
import { QuickRollsManager } from './manager-quick-rolls.js';

const L = (key) => `${MODULE.ID}.${key}`;
const WHO = { player: 'A token a player owns', any: 'Any token' };

/**
 * The tool's own catalog, as one grouped dropdown, alphabetical in its groups and by group: every skill,
 * ability check and saving throw the system defines, the Quick Rolls library, and a dice formula. A value is
 * `type:id` -- `skill:prc`, `save:dex`, `quick:<id>` -- so the pick says both what kind of roll and which.
 *
 * Built each time the form is drawn, so a roll added to the library appears without a reload, and labels are
 * localized. A contested quick roll is left out: it needs two sides, and a region has one token.
 */
function rollChoices() {
    const dnd = CONFIG.DND5E ?? {};
    const entries = [];
    const add = (group, value, label) => entries.push({ group, value, label: String(label) });
    const label = (data) => game.i18n.localize(data?.label ?? '');

    for (const [id, data] of Object.entries(dnd.skills ?? {})) add('Skill', `skill:${id}`, label(data));
    for (const [id, data] of Object.entries(dnd.abilities ?? {})) add('Ability Check', `ability:${id}`, label(data));
    for (const [id, data] of Object.entries(dnd.abilities ?? {})) add('Saving Throw', `save:${id}`, label(data));
    add('Saving Throw', 'save:death', 'Death');
    add('Dice', 'dice', 'Dice formula');
    for (const roll of QuickRollsManager.all()) {
        if (roll.mode !== 'contested') add('Quick Roll', `quick:${roll.id}`, roll.label);
    }

    const byText = (x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' });
    entries.sort((x, y) => byText(x.group, y.group) || byText(x.label, y.label));
    return Object.fromEntries(entries.map(({ group, value, label }) => [value, { group, label }]));
}

/** The `api` object, read at call time so it is the public surface a satellite would see. */
const api = () => game.modules.get(MODULE.ID)?.api;

/** A multi-line text field. The sheet draws a StringField as one line; this one asks for a textarea. */
const longText = (fields, options) => new (class extends fields.StringField {
    _toInput(config) {
        config.elementType = 'textarea';
        return super._toInput(config);
    }
})(options);

const calloutId = (region) => `${MODULE.ID}:region:${region.id}`;

/** The token that walked in, if it is one this behaviour is set to react to. Null otherwise. */
function walkedIn(behavior, event) {
    const token = event.data?.token;
    const actor = token?.actor;
    if (!token || !actor) return null;
    if (behavior.who === 'player' && !actor.hasPlayerOwner) return null;
    return token;
}

/** Switch a behaviour off after it has done its one job, marked so a region reset brings it back. A write: the active GM's client. */
const spend = (behavior) => api().regions.spend(behavior.parent);

/** The Triggered by and Only once fields every walk-in behaviour carries, worded once. */
const walkInFields = (fields) => ({
    who: new fields.StringField({
        required: true, blank: false, initial: 'player', choices: WHO,
        label: L('regionCommon-Who-Label'), hint: L('regionCommon-Who-Hint')
    }),
    once: new fields.BooleanField({
        initial: false,
        label: L('regionCommon-Once-Label'), hint: L('regionCommon-Once-Hint')
    })
});

// ===== REQUEST A ROLL =====

/**
 * Post a roll request for the token that walked in. Runs on the active GM's client: the request is the GM's
 * to make, and one client posting it means one card, not one per player.
 */
async function requestRollOnWalkIn(event) {
    const token = walkedIn(this, event);
    if (!token) return;
    const actor = token.actor;

    // A quick roll names the roll and brings its own DC, title and cinematic; the fields here win where set.
    let quick = null;
    if (this.roll.startsWith('quick:')) {
        quick = QuickRollsManager.get(this.roll.slice('quick:'.length));
        if (!quick) {
            ui.notifications.warn(`${event.region?.name ?? 'A region'}: its Quick Roll is no longer in the library, so no roll was requested.`);
            return;
        }
    }
    const [type, value] = quick ? [quick.challenger.type, quick.challenger.value]
        : this.roll === 'dice' ? ['dice', this.dice] : this.roll.split(':');
    if (!value) return;

    await api()?.openRequestRollDialog({
        silent: true,
        title: this.title || quick?.rollTitle || event.region?.name,
        initialType: type,
        initialValue: value,
        isCinematic: this.cinematic || !!quick?.isCinematic,
        dc: this.dc ?? quick?.dc ?? undefined,
        explanation: this.explanation || undefined,
        actors: [{ tokenId: token.id, actorId: actor.id, name: token.name }]
    });
    if (this.once) await spend(this);
}

// ===== SHOW CALLOUT =====

/** Open the box on the region, on the client of the user who moved in. */
function showRegionCallout(event) {
    api()?.callout?.show(calloutId(event.region), {
        anchor: { uuid: event.region.uuid },
        title: this.title || event.region.name,
        subtitle: this.subtitle || undefined,
        body: this.body || undefined,
        icon: this.icon || undefined,
        interactive: false
    });
}

function hideRegionCallout(event) {
    api()?.callout?.hide(calloutId(event.region));
}

// ===== PLAY SOUND =====

/**
 * Two handlers, one per audience, because who runs it is fixed per handler. For the table, the active GM's
 * client plays it and `playSound` carries it to everyone else; for the mover alone, their own client plays
 * it and nothing is sent.
 */
const soundFor = (heardBy) => function (event) {
    if (this.heardBy !== heardBy || !this.sound || !walkedIn(this, event)) return undefined;
    return playSound(this.sound, this.volume, false, heardBy === 'everyone');
};

// ===== SHOW TOAST =====

/** One handler per audience, as with the sound: the toast is local, so each client that should see it shows it. */
const toastFor = (shownTo) => function (event) {
    if (this.shownTo !== shownTo || !walkedIn(this, event)) return;
    api()?.toast?.show({
        title: this.title || event.region?.name || 'Region',
        subtitle: this.subtitle || undefined,
        icon: this.icon || undefined,
        duration: this.duration,
        size: this.size === 'normal' ? undefined : this.size,
        animation: this.animation === 'none' ? undefined : this.animation
    });
};

// ===== POST TO CHAT =====

/** Post the text as a themed card, once, from the active GM's client. A private one goes to the mover and the GMs. */
async function postToChatOnWalkIn(event) {
    if (!walkedIn(this, event)) return;
    const paragraphs = String(this.text ?? '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (!paragraphs.length) return;

    const whisper = this.postedTo === 'mover' && event.user
        ? [...new Set([event.user.id, ...game.users.filter((user) => user.isGM).map((user) => user.id)])]
        : undefined;
    await api()?.chatCards?.post({
        moduleId: MODULE.ID,
        type: 'region-text',
        whisper,
        parts: [
            { part: 'header', ...(this.icon ? { icon: this.icon } : {}), title: this.title || event.region?.name || 'Region' },
            { part: 'prose', blocks: paragraphs.map((text) => ({ type: 'paragraph', text })) }
        ]
    });
    if (this.once) await spend(this);
}

// ===== CHANGE MOVEMENT TYPE =====

/**
 * The movement types a GM could set: the ones Foundry lets a token choose, not the ones it derives from terrain.
 * Alphabetical, as every list here is.
 */
function movementChoices() {
    const choices = [];
    for (const [id, config] of Object.entries(CONFIG.Token?.movement?.actions ?? {})) {
        if (config.terrainAction !== undefined || config.deriveTerrainDifficulty !== undefined) continue;
        choices.push([id, game.i18n.localize(config.label ?? id)]);
    }
    choices.sort((x, y) => x[1].localeCompare(y[1], undefined, { sensitivity: 'base' }));
    return Object.fromEntries(choices);
}

const movementFlag = (behavior) => `flags.${MODULE.ID}.movementBefore.${behavior.parent.id}`;

/** Set the token's movement type, remembering what it was so it can be put back when the token leaves. */
async function changeMovementOnEnter(event) {
    const token = walkedIn(this, event);
    if (!token || token.movementAction === this.action) return;
    await token.update({ movementAction: this.action, [movementFlag(this)]: token.movementAction ?? null });
}

/** Put the movement type back, if this behaviour changed it and was asked to restore it. */
async function restoreMovementOnExit(event) {
    const token = event.data?.token;
    if (!this.restore || !token) return;
    const before = token.getFlag(MODULE.ID, 'movementBefore')?.[this.parent.id];
    if (before === undefined) return;
    await token.update({
        ...(before ? { movementAction: before } : {}),
        [`flags.${MODULE.ID}.movementBefore.-=${this.parent.id}`]: null
    });
}

// ===== CHANGE PARTY MOVEMENT MODE =====

/** The party movement modes (Wander, Locked, Conga...), alphabetical. These are Blacksmith's own, from the menubar. */
function partyMovementChoices() {
    return Object.fromEntries(getMovementTypes(true)
        .map((type) => [type.id, type.name])
        .sort((x, y) => x[1].localeCompare(y[1], undefined, { sensitivity: 'base' })));
}

/** Set the party's movement mode, as choosing it from the menubar does, unless it is already that mode. */
async function changePartyMovementOnWalkIn(event) {
    if (!walkedIn(this, event)) return;
    if (game.settings.get(MODULE.ID, 'movementType') !== this.mode) await setMovementType(this.mode);
    if (this.once) await spend(this);
}

// ===== TOGGLE TILE =====

async function toggleTileOnWalkIn(event) {
    if (!walkedIn(this, event) || !this.tile) return;
    const tile = await fromUuid(this.tile);
    if (!tile) {
        ui.notifications.warn(`${event.region?.name ?? 'A region'}: its tile is no longer on the scene, so nothing was shown or hidden.`);
        return;
    }
    // What the tile was before the first trigger, so a region reset can put it back.
    if (this.parent.getFlag(MODULE.ID, 'tileHidden') === undefined) await this.parent.setFlag(MODULE.ID, 'tileHidden', tile.hidden);
    const hidden = this.action === 'show' ? false : this.action === 'hide' ? true : !tile.hidden;
    if (tile.hidden !== hidden) await tile.update({ hidden });
    if (this.once) await spend(this);
}

/** Put the tile back as it was before the first trigger. */
async function resetTile() {
    const original = this.parent.getFlag(MODULE.ID, 'tileHidden');
    if (original === undefined) return false;
    const tile = this.tile ? await fromUuid(this.tile) : null;
    if (tile && tile.hidden !== original) await tile.update({ hidden: original });
    await this.parent.unsetFlag(MODULE.ID, 'tileHidden');
    return !!tile;
}

// ===== THE RESET BUTTON =====

/** A Reset control in the Behaviors tab of a region's sheet, for the GM. Idempotent: the tab re-renders often. */
function injectResetButton(app, html) {
    if (!game.user?.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const controls = root?.querySelector('.tab[data-tab="behaviors"] header .region-element-controls');
    if (!controls || controls.querySelector('.blacksmith-region-reset')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-control icon fa-solid fa-rotate-left blacksmith-region-reset';
    button.dataset.tooltip = game.i18n.localize(L('regionReset-Tooltip'));
    button.setAttribute('aria-label', button.dataset.tooltip);
    button.addEventListener('click', async (event) => {
        event.preventDefault();
        try {
            const { reenabled, restored } = await api().regions.reset(app.document);
            ui.notifications.info(reenabled || restored
                ? game.i18n.format(L('regionReset-Done'), { reenabled, restored })
                : game.i18n.localize(L('regionReset-Nothing')));
        } catch (error) {
            ui.notifications.error(error.message);
        }
    });
    controls.prepend(button);
}

// ===== REGISTRATION =====

/** Register Blacksmith's behaviours. Called from the `init` hook, after `module.api` is assigned. */
export function registerRegionBehaviors() {
    const regions = api()?.regions;
    if (!regions) return;

    HookManager.registerHook({
        name: 'renderRegionConfig',
        description: 'Regions: add a Reset control to the Behaviors tab',
        context: 'regions',
        priority: 3,
        callback: (app, html) => {
            // --- BEGIN - HOOKMANAGER CALLBACK ---
            injectResetButton(app, html);
            // --- END - HOOKMANAGER CALLBACK ---
        }
    });

    regions.registerBehavior({
        moduleId: MODULE.ID,
        name: 'requestRoll',
        label: 'Request a Roll',
        icon: 'fa-solid fa-dice-d20',
        fields: (fields) => ({
            // A quick roll is a library entry that can be deleted, and a stale id must not make the whole
            // behaviour invalid on load. Its absence is handled when the behaviour runs.
            roll: new (class extends fields.StringField {
                _isValidChoice(value) { return value.startsWith('quick:') || super._isValidChoice(value); }
            })({
                required: true, blank: false, initial: 'skill:prc', choices: rollChoices,
                label: L('regionRequestRoll-Roll-Label'), hint: L('regionRequestRoll-Roll-Hint')
            }),
            dice: new fields.StringField({
                required: false, blank: true, initial: '',
                label: L('regionRequestRoll-Dice-Label'), hint: L('regionRequestRoll-Dice-Hint')
            }),
            dc: new fields.NumberField({
                required: false, nullable: true, integer: true, min: 1, initial: null,
                label: L('regionRequestRoll-DC-Label'), hint: L('regionRequestRoll-DC-Hint')
            }),
            title: new fields.StringField({
                required: false, blank: true, initial: '',
                label: L('regionRequestRoll-Title-Label'), hint: L('regionRequestRoll-Title-Hint')
            }),
            explanation: longText(fields, {
                required: false, blank: true, initial: '',
                label: L('regionRequestRoll-Explanation-Label'), hint: L('regionRequestRoll-Explanation-Hint')
            }),
            cinematic: new fields.BooleanField({
                initial: false,
                label: L('regionRequestRoll-Cinematic-Label'), hint: L('regionRequestRoll-Cinematic-Hint')
            }),
            ...walkInFields(fields)
        }),
        // Move in, not enter: `tokenEnter` also fires for a token created inside or dropped in by a teleport.
        events: { tokenMoveIn: { run: 'activeGM', handler: requestRollOnWalkIn } }
    });

    regions.registerBehavior({
        moduleId: MODULE.ID,
        name: 'showCallout',
        label: 'Show Callout',
        icon: 'fa-solid fa-message-middle-top',
        fields: (fields) => ({
            title: new fields.StringField({
                required: false, blank: true, initial: '',
                label: L('regionShowCallout-Title-Label'), hint: L('regionShowCallout-Title-Hint')
            }),
            subtitle: new fields.StringField({
                required: false, blank: true, initial: '',
                label: L('regionShowCallout-Subtitle-Label'), hint: L('regionShowCallout-Subtitle-Hint')
            }),
            body: longText(fields, {
                required: false, blank: true, initial: '',
                label: L('regionShowCallout-Body-Label'), hint: L('regionShowCallout-Body-Hint')
            }),
            icon: new fields.StringField({
                required: false, blank: true, initial: 'fa-solid fa-message-middle-top',
                label: L('regionShowCallout-Icon-Label'), hint: L('regionShowCallout-Icon-Hint')
            })
        }),
        // Enter and exit, not move in and out: the box follows presence, so a token placed inside or removed
        // from it is covered too.
        events: { tokenEnter: showRegionCallout, tokenExit: hideRegionCallout }
    });

    regions.registerBehavior({
        moduleId: MODULE.ID,
        name: 'playSound',
        label: 'Play Sound',
        icon: 'fa-solid fa-volume-high',
        fields: (fields) => ({
            sound: new fields.FilePathField({
                required: false, categories: ['AUDIO'],
                label: L('regionPlaySound-Sound-Label'), hint: L('regionPlaySound-Sound-Hint')
            }),
            volume: new fields.AlphaField({
                initial: 0.8,
                label: L('regionPlaySound-Volume-Label'), hint: L('regionPlaySound-Volume-Hint')
            }),
            heardBy: new fields.StringField({
                required: true, blank: false, initial: 'everyone',
                choices: { everyone: 'Everyone at the table', mover: 'Only the player who walked in' },
                label: L('regionPlaySound-HeardBy-Label'), hint: L('regionPlaySound-HeardBy-Hint')
            }),
            ...walkInFields(fields)
        }),
        events: {
            tokenMoveIn: [
                { run: 'activeGM', handler: soundFor('everyone') },
                { run: 'mover', handler: soundFor('mover') },
                { run: 'activeGM', handler: function (event) { if (this.once && this.sound && walkedIn(this, event)) return spend(this); } }
            ]
        }
    });

    regions.registerBehavior({
        moduleId: MODULE.ID,
        name: 'toggleTile',
        label: 'Toggle Tile Visibility',
        icon: 'fa-solid fa-eye',
        fields: (fields) => ({
            tile: new fields.DocumentUUIDField({
                type: 'Tile', required: false, nullable: true, initial: null,
                label: L('regionToggleTile-Tile-Label'), hint: L('regionToggleTile-Tile-Hint')
            }),
            action: new fields.StringField({
                required: true, blank: false, initial: 'show',
                choices: { show: 'Show it', hide: 'Hide it', toggle: 'Flip it' },
                label: L('regionToggleTile-Action-Label'), hint: L('regionToggleTile-Action-Hint')
            }),
            ...walkInFields(fields)
        }),
        events: { tokenMoveIn: { run: 'activeGM', handler: toggleTileOnWalkIn } },
        reset: resetTile
    });

    regions.registerBehavior({
        moduleId: MODULE.ID,
        name: 'partyMovement',
        label: 'Change Party Movement Mode',
        icon: 'fa-solid fa-people-group',
        fields: (fields) => ({
            mode: new fields.StringField({
                required: true, blank: false, initial: 'normal-movement', choices: partyMovementChoices(),
                label: L('regionPartyMovement-Mode-Label'), hint: L('regionPartyMovement-Mode-Hint')
            }),
            ...walkInFields(fields)
        }),
        events: { tokenMoveIn: { run: 'activeGM', handler: changePartyMovementOnWalkIn } }
    });

    regions.registerBehavior({
        moduleId: MODULE.ID,
        name: 'changeMovement',
        label: 'Change Movement Type',
        icon: 'fa-solid fa-person-swimming',
        fields: (fields) => ({
            action: new fields.StringField({
                required: true, blank: false, initial: 'walk', choices: movementChoices(),
                label: L('regionChangeMovement-Action-Label'), hint: L('regionChangeMovement-Action-Hint')
            }),
            restore: new fields.BooleanField({
                initial: true,
                label: L('regionChangeMovement-Restore-Label'), hint: L('regionChangeMovement-Restore-Hint')
            }),
            who: new fields.StringField({
                required: true, blank: false, initial: 'any', choices: WHO,
                label: L('regionCommon-Who-Label'), hint: L('regionCommon-Who-Hint')
            })
        }),
        // Enter and exit, not move in and out: the type follows presence, so a token placed inside is covered too.
        events: {
            tokenEnter: { run: 'activeGM', handler: changeMovementOnEnter },
            tokenExit: { run: 'activeGM', handler: restoreMovementOnExit }
        }
    });

    regions.registerBehavior({
        moduleId: MODULE.ID,
        name: 'showToast',
        label: 'Show Toast',
        icon: 'fa-solid fa-bullhorn',
        fields: (fields) => ({
            title: new fields.StringField({
                required: false, blank: true, initial: '',
                label: L('regionShowToast-Title-Label'), hint: L('regionShowToast-Title-Hint')
            }),
            subtitle: new fields.StringField({
                required: false, blank: true, initial: '',
                label: L('regionShowToast-Subtitle-Label'), hint: L('regionShowToast-Subtitle-Hint')
            }),
            icon: new fields.StringField({
                required: false, blank: true, initial: 'fa-solid fa-bullhorn',
                label: L('regionShowToast-Icon-Label'), hint: L('regionShowToast-Icon-Hint')
            }),
            size: new fields.StringField({
                required: true, blank: false, initial: 'normal',
                choices: { normal: 'Notice (top of the screen)', small: 'Billboard: small', medium: 'Billboard: medium', large: 'Billboard: large', fullscreen: 'Billboard: full screen' },
                label: L('regionShowToast-Size-Label'), hint: L('regionShowToast-Size-Hint')
            }),
            animation: new fields.StringField({
                required: true, blank: false, initial: 'none',
                choices: { none: 'None', pop: 'Pop', reveal: 'Reveal', pulse: 'Pulse', slam: 'Slam', shake: 'Shake' },
                label: L('regionShowToast-Animation-Label'), hint: L('regionShowToast-Animation-Hint')
            }),
            duration: new fields.NumberField({
                required: true, nullable: false, min: 0, initial: 8,
                label: L('regionShowToast-Duration-Label'), hint: L('regionShowToast-Duration-Hint')
            }),
            shownTo: new fields.StringField({
                required: true, blank: false, initial: 'mover',
                choices: { everyone: 'Everyone at the table', mover: 'Only the player who walked in' },
                label: L('regionShowToast-ShownTo-Label'), hint: L('regionShowToast-ShownTo-Hint')
            }),
            ...walkInFields(fields)
        }),
        events: {
            tokenMoveIn: [
                { run: 'everyone', handler: toastFor('everyone') },
                { run: 'mover', handler: toastFor('mover') },
                { run: 'activeGM', handler: function (event) { if (this.once && walkedIn(this, event)) return spend(this); } }
            ]
        }
    });

    regions.registerBehavior({
        moduleId: MODULE.ID,
        name: 'postToChat',
        label: 'Post to Chat',
        icon: 'fa-solid fa-message',
        fields: (fields) => ({
            title: new fields.StringField({
                required: false, blank: true, initial: '',
                label: L('regionPostToChat-Title-Label'), hint: L('regionPostToChat-Title-Hint')
            }),
            text: longText(fields, {
                required: false, blank: true, initial: '',
                label: L('regionPostToChat-Text-Label'), hint: L('regionPostToChat-Text-Hint')
            }),
            icon: new fields.StringField({
                required: false, blank: true, initial: 'fa-solid fa-message',
                label: L('regionPostToChat-Icon-Label'), hint: L('regionPostToChat-Icon-Hint')
            }),
            postedTo: new fields.StringField({
                required: true, blank: false, initial: 'everyone',
                choices: { everyone: 'Everyone at the table', mover: 'Only the player who walked in (and the GM)' },
                label: L('regionPostToChat-PostedTo-Label'), hint: L('regionPostToChat-PostedTo-Hint')
            }),
            ...walkInFields(fields)
        }),
        events: { tokenMoveIn: { run: 'activeGM', handler: postToChatOnWalkIn } }
    });
}
