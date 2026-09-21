export type ParsedPatch = {
  added: string[];
  deleted: string[];
  truncated: boolean;
};

export function parsePatchLines(patch: string, maxLinesPerSide = 200): ParsedPatch {
  const added: string[] = [];
  const deleted: string[] = [];
  let truncated = false;

  if (!patch) return { added, deleted, truncated };

  for (const rawLine of patch.split("\n")) {
    if (rawLine.startsWith("+++") || rawLine.startsWith("---") || rawLine.startsWith("@@") || rawLine.startsWith("diff ")) {
      continue;
    }
    if (rawLine.startsWith("\\")) continue;

    if (rawLine.startsWith("+")) {
      if (added.length < maxLinesPerSide) added.push(rawLine.slice(1));
      else truncated = true;
    } else if (rawLine.startsWith("-")) {
      if (deleted.length < maxLinesPerSide) deleted.push(rawLine.slice(1));
      else truncated = true;
    }
  }

  return { added, deleted, truncated };
}
