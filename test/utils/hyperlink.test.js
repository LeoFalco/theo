// @ts-check

import assert from 'node:assert'
import test from 'node:test'
import chalkTable from 'chalk-table'
import { hyperlink, supportsHyperlinks } from '../../src/utils/hyperlink.js'

const PULL_REQUEST_URL = 'https://dev.azure.com/org/project/_git/repo/pullrequest/42'

test('should wrap the text in an osc 8 sequence', () => {
  const linked = hyperlink('#42', PULL_REQUEST_URL, { enabled: true })

  assert.equal(linked, `\u001B]8;;${PULL_REQUEST_URL}\u0007#42\u001B]8;;\u0007`)
})

test('should keep the table aligned, the escape sequences take no width', () => {
  const columns = { columns: [{ field: 'id', name: 'id' }, { field: 'title', name: 'title' }] }

  const linked = chalkTable(columns, [
    { id: hyperlink('#42', PULL_REQUEST_URL, { enabled: true }), title: 'linked' },
    { id: '#7', title: 'plain' }
  ])

  const plain = chalkTable(columns, [
    { id: '#42', title: 'linked' },
    { id: '#7', title: 'plain' }
  ])

  // chalk-table pads by the length stripped of ansi codes, a link it does not strip breaks the table
  assert.equal(stripLinks(linked), plain)
})

test('should return the text untouched when disabled', () => {
  assert.equal(hyperlink('#42', PULL_REQUEST_URL, { enabled: false }), '#42')
})

test('should return the text untouched when there is no url', () => {
  assert.equal(hyperlink('#42', '', { enabled: true }), '#42')
})

test('should not link outside a tty', () => {
  assert.equal(supportsHyperlinks({ env: { WT_SESSION: '1' }, isTty: false }), false)
})

test('should not link on dumb terminals nor on ci', () => {
  assert.equal(supportsHyperlinks({ env: { TERM: 'dumb', WT_SESSION: '1' }, isTty: true }), false)
  assert.equal(supportsHyperlinks({ env: { CI: 'true', WT_SESSION: '1' }, isTty: true }), false)
})

test('should link on the terminals that implement osc 8', () => {
  assert.equal(supportsHyperlinks({ env: { WT_SESSION: '1' }, isTty: true }), true)
  assert.equal(supportsHyperlinks({ env: { TERM_PROGRAM: 'vscode' }, isTty: true }), true)
  assert.equal(supportsHyperlinks({ env: { TERM_PROGRAM: 'iTerm.app' }, isTty: true }), true)
  assert.equal(supportsHyperlinks({ env: { VTE_VERSION: '6003' }, isTty: true }), true)
})

test('should not link on unknown terminals', () => {
  assert.equal(supportsHyperlinks({ env: { TERM_PROGRAM: 'Apple_Terminal' }, isTty: true }), false)
  assert.equal(supportsHyperlinks({ env: { VTE_VERSION: '4205' }, isTty: true }), false)
  assert.equal(supportsHyperlinks({ env: {}, isTty: true }), false)
})

test('should honour FORCE_HYPERLINK over the detection', () => {
  assert.equal(supportsHyperlinks({ env: { FORCE_HYPERLINK: '1' }, isTty: false }), true)
  assert.equal(supportsHyperlinks({ env: { FORCE_HYPERLINK: '0', WT_SESSION: '1' }, isTty: true }), false)
})

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

/**
 * Removes the osc 8 sequences of a text, keeping the visible characters.
 *
 * @param {string} text
 * @returns {string}
 */
function stripLinks (text) {
  return text
    .split(ESC)
    .map(part => part.includes(BEL) ? part.slice(part.indexOf(BEL) + 1) : part)
    .join('')
}
