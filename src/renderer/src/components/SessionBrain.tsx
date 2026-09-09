import type { CSSProperties } from 'react';
import type { SessionMemoryEntry } from '@shared/session-memory';
import { MEMORY_KINDS, MEMORY_KIND_LABELS, MEMORY_KIND_SINGULAR } from '@shared/session-memory';
import type { MemoryKind } from '@shared/session-memory';
import { prettyPath, relativeTime } from '../lib/ui';

interface Props {
  sessionName: string | null;
  entries: SessionMemoryEntry[];
  onClose: () => void;
}

/** Session accent color per memory kind, for the card swatch. */
const KIND_COLOR: Record<MemoryKind, string> = {
  decision: 'violet',
  open_question: 'amber',
  next_step: 'cyan',
  artifact: 'emerald',
  note: 'slate',
};

export function SessionBrain({ sessionName, entries, onClose }: Props) {
  const active = entries.filter((e) => e.status !== 'superseded');
  const superseded = entries.filter((e) => e.status === 'superseded');

  const byKind = new Map<MemoryKind, SessionMemoryEntry[]>();
  for (const entry of active) {
    const list = byKind.get(entry.kind) ?? [];
    list.push(entry);
    byKind.set(entry.kind, list);
  }

  return (
    <aside className="col col--brain brain">
      <div className="col-head">
        <h2>{sessionName ? `${sessionName} · Brain` : 'Session brain'}</h2>
        <button className="icon-btn" onClick={onClose} title="Close brain" aria-label="Close brain">
          ×
        </button>
      </div>

      <div className="scroll brain-scroll">
        {active.length === 0 ? (
          <div className="empty" style={{ paddingTop: 'var(--sp-6)' }}>
            <div className="mark">🧠</div>
            <h3>No shared memory yet</h3>
            <p>
              As agents work in this session they record decisions, artifacts, and open
              questions here with the <code>remember</code> tool — the shared source of truth
              every run is launched with.
            </p>
          </div>
        ) : (
          MEMORY_KINDS.map((kind) => {
            const list = byKind.get(kind);
            if (!list || list.length === 0) return null;
            return (
              <section key={kind} className="brain-group">
                <h3 className="brain-group-head">
                  {MEMORY_KIND_LABELS[kind]}
                  <span className="brain-group-count">{list.length}</span>
                </h3>
                {list.map((entry) => (
                  <MemoryCard key={entry.id} entry={entry} />
                ))}
              </section>
            );
          })
        )}

        {superseded.length > 0 && (
          <details className="brain-superseded">
            <summary>{superseded.length} superseded</summary>
            {superseded.map((entry) => (
              <MemoryCard key={entry.id} entry={entry} superseded />
            ))}
          </details>
        )}
      </div>
    </aside>
  );
}

function MemoryCard({
  entry,
  superseded = false,
}: {
  entry: SessionMemoryEntry;
  superseded?: boolean;
}) {
  const color = KIND_COLOR[entry.kind];
  return (
    <article
      className={`brain-card${superseded ? ' is-superseded' : ''}`}
      style={{ '--kind': `var(--c-${color})` } as CSSProperties}
    >
      <div className="brain-card-head">
        <span className="brain-kind">{MEMORY_KIND_SINGULAR[entry.kind]}</span>
        {entry.status === 'resolved' && <span className="brain-status">resolved</span>}
        <span className="brain-time">{relativeTime(entry.createdAt)}</span>
      </div>
      <p className="brain-title">{entry.title}</p>
      {entry.body && <p className="brain-body">{entry.body}</p>}
      {(entry.tags.length > 0 || entry.cwd) && (
        <div className="brain-meta">
          {entry.cwd && <span className="brain-cwd">{prettyPath(entry.cwd)}</span>}
          {entry.tags.map((tag) => (
            <span key={tag} className="brain-tag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
