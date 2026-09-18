// @ts-check

import assert from 'node:assert'
import test from 'node:test'
import { normalizeAzurePull } from '../../src/modules/opened-data-azure.js'

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
    mergeStatus: 'succeeded',
    isDraft: false,
    createdBy: { displayName: 'Leo', uniqueName: 'leo@contoso.com' },
    reviewers: [{ vote: 10, isContainer: false }],
    policyEvaluations: [{ configuration: { type: { displayName: 'Build' } }, status: 'approved' }],
    ...overrides
  }
}

test('should normalize an azure pull request into the opened shape', () => {
  const pull = normalizeAzurePull({ pullRequest: makePull(), remoteInfo: /** @type {any} */(remoteInfo) })

  assert.equal(pull.url, 'https://dev.azure.com/contoso/Projetos/_git/MyRepo/pullrequest/42')
  assert.equal(pull.title, 'feat: azure support')
  assert.deepEqual(pull.author, { login: 'leo@contoso.com', name: 'Leo' })
  assert.equal(pull.ready, true)
  assert.equal(pull.mergeable, true)
  assert.equal(pull.checks, true)
  assert.equal(pull.checksInProgress, false)
  assert.equal(pull.approved, true)
  assert.equal(pull.notRejected, true)
  assert.equal('quality' in pull, false)
  assert.ok(pull.age >= 1)
})

test('should flag drafts as not ready', () => {
  const pull = normalizeAzurePull({ pullRequest: makePull({ isDraft: true }), remoteInfo: /** @type {any} */(remoteInfo) })

  assert.equal(pull.ready, false)
})

test('should mark the pull as not mergeable when the merge status is conflicting', () => {
  const pull = normalizeAzurePull({ pullRequest: makePull({ mergeStatus: 'conflicts' }), remoteInfo: /** @type {any} */(remoteInfo) })

  assert.equal(pull.mergeable, false)
})

test('should flag the checks from the build policy evaluations', () => {
  const rejected = normalizeAzurePull({
    pullRequest: makePull({ policyEvaluations: [{ configuration: { type: { displayName: 'Build' } }, status: 'rejected' }] }),
    remoteInfo: /** @type {any} */(remoteInfo)
  })
  const running = normalizeAzurePull({
    pullRequest: makePull({ policyEvaluations: [{ configuration: { type: { displayName: 'Build' } }, status: 'queued' }] }),
    remoteInfo: /** @type {any} */(remoteInfo)
  })
  const none = normalizeAzurePull({ pullRequest: makePull({ policyEvaluations: [] }), remoteInfo: /** @type {any} */(remoteInfo) })

  assert.equal(rejected.checks, false)
  assert.equal(rejected.checksInProgress, false)
  assert.equal(running.checks, false)
  assert.equal(running.checksInProgress, true)
  assert.equal(none.checks, true)
})

test('should derive approval and rejection from the reviewer votes', () => {
  const rejected = normalizeAzurePull({
    pullRequest: makePull({ reviewers: [{ vote: -10, isContainer: false }] }),
    remoteInfo: /** @type {any} */(remoteInfo)
  })
  const waiting = normalizeAzurePull({
    pullRequest: makePull({ reviewers: [{ vote: -5, isContainer: false }] }),
    remoteInfo: /** @type {any} */(remoteInfo)
  })
  const noVote = normalizeAzurePull({
    pullRequest: makePull({ reviewers: [{ vote: 0, isContainer: false }] }),
    remoteInfo: /** @type {any} */(remoteInfo)
  })

  assert.equal(rejected.approved, false)
  assert.equal(rejected.notRejected, false)
  assert.equal(waiting.approved, false)
  assert.equal(waiting.notRejected, false)
  assert.equal(noVote.approved, false)
  assert.equal(noVote.notRejected, true)
})

test('should fall back to the display name when the unique name is missing', () => {
  const pull = normalizeAzurePull({
    pullRequest: makePull({ createdBy: { displayName: 'Leo Falco' } }),
    remoteInfo: /** @type {any} */(remoteInfo)
  })

  assert.equal(pull.author.login, 'Leo Falco')
})
