import { Command as Commander } from 'commander'
import { installCommands } from './commands/index.js'
import { readPackageJSON } from './utils/read-package-json.js'
// import { checkUpdate } from './core/check-update.js'
import chalk from 'chalk'
import { error, info } from './core/patch-console-log.js'
const { red } = chalk

export async function run () {
  try {
    // await checkUpdate()
    const program = await createProgram()
    await installCommands({ program })
    await program.parseAsync()
  } catch (err) {
    const isUnknownError = !err.message.includes('User force closed the prompt')
    if (isUnknownError) {
      error(formatErrorMessage(err))
      error(err.stack)
    } else {
      info(err.message)
    }
    process.exitCode = 1
  }
}

async function createProgram () {
  const program = new Commander()
  const packageJSON = await readPackageJSON()

  return program
    .name('theo')
    .version(packageJSON.version)
    .description(packageJSON.description)
}

function formatErrorMessage (error) {
  return error.message
    .split('\n')
    .map((line, index) => {
      if (index === 0) return line
      return ' '.repeat(7) + line
    })
    .map((line) => red(line))
    .join('\n')
}

run()
