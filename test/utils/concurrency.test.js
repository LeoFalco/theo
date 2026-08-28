// @ts-check

import assert from 'node:assert'
import test from 'node:test'
import { mapWithConcurrency } from '../../src/utils/concurrency.js'

test('should keep the results aligned with the input order', async () => {
  const delays = [30, 1, 20, 5]

  const results = await mapWithConcurrency(delays, 2, async (delay, index) => {
    await new Promise(resolve => setTimeout(resolve, delay))
    return index
  })

  assert.deepEqual(results, [0, 1, 2, 3])
})

test('should never run more tasks than the concurrency limit at once', async () => {
  let running = 0
  let peak = 0

  await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async () => {
    running++
    peak = Math.max(peak, running)
    await new Promise(resolve => setTimeout(resolve, 5))
    running--
  })

  assert.equal(peak, 3)
})

test('should resolve to an empty array when there is nothing to map', async () => {
  assert.deepEqual(await mapWithConcurrency([], 3, async () => 'never'), [])
})

test('should reject when a task rejects', async () => {
  await assert.rejects(
    () => mapWithConcurrency([1, 2], 2, async (item) => {
      if (item === 2) throw new Error('boom')
      return item
    }),
    /boom/
  )
})
