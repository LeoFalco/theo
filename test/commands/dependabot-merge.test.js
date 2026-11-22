import { test } from 'bun:test'
import assert from 'node:assert'
import { getCiStatus } from '../../src/commands/dependabot/merge.js'

const pr = (contexts) => ({ lastCommit: { nodes: [{ commit: { statusCheckRollup: contexts && { contexts: { nodes: contexts } } } }] } })
const run = (conclusion, extra) => ({ __typename: 'CheckRun', name: 'build', conclusion, title: null, summary: null, ...extra })
const status = (state) => ({ __typename: 'StatusContext', context: 'ci/legacy', state, description: 'quebrou' })

test('getCiStatus sem checks é none', () => {
  assert.deepStrictEqual(getCiStatus(pr(null)), { status: 'none', failures: [] })
})

test('getCiStatus com tudo verde, neutro ou pulado é passing', () => {
  assert.strictEqual(getCiStatus(pr([run('SUCCESS'), run('NEUTRAL'), run('SKIPPED'), status('SUCCESS')])).status, 'passing')
})

test('getCiStatus com check em andamento é pending', () => {
  assert.strictEqual(getCiStatus(pr([run('SUCCESS'), run(null)])).status, 'pending')
  assert.strictEqual(getCiStatus(pr([status('PENDING')])).status, 'pending')
})

test('getCiStatus com falha é failing e lista check run e status', () => {
  const result = getCiStatus(pr([run('FAILURE', { title: 'Test', summary: 'linha 1\nlinha 2' }), status('ERROR'), run('SUCCESS')]))
  assert.deepStrictEqual(result, {
    status: 'failing',
    failures: [
      { name: 'build', step: 'Test', message: 'linha 1' },
      { name: 'ci/legacy', step: null, message: 'quebrou' }
    ]
  })
})
