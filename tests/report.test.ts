import { test } from "node:test";
import assert from "node:assert/strict";
import { generateReleaseReport } from "../src/report.ts";
import { ci, emptyRisks, emptySecrets, pullRequest } from "./helpers.ts";

test("generateReleaseReport includes decision, evidence, risks, and required actions", () => {
  const { decision, markdown } = generateReleaseReport({
    pr: pullRequest({ title: "Harden checkout" }),
    ci: ci("passed", ["lint", "tests"]),
    fileRisks: emptyRisks,
    secrets: emptySecrets,
    evidence: {
      accepted: [
        {
          title: "Feature flag missing",
          severity: "low",
          category: "deployment",
          summary: "No flag for the rollout",
          evidence: [{ source: "src/checkout.ts", kind: "file", detail: "always on" }],
          recommendation: "Add a feature flag.",
        },
      ],
      rejected: [
        {
          title: "Invented",
          severity: "high",
          category: "security",
          summary: "not real",
          evidence: [{ source: "missing.ts", kind: "file", detail: "" }],
          recommendation: "",
          rejection_reason: "Evidence source not in changed files",
        },
      ],
    },
    policy: {
      decision: "MANUAL_REVIEW",
      rules_fired: [
        {
          id: "reviewer_risks",
          outcome: "MANUAL_REVIEW",
          reason: "Validated reviewer findings require attention.",
          actions: ["Add a feature flag."],
        },
      ],
      required_actions: ["Add a feature flag."],
      summary: "MANUAL_REVIEW because validated reviewer findings require attention.",
    },
  });

  assert.equal(decision, "MANUAL_REVIEW");
  assert.match(markdown, /Decision: MANUAL_REVIEW/);
  assert.match(markdown, /Harden checkout/);
  assert.match(markdown, /Feature flag missing/);
  assert.match(markdown, /Add a feature flag/);
  assert.match(markdown, /Rejected ungrounded findings/);
  assert.match(markdown, /Release Policy Evaluator, not by the language model/);
});
