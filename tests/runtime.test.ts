import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetries } from "../src/runtime.ts";

test("withRetries returns on first success", async () => {
  let calls = 0;
  const value = await withRetries("ok", async () => {
    calls += 1;
    return 42;
  });
  assert.equal(value, 42);
  assert.equal(calls, 1);
});

test("withRetries retries retryable failures then succeeds", async () => {
  let calls = 0;
  const value = await withRetries(
    "flaky",
    async () => {
      calls += 1;
      if (calls < 3) throw new Error("temporary 429 rate limit");
      return "done";
    },
    { attempts: 3, baseDelayMs: 1 },
  );
  assert.equal(value, "done");
  assert.equal(calls, 3);
});

test("withRetries does not retry non-retryable failures", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetries(
        "auth",
        async () => {
          calls += 1;
          throw new Error("GitHub authentication failed.");
        },
        { attempts: 3, baseDelayMs: 1 },
      ),
    /authentication failed/,
  );
  assert.equal(calls, 1);
});
