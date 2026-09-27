import type { ChangedFile, EvidenceKind, EvidenceValidationReport, Finding } from "./types.ts";

const COLLECTED_SOURCES: Record<string, EvidenceKind> = {
  pull_request: "pull_request",
  pr: "pull_request",
  ci: "ci",
  secrets: "secrets",
  secret_scanner: "secrets",
  file_risks: "file_risks",
  file_risk_classifier: "file_risks",
};

function normalize(value: string): string {
  return value.trim().replace(/\\/g, "/").toLowerCase();
}

function fileSourceAllowed(source: string, filePaths: string[]): boolean {
  if (filePaths.includes(source)) return true;
  const hits = filePaths.filter((path) => path === source || path.endsWith(`/${source}`));
  return hits.length === 1;
}

export function normalizeFinding(raw: unknown): Finding {
  const value = (raw ?? {}) as Record<string, unknown>;
  const evidenceRaw = value.evidence;
  const evidence = Array.isArray(evidenceRaw)
    ? evidenceRaw.map((item) => {
        const ref = (item ?? {}) as Record<string, unknown>;
        return {
          source: String(ref.source ?? ""),
          kind: (ref.kind as EvidenceKind | undefined) ?? "file",
          detail: String(ref.detail ?? ""),
        };
      })
    : value.evidence_source
      ? [
          {
            source: String(value.evidence_source),
            kind: "file" as const,
            detail: String(value.evidence_detail ?? ""),
          },
        ]
      : [];

  return {
    title: String(value.title ?? "Untitled finding"),
    severity: (value.severity as Finding["severity"]) ?? "low",
    category: String(value.category ?? "unknown"),
    summary: String(value.summary ?? ""),
    evidence,
    recommendation: String(value.recommendation ?? ""),
  };
}

export function validateFindings(
  findings: Finding[],
  files: ChangedFile[],
  extraSources: string[] = [],
): EvidenceValidationReport {
  const filePaths = files.map((file) => normalize(file.path));
  const extras = extraSources.map(normalize);
  const accepted: EvidenceValidationReport["accepted"] = [];
  const rejected: EvidenceValidationReport["rejected"] = [];

  for (const finding of findings) {
    if (!finding.evidence || finding.evidence.length === 0) {
      rejected.push({ ...finding, rejection_reason: "Finding has no evidence references." });
      continue;
    }

    const invalid = finding.evidence.filter((ref) => {
      const source = normalize(ref.source);
      if (!source) return true;
      if (fileSourceAllowed(source, filePaths)) return false;
      if (source in COLLECTED_SOURCES) return false;
      if (extras.includes(source)) return false;
      return true;
    });

    if (invalid.length > 0) {
      rejected.push({
        ...finding,
        rejection_reason: `Evidence source not in changed files or collected sources: ${invalid
          .map((ref) => ref.source)
          .join(", ")}`,
      });
      continue;
    }

    accepted.push({
      ...finding,
      evidence: finding.evidence.map((ref) => {
        const source = normalize(ref.source);
        return {
          ...ref,
          kind: fileSourceAllowed(source, filePaths)
            ? "file"
            : (COLLECTED_SOURCES[source] ?? ref.kind),
        };
      }),
    });
  }

  return { accepted, rejected };
}
