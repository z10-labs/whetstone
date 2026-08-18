import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { SpecFile } from '@shared/explain-pr';
import { sessionColorVar } from '../../lib/ui';
import { displayPath, fileName } from './fileName';
import { parsePatchLines, type DiffLine } from './parsePatch';

interface Props {
  file: SpecFile;
  mapping?: boolean;
  onToggleReviewed: (path: string, reviewed: boolean) => void;
}

export function FileSpecCard({ file, mapping = false, onToggleReviewed }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [showDiff, setShowDiff] = useState(false);
  const explained = Boolean(file.spec);
  const hasConnect = Boolean(file.connects || file.behaviorChange || file.deps.length > 0);
  const lines = showDiff && file.patch ? parsePatchLines(file.patch).filter((l) => l.kind !== 'hunk') : [];

  return (
    <article className={`file-spec${explained ? '' : ' is-pending'}`}>
      <header className="file-spec-head">
        <div className="file-spec-head-row">
          <span className={`file-kind file-kind--${file.changeType}`} title={file.changeType} />
          <div className="file-spec-id">
            <span className="file-spec-name" title={file.path}>
              {displayPath(file.path)}
            </span>
            {file.path !== displayPath(file.path) && (
              <span className="file-spec-full" title={file.path}>
                {file.path}
              </span>
            )}
          </div>
          <span className="file-spec-stat">
            +{file.additions}
            {file.deletions > 0 ? `  −${file.deletions}` : ''}
          </span>
          <span className="file-spec-change">{file.changeType}</span>
          <div className="file-spec-actions">
            {file.patch && (
              <button className="btn btn--ghost" onClick={() => setShowDiff((v) => !v)}>
                {showDiff ? 'Hide code' : 'Show code'}
              </button>
            )}
            <button
              className={`btn${file.reviewed ? ' btn--reviewed' : ''}`}
              onClick={() => onToggleReviewed(file.path, !file.reviewed)}
            >
              {file.reviewed ? 'Reviewed ✓' : 'Mark reviewed'}
            </button>
          </div>
        </div>
        {file.goals.length > 0 && (
          <div className="file-spec-goals">
            {file.goals.map((g) => (
              <span
                key={g.id}
                className="file-goal-chip"
                style={{ '--goal': sessionColorVar(g.color) } as CSSProperties}
              >
                <span className="spec-swatch spec-swatch--sm" style={{ background: sessionColorVar(g.color) }} />
                {g.label}
              </span>
            ))}
          </div>
        )}
        {!explained && mapping && <span className="file-spec-wait">Still placing this file…</span>}
      </header>

      <div className="file-spec-body">
        <div>
          <p className="file-spec-label">What this file does</p>
          {explained ? (
            <p className="file-spec-text">{file.spec}</p>
          ) : (
            <div className="file-spec-skel" aria-hidden>
              <span />
              <span />
            </div>
          )}
        </div>

        {explained && hasConnect && (
          <div className="file-ai">
            <div className="file-ai-head">
              <span className="file-ai-mark">AI</span>
              <span>How this connects to the PR</span>
              <button className="file-ai-toggle" onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Hide' : 'Show'}
              </button>
            </div>
            {expanded && (
              <div className="file-ai-body">
                {file.connects && <p>{file.connects}</p>}
                {file.behaviorChange && (
                  <div className="file-ai-row">
                    <span>What changed</span>
                    <p>{file.behaviorChange}</p>
                  </div>
                )}
                {file.deps.length > 0 && (
                  <div className="file-ai-row">
                    <span>Touches</span>
                    <div className="file-deps">
                      {file.deps.map((d) => (
                        <div key={d.id} className="file-dep">
                          <code>{fileName(d.path)}</code>
                          <span>{d.note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showDiff && (
          <div className="file-diff">
            {file.hunk && <div className="file-diff-hunk">{file.hunk}</div>}
            {lines.length === 0 ? (
              <pre className="file-diff-raw">{file.patch}</pre>
            ) : (
              lines.map((line, i) => <DiffRow key={i} line={line} />)
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  return (
    <div className={`file-diff-row file-diff-row--${line.kind}`}>
      <span className="file-diff-n">{line.oldNo ?? ''}</span>
      <span className="file-diff-n">{line.newNo ?? ''}</span>
      <span className="file-diff-sign">{line.sign}</span>
      <span className="file-diff-text">{line.text}</span>
    </div>
  );
}
