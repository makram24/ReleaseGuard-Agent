# Contributing

Thanks for helping improve ReleaseGuard.

## Development setup

```powershell
npm install
copy .env.example .env
npm test
npm run typecheck
npm run smoke
```

Use a fine-grained GitHub token against a disposable/test repository when possible.

## Workflow

1. Create a branch from `main` (or the current feature branch during early development).
2. Keep changes focused: collectors, policy, reviewers, docs, or CI.
3. Add or update unit tests for behavior changes.
4. Run `npm test` and `npm run typecheck` before opening a PR.
5. Prefer evidence-grounded behavior: no invented files, no raw secrets, no model-owned READY/BLOCKED decisions.

## Code guidelines

- Deterministic logic belongs in TypeScript modules (`policy`, `evidence`, `classify`, `secrets`, `report`).
- LLM reviewers should only interpret collected JSON and cite real evidence sources.
- Keep user-facing reports short and actionable.
- Do not commit `.env`, credentials, private decks, or personal access tokens.

## Pull requests

Include:

- what changed and why
- how you tested it (`npm test`, smoke, live ADK run)
- any security/permission notes (token scopes, private repos)
