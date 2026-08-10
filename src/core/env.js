// @ts-check

import dotEnv from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

dotEnv.config({
  path: join(dirname(fileURLToPath(import.meta.url)), '../../.env'),
  debug: false,
  quiet: true
})

// Organização do GitHub usada nas consultas de PRs, checks e repositórios.
// Configurável via .env para permitir o uso do theo fora da FieldControl.
export const GITHUB_ORG = process.env.GITHUB_ORG || 'FieldControl'
