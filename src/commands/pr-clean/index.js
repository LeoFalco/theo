// @ts-check

import inquirer from 'inquirer'
import { $ } from '../../core/exec.js'
import { info, warn } from '../../core/patch-console-log.js'

class PrCleanCommand {
  /**
   *
   * @param {Object} param
   * @param {import('commander').Command} param.program
   * @returns
   * */
  install ({ program }) {
    program
      .command('pr-clean')
      .description('clean remote branches that have merged PRs')
      .action(this.action.bind(this))
  }

  async action () {
    await $('git fetch --all --prune', { stdio: 'inherit' })

    const remoteBranches = await $('git branch -r')
      .then((output) => output.split('\n'))
      .then((branches) => branches.map((branch) => branch.trim()))
      .then((branches) => branches.filter((branch) => branch !== ''))
      .then((branches) => branches.filter((branch) => !branch.includes('->'))) // Remove HEAD -> origin/master
      .then((branches) => branches.map((branch) => branch.replace('origin/', '')))
      .then((branches) => branches.filter((branch) => !['master', 'main', 'homolog', 'production', 'qa', 'development', 'preview'].includes(branch)))
      .then((branches) => branches.filter((branch) => !branch.startsWith('dependabot/')))
      .then((branches) => branches.filter((branch) => !branch.startsWith('wiki/')))

    if (remoteBranches.length === 0) {
      info('No remote branches to check.')
      return
    }

    info(`Checking ${remoteBranches.length} remote branches for merged PRs...`)

    // shortcut: só os 1000 PRs mais recentes; branch cujo PR é mais antigo fica de fora (não é apagada)
    const pulls = await $('gh pr list --state all --limit 1000 --json headRefName,state,url,isCrossRepository', { json: true })
    const mergedBranches = findMergedBranches(remoteBranches, pulls)

    for (const { branch, url } of mergedBranches) {
      info(`Found merged PR for branch ${branch}: ${url}`)
    }

    if (mergedBranches.length === 0) {
      info('No branches with merged PRs found.')
      return
    }

    // Delete local branches first
    const localBranches = await $('git branch')
      .then((output) => output.split('\n'))
      .then((branches) => branches.map((branch) => branch.trim().replace('* ', '')))

    for (const { branch } of mergedBranches) {
      if (localBranches.includes(branch)) {
        info(`Deleting local branch ${branch}`)
        await $(`git branch -D ${branch}`).catch(e => warn(`Failed to delete local branch ${branch}: ${e.message}`))
      }
    }

    // Prompt to delete remote branches
    const { remoteBranchesToDelete } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'remoteBranchesToDelete',
      message: 'Select remote branches to delete',
      choices: mergedBranches.map(b => ({ name: `${b.branch} (${b.url})`, value: b.branch })),
      default: mergedBranches.map(b => b.branch) // Select all by default
    }])

    if (remoteBranchesToDelete.length === 0) {
      info('No remote branches selected for deletion.')
      return
    }

    for (const branch of remoteBranchesToDelete) {
      info(`Deleting remote branch ${branch}`)
      await $(`git push origin --delete ${branch} --no-verify`).catch(e => warn(`Failed to delete remote branch ${branch}: ${e.message}`))
    }
  }
}

/**
 * Branches cujo PR mais recente está mergeado, como `gh pr view <branch>` decidia.
 * @param {string[]} branches
 * @param {{ headRefName: string, state: string, url: string, isCrossRepository: boolean }[]} pulls - mais recentes primeiro
 */
export function findMergedBranches (branches, pulls) {
  const latest = new Map()
  for (const pull of pulls) {
    if (!pull.isCrossRepository && !latest.has(pull.headRefName)) latest.set(pull.headRefName, pull)
  }

  return branches
    .filter(branch => latest.get(branch)?.state === 'MERGED')
    .map(branch => ({ branch, url: latest.get(branch).url }))
}

export default new PrCleanCommand()
