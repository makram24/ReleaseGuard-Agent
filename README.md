# ReleaseGuard Agent

Evidence-grounded GitHub pull-request risk and release-readiness agent built on Google ADK.

ReleaseGuard collects PR metadata, diffs, and CI; classifies risky files; scans and redacts secrets; runs specialist reviewers; drops ungrounded findings; then applies a deterministic policy that decides `READY`, `MANUAL_REVIEW`, or `BLOCKED`.

## Requirements

- Node.js 20+
- A Gemini API key
- A GitHub personal access token with access to the target repository

## Setup

```powershell
npm install
copy .env.example .env
```

Fill `.env`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Powers the agent and specialist reviewers |
| `GITHUB_TOKEN` | Yes | Reads PRs/diffs/CI and can post comments |
| `RELEASE_GUARD_REPO` | No | Override default repo (`owner/name`). Defaults to `makram24/ReleaseGuard-Agent` |

### GitHub token permissions

For a fine-grained PAT on this repository, grant at least:

- **Contents:** Read
- **Pull requests:** Read and write (needed to post review comments)
- **Checks:** Read (needed to load GitHub Actions / check-runs)

Without Checks read access, ReleaseGuard falls back to the commit status API and may report `CI: none` even when Actions are configured.

## Run

```powershell
npm start          # CLI chat
npm run web        # Dev UI at http://localhost:8000
npm test           # Unit tests
npm run typecheck  # TypeScript check
```

In the agent, you can say:

- `review this repo`
- `review the latest PR`
- `review PR 1`

## How decisions work

The model never invents the final decision. `release_policy_evaluator` applies deterministic rules (secrets, failed CI, destructive schema, draft PRs, missing CI, sensitive files, large diffs, validated reviewer findings). The Markdown report quotes that decision only.

Posting to GitHub requires an explicit user request and human confirmation via `pr_comment_publisher`.

## Operations

### Injecting secrets

Set `GEMINI_API_KEY` and `GITHUB_TOKEN` in the process environment or a local `.env` file that is never committed. Production hosts should inject them from a secret manager or CI/CD secret store.

### Monitoring

Watch for:

- Gemini API 429 / quota errors (reviewers and the root agent will fail mid-pipeline)
- GitHub 401/403 (token missing scopes or repo access)
- Policy outcomes trending toward `BLOCKED` / `MANUAL_REVIEW` on routine PRs

### Rollback

1. Stop the agent process (`Ctrl+C` on `npm start` / `npm run web`).
2. Revert to the previous known-good commit or redeploy the prior release.
3. Rotate `GEMINI_API_KEY` / `GITHUB_TOKEN` if either may have leaked.
4. Re-run `npm test` before bringing the service back.

## Default repository

Unless `RELEASE_GUARD_REPO` is set, reviews target [makram24/ReleaseGuard-Agent](https://github.com/makram24/ReleaseGuard-Agent). Full GitHub PR URLs for other repositories are still accepted.
