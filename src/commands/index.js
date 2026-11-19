import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { readdir } from 'node:fs/promises'
import { warn } from '../core/patch-console-log.js'

/**
 * Registers the commands on the program. Importing every command costs several hundred
 * milliseconds, so when the first argument names a command directory (`merge`, or the
 * `repo` of `repo-clean`) only those are loaded. Anything else — `--help`, an alias, a
 * typo — falls back to loading all of them.
 *
 * @param {Object} param
 * @param {import('commander').Command} param.program
 * @param {string} [param.requested] - first cli argument
 */
export async function installCommands ({ program, requested = process.argv[2] }) {
  const currentDirName = dirname(fileURLToPath(import.meta.url))

  const names = await readdir(currentDirName, { withFileTypes: true })
    .then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))

  const matching = requested
    ? names.filter((name) => name === requested || name.startsWith(`${requested}-`))
    : []

  await installModules({ program, currentDirName, names: matching })

  const found = program.commands.some((command) => command.name() === requested || command.aliases().includes(requested))
  if (found) return

  await installModules({ program, currentDirName, names: names.filter((name) => !matching.includes(name)) })
}

async function installModules ({ program, currentDirName, names }) {
  // Imports run in parallel; install stays sequential so the help keeps directory order.
  const loaded = await Promise.all(names.map(async (name) => {
    const path = join(currentDirName, name, 'index.js')
    try {
      return { name, path, module: await import(pathToFileURL(path).href).then((module) => module.default) }
    } catch (err) {
      return { name, path, err }
    }
  }))

  for (const { name, path, module, err } of loaded) {
    if (err) {
      if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err
      warn(`Module '${name}' at '${path}' was thrown error`)
      warn(err)
      continue
    }

    if (!module.install) {
      warn(`Module '${name}' at '${path}' does not export 'install' function`)
      continue
    }

    await module.install({ program })
  }
}
