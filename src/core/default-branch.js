// @ts-check

import { $ } from './exec.js'

/**
 * Branch default do origin. Pergunta ao servidor porque `refs/remotes/origin/HEAD` local fica
 * velho quando a default muda depois do clone, e o resultado decide o que é protegido de deleção.
 * `ls-remote --symref origin HEAD` traz só o HEAD, bem menos que `git remote show origin`.
 * Sem rede, cai no origin/HEAD local e, por fim, em `master`.
 * @returns {Promise<string>}
 */
export async function resolveDefaultBranch () {
  const remote = await $('git ls-remote --symref origin HEAD', { disableLog: true, loading: false, reject: false })
  const match = typeof remote === 'string' ? remote.match(/^ref: refs\/heads\/(\S+)\s+HEAD/m) : null
  if (match) return match[1]

  const originHead = await $('git symbolic-ref --short refs/remotes/origin/HEAD', { disableLog: true, loading: false, reject: false })
  if (typeof originHead === 'string' && originHead.startsWith('origin/')) {
    return originHead.slice('origin/'.length)
  }

  return 'master'
}
