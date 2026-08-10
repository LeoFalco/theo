// @ts-check

import { format } from 'date-fns'
import { QUALITY_TEAM, TEAMS } from '../core/constants.js'
import { GITHUB_ORG } from '../core/env.js'
import { githubFacade } from '../core/githubFacade.js'
import { calcAge, hasPublishLabel, isApproved, isChecksPassed, isChecksInProgress, isMergeable, isNotFreelance, isNotWait, isQualityOk, isReady, isRejected } from '../utils/utils.js'

export async function fetchOpenedPRs (team) {
  const assignees = TEAMS[team]

  const now = new Date()
  const from = format(now, 'yyyy-MM-dd')
  const tenYearsAgo = new Date(now)
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10)
  const to = format(tenYearsAgo, 'yyyy-MM-dd')

  const pulls = await githubFacade.listPullRequestsV2({
    assignees,
    organization: GITHUB_ORG,
    state: 'OPEN',
    from,
    to
  }).then((pulls) => {
    return pulls
      .filter(isNotFreelance)
      .filter(isNotWait)
      .map((pull) => {
        const approved = isApproved(pull)
        const notRejected = !isRejected(pull)
        const mergeable = isMergeable(pull)
        const checks = isChecksPassed(pull)
        const checksInProgress = isChecksInProgress(pull)
        const quality = isQualityOk(pull, QUALITY_TEAM) || hasPublishLabel(pull)
        const ready = isReady(pull)
        const age = calcAge(pull)

        pull.score = [approved, mergeable, checks, quality, ready].filter(Boolean).length
        pull.approved = approved
        pull.notRejected = notRejected
        pull.mergeable = mergeable
        pull.checks = checks
        pull.checksInProgress = checksInProgress
        pull.ready = ready
        pull.quality = quality
        pull.age = age

        const teamReviewers = TEAMS[team].filter((login) => login !== pull.author?.login)
        const approvedReviewers = pull.reviews.nodes.filter((/** @type {{ state: string; }} */ review) => review.state === 'APPROVED').map((/** @type {{ author: { login: any; }; }} */ review) => review.author?.login)
        const missingReviewers = teamReviewers.filter((login) => !approvedReviewers.includes(login))
        pull.missingReviewers = missingReviewers
        return pull
      })
      .sort((a, b) => b.score - a.score)
  })

  const grouped = Object.groupBy(pulls, (pull) => pull.author?.login ?? 'unknown')
  const memberStats = Object.entries(grouped)
    .map(([author, memberPulls]) => ({
      author,
      count: memberPulls.length,
      oldestAge: Math.max(...memberPulls.map((p) => p.age ?? 0))
    }))
    .sort((a, b) => b.count - a.count)

  const totalPrs = pulls.length
  const ages = pulls.map((p) => p.age ?? 0)
  const avgAge = totalPrs > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / totalPrs) : 0

  return { pulls, memberStats, totalPrs, avgAge }
}
