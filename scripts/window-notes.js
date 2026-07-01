// ==================================================================
// ===== WINDOW-NOTES – GM Notes editor window (AppV2) ==============
// ==================================================================
// The single canonical edit surface for GM Notes on ANY document.
// Opened with a target document UUID; mounts a real ProseMirror editor
// in a clean context (no host sheet to fight), saves via NotesAPI.
//
// Deliberately does NOT use AppV2 `actions`: the ProseMirror toolbar
// uses data-action="save"/"bold"/... which would collide. Buttons wire
// up with explicit listeners instead (same reason Squire's note window
// avoids AppV2 actions).
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { NotesAPI } from './api-notes.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const APP_ID = 'blacksmith-gm-notes-window';

export class NotesWindow extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: APP_ID,
            classes: ['blacksmith-gm-notes-window'],
            position: { width: 540, height: 460 },
            window: { title: 'GM Notes', resizable: true, minimizable: true, icon: 'fas fa-feather' }
        }
    );

    static PARTS = {
        body: { template: `modules/${MODULE.ID}/templates/window-notes.hbs` }
    };

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        // Unique instance id so multiple notes can be open at once.
        opts.id = `${APP_ID}-${foundry.utils.randomID().slice(0, 8)}`;
        if (options.title) {
            opts.window = foundry.utils.mergeObject({ title: `GM Notes — ${options.title}` }, opts.window ?? {});
        }
        super(opts);
        this.targetUuid = options.uuid ?? null;
        this._editor = null;
    }

    async _prepareContext(options = {}) {
        const base = await super._prepareContext?.(options) ?? {};
        return foundry.utils.mergeObject(base, { appId: this.id });
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        const root = this.element;
        if (!root || !this.targetUuid) return;
        this._mountEditor(root);
        root.querySelector('.blacksmith-notes-save')?.addEventListener('click', () => this._save());
        root.querySelector('.blacksmith-notes-cancel')?.addEventListener('click', () => this.close());
    }

    _mountEditor(root) {
        const host = root.querySelector('.blacksmith-notes-editor-host');
        if (!host) return;

        const Cls = foundry?.applications?.elements?.HTMLProseMirrorElement;
        if (!Cls?.create) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | NOTES ProseMirror element unavailable', '', false, true);
            return;
        }

        const editor = Cls.create({
            value: NotesAPI.getHtml(this.targetUuid) || '',
            documentUUID: this.targetUuid,
            compact: false
        });
        editor.classList.add('blacksmith-notes-editor');

        // Force editable (the element otherwise mounts read-only) — the fix
        // proven in Squire's note window. Belt-and-suspenders on `open`.
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
            await NotesAPI.set(this.targetUuid, { html: editor.value ?? '' });
        });

        host.replaceChildren(editor);
        this._editor = editor;
    }

    async _save() {
        await NotesAPI.set(this.targetUuid, { html: this._editor?.value ?? '' });
        this.close();
    }
}
