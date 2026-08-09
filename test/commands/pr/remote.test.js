// @ts-check

import assert from 'node:assert'
import test from 'node:test'
import { buildAzurePullRequestUrl, parseRemoteUrl } from '../../../src/commands/pr/remote.js'

test('should identify an azure devops ssh remote', () => {
  const result = parseRemoteUrl('git@ssh.dev.azure.com:v3/talkcomunication/Projetos/EpbxManagerNet9')

  assert.equal(result?.provider, 'azure')
  assert.equal(result?.owner, 'talkcomunication')
  assert.equal(result?.project, 'Projetos')
  assert.equal(result?.repository, 'EpbxManagerNet9')
  assert.equal(result?.organizationUrl, 'https://dev.azure.com/talkcomunication')
})

test('should identify an azure devops https remote', () => {
  const result = parseRemoteUrl('https://talkcomunication@dev.azure.com/talkcomunication/Projetos/_git/EpbxManagerNet9')

  assert.equal(result?.provider, 'azure')
  assert.equal(result?.owner, 'talkcomunication')
  assert.equal(result?.project, 'Projetos')
  assert.equal(result?.repository, 'EpbxManagerNet9')
})

test('should identify a legacy visualstudio.com remote and decode the project name', () => {
  const result = parseRemoteUrl('https://contoso.visualstudio.com/DefaultCollection/My%20Project/_git/MyRepo')

  assert.equal(result?.provider, 'azure')
  assert.equal(result?.owner, 'contoso')
  assert.equal(result?.project, 'My Project')
  assert.equal(result?.repository, 'MyRepo')
})

test('should identify github remotes', () => {
  const ssh = parseRemoteUrl('git@github.com:LeoFalco/theo.git')

  assert.equal(ssh?.provider, 'github')
  assert.equal(ssh?.owner, 'LeoFalco')
  assert.equal(ssh?.repository, 'theo')

  const https = parseRemoteUrl('https://github.com/LeoFalco/theo.git')

  assert.equal(https?.provider, 'github')
  assert.equal(https?.owner, 'LeoFalco')
  assert.equal(https?.repository, 'theo')
})

test('should return null for unknown remotes', () => {
  assert.equal(parseRemoteUrl('git@gitlab.com:group/project.git'), null)
  assert.equal(parseRemoteUrl(''), null)
})

test('should build the azure pull request browser url', () => {
  const remoteInfo = parseRemoteUrl('git@ssh.dev.azure.com:v3/talkcomunication/Projetos/EpbxManagerNet9')

  assert.equal(
    buildAzurePullRequestUrl(/** @type {any} */(remoteInfo), 6039),
    'https://dev.azure.com/talkcomunication/Projetos/_git/EpbxManagerNet9/pullrequest/6039'
  )
})
