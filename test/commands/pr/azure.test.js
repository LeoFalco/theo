// @ts-check

import assert from 'node:assert'
import test from 'node:test'
import { decodeAzureOutput, parsePullRequestId } from '../../../src/commands/pr/azure.js'

test('should decode utf-8 output', () => {
  const output = Buffer.from('{"title":"executa as ações da tabulação"}', 'utf8')

  assert.equal(decodeAzureOutput(output), '{"title":"executa as ações da tabulação"}')
})

// the azure cli writes windows-1252 when its stdout is a pipe on windows
test('should decode windows-1252 output', () => {
  const output = Buffer.from('{"title":"executa as ações da tabulação"}', 'latin1')

  assert.equal(decodeAzureOutput(output), '{"title":"executa as ações da tabulação"}')
})

test('should decode the windows-1252 characters that latin1 does not share', () => {
  const output = Buffer.from([0x22, 0x93, 0x94, 0x97, 0x22])

  assert.equal(decodeAzureOutput(output), '"“”—"')
})

test('should accept output that is already a string', () => {
  assert.equal(decodeAzureOutput('ações'), 'ações')
})

test('should decode empty output', () => {
  assert.equal(decodeAzureOutput(Buffer.alloc(0)), '')
  assert.equal(decodeAzureOutput(undefined), '')
})

test('should parse a pull request id', () => {
  assert.equal(parsePullRequestId('6411'), 6411)
  assert.equal(parsePullRequestId(6411), 6411)
})

test('should parse a pull request id with surrounding spaces or a leading #', () => {
  assert.equal(parsePullRequestId(' 6411 '), 6411)
  assert.equal(parsePullRequestId('#6411'), 6411)
})

test('should reject anything that is not a positive integer', () => {
  assert.equal(parsePullRequestId('abc'), null)
  assert.equal(parsePullRequestId('64.11'), null)
  assert.equal(parsePullRequestId('-1'), null)
  assert.equal(parsePullRequestId('0'), null)
  assert.equal(parsePullRequestId(''), null)
  assert.equal(parsePullRequestId(undefined), null)
})
