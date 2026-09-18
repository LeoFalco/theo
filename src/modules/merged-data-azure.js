// @ts-check

import { differenceInBusinessDays, format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { runAzureCommand } from '../commands/pr/azure.js'
import { buildAzurePullRequestUrl } from '../commands/pr/remote.js'

// projecting the fields we use stops the azure cli from dropping every accented character of
// the response — it only does that when the command runs without --query
const LIST_QUERY = '[].{'
  + 'pullRequestId:pullRequestId,'
  + 'title:title,'
  + 'creationDate:creationDate,'
  + 'closedDate:closedDate,'
  + 'createdBy:createdBy'
  + '}'

/**
 * Fetches the completed (merged) pull requests of the current Azure DevOps repository and
 * normalizes them into the same shape `theo merged` uses for GitHub pulls.
 *
 * @param {import('../commands/pr/remote.js').RemoteInfo} remoteInfo
 * @param {string} from - 'yyyy-MM-dd'
 * @param {string} to - 'yyyy-MM-dd'
 * @returns {Promise<{ pulls: any[], memberStats: any[] }>}
 */
export async function fetchAzureMergedPRs (remoteInfo, from, to) {
  const pullRequests = await runAzureCommand([
    'az', 'repos', 'pr', 'list',
    '--org', String(remoteInfo.organizationUrl),
    '--project', String(remoteInfo.project),
    '--repository', remoteInfo.repository,
    '--status', 'completed',
    '--query', LIST_QUERY,
    '--output', 'json'
  ])

  const pulls = pullRequests
    .filter((pullRequest) => isMergedInRange(pullRequest, from, to))
    .map((pullRequest) => normalizeMergedPull({ pullRequest, remoteInfo }))
    .sort((left, right) => String(left.mergedAt).localeCompare(String(right.mergedAt)))

  const grouped = Object.groupBy(pulls, (pull) => pull.author?.login ?? 'unknown')
  const memberStats = Object.entries(grouped)
    .map(([author, memberPulls]) => ({
      author,
      count: memberPulls.length
    }))
    .sort((a, b) => b.count - a.count)

  return { pulls, memberStats }
}

/**
 * @param {Record<string, any>} pullRequest
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function isMergedInRange (pullRequest, from, to) {
  const closedDate = String(pullRequest.closedDate || '').split('T').shift()
  return Boolean(closedDate && closedDate >= from && closedDate <= to)
}

/**
 * @param {{ pullRequest: Record<string, any>, remoteInfo: import('../commands/pr/remote.js').RemoteInfo }} params
 * @returns {Record<string, any>}
 */
export function normalizeMergedPull ({ pullRequest, remoteInfo }) {
  const createdBy = pullRequest.createdBy || {}

  const days = (createdAt, mergedAt) => createdAt && mergedAt
    ? Math.max(differenceInBusinessDays(parseISO(mergedAt), parseISO(createdAt)), 1)
    : null

  const createdAt = formatZoned(pullRequest.creationDate)
  const mergedAt = formatZoned(pullRequest.closedDate)

  const title = String(pullRequest.title || '')

  return {
    url: buildAzurePullRequestUrl(remoteInfo, pullRequest.pullRequestId),
    title: title.length > 80 ? `${title.substring(0, 80)}...` : title,
    author: {
      login: createdBy.uniqueName || createdBy.displayName,
      name: createdBy.displayName
    },
    createdAt,
    mergedAt,
    durationDays: days(createdAt, mergedAt)
  }
}

/**
 * @param {string | undefined} value
 * @returns {string | null}
 */
function formatZoned (value) {
  if (!value) return null

  const date = parseISO(value)

  if (Number.isNaN(date.getTime())) return null

  return format(toZonedTime(date, 'America/Sao_Paulo'), 'yyyy-MM-dd HH:mm')
}
