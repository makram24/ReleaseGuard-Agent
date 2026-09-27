import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

/** Load a local `.env` into process.env without overriding existing variables. */
export function loadEnv(filePath = resolve(process.cwd(), ".env")): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function requireEnv(name: string): string {
  loadEnv();
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  loadEnv();
  return process.env[name]?.trim() || fallback;
}

export function agentModel(): string {
  return optionalEnv("RELEASE_GUARD_MODEL", "gemini-3.1-flash-lite");
}

export function assertRuntimeEnv(): { gemini: boolean; github: boolean } {
  loadEnv();
  return {
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    github: Boolean((process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN)?.trim()),
  };
}
