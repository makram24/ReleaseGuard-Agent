import { loadEnv, requireEnv } from "./env.ts";

loadEnv();

export async function withRetries<T>(
  label: string,
  run: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /(?:\b429\b|\b5\d\d\b|rate limit|temporar|timeout|ECONNRESET|ETIMEDOUT)/i.test(message);
      if (!retryable || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} failed after ${attempts} attempts.`);
}

export function githubToken(): string | undefined {
  loadEnv();
  return process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || undefined;
}

export function requireGithubToken(): string {
  loadEnv();
  const token = githubToken();
  if (!token) {
    throw new Error(
      "Missing GITHUB_TOKEN. Copy .env.example to .env and set a fine-grained PAT with Contents: Read, Pull requests: Read/Write, and Checks: Read.",
    );
  }
  return token;
}

export function requireGeminiKey(): string {
  return requireEnv("GEMINI_API_KEY");
}
