# Plan — Toast styles, persistence hardening, GM Send Toast tool

**Status: Implemented (all phases) — pending live verification** (2026-07-19). Content already
distributed: docs updated (api-toast.md, architecture-toast.md), CHANGELOG entry written, TODO
noted. Delete this file once the author's live verification passes.

## Decisions (author, 2026-07-19)
- **Styles: both axes** — semantic set now (`info`/`success`/`warning`/`danger`/`announcement`) as
  CSS classes on the existing dark look; colors are hardcoded hex for now and get mapped onto
  design-system tokens when that effort lands.
- **Persistence: `duration: 0` toasts are exempt from stack-cap eviction** — only ×, `stackKey`
  replacement, or programmatic removal ends them. The cap applies to transient toasts only.
- **GM send tool echo: small confirmation** — players get the large styled toast; the sending GM
  gets a small "Sent to …" confirmation toast.

## Phases
1. **Primitive** (`api-toast.js`, `styles/toast.css`): `style` + `size: 'large'` config keys
   (whitelisted → CSS classes, class-only mechanism); persistent-exemption in the cap logic;
   `getActive()` gains `style`/`size`/`persistent`.
2. **Targeted internal relay** (`api-toast.js`, `manager-sockets.js`): `sendToastToUsers(config,
   userIds)` — internal like `broadcastToast`; recipients ride the payload, the `showToast`
   handler shows only on listed clients (receipt-side targeting per the socket privacy rule;
   content is non-secret by contract). Public `send()` remains gated on the socket rewrite.
3. **GM tool** (`window-toast-send.js` new, `styles/window-toast-send.css` new + `@import`,
   `api-menubar.js`): party-bar item (GM-only) → window with recipient checkboxes (active users
   preselected, offline disabled), title/subtitle, style dropdown, image path + FilePicker,
   duration (incl. "until closed"), Send. Sends `size: 'large'` via the relay; GM confirmation
   toast on success.
4. **Docs + CHANGELOG**: api-toast.md (config keys, persistence semantics), architecture-toast.md
   (cap exemption, targeted relay, GM tool as internal consumer).

## Verification (travels to TODO/CHANGELOG)
- Styles: console-show each style/size on one client; visual check.
- Persistence: show a `duration: 0` toast, then 6 transient toasts → persistent one survives; ×
  still closes it; `stackKey` still replaces it.
- Relay: GM sends to one of two connected players → only that player renders it; sender gets the
  confirmation; non-recipient sees nothing.
- Tool: open from party bar (GM only — not visible to players), send with style+image → recipient
  renders large styled toast with image; offline user is disabled in the picker.
