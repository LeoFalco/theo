// @ts-check

import assert from 'node:assert'
import test from 'node:test'
import { normalizeMergedPull } from '../../src/modules/merged-data-azure.js'

const remoteInfo = {
  provider: 'azure',
  owner: 'contoso',
  project: 'Projetos',
  repository: 'MyRepo',
  organizationUrl: 'https://dev.azure.com/contoso',
  url: 'git@ssh.dev.azure.com:v3/contoso/Projetos/MyRepo'
}

function makePull (overrides = {}) {
  return {
    pullRequestId: 42,
    title: 'feat: azure support',
    creationDate: '2026-09-10T12:00:00Z',
    closedDate: '2026-09-14T12:00:00Z',
    createdBy: { displayName: 'Leo', uniqueName: 'leo@contoso.com' },
    ...overrides
  }
}

test('should normalize a merged azure pull request into the merged shape', () => {
  const pull = normalizeMergedPull({ pullRequest: makePull(), remoteInfo: /** @type {any} */(remoteInfo) })

  assert.equal(pull.url, 'https://dev.azure.com/contoso/Projetos/_git/MyRepo/pullrequest/42')
  assert.equal(pull.title, 'feat: azure support')
  assert.deepEqual(pull.author, { login: 'leo@contoso.com', name: 'Leo' })
  assert.ok(pull.createdAt.startsWith('2026-09-10'))
  assert.ok(pull.mergedAt.startsWith('2026-09-14'))
  assert.ok(pull.durationDays >= 1)
  assert.equal('team' in pull, false)
})

test('should truncate titles longer than 80 characters', () => {
  const pull = normalizeMergedPull({
    pullRequest: makePull({ title: 'a'.repeat(120) }),
    remoteInfo: /** @type {any} */(remoteInfo)
  })

  assert.equal(pull.title, `${'a'.repeat(80)}...`)
})

test('should leave the duration unset when a date is missing', () => {
  const pull = normalizeMergedPull({
    pullRequest: makePull({ closedDate: undefined }),
    remoteInfo: /** @type {any} */(remoteInfo)
  })

  assert.equal(pull.mergedAt, null)
  assert.equal(pull.durationDays, null)
})

test('should fall back to the display name when the unique name is missing', () => {
  const pull = normalizeMergedPull({
    pullRequest: makePull({ createdBy: { displayName: 'Leo Falco' } }),
    remoteInfo: /** @type {any} */(remoteInfo)
  })

  assert.equal(pull.author.login, 'Leo Falco')
})
