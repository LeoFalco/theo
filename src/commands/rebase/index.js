import { $ } from '../../core/exec.js'
import { resolveDefaultBranch } from '../../core/default-branch.js'
import { error, info, warn } from '../../core/patch-console-log.js'

class RebaseCommand {
  install ({ program }) {
    program
      .command('rebase')
      .description('rebase the current branch on top of the default branch')
      .option('-p, --push', 'force the rebase')
      .option('-f, --force', 'force the rebase')
      .option('-b, --base-branch <branch>', 'specify the base branch')
      .action(this.action.bind(this))
  }

  async action (options) {
    const statusResult = await $('git status --porcelain')
    if (statusResult && statusResult.length) {
      error('Repo is dirty, please commit or stash changes before running this script')
      process.exit(1)
    }

    const currentBranchName = await $('git rev-parse --abbrev-ref HEAD')

    const baseBranch = options.baseBranch || await resolveDefaultBranch()

    await $('git fetch')
    await $('git remote prune origin')
    await $(`git checkout ${baseBranch}`)
    await $(`git pull origin ${baseBranch}`)

    await $(`git checkout ${currentBranchName}`)
    await $(`git rebase ${baseBranch}`)

    const isCurrentBranchAlreadyMerged = await $(`git branch --merged ${baseBranch}`)
      .then((result) => {
        return result.split('\n')
          .map((branchName) => branchName.replace(/^\*\s*/, ''))
          .map((branchName) => branchName.trim())
          .filter((branchName) => branchName !== baseBranch)
          .filter((branchName) => !branchName.startsWith(baseBranch))
          .some((branchName) => branchName === currentBranchName)
      })

    if (isCurrentBranchAlreadyMerged) {
      info('Current branch is already merged, deleting it')
      await $(`git checkout ${baseBranch}`)
      await $(`git branch -D ${currentBranchName}`)
    }

    if (options.push && !isCurrentBranchAlreadyMerged && currentBranchName !== baseBranch) {
      const authorEmail = await $('git config user.email')
      const branchAuthorEmail = await $(`git log -1 --pretty=format:"%ae" ${currentBranchName}`)

      if (authorEmail !== branchAuthorEmail) {
        if (options.force) {
          warn(`You are not the author of the branch ${currentBranchName}, but pushing anyway`)
        } else {
          error(`You are not the author of the branch ${currentBranchName}, skipping push, use --force to override`)
          process.exit(1)
        }
      }

      await $(`git push -u origin ${currentBranchName} --force --no-verify`)
    }
  }
}

export default new RebaseCommand()
