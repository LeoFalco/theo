// @ts-check

import chalk from 'chalk'
import chalkTable from 'chalk-table'
import { $ } from '../../core/exec.js'
import { GITHUB_ORG } from '../../core/env.js'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const ORG = GITHUB_ORG
const ADMIN = 'admin'

// Severidades do Dependabot da mais grave para a menos grave.
// A ordem define como cada nível aparece na coluna de vulnerabilidades.
const SEVERITIES = [
  { key: 'critical', color: chalk.magenta },
  { key: 'high', color: chalk.red },
  { key: 'medium', color: chalk.yellow },
  { key: 'low', color: chalk.blue }
]

class ReposCommand {
  /**
   * @param {Object} param
   * @param {import('commander').Command} param.program
   */
  install ({ program }) {
    program
      .command('repos')
      .description(`list ${ORG} repositories you can merge into`)
      .action(this.action.bind(this))
  }

  async action () {
    const mergeableRepos = await fetchMergeableRepos()

    if (mergeableRepos.length === 0) {
      console.log(chalk.yellow(`Nenhum repositório da org ${ORG} com permissão de merge`))
      return
    }

    const rows = await Promise.all(mergeableRepos.map(withVulnerabilities))
    rows.sort(bySeverityDesc)

    printTable(rows)

    const previous = await readPreviousTotals()
    const totals = sumTotals(rows)
    printSummary(totals, previous)

    const anyFailed = rows.some((row) => row.failed)
    if (!anyFailed) {
      await writePreviousTotals(totals)
    } else {
      console.log('')
      console.log(chalk.dim('Snapshot nao atualizado: alguma consulta ao Dependabot falhou.'))
    }
  }
}

/**
 * Imprime o resumo de vulnerabilidades por severidade e o total, com o delta
 * em relacao ao ultimo run integro. Mostra sempre as 4 severidades, mesmo em 0.
 * @param {{ total: number, critical: number, high: number, medium: number, low: number }} totals
 * @param {{ total: number, critical: number, high: number, medium: number, low: number } | null} previous
 */
function printSummary (totals, previous) {
  console.log('')
  console.log(chalk.cyan('Vulnerabilidades (total):'))

  for (const { key, color } of SEVERITIES) {
    const delta = formatDelta(totals[key], previous?.[key])
    console.log(`  ${color(key.padEnd(8))} ${totals[key]}${delta}`)
  }

  const totalDelta = formatDelta(totals.total, previous?.total)
  console.log(
    `  ${chalk.bold('total'.padEnd(8))} ${chalk.bold(totals.total)}${totalDelta}`
  )
}

/**
 * Busca os repositórios da org em que o usuário tem permissão de merge,
 * ordenados por nome.
 * @returns {Promise<Array<{ repo: string, permission: string }>>}
 */
async function fetchMergeableRepos () {
  const repos = await $('gh api --paginate /user/repos?affiliation=organization_member', {
    json: true,
    loading: false
  })

  return (repos || [])
    // @ts-ignore
    .filter((repo) => repo.owner?.login?.toLowerCase() === ORG.toLowerCase())
    // @ts-ignore
    .filter((repo) => canMerge(repo.permissions))
    // @ts-ignore
    .map((repo) => ({ repo: repo.name, permission: highestPermission(repo.permissions) }))
    .sort((/** @type {{ repo: string }} */ a, /** @type {{ repo: string }} */ b) => a.repo.localeCompare(b.repo))
}

/**
 * Enriquece a linha do repositorio com a contagem de vulnerabilidades.
 * So consulta o Dependabot quando o usuario e admin (a API exige esse acesso).
 * Mantem `counts` na linha para permitir a ordenacao por severidade e a
 * agregacao final; `failed` sinaliza falha de API para nao gravar o snapshot.
 * @param {{ repo: string, permission: string }} row
 * @returns {Promise<{ repo: string, permission: string, counts: Record<string, number> | null, failed: boolean, vulnerabilities: string }>}
 */
async function withVulnerabilities (row) {
  if (row.permission !== ADMIN) {
    return { ...row, counts: null, failed: false, vulnerabilities: chalk.dim('-') }
  }

  const { counts, failed } = await countVulnerabilities(row.repo)
  return { ...row, counts, failed, vulnerabilities: formatVulnerabilities(counts) }
}

/**
 * Agrega os counts por severidade das linhas com dados disponiveis.
 * Linhas sem counts (sem admin ou Dependabot desligado) sao ignoradas.
 * @param {Array<{ counts: Record<string, number> | null }>} rows
 * @returns {{ total: number, critical: number, high: number, medium: number, low: number }}
 */
export function sumTotals (rows) {
  const totals = { total: 0, critical: 0, high: 0, medium: 0, low: 0 }

  for (const row of rows) {
    if (!row.counts) continue
    totals.total += row.counts.total || 0
    for (const { key } of SEVERITIES) {
      totals[key] += row.counts[key] || 0
    }
  }

  return totals
}

/**
 * Formata a variacao de um valor em relacao ao run anterior.
 * Retorna string vazia quando nao ha baseline ou quando nada mudou.
 * @param {number} current
 * @param {number | null | undefined} previous
 * @returns {string}
 */
export function formatDelta (current, previous) {
  if (previous === null || previous === undefined) return ''

  const diff = current - previous
  if (diff === 0) return ''
  if (diff > 0) return chalk.green(` (+${diff})`)
  return chalk.red(` (-${Math.abs(diff)})`)
}

export const SNAPSHOT_PATH = join(homedir(), '.config', 'theo', 'repos-vulnerabilities.json')

/**
 * Le o snapshot de totais do ultimo run integro.
 * Retorna null quando o arquivo nao existe ou esta corrompido.
 * @returns {Promise<{ total: number, critical: number, high: number, medium: number, low: number } | null>}
 */
export async function readPreviousTotals () {
  try {
    const content = await readFile(SNAPSHOT_PATH, { encoding: 'utf8' })
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed.total === 'number') return parsed
    return null
  } catch {
    return null
  }
}

/**
 * Grava os totais do run atual como novo snapshot.
 * @param {{ total: number, critical: number, high: number, medium: number, low: number }} totals
 * @returns {Promise<void>}
 */
export async function writePreviousTotals (totals) {
  await mkdir(dirname(SNAPSHOT_PATH), { recursive: true })
  await writeFile(SNAPSHOT_PATH, JSON.stringify(totals))
}

/**
 * Ordena as linhas colocando primeiro quem tem mais vulnerabilidades de alta
 * severidade, comparando critical, high, medium e low nessa ordem. Linhas sem
 * contagem (sem admin ou Dependabot indisponível) vão para o fim.
 * @param {{ counts: Record<string, number> | null }} a
 * @param {{ counts: Record<string, number> | null }} b
 * @returns {number}
 */
function bySeverityDesc (a, b) {
  if (!a.counts) return b.counts ? 1 : 0
  if (!b.counts) return -1

  for (const { key } of SEVERITIES) {
    const diff = (b.counts[key] || 0) - (a.counts[key] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Conta os Dependabot alerts abertos de um repositorio, agrupados por severidade.
 * Diferencia "sem dados" (Dependabot desligado / sem acesso: 404 ou 403) de
 * "falha de API" (rede, 5xx, rate limit), para nao envenenar a baseline.
 * @param {string} repo
 * @returns {Promise<{ counts: Record<string, number> | null, failed: boolean }>}
 */
async function countVulnerabilities (repo) {
  const result = /** @type {{ success: boolean, stdout: string | undefined, stderr: string | undefined }} */ (await $(`gh api --paginate /repos/${ORG}/${repo}/dependabot/alerts?state=open&per_page=100`, {
    loading: false,
    reject: false,
    returnProperty: 'all'
  }))

  if (!result.success) {
    const noData = /HTTP (404|403)/.test(result.stderr || '')
    return { counts: null, failed: !noData }
  }

  const alerts = safeParseArray(result.stdout)
  /** @type {Record<string, number>} */
  const counts = { total: alerts.length }
  for (const { key } of SEVERITIES) {
    counts[key] = alerts.filter((alert) => alert?.security_advisory?.severity === key).length
  }
  return { counts, failed: false }
}

/**
 * Formata a contagem de vulnerabilidades para exibição na tabela.
 * @param {Record<string, number> | null} counts
 * @returns {string}
 */
function formatVulnerabilities (counts) {
  if (counts === null) return chalk.dim('n/d')
  if (counts.total === 0) return chalk.green('0')

  const breakdown = SEVERITIES
    .filter(({ key }) => counts[key] > 0)
    .map(({ key, color }) => color(`${counts[key]} ${key}`))
    .join(', ')

  return `${chalk.bold(counts.total)} (${breakdown})`
}

/**
 * @param {Array<{ repo: string, permission: string, vulnerabilities: string }>} rows
 */
function printTable (rows) {
  console.log('')
  console.log(chalkTable({
    columns: [
      { field: 'repo', name: chalk.cyan('Repo') },
      { field: 'permission', name: chalk.cyan('Permissão') },
      { field: 'vulnerabilities', name: chalk.cyan('Vulnerabilidades') }
    ]
  }, rows))
  console.log('')
  console.log(chalk.dim(`${rows.length} repositórios`))
}

/**
 * @param {string | undefined} stdout
 * @returns {Array<any>}
 */
function safeParseArray (stdout) {
  if (!stdout) return []
  try {
    const parsed = JSON.parse(stdout)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * @param {{ admin?: boolean; maintain?: boolean; push?: boolean }} [permissions]
 * @returns {boolean}
 */
function canMerge (permissions) {
  return Boolean(permissions?.push || permissions?.maintain || permissions?.admin)
}

/**
 * @param {{ admin?: boolean; maintain?: boolean; push?: boolean }} permissions
 * @returns {string}
 */
function highestPermission (permissions) {
  if (permissions.admin) return ADMIN
  if (permissions.maintain) return 'maintain'
  return 'push'
}

export default new ReposCommand()
