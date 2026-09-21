import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFinding, validateFindings } from "../src/evidence.ts";
import { changedFile } from "./helpers.ts";

const files = [changedFile({ path: "src/auth/session.ts", added_lines: ["setCookie()"] })];

test("validateFindings accepts changed-file and collected-source evidence", () => {
  const report = validateFindings(
    [
      normalizeFinding({
        title: "Cookie flags",
        severity: "high",
        category: "security",
        summary: "Session cookie changed",
        evidence_source: "src/auth/session.ts",
        evidence_detail: "setCookie()",
      }),
      normalizeFinding({
        title: "CI gap",
        severity: "medium",
        category: "testing",
        summary: "No checks",
        evidence: [{ source: "ci", detail: "overall none" }],
      }),
    ],
    files,
  );

  assert.equal(report.accepted.length, 2);
  assert.equal(report.rejected.length, 0);
});

test("validateFindings rejects missing or invented evidence sources", () => {
  const report = validateFindings(
    [
      normalizeFinding({
        title: "Invented file",
        severity: "high",
        evidence_source: "src/does-not-exist.ts",
        evidence_detail: "not in the diff",
      }),
      normalizeFinding({
        title: "No evidence",
        severity: "low",
        summary: "vibes",
      }),
    ],
    files,
  );

  assert.equal(report.accepted.length, 0);
  assert.equal(report.rejected.length, 2);
  assert.match(report.rejected[0].rejection_reason, /not in changed files/);
  assert.match(report.rejected[1].rejection_reason, /no evidence/i);
});
