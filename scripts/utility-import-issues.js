// ==================================================================
// ===== IMPORT ISSUES - the structured error vocabulary ============
// ==================================================================
// One shape for every error and warning the importer produces, so a
// consumer can branch on `code` and display `message`.
//
// It lives in its own file rather than beside the validator because the
// validator, the transforms and eventually the window all raise issues,
// and having any one of them own the vocabulary makes the other two
// import it circularly.
//
// Specified in documentation/plans/plan-importer-api.md, "Error shape".
// ==================================================================

/** Pipeline stages an issue can be raised at. */
export const ISSUE_STAGES = ['parse', 'normalize', 'validate', 'convert', 'create', 'postProcess'];

/**
 * One structured issue. `code` is stable for programmatic handling; `message`
 * may improve over time, so callers branch on `code` and display `message`.
 * `details` must stay serialisable and must not carry document data unrelated
 * to the request.
 * @param {string} code
 * @param {string} path - The authored field the issue is about, blank when none.
 * @param {string} message
 * @param {object} [details]
 * @param {string} [stage]
 * @returns {{code: string, stage: string, path: string, message: string, details: object}}
 */
export function issue(code, path, message, details = {}, stage = 'validate') {
    return { code, stage, path, message, details };
}
