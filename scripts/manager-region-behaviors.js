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
//
// Both are declared in module.json under `documentTypes.RegionBehavior`, and registered from `init` by
// blacksmith.js once `module.api` exists. See documentation/api/api-regions.md.

import { MODULE } from './const.js';

const L = (key) => `${MODULE.ID}.${key}`;
const WHO = { player: 'A token a player owns', any: 'Any token' };

/** The `api` object, read at call time so it is the public surface a satellite would see. */
const api = () => game.modules.get(MODULE.ID)?.api;

const calloutId = (region) => `${MODULE.ID}:region:${region.id}`;

// ===== REQUEST A ROLL =====

/**
 * Post a roll request for the token that walked in. Runs on the active GM's client: the request is the GM's
 * to make, and one client posting it means one card, not one per player.
 */
async function requestRollOnWalkIn(event) {
    const token = event.data?.token;
    const actor = token?.actor;
    if (!token || !actor) return;
    if (this.who === 'player' && !actor.hasPlayerOwner) return;

    await api()?.openRequestRollDialog({
        silent: true,
        title: this.title || event.region?.name,
        initialType: this.rollType,
        initialValue: this.rollValue,
        dc: this.dc ?? undefined,
        explanation: this.explanation || undefined,
        actors: [{ tokenId: token.id, actorId: actor.id, name: token.name }]
    });
    if (this.once) await this.parent.update({ disabled: true });
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

// ===== REGISTRATION =====

/** Register Blacksmith's behaviours. Called from the `init` hook, after `module.api` is assigned. */
export function registerRegionBehaviors() {
    const regions = api()?.regions;
    if (!regions) return;

    regions.registerBehavior({
        moduleId: MODULE.ID,
        name: 'requestRoll',
        label: 'Request a Roll',
        icon: 'fa-solid fa-dice-d20',
        fields: (fields) => ({
            rollType: new fields.StringField({
                required: true, blank: false, initial: 'skill',
                choices: { skill: 'Skill', ability: 'Ability', save: 'Saving Throw', dice: 'Dice' },
                label: L('regionRequestRoll-RollType-Label'), hint: L('regionRequestRoll-RollType-Hint')
            }),
            rollValue: new fields.StringField({
                required: true, blank: false, initial: 'perception',
                label: L('regionRequestRoll-RollValue-Label'), hint: L('regionRequestRoll-RollValue-Hint')
            }),
            dc: new fields.NumberField({
                required: false, nullable: true, integer: true, min: 1, initial: 12,
                label: L('regionRequestRoll-DC-Label'), hint: L('regionRequestRoll-DC-Hint')
            }),
            title: new fields.StringField({
                required: false, blank: true, initial: '',
                label: L('regionRequestRoll-Title-Label'), hint: L('regionRequestRoll-Title-Hint')
            }),
            explanation: new fields.StringField({
                required: false, blank: true, initial: '',
                label: L('regionRequestRoll-Explanation-Label'), hint: L('regionRequestRoll-Explanation-Hint')
            }),
            who: new fields.StringField({
                required: true, blank: false, initial: 'player', choices: WHO,
                label: L('regionRequestRoll-Who-Label'), hint: L('regionRequestRoll-Who-Hint')
            }),
            once: new fields.BooleanField({
                initial: false,
                label: L('regionRequestRoll-Once-Label'), hint: L('regionRequestRoll-Once-Hint')
            })
        }),
        // Move in, not enter: `tokenEnter` also fires for a token created inside or dropped in by a teleport.
        events: { tokenMoveIn: { run: 'activeGM', handler: requestRollOnWalkIn } }
    });

    regions.registerBehavior({
        moduleId: MODULE.ID,
        name: 'showCallout',
        label: 'Show Callout',
        icon: 'fa-solid fa-message',
        fields: (fields) => ({
            title: new fields.StringField({
                required: false, blank: true, initial: '',
                label: L('regionShowCallout-Title-Label'), hint: L('regionShowCallout-Title-Hint')
            }),
            subtitle: new fields.StringField({
                required: false, blank: true, initial: '',
                label: L('regionShowCallout-Subtitle-Label'), hint: L('regionShowCallout-Subtitle-Hint')
            }),
            body: new fields.StringField({
                required: false, blank: true, initial: '',
                label: L('regionShowCallout-Body-Label'), hint: L('regionShowCallout-Body-Hint')
            }),
            icon: new fields.StringField({
                required: false, blank: true, initial: 'fa-solid fa-circle-info',
                label: L('regionShowCallout-Icon-Label'), hint: L('regionShowCallout-Icon-Hint')
            })
        }),
        // Enter and exit, not move in and out: the box follows presence, so a token placed inside or removed
        // from it is covered too.
        events: { tokenEnter: showRegionCallout, tokenExit: hideRegionCallout }
    });
}
