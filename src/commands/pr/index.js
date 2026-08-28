// @ts-check

import { approveAction } from './approve.js'
import { listAction } from './list.js'
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
      .description('show a pull request, by number or from the current branch, on GitHub or Azure DevOps')
      .argument('[id]', 'pull request number, defaults to the pull request of the current branch')
      .option('-b, --branch <branch>', 'branch to look up instead of the current one')
      .option('-w, --web', 'open the pull request in the browser')
      .option('--json', 'print the raw payload as json')
      .option('-s, --status <status>', 'azure devops only: active, completed, abandoned or all', 'all')
      .action((id, options) => viewAction({ ...options, id }))

    pr
      .command('approve')
      .description('approve a pull request, by number or from the current branch')
      .argument('[id]', 'pull request number, defaults to the pull request of the current branch')
      .option('-b, --branch <branch>', 'branch to look up instead of the current one')
      .action((id, options) => approveAction({ ...options, id }))

    pr
      .command('list')
      .description('list the pull requests of the current repository as a table (Azure DevOps)')
      .option('-s, --status <status>', 'active, completed, abandoned or all', 'active')
      .option('-a, --author <term>', 'filter by author, matches part of the name or e-mail')
      .option('--json', 'print the raw payload as json')
      .action(listAction)
  }
}

export default new PrCommand()
