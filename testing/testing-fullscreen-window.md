# Fullscreen Window — verification owed

**Proven:** the fullscreen base and Request a Roll's Cinematic mode on it, single client. The surface
covers and blocks, the stage chain runs, entrances play, and the band, plates, VS, and cards render and
behave. Confirmed live by the author.

**Not proven:** everything below. Mostly the paths a single client never reaches — the second client, the
exit chain, and the theme's per-roll-type mapping actually selecting what it names.

The harness covers what can be asserted: **Fullscreen Window** in `testing/test-harness.js` has headless
checks for the API surface, the stage chain, item seeding, the singleton, the scroll lock, and the theme
constants, plus a tuner for the timings. Run those first — everything here is what a harness cannot judge.

Delete each item as it passes. Delete the file when it is empty, and delete
`documentation/plans/plan-fullscreen-window.md` with it.

---

## Exits

Built and never seen. Until this section passes, assume exits do not work.

- [ ] A cinematic that ends on its own (every card rolled) plays its exit: items leave first, then the
      content, then the panel, then the surface fades. Not a single flat fade of everything at once —
      that is the symptom of the exit chain being skipped.
- [ ] Escape and the close X play the same exit rather than cutting straight to nothing.
- [ ] `slide` and `drop` exit through the edge their items arrived from, and do **not** bounce on the way
      out.
- [ ] Nothing flashes back to full opacity between the exit finishing and the element leaving the DOM.
      That gap is what an inline `style.opacity` on the overlay used to cause.

## Direction and pairing

- [ ] `slide`, contested: challengers come from the left, defenders from the right, and the two
      **innermost** cards land together, with the pairs working outward from the VS.
- [ ] No card flies over one already parked. Each arrival stops short of the last.
- [ ] `slam`, contested: the two sides mirror — they spin opposite ways and arc in from their own side,
      rather than both sweeping the same direction.
- [ ] Non-contested: everything arrives from the left, in one run.
- [ ] A lopsided contest — five against one — still pairs sensibly and does not leave one side waiting
      through the other.

## Presets and the theme

- [ ] Each roll type opens with the entrance its `ANIM*` constant names. Change one in
      `themes/request-roll/theme-requestroll.json`, reload, and confirm that roll type alone changed.
- [ ] `ANIMSKILLCHECK` is `random`: several skill checks in a row give different entrances.
- [ ] A `random` window **exits the way it entered** — a surface that slid in does not drop out.
- [ ] Set an `ANIM*` value to nonsense. That roll type falls back to `fade` and nothing throws.
- [ ] Banner and entrance always agree on roll type: a saving throw shows the saving throw's banner and
      the saving throw's entrance, never one of each.

## Reduced motion

- [ ] With the OS setting on, every preset collapses to a plain fade. Nothing slams, slides, drops,
      spins, drifts, or glints, and **nothing is invisible** — the failure mode here is content that
      never appears, not content that fails to move.

## Two clients

Nothing since the Application V2 conversion has been exercised with a second client connected.

- [ ] GM opens a cinematic; the player's client shows the same surface with the same entrance.
- [ ] A **player** closes it: it closes for that player only. The GM's and any other player's stay up.
- [ ] A **GM** closes it: it closes everywhere.
- [ ] Player A closes theirs, then rolls from the chat card row. The card updates **and** the still-open
      cinematics on the other clients fill in A's result and complete the sequence.
- [ ] When the sequence ends by itself, each client closes its own surface. Watch the second client's
      console for a double close or an error — no close message should be broadcast for that path.
- [ ] Two GMs connected: one closes, and the close is not echoed back around.

## Stacking and Dice So Nice

- [ ] Dice So Nice dice roll **above** the cinematic and are visible for the whole throw.
- [ ] Nothing else shows through: sidebar, hotbar, scene navigation, the Blacksmith menubar and combat
      bar are all covered and dimmed, and a pin-placement preview or an initiative drag ghost started
      before the surface opened stays behind it.
- [ ] The band reaches both screen edges with no gap, and the document does not scroll behind the
      surface.

---

## Probes

Paste into the console with a surface open. Both are single lines on purpose — a multi-line paste is
fine, but pasting a **result** back in is not: console output starting with `{` is parsed as a block, so
the first `"key":` throws `Unexpected token ':'`. That error means a result got pasted, not that anything
is wrong.

### Stacking — "something is showing through"

Lists every element painting at or above the surface. A correct run reports nothing.

```js
(()=>{const a=document.querySelector('.blacksmith-window-fullscreen');if(!a)return console.warn('No fullscreen surface open.');const az=parseInt(getComputedStyle(a).zIndex,10)||0;const r=a.getBoundingClientRect();console.log(`surface z-index ${az} | rect ${Math.round(r.width)}x${Math.round(r.height)} @ ${Math.round(r.left)},${Math.round(r.top)} | viewport ${innerWidth}x${innerHeight}`);const above=[...document.querySelectorAll('body *')].filter(e=>{if(e===a||a.contains(e))return false;const s=getComputedStyle(e);if(s.position==='static'||s.zIndex==='auto')return false;if((parseInt(s.zIndex,10)||0)<az)return false;const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&s.visibility!=='hidden'&&s.display!=='none'}).map(e=>({el:'#'+(e.id||'')+'.'+(typeof e.className==='string'?e.className.split(' ')[0]:''),z:getComputedStyle(e).zIndex}));console.table(above.length?above:[{el:'nothing paints above the surface',z:'-'}]);})()
```

### Stage order — "one item animates and the rest snap into place"

Prints the preset, both totals, and each item's group, index, and finish time. The total must outlast the
latest finish; if it does not, `data-fs-entered` is truncating the entrance.

```js
(()=>{const a=document.querySelector('.blacksmith-window-fullscreen');if(!a)return console.warn('No fullscreen surface open.');const cs=getComputedStyle(a);const ms=v=>{v=String(v).trim();return v.endsWith('ms')?parseFloat(v):v.endsWith('s')?parseFloat(v)*1000:parseFloat(v)||0};const total=ms(cs.getPropertyValue('--fs-stage-total'));const rows=[...a.querySelectorAll('[data-fs-stage="items"]')].map(el=>{const s=getComputedStyle(el);const d=(parseFloat(s.animationDelay)||0)*1000,u=(parseFloat(s.animationDuration)||0)*1000;return{from:el.closest('[data-fs-from]')?.dataset.fsFrom??'(none)',index:el.style.getPropertyValue('--fs-index'),delay:Math.round(d),finish:Math.round(d+u)}});console.log(`preset ${a.dataset.fsAnimation} | entered ${a.dataset.fsEntered??'no'} | in ${Math.round(total)}ms | out ${Math.round(ms(cs.getPropertyValue('--fs-exit-total')))}ms`);console.table(rows);const last=Math.max(0,...rows.map(r=>r.finish));console.log(total+1>=last?`OK: total covers the last item (${last}ms)`:`TRUNCATED: last item finishes ${last}ms but the total is ${Math.round(total)}ms`);})()
```

Worth ruling out before reading too much into either: Blacksmith's own world CSS editor (`updateCSS` in
`scripts/manager-sockets.js`) can inject rules that reach these elements.
