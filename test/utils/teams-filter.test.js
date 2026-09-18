// @ts-check

import assert from 'node:assert'
import test from 'node:test'
import { isMemberOfTeam, toLowercaseSet } from '../../src/utils/utils.js'

test('toLowercaseSet normalizes member identifiers to lowercase', () => {
  const set = toLowercaseSet(['Leo', 'LEO@contoso.com', '  padded  '])

  assert.deepEqual([...set], ['leo', 'leo@contoso.com', '  padded  '])
  assert.equal(set.size, 3)
})

test('toLowercaseSet returns an empty set for no members', () => {
  assert.equal(toLowercaseSet().size, 0)
})

test('isMemberOfTeam matches on login or display name case-insensitively', () => {
  const members = toLowercaseSet(['leo@contoso.com', 'maria'])

  assert.equal(isMemberOfTeam('LEO@contoso.com', 'Leo Falco', members), true)
  assert.equal(isMemberOfTeam('maria@contoso.com', 'Maria', members), true)
  assert.equal(isMemberOfTeam(undefined, 'leo@contoso.com', members), true)
  assert.equal(isMemberOfTeam('joao@contoso.com', 'Joao', members), false)
})

test('isMemberOfTeam rejects everything on an empty member set', () => {
  const members = toLowercaseSet([])

  assert.equal(isMemberOfTeam('leo@contoso.com', 'Leo', members), false)
})
