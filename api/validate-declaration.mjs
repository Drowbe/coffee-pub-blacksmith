// ==================================================================
// api/validate-declaration.mjs
// ==================================================================
// THE STABLE, BUILD-TIME ENTRY POINT for `validateDeclaration` — the registry's
// own registration rules, runnable offline, without registering anything.
//
// The third of the set, and the one that was missing:
//
//   api/declaration-from-model.mjs           builds a declaration from a DataModel
//   api/validate-declaration.mjs             proves the REGISTRY will accept it
//   api/check-declaration-mirrors-model.mjs  proves it still describes the MODEL
//
// WHY IT EXISTS. A consumer's build gate could check a declaration against its own
// data model and find them in perfect agreement, and that gate would pass while
// registration rejected the declaration in a live world for violating the
// declaration FORMAT. Two schemas, one senior, and nothing comparing them — the
// same defect the whole subtype migration exists to end, one level up, where the
// second schema is the format rather than a data model.
//
// It is not hypothetical and it was not caught cheaply: a walked declaration
// mirrored its model exactly and carried an `ArrayField`'s element-count `min` on
// an array-typed field. The mirror check passed. The registry refused it, and the
// first person to find out was a GM at a console with every profile unregistered.
//
// These are the REAL rules rather than an approximation of them. It is the same
// function `registerDeclaration` calls, so a gate cannot drift from the registry
// by reimplementing a subset of it — which is what a consumer would otherwise
// have to do, and what this whole model exists to stop anyone doing.
//
// USAGE, from a sibling's build tooling:
//
//   import { validateDeclaration }
//     from '../coffee-pub-blacksmith/api/validate-declaration.mjs';
//
//   try { validateDeclaration(declaration); }
//   catch (error) { console.error(error.message); process.exit(1); }
//
// It throws on the first violation, naming the profile and the offending field,
// and returns nothing on success. At runtime `registerDeclaration` runs it for
// you; this is for proving the answer before you ship.
//
// ZERO IMPORTS BEYOND THE RE-EXPORT, and the implementation must stay free of
// Foundry globals — a consumer runs this in Node with no Blacksmith runtime.
// ==================================================================

export { validateDeclaration } from '../scripts/registry-declarations.js';
