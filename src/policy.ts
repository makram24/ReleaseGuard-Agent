import type {
  CiStatus,
  FileRiskReport,
  Finding,
  PolicyResult,
  PolicyRule,
  PullRequestSummary,
  SecretScanReport,
} from "./types.ts";

const LARGE_PR_LINES = 800;

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function evaluateReleasePolicy(input: {
  pr: PullRequestSummary;
  ci: CiStatus;
  fileRisks: FileRiskReport;
  secrets: SecretScanReport;
  findings: Finding[];
}): PolicyResult {
  const rules: PolicyRule[] = [];
  const size = input.pr.size.additions + input.pr.size.deletions;

  if (input.secrets.secrets_found > 0) {
    rules.push({
      id: "secrets_detected",
      outcome: "BLOCKED",
      reason: `Secret scanner found ${input.secrets.secrets_found} exposed credential(s). Values were redacted.`,
      actions: ["Remove the secrets from the branch, rotate the exposed credentials, and push a replacement commit."],
    });
  }

  if (input.ci.overall === "failed") {
    const failed = input.ci.checks
      .filter((check) => /fail|error|cancel|timed_out|action_required|stale/i.test(check.conclusion ?? check.status))
      .map((check) => check.name);
    rules.push({
      id: "ci_failed",
      outcome: "BLOCKED",
      reason: `Automated GitHub checks failed${failed.length ? `: ${failed.join(", ")}` : ""}.`,
      actions: ["Fix the failing tests, builds, or linters and wait for checks to pass."],
    });
  }

  const critical = input.findings.filter((finding) => finding.severity === "critical");
  if (critical.length > 0) {
    rules.push({
      id: "critical_finding",
      outcome: "BLOCKED",
      reason: `Evidence-backed critical risk(s): ${critical.map((finding) => finding.title).join("; ")}.`,
      actions: critical.map((finding) => finding.recommendation || `Resolve critical finding: ${finding.title}`),
    });
  }

  if (input.fileRisks.destructive_schema_change) {
    rules.push({
      id: "destructive_schema",
      outcome: "BLOCKED",
      reason: "Changed files include destructive database schema operations (DROP/TRUNCATE).",
      actions: [
        "Confirm the migration is intentional, add a rollback plan, and document data-loss impact before merge.",
      ],
    });
  }

  if (input.pr.status.draft) {
    rules.push({
      id: "draft_pr",
      outcome: "MANUAL_REVIEW",
      reason: "Pull request is still a draft.",
      actions: ["Mark the pull request ready for review after remaining work is complete."],
    });
  }

  if (input.pr.status.mergeable === false || input.pr.status.mergeable_state === "dirty") {
    rules.push({
      id: "merge_conflict",
      outcome: "MANUAL_REVIEW",
      reason: "Pull request is not mergeable in its current state.",
      actions: ["Resolve merge conflicts with the base branch."],
    });
  }

  if (input.ci.overall === "pending") {
    rules.push({
      id: "ci_pending",
      outcome: "MANUAL_REVIEW",
      reason: "Automated checks are still running.",
      actions: ["Wait for GitHub checks to finish before releasing."],
    });
  }

  if (input.ci.overall === "none") {
    rules.push({
      id: "ci_missing",
      outcome: "MANUAL_REVIEW",
      reason: "No GitHub checks, builds, or test statuses were found for this head commit.",
      actions: ["Confirm whether CI is required for this repository and run tests before merge."],
    });
  }

  const sensitive = input.fileRisks.categories_present.filter((category) =>
    ["authentication", "payments", "database_migrations", "configuration", "deployment"].includes(category),
  );
  if (sensitive.length > 0) {
    rules.push({
      id: "sensitive_files",
      outcome: "MANUAL_REVIEW",
      reason: `Sensitive file categories changed: ${sensitive.join(", ")}.`,
      actions: ["Have a reviewer with domain ownership inspect the sensitive files before merge."],
    });
  }

  const high = input.findings.filter((finding) => finding.severity === "high" || finding.severity === "medium");
  if (high.length > 0) {
    rules.push({
      id: "reviewer_risks",
      outcome: "MANUAL_REVIEW",
      reason: `Validated reviewer findings require attention: ${high.map((finding) => finding.title).join("; ")}.`,
      actions: unique(high.map((finding) => finding.recommendation || finding.title)),
    });
  }

  const missingTests = input.findings.filter((finding) =>
    /missing test|no test|untested/i.test(`${finding.title} ${finding.summary} ${finding.category}`),
  );
  if (missingTests.length > 0) {
    rules.push({
      id: "missing_tests",
      outcome: "MANUAL_REVIEW",
      reason: "Testing reviewer identified important missing test coverage.",
      actions: unique(missingTests.map((finding) => finding.recommendation || "Add tests for the changed behavior.")),
    });
  }

  const breaking = input.findings.filter((finding) =>
    /breaking|incompatible|removed field|schema/i.test(`${finding.title} ${finding.summary} ${finding.category}`),
  );
  if (breaking.length > 0) {
    rules.push({
      id: "breaking_change",
      outcome: "MANUAL_REVIEW",
      reason: "Potentially incompatible API, field, schema, or configuration changes were identified.",
      actions: unique(breaking.map((finding) => finding.recommendation || "Document and version the breaking change.")),
    });
  }

  if (size > LARGE_PR_LINES) {
    rules.push({
      id: "large_diff",
      outcome: "MANUAL_REVIEW",
      reason: `Pull request is large (${size} lines changed across ${input.pr.size.changed_files} files).`,
      actions: ["Split the change or require an additional reviewer for the large diff."],
    });
  }

  const blocked = rules.filter((rule) => rule.outcome === "BLOCKED");
  const review = rules.filter((rule) => rule.outcome === "MANUAL_REVIEW");
  const decision = blocked.length > 0 ? "BLOCKED" : review.length > 0 ? "MANUAL_REVIEW" : "READY";

  const requiredActions = unique(rules.flatMap((rule) => rule.actions));
  const summary =
    decision === "READY"
      ? "Deterministic policy found no blocking or review-required conditions."
      : `${decision} because: ${rules
          .filter((rule) => (decision === "BLOCKED" ? rule.outcome === "BLOCKED" : true))
          .map((rule) => rule.reason)
          .join(" ")}`;

  return {
    decision,
    rules_fired: rules,
    required_actions: requiredActions,
    summary,
  };
}
