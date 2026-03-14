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
  rulebooks,
  partySize,
  partyLevel,
  partyMakeup,
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

## Notes

- The API is read-only.
- Party members come from the configured party-member actor dropdowns in Blacksmith settings.
- Rulebooks are built from selected rulebook compendiums plus the freeform `Custom Rulebooks` setting.
- Modules should prefer this API over direct `game.settings.get('coffee-pub-blacksmith', ...)` reads for campaign and party context.
