// ==================================================================
// api/check-declaration-mirrors-model.mjs
// ==================================================================
// THE STABLE, BUILD-TIME ENTRY POINT for `checkDeclarationMirrorsModel`.
//
// The companion to `api/declaration-from-model.mjs` and named for the same
// reason: `tools/` is internal and `api/` is what a sibling may rely on. A
// consumer's build gate imports this path; the implementation behind it stays
// free to move.
//
// IT WAS NAMED BECAUSE IT FORKED. The check was written by a consumer, hosted
// here, and then improved in both trees at once -- the consumer's gate imported
// its own local copy because there was no supported path to import instead. The
// two grew the same rule independently under two names (`isEnvelope` and
// `isRoled`) and diverged on a third, which is what a fork looks like just
// before it starts giving different answers.
//
// That is worth stating plainly on the file: a tool built to detect two copies
// of one contract became two copies of one contract, because hosting it was not
// the same as making it importable. Offering the code without offering a path is
// an invitation to fork.
//
// USAGE, from a sibling's build tooling:
//
//   import { checkDeclarationMirrorsModel }
//     from '../coffee-pub-blacksmith/api/check-declaration-mirrors-model.mjs';
//
//   const { errors, notes } = checkDeclarationMirrorsModel({
//       schema: MyPageModel.defineSchema(),
//       declaration,
//       titleField: 'title',
//       expectedType: 'my-module.thing',
//       expectedSelector: 'journaltype',        // omit for a kind that does not route by one
//       knownTransforms: { sentenceCase },      // caller-supplied, deliberately
//       expectedContainerName: displayCategory,
//       shippedContainerNames: namesFromMyPack  // omit and it says so rather than passing quietly
//   });
//
// ZERO IMPORTS BEYOND THE RE-EXPORT, and the implementation it points at must
// stay free of Foundry globals and the filesystem. A consumer runs this in Node
// with no Blacksmith runtime present; the moment that stops being true, every
// consumer's offline gate breaks in a way that looks like the consumer's fault.
// ==================================================================

export { checkDeclarationMirrorsModel } from '../tools/check-declaration-mirrors-model.mjs';
