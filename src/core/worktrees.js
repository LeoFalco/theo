// @ts-check

import { $ } from './exec.js'

/**
 * Lists the git worktrees of the current repository. The first entry is always the
 * main worktree (flagged with `isMain: true`).
 * @returns {Promise<Array<{ path: string, branch?: string, isMain?: boolean }>>}
 */
export async function listWorkTrees () {
  const output = await $('git worktree list --porcelain', { disableLog: true, loading: false })
  if (typeof output !== 'string' || output === '') return []

  const workTrees = []
  let current = {}
  for (const line of output.split('\n')) {
    if (line === '') {
      if (current.path) workTrees.push(current)
      current = {}
      continue
    }
    const [key, ...rest] = line.split(' ')
    const value = rest.join(' ')
    if (key === 'worktree') current.path = value
    else if (key === 'branch') current.branch = value.replace('refs/heads/', '')
  }
  if (current.path) workTrees.push(current)

  if (workTrees.length > 0) workTrees[0].isMain = true
  return workTrees
}
