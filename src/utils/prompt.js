// @ts-check

import inquirer from 'inquirer'
import { fetchTeams, resolveTeamMembers } from '../core/teams.js'
import { dateFilter, dateValidator, notNullValidator } from '../core/validators.js'

/**
 * Resolves the team to analyze, researching the teams of the organization at
 * selection time (github org teams via `gh`, azure devops teams via `az`).
 *
 * @param {Object} options
 * @param {string | undefined} options.team
 * @param {import('../core/teams.js').TeamSource} source
 * @returns {Promise<{ name: string, slug?: string, members: string[] }>}
 */
export async function promptTeam (options, source) {
  const teams = await fetchTeams(source)

  if (teams.length === 0) {
    throw new Error('Nenhum time encontrado para a organização.')
  }

  const picked = options?.team && teams.find((team) => matchesTeam(team, options.team))

  if (!picked) {
    if (options?.team) {
      console.warn(`Time ${options.team} não encontrado, por favor selecione um time da lista abaixo`)
    }

    // @ts-ignore
    const { team } = await inquirer.prompt([
      {
        type: 'select',
        message: 'Por favor selecione o time que deseja analisar',
        name: 'team',
        choices: teams.map((team) => team.name),
        default: teams[0]?.name,
        validate: notNullValidator('Por favor selecione um time')
      }
    ])

    const selected = teams.find((candidate) => candidate.name === team)

    return {
      name: team,
      slug: selected?.slug,
      members: await resolveTeamMembers(source, selected || { name: team })
    }
  }

  return {
    name: picked.name,
    slug: picked.slug,
    members: await resolveTeamMembers(source, picked)
  }
}

/**
 * @param {import('../core/teams.js').Team} team
 * @param {string} name
 * @returns {boolean}
 */
function matchesTeam (team, name) {
  const target = String(name || '').toLowerCase()
  return team.name.toLowerCase() === target || (team.slug || '').toLowerCase() === target
}

/**
 * @param {{ from: any; to?: string | undefined; team?: string | undefined; }} options
 */
export async function promptFrom (options) {
  if (options.from) {
    if (options.from.toLowerCase() === 'today') {
      return new Date().toISOString().split('T').shift()
    }

    // yesterday
    if (options.from.toLowerCase() === 'yesterday') {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      return yesterday.toISOString().split('T').shift()
    }

    if (dateValidator(options.from) === true) {
      return dateFilter(options.from)
    }

    console.warn(`Data inicial ${options.from} inválida, por favor informe uma data válida`)
  }

  const { from } = await inquirer.prompt([
    {
      type: 'input',
      name: 'from',
      message: 'Informe a data inicial no formato yyyy-mm-dd',
      default: new Date().toISOString().split('T').shift(),
      validate: dateValidator,
      filter: dateFilter
    }
  ])

  console.log('Data inicial selecionada:', from)

  return from
}

/**
 * @param {{ from?: string | undefined; to: any; team?: string | undefined; }} options
 */
export async function promptTo (options) {
  if (options.to) {
    if (options.to.toLowerCase() === 'today') {
      return new Date().toISOString().split('T').shift()
    }

    if (options.to.toLowerCase() === 'yesterday') {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      return yesterday.toISOString().split('T').shift()
    }

    if (dateValidator(options.to) === true) {
      return dateFilter(options.to)
    }

    console.warn(`Data final ${options.to} inválida, por favor informe uma data válida`)
  }

  // @ts-ignore
  const { to } = await inquirer.prompt([
    {
      type: 'input',
      name: 'to',
      message: 'Informe a data final no formato yyyy-mm-dd',
      default: new Date().toISOString().split('T').shift(),
      validate: dateValidator,
      filter: dateFilter
    }
  ])

  console.log('Data final selecionada:', to)

  return to
}

/**
 * @param {Object} options
 * @param {boolean} [options.confirm]
 * @param {string} [options.message]
 * @param {boolean} [options.default]
 */
export async function promptConfirm (options) {
  if (options.confirm) return true

  const answer = await inquirer.prompt({
    type: 'confirm',
    name: 'confirm',
    message: options.message ?? 'Você tem certeza que deseja prosseguir?',
    default: options.default ?? true
  })

  return answer.confirm
}
