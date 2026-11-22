import type { CSSProperties } from 'react';
import type { BrainItem } from '@shared/brain';
import type { SessionMemoryEntry } from '@shared/session-memory';
import { MEMORY_KINDS, MEMORY_KIND_LABELS, MEMORY_KIND_SINGULAR } from '@shared/session-memory';
import type { MemoryKind } from '@shared/session-memory';
import { prettyPath, relativeTime } from '../lib/ui';

interface Props {
  entries: SessionMemoryEntry[];
  /** The Session's mission from the human's Brain, if one is set. */
  mission: BrainItem | null;
  /** Open Brain entries linked to this Session. */
  openCount: number;
  onSetMission: () => void;
  onOpenBrain: () => void;
}

/** Session accent color per memory kind, for the card swatch. */
const KIND_COLOR: Record<MemoryKind, string> = {
  decision: 'violet',
  open_question: 'amber',
  next_step: 'cyan',
  artifact: 'emerald',
  note: 'slate',
};

/** The Session tab of the Memory panel: its mission and shared memory. */
export function SessionBrain({ entries, mission, openCount, onSetMission, onOpenBrain }: Props) {
  const active = entries.filter((e) => e.status !== 'superseded');
  const superseded = entries.filter((e) => e.status === 'superseded');

  const byKind = new Map<MemoryKind, SessionMemoryEntry[]>();
  for (const entry of active) {
    const list = byKind.get(entry.kind) ?? [];
    list.push(entry);
    byKind.set(entry.kind, list);
  }

  return (
    <div className="brain">
      <div className="scroll brain-scroll">
        <section className="mission-strip" aria-label="Session mission">
          <span className="mission-strip-label">Mission</span>
          {mission ? (
            <>
              <p className="mission-strip-title">{mission.title}</p>
              {mission.body && <p className="mission-strip-body">{mission.body}</p>}
              <p className="mission-strip-meta">
                {openCount === 0 ? 'nothing open' : `${openCount} open`}
                <button className="mission-strip-link" onClick={onOpenBrain}>
                  edit in Brain
                </button>
              </p>
            </>
          ) : (
            <button className="mission-strip-set" onClick={onSetMission}>
              Set a mission for this session
            </button>
          )}
        </section>

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
    </div>
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
      {entry.body && <p className="brain-card-body">{entry.body}</p>}
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
