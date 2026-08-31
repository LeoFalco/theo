// @ts-check

import chalk from 'chalk'
import chalkTable from 'chalk-table'
import ora from 'ora'
import { error, info, warn } from '../../core/patch-console-log.js'
import { mapWithConcurrency } from '../../utils/concurrency.js'
import { runAzureCommand, shortRefName } from './azure.js'
import {
  formatAge,
  formatLabels,
  formatProgressLabel,
  matchesAuthor,
  resolveCiStatus,
  resolveMergeState,
  shouldShowProgress,
  summarizeVotes,
  truncate
} from './list-format.js'
import { buildAzurePullRequestUrl, getRemoteInfo } from './remote.js'

const { cyan, dim, green, red, yellow } = chalk

/**
 * @typedef {import('./remote.js').RemoteInfo} RemoteInfo
 * @typedef {Record<string, any>} AzurePullRequest
 */

const TITLE_LIMIT = 50
const DETAIL_CONCURRENCY = 8

// projecting the fields we use keeps the payload small and, more importantly, stops the azure
// cli from dropping every accented character of the response — it only does that when the
// command runs without --query
const LIST_QUERY = '[].{'
  + 'pullRequestId:pullRequestId,'
  + 'title:title,'
  + 'creationDate:creationDate,'
  + 'sourceRefName:sourceRefName,'
  + 'mergeStatus:mergeStatus,'
  + 'isDraft:isDraft,'
  + 'createdBy:createdBy,'
  + 'labels:labels,'
  + 'reviewers:reviewers'
  + '}'

// every cell is a single code unit so chalk-table, which pads by string length, stays aligned
const MERGE_STATE_CELLS = {
  clean: '✅',
  conflict: '❌',
  checking: '⏳',
  unknown: '➖'
}

const CI_STATUS_CELLS = {
  approved: '✅',
  rejected: '❌',
  running: '⏳',
  none: '➖'
}

/**
 * @param {Object} options
 * @param {string} options.status
 * @param {string | undefined} options.author
 * @param {boolean | undefined} options.json
 */
export async function listAction (options) {
  const remoteInfo = await getRemoteInfo()

  if (!remoteInfo) {
    error('could not identify the forge of remote "origin", expected a GitHub or Azure DevOps url')
    process.exit(1)
  }

  if (remoteInfo.provider !== 'azure') {
    error('theo pr list only supports Azure DevOps repositories')
    info('for GitHub repositories use: gh pr list')
    process.exit(1)
  }

  // the listing costs one az call plus one per pull request, several seconds in total, so the
  // spinners are what keeps the command from looking hung
  const showProgress = shouldShowProgress({ json: options.json, isTty: process.stdout.isTTY })
  const listSpinner = showProgress ? ora('buscando pull requests...').start() : null

  const pullRequests = await runAzureCommand([
    'az', 'repos', 'pr', 'list',
    '--org', String(remoteInfo.organizationUrl),
    '--project', String(remoteInfo.project),
    '--repository', remoteInfo.repository,
    '--status', options.status,
    '--query', LIST_QUERY,
    '--output', 'json'
  ], { onError: () => listSpinner?.fail() })

  /** @type {AzurePullRequest[]} */
  const filtered = pullRequests.filter((/** @type {AzurePullRequest} */ pullRequest) => matchesAuthor(pullRequest, options.author))

  if (!filtered.length) {
    listSpinner?.stop()
    warn(`no ${options.status} pull request found in ${remoteInfo.project}/${remoteInfo.repository}`)
    return
  }

  // most recent first
  filtered.sort((/** @type {AzurePullRequest} */ left, /** @type {AzurePullRequest} */ right) => right.pullRequestId - left.pullRequestId)

  listSpinner?.succeed(`${filtered.length} pull request(s) encontrados`)

  const detailSpinner = showProgress ? ora(formatProgressLabel(0, filtered.length)).start() : null

  const details = await fetchDetails({
    pullRequests: filtered,
    remoteInfo,
    onProgress: (done) => { if (detailSpinner) detailSpinner.text = formatProgressLabel(done, filtered.length) }
  })

  detailSpinner?.stop()

  if (options.json) {
    console.log(JSON.stringify(details, null, 2))
    return
  }

  printTable({ details, remoteInfo })
}

/**
 * Fetches, per pull request, what the listing endpoint does not return: the build policy
 * evaluations and, on older Azure api versions, the labels.
 *
 * @param {{ pullRequests: AzurePullRequest[], remoteInfo: RemoteInfo, onProgress?: (done: number) => void }} params
 * @returns {Promise<AzurePullRequest[]>}
 */
async function fetchDetails ({ pullRequests, remoteInfo, onProgress }) {
  const labelsAreMissing = !Array.isArray(pullRequests[0]?.labels)

  let done = 0

  return mapWithConcurrency(pullRequests, DETAIL_CONCURRENCY, async (pullRequest) => {
    const [policies, labels] = await Promise.all([
      fetchPolicies({ pullRequest, remoteInfo }),
      labelsAreMissing ? fetchLabels({ pullRequest, remoteInfo }) : pullRequest.labels
    ])

    onProgress?.(++done)

    return { ...pullRequest, labels, policyEvaluations: policies }
  })
}

/**
 * @param {{ pullRequest: AzurePullRequest, remoteInfo: RemoteInfo }} params
 */
async function fetchPolicies ({ pullRequest, remoteInfo }) {
  return runAzureCommand([
    'az', 'repos', 'pr', 'policy', 'list',
    '--id', String(pullRequest.pullRequestId),
    '--org', String(remoteInfo.organizationUrl),
    '--output', 'json'
  ], { fallback: [] })
}

/**
 * @param {{ pullRequest: AzurePullRequest, remoteInfo: RemoteInfo }} params
 */
async function fetchLabels ({ pullRequest, remoteInfo }) {
  const detail = await runAzureCommand([
    'az', 'repos', 'pr', 'show',
    '--id', String(pullRequest.pullRequestId),
    '--org', String(remoteInfo.organizationUrl),
    '--output', 'json'
  ], { fallback: {} })

  return detail?.labels || []
}

/**
 * @param {{ details: AzurePullRequest[], remoteInfo: RemoteInfo }} params
 */
function printTable ({ details, remoteInfo }) {
  const now = new Date()

  const rows = details.map((/** @type {AzurePullRequest} */ pullRequest) => ({
    id: `#${pullRequest.pullRequestId}`,
    title: formatTitle(pullRequest),
    author: pullRequest.createdBy?.displayName || '',
    branch: shortRefName(pullRequest.sourceRefName),
    age: formatAge(pullRequest.creationDate, now),
    labels: formatLabels(pullRequest.labels) || dim('-'),
    conflict: MERGE_STATE_CELLS[resolveMergeState(pullRequest.mergeStatus)],
    ci: CI_STATUS_CELLS[resolveCiStatus(pullRequest.policyEvaluations)],
    review: formatVotes(summarizeVotes(pullRequest.reviewers))
  }))

  console.log('')
  console.log(chalkTable({
    columns: [
      { field: 'id', name: cyan('#') },
      { field: 'title', name: cyan('Título') },
      { field: 'author', name: cyan('Autor') },
      { field: 'branch', name: cyan('Branch') },
      { field: 'age', name: cyan('Idade') },
      { field: 'labels', name: cyan('Etiquetas') },
      { field: 'conflict', name: cyan('Merge') },
      { field: 'ci', name: cyan('CI') },
      { field: 'review', name: cyan('Review') }
    ]
  }, rows))

  console.log('')
  console.log(`${details.length} pull request(s) em ${remoteInfo.project}/${remoteInfo.repository}`)
  console.log(dim(buildAzurePullRequestUrl(remoteInfo, details[0].pullRequestId).replace(/\/pullrequest\/\d+$/, '/pullrequests')))
}

/**
 * @param {AzurePullRequest} pullRequest
 */
function formatTitle (pullRequest) {
  const title = truncate(pullRequest.title, TITLE_LIMIT)

  return pullRequest.isDraft ? `${yellow('[draft]')} ${title}` : title
}

/**
 * @param {import('./list-format.js').VoteSummary} summary
 */
function formatVotes (summary) {
  const parts = []

  if (summary.approved) parts.push(green(`✓${summary.approved}`))
  if (summary.rejected) parts.push(red(`✕${summary.rejected}`))
  if (summary.waiting) parts.push(yellow(`⏳${summary.waiting}`))
  if (summary.pending) parts.push(dim(`·${summary.pending}`))

  return parts.length ? parts.join(' ') : dim('-')
}
