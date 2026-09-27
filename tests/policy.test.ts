import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateReleasePolicy } from "../src/policy.ts";
import { classifyChangedFiles } from "../src/classify.ts";
import { changedFile, ci, emptyRisks, emptySecrets, pullRequest } from "./helpers.ts";

test("evaluateReleasePolicy returns READY when collectors are clean", () => {
  const result = evaluateReleasePolicy({
    pr: pullRequest(),
    ci: ci("passed"),
    fileRisks: emptyRisks,
    secrets: emptySecrets,
    findings: [],
  });
  assert.equal(result.decision, "READY");
  assert.equal(result.rules_fired.length, 0);
});

test("evaluateReleasePolicy blocks on secrets, failed CI, critical findings, and destructive schema changes", () => {
  const fileRisks = classifyChangedFiles([
    changedFile({ path: "db/migrations/001.sql", added_lines: ["DROP TABLE users;"] }),
  ]);

  const result = evaluateReleasePolicy({
    pr: pullRequest(),
    ci: ci("failed", ["unit"]),
    fileRisks,
    secrets: {
      secrets_found: 1,
      findings: [{ path: "src/client.ts", type: "stripe_key", redacted_snippet: "[REDACTED:stripe_key]" }],
    },
    findings: [
      {
        title: "Auth bypass",
        severity: "critical",
        category: "security",
        summary: "Authorization missing",
        evidence: [{ source: "src/auth/session.ts", kind: "file", detail: "no check" }],
        recommendation: "Add authorization checks.",
      },
    ],
  });

  assert.equal(result.decision, "BLOCKED");
  assert.ok(result.rules_fired.some((rule) => rule.id === "secrets_detected"));
  assert.ok(result.rules_fired.some((rule) => rule.id === "ci_failed"));
  assert.ok(result.rules_fired.some((rule) => rule.id === "critical_finding"));
  assert.ok(result.rules_fired.some((rule) => rule.id === "destructive_schema"));
});

test("evaluateReleasePolicy returns MANUAL_REVIEW for draft, pending CI, and sensitive files", () => {
  const result = evaluateReleasePolicy({
    pr: pullRequest({
      status: { state: "open", draft: true, merged: false, mergeable: true, mergeable_state: "clean" },
    }),
    ci: ci("pending"),
    fileRisks: classifyChangedFiles([
      changedFile({ path: "src/auth/login.ts", added_lines: ["login()"] }),
    ]),
    secrets: emptySecrets,
    findings: [
      {
        title: "Missing tests for login",
        severity: "medium",
        category: "testing",
        summary: "No test file covers the new login path",
        evidence: [{ source: "src/auth/login.ts", kind: "file", detail: "login()" }],
        recommendation: "Add a login regression test.",
      },
    ],
  });

  assert.equal(result.decision, "MANUAL_REVIEW");
  assert.ok(result.rules_fired.every((rule) => rule.outcome !== "BLOCKED"));
  assert.ok(result.rules_fired.some((rule) => rule.id === "draft_pr"));
  assert.ok(result.rules_fired.some((rule) => rule.id === "sensitive_files"));
});
