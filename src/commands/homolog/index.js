import { $ } from '../../core/exec.js'
import { resolveDefaultBranch } from '../../core/default-branch.js'

class PreviewCommand {
  install ({ program }) {
    program
      .command('homolog')
      .description('push current branch to homolog environment')
      .action(this.action.bind(this))
  }

  async action () {
    const initialBranch = await $('git rev-parse --abbrev-ref HEAD').then(result => result.trim())
    const defaultBranch = await resolveDefaultBranch()

    // checkout default branch
    await $(`git checkout ${defaultBranch}`)

    // update default branch
    await $(`git pull origin ${defaultBranch}`)

    // delete local homolog branch
    await $('git branch -D homolog', { reject: false })

    const homologBranchExistsOnRemote = await $('git ls-remote --heads origin homolog', { returnProperty: 'exitCode', reject: false }).then(result => result === 0)

    if (homologBranchExistsOnRemote) {
      await $('git fetch origin homolog:homolog')
      await $('git checkout homolog')
    } else {
      await $('git checkout -b homolog')
    }

    // rebase homolog branch on top of default branch
    await $(`git rebase ${defaultBranch}`)

    // get all commit hashes between default branch and initial branch
    const commitHashes = await $(`git log ${defaultBranch}..${initialBranch} --format=%H`).then(result => result.trim().split('\n'))

    for (const commitHash of commitHashes) {
      // cherry-pick commit
      await $(`git cherry-pick ${commitHash}`)
    }

    // push homolog branch to remote
    await $('git push origin homolog -f --no-verify')

    await $(`git checkout ${initialBranch}`)
  }
}

export default new PreviewCommand()
