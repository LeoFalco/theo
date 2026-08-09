// @ts-check

import { $ } from '../../core/exec.js'

/**
 * @typedef {Object} RemoteInfo
 * @property {'github' | 'azure'} provider
 * @property {string} owner - repository owner on GitHub, organization on Azure DevOps
 * @property {string} repository
 * @property {string} [project] - Azure DevOps only
 * @property {string} [organizationUrl] - Azure DevOps only
 * @property {string} url - the raw remote url
 */

// git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
// ssh://git@ssh.dev.azure.com:22/v3/{org}/{project}/{repo}
// {org}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}
const AZURE_SSH_PATTERN = /(?:ssh:\/\/)?(?:[^@/]+@)?(?:ssh\.dev\.azure\.com|vs-ssh\.visualstudio\.com)(?::\d+)?[:/]v3\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?\/?$/

// https://{org}@dev.azure.com/{org}/{project}/_git/{repo}
const AZURE_HTTPS_PATTERN = /https?:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/(.+)\/_git\/(.+?)(?:\.git)?\/?$/

// https://{org}.visualstudio.com/[DefaultCollection/]{project}/_git/{repo}
const AZURE_VISUAL_STUDIO_PATTERN = /https?:\/\/(?:[^@/]+@)?([^./]+)\.visualstudio\.com\/(?:DefaultCollection\/)?(.+)\/_git\/(.+?)(?:\.git)?\/?$/

// git@github.com:{owner}/{repo}.git and https://github.com/{owner}/{repo}.git
const GITHUB_PATTERN = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/

/**
 * Identifies the forge behind a git remote url.
 *
 * @param {string} url
 * @returns {RemoteInfo | null}
 */
export function parseRemoteUrl (url) {
  const remoteUrl = (url || '').trim()

  if (!remoteUrl) return null

  const azureMatch = remoteUrl.match(AZURE_SSH_PATTERN)
    || remoteUrl.match(AZURE_HTTPS_PATTERN)
    || remoteUrl.match(AZURE_VISUAL_STUDIO_PATTERN)

  if (azureMatch) {
    const [, organization, project, repository] = azureMatch

    return {
      provider: 'azure',
      owner: decode(organization),
      project: decode(project),
      repository: decode(repository),
      organizationUrl: `https://dev.azure.com/${organization}`,
      url: remoteUrl
    }
  }

  const githubMatch = remoteUrl.match(GITHUB_PATTERN)

  if (githubMatch) {
    const [, owner, repository] = githubMatch

    return {
      provider: 'github',
      owner: decode(owner),
      repository: decode(repository),
      url: remoteUrl
    }
  }

  return null
}

/**
 * Reads the remote url of the current repository and identifies its forge.
 *
 * @param {Object} [options]
 * @param {string} [options.remote] - remote name (default: origin)
 * @returns {Promise<RemoteInfo | null>}
 */
export async function getRemoteInfo (options) {
  const remote = options?.remote || 'origin'

  const url = await $(`git remote get-url ${remote}`, { loading: false, disableLog: true })
    .then(result => result?.toString() || '')
    .catch(() => '')

  return parseRemoteUrl(url)
}

/**
 * Builds the browser url of an Azure DevOps pull request.
 *
 * @param {RemoteInfo} remoteInfo
 * @param {number} pullRequestId
 * @returns {string}
 */
export function buildAzurePullRequestUrl (remoteInfo, pullRequestId) {
  const organization = encodeURIComponent(remoteInfo.owner)
  const project = encodeURIComponent(remoteInfo.project || '')
  const repository = encodeURIComponent(remoteInfo.repository)

  return `https://dev.azure.com/${organization}/${project}/_git/${repository}/pullrequest/${pullRequestId}`
}

function decode (value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
