import type { ChangedFile, CiStatus, FileRiskReport, PullRequestSummary, SecretScanReport } from "../src/types.ts";

export function changedFile(overrides: Partial<ChangedFile> & { path: string }): ChangedFile {
  const added = overrides.added_lines ?? [];
  const deleted = overrides.deleted_lines ?? [];
  return {
    status: "modified",
    additions: added.length,
    deletions: deleted.length,
    changes: added.length + deleted.length,
    added_lines: added,
    deleted_lines: deleted,
    patch: overrides.patch ?? added.map((line) => `+${line}`).join("\n"),
    truncated: false,
    secrets_redacted: false,
    ...overrides,
  };
}

export function pullRequest(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    url: "https://api.github.com/repos/acme/app/pulls/12",
    html_url: "https://github.com/acme/app/pull/12",
    number: 12,
    owner: "acme",
    repo: "app",
    title: "Improve checkout",
    description: "Adds a safer payment path",
    author: "octocat",
    head_branch: "feature/pay",
    base_branch: "main",
    head_sha: "abc123",
    status: {
      state: "open",
      draft: false,
      merged: false,
      mergeable: true,
      mergeable_state: "clean",
      ...overrides.status,
    },
    size: {
      additions: 20,
      deletions: 4,
      changed_files: 2,
      ...overrides.size,
    },
    ...overrides,
  };
}

export function ci(overall: CiStatus["overall"], names: string[] = ["tests"]): CiStatus {
  const statusByOverall = {
    passed: { status: "completed", conclusion: "success" },
    failed: { status: "completed", conclusion: "failure" },
    pending: { status: "in_progress", conclusion: null },
    none: { status: "unknown", conclusion: null },
  }[overall];

  return {
    head_sha: "abc123",
    overall,
    checks:
      overall === "none"
        ? []
        : names.map((name) => ({
            name,
            source: "check_run",
            ...statusByOverall,
          })),
  };
}

export const emptyRisks: FileRiskReport = {
  files: [],
  high_risk_files: [],
  categories_present: [],
  destructive_schema_change: false,
};

export const emptySecrets: SecretScanReport = {
  secrets_found: 0,
  findings: [],
};
