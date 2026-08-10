import { uniq } from 'lodash-es'

const TEMP_PROJECT_TEAM_MEMBERS = [
]
const GRID_PROJECT_TEAM_MEMBERS = [
  'LeoFalco', // Leo
  'leandroaugusto470', // Leandro Augusto
  'lilian-caballero', // Lilian
  'rafagfran', // Rafael
  'eduamorimm', // Eduardo
  'tauk7', // Matheus
  'MarianaLebrao' // Mariana
]

const GRID_MAINTENANCE_TEAM_MEMBERS = [
]

const FSM_PROJECT_TEAM_MEMBERS = [
  'caiorsantanna',
  'PedroHenriqueGazola',
  'matheusjurkovich',
  'Pedro-B-Siqueira'
]

const FSM_MAINTENANCE_TEAM_MEMBERS = [
  'AndreTrevizam',
  'rafaelcaniello',
  'Miguel01Santos',
  'LucasDelamura-Field',
  'CauanFelipeTavares',
  'claudiodeolli'
]

const QUALITY_TEAM = [
  'viniciusfantoli',
  'panegace',
  'giovanalmeida2'
]

const TEAMS = {
  'TEMP': [...TEMP_PROJECT_TEAM_MEMBERS].sort(),
  'TODOS': [...GRID_PROJECT_TEAM_MEMBERS, ...GRID_MAINTENANCE_TEAM_MEMBERS, ...FSM_PROJECT_TEAM_MEMBERS, ...FSM_MAINTENANCE_TEAM_MEMBERS].sort(),
  'GRID': [...GRID_PROJECT_TEAM_MEMBERS, ...GRID_MAINTENANCE_TEAM_MEMBERS].sort(),
  'FSM': [...FSM_PROJECT_TEAM_MEMBERS, ...FSM_MAINTENANCE_TEAM_MEMBERS].sort(),
  'GRID Projetos': GRID_PROJECT_TEAM_MEMBERS.sort(),
  'GRID Sustentação': GRID_MAINTENANCE_TEAM_MEMBERS.sort(),
  'FSM Projetos': FSM_PROJECT_TEAM_MEMBERS.sort(),
  'FSM Sustentação': FSM_MAINTENANCE_TEAM_MEMBERS.sort()
}

const ALL_MEMBERS = uniq([
  ...TEMP_PROJECT_TEAM_MEMBERS,
  ...GRID_PROJECT_TEAM_MEMBERS,
  ...GRID_MAINTENANCE_TEAM_MEMBERS,
  ...FSM_PROJECT_TEAM_MEMBERS,
  ...FSM_MAINTENANCE_TEAM_MEMBERS,
  ...QUALITY_TEAM
]).sort()

const duplicateMembers = ALL_MEMBERS.filter((item, index) => ALL_MEMBERS.indexOf(item) !== index)

if (duplicateMembers.length) {
  throw new Error(`There are duplicate members in the teams: ${[...new Set(duplicateMembers)].join(', ')}`)
}

export {
  TEAMS,
  QUALITY_TEAM
}
