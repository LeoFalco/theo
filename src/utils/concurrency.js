// @ts-check

/**
 * Maps over items running at most `limit` tasks at the same time.
 * Results keep the order of the input, regardless of the order they settle in.
 *
 * @template Item, Result
 * @param {Item[]} items
 * @param {number} limit
 * @param {(item: Item, index: number) => Promise<Result>} task
 * @returns {Promise<Result[]>}
 */
export async function mapWithConcurrency (items, limit, task) {
  const results = new Array(items.length)
  const workers = Math.max(1, Math.min(limit, items.length))

  let cursor = 0

  async function worker () {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await task(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: workers }, worker))

  return results
}
