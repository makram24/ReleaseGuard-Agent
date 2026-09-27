# Security Policy

## Supported versions

Security fixes are applied on the default branch of this repository.

## Reporting a vulnerability

Do **not** open a public issue for security problems that could expose secrets, tokens, or private repository data.

Email or privately message the maintainer with:

- a short description of the issue
- reproduction steps
- impact (for example: secret leakage, unauthorized comment posting, private repo data exposure)

## Safe defaults

ReleaseGuard is designed with these constraints:

- Secrets found in diffs are redacted before specialist reviewers see them.
- Final release decisions come from deterministic policy code, not free-form model text.
- Publishing a GitHub PR comment requires explicit human confirmation.
- `.env` is gitignored. Never commit real API keys or tokens.

## Token hygiene

- Prefer fine-grained GitHub PATs limited to the repositories you review.
- Grant only: Contents Read, Pull requests Read/Write, Checks Read.
- Rotate `GEMINI_API_KEY` and `GITHUB_TOKEN` if they may have leaked.
- Keep production secrets in a secret manager, not in the repository.
