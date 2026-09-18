// @ts-check

import { runAzureCommand } from '../commands/pr/azure.js'
import { $ } from './exec.js'
import { TEAMS } from './constants.js'
import { requireGithubOrg } from './env.js'

/**
 * @typedef {Object} Team
 * @property {string} name
 * @property {string} [slug] - GitHub team slug, used to resolve its members
 */

/**
 * @typedef {Object} TeamSource
 * @property {'github' | 'azure'} provider
 * @property {string} [organization] - GitHub organization login (defaults to GITHUB_ORG)
 * @property {string} [organizationUrl] - Azure DevOps organization url
 * @property {string} [project] - Azure DevOps project
 */

/**
 * Lists the selectable teams of a source. GitHub org teams come from
 * `gh api /orgs/{org}/teams`; Azure DevOps teams from `az devops team list`.
 * When the org cannot be queried or has no teams, the local team list in
 * src/core/constants.js is used instead.
 *
 * @param {TeamSource} source
 * @returns {Promise<Array<Team>>}
 */
export async function fetchTeams (source) {
  const teams = source.provider === 'azure'
    ? await fetchAzureTeams(source)
    : await fetchGithubTeams(source)

  if (teams.length > 0) return teams

  console.warn('Não foi possível consultar os times da organização, usando a lista local (src/core/constants.js)')
  return Object.keys(TEAMS).map((name) => ({ name }))
}

/**
 * Resolves the members of a team — github logins or azure unique names —
 * falling back to the local team list when the remote query fails or the team
 * has no members.
 *
 * @param {TeamSource} source
 * @param {Team} team
 * @returns {Promise<string[]>}
 */
export async function resolveTeamMembers (source, team) {
  const remoteMembers = source.provider === 'azure'
    ? await fetchAzureTeamMembers(source, team.name)
    : await fetchGithubTeamMembers(source, team)

  if (remoteMembers.length > 0) return remoteMembers

  const localMembers = TEAMS[team.name]
  return localMembers ? [...localMembers] : []
}

/**
 * @param {TeamSource} source
 * @returns {Promise<Array<Team>>}
 */
async function fetchGithubTeams (source) {
  const org = source.organization || requireGithubOrg()

  const result = await $(
    ['gh', 'api', '--paginate', `/orgs/${org}/teams`],
    { loading: false, disableLog: true, reject: false, returnProperty: 'all' }
  )

  if (!result.success || !result.stdout) return []

  return parseJsonArray(result.stdout)
    .map((team) => ({ name: String(team?.name || ''), slug: String(team?.slug || '') }))
    .filter((team) => team.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * @param {TeamSource} source
 * @param {Team} team
 * @returns {Promise<string[]>}
 */
async function fetchGithubTeamMembers (source, team) {
  const org = source.organization || requireGithubOrg()
  if (!team.slug) return []

  const result = await $(
    ['gh', 'api', '--paginate', `/orgs/${org}/teams/${team.slug}/members`],
    { loading: false, disableLog: true, reject: false, returnProperty: 'all' }
  )

  if (!result.success || !result.stdout) return []

  return parseJsonArray(result.stdout)
    .map((member) => String(member?.login || ''))
    .filter(Boolean)
    .sort()
}

/**
 * @param {TeamSource} source
 * @returns {Promise<Array<Team>>}
 */
async function fetchAzureTeams (source) {
  const { organizationUrl, project } = source
  if (!organizationUrl || !project) return []

  const teams = await runAzureCommand([
    'az', 'devops', 'team', 'list',
    '--org', organizationUrl,
    '--project', project,
    '--query', '[].{name:name,id:id}',
    '--output', 'json'
  ])

  return (teams || [])
    .map((team) => ({ name: String(team?.name || '') }))
    .filter((team) => team.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * @param {TeamSource} source
 * @param {string} teamName
 * @returns {Promise<string[]>}
 */
async function fetchAzureTeamMembers (source, teamName) {
  const { organizationUrl, project } = source
  if (!organizationUrl || !project || !teamName) return []

  const members = await runAzureCommand([
    'az', 'devops', 'team', 'list-member',
    '--org', organizationUrl,
    '--project', project,
    '--team', teamName,
    '--query', '[].{uniqueName:identity.uniqueName,displayName:identity.displayName}',
    '--output', 'json'
  ])

  return (members || [])
    .map((member) => String(member?.uniqueName || member?.displayName || ''))
    .filter(Boolean)
    .sort()
}

/**
 * @param {string | undefined} stdout
 * @returns {Array<any>}
 */
function parseJsonArray (stdout) {
  if (!stdout) return []
  try {
    const parsed = JSON.parse(stdout)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
