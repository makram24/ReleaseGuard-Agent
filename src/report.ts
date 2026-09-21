import type {
  CiStatus,
  Decision,
  EvidenceValidationReport,
  FileRiskReport,
  PolicyResult,
  PullRequestSummary,
  SecretScanReport,
} from "./types.ts";

export function generateReleaseReport(input: {
  pr: PullRequestSummary;
  ci: CiStatus;
  fileRisks: FileRiskReport;
  secrets: SecretScanReport;
  evidence: EvidenceValidationReport;
  policy: PolicyResult;
}): { decision: Decision; markdown: string } {
  const { pr, ci, fileRisks, secrets, evidence, policy } = input;
  const findings = evidence.accepted;

  const riskLines =
    findings.length === 0
      ? ["- No evidence-backed risks remained after validation."]
      : findings.map(
          (finding) =>
            `- **${finding.severity.toUpperCase()} — ${finding.title}** (${finding.category})\n  ${finding.summary}\n  Evidence: ${finding.evidence
              .map((ref) => `\`${ref.source}\``)
              .join(", ")}`,
        );

  const actionLines =
    policy.required_actions.length === 0
      ? ["- No required actions. The change may proceed."]
      : policy.required_actions.map((action) => `- ${action}`);

  const evidenceLines = [
    `- Pull request: [#${pr.number} ${pr.title}](${pr.html_url}) by ${pr.author}`,
    `- Branches: \`${pr.head_branch}\` → \`${pr.base_branch}\``,
    `- Size: +${pr.size.additions} / -${pr.size.deletions} across ${pr.size.changed_files} files`,
    `- Status: ${pr.status.state}${pr.status.draft ? " (draft)" : ""}${pr.status.merged ? " (merged)" : ""}`,
    `- CI: ${ci.overall}${ci.checks.length ? ` (${ci.checks.map((check) => `${check.name}: ${check.conclusion ?? check.status}`).join("; ")})` : ""}`,
    `- Sensitive categories: ${fileRisks.categories_present.length ? fileRisks.categories_present.join(", ") : "none"}`,
    `- Secrets: ${secrets.secrets_found} finding(s) (values redacted)`,
    `- Findings accepted/rejected: ${evidence.accepted.length}/${evidence.rejected.length}`,
  ];

  if (evidence.rejected.length > 0) {
    evidenceLines.push(
      `- Rejected ungrounded findings: ${evidence.rejected
        .map((finding) => `${finding.title} (${finding.rejection_reason})`)
        .join("; ")}`,
    );
  }

  const markdown = [
    `# ReleaseGuard Report`,
    ``,
    `**Decision: ${policy.decision}**`,
    ``,
    `This decision was produced by the deterministic Release Policy Evaluator, not by the language model.`,
    ``,
    `## Summary`,
    policy.summary,
    ``,
    `## Evidence`,
    ...evidenceLines,
    ``,
    `## Risks`,
    ...riskLines,
    ``,
    `## Required actions`,
    ...actionLines,
    ``,
    `## Policy rules fired`,
    ...(policy.rules_fired.length
      ? policy.rules_fired.map((rule) => `- \`${rule.id}\` → ${rule.outcome}: ${rule.reason}`)
      : ["- None. Default outcome is READY."]),
    ``,
  ].join("\n");

  return { decision: policy.decision, markdown };
}
