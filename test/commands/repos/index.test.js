// @ts-check

import test from 'node:test'
import assert from 'node:assert'
import { sumTotals, formatDelta } from '../../../src/commands/repos/index.js'

test('sumTotals soma counts por severidade ignorando linhas sem dados', () => {
  const rows = [
    { counts: { total: 3, critical: 1, high: 2, medium: 0, low: 0 } },
    { counts: { total: 2, critical: 0, high: 1, medium: 1, low: 0 } },
    { counts: null }
  ]

  const result = sumTotals(rows)

  assert.deepEqual(result, { total: 5, critical: 1, high: 3, medium: 1, low: 0 })
})

test('sumTotals retorna tudo zero quando nao ha counts', () => {
  const result = sumTotals([{ counts: null }, { counts: null }])

  assert.deepEqual(result, { total: 0, critical: 0, high: 0, medium: 0, low: 0 })
})

const stripAnsi = (str) => str.replace(/\[[0-9;]*m/g, '')

test('formatDelta retorna vazio quando nao ha baseline', () => {
  assert.equal(formatDelta(5, null), '')
  assert.equal(formatDelta(5, undefined), '')
})

test('formatDelta retorna vazio quando nao mudou', () => {
  assert.equal(formatDelta(5, 5), '')
})

test('formatDelta mostra aumento com sinal de mais', () => {
  assert.equal(stripAnsi(formatDelta(8, 5)), ' (+3)')
})

test('formatDelta mostra reducao com sinal de menos', () => {
  assert.equal(stripAnsi(formatDelta(2, 5)), ' (-3)')
})
