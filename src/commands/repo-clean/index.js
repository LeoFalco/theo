// @ts-check

import chalk from 'chalk'
import inquirer from 'inquirer'
import { $ } from '../../core/exec.js'
import { error, info, warn } from '../../core/patch-console-log.js'
import { listWorkTrees } from '../../core/worktrees.js'
import { resolveDefaultBranch } from '../../core/default-branch.js'
import { mapWithConcurrency } from '../../utils/concurrency.js'

const { bold, cyan, dim, green, red, yellow } = chalk

/** Branches that are never rebased, force-pushed or deleted, on top of the default and base branches. */
const LEGACY_PROTECTED_BRANCHES = ['homolog', 'preview', 'staging', 'wiki/master']

/** How many read-only `git` processes run at the same time. */
const GIT_CONCURRENCY = 8

class RepoCleanCommand {
  /**
   *
   * @param {Object} param
   * @param {import('commander').Command} param.program
   * @returns
   * */
  install ({ program }) {
    program
      .command('repo')
      .description('repo commands')
      .command('clean')
      .description('clean repo branches')
      .option('-b, --base-branch <branch>', 'specify the base branch')
      .option('-y, --yes', 'skip the confirmation prompt')
      .action(this.action.bind(this))
  }

  async action (options) {
    if (await hasUncommittedChanges()) {
      error('Working tree sujo — faça commit ou stash antes de rodar repo clean.')
      process.exitCode = 1
      return
    }

    const currentBranchName = await $('git rev-parse --abbrev-ref HEAD')
    await $('git fetch --all --prune')

    // A branch default do remote é a de produção: serve de referência, mas nunca é
    // rebaseada nem deletada. Quando existe `develop`, é ela que agrega o time.
    const defaultBranch = await resolveDefaultBranch()
    const baseBranch = options.baseBranch || (await remoteBranchExists('develop') ? 'develop' : defaultBranch)

    const protectedBranches = new Set([defaultBranch, baseBranch, ...LEGACY_PROTECTED_BRANCHES])

    const workTrees = await listWorkTrees()
    const workTreeBranches = new Set(workTrees.map((w) => w.branch).filter(Boolean))
    const baseWorkTree = workTrees.find((w) => w.branch === baseBranch)
    const runningFromWorkTree = workTrees.some((w) => w.path === process.cwd() && !w.isMain)

    await updateDefaultBranch({ defaultBranch, baseBranch, currentBranchName, workTreeBranches })

    const baseUpdate = await updateBaseBranch({ baseBranch, baseWorkTree, currentBranchName })
    if (!baseUpdate.success) {
      error(`Não foi possível atualizar ${baseBranch}: ${baseUpdate.stderr || 'conflito no pull --rebase'}. Resolva antes de rodar repo clean.`)
      process.exitCode = 1
      return
    }

    const candidates = await listLocalBranches()
      .then((branches) => branches.filter((branch) => !protectedBranches.has(branch.name)))
      // Branches presas em outra worktree não podem ser checked out aqui. A worktree
      // atual é a exceção: sua branch é rebaseada como qualquer outra.
      .then((branches) => branches.filter((branch) => !workTreeBranches.has(branch.name) || branch.name === currentBranchName))

    const unmergedCounts = await mapWithConcurrency(candidates, GIT_CONCURRENCY, (branch) => countUnmergedCommits(branch.name, baseBranch))

    const plan = { rebase: [], delete: [] }
    for (const [index, branch] of candidates.entries()) {
      const commits = unmergedCounts[index]
      if (commits === 0) {
        plan.delete.push(branch.name)
        continue
      }
      plan.rebase.push({ name: branch.name, commits, push: resolvePushMode(branch) })
    }

    if (plan.rebase.length === 0 && plan.delete.length === 0) {
      info(`Nenhuma branch local para rebasear ou deletar em relação a ${baseBranch}`)
    } else {
      printPlan({ plan, baseBranch, defaultBranch })
      if (!options.yes && !await confirmPlan()) {
        info('Cancelado — nada foi alterado.')
        return
      }
    }

    const conflicted = []
    const toPush = []
    for (const item of plan.rebase) {
      const checkout = await $(`git checkout ${item.name}`, { reject: false, returnProperty: 'all' })
      if (!checkout.success) {
        warn(`PULADA ${item.name}: não foi possível fazer checkout — branch mantida como estava`)
        conflicted.push(item.name)
        continue
      }

      const rebase = await $(`git rebase ${baseBranch}`, { reject: false, returnProperty: 'all' })
      if (!rebase.success) {
        await $('git rebase --abort', { reject: false, returnProperty: 'all' })
        warn(`PULADA ${item.name}: conflito no rebase sobre ${baseBranch} — rebase abortado, branch mantida como estava`)
        conflicted.push(item.name)
        continue
      }

      if (item.push === 'skip') {
        info(`${item.name}: rebaseada em ${baseBranch}; push pulado porque a branch remota foi deletada`)
        continue
      }

      toPush.push(item)
    }

    // Um push só para todas as branches: cada push é uma ida ao remote.
    if (toPush.length > 0) {
      const rejected = await pushRefs(['--force', ...toPush.map((item) => item.name)])
      for (const item of toPush) {
        if (rejected.has(item.name)) {
          warn(`${item.name}: rebaseada em ${baseBranch}, mas o push falhou: ${rejected.get(item.name)}`)
        } else {
          info(`${item.name}: rebaseada em ${baseBranch} e ${item.push === 'create' ? 'branch remota criada' : 'force-push feito'}`)
        }
      }
    }

    if (!runningFromWorkTree) {
      await $(`git checkout ${baseBranch}`)
    }

    const removableWorkTrees = workTrees.filter((w) => !w.isMain && w.path !== process.cwd())
    for (const workTree of removableWorkTrees) {
      info(`Removendo worktree ${workTree.path}${workTree.branch ? ` (${workTree.branch})` : ''}`)
      const removed = await $(['git', 'worktree', 'remove', workTree.path], { reject: false, returnProperty: 'all' })
      if (!removed.success) {
        // Uma worktree suja não pode interromper a limpeza: ela e sua branch ficam como estão.
        warn(`Não foi possível remover a worktree ${workTree.path}: ${summarizeGitError(removed.stderr)}`)
        continue
      }
      if (!workTree.branch) continue
      workTreeBranches.delete(workTree.branch)
      if (protectedBranches.has(workTree.branch)) continue
      if (await countUnmergedCommits(workTree.branch, baseBranch) === 0) {
        plan.delete.push(workTree.branch)
      } else {
        warn(`${workTree.branch}: estava presa em uma worktree e não foi rebaseada — rode repo clean de novo`)
      }
    }

    if (plan.delete.length === 0) {
      info('Nenhuma branch local para deletar')
    } else {
      for (const branch of plan.delete) {
        info(`Deletando branch local ${branch}`)
        const deleted = await $(`git branch -D ${branch}`, { reject: false, returnProperty: 'all' })
        if (!deleted.success) warn(`Não foi possível deletar ${branch}: ${deleted.stderr}`)
      }
    }

    if (!plan.delete.includes(currentBranchName)) {
      await $(`git checkout ${currentBranchName}`, { reject: false, returnProperty: 'all' })
    }

    if (conflicted.length > 0) {
      warn(`Branches puladas por conflito ou checkout falho (resolva na mão): ${conflicted.join(', ')}`)
    }

    const mergedOnRemoteBranches = await $(`git branch -r --merged origin/${baseBranch}`)
      .then((output) => output.split('\n'))
      .then((branches) => branches.map((branch) => branch.trim()))
      .then((branches) => branches.filter((branch) => branch !== ''))
      .then((branches) => branches.map((branch) => branch.replace('origin/', '')))
      .then((branches) => branches.filter((branch) => branch.startsWith('HEAD') === false))
      .then((branches) => branches.filter((branch) => !protectedBranches.has(branch)))

    if (mergedOnRemoteBranches.length === 0) {
      info('Nenhuma branch remota para deletar')
      return
    }

    const { remoteBranchesToDelete } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'remoteBranchesToDelete',
      message: 'Selecione as branches remotas para deletar (as suas vêm primeiro)',
      choices: await buildRemoteBranchChoices(mergedOnRemoteBranches)
    }])

    // Sem --atomic cada ref é independente: uma branch sem permissão não impede as outras.
    const rejected = remoteBranchesToDelete.length > 0 ? await pushRefs(['--delete', ...remoteBranchesToDelete]) : new Map()
    const notDeleted = []
    for (const branch of remoteBranchesToDelete) {
      if (!rejected.has(branch)) {
        info(`Branch remota ${branch} deletada`)
        continue
      }
      notDeleted.push(branch)
      warn(`Não foi possível deletar ${branch}: ${rejected.get(branch)}`)
    }

    if (notDeleted.length > 0) {
      warn(`Branches remotas não deletadas: ${notDeleted.join(', ')}`)
      info('No Azure DevOps deletar branch exige a permissão \'Force Push\', concedida só a quem criou a branch. Peça a quem abriu o PR para deletar.')
    }
  }
}

/**
 * Mostra o autor de cada branch remota e coloca as suas primeiro: no Azure DevOps só dá
 * para deletar branch que você criou, então escolher às cegas resulta em erro de permissão.
 * @param {string[]} branches
 */
async function buildRemoteBranchChoices (branches) {
  const me = await $('git config user.email', { disableLog: true, loading: false, reject: false })

  // Uma chamada para todas as branches em vez de um `git log` por branch.
  const output = await $(['git', 'for-each-ref', '--format=%(refname:lstrip=3)%09%(authoremail)', 'refs/remotes/origin'], { disableLog: true, loading: false, reject: false })
  const authors = new Map((typeof output === 'string' ? output : '').split('\n').filter(Boolean).map((line) => {
    const [branch, email] = line.split('\t')
    return [branch, (email || '').replace(/^<|>$/g, '')]
  }))

  const entries = branches.map((branch) => {
    const author = authors.get(branch) || ''
    return { branch, author, mine: Boolean(me) && author === me }
  })

  entries.sort((a, b) => Number(b.mine) - Number(a.mine) || a.branch.localeCompare(b.branch))

  return entries.map((entry) => ({
    value: entry.branch,
    name: entry.mine ? entry.branch : `${entry.branch} ${dim(`(${entry.author})`)}`
  }))
}

/**
 * Faz um único `git push` para várias refs e devolve as rejeitadas, com o motivo.
 * Lê o `--porcelain`, que traz uma linha `!\t<src>:<dst>\t<motivo>` por ref rejeitada.
 * @param {string[]} args
 * @returns {Promise<Map<string, string>>}
 */
async function pushRefs (args) {
  const result = await $(['git', 'push', '--porcelain', '--no-verify', 'origin', ...args], { reject: false, returnProperty: 'all' })
  const rejected = new Map()
  for (const line of (result.stdout || '').split('\n')) {
    const [flag, refs, reason] = line.split('\t')
    if (flag !== '!' || !refs) continue
    rejected.set(refs.split(':').pop().replace('refs/heads/', ''), reason || 'rejeitada')
  }
  // Falha sem ref rejeitada (rede, auth): todas contam como não enviadas.
  if (!result.success && rejected.size === 0) {
    const reason = summarizeGitError(result.stderr)
    for (const arg of args) if (!arg.startsWith('--')) rejected.set(arg, reason)
  }
  return rejected
}

/** Extrai a linha útil do erro do git, descartando o resto do ruído. */
function summarizeGitError (stderr) {
  const lines = (stderr || '').split('\n').map((line) => line.trim()).filter(Boolean)
  return lines.find((line) => line.includes('[remote rejected]')) || lines[0] || 'erro desconhecido'
}

/**
 * Deixa a base em dia antes de calcular o plano: é ela que decide o que já foi mergeado e é
 * sobre ela que todo mundo é rebaseado. Usa `--rebase` para nunca deixar um merge commit na base.
 * Se der conflito, aborta o rebase para não deixar a base em estado intermediário.
 * @returns {Promise<{ success: boolean, stderr?: string }>}
 */
async function updateBaseBranch ({ baseBranch, baseWorkTree, currentBranchName }) {
  // Caminho rápido: fast-forward a partir do fetch já feito — sem rede e sem checkout.
  // Só falha quando a base tem commits locais, e aí cai no rebase abaixo.
  if (!baseWorkTree && currentBranchName !== baseBranch) {
    const ff = await $(['git', 'fetch', '.', `origin/${baseBranch}:${baseBranch}`], { reject: false, returnProperty: 'all' })
    if (ff.success) return ff
  }

  const cwd = baseWorkTree ? baseWorkTree.path : undefined

  if (!baseWorkTree) {
    const checkout = await $(`git checkout ${baseBranch}`, { reject: false, returnProperty: 'all' })
    if (!checkout.success) return { success: false, stderr: checkout.stderr }
  }

  // O `git fetch` do início já trouxe origin/<base>; `--fork-point` mantém o comportamento do `pull --rebase`.
  const pull = await $(`git rebase --fork-point origin/${baseBranch}`, { cwd, reject: false, returnProperty: 'all' })
  if (!pull.success) {
    await $('git rebase --abort', { cwd, reject: false, returnProperty: 'all' })
  }

  if (!baseWorkTree) {
    await $(`git checkout ${currentBranchName}`, { reject: false, returnProperty: 'all' })
  }

  return pull
}

/**
 * Decide o que fazer com o push depois do rebase.
 * Uma branch cujo upstream sumiu (`gone`) foi deletada no remote de propósito — recriá-la
 * ressuscitaria uma branch já mergeada, então o push é pulado.
 * @param {{ name: string, gone: boolean, remoteExists: boolean }} branch
 * @returns {'skip' | 'create' | 'update'}
 */
function resolvePushMode (branch) {
  if (branch.gone) return 'skip'
  return branch.remoteExists ? 'update' : 'create'
}

function printPlan ({ plan, baseBranch, defaultBranch }) {
  const groups = [
    { title: 'Rebase + force-push', items: plan.rebase.filter((i) => i.push === 'update'), color: cyan },
    { title: 'Rebase + push (cria a branch remota)', items: plan.rebase.filter((i) => i.push === 'create'), color: green },
    { title: 'Rebase local, sem push (branch remota foi deletada)', items: plan.rebase.filter((i) => i.push === 'skip'), color: yellow }
  ]

  console.log('')
  console.log(bold(`Plano de limpeza — base: ${baseBranch}`), dim(`(branch de produção protegida: ${defaultBranch})`))

  for (const group of groups) {
    if (group.items.length === 0) continue
    console.log('')
    console.log('  ' + group.color(group.title))
    for (const item of group.items) {
      console.log(`    ${item.name} ${dim(`(${item.commits} commit${item.commits === 1 ? '' : 's'} fora de ${baseBranch})`)}`)
    }
  }

  if (plan.delete.length > 0) {
    console.log('')
    console.log('  ' + red(`Deletar local (nenhum commit fora de ${baseBranch})`))
    for (const branch of plan.delete) console.log(`    ${branch}`)
  }

  console.log('')
}

async function confirmPlan () {
  const { confirmed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message: 'Aplicar esse plano?',
    default: false
  }])
  return confirmed
}

async function hasUncommittedChanges () {
  const output = await $('git status --porcelain', { disableLog: true, loading: false })
  return typeof output === 'string' && output !== ''
}

/**
 * Mantém a branch de produção em dia sem nunca reescrevê-la: só fast-forward.
 */
async function updateDefaultBranch ({ defaultBranch, baseBranch, currentBranchName, workTreeBranches }) {
  if (defaultBranch === baseBranch) return
  if (!await localBranchExists(defaultBranch)) return

  const result = currentBranchName === defaultBranch
    ? await $(`git merge --ff-only origin/${defaultBranch}`, { reject: false, returnProperty: 'all' })
    : workTreeBranches.has(defaultBranch)
      ? { success: true }
      : await $(['git', 'fetch', '.', `origin/${defaultBranch}:${defaultBranch}`], { reject: false, returnProperty: 'all' })

  if (!result.success) {
    warn(`Não foi possível atualizar ${defaultBranch} por fast-forward — deixando como está`)
  }
}

async function localBranchExists (branch) {
  const result = await $(`git rev-parse --verify --quiet refs/heads/${branch}`, { disableLog: true, loading: false, reject: false, returnProperty: 'all' })
  return result.success
}

async function remoteBranchExists (branch) {
  const result = await $(`git rev-parse --verify --quiet refs/remotes/origin/${branch}`, { disableLog: true, loading: false, reject: false, returnProperty: 'all' })
  return result.success
}

/**
 * Lista as branches locais com o estado do upstream de cada uma.
 * @returns {Promise<Array<{ name: string, upstream: string | null, gone: boolean, remoteExists: boolean }>>}
 */
async function listLocalBranches () {
  const output = await $('git for-each-ref --format=%(refname:short)%09%(upstream:short)%09%(upstream:track) refs/heads', { disableLog: true, loading: false })
  if (typeof output !== 'string' || output === '') return []

  // Uma chamada para todas as branches remotas em vez de um `git rev-parse` por branch local.
  const remoteOutput = await $(['git', 'for-each-ref', '--format=%(refname:lstrip=3)', 'refs/remotes/origin'], { disableLog: true, loading: false })
  const remoteBranches = new Set(typeof remoteOutput === 'string' ? remoteOutput.split('\n') : [])

  return output.split('\n').filter(Boolean).map((line) => {
    const [name, upstream, track] = line.split('\t')
    return {
      name,
      upstream: upstream || null,
      gone: (track || '').includes('gone'),
      remoteExists: remoteBranches.has(name)
    }
  })
}

/**
 * Conta os commits de `branch` cujo patch ainda não está em `baseBranch`.
 * Usa `git cherry`, que compara por patch-id — então commits que entraram via squash merge
 * são corretamente reconhecidos como já mergeados.
 * @param {string} branch
 * @param {string} baseBranch
 * @returns {Promise<number>}
 */
async function countUnmergedCommits (branch, baseBranch) {
  const output = await $(`git cherry ${baseBranch} ${branch}`, { disableLog: true, loading: false, reject: false })
  if (typeof output !== 'string') return 0
  return output.split('\n').filter((line) => line.startsWith('+')).length
}

export default new RepoCleanCommand()
