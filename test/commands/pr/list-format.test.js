// @ts-check

import assert from 'node:assert'
import test from 'node:test'
import {
  formatAge,
  formatLabels,
  matchesAuthor,
  resolveCiStatus,
  resolveMergeState,
  summarizeVotes,
  truncate
} from '../../../src/commands/pr/list-format.js'

test('should summarize reviewer votes by category', () => {
  const summary = summarizeVotes([
    { vote: 10 },
    { vote: 5 },
    { vote: 0 },
    { vote: -5 },
    { vote: -10 }
  ])

  assert.deepEqual(summary, { approved: 2, pending: 1, waiting: 1, rejected: 1 })
})

test('should ignore group reviewers when summarizing votes', () => {
  const summary = summarizeVotes([
    { vote: 10 },
    { vote: 0, isContainer: true }
  ])

  assert.deepEqual(summary, { approved: 1, pending: 0, waiting: 0, rejected: 0 })
})

test('should summarize an empty reviewer list', () => {
  assert.deepEqual(summarizeVotes([]), { approved: 0, pending: 0, waiting: 0, rejected: 0 })
  assert.deepEqual(summarizeVotes(undefined), { approved: 0, pending: 0, waiting: 0, rejected: 0 })
})

test('should resolve the merge state from the azure merge status', () => {
  assert.equal(resolveMergeState('succeeded'), 'clean')
  assert.equal(resolveMergeState('conflicts'), 'conflict')
  assert.equal(resolveMergeState('failure'), 'conflict')
  assert.equal(resolveMergeState('rejectedByPolicy'), 'conflict')
  assert.equal(resolveMergeState('queued'), 'checking')
  assert.equal(resolveMergeState('notSet'), 'unknown')
  assert.equal(resolveMergeState(undefined), 'unknown')
})

test('should resolve the ci status from build policy evaluations', () => {
  const evaluations = [
    { configuration: { type: { displayName: 'Build' } }, status: 'approved' },
    { configuration: { type: { displayName: 'Minimum number of reviewers' } }, status: 'rejected' }
  ]

  assert.equal(resolveCiStatus(evaluations), 'approved')
})

test('should report the ci as failed when any build policy is rejected', () => {
  const evaluations = [
    { configuration: { type: { displayName: 'Build' } }, status: 'approved' },
    { configuration: { type: { displayName: 'Build' } }, status: 'rejected' }
  ]

  assert.equal(resolveCiStatus(evaluations), 'rejected')
})

test('should report the ci as running while a build policy is queued', () => {
  const evaluations = [
    { configuration: { type: { displayName: 'Build' } }, status: 'queued' },
    { configuration: { type: { displayName: 'Build' } }, status: 'approved' }
  ]

  assert.equal(resolveCiStatus(evaluations), 'running')
})

test('should report no ci when the pull request has no build policy', () => {
  assert.equal(resolveCiStatus([]), 'none')
  assert.equal(resolveCiStatus(undefined), 'none')
  assert.equal(resolveCiStatus([
    { configuration: { type: { displayName: 'Build' } }, status: 'notApplicable' }
  ]), 'none')
})

test('should match the author by a case insensitive term', () => {
  const pullRequest = {
    createdBy: { displayName: 'Leonardo Falco', uniqueName: 'leonardo.falco@talkcomm.com.br' }
  }

  assert.equal(matchesAuthor(pullRequest, 'falco'), true)
  assert.equal(matchesAuthor(pullRequest, 'LEO'), true)
  assert.equal(matchesAuthor(pullRequest, 'talkcomm'), true)
  assert.equal(matchesAuthor(pullRequest, 'maria'), false)
})

test('should match every pull request when no author term is given', () => {
  const pullRequest = { createdBy: { displayName: 'Leonardo Falco' } }

  assert.equal(matchesAuthor(pullRequest, undefined), true)
  assert.equal(matchesAuthor(pullRequest, '  '), true)
})

test('should format labels as a comma separated list', () => {
  assert.equal(formatLabels([{ name: 'bug' }, { name: 'urgente' }]), 'bug, urgente')
  assert.equal(formatLabels([]), '')
  assert.equal(formatLabels(undefined), '')
})

test('should ignore inactive labels', () => {
  assert.equal(formatLabels([{ name: 'bug', active: true }, { name: 'old', active: false }]), 'bug')
})

test('should format the age in whole days', () => {
  const now = new Date('2026-08-28T12:00:00Z')

  assert.equal(formatAge('2026-08-25T12:00:00Z', now), '3d')
  assert.equal(formatAge('2026-08-28T11:00:00Z', now), '0d')
  assert.equal(formatAge(undefined, now), '')
  assert.equal(formatAge('not a date', now), '')
})

test('should truncate long titles keeping the limit', () => {
  assert.equal(truncate('short title', 20), 'short title')
  assert.equal(truncate('a'.repeat(30), 10), 'aaaaaaa...')
  assert.equal(truncate(undefined, 10), '')
})
