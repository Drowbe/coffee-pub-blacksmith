# Campaign API

Blacksmith exposes a normalized campaign API for other Coffee Pub modules so they do not need to read raw settings or resolve party actors themselves.

## Access

```js
const api = game.modules.get('coffee-pub-blacksmith')?.api;
const campaign = api?.campaign?.getCampaign?.();
```

## Console Testing

```js
const api = game.modules.get('coffee-pub-blacksmith')?.api;

console.log('Campaign API:', api?.campaign);
console.log('Full Campaign:', api?.campaign?.getCampaign?.());
console.log('Core:', api?.campaign?.getCore?.());
console.log('Geography:', api?.campaign?.getGeography?.());
console.log('Party:', api?.campaign?.getParty?.());
console.log('Rulebooks:', api?.campaign?.getRulebooks?.());
console.log('Journal Defaults:', api?.campaign?.getJournalDefaults?.());
console.log('Prompt Context:', api?.campaign?.getPromptContext?.());
```

Quick readable dump:

```js
const campaign = game.modules.get('coffee-pub-blacksmith')?.api?.campaign?.getCampaign?.();
console.log(JSON.stringify(campaign, null, 2));
```

## Methods

### `campaign.getCampaign()`

Returns the full normalized campaign object:

```js
{
  core: {
    name: string,
    rulesVersion: string,
    customRulebooks: string,
    rulebooks: {
      configuredCount: number,
      compendiums: [
        {
          id: string,
          label: string,
          package: string,
          type: string
        }
      ]
    }
  },
  geography: {
    realm: string,
    region: string,
    site: string,
    area: string
  },
  party: {
    name: string,
    configuredSize: number,
    memberCount: number,
    members: [
      {
        id: string,
        uuid: string,
        name: string,
        img: string,
        actorType: string,
        level: number | null,
        className: string | null,
        classes: string[]
      }
    ],
    summary: {
      averageLevel: number | null,
      levels: number[],
      classNames: string[]
    }
  },
  journal: {
    narrative: {
      folder: string,
      cardImage: string,
      imagePath: string
    },
    encounter: {
      folder: string,
      cardImage: string,
      imagePath: string
    }
  }
}
```

### Data Semantics

#### `core`

- `name`
  - Source setting: `Campaign Settings > Core > Campaign Name`
  - The campaign name used as shared context for prompts and imports.
  - This should be the user-facing campaign title, not a sourcebook or setting name.
  - Good examples:
    - `Shadows Over Blackstone`
    - `The Ashen Crown Campaign`
- `rulesVersion`
  - Source setting: `Campaign Settings > Core > Rules Version`
  - The selected rules era for the campaign.
  - Current values are:
    - `2024` for Modern Rules
    - `2014` for Legacy Rules
  - Consumers should treat this as a rules-behavior hint, not as a complete system identifier.
  - This should reflect which D&D 5e rules revision the campaign is actually using, especially when other modules need to know whether 2014 or 2024 assumptions apply.
- `customRulebooks`
  - Source setting: `Campaign Settings > Core > Custom Rulebooks`
  - Freeform supplemental rules text entered by the GM.
  - Intended for books, supplements, houserule packets, or campaign documents not represented by selected compendium packs.
  - This is best used for:
    - unofficial supplements
    - house rules packets
    - campaign PDFs
    - rulings that are not represented by a compendium selector
  - This should be plain descriptive text, not a JSON blob or comma requirements list.
- `rulebooks.configuredCount`
  - Source setting: `Campaign Settings > Core > Number of Rulebooks`
  - How many rulebook-compendium dropdowns the GM chose to expose in settings.
  - This is configuration shape, not guaranteed content.
- `rulebooks.compendiums`
  - Source setting: `Campaign Settings > Core > Rulebook 1..N`
  - The actual selected rulebook compendiums, resolved into metadata objects.
  - These represent the structured rules corpus the campaign is expected to use.
  - Consumers should prefer these over parsing `customRulebooks`.
  - These should point at the compendiums that actually represent the campaign's active rules references.
  - Typical examples:
    - `Player's Handbook`
    - `Dungeon Master's Guide`
    - `Xanathar's Guide to Everything`
    - `Tasha's Cauldron of Everything`

#### `geography`

- `realm`
  - Source setting: `Campaign Settings > Geography > Realm`
  - Broad world, plane, or major setting scope, such as `Faerun` or `Eberron`.
  - This should describe the highest-level campaign location context.
- `region`
  - Source setting: `Campaign Settings > Geography > Region`
  - Large political or geographic area within the realm, such as a kingdom, coast, or territory.
  - This should narrow the campaign context beneath the realm, but still remain broader than a single city or dungeon.
- `site`
  - Source setting: `Campaign Settings > Geography > Site`
  - Specific place within the region, such as a city, keep, mine, temple, or dungeon.
  - This should identify the main location the campaign or current arc centers on.
- `area`
  - Source setting: `Campaign Settings > Geography > Area`
  - Localized sub-area within the site, such as a room, chamber, district, street, or encounter zone.
  - This should be the most granular campaign-location hint you want prompts or imports to inherit by default.

These fields are intended as campaign context. They should not be assumed to match the currently active Foundry scene.

#### `party`

- `name`
  - Source setting: `Campaign Settings > Party > Party Name`
  - The configured party name used as campaign context.
  - This should be the table-facing party title if one exists.
  - Good examples:
    - `The Gloamwalkers`
    - `Company of the Broken Pike`
- `configuredSize`
  - Source setting: `Campaign Settings > Party > Party Size`
  - The number of party-member dropdowns exposed in settings.
  - This is the intended party size, even if some slots are still empty.
  - This should reflect how many player-character slots you want Blacksmith to track, not how many NPC companions happen to be present this week.
- `memberCount`
  - The number of valid actor selections currently configured.
  - Consumers should use this for actual resolved membership.
- `members`
  - Source setting: `Campaign Settings > Party > Party Member 1..N`
  - Resolved actor summaries in configured order.
  - This is the main data other modules should consume instead of doing their own actor lookup from settings.
  - These should generally be the party's player-character actors, or whatever set of actors you want other Coffee Pub modules to treat as the canonical party roster.
- `members[].id`
  - World actor id.
- `members[].uuid`
  - Full actor UUID for durable linking.
- `members[].name`
  - Actor display name.
- `members[].img`
  - Actor image for lightweight display use.
- `members[].actorType`
  - Foundry/system actor type, such as `character`.
- `members[].level`
  - Best-effort derived level.
  - May be `null` if the system or actor data does not expose a clear level.
- `members[].className`
  - Human-readable joined class label, if derivable.
- `members[].classes`
  - Best-effort class list as individual strings.
- `summary.averageLevel`
  - Average of resolved member levels when available.
  - May be `null` if no levels can be derived.
- `summary.levels`
  - Raw numeric levels used to compute the average.
- `summary.classNames`
  - Unique class names present across resolved party members.

#### `journal`

- `journal.narrative.folder`
  - Source setting: `Imports > Journal > Narrative > Narrative Folder`
  - Default folder used for narrative journal generation/import.
  - This should be the journal folder where generated narratives should land by default.
- `journal.narrative.cardImage`
  - Source setting: `Imports > Journal > Narrative > Card Image`
  - Selected built-in narrative card image path or `custom` or `none`.
  - This should be one of:
    - a built-in image selection
    - `custom`
    - `none`
- `journal.narrative.imagePath`
  - Source setting: `Imports > Journal > Narrative > Custom Image`
  - Custom narrative image path used when `cardImage === 'custom'`.
  - This should be a valid Foundry asset path only when the card image mode is `custom`.
- `journal.encounter.folder`
  - Source setting: `Imports > Journal > Encounter > Encounter Folder`
  - Default folder used for encounter journal generation/import.
  - This should be the journal folder where generated encounters should land by default.
- `journal.encounter.cardImage`
  - Source setting: `Imports > Journal > Encounter > Default Encounter Card Image`
  - Selected built-in encounter card image path or `custom` or `none`.
  - This should be one of:
    - a built-in image selection
    - `custom`
    - `none`
- `journal.encounter.imagePath`
  - Source setting: `Imports > Journal > Encounter > Custom Image`
  - Custom encounter image path used when `cardImage === 'custom'`.
  - This should be a valid Foundry asset path only when the encounter card image mode is `custom`.

## Settings Mapping

This section maps the normalized API fields back to the settings users actually configure. It is intended to help other module authors understand both where the data comes from and what kind of content the GM is expected to place there.

### Campaign Settings > Core

- `Campaign Name` -> `campaign.getCore().name`
  - Expected content: the table-facing name of the active campaign.
  - Use this as narrative context, not as a compendium or system identifier.
- `Rules Version` -> `campaign.getCore().rulesVersion`
  - Expected content: which D&D 5e rules revision the campaign is running under.
  - Current supported values:
    - `2024`
    - `2014`
- `Number of Rulebooks` -> `campaign.getCore().rulebooks.configuredCount`
  - Expected content: how many rulebook selectors the GM wants available.
  - This shapes the settings UI and indicates the intended breadth of structured rulebook selection.
- `Rulebook 1..N` -> `campaign.getCore().rulebooks.compendiums`
  - Expected content: selected rulebook compendium packs that represent the structured rules corpus for the campaign.
  - Consumers should prefer these over parsing freeform text.
- `Custom Rulebooks` -> `campaign.getCore().customRulebooks`
  - Expected content: supplemental freeform rules references that are not represented by the selected compendium packs.
  - Good uses include house rules, third-party books, campaign documents, or short notes about special rules in effect.

### Campaign Settings > Geography

- `Realm` -> `campaign.getGeography().realm`
  - Expected content: world-, plane-, or setting-level location context.
- `Region` -> `campaign.getGeography().region`
  - Expected content: kingdom-, coast-, territory-, or province-level context.
- `Site` -> `campaign.getGeography().site`
  - Expected content: city, dungeon, keep, temple, mine, settlement, or similarly specific location.
- `Area` -> `campaign.getGeography().area`
  - Expected content: the most local default location context, such as a district, room, street, or zone.

### Campaign Settings > Party

- `Party Name` -> `campaign.getParty().name`
  - Expected content: the canonical party name, if the group uses one.
- `Party Size` -> `campaign.getParty().configuredSize`
  - Expected content: how many party member slots should be tracked in settings.
- `Party Member 1..N` -> `campaign.getParty().members`
  - Expected content: the actor selections representing the campaign's actual party roster.
  - These should usually be player characters rather than generic reference actors.

### Imports > Journal > Narrative

- `Narrative Folder` -> `campaign.getJournalDefaults().narrative.folder`
  - Expected content: the default journal folder for generated/imported narrative entries.
- `Card Image` -> `campaign.getJournalDefaults().narrative.cardImage`
  - Expected content: a built-in image choice, `custom`, or `none`.
- `Custom Image` -> `campaign.getJournalDefaults().narrative.imagePath`
  - Expected content: a valid asset path only when the selected card image mode is `custom`.

### Imports > Journal > Encounter

- `Encounter Folder` -> `campaign.getJournalDefaults().encounter.folder`
  - Expected content: the default journal folder for generated/imported encounter entries.
- `Default Encounter Card Image` -> `campaign.getJournalDefaults().encounter.cardImage`
  - Expected content: a built-in image choice, `custom`, or `none`.
- `Custom Image` -> `campaign.getJournalDefaults().encounter.imagePath`
  - Expected content: a valid asset path only when the selected encounter card image mode is `custom`.

### `campaign.getCore()`

Returns the `core` block only.

### `campaign.getGeography()`

Returns the `geography` block only.

### `campaign.getParty()`

Returns the normalized `party` block only.

### `campaign.getRulebooks()`

Returns `campaign.getCore().rulebooks`.

### `campaign.getJournalDefaults()`

Returns the `journal` block only.

### `campaign.getPromptContext()`

Returns a flattened helper object for prompt/template replacement:

```js
{
  campaignName,
  rulesVersion,
  rulebooks,
  partyName,
  partySize,
  partyLevel,
  partyMakeup,
  partyClasses,
  realm,
  region,
  site,
  area,
  narrativeFolder,
  narrativeCardImage,
  narrativeImagePath,
  encounterFolder,
  encounterCardImage,
  encounterImagePath
}
```

### Prompt Context Semantics

- `campaignName`
  - Prompt-ready campaign title.
- `rulesVersion`
  - Prompt-ready rules era value (`2024` or `2014`).
- `rulebooks`
  - Flattened comma-delimited text built from selected rulebook compendium labels plus `customRulebooks`.
- `partyName`
  - Prompt-ready party title.
- `partySize`
  - Prompt-ready size.
  - Uses resolved `memberCount` first, then falls back to `configuredSize`.
- `partyLevel`
  - Prompt-ready level string.
  - Uses derived party average level when available, then falls back to the hidden legacy setting for backward compatibility.
- `partyMakeup`
  - Prompt-ready party description.
  - Uses selected party actors first, then falls back to the hidden legacy freeform makeup string.
- `partyClasses`
  - Prompt-ready comma-delimited list of unique class names derived from the selected party actors.
- `realm`, `region`, `site`, `area`
  - Prompt-ready geography values.
- `narrativeFolder`, `narrativeCardImage`, `narrativeImagePath`
  - Narrative journal defaults flattened for prompt/template replacement.
- `encounterFolder`, `encounterCardImage`, `encounterImagePath`
  - Encounter journal defaults flattened for prompt/template replacement.

## Notes

- The API is read-only.
- Party members come from the configured party-member actor dropdowns in Blacksmith settings.
- Rulebooks are built from selected rulebook compendiums plus the freeform `Custom Rulebooks` setting.
- Modules should prefer this API over direct `game.settings.get('coffee-pub-blacksmith', ...)` reads for campaign and party context.
- `partyLevel` and `partyMakeup` still include a legacy fallback path for existing worlds while the new party-member settings are adopted.
