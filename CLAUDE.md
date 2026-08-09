# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`theo` is an ESM Node.js CLI toolkit (`theo` binary) for Field Control developer workflows. It automates Git operations, GitHub PR management, and integration with the Flux project management tool.

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

- **`src/core/exec.js`** — The `$()` helper wraps `execa` for running shell commands. Key options: `json: true` parses stdout as JSON, `returnProperty: 'all'` returns `{ exitCode, success, stdout, stderr }`, `reject: false` prevents throwing on non-zero exit, `loading: false` suppresses the spinner.
- **`src/core/githubFacade.js`** — Octokit-based GitHub GraphQL + REST client. Handles PR queries (with checks, reviews, labels), branch comparison, and PR updates (rebase/update branch).
- **`src/core/constants.js`** — Team member lists organized by team (CMMS, FSM, QUALITY). Adding/removing members here affects all commands that filter by team.
- **`src/core/patch-console-log.js`** — Provides `error`, `info`, `warn` helpers with colored prefixes.

### Services

- **`src/services/flux/flux-client.js`** — GraphQL client for the Flux project management API. Exports `fluxClient` singleton and `STAGES` / `PIPES` constants with hardcoded UUIDs for kanban stages.
- **`src/services/openai/open-ai-api.js`** — OpenAI integration for PR description generation.

### Key Commands

- **`merge`** — Core command. Without `--flux`: merges the current branch's PR using `gh pr merge` with fallback strategies (normal → auto → admin). With `--flux`: fetches cards from the Flux "PUBLISH" stage, shows their PRs with readiness checks, merges them, and moves cards to "MERGED" stage.
- **`rebase`** — Rebases current branch on the default branch; optionally force-pushes (`-p`).
- **`pr-create`** — Creates a PR from the current branch. Reads `.github/pull_request_template.md` and `.github/workflows/fieldnews.yml` from the target repo to infer PR title prefixes.
- **`pr view`** — Shows the pull request of the current branch. Detects the forge from the `origin` url (`src/commands/pr/remote.js`): GitHub is delegated to `gh pr view`, Azure DevOps is queried through `az repos pr list` and rendered locally.

## Code Style

ESLint with `neostandard` — no semicolons, 2-space indentation, single quotes. Run `npm run lint:fix` before committing.

## External Dependencies

The tool requires `gh` (GitHub CLI) authenticated via `gh auth login` and Git to be available in PATH. The Flux integration uses a hardcoded JWT token in `flux-client.js`. Commands that touch Azure DevOps repositories additionally require the Azure CLI (`az`) with the `azure-devops` extension, authenticated via `az login`.
