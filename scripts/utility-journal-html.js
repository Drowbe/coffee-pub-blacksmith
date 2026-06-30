// ==================================================================
// Foundry journal HTML helpers (ProseMirror-compatible lists)
// ==================================================================
//
// Foundry v13 journal pages use ProseMirror. List items should contain
// block nodes (usually <p>), not bare text nodes:
//   <ul><li><p>Item</p></li></ul>
// Bare <li>text</li> often breaks WYSIWYG bullets until open + save.

/**
 * Escape text for HTML text nodes (not for strings that already contain safe HTML).
 * @param {string} text
 * @returns {string}
 */
export function escapeJournalHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * True when the string appears to include intentional HTML markup.
 * @param {string} value
 * @returns {boolean}
 */
export function isJournalHtmlFragment(value) {
    return /<\s*[a-z][\s\S]*>/i.test(String(value ?? ''));
}

/**
 * Wrap list item body in <p> when it is not already block-wrapped.
 * @param {string} innerHtml - escaped plain text or trusted HTML fragment
 * @returns {string}
 */
export function wrapListItemParagraph(innerHtml) {
    const body = String(innerHtml ?? '').trim();
    if (!body) return '';
    if (/^\s*<(p|h[1-6]|blockquote|ul|ol|div)\b/i.test(body)) {
        return body;
    }
    return `<p>${body}</p>`;
}

/**
 * One ProseMirror-friendly list item.
 * @param {string} innerHtml
 * @returns {string}
 */
export function buildFoundryListItem(innerHtml) {
    const wrapped = wrapListItemParagraph(innerHtml);
    if (!wrapped) return '';
    return `<li>${wrapped}</li>`;
}

/**
 * Bullet list in Foundry journal editor shape.
 * @param {string[]} items
 * @param {(item: string) => string} [formatItem] - return HTML for inside <p>
 * @returns {string}
 */
export function buildFoundryBulletList(items, formatItem) {
    const list = Array.isArray(items) ? items : [];
    const formatter = typeof formatItem === 'function' ? formatItem : (item) => {
        const s = String(item ?? '').trim();
        return isJournalHtmlFragment(s) ? s : escapeJournalHtml(s);
    };
    const lis = list
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .map((item) => buildFoundryListItem(formatter(item)))
        .filter(Boolean);
    if (!lis.length) return '';
    return `<ul>\n${lis.join('\n')}\n</ul>`;
}

/**
 * Labelled bullet: <strong>Label</strong> - detail
 * @param {string} label
 * @param {string} detail
 * @returns {string}
 */
export function buildFoundryLabelBullet(label, detail) {
    const l = escapeJournalHtml(label);
    const d = isJournalHtmlFragment(detail) ? detail : escapeJournalHtml(detail);
    return buildFoundryListItem(`<strong>${l}</strong> - ${d}`);
}

/**
 * Section label followed by a bullet list (conversations snapshot pattern).
 * @param {string} label
 * @param {string[]} items
 * @returns {string}
 */
export function buildFoundryLabeledSection(label, items) {
    const list = buildFoundryBulletList(items);
    if (!list) return '';
    return `<p><strong>${escapeJournalHtml(label)}</strong></p>\n${list}`;
}

/**
 * Breadcrumb line as Foundry stores it after edit.
 * @param {string[]} parts - non-empty segments in order
 * @returns {string}
 */
export function buildFoundryBreadcrumb(parts) {
    const segments = (Array.isArray(parts) ? parts : [])
        .map((p) => String(p ?? '').trim())
        .filter(Boolean);
    if (!segments.length) return '';
    const text = segments.map(escapeJournalHtml).join(' &gt; ');
    return `<p><strong>${text}</strong></p>`;
}

/**
 * Insert spacer markup before top-level headings so section breaks survive Foundry's
 * editor. Foundry's TinyMCE strips empty `<p></p>`, so we emit `<p>&nbsp;</p>` (a real
 * non-breaking space), which it preserves.
 * - Major break before each top-level H1/H2: `<p>&nbsp;</p><hr><p>&nbsp;</p>`
 * - One spacer before each top-level H3–H6 (normal section breaks)
 * Headings nested inside other blocks (e.g. <h4> inside a narrative-card <blockquote>) are
 * left untouched, and the very first element gets no leading spacers.
 * @param {string} html
 * @returns {string}
 */
export function applyJournalHeadingSpacing(html) {
    const input = String(html ?? '').trim();
    if (!input || typeof DOMParser === 'undefined') return input;

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="journal-root">${input}</div>`, 'text/html');
    const root = doc.getElementById('journal-root');
    if (!root) return input;

    const spacer = () => {
        const p = doc.createElement('p');
        p.innerHTML = '&nbsp;';
        return p;
    };

    for (const el of Array.from(root.children)) {
        if (!/^H[1-6]$/.test(el.tagName)) continue;
        // No leading blank lines at the very top of the page.
        if (!el.previousElementSibling) continue;
        const nodes = (el.tagName === 'H1' || el.tagName === 'H2')
            ? [spacer(), doc.createElement('hr'), spacer()]
            : [spacer()];
        for (const node of nodes) {
            root.insertBefore(node, el);
        }
    }

    return root.innerHTML;
}

const BLOCK_IN_LI = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'UL', 'OL', 'DIV', 'TABLE', 'HR', 'IMG'
]);

/**
 * Normalize imported/generated journal HTML toward ProseMirror expectations.
 * - Wrap bare <li> text in <p>
 * - Wrap orphan <li> siblings in <ul>
 * @param {string} html
 * @returns {string}
 */
export function normalizeFoundryJournalHtml(html) {
    const input = String(html ?? '').trim();
    if (!input || typeof DOMParser === 'undefined') return input;

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="journal-root">${input}</div>`, 'text/html');
    const root = doc.getElementById('journal-root');
    if (!root) return input;

    const elementNode = 1;

    function liHasBlockChild(li) {
        return Array.from(li.childNodes).some((node) => {
            if (node.nodeType !== elementNode) return false;
            const tag = node.tagName;
            return BLOCK_IN_LI.has(tag) || tag === 'UL' || tag === 'OL';
        });
    }

    function wrapLiContent(li) {
        if (liHasBlockChild(li)) return;
        const p = doc.createElement('p');
        while (li.firstChild) {
            p.appendChild(li.firstChild);
        }
        if (p.textContent?.trim() || p.querySelector('img, br')) {
            li.appendChild(p);
        }
    }

    root.querySelectorAll('li').forEach(wrapLiContent);

    // Orphan <li> elements (not inside ul/ol) → wrap in <ul>
    const orphanLis = Array.from(root.querySelectorAll('li')).filter((li) => {
        const parent = li.parentElement;
        return parent && parent.tagName !== 'UL' && parent.tagName !== 'OL';
    });
    if (orphanLis.length) {
        const groups = [];
        let group = [];
        for (const li of orphanLis) {
            if (!group.length) {
                group.push(li);
                continue;
            }
            const prev = group[group.length - 1];
            if (li.previousElementSibling === prev) {
                group.push(li);
            } else {
                groups.push(group);
                group = [li];
            }
        }
        if (group.length) groups.push(group);
        for (const liGroup of groups) {
            const ul = doc.createElement('ul');
            liGroup[0].parentNode.insertBefore(ul, liGroup[0]);
            for (const li of liGroup) {
                ul.appendChild(li);
            }
        }
    }

    return root.innerHTML;
}
