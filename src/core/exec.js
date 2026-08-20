// @ts-check

import { execa, parseCommandString } from 'execa'
import ora from 'ora'

import chalk from 'chalk'
const { gray } = chalk

/**
 * @param {string | string[]} command - command line, or an already split [file, ...args] tuple.
 *   The string form is parsed with shell-like escaping rules that drop backslashes and split on
 *   spaces, so pass the tuple whenever an argument may hold a filesystem path.
 * @param {Object} [options] - options
 * @param {boolean} [options.reject] - reject promise on error (default: true)
 * @param {string} [options.returnProperty] - stdout | stderr
 * @param {boolean} [options.loading] - loading spinner (default: true)
 * @param { 'pipe'| 'inherit' | 'ignore' | 'overlapped' } [options.stdio] - stdio option for execa (default: pipe)
 * @param {boolean} [options.json] - parse output as JSON (default: false)
 * @param {string} [options.cwd] - working directory (default: process.cwd())
 * @param {number} [options.timeout] - timeout in milliseconds
 * @param {AbortSignal} [options.signal] - abort signal
 * @param {boolean} [options.disableLog] - do not log command (default: false)
 * @returns {Promise<string | null | Object>} - command output
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

  const spinner = options.loading
    ? ora({ text: commandLine }).start()
    : null

  if (!options.loading && !options.disableLog) {
    console.log(gray('>'), commandLine)
  }

  const result = await execa(file, commandArguments, {
    cleanup: true,
    cwd: options.cwd,
    reject: options.reject,
    stdio: options.stdio || 'pipe',
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
      stdout: result.stdout?.toString().trim(),
      stderr: result.stderr?.toString().trim()
    }
  }

  const returnValue = result[options.returnProperty]

  const returnValueAsString = typeof returnValue === 'string' ? returnValue.trim() : returnValue

  if (!options.json) {
    return returnValueAsString
  }

  if (!returnValueAsString) {
    return null
  }

  return JSON.parse(returnValueAsString)
}
