// @ts-check

import test from 'node:test'
import assert from 'node:assert'
import { findMergedBranches } from '../../src/commands/pr-clean/index.js'

test('findMergedBranches usa só o PR mais recente de cada branch e ignora forks', () => {
  const pulls = [
    { headRefName: 'reaberta', state: 'OPEN', url: 'u1', isCrossRepository: false },
    { headRefName: 'reaberta', state: 'MERGED', url: 'u2', isCrossRepository: false },
    { headRefName: 'feita', state: 'MERGED', url: 'u3', isCrossRepository: false },
    { headRefName: 'fork', state: 'MERGED', url: 'u4', isCrossRepository: true },
    { headRefName: 'fechada', state: 'CLOSED', url: 'u5', isCrossRepository: false }
  ]

  const result = findMergedBranches(['reaberta', 'feita', 'fork', 'fechada', 'sem-pr'], pulls)

  assert.deepStrictEqual(result, [{ branch: 'feita', url: 'u3' }])
})
