// ==================================================================
// ===== WINDOW-GMNOTES – GM Notes editor window ====================
// ==================================================================
// The canonical GM Notes editor. Built on Blacksmith's OWN window base
// (BlacksmithWindowBaseV2) + zone template — the same foundation Squire's
// note window uses, so the editor behaves exactly like it does there.
//
// Opened with a target document UUID; mounts a ProseMirror editor and
// saves via GMNotesAPI. Action names are prefixed (gm-notes-*) so they do
// NOT collide with the editor toolbar's own data-action="save"/"bold".
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { GMNotesAPI } from './api-gmnotes.js';
import { BlacksmithWindowBaseV2 } from './window-base.js';

const APP_ID = 'blacksmith-gm-notes-window';

export class GMNotesWindow extends BlacksmithWindowBaseV2 {

    static ROOT_CLASS = 'blacksmith-window-template-root';

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: APP_ID,
            classes: ['blacksmith-gm-notes-window'],
            position: { width: 560, height: 480 },
            window: { title: 'GM Notes', resizable: true, minimizable: true, icon: 'fas fa-feather' }
        }
    );

    static PARTS = {
        body: { template: `modules/${MODULE.ID}/templates/window-template.hbs` }
    };

    // Prefixed so the base's data-action delegation never intercepts the
    // ProseMirror toolbar's own data-action="save"/"bold"/... buttons.
    static ACTION_HANDLERS = {
        'gm-notes-save': () => GMNotesWindow._ref?._save(),
        'gm-notes-cancel': () => GMNotesWindow._ref?.close()
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = `${APP_ID}-${foundry.utils.randomID().slice(0, 8)}`;
        if (options.title) {
            opts.window = foundry.utils.mergeObject({ title: `GM Notes — ${options.title}` }, opts.window ?? {});
        }
        super(opts);
        this.targetUuid = options.uuid ?? null;
        this._editor = null;
    }

    async getData() {
        return {
            appId: this.id,
            showOptionBar: false,
            showHeader: false,
            showTools: false,
            showActionBar: true,
            bodyContent: '<div class="blacksmith-notes-editor-host"></div>',
            actionBarLeft: '<button type="button" class="blacksmith-window-btn-secondary" data-action="gm-notes-cancel"><i class="fas fa-xmark"></i> Cancel</button>',
            actionBarRight: '<button type="button" class="blacksmith-window-btn-primary" data-action="gm-notes-save"><i class="fas fa-floppy-disk"></i> Save &amp; Close</button>'
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        const root = this._getRoot();
        if (!root || !this.targetUuid) return;
        this._mountEditor(root);
    }

    _mountEditor(root) {
        const host = root.querySelector('.blacksmith-notes-editor-host');
        if (!host || host.querySelector('prose-mirror')) return;

        const Cls = foundry?.applications?.elements?.HTMLProseMirrorElement;
        if (!Cls?.create) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | NOTES ProseMirror element unavailable', '', false, true);
            return;
        }

        // Config mirrors Squire's verified-working note editor.
        const config = {
            name: 'content',
            value: GMNotesAPI.getHtml(this.targetUuid) || '',
            compact: true
        };
        if (this.targetUuid) config.documentUUID = this.targetUuid;

        const editor = Cls.create(config);
        editor.classList.add('blacksmith-notes-editor');
        editor.disabled = false;
        editor.removeAttribute('readonly');
        editor.addEventListener('open', () => {
            editor.disabled = false;
            editor.removeAttribute('readonly');
            requestAnimationFrame(() => {
                const content = editor.querySelector('.editor-content');
                content?.setAttribute('contenteditable', 'true');
                content?.focus();
            });
        }, { once: true });

        // The editor toolbar's own Save (floppy) autosaves without closing.
        editor.addEventListener('change', async (ev) => {
            ev.stopPropagation();
            await GMNotesAPI.set(this.targetUuid, { html: editor.value ?? '' });
        });

        host.replaceChildren(editor);
        this._editor = editor;
    }

    async _save() {
        await GMNotesAPI.set(this.targetUuid, { html: this._editor?.value ?? '' });
        this.close();
    }
}
