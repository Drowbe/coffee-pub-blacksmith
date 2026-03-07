// ==================================================================
// ===== HERALD SETTINGS ============================================
// ==================================================================

import { MODULE } from './const.js';

const WORKFLOW_GROUP = 'run-the-game';

function registerHeader(id, labelKey, hintKey, level = 'H3') {
    game.settings.register(MODULE.ID, 'heading' + level + id, {
        name: MODULE.ID + '.' + labelKey,
        hint: MODULE.ID + '.' + hintKey,
        scope: 'world',
        config: true,
        default: '',
        type: String,
        group: WORKFLOW_GROUP
    });
}

export function registerSettings() {
    registerHeader('BroadcastGeneral', 'headingH3BroadcastGeneral-Label', 'headingH3BroadcastGeneral-Hint', 'H3');

    game.settings.register(MODULE.ID, 'enableBroadcast', {
        name: MODULE.ID + '.enableBroadcast-Label',
        hint: MODULE.ID + '.enableBroadcast-Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        type: Boolean,
        default: false,
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastUserId', {
        name: MODULE.ID + '.broadcastUserId-Label',
        hint: MODULE.ID + '.broadcastUserId-Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        type: String,
        default: '',
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastAnimationDuration', {
        name: MODULE.ID + '.broadcastAnimationDuration-Label',
        hint: MODULE.ID + '.broadcastAnimationDuration-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        default: 500,
        range: { min: 100, max: 2000, step: 100 },
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastFollowDistanceThreshold', {
        name: MODULE.ID + '.broadcastFollowDistanceThreshold-Label',
        hint: MODULE.ID + '.broadcastFollowDistanceThreshold-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        default: 1,
        range: { min: 0.1, max: 10, step: 0.1 },
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastFollowThrottleMs', {
        name: MODULE.ID + '.broadcastFollowThrottleMs-Label',
        hint: MODULE.ID + '.broadcastFollowThrottleMs-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        default: 100,
        range: { min: 0, max: 1000, step: 10 },
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastAutoCloseWindows', {
        name: MODULE.ID + '.broadcastAutoCloseWindows-Label',
        hint: MODULE.ID + '.broadcastAutoCloseWindows-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Boolean,
        default: true,
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastAutoCloseDelaySeconds', {
        name: MODULE.ID + '.broadcastAutoCloseDelaySeconds-Label',
        hint: MODULE.ID + '.broadcastAutoCloseDelaySeconds-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        default: 3,
        range: { min: 3, max: 20, step: 1 },
        group: WORKFLOW_GROUP
    });

    registerHeader('broadcastUI', 'headingH3BroadcastUI-Label', 'headingH3BroadcastUI-Hint', 'H3');

    game.settings.register(MODULE.ID, 'broadcastHideBackground', {
        name: MODULE.ID + '.broadcastHideBackground-Label',
        hint: MODULE.ID + '.broadcastHideBackground-Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        type: Boolean,
        default: true,
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastHideInterfaceLeft', {
        name: MODULE.ID + '.broadcastHideInterfaceLeft-Label',
        hint: MODULE.ID + '.broadcastHideInterfaceLeft-Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        type: Boolean,
        default: true,
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastHideInterfaceMiddle', {
        name: MODULE.ID + '.broadcastHideInterfaceMiddle-Label',
        hint: MODULE.ID + '.broadcastHideInterfaceMiddle-Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        type: Boolean,
        default: true,
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastHideInterfaceRight', {
        name: MODULE.ID + '.broadcastHideInterfaceRight-Label',
        hint: MODULE.ID + '.broadcastHideInterfaceRight-Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        type: Boolean,
        default: true,
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastHideNotifications', {
        name: MODULE.ID + '.broadcastHideNotifications-Label',
        hint: MODULE.ID + '.broadcastHideNotifications-Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        type: Boolean,
        default: true,
        group: WORKFLOW_GROUP
    });

    registerHeader('broadcastModeConfiguration', 'headingH3BroadcastModeConfiguration-Label', 'headingH3BroadcastModeConfiguration-Hint', 'H3');

    game.settings.register(MODULE.ID, 'broadcastMode', {
        name: MODULE.ID + '.broadcastMode-Label',
        hint: MODULE.ID + '.broadcastMode-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: String,
        default: 'spectator',
        choices: {
            'spectator': 'Spectator',
            'combat': 'Combat',
            'combatant': 'Combatant',
            'gmview': 'GM View',
            'manual': 'Manual',
            'mapview': 'Map View'
        },
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastFollowTokenId', {
        name: 'Broadcast Follow Token Id',
        hint: 'Internal setting for Player View follow mode',
        scope: 'world',
        config: false,
        requiresReload: false,
        type: String,
        default: ''
    });

    game.settings.register(MODULE.ID, 'broadcastFollowViewFill', {
        name: MODULE.ID + '.broadcastFollowViewFill-Label',
        hint: MODULE.ID + '.broadcastFollowViewFill-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        default: 20,
        range: { min: 1, max: 100, step: 1 },
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastCombatViewFill', {
        name: MODULE.ID + '.broadcastCombatViewFill-Label',
        hint: MODULE.ID + '.broadcastCombatViewFill-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        default: 15,
        range: { min: 1, max: 100, step: 1 },
        group: WORKFLOW_GROUP
    });

    game.settings.register(MODULE.ID, 'broadcastSpectatorPartyBoxFill', {
        name: MODULE.ID + '.broadcastSpectatorPartyBoxFill-Label',
        hint: MODULE.ID + '.broadcastSpectatorPartyBoxFill-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        default: 70,
        range: { min: 1, max: 100, step: 1 },
        group: WORKFLOW_GROUP
    });
}
