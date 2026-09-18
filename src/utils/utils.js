import { Chalk } from 'chalk'
import { differenceInDays, parseISO } from 'date-fns'

export const chalk = new Chalk()

export function isReady (pull) {
  return !pull.isDraft && !pull.labels.nodes.some((label) => label.name.toLowerCase().includes('wait'))
}

export function isApproved (pull) {
  return pull.reviewDecision === 'APPROVED' || pull.state === 'MERGED'
}

export function isRejected (pull) {
  return pull.reviewDecision === 'CHANGES_REQUESTED'
}

export function isMergeable (pull) {
  return pull.mergeable === 'MERGEABLE' || pull.state === 'MERGED'
}

export function isMerged (pull) {
  return pull.state === 'MERGED'
}

/**
 * Normalizes a list of team members (logins / unique names) into a lowercase set
 * for fast membership checks.
 * @param {Array<string>} [members]
 * @returns {Set<string>}
 */
export function toLowercaseSet (members) {
  return new Set((members || []).map((member) => String(member || '').toLowerCase()))
}

/**
 * @param {string | undefined} login
 * @param {string | undefined} name
 * @param {Set<string>} members - lowercase set of team member identifiers
 * @returns {boolean}
 */
export function isMemberOfTeam (login, name, members) {
  return members.has(String(login || '').toLowerCase()) || members.has(String(name || '').toLowerCase())
}

export function isQualityOk (pull, qualityUsers) {
  return pull.reviews.nodes.some((review) => {
    return review.author && qualityUsers.includes(review.author?.login) && review.state === 'APPROVED'
  })
}

export function hasPublishLabel (pull) {
  return pull.labels.nodes.some((label) => label.name.toLowerCase().includes('publish'))
}

export function isNotFreelance (pull) {
  return !pull.labels.nodes.find((label) => label.name.toLowerCase().includes('freelance'))
}

export function isNotWait (pull) {
  return !pull.labels.nodes.some((label) => label.name.toLowerCase().includes('wait'))
}

export function isChecksInProgress (pull) {
  return pull.checks
    .filter((check) => check.name !== 'PR Pattern')
    .some((check) => !check.conclusion || ['in_progress', 'queued', 'pending'].includes(check.conclusion))
}

export function isChecksPassed (pull) {
  const checksByName = pull.checks
    .filter((check) => check.name !== 'PR Pattern')
    .reduce((acc, check) => {
      acc[check.name] = acc[check.name] || []
      acc[check.name].push(check)
      return acc
    }, {})

  Object.keys(checksByName).forEach((name) => {
    checksByName[name] = checksByName[name].filter((check) => ['success', 'skipped'].includes(check.conclusion))
  })

  return Object.values(checksByName).every((checks) => checks.length > 0)
}

export const red = (param) => {
  const [key, value] = Object.entries(param)[0]
  return value ? chalk.green('✅ ' + key) : chalk.red('❌ ' + key)
}

export const coloredBoolean = (param) => {
  const [key, value] = Object.entries(param)[0]
  return value ? chalk.green('✅ ' + key) : chalk.red('❌ ' + key)
}

export const coloredPending = (param) => {
  const [key, value] = Object.entries(param)[0]
  return value ? chalk.yellow('⏳ ' + key) : null
}

export const calcAge = (pull) => {
  return Math.max(differenceInDays(Date.now(), parseISO(pull.createdAt)), 1)
}

export function padEnd (value, length) {
  return String(value || '')
    .padEnd(length, ' ')
    .substring(0, length)
}

export function formatTitle (title) {
  const titleAString = String(title || '')

  if (titleAString.includes('<>')) {
    return titleAString.substring(titleAString.indexOf('<>') + 2).trim()
  }

  if (titleAString.includes(' - ')) {
    return titleAString.substring(titleAString.indexOf(' - ') + 3).trim()
  }

  return titleAString
}

export function coloredStatus (status) {
  switch (status) {
    case 'in_progress':
      return chalk.yellow(status)
    case 'completed':
      return chalk.green(status)
    default:
      return chalk.blue(status)
  }
}

export function coloredConclusion (conclusion) {
  switch (conclusion) {
    case 'success':
      return chalk.green(conclusion)
    case 'skipped':
      return chalk.gray(conclusion)
    case null:
      return chalk.yellow('pending')
    case 'failure':
      return chalk.red(conclusion)
    default:
      return chalk.blue(conclusion)
  }
}
