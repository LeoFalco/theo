// @ts-check

import chalk from 'chalk'
import { format } from 'date-fns'
import open from 'open'
import { $ } from '../../core/exec.js'
import { error, info, warn } from '../../core/patch-console-log.js'
import { buildAzurePullRequestUrl, getRemoteInfo } from './remote.js'

const { bold, cyan, dim, green, red, yellow } = chalk

const GITHUB_JSON_FIELDS = 'number,title,state,isDraft,author,headRefName,baseRefName,mergeable,reviewDecision,url'

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

  await viewGithubPullRequest({ branch: String(branch), options })
}

/**
 * Delegates to the GitHub CLI, which already knows how to render a pull request.
 */
async function viewGithubPullRequest ({ branch, options }) {
  const commandParts = ['gh', 'pr', 'view', escapeArgument(branch)]

  if (options.web) commandParts.push('--web')
  if (options.json) commandParts.push('--json', GITHUB_JSON_FIELDS)

  const result = await $(commandParts.join(' '), {
    stdio: 'inherit',
    loading: false,
    disableLog: true,
    reject: false,
    returnProperty: 'all'
  }).catch(() => ({ success: false }))

  if (!result.success) process.exitCode = 1
}

async function viewAzurePullRequest ({ remoteInfo, branch, options }) {
  const command = [
    'az repos pr list',
    `--org ${remoteInfo.organizationUrl}`,
    `--project ${escapeArgument(remoteInfo.project)}`,
    `--repository ${escapeArgument(remoteInfo.repository)}`,
    `--source-branch ${escapeArgument(branch)}`,
    `--status ${escapeArgument(options.status)}`,
    '--output json'
  ].join(' ')

  const pullRequests = await runAzureCommand(command)

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

async function runAzureCommand (command) {
  const result = await $(command, {
    loading: false,
    disableLog: true,
    reject: false,
    returnProperty: 'all'
  }).catch(err => ({ success: false, stdout: '', stderr: err.shortMessage || err.message }))

  if (!result.success) {
    error('failed to query Azure DevOps')
    if (result.stderr) error(result.stderr)
    printAzureHint(result.stderr)
    process.exit(1)
  }

  return JSON.parse(result.stdout || '[]')
}

function printAzureHint (stderr) {
  const message = String(stderr || '')

  if (message.includes('ENOENT') || message.includes('command not found')) {
    info('install the Azure CLI: brew install azure-cli')
    return
  }

  if (message.includes('not in the') && message.includes('extension')) {
    info('install the devops extension: az extension add --name azure-devops')
    return
  }

  if (message.includes('az login') || message.includes('Unauthorized') || message.includes('TF400813')) {
    info('authenticate first: az login')
  }
}

function statusRank (pullRequest) {
  return pullRequest.status === 'active' ? 0 : 1
}

function shortRefName (refName) {
  return String(refName || '').replace(/^refs\/heads\//, '')
}

function formatDate (value) {
  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return null

  return format(date, 'dd/MM/yyyy HH:mm')
}

// execa splits the command on whitespace, so spaces need escaping
function escapeArgument (value) {
  return String(value ?? '').replaceAll(' ', '\\ ')
}
