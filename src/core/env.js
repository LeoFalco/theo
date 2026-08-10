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
// Obrigatoriamente configurada via .env, sem valor padrão. Veja .env.example.
export const GITHUB_ORG = process.env.GITHUB_ORG

/**
 * Retorna a organização configurada ou falha com uma mensagem acionável.
 * @returns {string}
 */
export function requireGithubOrg () {
  if (!GITHUB_ORG) {
    throw new Error('GITHUB_ORG não configurada. Defina GITHUB_ORG no arquivo .env na raiz do projeto (veja .env.example).')
  }

  return GITHUB_ORG
}
