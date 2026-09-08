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

/**
 * Whether two short words are within `budget` single-character edits of each other.
 *
 * Bounded rather than a full Levenshtein: the answer is only ever used as a yes/no, the
 * budget is one or two, and a row that has already exceeded it cannot recover -- so the
 * loop abandons a candidate the moment its best possible score is out of range. These
 * are filename tokens, a handful of characters each, compared against a few thousand
 * candidates only when a path has already failed to resolve outright.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} budget
 * @returns {boolean}
 */
function editDistanceWithin(a, b, budget) {
    if (Math.abs(a.length - b.length) > budget) return false;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        let rowBest = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
            if (current[j] < rowBest) rowBest = current[j];
        }
        if (rowBest > budget) return false;
        previous = current;
    }
    return previous[b.length] <= budget;
}

/** The directory part of a path-shaped value, or '' when it has none. */
function suppliedDirOf(value) {
    return looksLikePath(value) ? value.slice(0, value.lastIndexOf('/')) : '';
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

    // A NEAR TOKEN COUNTS, at less than an exact one. Without this the corrupted word
    // matches nothing at all, so the decision falls entirely to the words either side of
    // it and every near-sibling ties exactly: `anatomy-organ-brain-pink-red` and
    // `anatomy-organ-heart-pink-red` both score four against `...brains...`, and the
    // winner is whichever the length tiebreak happens to prefer. That produced 96%
    // recovery on a corrupted-path test, which read as accuracy and was substantially
    // luck -- and its one miss was exactly this: `blood-cells-vessels-red` resolved to
    // `blood-cells-red` while `blood-cells-vessel-red` sat there unrewarded.
    //
    // Prefix comparison rather than a stemmer, because the corruptions that matter are
    // plurals and inflections -- `vessels`/`vessel`, `cells`/`cell`, `impacts`/`impact` --
    // and a stemmer is a dictionary to maintain for a gain these filenames do not offer.
    // Two thirds weight, so an exact match on a rarer word still outranks a near match.
    const nearMatch = (token, tokens, consumed) => {
        for (const candidate of tokens) {
            if (consumed.has(candidate)) continue;
            if (Math.abs(candidate.length - token.length) > 2) continue;
            if (candidate.startsWith(token) || token.startsWith(candidate)) return candidate;
            // Prefix alone was the first attempt and it only caught inflections. A
            // generator misremembers the MIDDLE of a word as often as the end --
            // `blooe` for `blood`, `forkee` for `forked`, `mediue` for `medium` -- and
            // in none of those is either string a prefix of the other. Measured on a
            // consumer's 73 shipped icons: every one of their ten wrong answers was
            // this shape, and the correct file lost to a shorter real sibling that
            // simply lacked the word, because an unmatched token scored the same
            // whether it was one letter off or absent entirely.
            const budget = token.length >= 4 && candidate.length >= 4 ? 2 : 1;
            if (editDistanceWithin(token, candidate, budget)) return candidate;
        }
        return null;
    };

    const scored = [];
    for (const { path, tokens } of tokenised) {
        let score = 0;
        let exact = 0;
        let near = 0;

        // A CANDIDATE TOKEN IS SPENT ONCE. Exact matches claim theirs first, then a near
        // match may only take a word nothing has taken already.
        //
        // Without this a single word answers for two, and it picks the wrong file rather
        // than merely flattering the right one. `strike-blade-blooe-red` resolved to
        // `strike-blade-claw-red`: `blade` matched the wanted `blade` exactly AND was
        // within two edits of the corrupted `blooe`, so the wrong candidate scored four
        // against the correct file's four and won on the tiebreak. The correct file had
        // `blood` sitting there, one edit away, and no way to out-score a double count.
        //
        // Exact-first ordering matters as much as the spending: letting a near match take
        // a word an exact match still needs reintroduces the same defect by another route.
        const consumed = new Set();
        for (const token of wanted) {
            if (tokens.has(token)) {
                exact++;
                consumed.add(token);
                score += 1 / Math.log(1 + (frequency.get(token) ?? 1));
            }
        }
        for (const token of wanted) {
            if (tokens.has(token)) continue;
            const approximate = nearMatch(token, tokens, consumed);
            if (approximate) {
                near++;
                consumed.add(approximate);
                score += (2 / 3) * (1 / Math.log(1 + (frequency.get(approximate) ?? 1)));
            }
        }
        // THE BAR IS A FILTER ON CANDIDATES, NOT A TEST ON THE WINNER. This was applied by
        // the caller to the best-scoring candidate's EXACT count, which is a different
        // question and gave a wrong answer whenever the two disagreed: a candidate with one
        // exact and two near tokens outranks one with two exact and one near, wins on
        // weighted score, then fails the bar -- and the whole resolution falls back, past a
        // qualified runner-up that was sitting right there. Six of a consumer's nine
        // remaining failures were exactly that, including `strike-fise-stone` falling back
        // while `strike-fist-stone` was present and matched two exact plus one near.
        //
        // A NEAR TOKEN RANKS A CANDIDATE BUT MAY NOT QUALIFY ONE. Two EXACT words is the
        // bar, and this was briefly loosened to let near matches count toward it on the
        // reasoning that a near token is evidence too. It is, for ranking. For admission
        // it is far too weak: `cell` is one edit from `bell`, so `blood-cell-red` scored
        // `bell-alarm-red-purple` at one exact plus one near and shipped a bell for blood
        // cells. Measured over 73 shipped icons, that loosening moved exact recovery by a
        // single record and took wrong-in-a-different-family from 2 to 7 -- every honest
        // fallback became a confident wrong answer. A bell for blood cells, a pine cone
        // for a glowing heart, a pickaxe for a stone fist.
        //
        // The per-candidate filter below IS the right half of that change and stays: it
        // fixed six cases where a qualified file was discarded because the bar had been
        // tested on the winner instead. Only the near-counts-toward-it half was wrong.
        //
        // The lesson is about which number to read. Exact recovery barely moved, so the
        // headline rate said the change was neutral; the damage was entirely in the
        // QUALITY of the misses, because a plausible icon from an unrelated family is not
        // visibly wrong to a GM the way a fallback is.
        if (exact < 2) continue;
        // The directory is the part a generator usually gets right, and it is evidence
        // in its own right: a near-miss filename in the intended folder beats a better
        // word overlap somewhere unrelated.
        if (preferredDir && path.startsWith(`${preferredDir}/`)) score *= 1.5;
        scored.push({ path, score, shared: exact + near });
    }
    if (!scored.length) return null;

    scored.sort((a, b) => (b.score - a.score) || (a.path.length - b.path.length));
    const [best, runnerUp] = scored;
    return {
        path: best.path,
        score: best.shared,
        weight: best.score,
        // A GENUINE TIE ONLY. This was a 5% band and it fired on every single match,
        // including four-word matches that were obviously right -- an always-firing
        // warning carries no information and teaches the reader to skip it, which is
        // worse than not warning at all. Near-token scoring separates true siblings now,
        // so anything still tied to within a thousandth really is indistinguishable.
        ambiguous: !!runnerUp && Math.abs(best.score - runnerUp.score) < (best.score * 0.001)
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
    // DEDUPLICATED, because the supplied directory is usually INSIDE a declared root and
    // would otherwise be walked twice. Two consequences, both silent:
    //
    // The same file scored twice produced two entries with identical scores, so the
    // ambiguity flag was true for every winner that sat in the supplied directory -- it
    // was tying with itself. That is why a four-word exact match still reported "another
    // candidate scored as well", spotted by a consumer reading one line of a live import
    // log on a resolution that was otherwise correct.
    //
    // And every token in the supplied directory was counted twice in the frequency map,
    // so the rarity weighting believed those words were half as distinctive as they are.
    // Quiet, corpus-dependent, and exactly the sort of thing that shows up as a couple of
    // unexplained percent in an accuracy measurement.
    const seen = new Set();
    const catalogs = [];
    const add = (files) => {
        for (const file of files) {
            if (seen.has(file)) continue;
            seen.add(file);
            catalogs.push(file);
        }
    };

    if (looksLikePath(wanted)) {
        const ownDir = wanted.slice(0, wanted.lastIndexOf('/'));
        const siblings = await filesUnder(ownDir);
        if (siblings.includes(wanted)) return wanted;
        add(siblings);
    }

    for (const root of roots) add(await filesUnder(root));

    // TWO SHARED TOKENS MINIMUM, applied inside `bestMatch` as a filter on every
    // candidate rather than as a test on the one that wins. One token is noise: every
    // wound icon shares `injury`, so a single-token match returns an arbitrary member of
    // a large set while looking deliberate. Below the bar the fallback is more honest.
    // AN EXACT FILENAME ANYWHERE BEATS ANY SCORE. The generator got the name right and
    // the folder wrong, which is a solved problem the moment it is recognised rather than
    // scored: token overlap can and did prefer a differently-named file in a better
    // position over an identically-named one elsewhere. Measured over 76 paths whose
    // directory was corrupted and filename kept, both failures were this and nothing else.
    //
    // It changes no case that currently succeeds: an exact filename already wins on score
    // in every one of them, so the rule only decides the cases where it loses.
    //
    // Preferring the supplied directory among equals matters because a name can repeat
    // across families -- `bolt-blue.webp` under `magic/lightning` and `magic/air` are
    // different pictures, and the folder the author wrote is the only thing distinguishing
    // them.
    if (looksLikePath(wanted)) {
        const askedFile = wanted.split('/').pop();
        const identical = catalogs.filter(path => path.split('/').pop() === askedFile);
        if (identical.length) {
            const preferred = identical.find(path => suppliedDirOf(wanted)
                && path.startsWith(`${suppliedDirOf(wanted)}/`)) ?? identical[0];
            if (identical.length > 1) {
                postConsoleAndNotification(MODULE.NAME,
                    `Import: ${label} "${wanted}" does not exist, but ${identical.length} files share `
                    + `its name. Using "${preferred}".`, '', false, false);
            } else {
                postConsoleAndNotification(MODULE.NAME,
                    `Import: ${label} "${wanted}" does not exist; the same filename does, at `
                    + `"${preferred}". Using it.`, '', false, false);
            }
            return preferred;
        }
    }

    // TOKENISED FROM THE FILENAME, matching how candidates are tokenised.
    //
    // This passed the whole path while candidates were reduced to their basename, so
    // directory words were scored against filenames that never contained them. Asking for
    // `icons/sundries/gaming/dice-runee-brown.webp` put `gaming` into the wanted set, and
    // `gaming-gambling-dice-gray` -- a different family entirely -- matched `gaming` and
    // `dice`, cleared the two-exact bar on the strength of a directory word, and was then
    // handsomely rewarded for it because `gaming` is rare across the corpus. The rarity
    // weighting made the wrong signal count for more, not less.
    //
    // The directory is real evidence and keeps its influence through `suppliedDir` and the
    // bonus below, which is where it was always meant to act. Spending it twice, once as a
    // coincidence against filenames, is the defect. Found by a consumer who read both call
    // sites rather than the behaviour.
    const suppliedDir = suppliedDirOf(wanted);
    const match = bestMatch(catalogs, tokenise(wanted.split('/').pop()), suppliedDir);
    if (match) {
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
