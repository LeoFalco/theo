// @ts-check

import chalk from 'chalk'
import { format } from 'date-fns'
import open from 'open'
import { $ } from '../../core/exec.js'
import { error, info, warn } from '../../core/patch-console-log.js'
import { parsePullRequestId, runAzureCommand, shortRefName } from './azure.js'
import { buildAzurePullRequestUrl, getRemoteInfo } from './remote.js'

const { bold, cyan, dim, green, red, yellow } = chalk

const GITHUB_JSON_FIELDS = 'number,title,state,isDraft,author,headRefName,baseRefName,mergeable,reviewDecision,url'

// projecting the fields we print stops the azure cli from dropping every accented character of
// the response — it only does that when the command runs without --query
const SHOW_QUERY = '{'
  + 'pullRequestId:pullRequestId,'
  + 'title:title,'
  + 'status:status,'
  + 'isDraft:isDraft,'
  + 'creationDate:creationDate,'
  + 'sourceRefName:sourceRefName,'
  + 'targetRefName:targetRefName,'
  + 'createdBy:createdBy,'
  + 'mergeStatus:mergeStatus,'
  + 'mergeFailureMessage:mergeFailureMessage,'
  + 'autoCompleteSetBy:autoCompleteSetBy,'
  + 'reviewers:reviewers,'
  + 'repository:repository'
  + '}'

const AZURE_VOTE_LABELS = {
  '10': green('approved'),
  '5': green('approved with suggestions'),
  '0': dim('no vote'),
  '-5': yellow('waiting for author'),
  '-10': red('rejected')
}

const AZURE_STATUS_LABELS = {
  active: green('active'),
  completed: cyan('completed'),
  abandoned: dim('abandoned')
}

/**
 * @param {Object} options
 * @param {string | undefined} options.id - pull request number, defaults to the current branch
 * @param {string | undefined} options.branch
 * @param {boolean | undefined} options.web
 * @param {boolean | undefined} options.json
 * @param {string} options.status
 */
export async function viewAction (options) {
  const remoteInfo = await getRemoteInfo()

  if (!remoteInfo) {
    error('could not identify the forge of remote "origin", expected a GitHub or Azure DevOps url')
    process.exit(1)
  }

  if (options.id != null) {
    if (options.branch) {
      error('use either the pull request number or --branch, not both')
      process.exit(1)
    }

    const pullRequestId = parsePullRequestId(options.id)

    if (!pullRequestId) {
      error(`invalid pull request number: ${options.id}`)
      process.exit(1)
    }

    if (remoteInfo.provider === 'azure') {
      await viewAzurePullRequestById({ remoteInfo, pullRequestId, options })
      return
    }

    await viewGithubPullRequest({ target: String(pullRequestId), options })
    return
  }

  const branch = options.branch || await $('git rev-parse --abbrev-ref HEAD', { loading: false, disableLog: true })
    .then(result => result?.toString() || '')

  if (!branch || branch === 'HEAD') {
    error('could not resolve the current branch, use --branch to inform it')
    process.exit(1)
  }

  if (remoteInfo.provider === 'azure') {
    await viewAzurePullRequest({ remoteInfo, branch: String(branch), options })
    return
  }

  await viewGithubPullRequest({ target: String(branch), options })
}

/**
 * Delegates to the GitHub CLI, which already knows how to render a pull request and accepts
 * either a branch name or a pull request number as its target.
 */
async function viewGithubPullRequest ({ target, options }) {
  const commandParts = ['gh', 'pr', 'view', target]

  if (options.web) commandParts.push('--web')
  if (options.json) commandParts.push('--json', GITHUB_JSON_FIELDS)

  const result = await $(commandParts, {
    stdio: 'inherit',
    loading: false,
    disableLog: true,
    reject: false,
    returnProperty: 'all'
  }).catch(() => ({ success: false }))

  if (!result.success) process.exitCode = 1
}

async function viewAzurePullRequestById ({ remoteInfo, pullRequestId, options }) {
  if (options.web) {
    const url = buildAzurePullRequestUrl(remoteInfo, pullRequestId)
    info(`opening ${url}`)
    await open(url)
    return
  }

  const pullRequest = await runAzureCommand([
    'az', 'repos', 'pr', 'show',
    '--id', String(pullRequestId),
    '--org', String(remoteInfo.organizationUrl),
    '--query', SHOW_QUERY,
    '--output', 'json'
  ])

  if (!pullRequest?.pullRequestId) {
    warn(`pull request #${pullRequestId} not found in ${remoteInfo.owner}`)
    process.exitCode = 1
    return
  }

  if (options.json) {
    console.log(JSON.stringify(pullRequest, null, 2))
    return
  }

  // pull request ids are unique across the organization, so the id may belong to another
  // repository — the url has to follow the payload, not the current remote
  printAzurePullRequest({ pullRequest, remoteInfo: resolveRepositoryInfo({ remoteInfo, pullRequest }) })
}

/**
 * Points the url at the repository the pull request actually lives in.
 */
function resolveRepositoryInfo ({ remoteInfo, pullRequest }) {
  const repository = pullRequest.repository

  if (!repository?.name) return remoteInfo

  return {
    ...remoteInfo,
    repository: repository.name,
    project: repository.project?.name || remoteInfo.project
  }
}

async function viewAzurePullRequest ({ remoteInfo, branch, options }) {
  const pullRequests = await runAzureCommand([
    'az', 'repos', 'pr', 'list',
    '--org', remoteInfo.organizationUrl,
    '--project', remoteInfo.project,
    '--repository', remoteInfo.repository,
    '--source-branch', branch,
    '--status', options.status,
    '--output', 'json'
  ])

  if (!pullRequests.length) {
    warn(`no pull request found for branch '${branch}' in ${remoteInfo.project}/${remoteInfo.repository}`)
    process.exitCode = 1
    return
  }

  // active pull requests first, then the most recent ones
  pullRequests.sort((left, right) => {
    return statusRank(left) - statusRank(right) || right.pullRequestId - left.pullRequestId
  })

  if (options.json) {
    console.log(JSON.stringify(pullRequests, null, 2))
    return
  }

  if (options.web) {
    const url = buildAzurePullRequestUrl(remoteInfo, pullRequests[0].pullRequestId)
    info(`opening ${url}`)
    await open(url)
    return
  }

  for (const pullRequest of pullRequests) {
    printAzurePullRequest({ pullRequest, remoteInfo })
  }
}

function printAzurePullRequest ({ pullRequest, remoteInfo }) {
  const status = AZURE_STATUS_LABELS[pullRequest.status] || pullRequest.status
  const draft = pullRequest.isDraft ? yellow(' draft') : ''

  console.log('')
  console.log(`${bold(`#${pullRequest.pullRequestId}`)} ${status}${draft} ${bold(pullRequest.title)}`)

  printField('branch', `${shortRefName(pullRequest.sourceRefName)} -> ${shortRefName(pullRequest.targetRefName)}`)
  printField('author', pullRequest.createdBy?.displayName)
  printField('created', formatDate(pullRequest.creationDate))
  printField('merge', pullRequest.mergeFailureMessage || pullRequest.mergeStatus)
  printField('auto complete', pullRequest.autoCompleteSetBy?.displayName
    ? `set by ${pullRequest.autoCompleteSetBy.displayName}`
    : dim('off'))
  printField('reviewers', formatReviewers(pullRequest.reviewers))
  printField('url', cyan(buildAzurePullRequestUrl(remoteInfo, pullRequest.pullRequestId)))
}

function printField (label, value) {
  if (!value) return
  console.log(`  ${dim(label.padEnd(14))}${value}`)
}

function formatReviewers (reviewers) {
  if (!reviewers?.length) return dim('none')

  return reviewers
    .map(reviewer => {
      const vote = AZURE_VOTE_LABELS[String(reviewer.vote)] ?? reviewer.vote
      const required = reviewer.isRequired ? ' *' : ''
      return `${reviewer.displayName}${required} (${vote})`
    })
    .join(', ')
}

function statusRank (pullRequest) {
  return pullRequest.status === 'active' ? 0 : 1
}

function formatDate (value) {
  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return null

  return format(date, 'dd/MM/yyyy HH:mm')
}
