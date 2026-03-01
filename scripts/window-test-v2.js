/**
 * Test Application V2 window — for tweaking zones and layout before other modules use the pattern.
 * Extends BlacksmithWindowBaseV2; registered as 'blacksmith-test-window'. Open via toolbar or api.openWindow('blacksmith-test-window').
 */

import { MODULE } from './const.js';
import { BlacksmithWindowBaseV2 } from './window-base-v2.js';

const TEST_APP_ID = 'blacksmith-test-window';

export class BlacksmithTestWindowV2 extends BlacksmithWindowBaseV2 {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: TEST_APP_ID,
            classes: ['blacksmith-window-test-v2'],
            position: { width: 700, height: 500 },
            window: { title: 'Test V2 Window', resizable: true, minimizable: true }
        }
    );

    static PARTS = {
        body: {
            template: `modules/${MODULE.ID}/templates/window-template.hbs`
        }
    };

    static ACTION_HANDLERS = {
        reset: BlacksmithTestWindowV2._actionReset,
        apply: BlacksmithTestWindowV2._actionApply
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = opts.id ?? `${TEST_APP_ID}-${foundry.utils.randomID().slice(0, 8)}`;
        super(opts);
    }

    async getData() {
        return {
            appId: this.id,
            windowTitle: 'Test V2 Window',
            subtitle: 'Application V2 zone contract — use getData() to fill option bar, header, body, action bar.',
            headerIcon: 'fa-solid fa-flask',
            headerRight: '<span class="blacksmith-window-template-cache-status">Header right</span>',
            optionBarLeft: '<span class="blacksmith-window-template-cache-status">Option bar left</span>',
            optionBarRight: '<span class="blacksmith-window-template-cache-status">Option bar right</span>',
            toolsContent: '<span class="blacksmith-window-template-cache-status">Tools — search, filters, progress bars, etc.</span>',
            bodyContent: '<p>Body content — set <code>bodyContent</code> from getData() (HTML string).</p>',
            actionBarLeft: '<button type="button" class="blacksmith-window-template-btn-secondary" data-action="reset"><i class="fa-solid fa-database"></i> Reset</button><span class="blacksmith-window-template-cache-status">Status message</span>',
            actionBarRight: '<button type="button" class="blacksmith-window-template-btn-secondary" data-action="apply"><i class="fa-solid fa-eraser"></i> Apply</button><button type="button" class="blacksmith-window-template-btn-primary" data-action="apply"><i class="fa-solid fa-wand-magic-sparkles"></i> Primary</button>'
        };
    }

    static _actionReset(event, target) {
        const w = BlacksmithTestWindowV2._ref;
        if (!w) return;
        event?.preventDefault?.();
        w.render();
    }

    static _actionApply(event, target) {
        const w = BlacksmithTestWindowV2._ref;
        if (!w) return;
        event?.preventDefault?.();
        ui.notifications.info('Apply clicked');
        w.render();
    }
}
