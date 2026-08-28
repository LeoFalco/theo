# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`theo` is an ESM Node.js CLI toolkit (`theo` binary) for developer workflows. It automates Git operations, GitHub PR management, and integration with the Flux project management tool.

## Commands

```bash
npm test                    # Run all tests (node --test)
node --test test/path/file.test.js  # Run a single test file
npm run lint                # Lint with ESLint
npm run lint:fix            # Auto-fix lint issues
```

The CLI itself is run via `theo <command>` after installation, or directly with `node src/index.js <command>` during development.

## Architecture

### Command Auto-Discovery

Commands live in `src/commands/<name>/index.js`. Each must export a default object with an `install({ program })` method. The loader (`src/commands/index.js`) dynamically imports every subdirectory and calls `install()` on each, registering them with the Commander.js program.

### Core Utilities

- **`src/core/exec.js`** — The `$()` helper wraps `execa` for running shell commands. It accepts either a command string or an already split `[file, ...args]` array. The string form goes through `parseCommandString`, which splits on spaces and consumes backslashes, so any argument that may hold a filesystem path must be passed with the array form. Key options: `json: true` parses stdout as JSON, `returnProperty: 'all'` returns `{ exitCode, success, stdout, stderr }`, `reject: false` prevents throwing on non-zero exit, `loading: false` suppresses the spinner.
- **`src/core/githubFacade.js`** — Octokit-based GitHub GraphQL + REST client. Handles PR queries (with checks, reviews, labels), branch comparison, and PR updates (rebase/update branch).
- **`src/core/constants.js`** — Team member lists organized by team (CMMS, FSM, QUALITY). Adding/removing members here affects all commands that filter by team.
- **`src/core/env.js`** — Loads the repo-root `.env` (via dotenv) and exports config read from it. `GITHUB_ORG` is the GitHub organization queried by `repos`, `opened` and `merged`; it has no default, so use `requireGithubOrg()` at call sites to fail with an actionable message when it is unset. See `.env.example`.
- **`src/core/patch-console-log.js`** — Provides `error`, `info`, `warn` helpers with colored prefixes.

### Services

- **`src/services/flux/flux-client.js`** — GraphQL client for the Flux project management API. Exports `fluxClient` singleton and `STAGES` / `PIPES` constants with hardcoded UUIDs for kanban stages.

### Key Commands

- **`merge`** — Core command. Without `--flux`: merges the current branch's PR using `gh pr merge` with fallback strategies (normal → auto → admin). With `--flux`: fetches cards from the Flux "PUBLISH" stage, shows their PRs with readiness checks, merges them, and moves cards to "MERGED" stage.
- **`rebase`** — Rebases current branch on the default branch; optionally force-pushes (`-p`).
- **`pr view [id]`** — Shows a pull request, by number or, without the argument, the one of the current branch. Detects the forge from the `origin` url (`src/commands/pr/remote.js`): GitHub is delegated to `gh pr view`, Azure DevOps is queried through `az repos pr list` (by branch) or `az repos pr show` (by id) and rendered locally. Azure ids are unique per organization, not per repository, so the by-id path takes the repository from the payload to build the url.
- **`pr approve [id]`** — Approves a pull request, by number or, without the argument, the one of the current branch. GitHub is delegated to `gh pr review --approve`, Azure DevOps to `az repos pr set-vote --vote approve`. On Azure a branch with more than one active pull request is an error asking for the number.
- **`pr list`** — Azure DevOps only. Lists the pull requests of the current repository as a table (labels, merge conflict, CI and review votes). The CI column needs one `az repos pr policy list` call per pull request, run with limited concurrency (`src/utils/concurrency.js`).

### Azure CLI quirks

`src/commands/pr/azure.js` wraps every `az` call and works around two behaviours found on Windows:

- `az` writes **windows-1252**, not UTF-8, so its stdout is read as raw bytes and decoded by `decodeAzureOutput` (strict UTF-8 first, windows-1252 as fallback). Reading it as UTF-8 corrupts every accented character.
- `az repos pr list` **drops every non-ASCII character** unless the command also passes `--query`. Always project the fields you need with `--query`; it is not only about payload size.

## Code Style

ESLint with `neostandard` — no semicolons, 2-space indentation, single quotes. Run `npm run lint:fix` before committing.

## Cross-Platform

The CLI runs on Linux, macOS and Windows, and CI exercises all three. Keep it that way:

- Build filesystem paths with `node:path` and `os.homedir()`, never with `process.env.HOME` or hardcoded separators.
- Pass paths to `$()` through the array form so backslashes survive.
- Import modules resolved at runtime with `pathToFileURL`; the ESM loader rejects bare Windows paths.
- `scripts/install.sh` installs on Linux and macOS, `scripts/install.ps1` on Windows. Changes to one usually belong in the other.
- `.gitattributes` pins the working tree to LF so shell scripts stay executable when checked out on Windows.
- `.claude/skills/*` are git symlinks (mode `120000`) into `.agents/skills/`, the canonical location. Git for Windows clones with `core.symlinks=false` by default, which checks them out as plain text files holding the target path — the skills then never load. Fix the clone, not the links: `git config core.symlinks true`, delete the stale files and `git checkout -- .claude/skills`. Creating the symlinks needs Windows Developer Mode (or an elevated shell).

## External Dependencies

The tool requires `gh` (GitHub CLI) authenticated via `gh auth login` and Git to be available in PATH. The Flux integration uses a hardcoded JWT token in `flux-client.js`. Commands that touch Azure DevOps repositories additionally require the Azure CLI (`az`) with the `azure-devops` extension, authenticated via `az login`.
