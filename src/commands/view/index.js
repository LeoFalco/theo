import { $ } from '../../core/exec.js'
import open from 'open'
import { info, warn } from '../../core/patch-console-log.js'

class PreviewCommand {
  install ({ program }) {
    program
      .command('view')
      .description('view deployment')
      .action(this.action.bind(this))
      .option('-w --web', 'open in browser')
  }

  async action (options) {
    const currentCommitSha = await $('git rev-parse HEAD')
    const origin = await $('git remote get-url origin')
    const [, owner, repo] = origin.match(/github\.com\/([^/]+)\/([^/]+)\.git/)

    const url = await this.fetchDeployInfo({ currentCommitSha, owner, repo })

    if (!url) {
      warn('No deployment found')
      return
    }

    if (options.web) {
      info(`Opening ${url} in browser`)
      await open(url)
    } else {
      info(`Deployment URL: ${url}`)
    }
  }

  async fetchDeployInfo ({ currentCommitSha, owner, repo }) {
    // gh api "https://api.github.com/repos/<owner>/<repo>/deployments?sha=<commit-sha>"
    const deployData = await $(`gh api https://api.github.com/repos/${owner}/${repo}/deployments?sha=${currentCommitSha}`)
      .then(JSON.parse)

    const deploymentId = deployData[0]?.id

    if (!deploymentId) return null

    const deploymentStatusesData = await $(`gh api https://api.github.com/repos/${owner}/${repo}/deployments/${deploymentId}/statuses`)
      .then(JSON.parse)

    return deploymentStatusesData[0]?.environment_url
  }
}

export default new PreviewCommand()
