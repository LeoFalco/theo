import { $ } from '../../core/exec.js'
import chalk from 'chalk'
import { info } from '../../core/patch-console-log.js'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
const { version } = require('./../../../package.json')

const { cyan } = chalk
class RebaseCommand {
  install ({ program }) {
    program
      .command('version')
      .description('show detail info of the current version of the CLI')
      .action(this.action.bind(this))
  }

  async action () {
    const workTree = join(homedir(), '.theo')
    const gitDir = join(workTree, '.git')
    const format = '%H%n%an%n%ad%n%s' // hash \n author \n date \n message

    const lastCommit = await $(['git', '--git-dir', gitDir, '--work-tree', workTree, 'log', '-n', '1', `--format=${format}`, '--date=iso'])

    const [hash, author, date, message] = lastCommit.split('\n')

    info(`${cyan('Version')} : ${version}`)
    info(`${cyan('Author')}  : ${author}`)
    info(`${cyan('Date')}    : ${date}`)
    info(`${cyan('Hash')}    : ${hash}`)
    info(`${cyan('Message')} : ${message}`)
  }
}

export default new RebaseCommand()
