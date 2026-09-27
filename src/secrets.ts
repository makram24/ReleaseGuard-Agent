import type { ChangedFile, SecretFinding, SecretMatchType, SecretScanReport } from "./types.ts";

type SecretPattern = {
  type: SecretMatchType;
  regex: RegExp;
};

const SECRET_PATTERNS: SecretPattern[] = [
  { type: "aws_access_key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: "github_token", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g },
  { type: "github_token", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { type: "stripe_key", regex: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { type: "google_api_key", regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { type: "slack_token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { type: "private_key", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { type: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  {
    type: "password",
    regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/gi,
  },
  {
    type: "generic_token",
    regex: /(?:api[_-]?key|secret|token|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_\-./+=]{16,}['"]/gi,
  },
];

const REDACTION = (type: SecretMatchType) => `[REDACTED:${type}]`;

function uniqueMatches(text: string, regex: RegExp): string[] {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const global = new RegExp(regex.source, flags);
  const found = text.match(global);
  return found ? [...new Set(found)] : [];
}

export function redactSecretsInText(text: string): { text: string; redacted: boolean; types: SecretMatchType[] } {
  let output = text;
  const types = new Set<SecretMatchType>();

  for (const pattern of SECRET_PATTERNS) {
    const matches = uniqueMatches(output, pattern.regex);
    for (const match of matches) {
      types.add(pattern.type);
      output = output.split(match).join(REDACTION(pattern.type));
    }
  }

  return { text: output, redacted: types.size > 0, types: [...types] };
}

function snippetAround(line: string, match: string): string {
  const redactedLine = line.split(match).join(REDACTION(guessType(match)));
  if (redactedLine.length <= 160) return redactedLine.trim();
  const index = redactedLine.indexOf("[REDACTED:");
  const start = Math.max(0, index - 40);
  return `${start > 0 ? "…" : ""}${redactedLine.slice(start, start + 160).trim()}`;
}

function guessType(match: string): SecretMatchType {
  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    if (regex.test(match)) return pattern.type;
  }
  return "generic_token";
}

export function scanChangedFilesForSecrets(files: ChangedFile[]): SecretScanReport {
  const findings: SecretFinding[] = [];

  for (const file of files) {
    const lines = file.added_lines.length > 0 ? file.added_lines : (file.patch ?? "").split("\n");
    for (const line of lines) {
      if (line.includes("[REDACTED:")) {
        const typeMatch = line.match(/\[REDACTED:([a-z_]+)\]/);
        if (typeMatch) {
          findings.push({
            path: file.path,
            type: typeMatch[1] as SecretMatchType,
            redacted_snippet: line.trim().slice(0, 160),
          });
        }
        continue;
      }

      for (const pattern of SECRET_PATTERNS) {
        const matches = uniqueMatches(line, pattern.regex);
        for (const match of matches) {
          findings.push({
            path: file.path,
            type: pattern.type,
            redacted_snippet: snippetAround(line, match),
          });
        }
      }
    }
  }

  const deduped = findings.filter(
    (finding, index, all) =>
      all.findIndex(
        (other) =>
          other.path === finding.path &&
          other.type === finding.type &&
          other.redacted_snippet === finding.redacted_snippet,
      ) === index,
  );

  return {
    secrets_found: deduped.length,
    findings: deduped,
  };
}
