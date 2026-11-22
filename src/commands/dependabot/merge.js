import chalk from 'chalk'
import inquirer from 'inquirer'
import ora from 'ora'
import { getOctokit } from '../../core/octokit.js'
import { getRemoteInfo } from '../pr/remote.js'
import { info } from '../../core/patch-console-log.js'

const { green, yellow, red, gray, bold } = chalk

const MANIFEST_PATTERNS = [
  'go.mod',
  'go.sum',
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Gemfile',
  'Gemfile.lock',
  'requirements.txt',
  'poetry.lock',
  'Pipfile.lock',
  'composer.json',
  'composer.lock',
  'Cargo.toml',
  'Cargo.lock',
  'build.gradle',
  'pom.xml'
]

function isManifestFile (filename) {
  const base = filename.split('/').pop()
  if (MANIFEST_PATTERNS.includes(base)) return true
  if (filename.startsWith('.github/workflows/')) return true
  if (base.startsWith('Dockerfile')) return true
  return false
}

function parseVersionBumpFromText (text) {
  // Match semver (1.2.3), two-part (1.2), or single-digit (4) versions
  const match = text.match(/from\s+v?(\d+)(?:\.(\d+))?(?:\.(\d+))?\s+to\s+v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i)
  if (!match) return 'unknown'

  const [, oldMaj, oldMin, oldPatch, newMaj, newMin, newPatch] = match.map(v => v !== undefined ? Number(v) : undefined)

  if (oldMaj !== newMaj) return 'major'
  if (oldMin !== newMin) return 'minor'
  if (oldPatch !== newPatch) return 'patch'
  return 'unknown'
}

function parseVersionBumpFromMetadata (text) {
  const updateTypes = [...text.matchAll(/update-type:\s*version-update:semver-(\w+)/g)]
    .map(m => m[1])

  if (updateTypes.length === 0) return 'unknown'
  if (updateTypes.includes('major')) return 'major'
  if (updateTypes.includes('minor')) return 'minor'
  if (updateTypes.every(t => t === 'patch')) return 'patch'
  return 'unknown'
}

function parseVersionBump (title, commitMessage) {
  const bump = parseVersionBumpFromText(title)
  if (bump !== 'unknown') return bump
  if (commitMessage) {
    const fromText = parseVersionBumpFromText(commitMessage)
    if (fromText !== 'unknown') return fromText
    return parseVersionBumpFromMetadata(commitMessage)
  }
  return 'unknown'
}

function isGitHubAction (title) {
  return /^bump\s+\S+\/\S+/i.test(title) || title.includes('actions/')
}

function isDevelopmentDep (title) {
  const devPatterns = [
    'eslint', 'prettier', 'jest', 'mocha', 'chai', 'vitest',
    'typescript', '@types/', 'lint', 'husky', 'commitlint',
    'stylelint', '@typescript-eslint', 'webpack', 'vite',
    'rollup', 'babel', 'postcss', 'tailwindcss', 'sass', 'nodemon'
  ]
  const lower = title.toLowerCase()
  return devPatterns.some(p => lower.includes(p))
}

function assessRisk (pr, ciStatus, onlyManifestFiles, commitMessage) {
  const bump = parseVersionBump(pr.title, commitMessage)
  const isAction = isGitHubAction(pr.title)
  const isDev = isDevelopmentDep(pr.title)
  const ciPassing = ciStatus === 'passing'
  const isSecurityPr = pr.labels.some(l =>
    l.name.toLowerCase().includes('security')
  )

  if (bump === 'major') {
    const ciLabel = ciPassing ? 'CI passing' : ciStatus === 'failing' ? 'CI failing' : 'CI pending'
    return { risk: 'high', bump, reason: `major version bump, ${ciLabel}` }
  }

  if (bump === 'unknown') {
    return { risk: 'medium', bump, reason: 'could not parse version bump' }
  }

  if (ciStatus === 'failing') {
    return { risk: 'medium', bump, reason: 'CI is failing' }
  }

  if (!onlyManifestFiles) {
    return { risk: 'high', bump, reason: 'unexpected files changed' }
  }

  if (!ciPassing) {
    if (bump === 'patch') {
      return { risk: 'medium', bump, reason: 'patch bump, CI pending' }
    }
    return { risk: 'medium', bump, reason: `${bump} bump, CI not passing` }
  }

  if (bump === 'patch') {
    return { risk: 'low', bump, reason: 'patch bump, CI passing' }
  }

  if (bump === 'minor') {
    if (isAction || isDev || isSecurityPr) {
      return { risk: 'low', bump, reason: `minor ${isAction ? 'action' : isDev ? 'dev dep' : 'security'} bump, CI passing` }
    }
    return { risk: 'medium', bump, reason: 'minor bump, CI passing' }
  }

  return { risk: 'medium', bump, reason: 'unclassified' }
}

// Uma busca traz todos os PRs com o que a avaliação de risco precisa: arquivos, primeiro
// commit e checks do último commit. Antes eram 4 chamadas REST por PR, um PR de cada vez.
const DEPENDABOT_PRS_QUERY = `
  query ($searchQuery: String!, $cursor: String) {
    search(type: ISSUE, query: $searchQuery, first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on PullRequest {
          number
          title
          repository { name isFork }
          labels(first: 20) { nodes { name } }
          files(first: 100) { nodes { path } }
          firstCommit: commits(first: 1) { nodes { commit { message } } }
          lastCommit: commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  contexts(first: 100) {
                    nodes {
                      __typename
                      ... on CheckRun { name conclusion title summary }
                      ... on StatusContext { context state description }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`

export function getCiStatus (pr) {
  const contexts = pr.lastCommit.nodes[0]?.commit.statusCheckRollup?.contexts.nodes || []
  const checkRuns = contexts.filter(c => c.__typename === 'CheckRun')
  const statuses = contexts.filter(c => c.__typename === 'StatusContext')

  // A API GraphQL devolve os enums em maiúsculas; a lógica abaixo é a da API REST.
  const checkConclusions = checkRuns.map(c => c.conclusion?.toLowerCase() ?? null)
  const statusStates = statuses.map(s => s.state.toLowerCase())
  const allConclusions = [...checkConclusions, ...statusStates]

  const failures = [
    ...checkRuns
      .filter(c => c.conclusion === 'FAILURE' || c.conclusion === 'ERROR')
      .map(c => ({
        name: c.name,
        step: c.title || null,
        message: c.summary?.split('\n')[0] || null
      })),
    ...statuses
      .filter(s => s.state === 'FAILURE' || s.state === 'ERROR')
      .map(s => ({
        name: s.context,
        step: null,
        message: s.description || null
      }))
  ]

  if (allConclusions.length === 0) return { status: 'none', failures: [] }
  if (allConclusions.some(c => c === 'failure' || c === 'error')) return { status: 'failing', failures }
  if (allConclusions.every(c => c === 'success' || c === 'neutral' || c === 'skipped')) return { status: 'passing', failures: [] }
  return { status: 'pending', failures: [] }
}

async function approvePr (owner, repoName, prNumber) {
  await getOctokit().rest.pulls.createReview({
    owner,
    repo: repoName,
    pull_number: prNumber,
    event: 'APPROVE',
    body: '✅ Auto-approved by theo dependabot merge (low risk)'
  })
}

async function mergePr (owner, repoName, prNumber) {
  await getOctokit().rest.pulls.merge({
    owner,
    repo: repoName,
    pull_number: prNumber,
    merge_method: 'squash'
  })
}

async function scanPrs (searchQuery, { skipForks }) {
  const spinner = ora({ text: 'Searching Dependabot PRs...' }).start()
  const { search } = await getOctokit().graphql.paginate(DEPENDABOT_PRS_QUERY, { searchQuery })
  spinner.stop()

  const prsByRepo = Map.groupBy(
    search.nodes.filter(pr => !(skipForks && pr.repository.isFork)),
    pr => pr.repository.name
  )

  const candidates = []

  for (const [repoName, prs] of prsByRepo) {
    console.log(`${green('✔')} ${repoName} — ${prs.length} Dependabot PR(s)`)

    for (const pr of prs) {
      const ci = getCiStatus(pr)
      const files = pr.files.nodes.map(f => f.path)
      const commitMessage = pr.firstCommit.nodes[0]?.commit.message || ''

      const onlyManifest = files.every(f => isManifestFile(f))
      const assessment = assessRisk({ title: pr.title, labels: pr.labels.nodes }, ci.status, onlyManifest, commitMessage)

      const riskColor = assessment.risk === 'low'
        ? green
        : assessment.risk === 'medium'
          ? yellow
          : red

      const entry = {
        repo: repoName,
        pr: pr.number,
        title: pr.title,
        ...assessment,
        ci: ci.status
      }

      console.log(
        `  #${pr.number} ${pr.title}`,
        riskColor(`[${assessment.risk}]`),
        gray(`— ${assessment.reason}`)
      )

      for (const f of ci.failures) {
        const parts = [f.name, f.step, f.message].filter(Boolean)
        console.log(gray(`    └ ${parts.join(' — ')}`))
      }

      candidates.push(entry)
    }
  }

  return candidates
}

export async function mergeAction (options) {
  const current = await getRemoteInfo()
  if (current?.provider !== 'github') {
    info('Not inside a GitHub repo.')
    return
  }

  const { owner } = current
  const baseQuery = 'is:pr is:open author:app/dependabot sort:created-asc'

  let candidates
  if (options.all) {
    info(`Scanning all repos of ${owner}`)
    // Forks e arquivados ficam de fora, como na listagem de repos de antes.
    candidates = await scanPrs(`org:${owner} archived:false ${baseQuery}`, { skipForks: true })
  } else {
    info(`Scanning current repo: ${owner}/${current.repository}`)
    candidates = await scanPrs(`repo:${owner}/${current.repository} ${baseQuery}`, { skipForks: false })
  }

  if (candidates.length === 0) {
    console.log(yellow('\nNo Dependabot PRs found.'))
    return
  }

  const riskColor = risk => risk === 'low'
    ? green
    : risk === 'medium'
      ? yellow
      : red

  const mergeable = candidates.filter(c => c.ci !== 'failing')
  const skipped = candidates.length - mergeable.length

  if (skipped > 0) {
    console.log(yellow(`\nSkipped ${skipped} PR(s) with failing CI.\n`))
  } else {
    console.log('')
  }

  if (mergeable.length === 0) {
    console.log(yellow('No mergeable PRs remaining.'))
    return
  }

  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message: 'Select PRs to approve and merge:',
    choices: mergeable.map(c => ({
      name: `${c.repo}#${c.pr} ${c.title} ${riskColor(c.risk)(`[${c.risk}]`)} ${gray(`— ${c.reason}`)}`,
      value: c,
      checked: c.risk === 'low'
    }))
  }])

  if (selected.length === 0) {
    console.log(yellow('\nNo PRs selected. Exiting.'))
    return
  }

  console.log(bold(`\nProcessing ${selected.length} PR(s)...\n`))

  const summary = { merged: [], errored: [] }

  for (const entry of selected) {
    const spinner = ora({ text: `${entry.repo}#${entry.pr} — approving and merging` }).start()
    try {
      await approvePr(owner, entry.repo, entry.pr)
      await mergePr(owner, entry.repo, entry.pr)
      spinner.succeed(`${entry.repo}#${entry.pr} — approved and merged`)
      summary.merged.push(entry)
    } catch (err) {
      spinner.fail(`${entry.repo}#${entry.pr} — ${err.message}`)
      summary.errored.push({ ...entry, error: err.message })
    }
  }

  console.log(bold('\n═══ Summary ═══\n'))
  console.log(green(`  Merged:   ${summary.merged.length}`))
  console.log(red(`  Errors:   ${summary.errored.length}`))

  if (summary.errored.length > 0) {
    console.log(bold('\nErrors:'))
    for (const e of summary.errored) {
      console.log(red(`  ${e.repo}#${e.pr} — ${e.error}`))
    }
  }
}
