import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { Command } from 'commander'
import { installCommands } from '../../src/commands/index.js'

async function installedNames (requested) {
  const program = new Command()
  await installCommands({ program, requested })
  return program.commands.map((command) => command.name())
}

test('a command named after its directory loads only that directory', async () => {
  assert.deepEqual(await installedNames('push'), ['push'])
})

test('a prefix loads every directory that starts with it', async () => {
  assert.deepEqual((await installedNames('repo')).sort(), ['repo'])
  assert.deepEqual((await installedNames('pr')).sort(), ['pr', 'pr-clean'])
})

test('no argument, a typo or a name that differs from its directory loads everything', async () => {
  const all = await installedNames(undefined)
  assert.ok(all.length > 20)
  assert.deepEqual(await installedNames('naoexiste'), all)
  assert.ok((await installedNames('amend')).includes('amend'))
})
