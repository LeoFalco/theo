// @ts-check

import assert from 'node:assert'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'bun:test'
import { $, parseCommandString } from '../../src/core/exec.js'

const PRINT_ARGV = 'console.log(JSON.stringify(process.argv.slice(1)))'

test('should keep separators and spaces of an argument passed as an array', async () => {
  const path = join('C:', 'Program Files', 'theo', '.git')

  const output = await $(['bun', '-e', PRINT_ARGV, path], { loading: false, disableLog: true })

  assert.deepEqual(JSON.parse(String(output)), [path])
})

test('should split a command passed as a string', async () => {
  const output = await $(`bun -e ${PRINT_ARGV} first second`, { loading: false, disableLog: true })

  assert.deepEqual(JSON.parse(String(output)), ['first', 'second'])
})

test('should return raw bytes when the buffer encoding is requested', async () => {
  const script = 'process.stdout.write(Buffer.from([0x61, 0xE7, 0x6F]))'

  const result = await $(['bun', '-e', script], {
    loading: false,
    disableLog: true,
    encoding: 'buffer',
    returnProperty: 'all'
  })

  assert.ok(ArrayBuffer.isView(result.stdout), 'stdout should be raw bytes')
  assert.deepEqual([...result.stdout], [0x61, 0xE7, 0x6F])
})

test('should split like execa: escaped spaces stay inside the token', () => {
  assert.deepEqual(parseCommandString('  a\\ b  c  '), ['a b', 'c'])
  assert.deepEqual(parseCommandString('trailing\\ '), ['trailing '])
  assert.deepEqual(parseCommandString(''), [])
})

test('should throw with the exit code and stderr when the command fails', async () => {
  const failing = $(['bun', '-e', 'console.error("boom"); process.exit(3)'], { loading: false, disableLog: true })

  await assert.rejects(failing, /exit code 3[\s\S]*boom/)
})

test('should return the exit code instead of throwing when reject is false', async () => {
  const result = await $(['bun', '-e', 'process.exit(2)'], { loading: false, disableLog: true, reject: false, returnProperty: 'all' })

  assert.equal(result.exitCode, 2)
  assert.equal(result.success, false)
})

test('should report a missing command as a failure when reject is false', async () => {
  const result = await $(['theo-command-that-does-not-exist'], { loading: false, disableLog: true, reject: false, returnProperty: 'all' })

  assert.equal(result.success, false)
})

function createShim () {
  const dir = mkdtempSync(join(tmpdir(), 'theo-'))
  writeFileSync(join(dir, 'theo-shim.cmd'), '@echo %1\r\n')
  return dir
}

test.if(process.platform === 'win32')('should run a .cmd shim by its path', async () => {
  const dir = createShim()

  assert.equal(await $([join(dir, 'theo-shim.cmd'), 'hello'], { loading: false, disableLog: true }), 'hello')
})

test.if(process.platform === 'win32')('should run a .cmd shim found in PATH, like az', async () => {
  const dir = createShim()
  // Windows names the variable Path; writing PATH would add a second key next to it
  const key = Object.keys(process.env).find(name => name.toUpperCase() === 'PATH') ?? 'PATH'
  const previousPath = process.env[key]
  process.env[key] = `${dir};${previousPath}`
  try {
    assert.equal(await $(['theo-shim', 'hello'], { loading: false, disableLog: true }), 'hello')
  } finally {
    process.env[key] = previousPath
  }
})
