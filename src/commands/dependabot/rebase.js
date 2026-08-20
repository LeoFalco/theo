import ora from 'ora'
import { $ } from '../../core/exec.js'
import { info } from '../../core/patch-console-log.js'

export async function rebaseAction (options) {
  const allPrs = await $('gh pr list --json number,author', { json: true })
  const prs = allPrs.filter(pr => {
    const author = pr.author.login.toLowerCase()
    return author.includes('dependabot') || author.includes('renovate')
  })

  if (!prs || prs.length === 0) {
    info('No open Dependabot or Renovate PRs found.')
    return
  }

  for (const pr of prs) {
    const { number, author } = pr
    const botName = author.login.toLowerCase().includes('dependabot') ? 'dependabot' : 'renovate'

    const spinner = ora({ text: `PR #${number} by ${author.login} — commenting @${botName} rebase` }).start()
    try {
      await $(['gh', 'pr', 'comment', String(number), '--body', `@${botName} rebase`], { loading: false, disableLog: true })

      if (options.merge) {
        spinner.text = `PR #${number} by ${author.login} — enabling auto-merge`
        await $(`gh pr merge ${number} --auto --squash`, { loading: false, disableLog: true })
      }

      spinner.succeed(`PR #${number} by ${author.login} — done`)
    } catch (err) {
      spinner.fail(`PR #${number} by ${author.login} — ${err.message}`)
    }
  }

  info('Successfully processed all Dependabot PRs.')
}
