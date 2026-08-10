import { execSync } from 'node:child_process'
import { Octokit } from 'octokit'
import './env.js'

function getToken () {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN
  return execSync('gh auth token').toString().trim()
}

let _octokit
export function getOctokit () {
  if (!_octokit) _octokit = new Octokit({ auth: getToken() })
  return _octokit
}
