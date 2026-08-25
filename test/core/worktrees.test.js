// @ts-check

import assert from 'node:assert'
import test from 'node:test'
import { extractLockPid, isProcessAlive } from '../../src/core/worktrees.js'

test('extractLockPid extracts the pid from a claude session lock reason', () => {
  const reason = 'claude session sunny-pondering-meadow (pid 8968 start Tue Aug 25 11:38:31 2026)'
  assert.equal(extractLockPid(reason), 8968)
})

test('extractLockPid returns undefined when there is no pid in the reason', () => {
  assert.equal(extractLockPid('manually locked, do not remove'), undefined)
  assert.equal(extractLockPid(undefined), undefined)
  assert.equal(extractLockPid(''), undefined)
})

test('isProcessAlive returns true for the current process', () => {
  assert.equal(isProcessAlive(process.pid), true)
})

test('isProcessAlive returns false for a pid that does not exist', () => {
  // PIDs are 16-bit on most platforms; this is well past any real process.
  assert.equal(isProcessAlive(999999), false)
})
