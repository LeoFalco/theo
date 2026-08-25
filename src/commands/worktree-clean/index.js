// @ts-check

import inquirer from 'inquirer'
import { $ } from '../../core/exec.js'
import { info, warn } from '../../core/patch-console-log.js'
import { extractLockPid, isProcessAlive, listWorkTrees } from '../../core/worktrees.js'

class WorktreeCleanCommand {
  /**
   *
   * @param {Object} param
   * @param {import('commander').Command} param.program
   * @returns
   * */
  install ({ program }) {
    program
      .command('worktree')
      .description('worktree commands')
      .command('clean')
      .description('remove all worktrees of the current git project')
      .option('-f, --force', 'remove worktrees even with uncommitted changes')
      .option('-y, --yes', 'skip all confirmation prompts, including forcing removal of locked worktrees')
      .action(this.action.bind(this))
  }

  async action (options) {
    const workTrees = await listWorkTrees()
    // A worktree principal não pode ser removida com `git worktree remove`, e a worktree
    // onde o comando está rodando também não — o git recusa remover o diretório atual.
    const removable = workTrees.filter((w) => !w.isMain && w.path !== process.cwd())

    if (removable.length === 0) {
      info('Nenhuma worktree para remover.')
      return
    }

    console.log('')
    console.log('Worktrees a remover:')
    for (const workTree of removable) {
      console.log(`  ${workTree.path}${workTree.branch ? ` (${workTree.branch})` : ''}`)
    }
    console.log('')

    if (!options.yes) {
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: `Remover ${removable.length} worktree${removable.length === 1 ? '' : 's'}?`,
        default: false
      }])
      if (!confirmed) {
        info('Cancelado — nada foi removido.')
        return
      }
    }

    const failed = []
    for (const workTree of removable) {
      info(`Removendo worktree ${workTree.path}${workTree.branch ? ` (${workTree.branch})` : ''}`)

      let forceRemove = Boolean(options.force)

      if (workTree.locked) {
        const pid = extractLockPid(workTree.lockReason)
        const alive = pid !== undefined ? isProcessAlive(pid) : undefined

        if (alive === false) {
          info(`Lock obsoleto detectado em ${workTree.path} (pid ${pid} não está mais em execução) — desbloqueando`)
        } else {
          const reason = alive
            ? `está em uso por um processo ativo (pid ${pid})`
            : `está bloqueada (${workTree.lockReason || 'sem motivo informado'}) e não foi possível identificar o processo dono`

          let proceed = Boolean(options.yes)
          if (!proceed) {
            const answer = await inquirer.prompt([{
              type: 'confirm',
              name: 'confirmed',
              message: `Worktree ${workTree.path} ${reason}. Remover mesmo assim?`,
              default: false
            }])
            proceed = answer.confirmed
          }

          if (!proceed) {
            warn(`Worktree ${workTree.path} ${reason} — não removida.`)
            failed.push(workTree.path)
            continue
          }

          info(`Removendo ${workTree.path} mesmo com o lock ativo, a pedido do usuário`)
          forceRemove = true
        }

        const unlockResult = await $(['git', 'worktree', 'unlock', workTree.path], { reject: false, returnProperty: 'all' })
        if (!unlockResult.success) {
          warn(`Não foi possível desbloquear ${workTree.path}: ${unlockResult.stderr}`)
          failed.push(workTree.path)
          continue
        }
      }

      const args = ['git', 'worktree', 'remove', workTree.path]
      if (forceRemove) args.push('--force')

      const result = await $(args, { reject: false, returnProperty: 'all' })
      if (!result.success) {
        warn(`Não foi possível remover ${workTree.path}: ${result.stderr}`)
        failed.push(workTree.path)
      }
    }

    await $('git worktree prune')

    const currentWorkTree = workTrees.find((w) => !w.isMain && w.path === process.cwd())
    if (currentWorkTree) {
      warn(`O diretório atual (${currentWorkTree.path}) também é uma worktree e não foi removido — saia dele e rode o comando de novo.`)
    }

    if (failed.length > 0) {
      warn(`Worktrees não removidas (use --force se houver alterações não commitadas): ${failed.join(', ')}`)
      process.exitCode = 1
    }
  }
}

export default new WorktreeCleanCommand()
