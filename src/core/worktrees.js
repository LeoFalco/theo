// @ts-check

import { $ } from './exec.js'

/**
 * Lists the git worktrees of the current repository. The first entry is always the
 * main worktree (flagged with `isMain: true`).
 * @returns {Promise<Array<{ path: string, branch?: string, isMain?: boolean, locked?: boolean, lockReason?: string }>>}
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
    else if (key === 'locked') {
      current.locked = true
      if (value) current.lockReason = value
    }
  }
  if (current.path) workTrees.push(current)

  if (workTrees.length > 0) workTrees[0].isMain = true
  return workTrees
}

/**
 * Extracts a pid from a worktree lock reason, e.g. "claude session foo (pid 8968 start ...)".
 * @param {string | undefined} lockReason
 * @returns {number | undefined}
 */
export function extractLockPid (lockReason) {
  const match = /\bpid\s+(\d+)/.exec(lockReason || '')
  return match ? Number(match[1]) : undefined
}

/**
 * Checks whether a process with the given pid is still alive. Works cross-platform:
 * Node's `process.kill(pid, 0)` sends no signal, it only probes for existence.
 * @param {number} pid
 * @returns {boolean}
 */
export function isProcessAlive (pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // ESRCH: no such process. EPERM: process exists but we lack permission — still alive.
    return err.code === 'EPERM'
  }
}
