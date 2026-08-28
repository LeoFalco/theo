// @ts-check

import assert from 'node:assert'
import test from 'node:test'
import { decodeAzureOutput } from '../../../src/commands/pr/azure.js'

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
