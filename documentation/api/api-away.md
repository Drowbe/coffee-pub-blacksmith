# Away API

**Audience:** module authors who need to know whether a person at the table has stepped away.

Away is a status of a person: they have left the table in real life. It is exposed as `module.api.away` and as the `blacksmith.away.changed` hook. It is a mark and an optional message. It does not block anything, so a module that waits on a person's input reads it and decides for itself, for example by telling the GM to act for them.

```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

if (blacksmith?.away.isAway(user.id)) {
    // This person is not at the table.
}
```

## Reading

| Call | Returns |
|---|---|
| `away.get(userId)` | `{ since, message }` when the user is away (`since` is a millisecond timestamp, `message` may be empty), else `null`. An unknown id is `null`. |
| `away.isAway(userId)` | `true` or `false`. |
| `away.list()` | One row per user: `{ userId, name, isGM, active, away }`, `away` being the `get` result. |

## Writing

| Call | Does |
|---|---|
| `await away.set(userId, { message })` | Marks the user away. The message is optional, trimmed, and capped at 200 characters; setting again replaces it. |
| `await away.clear(userId)` | Marks the user back. Resolves `true`, or `false` when they were not away. |

A person may change only their own status; a GM may change anyone's. Anything else rejects with an error. Setting a status toasts everyone present that the person is away, the same as the person doing it from their own menubar.

## The hook

```javascript
Hooks.on('blacksmith.away.changed', ({ userId, away, message, since }) => {
    // Called on every client, when a user goes away, changes their message, or comes back.
    // `away` is false when they came back; `message` and `since` are then '' and null.
});
```

## Where it is stored

On the person's own user, `flags.coffee-pub-blacksmith.away`. Read it through `api.away` rather than the flag: the shape and the limits are the API's to keep.
