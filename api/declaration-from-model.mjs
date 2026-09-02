// ==================================================================
// api/declaration-from-model.mjs
// ==================================================================
// THE STABLE, BUILD-TIME ENTRY POINT for `declarationFromModel`.
//
// A module that registers an import profile for a document subtype it owns will
// want to build that declaration in its OWN build tooling -- in Node, offline,
// with no Foundry and no Blacksmith runtime -- so it can diff the result against
// its DataModel before shipping. A gate that cannot run without the runtime it
// is gating is not much of a gate.
//
// So this path is a CONTRACT and the implementation behind it is not. Import
// this file, never `scripts/manager-declaration-from-model.js`: that one is free
// to move, be renamed, or acquire a Foundry dependency, and this re-export is
// what absorbs that. The distinction is deliberate -- `api/` is already the
// sibling-facing directory here, which is where Librarian and Regent reach for
// `blacksmith-api.js`.
//
// It became a contract by accident before it was one on purpose: a consumer
// verified they could import the internal path directly, which made that path
// public whether or not anyone intended it. Naming the supported entry point is
// the same reasoning as rejecting an unknown `document` key by name -- a
// contract that fails loudly at its boundary beats one that fails mysteriously
// downstream, and a build gate breaking with a module-resolution error is about
// as mysterious as it gets.
//
// USAGE, from a sibling's build tooling:
//
//   import { declarationFromModel }
//     from '../coffee-pub-blacksmith/api/declaration-from-model.mjs';
//
//   const declaration = declarationFromModel(MyPageModel.defineSchema(), {
//       kind: 'journal', id: 'thing', label: 'Thing', module: 'my-module',
//       document: { documentName: 'JournalEntryPage', type: 'my-module.thing',
//                   containerNameFrom: 'category', containerNameTransform: 'sentenceCase' },
//       guidance: { severity: 'One sentence, keyed by dotted path.' },
//       extraFields: [{ name: 'title', path: 'name', type: 'string', required: true }]
//   });
//
// At runtime inside Foundry the same function is `api.importer.declarationFromModel`.
// One implementation, two entry points; this file adds no behaviour.
//
// ZERO IMPORTS BEYOND THE RE-EXPORT is the property that makes this work, and it
// is worth protecting: the moment the implementation reaches `const.js` -- which
// fetches `module.json` as it loads -- every consumer's offline build breaks.
// ==================================================================

export { declarationFromModel } from '../scripts/manager-declaration-from-model.js';
