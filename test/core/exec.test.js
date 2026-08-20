// @ts-check

import assert from 'node:assert'
import { join } from 'node:path'
import test from 'node:test'
import { $ } from '../../src/core/exec.js'

const PRINT_ARGV = 'console.log(JSON.stringify(process.argv.slice(1)))'

test('should keep separators and spaces of an argument passed as an array', async () => {
  const path = join('C:', 'Program Files', 'theo', '.git')

  const output = await $(['node', '-e', PRINT_ARGV, path], { loading: false, disableLog: true })

  assert.deepEqual(JSON.parse(String(output)), [path])
})

test('should split a command passed as a string', async () => {
  const output = await $(`node -e ${PRINT_ARGV} first second`, { loading: false, disableLog: true })

  assert.deepEqual(JSON.parse(String(output)), ['first', 'second'])
})
