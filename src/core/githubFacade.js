// @ts-check

import { red } from '../utils/utils.js'
import { getOctokit } from './octokit.js'
import chalk from 'chalk'

const { yellow } = chalk

const GET_PULL_REQUESTS = `#graphql
      query listPullRequests($organization: String!, $repository: String!, $number: Int!) {
        viewer {
          organization(login: $organization) {
            repository(name: $repository) {
              id
              name
              pullRequest(number: $number) {
                id
                url
                number
                mergedAt
                mergeable
                createdAt
                state
                title
                isDraft
                reviewDecision
                baseRefName
                headRefName
                repository {
                  name
                }
                author {
                  login
                  ... on User {
                    name
                  }
                }
                labels(first: 5, orderBy: { field: NAME, direction: ASC }) {
                  nodes {
                    name
                  }
                }
                reviews(first: 10, states: [APPROVED, CHANGES_REQUESTED]) {
                  nodes {
                    state
                    author {
                      login
                    }
                  }
                }
                headRef {
                  target {
                    oid
                  }
                }
              }
            }
          }
        }
      }
    `

class GithubFacade {
  async getCurrentUser () {
    return await getOctokit().rest.users.getAuthenticated()
  }

  async getPullRequestComments ({ organization, repo, number }) {
    return await getOctokit().graphql(`
      query getPullRequestComments($organization: String!, $repo: String!, $number: Int!) {
        viewer {
          organization(login: $organization) {
            repository(name: $repo) {
              pullRequest(number: $number) {
                comments(first: 100) {
                  nodes {
                    id
                    author {
                      login
                    }
                    body
                  }
                }
              }
            }
          }
        }
      }
    `, { organization, repo, number })
      .then(response => response.viewer.organization.repository.pullRequest.comments.nodes)
  }

  /**
   * @param {object} params
   * @param {string} params.owner
   * @param {string} params.repo
   */
  async listWorkflowJobs ({ owner, repo }) {
    return await getOctokit().rest.actions
      .listWorkflowRunsForRepo({
        owner,
        repo,
        branch: 'master',
        per_page: 2,
        page: 1
      })
      .then((response) => response.data.workflow_runs)
      .then((runs) => {
        return runs.filter((run) => !run.head_commit?.committer?.email?.startsWith('fieldney@'))
      })
      .then((runs) => runs[0])
  }

  /**
   *
   * @param {object} params
   * @param {string} params.organization
   * @param {string[]} params.assignees
   * @param {string} params.state - 'OPEN' or 'CLOSED'
   * @param {string} params.from - 'YYYY-MM-DD'
   * @param {string} params.to - 'YYYY-MM-DD'
   * @returns
   */
  async listPullRequestsV2 (params) {
    const LIST_PRS_V2 = `#graphql
      query listPullRequestsByState($searchQuery: String!) {
        search(
          type: ISSUE
          query: $searchQuery
          first: 100
        ) {
          issueCount
          nodes {
            ... on PullRequest {
              id
              url
              mergedAt
              state
              title
              author {
                login
              }
              repository {
                name
                owner {
                  login
                }
              }
            }
          }
        }
      }
    `

    const state = params.state.toLowerCase()

    const results = await Promise.all(
      params.assignees.map(async (assignee) => {
        try {
          const searchQuery = state === 'merged'
            ? `is:pr org:${params.organization} is:${state} merged:${params.from}..${params.to} sort:merged-desc author:${assignee}`
            : `is:pr org:${params.organization} is:${state} created:${params.from}..${params.to} sort:created-desc author:${assignee}`
          console.log(`Query [${assignee}]:`, searchQuery)
          const data = await getOctokit().graphql(LIST_PRS_V2, {
            searchQuery
          })

          console.log(`${assignee}: ${data.search.issueCount} pull requests encontrados`)

          return data.search.nodes.map((pr) => ({
            number: pr.url.split('/').pop(),
            repo: pr.repository.name,
            url: pr.url,
            mergedAt: pr.mergedAt,
            author: pr.author?.login
          }))
        } catch (error) {
          console.warn(red(`Erro ao buscar pull requests de ${assignee}: ${error.message}`))
          return []
        }
      })
    )

    const pulls = results.flat()

    pulls.sort((a, b) => String(a.mergedAt).localeCompare(String(b.mergedAt)))

    let filteredPulls = pulls
    if (params.state === 'MERGED') {
      filteredPulls = pulls.filter(pr => pr.mergedAt)
    }

    console.log(`Total: ${filteredPulls.length} pull requests encontrados para o time.`)

    let pending = filteredPulls.length

    return Promise.all(
      filteredPulls.map(async (pull) => {
        return getOctokit().graphql(GET_PULL_REQUESTS, {
          organization: params.organization,
          repository: pull.repo,
          number: parseInt(pull.number)
        }).then((response) => {
          console.log(`consultado pull ${pull.url} (${--pending} restantes)`)
          return response.viewer.organization.repository.pullRequest
        })
      })
    ).then((pulls) => {
      console.log('Todos os pulls foram consultados, buscando checks...')
      let pending = pulls.length
      return Promise.all(
        pulls.map(async (pull) => {
          Object.assign(pull, {
            checks: pull.headRef ? await getChecks(params.organization, pull.repository.name, pull.headRef.target.oid) : []
          })
          console.log(`check consultado ${pull.url} (${--pending} restantes)`)
          return pull
        })
      )
    })
  }

  async getPullRequest (params) {
    return getOctokit().graphql(GET_PULL_REQUESTS, {
      organization: params.organization,
      repository: params.repo,
      number: params.number
    }).then((response) => {
      return response.viewer.organization.repository.pullRequest
    }).then(async (pull) => {
      pull.checks = pull.headRef ? await getChecks(params.organization, pull.repository.name, pull.headRef.target.oid) : []
      return pull
    })
  }

  async isAheadOfBase ({ owner, repo, baseRef, headRef }) {
    const compare = await getOctokit().rest.repos.compareCommits({
      owner,
      repo,
      base: baseRef,
      head: headRef
    }).catch(() => {
      console.log(yellow('[ignored] Could not can check if PR is ahead of base'))
      return null
    })

    if (compare == null) return true

    return compare.data.ahead_by >= 0
  }

  async rebasePullRequest ({ owner, repo, number }) {
    await getOctokit().rest.pulls.updateBranch({
      owner,
      repo,
      pull_number: number
    })
  }
}

export const getChecks = async (owner, repo, ref) => {
  return await getOctokit().rest.checks
    .listForRef({
      owner,
      repo,
      ref,
      per_page: 10,
      page: 1,
      filter: 'latest'
    })
    .then((response) => response.data.check_runs)
    .then((checks) => {
      checks.forEach((check) => {
        Reflect.deleteProperty(check, 'app')
        Reflect.deleteProperty(check, 'pull_requests')
        Reflect.deleteProperty(check, 'check_suite')
        Reflect.deleteProperty(check, 'output')
      })

      return checks
    })
}

const githubFacade = new GithubFacade()

export { githubFacade }
