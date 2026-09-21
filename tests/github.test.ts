import { test } from "node:test";
import assert from "node:assert/strict";
import { overallFromChecks, parsePullRequestUrl, toChangedFile } from "../src/github.ts";
import { DEFAULT_OWNER, DEFAULT_REPO } from "../src/repo.ts";

test("parsePullRequestUrl accepts github html, api, and shorthand urls", () => {
  assert.deepEqual(parsePullRequestUrl("https://github.com/acme/app/pull/42"), {
    owner: "acme",
    repo: "app",
    number: 42,
  });
  assert.deepEqual(parsePullRequestUrl("https://api.github.com/repos/acme/app.git/pulls/42"), {
    owner: "acme",
    repo: "app",
    number: 42,
  });
  assert.deepEqual(parsePullRequestUrl("acme/app#42"), {
    owner: "acme",
    repo: "app",
    number: 42,
  });
});

test("parsePullRequestUrl rejects non-PR urls", () => {
  assert.throws(() => parsePullRequestUrl("https://github.com/acme/app"), /Could not parse/);
});

test("bare PR numbers resolve to this repository", () => {
  const home = { owner: DEFAULT_OWNER, repo: DEFAULT_REPO };
  assert.deepEqual(parsePullRequestUrl("12", home), {
    owner: "makram24",
    repo: "ReleaseGuard-Agent",
    number: 12,
  });
  assert.deepEqual(parsePullRequestUrl("#7", home), {
    owner: "makram24",
    repo: "ReleaseGuard-Agent",
    number: 7,
  });
  assert.deepEqual(parsePullRequestUrl("pr 3", home), {
    owner: "makram24",
    repo: "ReleaseGuard-Agent",
    number: 3,
  });
});

test("toChangedFile extracts additions and redacts secrets in the patch", () => {
  const file = toChangedFile({
    filename: "src/config.ts",
    status: "modified",
    additions: 1,
    deletions: 1,
    changes: 2,
    patch: [
      "@@ -1,2 +1,2 @@",
      "-const token = 'old'",
      "+const token = 'ghp_abcdefghijklmnopqrstuvwxyz123456'",
    ].join("\n"),
  });

  assert.equal(file.path, "src/config.ts");
  assert.equal(file.deleted_lines[0], "const token = 'old'");
  assert.match(file.added_lines[0], /\[REDACTED:github_token\]/);
  assert.equal(file.secrets_redacted, true);
  assert.doesNotMatch(file.added_lines[0], /ghp_/);
});

test("overallFromChecks maps failed, pending, passed, and empty sets", () => {
  assert.equal(overallFromChecks([]), "none");
  assert.equal(
    overallFromChecks([{ name: "lint", source: "check_run", status: "completed", conclusion: "success" }]),
    "passed",
  );
  assert.equal(
    overallFromChecks([{ name: "tests", source: "check_run", status: "in_progress", conclusion: null }]),
    "pending",
  );
  assert.equal(
    overallFromChecks([{ name: "build", source: "check_run", status: "completed", conclusion: "failure" }]),
    "failed",
  );
});
