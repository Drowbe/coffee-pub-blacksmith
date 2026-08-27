# Plan: one participation list, owned by Blacksmith

**Status: Planned -- nothing implemented.** Live scaffolding, moved out of `TODO.md` 2026-08-27 because it is
design rather than a work item: three things have to be settled before any code is written, and siblings
depend on the answers.

**On completion:** the predicate and its setting fold into `documentation/api/api-core.md`, the cross-module
adoption goes to `TODO-GLOBAL.md`, the work items become `TODO.md` entries, shipped history goes to
`CHANGELOG.md`, and this file is deleted. It is not an archive.

Internal only. Do not add to the `PUBLISH` list in `tools/wiki-sync.mjs`.

---

## One participation list, owned by Blacksmith instead of copied per module

**The fact belongs to the hub; the behaviour belongs to each module.** A camera, stream, or bot
account is not a person: nobody clicks, nobody answers, nobody votes. That is one statement about
the account, and at least four modules need to derive different behaviour from it — toasts do not
render, voting does not count it toward quorum, Herald hides the menubar, and anything that opens a
dialog should not prompt it.

**This list has already been built twice with different homes.** `excludedUsersMenubar` was a
Blacksmith world setting and now lives in Herald (`api-menubar.js:2918`); `toastExcludedUsers` is
still here. Bibliosoph's roll announcements would be the third. The GM answers the same question
once per module, and any module that forgets blasts the capture screen. `matchUserBySetting`
(`api-core.js`) already exists, so the *mechanism* was shared long ago and the *concept* never was.

**Do not model it as a "do not send" list.** That is a behaviour, and encoding it as one is what
made it fragment. Model the account: one predicate, one world setting, consumers deciding for
themselves what it means for them.

**Keep two similar cases apart.** A passive account *cannot* interact. A person who is present but
not playing tonight — a guest, a second screen — *can*, and merely should not be counted for
decisions. One list for both means excluding the guest from toasts in order to keep them out of a
vote. Only the passive account is a standing fact; the guest case belongs to per-vote configuration
(see the voting item below).

**Orthogonal to the toast `channel`, deliberately.** Participation answers *who this person is*;
`channel` answers *what kind of thing this toast is*. The override is the intersection — a passive
account still renders a display-only announcement. Nothing about `channel` changes when this lands.

Three things to settle before writing code, because siblings will depend on the answers:

1. **The name.** It will sit in sibling source for years. `isPassive`, `isSpectator`,
   `isParticipant` — pick for how the call site reads in a consumer, not how it reads here.
2. **Migration.** `toastExcludedUsers` is configured in live worlds. Alias it, or copy its value
   into the new setting on first load; do not silently drop a GM's existing configuration.
3. **Whether Herald migrates back** to consulting the shared list rather than its own. That is
   cross-module and is tracked in `TODO-GLOBAL.md`.

*Verify:* mark an account passive, then confirm each consumer behaves without further configuration
— no toasts on the tabletop (but a bypass-channel toast still renders), no place in a vote tally,
and unanimity reached without waiting on it. Confirm a GM who had `toastExcludedUsers` set before
the change still has that user excluded afterwards.
