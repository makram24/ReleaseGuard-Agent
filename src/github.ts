import type {
  ChangedFile,
  CiCheck,
  CiOverall,
  CiStatus,
  PullRequestRef,
  PullRequestSummary,
} from "./types.ts";
import { parsePatchLines } from "./patch.ts";
import { isLatestAlias, ownPullRequestUrl, ownRepository, type HomeRepository } from "./repo.ts";
import { redactSecretsInText } from "./secrets.ts";

const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";
const MAX_PATCH_CHARS = 8000;
const MAX_LINES_PER_SIDE = 200;

export function parsePullRequestUrl(input: string, home: HomeRepository = ownRepository()): PullRequestRef {
  const value = input.trim();
  const ownNumber = value.match(/^(?:#|pr[\s/-]*|pull[\s/-]*)?(\d+)$/i);
  if (ownNumber) {
    return { owner: home.owner, repo: home.repo, number: Number(ownNumber[1]) };
  }

  const patterns = [
    /github\.com[:/]([^/]+)\/([^/#?\s]+)\/pull\/(\d+)/i,
    /github\.com[:/]([^/]+)\/([^/#?\s]+)\/pulls\/(\d+)/i,
    /api\.github\.com\/repos\/([^/]+)\/([^/#?\s]+)\/pulls\/(\d+)/i,
    /^([^/\s]+)\/([^/#\s]+)(?:\/pull\/|#)(\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ""),
        number: Number(match[3]),
      };
    }
  }

  throw new Error(
    `Could not parse a GitHub pull request from "${input}". Use a PR number in ${home.owner}/${home.repo}, "latest", or https://github.com/owner/repo/pull/123.`,
  );
}

function githubHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "ReleaseGuard",
    ...extra,
  };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

async function githubFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: githubHeaders(init.headers as Record<string, string> | undefined),
  });

  if (response.ok) return response;

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "GitHub authentication failed. Set GITHUB_TOKEN in the environment with access to this repository.",
    );
  }
  if (response.status === 404) {
    throw new Error(
      "GitHub resource not found. Check the pull request URL and token permissions.",
    );
  }

  const body = await response.text();
  throw new Error(`GitHub request failed (${response.status}): ${body.slice(0, 300)}`);
}

async function githubJson<T>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const response = await githubFetch(url);
  return (await response.json()) as T;
}

async function githubPaginateArray<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = path.startsWith("http") ? path : `${GITHUB_API}${path}`;

  while (next) {
    const response = await githubFetch(next);
    const page = (await response.json()) as unknown;
    if (!Array.isArray(page)) {
      throw new Error("Expected a paginated GitHub list response.");
    }
    items.push(...(page as T[]));
    next = parseNextLink(response.headers.get("link"));
  }

  return items;
}

type GithubUser = { login?: string };
type GithubBranch = { ref?: string; sha?: string };
type GithubPull = {
  url?: string;
  html_url?: string;
  number?: number;
  title?: string;
  body?: string | null;
  user?: GithubUser;
  head?: GithubBranch;
  base?: GithubBranch;
  state?: string;
  draft?: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string;
  additions?: number;
  deletions?: number;
  changed_files?: number;
};

type GithubPullFile = {
  filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
  patch?: string;
};

type GithubCheckRun = {
  name?: string;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
};

type GithubStatus = {
  context?: string;
  state?: string;
  target_url?: string;
};

export async function readPullRequest(prUrl: string): Promise<PullRequestSummary> {
  const ref = parsePullRequestUrl(await resolvePullRequestUrl(prUrl));
  const pr = await githubJson<GithubPull>(`/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`);

  return {
    url: pr.url ?? `${GITHUB_API}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`,
    html_url: pr.html_url ?? `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
    number: pr.number ?? ref.number,
    owner: ref.owner,
    repo: ref.repo,
    title: pr.title ?? "(untitled pull request)",
    description: pr.body ?? null,
    author: pr.user?.login ?? "unknown",
    head_branch: pr.head?.ref ?? "unknown",
    base_branch: pr.base?.ref ?? "unknown",
    head_sha: pr.head?.sha ?? "",
    status: {
      state: pr.state ?? "unknown",
      draft: Boolean(pr.draft),
      merged: Boolean(pr.merged),
      mergeable: pr.mergeable ?? null,
      mergeable_state: pr.mergeable_state ?? "unknown",
    },
    size: {
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      changed_files: pr.changed_files ?? 0,
    },
  };
}

export function toChangedFile(file: GithubPullFile): ChangedFile {
  const parsed = parsePatchLines(file.patch ?? "", MAX_LINES_PER_SIDE);
  let patch = file.patch ?? null;
  let truncated = parsed.truncated;

  if (patch && patch.length > MAX_PATCH_CHARS) {
    patch = `${patch.slice(0, MAX_PATCH_CHARS)}\n…[truncated]`;
    truncated = true;
  }

  const redactedPatch = patch ? redactSecretsInText(patch) : { text: null, redacted: false };
  const redactedAdded = parsed.added.map((line) => redactSecretsInText(line));
  const redactedDeleted = parsed.deleted.map((line) => redactSecretsInText(line));

  return {
    path: file.filename ?? "unknown",
    status: file.status ?? "modified",
    additions: file.additions ?? parsed.added.length,
    deletions: file.deletions ?? parsed.deleted.length,
    changes: file.changes ?? (file.additions ?? 0) + (file.deletions ?? 0),
    added_lines: redactedAdded.map((line) => line.text),
    deleted_lines: redactedDeleted.map((line) => line.text),
    patch: redactedPatch.text,
    truncated,
    secrets_redacted:
      redactedPatch.redacted ||
      redactedAdded.some((line) => line.redacted) ||
      redactedDeleted.some((line) => line.redacted),
  };
}

export async function readChangedFiles(prUrl: string): Promise<ChangedFile[]> {
  const ref = parsePullRequestUrl(await resolvePullRequestUrl(prUrl));
  const files = await githubPaginateArray<GithubPullFile>(
    `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=100`,
  );
  return files.map(toChangedFile);
}

const FAILED_CONCLUSIONS = new Set([
  "failure",
  "failed",
  "cancelled",
  "canceled",
  "timed_out",
  "action_required",
  "stale",
  "error",
]);

const PENDING_STATUSES = new Set(["queued", "in_progress", "pending", "waiting", "requested"]);

export function overallFromChecks(checks: CiCheck[]): CiOverall {
  if (checks.length === 0) return "none";

  if (
    checks.some((check) => FAILED_CONCLUSIONS.has((check.conclusion ?? check.status).toLowerCase()))
  ) {
    return "failed";
  }

  if (
    checks.some(
      (check) =>
        PENDING_STATUSES.has(check.status.toLowerCase()) ||
        (check.conclusion ?? "").toLowerCase() === "pending",
    )
  ) {
    return "pending";
  }

  return "passed";
}

export async function readCiStatus(prUrl: string): Promise<CiStatus> {
  const pr = await readPullRequest(prUrl);
  if (!pr.head_sha) {
    return { head_sha: "", overall: "none", checks: [] };
  }

  const checkPayload = await githubJson<{ check_runs?: GithubCheckRun[] }>(
    `/repos/${pr.owner}/${pr.repo}/commits/${pr.head_sha}/check-runs?per_page=100`,
  );
  const statusPayload = await githubJson<{ statuses?: GithubStatus[] }>(
    `/repos/${pr.owner}/${pr.repo}/commits/${pr.head_sha}/status`,
  );

  const checks: CiCheck[] = [
    ...(checkPayload.check_runs ?? []).map((run) => ({
      name: run.name ?? "check",
      source: "check_run" as const,
      status: run.status ?? "unknown",
      conclusion: run.conclusion ?? null,
      details_url: run.html_url,
    })),
    ...(statusPayload.statuses ?? []).map((status) => ({
      name: status.context ?? "status",
      source: "status" as const,
      status: status.state ?? "unknown",
      conclusion: status.state ?? null,
      details_url: status.target_url,
    })),
  ];

  return {
    head_sha: pr.head_sha,
    overall: overallFromChecks(checks),
    checks,
  };
}

export async function publishPrComment(
  prUrl: string,
  markdown: string,
): Promise<{ html_url: string; id: number }> {
  const ref = parsePullRequestUrl(await resolvePullRequestUrl(prUrl));
  const response = await githubFetch(
    `${GITHUB_API}/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: markdown }),
    },
  );
  const created = (await response.json()) as { html_url: string; id: number };
  return { html_url: created.html_url, id: created.id };
}

export type ListedPullRequest = {
  number: number;
  title: string;
  html_url: string;
  author: string;
  head_branch: string;
  base_branch: string;
  state: string;
  draft: boolean;
};

export async function listRepositoryPullRequests(
  state: "open" | "closed" | "all" = "open",
): Promise<ListedPullRequest[]> {
  const { owner, repo } = ownRepository();
  const pulls = await githubPaginateArray<GithubPull & { html_url?: string; created_at?: string }>(
    `/repos/${owner}/${repo}/pulls?state=${state}&per_page=50`,
  );
  return pulls.map((pr) => ({
    number: pr.number ?? 0,
    title: pr.title ?? "(untitled pull request)",
    html_url: pr.html_url ?? ownPullRequestUrl(pr.number ?? 0),
    author: pr.user?.login ?? "unknown",
    head_branch: pr.head?.ref ?? "unknown",
    base_branch: pr.base?.ref ?? "unknown",
    state: pr.state ?? "unknown",
    draft: Boolean(pr.draft),
  }));
}

export async function resolvePullRequestUrl(input?: string): Promise<string> {
  const value = input?.trim() ?? "";
  if (!value || isLatestAlias(value)) {
    const open = await listRepositoryPullRequests("open");
    const home = ownRepository();
    if (!open[0]) {
      throw new Error(`No open pull requests found in ${home.owner}/${home.repo}.`);
    }
    return open[0].html_url;
  }
  const ref = parsePullRequestUrl(value);
  return ownPullRequestUrl(ref.number, { owner: ref.owner, repo: ref.repo });
}
