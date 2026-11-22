import { join } from 'node:path'
export async function readPackageJSON () {
  return Bun.file(join(import.meta.dir, '../../package.json')).json()
}
