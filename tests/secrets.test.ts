import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecretsInText, scanChangedFilesForSecrets } from "../src/secrets.ts";
import { changedFile } from "./helpers.ts";

test("redactSecretsInText replaces AWS keys, private keys, and passwords", () => {
  const text = [
    "AWS_KEY=AKIAIOSFODNN7EXAMPLE",
    "-----BEGIN PRIVATE KEY-----",
    "password = \"super-secret-value\"",
  ].join("\n");

  const result = redactSecretsInText(text);
  assert.equal(result.redacted, true);
  assert.equal(result.text.includes("AKIAIOSFODNN7EXAMPLE"), false);
  assert.equal(result.text.includes("super-secret-value"), false);
  assert.match(result.text, /\[REDACTED:aws_access_key\]/);
  assert.match(result.text, /\[REDACTED:private_key\]/);
  assert.match(result.text, /\[REDACTED:password\]/);
});

test("scanChangedFilesForSecrets reports redacted snippets only", () => {
  const report = scanChangedFilesForSecrets([
    changedFile({
      path: "src/client.ts",
      added_lines: ["const key = 'sk_live_abcdefghijklmnopqrstuvwxyz'"],
    }),
  ]);

  assert.equal(report.secrets_found, 1);
  assert.equal(report.findings[0].type, "stripe_key");
  assert.equal(report.findings[0].path, "src/client.ts");
  assert.match(report.findings[0].redacted_snippet, /\[REDACTED:stripe_key\]/);
  assert.equal(report.findings[0].redacted_snippet.includes("sk_live_abcdefghijklmnopqrstuvwxyz"), false);
});
