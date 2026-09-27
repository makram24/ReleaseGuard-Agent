import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyChangedFiles } from "../src/classify.ts";
import { changedFile } from "./helpers.ts";

test("classifyChangedFiles tags auth, payments, migrations, dependencies, config, apis, and deployment", () => {
  const report = classifyChangedFiles([
    changedFile({ path: "src/auth/login.ts", added_lines: ["export function login() {}"] }),
    changedFile({ path: "src/billing/stripe.ts", added_lines: ["stripe.charges.create()"] }),
    changedFile({
      path: "db/migrations/20240101_drop.sql",
      added_lines: ["DROP TABLE sessions;"],
    }),
    changedFile({ path: "package-lock.json", added_lines: ["\"zod\": \"4.5.4\""] }),
    changedFile({ path: ".env.production", added_lines: ["LOG_LEVEL=info"] }),
    changedFile({ path: "src/routes/users.ts", added_lines: ["router.get('/users')"] }),
    changedFile({ path: ".github/workflows/deploy.yml", added_lines: ["run: deploy"] }),
    changedFile({ path: "src/utils/math.ts", added_lines: ["export const add = (a, b) => a + b"] }),
  ]);

  assert.ok(report.categories_present.includes("authentication"));
  assert.ok(report.categories_present.includes("payments"));
  assert.ok(report.categories_present.includes("database_migrations"));
  assert.ok(report.categories_present.includes("dependencies"));
  assert.ok(report.categories_present.includes("configuration"));
  assert.ok(report.categories_present.includes("apis"));
  assert.ok(report.categories_present.includes("deployment"));
  assert.equal(report.destructive_schema_change, true);
  assert.ok(report.high_risk_files.includes("src/auth/login.ts"));
  assert.equal(
    report.files.find((file) => file.path === "src/utils/math.ts")?.categories.length,
    0,
  );
});

test("classifyChangedFiles ignores keyword hits in tests and rule sources", () => {
  const report = classifyChangedFiles([
    changedFile({
      path: "tests/policy.test.ts",
      added_lines: ["DROP TABLE sessions;", "stripe.charges.create()"],
    }),
    changedFile({
      path: "src/classify.ts",
      added_lines: ["if (/stripe|paypal|payment/i.test(path)) {}", "password_hash"],
    }),
    changedFile({
      path: "db/migrations/20240102_real.sql",
      added_lines: ["DROP TABLE accounts;"],
    }),
  ]);

  assert.equal(report.files.find((file) => file.path === "tests/policy.test.ts")?.categories.length, 0);
  assert.equal(report.files.find((file) => file.path === "src/classify.ts")?.categories.length, 0);
  assert.ok(report.categories_present.includes("database_migrations"));
  assert.equal(report.destructive_schema_change, true);
  assert.ok(report.high_risk_files.includes("db/migrations/20240102_real.sql"));
  assert.ok(!report.high_risk_files.includes("tests/policy.test.ts"));
});
