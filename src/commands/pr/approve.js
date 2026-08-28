// @ts-check

import chalk from 'chalk'
import { $ } from '../../core/exec.js'
import { error, info } from '../../core/patch-console-log.js'
import { parsePullRequestId, runAzureCommand } from './azure.js'
import { buildAzurePullRequestUrl, getRemoteInfo } from './remote.js'

const { bold, cyan, green } = chalk

/**
 * @typedef {import('./remote.js').RemoteInfo} RemoteInfo
 */

// same reason as the other azure queries: without --query the cli drops every accented character
const BRANCH_QUERY = '[].{pullRequestId:pullRequestId,title:title}'

/**
 * @param {Object} options
 * @param {string | undefined} options.id - pull request number, defaults to the current branch
 * @param {string | undefined} options.branch
 */
export async function approveAction (options) {
  const remoteInfo = await getRemoteInfo()

  if (!remoteInfo) {
    error('could not identify the forge of remote "origin", expected a GitHub or Azure DevOps url')
    process.exit(1)
  }

  if (options.id != null && options.branch) {
    error('use either the pull request number or --branch, not both')
    process.exit(1)
  }

  let pullRequestId = null

  if (options.id != null) {
    pullRequestId = parsePullRequestId(options.id)

    if (!pullRequestId) {
      error(`invalid pull request number: ${options.id}`)
      process.exit(1)
    }
  }

  if (remoteInfo.provider === 'github') {
    await approveGithubPullRequest({ target: pullRequestId ? String(pullRequestId) : await resolveBranch(options) })
    return
  }

  if (!pullRequestId) {
    pullRequestId = await findAzurePullRequestId({ remoteInfo, branch: await resolveBranch(options) })
  }

  await approveAzurePullRequest({ remoteInfo, pullRequestId })
}

/**
 * @param {{ branch: string | undefined }} options
 * @returns {Promise<string>}
 */
async function resolveBranch (options) {
  const branch = options.branch || await $('git rev-parse --abbrev-ref HEAD', { loading: false, disableLog: true })
    .then(result => result?.toString() || '')

  if (!branch || branch === 'HEAD') {
    error('could not resolve the current branch, inform the pull request number or use --branch')
    process.exit(1)
  }

  return String(branch)
}

/**
 * Delegates to the GitHub CLI, which accepts either a branch name or a pull request number.
 *
 * @param {{ target: string }} params
 */
async function approveGithubPullRequest ({ target }) {
  const result = await $(['gh', 'pr', 'review', target, '--approve'], {
    stdio: 'inherit',
    loading: false,
    disableLog: true,
    reject: false,
    returnProperty: 'all'
  }).catch(() => ({ success: false }))

  if (!result?.success) process.exitCode = 1
}

/**
 * @param {{ remoteInfo: RemoteInfo, branch: string }} params
 * @returns {Promise<number>}
 */
async function findAzurePullRequestId ({ remoteInfo, branch }) {
  const pullRequests = await runAzureCommand([
    'az', 'repos', 'pr', 'list',
    '--org', String(remoteInfo.organizationUrl),
    '--project', String(remoteInfo.project),
    '--repository', remoteInfo.repository,
    '--source-branch', branch,
    '--status', 'active',
    '--query', BRANCH_QUERY,
    '--output', 'json'
  ])

  if (!pullRequests.length) {
    error(`no active pull request found for branch '${branch}' in ${remoteInfo.project}/${remoteInfo.repository}`)
    process.exit(1)
  }

  if (pullRequests.length > 1) {
    error(`branch '${branch}' has more than one active pull request, inform the number:`)
    for (const pullRequest of pullRequests) {
      info(`  #${pullRequest.pullRequestId} ${pullRequest.title}`)
    }
    process.exit(1)
  }

  return pullRequests[0].pullRequestId
}

/**
 * @param {{ remoteInfo: RemoteInfo, pullRequestId: number }} params
 */
async function approveAzurePullRequest ({ remoteInfo, pullRequestId }) {
  const pullRequest = await runAzureCommand([
    'az', 'repos', 'pr', 'set-vote',
    '--id', String(pullRequestId),
    '--vote', 'approve',
    '--org', String(remoteInfo.organizationUrl),
    '--output', 'json'
  ])

  console.log(`${green('✓')} approved ${bold(`#${pullRequestId}`)}${pullRequest?.displayName ? ` as ${pullRequest.displayName}` : ''}`)
  console.log(`  ${cyan(buildAzurePullRequestUrl(remoteInfo, pullRequestId))}`)
}
