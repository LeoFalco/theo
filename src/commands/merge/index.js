// @ts-check

import { $ } from '../../core/exec.js'
import { githubFacade } from '../../core/githubFacade.js'
import { fluxClient, STAGES } from '../../services/flux/flux-client.js'
import { coloredBoolean, coloredPending, isApproved, isChecksPassed, isChecksInProgress, isMergeable, isReady, isRejected, padEnd } from '../../utils/utils.js'
import chalk from 'chalk'
import { promptConfirm } from '../../utils/prompt.js'
import { sleep } from '../../utils/sleep.js'
import ora from 'ora'
const { red, yellow, green, gray, blue, dim, bold } = chalk

class PrMergeCommand {
  /**
   *
   * @param {Object} param
   * @param {import('commander').Command} param.program
   * @returns
   * */
  install ({ program }) {
    program
      .command('merge')
      .description('merge pull request')
      .action(this.action.bind(this))
      .option('--flux', 'merge pull request with flux')
      .option('--confirm', 'execute merge without confirmation')
      .option('--continue', 'continue merging after a failed merge', false)
      .option('--admin', 'use admin merge', false)
      .option('--wait', 'wait for merge to complete', false)
      .option('--refresh', 'refresh pull request data while merging', false)
      .option('--approve', 'approve pull request before merging', false)
  }

  /**
   * @param {Object} options
   * @param {boolean} options.flux
   * @param {boolean} options.confirm
   * @param {boolean} options.continue
   * @param {boolean} options.admin
   * @param {boolean} options.wait
   * @param {boolean} options.refresh
   */
  async action (options) {
    if (options.flux) {
      await this.actionWithFlux(options)
    } else {
      console.log(blue('Starting PR merge process...'))
      await this.actionWithoutFlux(options)
    }
  }

  /**
   * @param {Object} options
   * @param {boolean} options.flux
   * @param {boolean} options.confirm
   * @param {boolean} options.continue
   * @param {boolean} options.admin
   * @param {boolean} options.refresh
   */
  async actionWithFlux (options) {
    console.log(blue('Fetching cards from Flux PUBLISH stage...'))

    const cards = await fluxClient.getUnopenedCards({
      stageId: STAGES.PUBLISH,
      take: 10,
      skip: 0
    })

    if (!cards || cards.length === 0) {
      console.log(gray('No cards found in publish stage'))
      return
    }

    for (let i = 0; i < cards.length; i++) {
      await extractPrData(cards[i], i + 1, cards.length)
    }

    const totalPrs = cards.reduce((sum, card) => sum + card.pullRequests.length, 0)
    console.log()
    console.log(blue(`Found ${bold(cards.length)} cards with ${bold(totalPrs)} pull requests`))

    const confirmed = await Promise.race([
      promptConfirm(options),
      sleep(5000)
    ])

    if (confirmed) {
      console.log()
      console.log(bold('Starting merge process...'))

      const summary = { merged: 0, skipped: 0, failed: 0, cardsMoved: 0 }

      for (let i = 0; i < cards.length; i++) {
        const result = await mergeCardPrs(cards[i], options, i + 1, cards.length)
        summary.merged += result.merged
        summary.skipped += result.skipped
        summary.failed += result.failed
        const moved = await moveCardToMergedStage(cards[i])
        if (moved) summary.cardsMoved++
      }

      console.log()
      console.log(dim('──────────────────────────────'))
      console.log(green(bold('All done!')))
      console.log()
      console.log(bold('Summary:'))
      console.log(`  Cards: ${cards.length} total, ${green(summary.cardsMoved + ' moved')}${summary.cardsMoved < cards.length ? ', ' + yellow((cards.length - summary.cardsMoved) + ' not moved') : ''}`)
      console.log(`  PRs:   ${totalPrs} total, ${green(summary.merged + ' merged')}${summary.skipped ? ', ' + yellow(summary.skipped + ' skipped') : ''}${summary.failed ? ', ' + red(summary.failed + ' failed') : ''}`)
      console.log()
      console.log(dim('Links:'))
      console.log(`  ${dim('flux:')} https://app.fluxcontrol.com.br/#/fluxo/b23ec9c8-8aeb-471a-8b2f-cd1af4f5e73e?view_mode=table`)
      console.log(`  ${dim('jobs:')} theo merged --from=today --to=today --team=GRID`)

      const everyCardMoved = cards.every(card => card.moved === true)
      if (everyCardMoved) {
        process.exit(0)
      }
    } else {
      console.log(yellow('Merge operation not confirmed'))
    }

    if (options.refresh) {
      console.log(blue('Refreshing pull request data...'))
      console.clear()
      if (options.confirm) {
        await sleep(1000)
      }
      return this.actionWithFlux(options)
    }
  }

  /**
   * @param {Object} options
   * @param {boolean} options.flux
   * @param {boolean} options.confirm
   * @param {boolean} options.continue
   * @param {boolean} options.admin
   * @param {boolean} options.refresh
   * @param {boolean} options.wait
   * @param {boolean} options.approve
   */
  async actionWithoutFlux (options) {
    console.log(blue('Merging pull request without flux'))

    const prUrl = await $('gh pr view --json url --jq .url', { loading: false, disableLog: true })

    console.log(blue(`Pull request ${prUrl}`))

    const defaultBranch = await $('gh repo view --json defaultBranchRef --jq .defaultBranchRef.name', { loading: false, disableLog: true })
    const currentBranch = await $('git branch --show-current')

    console.log(blue(`Ready to merge branch ${currentBranch} into ${defaultBranch}`))

    const confirmMerge = await promptConfirm({
      confirm: options.confirm,
      message: `Você tem certeza que deseja prosseguir? ${currentBranch} -> ${defaultBranch}`
    })

    if (!confirmMerge) {
      console.log('Merge operation not confirmed')
      return
    }

    const runStatuses = ['in_progress', 'queued', 'pending']
    const runs = (
      await Promise.all(
        runStatuses.map(status =>
          $(`gh run list --branch ${currentBranch} --json databaseId,displayTitle,workflowName --status ${status}`, {
            json: true,
            loading: false
          })
        )
      )
    ).flat()

    if (options.approve) {
      await approve({ currentBranch })
    }

    // 1. Try Admin Merge first (faster, ignores checks)
    const mergeStatus = await merge({ admin: options.admin })

    if (mergeStatus === 'failed') {
      console.log(red('Merge operation failed'))
      return
    }

    if (mergeStatus === 'pending') {
      console.log(yellow('Merge operation is pending'))

      if (options.wait) {
        console.log(blue('Waiting for merge to complete...'))
        await waitForMergeCompletion({ currentBranch })
      }

      return
    }

    if (mergeStatus === 'done') {
      console.log(green('Merge operation completed'))
    }

    console.log(blue('Canceling runs'))
    // @ts-ignore
    await Promise.allSettled(runs.map(run => $(`gh run cancel ${run.databaseId}`, { loading: false })))

    console.log(blue('Local branch cleanup'))
    await $('git checkout ' + defaultBranch)
    await $('git pull')
    await $('git remote prune origin')
    if (currentBranch !== defaultBranch) {
      await $('git branch -D ' + currentBranch, { reject: false })
    }
  }
}

/**
 * @param {Object} options
 * @param {boolean} options.admin
 */
async function merge ({ admin }) {
  const mergeTypes = [
    {
      priority: 1,
      name: 'normal',
      command: 'gh pr merge --squash --delete-branch',
      message: 'Trying normal merge',
      failMessage: 'Normal merge failed',
      successMessage: 'Normal merge completed',
      mergeStatus: 'done'
    },
    {
      priority: 2,
      name: 'auto',
      command: 'gh pr merge --squash --auto --delete-branch',
      message: 'Trying auto merge',
      failMessage: 'Auto merge failed',
      successMessage: 'Auto merge enabled',
      mergeStatus: 'pending'
    },
    {
      priority: admin ? 0 : 3,
      name: 'admin',
      command: 'gh pr merge --admin --squash --delete-branch',
      message: 'Trying admin merge',
      failMessage: 'Admin merge failed',
      successMessage: 'Admin merge completed',
      mergeStatus: 'done'
    }
  ]

  mergeTypes.sort((a, b) => a.priority - b.priority)

  for (const mergeType of mergeTypes) {
    console.log(blue(mergeType.message))
    const result = await $(mergeType.command, {
      stdio: 'pipe',
      reject: false,
      returnProperty: 'all',
      loading: false
    })

    // @ts-ignore
    if (result.exitCode !== 0) {
      console.log(yellow(mergeType.failMessage))
      // @ts-ignore
      console.log(red(result.stderr))
    }

    // @ts-ignore
    if (result.exitCode === 0) {
      console.log(green(mergeType.successMessage))
      // @ts-ignore
      console.log(result.stdout)
      return mergeType.mergeStatus
    }
  }

  console.log(yellow('All merge types failed'))

  return 'failed'
}

const githubPrUrlRegex = /https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)/gmi

// @ts-ignore
async function extractPrData (card, cardIndex, cardTotal) {
  card.name = card.name.trim()
  card.pullRequests = []

  card.fields = await fluxClient.getCardFields({ cardId: card.id })
    // @ts-ignore
    .then(fields => fields.filter(field => field.title && field.value))

  console.log()
  console.log(dim(`─── Card ${cardIndex}/${cardTotal}: `) + bold(card.name) + dim(' ───'))

  const description = String(card.description || '')
    .concat('\n\n')
    // @ts-ignore
    .concat(card.fields.map(field => field.name + ': ' + field.value).join('\n'))

  for (const match of description.matchAll(githubPrUrlRegex)) {
    if (match.groups == null) continue
    card.pullRequests.push({
      url: match[0],
      owner: match.groups.owner,
      repo: match.groups.repo,
      number: Number(match.groups.number)
    })
  }

  card.pullRequests = [...new Map(card.pullRequests.map(pr => [pr.url, pr])).values()]

  await Promise.all(card.pullRequests.map(async (pr) => {
    const pull = await githubFacade.getPullRequest({
      organization: pr.owner,
      repo: pr.repo,
      number: pr.number
    })

    const approved = isApproved(pull)
    const notRejected = !isRejected(pull)
    const mergeable = isMergeable(pull)
    const checks = isChecksPassed(pull)
    const checksInProgress = !checks && isChecksInProgress(pull)
    const ready = isReady(pull)
    const publish = approved && notRejected && mergeable && checks && ready
    const ahead = await githubFacade.isAheadOfBase({
      baseRef: pull.baseRefName,
      headRef: pull.headRefName,
      owner: pr.owner,
      repo: pr.repo
    })

    Object.assign(pr, {
      $pull: pull,
      $metadata: {
        approved,
        notRejected,
        mergeable,
        checks,
        checksInProgress,
        ready,
        ahead,
        publish
      }
    })
  }))

  if (card.pullRequests.length === 0) {
    console.log(yellow('  No pull requests found in description'))
  }

  card.pullRequests.forEach((/** @type {{ $metadata: ArrayLike<any> | { [s: string]: any; }; url: any; }} */ pull, /** @type {number} */ prIndex) => {
    /**
     * @type {string[]}
     */
    const notes = []
    Object.entries(pull.$metadata).forEach(([key, value]) => {
      if (key === 'checksInProgress') {
        if (value) {
          notes.push(coloredPending({ checks: value }))
        }
      } else if (key === 'checks' && pull.$metadata.checksInProgress) {
        // skip — shown as pending instead
      } else {
        notes.push(coloredBoolean({ [key]: value }))
      }
    })
    console.log(`  ${dim(`PR ${prIndex + 1}/${card.pullRequests.length}:`)} ${blue(pull.url)}`)
    console.log(`    ${notes.join(' ')}`)
  })

  return card
}

/**
 * @param {{ name: any; pullRequests: string | any[]; id: any; }} card
 * @param {{ flux?: boolean; confirm?: boolean; continue: any; refresh?: boolean; }} options
 * @param {number} cardIndex
 * @param {number} cardTotal
 * @returns {Promise<{ merged: number; skipped: number; failed: number }>}
 */
async function mergeCardPrs (card, options, cardIndex, cardTotal) {
  const counters = { merged: 0, skipped: 0, failed: 0 }

  console.log()
  console.log(dim(`─── Merging Card ${cardIndex}/${cardTotal}: `) + bold(card.name) + dim(' ───'))

  if (card.pullRequests.length === 0) {
    console.log(yellow('  No pull requests found'))
    return counters
  }

  for (let i = 0; i < card.pullRequests.length; i++) {
    const pullRequest = card.pullRequests[i]
    console.log(`  ${dim(`PR ${i + 1}/${card.pullRequests.length}:`)} ${blue(pullRequest.url)}`)

    await githubFacade.rebasePullRequest({
      owner: pullRequest.owner,
      repo: pullRequest.repo,
      number: pullRequest.number
    }).then(() => {
      console.log(dim('    Rebase ok'))
      return undefined
    }).catch(() => {
      console.log(gray('    Rebase failed (ignored)'))
    })

    if (!pullRequest.$metadata.publish) {
      console.log(yellow('    Skipped — publish conditions not met'))
      counters.skipped++
      continue
    }

    const reject = !options.continue
    // @ts-ignore
    const { state } = await $(`gh pr view ${pullRequest.url} --json state`, { stdio: 'pipe', loading: false, json: true })
    console.log(`    State: ${state === 'OPEN' ? blue(state) : state === 'MERGED' ? green(state) : yellow(state)}`)

    const isOpen = state.includes('OPEN')
    if (isOpen) {
      const result = await $(`gh pr merge ${pullRequest.url} -d -s --admin`, { reject, stdio: 'pipe', loading: false, returnProperty: 'all' })

      // @ts-ignore
      if (!result.success) {
        // @ts-ignore
        console.log(red('    Merge failed: ' + result.stderr?.trim()))
        counters.failed++
        continue
      }

      console.log(green('    Merged'))
      counters.merged++

      const job = await githubFacade.listWorkflowJobs({
        owner: pullRequest.owner,
        repo: pullRequest.repo
      })

      await fluxClient.createCardComment({
        cardId: card.id,
        content: `Pull request ${pullRequest.url} merged successfully. ${job?.html_url}`
      })
    } else if (state === 'MERGED') {
      counters.merged++
    } else {
      counters.skipped++
    }

    const comments = await githubFacade.getPullRequestComments({
      organization: pullRequest.owner,
      repo: pullRequest.repo,
      number: pullRequest.number
    })

    // @ts-ignore
    const hasFluxCardComment = comments.some(comment => comment.body.includes('Flux: https://app.fluxcontrol.com.br/#/fluxo/b23ec9c8-8aeb-471a-8b2f-cd1af4f5e73e?view_mode=table&panel=card-detail&cardId='))

    if (!hasFluxCardComment) {
      await $(['gh', 'pr', 'comment', pullRequest.url, '--body', `Flux: https://app.fluxcontrol.com.br/#/fluxo/b23ec9c8-8aeb-471a-8b2f-cd1af4f5e73e?view_mode=table&panel=card-detail&cardId=${card.id}`], { reject, stdio: 'ignore', loading: false })
      console.log(green('    Added Flux comment'))
    }
  }

  return counters
}

/**
 *
 * @param {Object} card
 * @param {string} card.id
 * @param {string} card.name
 * @param {Array<{ owner: string; repo: string; number: number; }>} card.pullRequests
 * @param {Object} card.currentStage
 * @param {string} card.currentStage.id
 *
 * @returns {Promise<boolean>} - returns true if the card was moved, false otherwise
 */
async function moveCardToMergedStage (card) {
  console.log(dim('  Moving card to MERGED stage...'))

  const allPullRequests = await Promise.all(card.pullRequests.map(async (pr) => {
    if (pr.$pull) return pr.$pull
    return githubFacade.getPullRequest({
      organization: pr.owner,
      repo: pr.repo,
      number: pr.number
    })
  }))

  const coloredStates = allPullRequests.map(pr => {
    if (pr.state === 'MERGED') return green(pr.state)
    if (pr.state === 'CLOSED') return yellow(pr.state)
    return red(pr.state)
  })
  console.log(`  States: ${coloredStates.join(' ')}`)

  const everyPullRequestIsMergedOrClosed = allPullRequests.every(pr => pr.state === 'MERGED' || pr.state === 'CLOSED')

  if (!everyPullRequestIsMergedOrClosed) {
    console.log(red('  Skipped stage change — not all PRs merged/closed'))
    return false
  }

  await fluxClient.moveCardToStage({
    cardId: card.id,
    afterStageId: STAGES.MERGED,
    beforeStageId: card.currentStage.id,
    nextCardId: null
  })

  console.log(green('  Card moved to MERGED'))

  Object.assign(card, {
    moved: true
  })

  return true
}

/**
 * @param {Object} options
 * @param {string} options.currentBranch
 */
async function waitForMergeCompletion ({ currentBranch }) {
  const maxRetries = 300
  let retries = 0

  const loading = ora({ text: 'Waiting for merge completion' })
    .start()

  while (retries < maxRetries) {
    await sleep(1000)

    const prData = await $(`gh pr view ${currentBranch} --json state,statusCheckRollup`, { loading: false, disableLog: true, json: true })

    // @ts-ignore
    const state = prData.state
    // @ts-ignore
    const statusCheckRollup = (prData.statusCheckRollup || [])
      .map((item) => ({
        name: item.name,
        status: item.status.toLowerCase(),
        conclusion: item.conclusion.toLowerCase(),
        detailsUrl: item.detailsUrl
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // @ts-ignore
    const statusMaxWidth = Math.max(...statusCheckRollup.map((item) => item.status.length))
    // @ts-ignore
    const conclusionMaxWidth = Math.max(...statusCheckRollup.map((item) => item.conclusion.length))
    // @ts-ignore
    statusCheckRollup.forEach((item) => {
      item.status = padEnd(item.status, statusMaxWidth)
      item.conclusion = padEnd(item.conclusion, conclusionMaxWidth)
    })

    const text = ['Waiting for merge completion state is ' + blue(state), '']

    statusCheckRollup.forEach((/** @type {{ name: string; conclusion: string; status: string; detailsUrl: string; }} */ item) => {
      const status = item.status || 'pending'
      const color = status.includes('success') || status.includes('completed') ? green : status.includes('failure') ? red : yellow
      text.push('- ' + color(status) + ' ' + item.name + ' ' + gray(item.detailsUrl))
    })

    loading.text = text.join('\n')

    const someCheckFailed = statusCheckRollup.some((/** @type {{ conclusion: string; }} */ item) => item.conclusion === 'failure')
    if (someCheckFailed) {
      console.log(text.join('\n'))
      loading.stopAndPersist({
        symbol: '⚠',
        text: red('Merge operation failed')
      })
      break
    }

    if (state === 'MERGED') {
      console.log(text.join('\n'))
      loading.stopAndPersist({
        symbol: '✔',
        text: green('Merge operation completed')
      })
      break
    }

    if (state !== 'OPEN') {
      console.log(text.join('\n'))
      loading.stopAndPersist({
        symbol: '⚠',
        text: red('Merge operation not completed')
      })
      break
    }

    retries++
  }

  if (retries === maxRetries) {
    loading.warn('Merge operation not completed after 5 minutes')
  }
}

/**
 * @param {Object} options
 * @param {string} options.currentBranch
 */
async function approve ({ currentBranch }) {
  console.log(blue('Approving pull request'))

  const reviewDecision = await $('gh pr view ' + currentBranch + ' --json reviewDecision --jq .reviewDecision')

  if (reviewDecision === 'APPROVED') {
    console.log(green('Pull request already approved'))
    return
  }

  const hasMyReview = await $('gh pr view ' + currentBranch + ' --json reviews', { json: true })
    // @ts-ignore
    .then(result => {
      return result?.reviews.some(review => review.author.login === 'LeoFalco' && review.state === 'APPROVED')
    })

  if (!hasMyReview) {
    await $('gh pr review ' + currentBranch + ' --approve', { stdio: 'inherit', loading: false, reject: false })
    console.log(green('Pull request approved'))
  }
}

export default new PrMergeCommand()
