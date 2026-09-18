// @ts-check

import { differenceInDays, parseISO } from 'date-fns'
import { runAzureCommand } from '../commands/pr/azure.js'
import { resolveCiStatus, resolveMergeState, summarizeVotes } from '../commands/pr/list-format.js'
import { buildAzurePullRequestUrl } from '../commands/pr/remote.js'
import { mapWithConcurrency } from '../utils/concurrency.js'

// projecting the fields we use stops the azure cli from dropping every accented character of
// the response — it only does that when the command runs without --query
const LIST_QUERY = '[].{'
  + 'pullRequestId:pullRequestId,'
  + 'title:title,'
  + 'creationDate:creationDate,'
  + 'mergeStatus:mergeStatus,'
  + 'isDraft:isDraft,'
  + 'createdBy:createdBy,'
  + 'reviewers:reviewers'
  + '}'

const DETAIL_CONCURRENCY = 8

/**
 * Fetches the open pull requests of the current Azure DevOps repository and normalizes them
 * into the same shape `theo opened` uses for GitHub pulls.
 *
 * @param {import('../commands/pr/remote.js').RemoteInfo} remoteInfo
 * @returns {Promise<{ pulls: any[], memberStats: any[], totalPrs: number, avgAge: number }>}
 */
export async function fetchAzureOpenedPRs (remoteInfo) {
  const pullRequests = await runAzureCommand([
    'az', 'repos', 'pr', 'list',
    '--org', String(remoteInfo.organizationUrl),
    '--project', String(remoteInfo.project),
    '--repository', remoteInfo.repository,
    '--status', 'active',
    '--query', LIST_QUERY,
    '--output', 'json'
  ])

  const details = await mapWithConcurrency(pullRequests, DETAIL_CONCURRENCY, async (pullRequest) => {
    const policyEvaluations = await runAzureCommand([
      'az', 'repos', 'pr', 'policy', 'list',
      '--id', String(pullRequest.pullRequestId),
      '--org', String(remoteInfo.organizationUrl),
      '--output', 'json'
    ], { fallback: [] })

    return { ...pullRequest, policyEvaluations }
  })

  const pulls = details
    .map((pullRequest) => normalizeAzurePull({ pullRequest, remoteInfo }))
    .sort((left, right) => (right.age ?? 0) - (left.age ?? 0))

  return buildStats(pulls)
}

/**
 * Maps an Azure pull request payload onto the shape consumed by `theo opened`.
 * `quality` is left unset: the quality gate only exists on GitHub.
 *
 * @param {{ pullRequest: Record<string, any>, remoteInfo: import('../commands/pr/remote.js').RemoteInfo }} params
 * @returns {Record<string, any>}
 */
export function normalizeAzurePull ({ pullRequest, remoteInfo }) {
  const reviews = summarizeVotes(pullRequest.reviewers)
  const ci = resolveCiStatus(pullRequest.policyEvaluations)
  const mergeState = resolveMergeState(pullRequest.mergeStatus)

  const createdBy = pullRequest.createdBy || {}

  return {
    url: buildAzurePullRequestUrl(remoteInfo, pullRequest.pullRequestId),
    title: String(pullRequest.title || ''),
    author: {
      login: createdBy.uniqueName || createdBy.displayName,
      name: createdBy.displayName
    },
    ready: !pullRequest.isDraft,
    mergeable: mergeState === 'clean',
    checks: ci === 'approved' || ci === 'none',
    checksInProgress: ci === 'running',
    approved: reviews.approved > 0,
    notRejected: reviews.waiting === 0 && reviews.rejected === 0,
    age: calcAge(pullRequest.creationDate)
  }
}

/**
 * @param {Array<Record<string, any>>} pulls
 * @returns {{ pulls: any[], memberStats: any[], totalPrs: number, avgAge: number }}
 */
function buildStats (pulls) {
  const grouped = Object.groupBy(pulls, (pull) => pull.author?.login ?? 'unknown')
  const memberStats = Object.entries(grouped)
    .map(([author, memberPulls]) => ({
      author,
      count: memberPulls.length,
      oldestAge: Math.max(...memberPulls.map((pull) => pull.age ?? 0))
    }))
    .sort((left, right) => right.count - left.count)

  const totalPrs = pulls.length
  const ages = pulls.map((pull) => pull.age ?? 0)
  const avgAge = totalPrs > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / totalPrs) : 0

  return { pulls, memberStats, totalPrs, avgAge }
}

/**
 * @param {string | undefined} creationDate
 * @returns {number}
 */
function calcAge (creationDate) {
  const created = parseISO(String(creationDate || ''))

  if (Number.isNaN(created.getTime())) return 1

  return Math.max(differenceInDays(Date.now(), created), 1)
}
