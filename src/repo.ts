export const DEFAULT_OWNER = "makram24";
export const DEFAULT_REPO = "ReleaseGuard-Agent";
export const DEFAULT_REPO_URL = `https://github.com/${DEFAULT_OWNER}/${DEFAULT_REPO}`;

export type HomeRepository = {
  owner: string;
  repo: string;
};

export function ownRepository(): HomeRepository {
  const configured = process.env.RELEASE_GUARD_REPO ?? process.env.GITHUB_REPOSITORY;
  if (configured?.includes("/")) {
    const [owner, repo] = configured.split("/");
    return { owner, repo: repo.replace(/\.git$/, "") };
  }
  return { owner: DEFAULT_OWNER, repo: DEFAULT_REPO };
}

export function ownPullRequestUrl(number: number, home = ownRepository()): string {
  return `https://github.com/${home.owner}/${home.repo}/pull/${number}`;
}

export function isLatestAlias(value: string): boolean {
  return /^(latest|this|open)$/i.test(value.trim());
}
