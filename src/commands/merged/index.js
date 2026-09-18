// @ts-check

import axios from 'axios'
import chalk from 'chalk'
import chalkTable from 'chalk-table'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { chain } from 'lodash-es'
import ora from 'ora'
import { sheets } from '../../core/drive.js'
import { githubFacade } from '../../core/githubFacade.js'
import { fetchAzureMergedPRs } from '../../modules/merged-data-azure.js'
import { fetchMergedPRs } from '../../modules/merged-data.js'
import { getRemoteInfo } from '../pr/remote.js'
import { promptFrom, promptTeam, promptTo } from '../../utils/prompt.js'
import { sleep } from '../../utils/sleep.js'
import { coloredConclusion, coloredStatus } from '../../utils/utils.js'

class PrMergedCommand {
  /**
   *
   * @param {Object} param
   * @param {import('commander').Command} param.program
   * @returns
   * */
  install ({ program }) {
    program
      .command('merged')
      .description('list open pull requests')
      .option('-f, --from <from>', 'from date yyyy-mm-dd')
      .option('-t, --to <to>', 'to date yyyy-mm-dd')
      .option('--team <team>', 'team to analyze')
      .option('--chat', 'send output to google chat webhook')
      .action(this.action.bind(this))
  }

  /**
   * @param {Object} options
   * @param {string | undefined} options.from
   * @param {string | undefined} options.to
   * @param {string | undefined} options.team
   * @param {boolean | undefined} options.chat
   */
  async action (options) {
    const remoteInfo = await getRemoteInfo()

    if (remoteInfo?.provider === 'azure') {
      return this.runAzure({ options, remoteInfo })
    }

    console.log('List pull requests options', options)

    const { name: team, members } = await promptTeam(options, { provider: 'github' })
    const from = await promptFrom(options)
    const to = await promptTo(options)

    console.log('Analisando PRs do time', team, 'entre', from, 'e', to)

    const { pulls } = await fetchMergedPRs(team, members, from, to)

    await this.render({ pulls })

    await startPublishPooling(pulls)

    if (options.chat) {
      const jobUrls = await fetchMasterJobUrls(pulls)
      await sendToGoogleChat(pulls, team, from, to, jobUrls)
    }
  }

  /**
   * @param {Object} params
   * @param {Object} params.options
   * @param {import('../pr/remote.js').RemoteInfo} params.remoteInfo
   */
  async runAzure ({ options, remoteInfo }) {
    const from = await promptFrom(options)
    const to = await promptTo(options)

    const { name: team, members } = await promptTeam(options, {
      provider: 'azure',
      organizationUrl: remoteInfo.organizationUrl,
      project: remoteInfo.project
    })

    const spinner = process.stdout.isTTY ? ora('buscando pull requests no Azure DevOps...').start() : null

    const { pulls } = await fetchAzureMergedPRs(remoteInfo, from, to, members)
    for (const pull of pulls) {
      pull.team = team
    }

    spinner?.succeed(`${pulls.length} pull request(s) publicados do time ${team} em ${remoteInfo.project}/${remoteInfo.repository}`)

    await this.render({ pulls })

    if (options.chat) {
      await sendToGoogleChat(pulls, team, from, to)
    }
  }

  /**
   * @param {Object} params
   * @param {Array<Record<string, any>>} params.pulls
   */
  async render ({ pulls }) {
    console.log('')
    console.log('PRs publicados')
    console.log(chalkTable({
      columns: [
        { field: 'link', name: chalk.green('Link') },
        { field: 'author', name: chalk.green('Author') },
        { field: 'title', name: chalk.green('Title') },
        { field: 'mergedAt', name: chalk.green('Merged At') }
      ]
    }, pulls.map(pull => {
      return {
        mergedAt: pull.mergedAt,
        link: pull.url,
        title: pull.title,
        author: pull.author?.login,
        team: pull.team
      }
    })))

    await writeToSheets(pulls)

    console.log('')
    console.log('Dados atualizados: https://docs.google.com/spreadsheets/d/1gQz-I9MPygcUo1nCtUoWXSOvIiZVedoWnj76A3dh6yA')
    console.log('')
  }
}

function toRows (pulls) {
  return [
    ['Link', 'Author', 'Title', 'Team', 'Created At', 'Merged At', 'Duration (business days)'],
    ...pulls.map(pull => {
      return [
        pull.url,
        pull.author?.login,
        pull.title,
        pull.team,
        pull.createdAt,
        pull.mergedAt,
        pull.durationDays
      ]
    })
  ]
}

/**
 * @param {Array<Record<string, any>>} pulls
 */
async function writeToSheets (pulls) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: '1gQz-I9MPygcUo1nCtUoWXSOvIiZVedoWnj76A3dh6yA',
    range: 'A1:Z1000'
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId: '1gQz-I9MPygcUo1nCtUoWXSOvIiZVedoWnj76A3dh6yA',
    range: 'A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: toRows(pulls)
    }
  })
}

async function startPublishPooling (pulls) {
  console.log('Iniciando pooling de publicação')
  console.log('')

  pulls = chain(pulls)
    .uniqBy(pull => pull.repository.name)
    .value()
    .sort((a, b) => a.repository.name.localeCompare(b.repository.name))

  const updatedRepositoryNames = pulls.map(pull => pull.repository.name)
  console.log('Repositórios alterados:')
  for (const updatedRepositoryName of updatedRepositoryNames) {
    console.log(' -', updatedRepositoryName)
  }

  console.log('')

  while (true) {
    for (const pull of pulls) {
      const extractOwnerAndRepo = pull.url.match(/https:\/\/github\.com\/(?<owner>.+?)\/(?<repo>.+?)\//)?.groups || {}
      const owner = extractOwnerAndRepo.owner
      const repo = extractOwnerAndRepo.repo

      if (pull.isPublishing === undefined || pull.isPublishing === true) {
        const job = await githubFacade.listWorkflowJobs({
          owner,
          repo
        })
        pull.isPublishing = job ? job.status !== 'completed' : false
        pull.status = job?.status
        pull.conclusion = job?.conclusion
        pull.job_url = job?.html_url
      }

      console.log([coloredStatus(pull.status), coloredConclusion(pull.conclusion)].join(' '), pull.url, pull.job_url)
    }

    const isAllDone = pulls.every((pull) => !pull.isPublishing)

    if (isAllDone) {
      console.log('')
      console.log(new Date().toISOString(), 'All jobs are completed!')
      console.log('')
      break
    }
    console.log(new Date().toISOString(), 'Some PRs are still being published waiting...')
    await sleep(1000)

    const cleanLinesCount = pulls.length + 1
    process.stdout.moveCursor(0, -cleanLinesCount)
  }
}

async function fetchMasterJobUrls (pulls) {
  const uniqueRepos = chain(pulls)
    .uniqBy(pull => pull.repository.name)
    .value()
    .sort((a, b) => a.repository.name.localeCompare(b.repository.name))

  const jobUrls = {}
  for (const pull of uniqueRepos) {
    const { owner, repo } = pull.url.match(/https:\/\/github\.com\/(?<owner>.+?)\/(?<repo>.+?)\//)?.groups || {}
    const job = await githubFacade.listWorkflowJobs({ owner, repo })
    if (job?.html_url) {
      jobUrls[repo] = job.html_url
    }
  }
  return jobUrls
}

const GOOGLE_CHAT_WEBHOOK_URL = process.env.GOOGLE_CHAT_WEBHOOK_URL

function formatDate (dateStr) {
  return format(parseISO(dateStr), 'dd/MM/yyyy (EEEE)', { locale: ptBR })
}

async function sendToGoogleChat (pulls, team, from, to, jobUrls = {}) {
  const formattedFrom = formatDate(from)
  const formattedTo = formatDate(to)
  const period = formattedFrom === formattedTo
    ? formattedFrom
    : `${formattedFrom} a ${formattedTo}`

  const title = `*PRs publicados - ${team} - ${period}*`

  if (pulls.length === 0) {
    const text = `${title}\n\nNenhum PR publicado no período.`
    await axios.post(GOOGLE_CHAT_WEBHOOK_URL, { text }, {
      headers: { 'Content-Type': 'application/json; charset=UTF-8' }
    })
    console.log('')
    console.log('Mensagem enviada para o Google Chat!')
    return
  }

  const lines = [title]

  const grouped = chain(pulls)
    .groupBy((pull) => pull.author?.login)
    .value()

  for (const [author, authorPulls] of Object.entries(grouped)) {
    lines.push('')
    const authorName = authorPulls[0].author?.name
    lines.push(authorName ? `*${authorName}* (${author})` : `*${author}*`)
    for (const pull of authorPulls) {
      const cleanTitle = pull.title.replace(/<>/g, '-').replace(/\p{Emoji_Presentation}/gu, '').replace(/\s+/g, ' ').trim()
      const safeTitle = cleanTitle.length > 70 ? cleanTitle.substring(0, 70) + '...' : cleanTitle
      const timeOnly = pull.mergedAt?.split(' ')[1] || pull.mergedAt
      lines.push(`- <${pull.url}|${safeTitle}> (${timeOnly})`)
    }
  }

  const memberStats = chain(pulls)
    .groupBy((pull) => pull.author?.login)
    .map((memberPulls, author) => ({
      author,
      count: memberPulls.length
    }))
    .sortBy('count')
    .reverse()
    .value()

  lines.push('')
  lines.push('')
  lines.push('*PRs por membro*')
  lines.push('```')
  const maxAuthorLen = Math.max(...memberStats.map((m) => m.author.length), 'Membro'.length)
  lines.push(`${'Membro'.padEnd(maxAuthorLen)} | PRs`)
  lines.push(`${'-'.repeat(maxAuthorLen)}-+----`)
  for (const member of memberStats) {
    lines.push(`${member.author.padEnd(maxAuthorLen)} | ${String(member.count).padStart(3)}`)
  }
  lines.push('```')

  lines.push('')
  lines.push('```')
  lines.push(`Total: ${pulls.length} PRs publicados`)
  lines.push('```')
  const jobEntries = Object.entries(jobUrls)
  if (jobEntries.length > 0) {
    lines.push('')
    lines.push('*Jobs da master*')
    for (const [repo, url] of jobEntries) {
      lines.push(`- <${url}|${repo}>`)
    }
  }

  lines.push('')
  lines.push('<users/all>')

  const text = lines.join('\n')

  await axios.post(GOOGLE_CHAT_WEBHOOK_URL, { text }, {
    headers: { 'Content-Type': 'application/json; charset=UTF-8' }
  })

  console.log('')
  console.log('Mensagem enviada para o Google Chat!')
}

export default new PrMergedCommand()
