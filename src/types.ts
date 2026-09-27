export type Decision = "READY" | "MANUAL_REVIEW" | "BLOCKED";

export type Severity = "critical" | "high" | "medium" | "low";

export type RiskCategory =
  | "authentication"
  | "payments"
  | "database_migrations"
  | "dependencies"
  | "configuration"
  | "apis"
  | "deployment";

export type EvidenceKind =
  | "file"
  | "pull_request"
  | "ci"
  | "secrets"
  | "file_risks";

export type PullRequestRef = {
  owner: string;
  repo: string;
  number: number;
};

export type PullRequestSummary = {
  url: string;
  html_url: string;
  number: number;
  owner: string;
  repo: string;
  title: string;
  description: string | null;
  author: string;
  head_branch: string;
  base_branch: string;
  head_sha: string;
  status: {
    state: string;
    draft: boolean;
    merged: boolean;
    mergeable: boolean | null;
    mergeable_state: string;
  };
  size: {
    additions: number;
    deletions: number;
    changed_files: number;
  };
};

export type ChangedFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  added_lines: string[];
  deleted_lines: string[];
  patch: string | null;
  truncated: boolean;
  secrets_redacted: boolean;
};

export type CiCheck = {
  name: string;
  source: "check_run" | "status" | "workflow_run";
  status: string;
  conclusion: string | null;
  details_url?: string;
};

export type CiOverall = "passed" | "failed" | "pending" | "none";

export type CiStatus = {
  head_sha: string;
  overall: CiOverall;
  checks: CiCheck[];
};

export type FileRisk = {
  path: string;
  categories: RiskCategory[];
  reasons: string[];
};

export type FileRiskReport = {
  files: FileRisk[];
  high_risk_files: string[];
  categories_present: RiskCategory[];
  destructive_schema_change: boolean;
};

export type SecretMatchType =
  | "aws_access_key"
  | "github_token"
  | "private_key"
  | "stripe_key"
  | "google_api_key"
  | "slack_token"
  | "jwt"
  | "password"
  | "generic_token";

export type SecretFinding = {
  path: string;
  type: SecretMatchType;
  redacted_snippet: string;
};

export type SecretScanReport = {
  secrets_found: number;
  findings: SecretFinding[];
};

export type EvidenceRef = {
  source: string;
  kind: EvidenceKind;
  detail: string;
};

export type Finding = {
  title: string;
  severity: Severity;
  category: string;
  summary: string;
  evidence: EvidenceRef[];
  recommendation: string;
};

export type EvidenceValidationReport = {
  accepted: Finding[];
  rejected: Array<Finding & { rejection_reason: string }>;
};

export type PolicyRule = {
  id: string;
  outcome: Exclude<Decision, "READY">;
  reason: string;
  actions: string[];
};

export type PolicyResult = {
  decision: Decision;
  rules_fired: PolicyRule[];
  required_actions: string[];
  summary: string;
};
