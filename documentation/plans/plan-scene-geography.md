# Scene Geography and Habitat

**Status: Workstreams 1 and 2 implemented and verified live (2026-08-31). Workstream 3 in progress and
GATING the 13.22.0 release. Workstream 4 planned.** Live scaffolding.

**Why Workstream 3 gates the release:** habitat is a property of geography and Blacksmith owns it --
that is the founding reason for this effort, and Artificer is a consumer of habitat information rather
than its owner. Shipping the geography tab while Artificer still renders its own Habitats fieldset puts
two identical twelve-item lists on one Scene Config sheet, only one of which does anything. The
duplication resolves by the consumer's field going away, never by the owner's. Every question blocking Workstreams 1 through 3
was settled 2026-08-31 and is recorded under "Settled" below; Artificer and Minstrel have agreed their side.
Only Workstream 4 still has an open question, and it is last. Workstream 1 can start immediately and is tracked in `TODO.md` as "One Scene Config tab injector,
registered like a toolbar tool".

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
2. **Habitat** (habitat, biome) lives in Artificer's scene flags, owned by a harvesting module.
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

### Habitat is owned by Artificer and read raw by Minstrel

Artificer defines the vocabulary as a fixed twelve-value list, reached through `getBiomeVocabulary()`
(renamed from a bare `OFFICIAL_BIOMES` constant on 2026-08-31, when it became an accessor so it could
resolve Blacksmith's list at call time rather than capturing a fallback at module scope)
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
    habitat: [],      // values from the canonical vocabulary
    reputation: null,     // -100..+100; key absent means never set
    locationUuid: null    // JournalEntryPage uuid of the Location entry; set by the Area importer, no picker in v1
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

A note on Tags, since the word came up. Blacksmith should own the habitat vocabulary as a shared,
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

**Shipped.** `scripts/manager-scene-config.js`; surface documented in
[api-scene-config.md](../api/api-scene-config.md). The signature is `registerSceneConfigTab(tabId, tabData)`,
two arguments rather than the single object sketched here, to actually match `registerToolbarTool` as this
workstream intended.

**There is no `save` callback.** The sketch assumed one and the reference consumer disproved it: Artificer
persists twelve scene fields purely by naming its inputs `flags.<moduleId>.<path>`, which Foundry's own Scene
Config submission writes to the document. Nothing hooks a save. Building the callback anyway would have been
surface no consumer could exercise.

Geography becomes the first tab registered through it, in Workstream 2 — until then the API ships with no
Blacksmith-side consumer, which is why the harness suite registers a throwaway tab to exercise it.
Artificer's becomes the second, and its two injectors and both guard collections are deleted.

This is hub infrastructure rather than a feature, so it belongs here under the module boundary rules. A
Geography feature living in Blacksmith is more arguable; see open question 8.

### 2. Geography data model and API

Add the flag, the read and write helpers, and the resolution order. Change `CampaignManager.getGeography()` to
take an optional scene and resolve flag before setting. Add `api.campaign.getSceneContext(scene)` returning
the full holistic view.

`saveCampaignGeography()` loses its unconditional write-back (settled question 7): an import records onto the
scene flag, and the world settings are written only by the settings UI. Carry `locationUuid` in the schema and
have the Area importer populate it when one run creates both a scene and a Location entry (settled question 6);
no picker in v1.

**Habitat is a checkbox group, so it carries the trap documented in
[api-scene-config.md](../api/api-scene-config.md): an unticked box submits `null`, not nothing, and a
`filter(Boolean)` normalizer turns those into the literal string `"null"`. Filter the habitat array
against the vocabulary, never against truthiness.** This is ours before it is Artificer's -- the geography
tab owns the habitat checkboxes after the move.

### 3. Habitat ownership move

The vocabulary moves to Blacksmith and is exposed through the API as a closed constant, not a registry
(settled question 1). The Habitats
fieldset leaves the Artificer tab and appears in the Geography tab. Every other fieldset in Artificer's tab
stays, because component types, harvesting skills, DC thresholds, gather spots, and discovery radius only mean
anything if you are harvesting.

Artificer reads habitat from the API instead of defining it. Minstrel reads the same API and drops its
`isArtificerAvailable()` gate, which makes its habitat automation work standalone — a user-visible fix, not
only a refactor.

Needs a one-time migration reading existing `flags.coffee-pub-artificer.scene.habitats` into the new flag,
lowercasing as it writes (settled question 2). Artificer takes a hard cut at `ready` with no read-through
fallback (settled question 3).

**What Blacksmith owes Artificer, because of the hard cut.**

- **A migration-complete signal that a degraded `ready` cannot fake.** Artificer requires the migration to
  have finished before its own `ready`, and `BlacksmithAPI.waitForReady()` does not provide that.
  That promise is only ever resolved, never rejected, and `bailOutOfReady`
  ([blacksmith.js:470-492](../../scripts/blacksmith.js#L470)) deliberately calls `markReadyForConsumers()`
  after a failure so consumers get a degraded API rather than hanging. So a bail-out before the geography
  migration runs resolves Artificer's await, hands it a migrated-looking API with no habitats, and the hard
  cut turns that into silent data loss -- the exact failure the hard cut was chosen to make loud. The signal
  must distinguish "migration completed" from "Blacksmith marked ready degraded", and this design is part of
  this workstream, not an afterthought to it.
- **A version floor to pin: `13.22.0`**, named by the author 2026-08-31. Artificer's `module.json` carries
  an empty `compatibility` block, so a new Artificer against an old Blacksmith finds neither API nor flag
  and habitats are simply gone. The number is an intent until the BUILD commit lands -- `module.json` still
  reads 13.21.1 and is the author's to bump -- so Artificer pins now and releases after Blacksmith tags.

This is a cross-module contract, so it belongs in `TODO-GLOBAL.md`, and it should not land until Artificer and
Minstrel are ready to move in the same release window. Artificer's own compendium re-export is **not** part of
that window -- normalizing at the join makes stored case irrelevant, so the re-export is independent cleanup.

### 4. Reputation migration

Move `blacksmithPartyData.scenes[sceneId].reputation` onto the scene flag as a flat value (settled question
4), drop the denormalized `uuid` and `title` mirrors, expose `api.reputation` as public surface, and resolve
the aggregate question in `TODO.md` — which becomes tractable once absence is distinguishable from neutral.

Last, and on its own. This is the only step that can lose real world data, and it needs a real one-way
migration rather than a dual-read.

**Sequencing:** 1, then 2, then 3, then 4. Workstream 1 is standalone. Workstream 3 must not start before the
vocabulary questions below are settled, because it is a contract with two other modules.

---

## Settled (2026-08-31)

These were the blocking open questions. They are answers now, not options -- the alternatives are gone
deliberately, so nothing here reads as still up for grabs. Q1, Q4, Q6 and Q7 were settled by the author; Q2
and Q3 came back from Artificer the same day, and Q10 is new -- it was not on the original list and Artificer's
reply raised it.

- **Q1. The habitat vocabulary is a closed enum of the twelve.** It matches every consumer that exists, and
   it is the safe direction on the API: a constant can become a pre-populated registry later without breaking
   anyone, where a registry cannot be narrowed back to a constant. This also retires the "what does an unknown
   habitat do to harvest tables" question -- nothing can be unknown if the list cannot grow. If a world
   with a Feywild forces the issue later, that is a registry proposal with its own plan.
- **Q2. Canonical case is lowercase, and every consumer normalizes at the boundary rather than trusting the
   stored form.** The second half is the load-bearing half, and it came from Artificer. Habitat is not only a
   display value there: `getEligibleGatherRecords`
   (`coffee-pub-artificer/scripts/manager-gather.js:224-235`) intersects scene habitats against item biomes
   with a case-sensitive `Set.has`, and item biomes are uppercase and are **not** moving. A case change on one
   side alone therefore breaks the join, and breaks it silently -- `:231` returns `true` for any component
   with no biomes at all, so gather keeps returning results drawn only from untagged components and looks
   entirely normal.

   Normalizing both sides **at the join** makes stored case irrelevant, which is what makes lowercase safe to
   pick. Two things force the fix to sit at the join rather than upstream of it. Artificer's gather pool is
   built from compendium items **and** `game.items`
   (`coffee-pub-artificer/scripts/cache/cache-items.js:375-378`), so components a GM imported into their world
   keep their old case whatever a re-exported pack says; and their item cache is persisted to a world setting,
   so normalizing where records are built would leave every established world serving the old form until
   something rebuilt it -- a migration that passes on a fresh world and silently fails on a real one.
   Blacksmith normalizes at the API edge for the same reason: the edge is the one place that cannot be stale.
- **Q3. Hard cut at `ready`. Artificer keeps no read-through fallback.** Artificer's call, and their reasoning is
   the deciding one: a fallback means two sources with two cases feeding one case-sensitive join during
   exactly the window when a half-migrated scene exists. Worse, `_hasGatheringConfigured`
   (`coffee-pub-artificer/scripts/manager-scene.js:470-483`) requires `habitats.length > 0`, so a scene
   falling back to its stale flag would report itself configured and gather against stale data -- hiding the
   migration failure. With a hard cut the same failure is loud: zero habitats, and the GM sees it.

   A hard cut puts two obligations on Blacksmith, both under "What Blacksmith owes Artificer" in Workstream 3
   above.
- **Q4. Reputation is a flat value; absence means unset.** `reputation: -100..100`, key absent means never set.
   Blacksmith has exactly one party -- numbered `partyMember{N}` settings and a single `partyLeader`
   ([settings.js:1034](../../scripts/settings.js#L1034), [:1084](../../scripts/settings.js#L1084)) -- with no
   party id anywhere, so a `{partyId: value}` map would be an index whose key is always the same invented
   constant. Multi-party is a real feature if it ever arrives, and this would be a small part of its migration.
- **Q6. `locationUuid` is in the v1 schema; its UI is not.** The nullable key ships with the flag, and the Area
   importer populates it when it creates a scene and a Location entry in the same run. The manual picker and
   any backfill of existing worlds are deferred. Reserving the key costs nothing and new content starts
   accumulating real links immediately, instead of more `scenetitle` string matches to clean up later.
- **Q7. The importer writes the scene, and the world settings become a seed.** An import records geography onto
   the scene flag for the scene it was launched from; the four world settings are the seed for a scene with no
   flag, and only the settings UI writes them. This is the split the model exists for -- "record this about
   this place" and "remember this for next time" stop being one action. `saveCampaignGeography()`
   ([registry-json-import-journals.js:694](../../scripts/registry-json-import-journals.js#L694)) loses its
   unconditional write-back.

   **One edge this leaves open:** an Area import launched with no scene in context. It reads the seed and
   records geography nowhere, which is defensible but silent. Decide during Workstream 2 whether that
   warrants a notice.

- **Q10. The habitat constant exposes `{key, label}` pairs, not bare strings.** The key is what is stored
   and joined on; the label is what a GM reads. A bare lowercase array would put "underdark" in front of
   people, but display is the smaller half of the reason. In Artificer the stored form is also the round-trip
   key -- `data-biome="{{name}}"` carries the same value the button displays, and the click handler validates
   it against the vocabulary -- so a value that is simultaneously label and identity cannot be made
   human-readable without breaking the round trip. Separating them is what makes the case change safe on the
   consumer side, not merely prettier.

## Open questions

Nothing blocks Workstream 3 now. Both questions that did were Artificer's, and both came back 2026-08-31.

**Blocking Workstream 4.**

- **Q5. What does "overall reputation" mean** -- mean of scenes with an entry, or a campaign-level value with
   scene reputation as local colour? The `TODO.md` reputation entry lists the options; this plan does not
   settle them. Not urgent: Workstream 4 is last, and the sentinel fix does not depend on the answer.

**Scope.**

- **Q8. Where does the line sit between Blacksmith and Cartographer?** The data model, the flag, and the API are
   unambiguously hub concerns, and a tab registration API is infrastructure. A map browser or atlas window
   built on this data is a sibling's job. Worth naming now, because scene metadata attracts UI.
- **Q9. Flat strings or a real hierarchy?** Flat realm/region/site/area matches everything that exists and is
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
compendium, re-import it, and confirm habitat survives the round-trip.

**Workstream 4.** On a world with existing per-scene reputation, run the migration and confirm the menubar
readout is unchanged for every scene that had a value. Confirm a scene that never had a value reports unset
rather than 0, and that a scene explicitly set to 0 reports neutral. Confirm the aggregate excludes unset
scenes.
