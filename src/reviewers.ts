import { AgentTool, LlmAgent } from "@google/adk";
import { z } from "zod";

const MODEL = "gemini-3.1-flash-lite";

const reviewerInput = z.object({
  pr_json: z.string().describe("JSON from pull_request_reader."),
  files_json: z.string().describe("JSON from changed_files_reader. Secret values are already redacted."),
  file_risks_json: z.string().describe("JSON from file_risk_classifier."),
  extra_json: z.string().optional().describe("Optional extra collected evidence JSON (CI, secrets, description)."),
});

const reviewerOutput = z.object({
  findings: z.array(
    z.object({
      title: z.string(),
      severity: z.enum(["critical", "high", "medium", "low"]),
      category: z.string(),
      summary: z.string(),
      evidence_source: z
        .string()
        .describe("A changed file path from files_json, or pull_request, ci, secrets, or file_risks."),
      evidence_detail: z.string().describe("Quote or paraphrase only what appears in the collected evidence."),
      recommendation: z.string(),
    }),
  ),
  notes: z.string(),
});

function createReviewer(options: { name: string; description: string; instruction: string }): AgentTool {
  const agent = new LlmAgent({
    name: options.name,
    model: MODEL,
    description: options.description,
    instruction: `${options.instruction}

Rules:
- Use only the JSON you were given. Do not invent files, tests, checks, or APIs that are not present.
- Every finding must set evidence_source to a real changed file path or one of: pull_request, ci, secrets, file_risks.
- If there is no issue in your specialty, return an empty findings array and explain why in notes.
- Never include secret values. If a secret was redacted, refer to it only as [REDACTED].`,
    inputSchema: reviewerInput,
    outputSchema: reviewerOutput,
    includeContents: "none",
    disallowTransferToParent: true,
    disallowTransferToPeers: true,
  });

  return new AgentTool({ agent, skipSummarization: true });
}

export const securityReviewer = createReviewer({
  name: "security_reviewer",
  description:
    "Examines the collected changes for authentication, authorization, validation, and data-exposure risks.",
  instruction: `You are the Security Reviewer for ReleaseGuard.
Inspect the collected PR evidence for:
- authentication and session handling flaws
- authorization / access-control gaps
- missing input validation
- sensitive data exposure (PII, credentials, debug dumps)
Cite the specific changed file or collected source for every finding.`,
});

export const testingReviewer = createReviewer({
  name: "testing_reviewer",
  description: "Determines whether the changed behavior has suitable tests and identifies important missing test cases.",
  instruction: `You are the Testing Reviewer for ReleaseGuard.
Compare behavioral code changes with test files in the diff (paths containing test, spec, or __tests__).
Identify important missing test cases for the changed behavior.
If the diff includes tests that clearly cover the change, say so and do not over-report.`,
});

export const breakingChangeReviewer = createReviewer({
  name: "breaking_change_reviewer",
  description:
    "Detects potentially incompatible API changes, removed fields, database-schema changes, and configuration requirements.",
  instruction: `You are the Breaking-Change Reviewer for ReleaseGuard.
Look for incompatible API changes, removed or renamed fields, database schema changes, and new required configuration.
Treat public routes, OpenAPI/GraphQL/proto contracts, exported types, and migrations as high-signal evidence.`,
});

export const deploymentReviewer = createReviewer({
  name: "deployment_reviewer",
  description:
    "Checks whether risky changes have monitoring, migration, feature-flag, and rollback considerations.",
  instruction: `You are the Deployment Reviewer for ReleaseGuard.
For risky or operational changes, check whether the collected evidence mentions monitoring, migrations, feature flags, or rollback.
If deployment/workflow/infrastructure files changed without those considerations, report that gap.`,
});
