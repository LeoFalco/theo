// @ts-check

import { execa, parseCommandString } from 'execa'

import chalk from 'chalk'
const { gray } = chalk

/**
 * @typedef {Object} ExecOptions
 * @property {boolean} [reject] - reject promise on error (default: true)
 * @property {'stdout' | 'stderr' | 'all'} [returnProperty] - what to return (default: stdout)
 * @property {boolean} [loading] - loading spinner (default: true)
 * @property { 'pipe'| 'inherit' | 'ignore' | 'overlapped' } [stdio] - stdio option for execa (default: pipe)
 * @property {boolean} [json] - parse output as JSON (default: false)
 * @property {string} [cwd] - working directory (default: process.cwd())
 * @property {number} [timeout] - timeout in milliseconds
 * @property {AbortSignal} [signal] - abort signal
 * @property {boolean} [disableLog] - do not log command (default: false)
 * @property {'buffer'} [encoding] - return raw bytes instead of a decoded string, for
 *   commands that do not write utf-8
 */

/**
 * @template [T=string]
 * @typedef {{ exitCode: number, success: boolean, stdout: T, stderr: T }} ExecResult
 */

/**
 * @overload
 * @param {string | string[]} command
 * @param {ExecOptions & { returnProperty: 'all', encoding: 'buffer' }} options
 * @returns {Promise<ExecResult<Uint8Array>>}
 */
/**
 * @overload
 * @param {string | string[]} command
 * @param {ExecOptions & { returnProperty: 'all' }} options
 * @returns {Promise<ExecResult>}
 */
/**
 * @overload
 * @param {string | string[]} command
 * @param {ExecOptions & { json: true }} options
 * @returns {Promise<any>}
 */
/**
 * @overload
 * @param {string | string[]} command
 * @param {ExecOptions} [options]
 * @returns {Promise<string>}
 */
/**
 * @param {string | string[]} command - command line, or an already split [file, ...args] tuple.
 *   The string form is parsed with shell-like escaping rules that drop backslashes and split on
 *   spaces, so pass the tuple whenever an argument may hold a filesystem path.
 * @param {ExecOptions} [options]
 * @returns {Promise<any>} - narrowed by the overloads above
 */
export async function $ (command, options) {
  options = options || {}
  options.disableLog = typeof options.disableLog === 'boolean' ? options.disableLog : false
  options.reject = typeof options.reject === 'boolean' ? options.reject : true
  options.returnProperty = options.returnProperty || 'stdout'
  options.loading = typeof options.loading === 'boolean' ? options.loading : true

  const [file, ...commandArguments] = Array.isArray(command)
    ? command
    : parseCommandString(command)

  const commandLine = Array.isArray(command) ? command.join(' ') : command

  // ora custa ~18 ms de import; só carrega quando o spinner é usado
  const spinner = options.loading
    ? (await import('ora')).default({ text: commandLine }).start()
    : null

  if (!options.loading && !options.disableLog) {
    console.log(gray('>'), commandLine)
  }

  const result = await execa(file, commandArguments, {
    cleanup: true,
    cwd: options.cwd,
    reject: options.reject,
    stdio: options.stdio || 'pipe',
    encoding: options.encoding,
    timeout: options.timeout,
    cancelSignal: options.signal

  })
    .then(result => {
      const success = result.exitCode === 0

      if (success) {
        spinner?.succeed()
      } else {
        spinner?.fail()
      }

      return result
    })
    .catch(err => {
      spinner?.fail()
      throw err
    })

  if (options.returnProperty === 'all') {
    return {
      exitCode: result.exitCode,
      success: result.exitCode === 0,
      stdout: trimOutput(result.stdout),
      stderr: trimOutput(result.stderr)
    }
  }

  const returnValue = /** @type {string | Uint8Array} */ (result[options.returnProperty])

  const returnValueAsString = typeof returnValue === 'string' ? returnValue.trim() : returnValue

  if (!options.json) {
    return returnValueAsString
  }

  if (!returnValueAsString) {
    return null
  }

  // json nunca é combinado com encoding: 'buffer'
  return JSON.parse(/** @type {string} */ (returnValueAsString))
}

/** @param {string | Uint8Array | undefined} value */
function trimOutput (value) {
  if (value == null || ArrayBuffer.isView(value)) return value

  return value.toString().trim()
}
