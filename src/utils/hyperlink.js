// @ts-check

/**
 * OSC 8 terminal hyperlinks — `ESC ] 8 ; ; url BEL text ESC ] 8 ; ; BEL`.
 *
 * The escape sequences are invisible, so a linked cell keeps the width of its text and
 * `strip-ansi` (used by chalk-table to pad the columns) removes them like any other ansi code.
 * Terminals that do not implement OSC 8 would print the url as garbage, hence the capability
 * check — `FORCE_HYPERLINK=1` overrides it when the detection is wrong.
 */

const OSC_8 = '\u001B]8;;'
const BEL = '\u0007'

// terminals that implement OSC 8, keyed by the value they export in TERM_PROGRAM
const HYPERLINK_TERM_PROGRAMS = [
  'ghostty',
  'hyper',
  'iterm.app',
  'mintty',
  'rio',
  'tabby',
  'vscode',
  'wezterm'
]

const FALSY_ENV_VALUES = ['0', 'false', 'no', 'off']

/**
 * Tells whether the terminal can render OSC 8 hyperlinks.
 *
 * @param {Object} [params]
 * @param {Record<string, string | undefined>} [params.env]
 * @param {boolean | undefined} [params.isTty]
 * @returns {boolean}
 */
export function supportsHyperlinks ({ env = process.env, isTty = process.stdout.isTTY } = {}) {
  const forced = env.FORCE_HYPERLINK

  if (forced) return !FALSY_ENV_VALUES.includes(forced.toLowerCase())

  if (!isTty) return false
  if (env.TERM === 'dumb') return false
  // a redirected build log keeps the escape sequences and most ci renderers show them verbatim
  if (env.CI) return false

  // windows terminal
  if (env.WT_SESSION) return true
  if (env.KONSOLE_VERSION) return true
  if (env.DOMTERM) return true

  // gnome-terminal and the other vte based emulators, hyperlinks landed in vte 0.50
  if (Number(env.VTE_VERSION) >= 5000) return true

  return HYPERLINK_TERM_PROGRAMS.includes(String(env.TERM_PROGRAM || '').toLowerCase())
}

/**
 * Wraps a text in an OSC 8 hyperlink. Returns the text untouched when the terminal cannot
 * render one, so the caller never has to branch.
 *
 * @param {string} text
 * @param {string} url
 * @param {Object} [options]
 * @param {boolean} [options.enabled] - defaults to the terminal capability
 * @returns {string}
 */
export function hyperlink (text, url, options) {
  const enabled = options?.enabled ?? supportsHyperlinks()

  if (!enabled || !url) return text

  return `${OSC_8}${url}${BEL}${text}${OSC_8}${BEL}`
}
