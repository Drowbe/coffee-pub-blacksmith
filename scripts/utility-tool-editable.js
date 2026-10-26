// ==================================================================
// ===== TOOL EDITABLE: TEXT THAT BECOMES A FIELD ===================
// ==================================================================
// A name or a description that reads as plain text until the user presses its pencil, then becomes a
// field, and goes back to text on Enter, blur or Escape. One delegated listener, installed once at init,
// so a satellite writes the markup and listens for `change` and wires nothing.
// See documentation/designsystem/design-components.md, "Tool window controls", and styles/window-tool-controls.css.
//
//   <span class="blacksmith-tool-editable" data-value="Group A">
//       <span class="blacksmith-tool-editable-text">Group A</span>
//       <button type="button" class="blacksmith-tool-btn is-icon blacksmith-tool-editable-edit" data-tooltip="Rename">
//           <i class="fa-solid fa-pen"></i>
//       </button>
//   </span>
//
// Options are data attributes on the root: data-multiline="true", data-placeholder, data-maxlength,
// data-required="true" (an empty value is refused and the old one kept).

const ROOT = '.blacksmith-tool-editable';
const EDIT_BUTTON = '.blacksmith-tool-editable-edit';

export class ToolEditable {
    static #installed = false;

    /** Install the delegated click listener. Safe to call more than once. */
    static initialize() {
        if (this.#installed) return;
        this.#installed = true;
        document.addEventListener('click', (event) => {
            const button = event.target?.closest?.(EDIT_BUTTON);
            const root = button?.closest(ROOT);
            if (!root) return;
            event.preventDefault();
            this.begin(root);
        });
    }

    /**
     * Is anything inside `scope` being edited right now. A window that redraws asks this first and skips the
     * redraw while it is true, so a half-typed name is not replaced from under the user.
     * @param {ParentNode} [scope=document]
     * @returns {boolean}
     */
    static isEditing(scope = document) {
        return !!scope.querySelector?.(`${ROOT}.is-editing`);
    }

    /**
     * Turn an editable into its field. Called by the pencil; call it yourself to start a rename straight
     * after creating something.
     * @param {HTMLElement} root - The `.blacksmith-tool-editable` element
     * @returns {HTMLInputElement|HTMLTextAreaElement|null} The field, or null when it is already being edited
     */
    static begin(root) {
        if (!root || root.classList.contains('is-editing')) return null;
        const text = root.querySelector('.blacksmith-tool-editable-text');
        const button = root.querySelector(EDIT_BUTTON);
        const multiline = root.dataset.multiline === 'true';
        const previous = root.dataset.value ?? text?.textContent?.trim() ?? '';

        const field = document.createElement(multiline ? 'textarea' : 'input');
        if (!multiline) field.type = 'text';
        field.className = 'blacksmith-input blacksmith-tool-editable-field';
        field.value = previous;
        if (root.dataset.placeholder) field.placeholder = root.dataset.placeholder;
        const maxLength = Number(root.dataset.maxlength);
        if (Number.isFinite(maxLength) && maxLength > 0) field.maxLength = maxLength;
        if (multiline) field.rows = Math.min(8, Math.max(2, previous.split('\n').length));

        root.classList.add('is-editing');
        root.append(field);
        field.focus();
        field.select();

        let finished = false;
        const finish = (commit) => {
            if (finished) return;
            finished = true;
            const value = multiline ? field.value.replace(/\s+$/, '') : field.value.trim();
            field.remove();
            root.classList.remove('is-editing');
            const accepted = commit && value !== previous && !(root.dataset.required === 'true' && !value);
            if (accepted) {
                root.dataset.value = value;
                if (text) text.textContent = value || root.dataset.placeholder || '';
                text?.classList.toggle('is-empty', !value);
                root.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value, previous } }));
            }
            button?.focus();
        };

        field.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                finish(false);
            } else if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                event.stopPropagation();
                finish(true);
            }
        });
        field.addEventListener('blur', () => finish(true));
        // The field's own change would reach a consumer's `change` listener as if it were ours. Ours is the
        // one dispatched on the root, once, when the value is accepted.
        field.addEventListener('change', (event) => event.stopPropagation());
        return field;
    }
}
