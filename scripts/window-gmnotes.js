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
import { GMNotesManager } from './manager-gmnotes.js';
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

    constructor(options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id = `${APP_ID}-${foundry.utils.randomID().slice(0, 8)}`;
        if (options.title) {
            opts.window = foundry.utils.mergeObject({ title: `GM Notes — ${options.title}` }, opts.window ?? {});
        }
        super(opts);
        this.targetUuid = options.uuid ?? null;
        this.sectionModuleId = options.moduleId ?? null;
        this.sectionId = options.sectionId ?? null;
        this.sectionLabel = options.sectionLabel ?? null;
        this.targetDocument = null;
        this._editor = null;
        this._autosaveTimer = null;
        this._pendingHtml = null;
        this._lastSavedHtml = null;
        this._writeChain = Promise.resolve();
    }

    async getData() {
        this.targetDocument = await GMNotesManager._resolveDocAsync(this.targetUuid);
        this.writeCapability = await GMNotesManager.canSet(this.targetDocument ?? this.targetUuid);
        const warning = this.writeCapability.allowed
            ? ''
            : `<div class="blacksmith-gm-notes-write-warning">
                <i class="fa-solid fa-lock"></i>
                <span>${foundry.utils.escapeHTML(this.writeCapability.message)}</span>
            </div>`;
        const saveDisabled = this.writeCapability.allowed ? '' : ' disabled aria-disabled="true"';
        return {
            appId: this.id,
            showOptionBar: false,
            showHeader: false,
            showTools: false,
            showActionBar: true,
            bodyContent: `${warning}<div class="blacksmith-notes-editor-host"></div>`,
            actionBarLeft: '<button type="button" class="blacksmith-window-btn-secondary" data-action="gm-notes-cancel"><i class="fas fa-xmark"></i> Close</button>',
            actionBarRight: `<button type="button" class="blacksmith-window-btn-primary" data-action="gm-notes-save"${saveDisabled}><i class="fas fa-floppy-disk"></i> Save &amp; Close</button>`
        };
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        const root = this._getRoot();
        if (!root || !this.targetUuid) return;
        this.targetDocument ??= await GMNotesManager._resolveDocAsync(this.targetUuid);
        root.querySelector('[data-action="gm-notes-save"]')
            ?.addEventListener('click', (event) => {
                event.preventDefault();
                void this._save();
            });
        root.querySelector('[data-action="gm-notes-cancel"]')
            ?.addEventListener('click', (event) => {
                event.preventDefault();
                void this.close();
            });
        if (this.writeCapability?.allowed) await this._mountEditor(root);
        else await this._renderReadOnly(root);
    }

    async _renderReadOnly(root) {
        const host = root.querySelector('.blacksmith-notes-editor-host');
        if (!host) return;
        const html = await this._getCurrentHtml();
        if (!html) {
            host.innerHTML = '<p class="blacksmith-gm-notes-readonly-empty">No GM notes.</p>';
            return;
        }
        const ns = foundry?.applications?.ux?.TextEditor;
        const TE = ns?.implementation ?? ns ?? globalThis.TextEditor;
        try {
            host.innerHTML = await TE.enrichHTML(html, {
                relativeTo: this.targetDocument,
                secrets: true
            });
        } catch (_) {
            host.innerHTML = html;
        }
    }

    async _mountEditor(root) {
        const host = root.querySelector('.blacksmith-notes-editor-host');
        if (!host || host.querySelector('prose-mirror')) return;

        const Cls = foundry?.applications?.elements?.HTMLProseMirrorElement;
        if (!Cls?.create) {
            postConsoleAndNotification(MODULE.NAME, 'BLACKSMITH | NOTES ProseMirror element unavailable', '', false, true);
            return;
        }

        // Config mirrors Squire's verified-working note editor.
        const initialHtml = await this._getCurrentHtml();
        const config = {
            name: 'content',
            value: initialHtml,
            compact: true
        };
        this._lastSavedHtml = initialHtml;
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

        // ProseMirror can emit change events on every keystroke. Coalesce them
        // so rich-text editing does not issue overlapping document updates.
        editor.addEventListener('change', (ev) => {
            ev.stopPropagation();
            this._scheduleAutosave(editor.value ?? '');
        });

        host.replaceChildren(editor);
        this._editor = editor;
    }

    async _save() {
        this._pendingHtml = this._editor?.value ?? '';
        const saved = await this._flushAutosave();
        if (saved) return this.close();
        return null;
    }

    _scheduleAutosave(html) {
        if (html === this._lastSavedHtml) return;
        this._pendingHtml = html;
        if (this._autosaveTimer != null) window.clearTimeout(this._autosaveTimer);
        this._autosaveTimer = window.setTimeout(() => {
            this._autosaveTimer = null;
            void this._flushAutosave();
        }, 350);
    }

    async _flushAutosave() {
        if (this._autosaveTimer != null) {
            window.clearTimeout(this._autosaveTimer);
            this._autosaveTimer = null;
        }
        if (this._pendingHtml == null || this._pendingHtml === this._lastSavedHtml) {
            this._pendingHtml = null;
            return true;
        }
        const html = this._pendingHtml;
        this._pendingHtml = null;
        this._writeChain = this._writeChain.then(async () => {
            const saved = await this._writeHtml(html);
            if (saved) this._lastSavedHtml = html;
            else if (this._pendingHtml == null) this._pendingHtml = html;
            return saved;
        });
        return this._writeChain;
    }

    async close(options = {}) {
        if (this._editor && this.writeCapability?.allowed) {
            const current = this._editor.value ?? '';
            if (current !== this._lastSavedHtml) this._pendingHtml = current;
            await this._flushAutosave();
        }
        if (this._autosaveTimer != null) {
            window.clearTimeout(this._autosaveTimer);
            this._autosaveTimer = null;
        }
        this._editor = null;
        return super.close(options);
    }

    async _getCurrentHtml() {
        const target = this.targetDocument ?? this.targetUuid;
        if (this.sectionModuleId && this.sectionId) {
            return (await GMNotesManager.getSection(target, this.sectionModuleId, this.sectionId))?.html ?? '';
        }
        return GMNotesManager.getHtmlAsync(target);
    }

    async _writeHtml(html) {
        const target = this.targetDocument ?? this.targetUuid;
        if (this.sectionModuleId && this.sectionId) {
            return GMNotesManager.setSection(target, this.sectionModuleId, this.sectionId, {
                label: this.sectionLabel ?? this.sectionId,
                html,
                editable: true
            });
        }
        return GMNotesManager.setNote(target, { html });
    }
}
