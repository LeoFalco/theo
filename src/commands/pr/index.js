// @ts-check

import { viewAction } from './view.js'

class PrCommand {
  /**
   * @param {Object} param
   * @param {import('commander').Command} param.program
   * */
  install ({ program }) {
    const pr = program
      .command('pr')
      .description('inspect pull requests of the current repository')

    pr
      .command('view')
      .description('show the pull request of the current branch, on GitHub or Azure DevOps')
      .option('-b, --branch <branch>', 'branch to look up instead of the current one')
      .option('-w, --web', 'open the pull request in the browser')
      .option('--json', 'print the raw payload as json')
      .option('-s, --status <status>', 'azure devops only: active, completed, abandoned or all', 'all')
      .action(viewAction)
  }
}

export default new PrCommand()
