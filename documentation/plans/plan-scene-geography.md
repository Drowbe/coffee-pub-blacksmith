# Scene Geography and Environment

**Status: Planned — nothing implemented.** Live scaffolding. The open questions in the last section must be
settled before Workstream 3 begins; Workstream 1 can start immediately and is tracked in `TODO.md` as
"One Scene Config tab injector, registered like a toolbar tool".

**On completion:** the data model and API surface fold into `documentation/architecture/` and
`documentation/api/`, the work items become `TODO.md` entries, the cross-module contract goes to
`TODO-GLOBAL.md`, the shipped history goes to `CHANGELOG.md`, and this file is deleted. It is not an archive.

Internal only. Do not add to the `PUBLISH` list in `tools/wiki-sync.mjs`.

---

## The problem

Blacksmith knows what a scene is called and nothing about where it sits or what it is like. Three separate
facts about a place are currently scattered across three owners, and none of those owners is the scene:

1. **Geography** (realm / region / site / area) lives in four world settings and describes the campaign, not
   any particular scene.
2. **Environment** (habitat, biome) lives in Artificer's scene flags, owned by a harvesting module.
3. **Reputation** lives in a world setting keyed by scene id, mirroring scene data it does not own.

The goal is one answer to "what do we know about this place", stored on the place, readable through the API.

---

## Current state (verified against code)

### Geography is a global cursor, not a record

Four world settings, `defaultCampaignRealm / Region / Site / Area`
([settings.js:959-1001](../../scripts/settings.js#L959)), read by
[manager-campaign.js:103](../../scripts/manager-campaign.js#L103) and exposed as
`api.campaign.getGeography()`.

Consumers are prompt and journal rendering only. `buildLocationPathHint()`
([registry-json-import-journals.js:731](../../scripts/registry-json-import-journals.js#L731)) joins the four
into a breadcrumb; `applyAreaJournalGeography()` substitutes `[ADD-REALM-HERE]` and its siblings into AI
prompts; `createAreaJournalEntry` and `createLocationJournalEntry` render them into page HTML
([utility-common.js:160](../../scripts/utility-common.js#L160),
[utility-common.js:449](../../scripts/utility-common.js#L449)). The values are never persisted to a document.

Every import both reads geography and writes it back unconditionally through `saveCampaignGeography()`
([registry-json-import-journals.js:694](../../scripts/registry-json-import-journals.js#L694)) — there is no
opt-in checkbox. So the stored geography is wherever the last import was pointed, not a description of
anywhere in particular.

The Area importer carries a fifth field, `scenetitle`
([registry-json-import-journals.js:597](../../scripts/registry-json-import-journals.js#L597)). It is the only
link between a Location journal and the scene it describes, and it is a string match.

### Scenes carry one Blacksmith flag

`coffee-pub-blacksmith.pins` ([manager-pins.js](../../scripts/manager-pins.js)). There is no
`renderSceneConfig` handler anywhere in this module; the only scene UI touch is click behavior in
[manager-navigation.js](../../scripts/manager-navigation.js). Scene metadata is greenfield here.

### Environment is owned by Artificer and read raw by Minstrel

Artificer defines the vocabulary as a fixed twelve-value constant, `OFFICIAL_BIOMES`
(`coffee-pub-artificer/scripts/schema-ingredients.js:36`): MOUNTAIN, ARCTIC, PLANAR, COASTAL, SWAMP, DESERT,
UNDERDARK, FOREST, UNDERWATER, GRASSLAND, URBAN, HILL. Selections are stored at
`flags.coffee-pub-artificer.scene.habitats`, alongside twelve Artificer-specific keys — `componentTypes`,
`harvestingSkills`, `enabled`, `profile`, `harvestDC`, `gatherSpots`, `discoveryRadiusUnits`,
`discoveryBaseDC`, and five `discoveryOffset*` values (`coffee-pub-artificer/scripts/manager-scene.js:204-333`).

Minstrel reads that flag directly (`coffee-pub-minstrel/scripts/manager-automation.js:80`):

```js
const data = scene.getFlag('coffee-pub-artificer', 'scene') ?? {};
const habitats = Array.isArray(data.habitats) ? data.habitats : ...
```

gated on `isArtificerAvailable()`. Minstrel's habitat-conditioned playlist automation therefore does nothing
unless a harvesting module is installed. That is the concrete symptom of the ownership problem, and it is
also a raw cross-module flag read rather than an API call.

Minstrel lowercases and sorts on read; Artificer stores uppercase. No other sibling references habitat,
biome, or terrain — checked across all twelve.

### Artificer already pays the SceneConfig tab cost

Two parallel injectors, `_injectArtificerTab` and `_injectArtificerTabV2`, plus an `_injectingForms` WeakSet
and an `_injectPendingAppIds` set, because in v13 ApplicationV2 the tab nav is rebuilt on every render while
the tab body persists, so a naive inject double-adds
(`coffee-pub-artificer/scripts/manager-scene.js:105-233`). Roughly 150 lines of DOM surgery, re-derived from
scratch, and re-breakable by any Foundry point release. Any second module wanting a scene tab writes it again.

### Reputation is stored off-document and is not on the API

`blacksmithPartyData.scenes[sceneId] = {uuid, title, reputation}`
([manager-reputation.js:129-131](../../scripts/manager-reputation.js#L129)). The `uuid` and `title` are
denormalized copies of scene fields and can go stale on rename.

`ReputationManager` is not exposed on `module.api` — the API object at
[blacksmith.js:1004-1073](../../scripts/blacksmith.js#L1004) has no `reputation` key, and its only consumer is
the menubar ([api-menubar.js:17](../../scripts/api-menubar.js#L17)). Making reputation part of a holistic
scene view means new public surface, not just moved storage.

`TODO.md`, "Overall party reputation, for external consumers", records the defect: `getPartyReputation`
returns 0 for a scene with no entry ([manager-reputation.js:99](../../scripts/manager-reputation.js#L99)), and
0 is also the centre of the -100..+100 scale, so "neutral" and "never set" are indistinguishable and any naive
aggregate drags toward zero.

---

## The model

One flag on the Scene document, `coffee-pub-blacksmith.geography`:

```js
{
    realm: '',            // string; '' means inherit the world default
    region: '',
    site: '',
    area: '',
    environment: [],      // values from the canonical vocabulary
    reputation: null,     // -100..+100; key absent means never set
    locationUuid: null    // JournalEntryPage uuid of the Location entry, if any
}
```

Two properties of this shape are load-bearing:

- **Geography fields resolve scene flag first, world setting second.** The world settings stop being live
  state and become the seed for a scene that has not been told otherwise. This is what makes the importer
  context-aware: open a scene, launch an Area import, and the prompt prefills from where you actually are.
- **Absence is meaningful for reputation.** A missing key is "never set"; `0` is "neutral". That is exactly
  the distinction the current storage cannot make, and it turns the aggregate into an honest
  iterate-and-count.

Storage is a document flag rather than a world setting so the data travels with the scene on export,
duplicate, and compendium round-trip; needs no orphan cleanup when a scene is deleted; and does not serialize
every write through one world-setting document.

A note on Tags, since the word came up. Blacksmith should own the environment vocabulary as a shared,
reusable, labeled list, and TagWidget is a reasonable picker for it. It should not be routed through
`TagManager` storage, which keeps assignments in a world setting keyed by `{contextKey, recordId}`
([manager-tags.js:294](../../scripts/manager-tags.js#L294)) — that would take the data off the document and
lose every property above. [api-tags.md](../../documentation/api/api-tags.md) also excludes this case directly
under "When not to use it": classification that drives behavior and does not change belongs in constants.

---

## Workstreams

### 1. SceneConfig tab registration API

Independently valuable, touches no live data, and is the piece Artificer can adopt first. Mirrors the existing
`registerToolbarTool` shape ([manager-toolbar.js:1331](../../scripts/manager-toolbar.js#L1331)).

Surface, roughly: `api.registerSceneConfigTab({id, label, icon, render, save})` with an unregister and a
lookup, and Blacksmith owning the ApplicationV2 render-cycle handling that Artificer currently duplicates —
nav rebuild, body persistence, double-inject guard, form value collection.

Geography becomes the first tab registered through it. Artificer's becomes the second, and its two injectors
and both guard collections are deleted.

This is hub infrastructure rather than a feature, so it belongs here under the module boundary rules. A
Geography feature living in Blacksmith is more arguable; see open question 8.

### 2. Geography data model and API

Add the flag, the read and write helpers, and the resolution order. Change `CampaignManager.getGeography()` to
take an optional scene and resolve flag before setting. Add `api.campaign.getSceneContext(scene)` returning
the full holistic view.

Decide what `saveCampaignGeography()` does once a scene can own geography: "remember this for next time" and
"record this about this scene" stop being the same action, and the current unconditional write-back cannot
mean both.

### 3. Environment ownership move

`OFFICIAL_BIOMES` moves to Blacksmith and is exposed through the API as the canonical vocabulary. The Habitats
fieldset leaves the Artificer tab and appears in the Geography tab. Every other fieldset in Artificer's tab
stays, because component types, harvesting skills, DC thresholds, gather spots, and discovery radius only mean
anything if you are harvesting.

Artificer reads environment from the API instead of defining it. Minstrel reads the same API and drops its
`isArtificerAvailable()` gate, which makes its habitat automation work standalone — a user-visible fix, not
only a refactor.

Needs a one-time migration reading existing `flags.coffee-pub-artificer.scene.habitats` into the new flag, and
a decision on whether Artificer keeps a read-through fallback for one release.

This is a cross-module contract, so it belongs in `TODO-GLOBAL.md`, and it should not land until Artificer and
Minstrel are ready to move in the same release window.

### 4. Reputation migration

Move `blacksmithPartyData.scenes[sceneId].reputation` onto the scene flag, drop the denormalized `uuid` and
`title` mirrors, expose `api.reputation` as public surface, and resolve the aggregate question in `TODO.md`
— which becomes tractable once absence is distinguishable from neutral.

Last, and on its own. This is the only step that can lose real world data, and it needs a real one-way
migration rather than a dual-read.

**Sequencing:** 1, then 2, then 3, then 4. Workstream 1 is standalone. Workstream 3 must not start before the
vocabulary questions below are settled, because it is a contract with two other modules.

---

## Open questions

**Blocking Workstream 3.**

1. **Is the environment vocabulary a closed enum or an extensible registry?** Once Blacksmith owns the list, a
   world with a Feywild or an ashland will reasonably want to add one. But Artificer's harvest tables key off
   the fixed twelve, so an extensible list needs a defined fallback: an unknown environment yields nothing, or
   a default table, or is ignored by Artificer while still driving Minstrel. This determines whether the API
   exposes a constant or a registry, so it cannot be deferred.
2. **What is the canonical case?** Artificer stores `MOUNTAIN`; Minstrel lowercases on every read. Pick one
   canonical form, normalize on write, and stop making consumers guess.
3. **Does Artificer keep a read-through fallback for one release, or is the migration hard at ready?**

**Blocking Workstream 4.**

4. **Does reputation need to be party-keyed?** Reputation is party state, not place state. If multiple parties
   are ever in scope the shape must be `reputation: {partyId: value}` from the start, or reputation should
   stay where it is. Cheap to decide now, expensive to migrate twice.
5. **What does "overall reputation" mean** — mean of scenes with an entry, or a campaign-level value with
   scene reputation as local colour? The `TODO.md` reputation entry lists the options; this plan does not
   settle them.

**Blocking Workstream 2.**

6. **Is `locationUuid` in scope for v1, or deferred?** It is the highest-value field in the model — Location
   journals and Area scenes describe the same place and today the only join is a `scenetitle` string match —
   but it is orthogonal to everything else here and could ship separately.
7. **What happens to the unconditional write-back in `saveCampaignGeography()`** once a scene can own
   geography?

**Scope.**

8. **Where does the line sit between Blacksmith and Cartographer?** The data model, the flag, and the API are
   unambiguously hub concerns, and a tab registration API is infrastructure. A map browser or atlas window
   built on this data is a sibling's job. Worth naming now, because scene metadata attracts UI.
9. **Flat strings or a real hierarchy?** Flat realm/region/site/area matches everything that exists and is
   trivially backward compatible. Parent-scene references or per-level UUIDs would give a navigable atlas at
   much greater cost, and the stated direction of travel is pulling features out of the hub.

---

## Verification

There is no test framework, so each workstream names its live check.

**Workstream 1.** Open a scene config with only Blacksmith active: the Geography tab appears exactly once.
Close and reopen five times: still once, no duplicates. Switch tabs and back: content persists. Enable
Artificer with its tab registered through the API: both tabs appear and both save independently. Confirm the
client loads with no console errors.

**Workstream 2.** With all four world geography settings populated and a scene carrying no flag,
`api.campaign.getGeography(scene)` returns the world values. Set the flag on that scene and re-read: it
returns the scene values. Launch an Area import from that scene and confirm the prompt fields prefill from the
scene rather than the world settings. `api.campaign.getSceneContext(scene)` returns every key with the
expected types.

**Workstream 3.** On a world with existing Artificer habitats, run the migration and confirm every scene's
habitats appear unchanged in the Geography tab. Artificer gather on a migrated scene yields the same component
families as before. With Artificer disabled entirely, Minstrel's habitat-conditioned automation fires — this
is the specific regression the move exists to fix, so test it explicitly. Export a migrated scene to a
compendium, re-import it, and confirm environment survives the round-trip.

**Workstream 4.** On a world with existing per-scene reputation, run the migration and confirm the menubar
readout is unchanged for every scene that had a value. Confirm a scene that never had a value reports unset
rather than 0, and that a scene explicitly set to 0 reports neutral. Confirm the aggregate excludes unset
scenes.
