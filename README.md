# ReleaseGuard Agent

Evidence-grounded GitHub pull-request **risk and release-readiness** agent, built on Google's Agent Development Kit (`@google/adk`).

ReleaseGuard collects PR metadata, diffs, and CI; classifies risky files; scans and redacts secrets; runs specialist reviewers; drops ungrounded findings; then applies a **deterministic policy** that decides:

- `READY`
- `MANUAL_REVIEW`
- `BLOCKED`

The language model never owns the final merge decision.

## Why this exists

Most “AI code review” demos let the model invent files and declare a vibe-based verdict. ReleaseGuard separates:

1. **Collection** — GitHub PR, files, CI
2. **Deterministic risk signals** — classify, secret scan, policy
3. **LLM specialists** — security, testing, breaking changes, deployment (evidence-cited only)
4. **Evidence validation** — drop findings that cite inventedsources
5. **Policy** — READY / MANUAL_REVIEW / BLOCKED from rules, not prose

## Requirements

- Node.js 20+
- **Your own** Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey)) — ReleaseGuard does **not** ship or share model access. Everyone brings their own key.
- GitHub token with access to the target repository

## Quick start

```powershell
npm install
copy .env.example .env
# edit .env with GEMINI_API_KEY and GITHUB_TOKEN
npm test
npm run smoke
npm run web
```

Open http://localhost:8000 and say:

- `review the latest PR`
- `review PR 1`
- or paste any `https://github.com/owner/repo/pull/123`

```powershell
npm start   # CLI instead of web UI
```

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Your personal Gemini key for the root agent + reviewers. Not provided by this repo. |
| `GITHUB_TOKEN` | Yes | Read PRs/diffs/CI; post comments when confirmed |
| `RELEASE_GUARD_REPO` | No | Default repo `owner/name` (also accepts `GITHUB_REPOSITORY`) |
| `RELEASE_GUARD_MODEL` | No | Model id (default `gemini-3.1-flash-lite`) |

### GitHub token permissions

Fine-grained PAT on the target repo:

- **Contents:** Read
- **Pull requests:** Read and write (comment publishing)
- **Checks:** Read (check-runs)

If Checks read is missing, ReleaseGuard falls back to commit statuses and GitHub Actions workflow runs so green CI is still visible when possible.

## Architecture

```text
PR URL / number
   → pull_request_reader
   → changed_files_reader
   → ci_status_reader
   → file_risk_classifier
   → secret_scanner
   → security / testing / breaking_change / deployment reviewers
   → evidence_validator
   → release_policy_evaluator   ← decision authority
   → report_generator
   → (optional) pr_comment_publisher  ← human confirmation required
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | ADK CLI chat |
| `npm run web` | ADK Dev UI on port 8000 |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript check |
| `npm run smoke` | Verify env + GitHub connectivity against the default repo |

## Safety guarantees

- Diff secrets are redacted before LLM reviewers see them
- Ungrounded findings are rejected by `evidence_validator`
- Decision text must quote `release_policy_evaluator`
- PR comments never post without confirmation
- `.env` is gitignored

## Public launch checklist

Before making the repository public:

1. Confirm `.env` is not tracked (`git status` / `git check-ignore -v .env`)
2. Rotate any tokens that were ever pasted into chat, screenshots, or logs
3. Make sure `README`, `LICENSE`, `SECURITY.md`, and `CONTRIBUTING.md` are on `main`
4. Ensure GitHub Actions CI is green on `main`
5. Prefer a fine-grained PAT with least privilege for demos
6. Decide whether demo defaults (`RELEASE_GUARD_REPO`) stay pointed at this repo

## Operations

**Inject secrets** from a secret manager or local `.env` (never commit them).

**Monitor** Gemini quota/429s, GitHub auth failures, and unusual BLOCKED rates.

**Rollback:** stop the process, revert/redeploy, rotate keys if needed, re-run `npm test` and `npm run smoke`.

## License

MIT — see [LICENSE](./LICENSE).
