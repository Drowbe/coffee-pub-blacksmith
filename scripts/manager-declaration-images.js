// ==================================================================
// ===== DECLARATION IMAGES - resolving a path a generator wrote ====
// ==================================================================
// RESOLVE WHAT THE AUTHOR WROTE; do not hand the generator the library.
//
// A generated injury carried `icons/skills/wounds/injury-mouth-teeth-red.webp`,
// which does not exist, while `injury-mouth-tooth-red.webp` does. Roughly one
// record in ten had a dead path. The page imported, the schema validated, and
// the card rendered broken -- silent, and the same class as a prompt that routed
// to the wrong profile or an answer that never reached the text.
//
// THE ALTERNATIVE WAS ENUMERATION AND IT IS THE WRONG TOOL. The obvious fix is to
// list the legal icons in the prompt the way the authored Area prompt injects its
// compendium actors and items. There are 6,193 core icons, so the list cannot be
// complete; any subset is a guess about what a module's content will need; and a
// generator handed a list still has to match meaning to filename, which is the
// same matching problem moved somewhere it can be done worse. Proposed as a
// catalog by a consumer and withdrawn by them in favour of this.
//
// WHY MATCHING WORKS HERE. Core icon filenames are descriptive and structured --
// `strike-sword-blood-red.webp`, `injury-face-impact-orange.webp` -- so the tokens
// ARE the description. A generator writing "broken sword" has already said enough
// to find `weapon-broken-sword.webp`, and the failing path above was one token
// from a real file with no way to know it.
//
// A SUPPLIED PATH THAT EXISTS IS ALWAYS KEPT. This never overrides a real choice;
// it only rescues one that would otherwise ship broken.
//
// AND A MISS MUST LAND SOMEWHERE VISIBLE. The fallback is not optional and the
// warning is not decoration: wrong art is a cosmetic problem, a record that failed
// to import is a missing mechanic, and a dead path is worse than both because it
// looks like success. So a miss takes the declared fallback and says so.
// ==================================================================

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

const IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.gif'];

// Browsing `icons/` recursively is thousands of requests, so a run does it once.
// Keyed by root because a profile searching `icons/skills/wounds` must not pay for
// a profile that searched all of `icons/`.
const catalogCache = new Map();

/** Whether a string looks like an image file rather than a description. */
function looksLikePath(value) {
    const lower = String(value ?? '').toLowerCase();
    return lower.includes('/') && IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Every image file under one root, recursively, cached for the session.
 * @param {string} root
 * @returns {Promise<string[]>}
 */
async function filesUnder(root) {
    const key = String(root ?? '').trim();
    if (!key) return [];
    if (catalogCache.has(key)) return catalogCache.get(key);

    const found = [];
    const walk = async (dir) => {
        let result;
        try {
            const FilePicker = foundry.applications.apps.FilePicker.implementation;
            result = await FilePicker.browse('public', dir);
        } catch {
            // A root that does not exist is the declaration's problem, not a reason to
            // fail an import. It surfaces as "nothing matched" plus the fallback.
            return;
        }
        for (const file of result.files ?? []) {
            if (IMAGE_EXTENSIONS.some(ext => file.toLowerCase().endsWith(ext))) found.push(file);
        }
        for (const sub of result.dirs ?? []) await walk(sub);
    };
    await walk(key);
    catalogCache.set(key, found);
    return found;
}

/** The meaningful words in a path or a description, lowercased. */
function tokenise(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/, '')          // drop the extension
        .split(/[^a-z0-9]+/)
        .filter(token => token.length > 2);   // 'a', 'of', 'to' match everything
}

/**
 * The best filename match for what the author wrote.
 *
 * Scored on SHARED TOKENS rather than string distance, because the failure mode is
 * a near-miss on one word out of four -- `teeth` for `tooth` -- and edit distance
 * over a whole path is dominated by the directory part the author usually got right.
 *
 * A tie is broken toward the shorter candidate, which is the less specific file and
 * therefore the safer guess when the evidence does not distinguish them.
 *
 * @param {string[]} candidates
 * @param {string[]} wanted
 * @returns {{path: string, score: number}|null}
 */
function bestMatch(candidates, wanted, preferredDir = '') {
    if (!wanted.length || !candidates.length) return null;

    // A WORD SHARED BY EVERYTHING IS WORTH NOTHING, and these directories are
    // word-homogeneous by construction: every file under `icons/skills/wounds` says
    // `injury`, every file under `icons/magic/air` says `air`. Counting matches flat
    // means four files can tie on two meaningless words and the winner is whichever
    // the walk reached first, which is the one-word failure wearing a higher number.
    //
    // So a token is weighted by how RARE it is in the candidate set. `injury` across
    // 200 wound icons contributes almost nothing; `mouth` across three contributes
    // most of the decision. Measured rather than configured, so a module's own corpus
    // decides what is distinctive in it -- which is the only place that is knowable.
    // Raised by a consumer whose injuries span four roots and 3,088 files.
    const frequency = new Map();
    const tokenised = candidates.map((path) => {
        const tokens = new Set(tokenise(path.split('/').pop()));
        for (const token of tokens) frequency.set(token, (frequency.get(token) ?? 0) + 1);
        return { path, tokens };
    });

    const scored = [];
    for (const { path, tokens } of tokenised) {
        let score = 0;
        let shared = 0;
        for (const token of wanted) {
            if (!tokens.has(token)) continue;
            shared++;
            score += 1 / Math.log(1 + (frequency.get(token) ?? 1));
        }
        if (!shared) continue;
        // The directory is the part a generator usually gets right, and it is evidence
        // in its own right: a near-miss filename in the intended folder beats a better
        // word overlap somewhere unrelated.
        if (preferredDir && path.startsWith(`${preferredDir}/`)) score *= 1.5;
        scored.push({ path, score, shared });
    }
    if (!scored.length) return null;

    scored.sort((a, b) => (b.score - a.score) || (a.path.length - b.path.length));
    const [best, runnerUp] = scored;
    return {
        path: best.path,
        score: best.shared,
        weight: best.score,
        // Reported rather than resolved. Two candidates this close means the value did
        // not distinguish them, and a caller deserves to know the pick was near-arbitrary
        // even though returning it still beats a generic fallback.
        ambiguous: !!runnerUp && (best.score - runnerUp.score) < (best.score * 0.05)
    };
}

/**
 * Turn what an author or a generator wrote into a path that exists.
 *
 * @param {string} supplied - A path, or a description of the wanted image.
 * @param {object} options
 * @param {string[]} [options.roots] - Directories to search. Empty means no matching.
 * @param {string} [options.fallback] - Used when nothing matches. Should always be set.
 * @param {string} [options.label] - Field name, for the warning.
 * @returns {Promise<string>}
 */
export async function resolveImagePath(supplied, { roots = [], fallback = '', label = 'image' } = {}) {
    const wanted = String(supplied ?? '').trim();

    // Nothing written is not a mistake to report. The author left it blank and the
    // profile's default is the answer, which is what a default is for.
    if (!wanted) return fallback;

    // THE VALID CASE IS CHECKED FIRST AND CHEAPLY. A path that exists wins outright,
    // whether or not it sits under a declared root -- a module naming its own artwork
    // must not have it replaced by a core icon that happens to share three words.
    //
    // Its own directory is browsed before any root, because that is one request and
    // walking `icons/` is thousands. Almost every value reaching here is already
    // correct, and the correct ones must not pay for the broken ones.
    const catalogs = [];
    if (looksLikePath(wanted)) {
        const ownDir = wanted.slice(0, wanted.lastIndexOf('/'));
        const siblings = await filesUnder(ownDir);
        if (siblings.includes(wanted)) return wanted;
        catalogs.push(...siblings);
    }

    for (const root of roots) catalogs.push(...await filesUnder(root));

    // TWO SHARED TOKENS MINIMUM. One is noise: every wound icon shares `injury`, so a
    // single-token match returns an arbitrary member of a large set while looking
    // deliberate. Below the threshold the fallback is the more honest answer.
    const suppliedDir = looksLikePath(wanted) ? wanted.slice(0, wanted.lastIndexOf('/')) : '';
    const match = bestMatch(catalogs, tokenise(wanted), suppliedDir);
    if (match && match.score >= 2) {
        if (match.path !== wanted) {
            postConsoleAndNotification(MODULE.NAME,
                `Import: ${label} "${wanted}" does not exist; using the closest match `
                + `"${match.path}" (${match.score} words in common`
                + `${match.ambiguous ? ', but another candidate scored as well -- the value did not '
                    + 'distinguish them' : ''}).`, '', false, false);
        }
        return match.path;
    }

    // THE SAFETY NET IS CHECKED TOO. A fallback that does not resolve is this exact
    // defect sitting in the thing meant to prevent it, and it would be the quietest
    // instance of all: it fires only on records that already went wrong. Raised by the
    // consumer, who said they would verify their paths by hand -- which is the reason
    // to do it in code instead.
    let fallbackExists = false;
    if (fallback) {
        const dir = fallback.slice(0, fallback.lastIndexOf('/'));
        fallbackExists = (await filesUnder(dir)).includes(fallback);
    }
    postConsoleAndNotification(MODULE.NAME,
        `Import: ${label} "${wanted}" does not exist and nothing close was found. `
        + (fallback
            ? `Using the declared default "${fallback}"${fallbackExists ? '' : ', WHICH DOES NOT EXIST EITHER'}.`
            : 'No image was set.'),
        '', false, false);
    return fallback;
}

/** Drop the browse cache. Exposed for the harness, which must not see a stale world. */
export function clearImageCatalogCache() {
    catalogCache.clear();
}
