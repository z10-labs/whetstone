export type DiffKind = 'ctx' | 'add' | 'del' | 'hunk';

export interface DiffLine {
  kind: DiffKind;
  oldNo: number | null;
  newNo: number | null;
  sign: string;
  text: string;
}

/** Turn a stored unified diff into numbered rows for the optional code pane. */
export function parsePatchLines(patch: string): DiffLine[] {
  const out: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;

  for (const raw of patch.split('\n')) {
    if (
      raw.startsWith('diff ') ||
      raw.startsWith('index ') ||
      raw.startsWith('---') ||
      raw.startsWith('+++') ||
      raw.startsWith('new file') ||
      raw.startsWith('deleted file') ||
      raw.startsWith('similarity ') ||
      raw.startsWith('rename ')
    ) {
      continue;
    }

    if (raw.startsWith('@@')) {
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldNo = Number(match[1]);
        newNo = Number(match[2]);
      }
      out.push({ kind: 'hunk', oldNo: null, newNo: null, sign: '', text: raw });
      continue;
    }

    if (raw.startsWith('+')) {
      out.push({ kind: 'add', oldNo: null, newNo, sign: '+', text: raw.slice(1) });
      newNo += 1;
      continue;
    }
    if (raw.startsWith('-')) {
      out.push({ kind: 'del', oldNo, newNo: null, sign: '−', text: raw.slice(1) });
      oldNo += 1;
      continue;
    }

    const text = raw.startsWith(' ') ? raw.slice(1) : raw;
    out.push({ kind: 'ctx', oldNo, newNo, sign: '', text });
    oldNo += 1;
    newNo += 1;
  }

  return out;
}
