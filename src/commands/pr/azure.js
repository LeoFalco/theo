// @ts-check

import { $ } from '../../core/exec.js'
import { error, info } from '../../core/patch-console-log.js'

const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
const windows1252Decoder = new TextDecoder('windows-1252')

/**
 * Decodes the raw bytes of an Azure CLI command.
 *
 * On Windows the CLI writes windows-1252 whenever its stdout is a pipe, which turns every
 * accented character into a decoding error if the bytes are read as utf-8. Valid utf-8 is
 * kept as is, anything else falls back to windows-1252.
 *
 * @param {Buffer | Uint8Array | string | undefined} output
 * @returns {string}
 */
export function decodeAzureOutput (output) {
  if (output == null) return ''
  if (typeof output === 'string') return output

  try {
    return utf8Decoder.decode(output)
  } catch {
    return windows1252Decoder.decode(output)
  }
}

/**
 * Runs an Azure CLI command and parses its json output.
 * Exits the process with an actionable hint when the CLI is missing or unauthenticated,
 * unless a fallback is given — handy for the per pull request calls, where one failure
 * should not take the whole listing down.
 *
 * @param {string[]} command
 * @param {Object} [options]
 * @param {any} [options.fallback] - value returned instead of exiting when the command fails
 * @param {() => void} [options.onError] - called before the fatal error is printed, so a caller
 *   holding a spinner can close its line first
 * @returns {Promise<any>}
 */
export async function runAzureCommand (command, options) {
  const result = await $(command, {
    loading: false,
    disableLog: true,
    reject: false,
    encoding: 'buffer',
    returnProperty: 'all'
  }).catch(err => ({ success: false, stdout: '', stderr: err.shortMessage || err.message }))

  const stdout = decodeAzureOutput(result.stdout).trim()
  const stderr = decodeAzureOutput(result.stderr).trim()

  if (!result.success) {
    if (options && 'fallback' in options) return options.fallback

    options?.onError?.()

    error('failed to query Azure DevOps')
    if (stderr) error(stderr)
    printAzureHint(stderr)
    process.exit(1)
  }

  try {
    return JSON.parse(stdout || '[]')
  } catch {
    if (options && 'fallback' in options) return options.fallback
    throw new Error(`Azure DevOps returned an unexpected payload: ${stdout}`)
  }
}

/**
 * @param {string} stderr
 */
export function printAzureHint (stderr) {
  const message = String(stderr || '')

  if (message.includes('ENOENT') || message.includes('command not found')) {
    info('install the Azure CLI: https://learn.microsoft.com/cli/azure/install-azure-cli')
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

/**
 * @param {string} refName
 * @returns {string}
 */
export function shortRefName (refName) {
  return String(refName || '').replace(/^refs\/heads\//, '')
}

/**
 * Normalizes a pull request id coming from the command line.
 * Accepts '6411', ' 6411 ' and '#6411', rejects anything that is not a positive integer.
 *
 * @param {string | number | undefined} value
 * @returns {number | null}
 */
export function parsePullRequestId (value) {
  const text = String(value ?? '').trim().replace(/^#/, '')

  if (!/^\d+$/.test(text)) return null

  const id = Number(text)

  return id > 0 ? id : null
}
