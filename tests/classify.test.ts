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
