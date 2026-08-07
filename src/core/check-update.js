import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $ } from './exec.js'
import { warn } from './patch-console-log.js'

const CURRENT_DIR_NAME = dirname(fileURLToPath(import.meta.url))
const LAST_UPDATE_FILE_PATH = join(CURRENT_DIR_NAME, '../../data/last-update.txt')
const LAST_UPDATE_FOLDER_PATH = dirname(LAST_UPDATE_FILE_PATH)
const TODAY = new Date().toISOString().split('T')[0]

export async function checkUpdate () {
  if (await isUpdateCheckedToday()) return
  await markUpdateAsCheckedToday()

  const currentSha = await getCurrentSha()
  const latestSha = await getLatestSha()

  if (currentSha === latestSha) return

  warn('There is a new version available.')
  warn('Please run \'theo-update\' to update.')
}

async function isUpdateCheckedToday () {
  return readFile(LAST_UPDATE_FILE_PATH, { encoding: 'utf8' })
    .then((content) => content.trim())
    .catch(() => null)
    .then((lastUpdateCheck) => lastUpdateCheck === TODAY)
}

async function markUpdateAsCheckedToday () {
  await mkdir(LAST_UPDATE_FOLDER_PATH, { recursive: true })
  await writeFile(LAST_UPDATE_FILE_PATH, TODAY)
}

export async function getCurrentSha () {
  return $('git rev-parse HEAD')
}

export async function getLatestSha () {
  await $('git fetch')
  const lsRemoveStdout = await $('git ls-remote')
  return lsRemoveStdout.split('\n')
    .find(line => line.includes('refs/heads/master') || line.includes('refs/heads/main'))
    .split('\t')
    .shift()
}
