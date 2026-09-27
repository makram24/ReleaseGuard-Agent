import { FunctionTool } from "@google/adk";
import { z } from "zod";
import { classifyChangedFiles } from "./classify.ts";
import { validateFindings, normalizeFinding } from "./evidence.ts";
import { loadEnv } from "./env.ts";
import {
  listRepositoryPullRequests,
  publishPrComment,
  readChangedFiles,
  readCiStatus,
  readPullRequest,
} from "./github.ts";
import { evaluateReleasePolicy } from "./policy.ts";
import { DEFAULT_OWNER, DEFAULT_REPO, DEFAULT_REPO_URL, ownRepository } from "./repo.ts";
import { generateReleaseReport } from "./report.ts";
import { scanChangedFilesForSecrets } from "./secrets.ts";
import type {
  ChangedFile,
  CiStatus,
  FileRiskReport,
  Finding,
  PolicyResult,
  PullRequestSummary,
  SecretScanReport,
  EvidenceValidationReport,
} from "./types.ts";
import { asArray, parseJsonArg, toolError, toolOk } from "./util.ts";

loadEnv();

const prUrlParam = z.object({
  pr_url: z
    .string()
    .optional()
    .describe(
      `GitHub pull request URL, a PR number in ${DEFAULT_OWNER}/${DEFAULT_REPO} (for example "12"), or "latest". Defaults to the latest open PR on ${DEFAULT_REPO_URL}.`,
    ),
});

export const pullRequestReader = new FunctionTool({
  name: "pull_request_reader",
  description:
    "Retrieves the PR title, description, author, head/base branches, size (additions, deletions, changed files), and status.",
  parameters: prUrlParam,
  execute: async ({ pr_url }) => {
    try {
      const pr = await readPullRequest(pr_url ?? "latest");
      return toolOk({ pr });
    } catch (error) {
      return toolError(error);
    }
  },
});

export const changedFilesReader = new FunctionTool({
  name: "changed_files_reader",
  description:
    "Retrieves the files changed by the PR and the exact additions and deletions. Secret values in diffs are redacted before they are returned.",
  parameters: prUrlParam,
  execute: async ({ pr_url }) => {
    try {
      const files = await readChangedFiles(pr_url ?? "latest");
      return toolOk({ files, file_count: files.length });
    } catch (error) {
      return toolError(error);
    }
  },
});

export const ciStatusReader = new FunctionTool({
  name: "ci_status_reader",
  description:
    "Checks whether automated tests, builds, linting, and other GitHub checks passed, failed, or are still running.",
  parameters: prUrlParam,
  execute: async ({ pr_url }) => {
    try {
      const ci = await readCiStatus(pr_url ?? "latest");
      return toolOk({ ci });
    } catch (error) {
      return toolError(error);
    }
  },
});

export const listOwnPullRequests = new FunctionTool({
  name: "list_own_pull_requests",
  description: `Lists pull requests on this repository (${DEFAULT_OWNER}/${DEFAULT_REPO}) so ReleaseGuard can review its own code without a pasted URL.`,
  parameters: z.object({
    state: z
      .enum(["open", "closed", "all"])
      .optional()
      .describe("Which pull requests to list. Defaults to open."),
  }),
  execute: async ({ state }) => {
    try {
      const home = ownRepository();
      const pull_requests = await listRepositoryPullRequests(state ?? "open");
      return toolOk({
        repository: `${home.owner}/${home.repo}`,
        html_url: `https://github.com/${home.owner}/${home.repo}`,
        pull_requests,
      });
    } catch (error) {
      return toolError(error);
    }
  },
});

export const fileRiskClassifier = new FunctionTool({
  name: "file_risk_classifier",
  description:
    "Identifies sensitive changes involving authentication, payments, database migrations, dependencies, configuration, APIs, or deployment files.",
  parameters: z.object({
    files_json: z
      .string()
      .describe("JSON from changed_files_reader (the files array or the full tool result)."),
  }),
  execute: async ({ files_json }) => {
    try {
      const parsed = parseJsonArg<unknown>(files_json, "files_json");
      const files = asArray<ChangedFile>(parsed, "files");
      const file_risks = classifyChangedFiles(files);
      return toolOk({ file_risks });
    } catch (error) {
      return toolError(error);
    }
  },
});

export const secretScanner = new FunctionTool({
  name: "secret_scanner",
  description:
    "Checks newly added code for accidentally exposed API keys, passwords, private keys, or tokens. Detected values are redacted and never returned in full.",
  parameters: z.object({
    pr_url: z.string().optional().describe("GitHub pull request URL. Used when files_json is not already available."),
    files_json: z.string().optional().describe("JSON from changed_files_reader."),
  }),
  execute: async ({ pr_url, files_json }) => {
    try {
      const files = files_json
        ? asArray<ChangedFile>(parseJsonArg<unknown>(files_json, "files_json"), "files")
        : await readChangedFiles(pr_url ?? "latest");
      const secrets = scanChangedFilesForSecrets(files);
      return toolOk({ secrets });
    } catch (error) {
      return toolError(error);
    }
  },
});

export const evidenceValidator = new FunctionTool({
  name: "evidence_validator",
  description:
    "Rejects findings that do not reference an actual changed file or another collected source (pull_request, ci, secrets, file_risks).",
  parameters: z.object({
    findings_json: z
      .string()
      .describe("JSON array of reviewer findings, or an object with a findings array."),
    files_json: z.string().describe("JSON from changed_files_reader."),
    extra_sources_json: z
      .string()
      .optional()
      .describe("Optional JSON array of additional collected source ids."),
  }),
  execute: async ({ findings_json, files_json, extra_sources_json }) => {
    try {
      const findings = asArray<unknown>(parseJsonArg<unknown>(findings_json, "findings_json"), "findings").map(
        normalizeFinding,
      );
      const files = asArray<ChangedFile>(parseJsonArg<unknown>(files_json, "files_json"), "files");
      const extra = extra_sources_json
        ? asArray<string>(parseJsonArg<unknown>(extra_sources_json, "extra_sources_json"), "sources")
        : [];
      const evidence = validateFindings(findings, files, extra);
      return toolOk({ evidence });
    } catch (error) {
      return toolError(error);
    }
  },
});

export const releasePolicyEvaluator = new FunctionTool({
  name: "release_policy_evaluator",
  description:
    "Applies deterministic release rules and returns READY, MANUAL_REVIEW, or BLOCKED. This tool—not the LLM—makes the final decision.",
  parameters: z.object({
    pr_json: z.string().describe("JSON from pull_request_reader."),
    ci_json: z.string().describe("JSON from ci_status_reader."),
    file_risks_json: z.string().describe("JSON from file_risk_classifier."),
    secrets_json: z.string().describe("JSON from secret_scanner."),
    validated_findings_json: z.string().describe("JSON from evidence_validator."),
  }),
  execute: async ({ pr_json, ci_json, file_risks_json, secrets_json, validated_findings_json }) => {
    try {
      const pr = unwrap<PullRequestSummary>(parseJsonArg<unknown>(pr_json, "pr_json"), "pr");
      const ci = unwrap<CiStatus>(parseJsonArg<unknown>(ci_json, "ci_json"), "ci");
      const fileRisks = unwrap<FileRiskReport>(parseJsonArg<unknown>(file_risks_json, "file_risks_json"), "file_risks");
      const secrets = unwrap<SecretScanReport>(parseJsonArg<unknown>(secrets_json, "secrets_json"), "secrets");
      const evidence = unwrap<EvidenceValidationReport>(
        parseJsonArg<unknown>(validated_findings_json, "validated_findings_json"),
        "evidence",
      );
      const policy = evaluateReleasePolicy({
        pr,
        ci,
        fileRisks,
        secrets,
        findings: evidence.accepted ?? asArray<Finding>(evidence, "accepted"),
      });
      return toolOk({ policy });
    } catch (error) {
      return toolError(error);
    }
  },
});

export const reportGenerator = new FunctionTool({
  name: "report_generator",
  description:
    "Produces a concise Markdown report containing the decision, evidence, risks, and required actions.",
  parameters: z.object({
    pr_json: z.string().describe("JSON from pull_request_reader."),
    ci_json: z.string().describe("JSON from ci_status_reader."),
    file_risks_json: z.string().describe("JSON from file_risk_classifier."),
    secrets_json: z.string().describe("JSON from secret_scanner."),
    validated_findings_json: z.string().describe("JSON from evidence_validator."),
    policy_json: z.string().describe("JSON from release_policy_evaluator."),
  }),
  execute: async ({
    pr_json,
    ci_json,
    file_risks_json,
    secrets_json,
    validated_findings_json,
    policy_json,
  }) => {
    try {
      const report = generateReleaseReport({
        pr: unwrap<PullRequestSummary>(parseJsonArg<unknown>(pr_json, "pr_json"), "pr"),
        ci: unwrap<CiStatus>(parseJsonArg<unknown>(ci_json, "ci_json"), "ci"),
        fileRisks: unwrap<FileRiskReport>(parseJsonArg<unknown>(file_risks_json, "file_risks_json"), "file_risks"),
        secrets: unwrap<SecretScanReport>(parseJsonArg<unknown>(secrets_json, "secrets_json"), "secrets"),
        evidence: unwrap<EvidenceValidationReport>(
          parseJsonArg<unknown>(validated_findings_json, "validated_findings_json"),
          "evidence",
        ),
        policy: unwrap<PolicyResult>(parseJsonArg<unknown>(policy_json, "policy_json"), "policy"),
      });
      return toolOk(report);
    } catch (error) {
      return toolError(error);
    }
  },
});

export const prCommentPublisher = new FunctionTool({
  name: "pr_comment_publisher",
  description:
    "Posts the ReleaseGuard Markdown report to the GitHub pull request. Requires explicit human confirmation before it runs.",
  parameters: z.object({
    pr_url: z
      .string()
      .optional()
      .describe(
        `GitHub pull request URL or PR number in ${DEFAULT_OWNER}/${DEFAULT_REPO}. Defaults to the latest open PR.`,
      ),
    markdown: z.string().describe("Markdown report produced by report_generator."),
  }),
  requireConfirmation: true,
  execute: async ({ pr_url, markdown }) => {
    try {
      if (!markdown.trim()) {
        return toolError("Refusing to publish an empty report.");
      }
      const comment = await publishPrComment(pr_url ?? "latest", markdown);
      return toolOk({ published: true, comment });
    } catch (error) {
      return toolError(error);
    }
  },
});

function unwrap<T>(raw: unknown, key: string): T {
  if (raw && typeof raw === "object" && key in (raw as object) && (raw as Record<string, unknown>)[key]) {
    return (raw as Record<string, T>)[key];
  }
  return raw as T;
}
