import { assertRuntimeEnv, loadEnv } from "../src/env.ts";
import { listRepositoryPullRequests, readCiStatus, readPullRequest } from "../src/github.ts";
import { ownRepository } from "../src/repo.ts";

loadEnv();

const env = assertRuntimeEnv();
const home = ownRepository();

console.log(
  JSON.stringify(
    {
      repository: `${home.owner}/${home.repo}`,
      gemini_configured: env.gemini,
      github_configured: env.github,
    },
    null,
    2,
  ),
);

if (!env.github) {
  console.error("GITHUB_TOKEN is missing. Copy .env.example to .env before running collectors.");
  process.exit(1);
}

if (!env.gemini) {
  console.warn("Warning: GEMINI_API_KEY is missing. Live agent/reviewers will fail until it is set.");
}

try {
  const pulls = await listRepositoryPullRequests("open");
  console.log(JSON.stringify({ open_pull_requests: pulls.length, sample: pulls.slice(0, 3) }, null, 2));

  if (pulls[0]) {
    const pr = await readPullRequest(String(pulls[0].number));
    const ci = await readCiStatus(String(pulls[0].number));
    console.log(
      JSON.stringify(
        {
          latest_pr: {
            number: pr.number,
            title: pr.title,
            html_url: pr.html_url,
          },
          ci: {
            overall: ci.overall,
            checks: ci.checks.map((check) => ({
              name: check.name,
              source: check.source,
              status: check.status,
              conclusion: check.conclusion,
            })),
          },
        },
        null,
        2,
      ),
    );
  }

  console.log("Smoke check passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
