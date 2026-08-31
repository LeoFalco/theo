// @ts-check

/**
 * Pure helpers that turn the Azure DevOps payloads into the values rendered by `theo pr list`.
 * Kept apart from the command so they can be tested without touching the Azure CLI.
 */

/**
 * @typedef {'clean' | 'conflict' | 'checking' | 'unknown'} MergeState
 * @typedef {'approved' | 'rejected' | 'running' | 'none'} CiStatus
 * @typedef {Object} VoteSummary
 * @property {number} approved
 * @property {number} pending
 * @property {number} waiting
 * @property {number} rejected
 */

const CONFLICTING_MERGE_STATUSES = ['conflicts', 'failure', 'rejectedByPolicy']

// azure names the build policy after the pipeline that runs it, the type is what stays stable
const BUILD_POLICY_TYPE_ID = '0609b952-1397-4640-95ec-e00a01b2c241'
const BUILD_POLICY_DISPLAY_NAME = 'build'

/**
 * Counts the reviewer votes by category, ignoring group reviewers.
 *
 * @param {Array<{ vote?: number, isContainer?: boolean }> | undefined} reviewers
 * @returns {VoteSummary}
 */
export function summarizeVotes (reviewers) {
  const summary = { approved: 0, pending: 0, waiting: 0, rejected: 0 }

  for (const reviewer of reviewers || []) {
    if (reviewer.isContainer) continue

    const vote = Number(reviewer.vote) || 0

    if (vote > 0) summary.approved++
    else if (vote === -10) summary.rejected++
    else if (vote < 0) summary.waiting++
    else summary.pending++
  }

  return summary
}

/**
 * Translates the azure merge status into the state shown in the table.
 *
 * @param {string | undefined} mergeStatus
 * @returns {MergeState}
 */
export function resolveMergeState (mergeStatus) {
  if (mergeStatus === 'succeeded') return 'clean'
  if (CONFLICTING_MERGE_STATUSES.includes(String(mergeStatus))) return 'conflict'
  if (mergeStatus === 'queued') return 'checking'

  return 'unknown'
}

/**
 * Aggregates the build policy evaluations of a pull request into a single ci status.
 * A rejected build wins over a running one, which in turn wins over an approved one.
 *
 * @param {Array<{ status?: string, configuration?: { type?: { id?: string, displayName?: string } } }> | undefined} evaluations
 * @returns {CiStatus}
 */
export function resolveCiStatus (evaluations) {
  const statuses = (evaluations || [])
    .filter(isBuildPolicy)
    .map(evaluation => String(evaluation.status))

  if (statuses.some(status => status === 'rejected' || status === 'broken')) return 'rejected'
  if (statuses.some(status => status === 'queued' || status === 'running')) return 'running'
  if (statuses.some(status => status === 'approved')) return 'approved'

  return 'none'
}

/**
 * @param {{ configuration?: { type?: { id?: string, displayName?: string } } }} evaluation
 */
function isBuildPolicy (evaluation) {
  const type = evaluation?.configuration?.type

  return type?.id === BUILD_POLICY_TYPE_ID
    || String(type?.displayName || '').toLowerCase() === BUILD_POLICY_DISPLAY_NAME
}

/**
 * Tells whether the author of a pull request matches a search term.
 * An empty term matches everything.
 *
 * @param {{ createdBy?: { displayName?: string, uniqueName?: string } }} pullRequest
 * @param {string | undefined} term
 * @returns {boolean}
 */
export function matchesAuthor (pullRequest, term) {
  const search = String(term || '').trim().toLowerCase()

  if (!search) return true

  const author = pullRequest?.createdBy || {}
  const haystack = `${author.displayName || ''} ${author.uniqueName || ''}`.toLowerCase()

  return haystack.includes(search)
}

/**
 * @param {Array<{ name?: string, active?: boolean }> | undefined} labels
 * @returns {string}
 */
export function formatLabels (labels) {
  return (labels || [])
    .filter(label => label.active !== false)
    .map(label => label.name)
    .filter(Boolean)
    .join(', ')
}

/**
 * @param {string | undefined} creationDate
 * @param {Date} [now]
 * @returns {string}
 */
export function formatAge (creationDate, now = new Date()) {
  if (!creationDate) return ''

  const created = new Date(creationDate)

  if (Number.isNaN(created.getTime())) return ''

  const days = Math.floor((now.getTime() - created.getTime()) / (24 * 60 * 60 * 1000))

  return `${Math.max(days, 0)}d`
}

/**
 * @param {string | undefined} text
 * @param {number} limit
 * @returns {string}
 */
export function truncate (text, limit) {
  const value = String(text || '')

  if (value.length <= limit) return value

  return `${value.slice(0, limit - 3)}...`
}

/**
 * Text of the spinner shown while the per pull request details are fetched.
 *
 * @param {number} done
 * @param {number} total
 * @returns {string}
 */
export function formatProgressLabel (done, total) {
  return `consultando CI e etiquetas... ${done}/${total}`
}

/**
 * Tells whether the listing may draw a spinner. Anything that is not an interactive table
 * must stay silent: `--json` goes to a parser and a redirected stdout keeps the escape codes.
 *
 * @param {{ json?: boolean, isTty?: boolean }} params
 * @returns {boolean}
 */
export function shouldShowProgress ({ json, isTty }) {
  return Boolean(isTty) && !json
}
