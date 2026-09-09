import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BrainItem } from '@shared/brain';
import { BRAIN_STATUS_LABELS } from '@shared/brain';
import { relativeTime } from '../../lib/ui';
import { formatDue } from './when';

interface Props {
  item: BrainItem;
  now: number;
  /** Move the entry along its status ring. */
  onAdvance: (item: BrainItem) => void;
  onRename: (id: string, title: string) => void;
  onPin: (item: BrainItem) => void;
  onRemove: (id: string) => void;
  /** Extra affordances the Due band adds (snooze). */
  children?: ReactNode;
}

/**
 * One entry. The same card everywhere — its lane sets the weight through CSS,
 * so a card in hand reads louder than the same card sitting outstanding
 * without needing a second component.
 */
export function BrainCard({ item, now, onAdvance, onRename, onPin, onRemove, children }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const title = draft.trim();
    if (title && title !== item.title) onRename(item.id, title);
    else setDraft(item.title);
    setEditing(false);
  };

  const finished = item.status === 'done' || item.status === 'dropped';
  const overdue = item.dueAt !== null && !finished && item.dueAt <= now;
  // A card with nothing to footnote gets no footer at all — an empty strip of
  // reserved space is what makes a board feel padded rather than packed.
  const hasFoot =
    item.dueAt !== null || item.createdBy === 'agent' || item.kind === 'jot' || Boolean(children);

  return (
    <article
      className={`bcard bcard--${item.kind} is-${item.status}${item.pinned ? ' is-pinned' : ''}`}
    >
      <button
        className="bcard-state"
        onClick={() => onAdvance(item)}
        title={`${BRAIN_STATUS_LABELS[item.kind][item.status]} — click to advance`}
        aria-label={`${item.title}: ${BRAIN_STATUS_LABELS[item.kind][item.status]}. Advance.`}
      >
        <span className="bcard-state-mark" aria-hidden />
      </button>

      <div className="bcard-body">
        {editing ? (
          <input
            ref={inputRef}
            className="bcard-edit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(item.title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            className="bcard-title"
            onClick={() => {
              setDraft(item.title);
              setEditing(true);
            }}
            title="Click to reword"
          >
            {item.title}
          </button>
        )}

        {item.body && <p className="bcard-note">{item.body}</p>}

        {hasFoot && (
          <div className="bcard-foot">
            {item.dueAt !== null && (
              <span className={`bcard-due${overdue ? ' is-overdue' : ''}`}>
                {formatDue(item.dueAt, now)}
              </span>
            )}
            {item.kind === 'jot' && <span className="bcard-age">{relativeTime(item.createdAt)}</span>}
            {item.createdBy === 'agent' && <span className="bcard-by">agent</span>}
            {children}
          </div>
        )}
      </div>

      <div className="bcard-actions">
        <button
          className={`bcard-act${item.pinned ? ' is-on' : ''}`}
          onClick={() => onPin(item)}
          title={item.pinned ? 'Unpin' : 'Pin to the top'}
          aria-label={item.pinned ? 'Unpin' : 'Pin to the top'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M6 1v6M3.4 4.2 6 1l2.6 3.2M6 7v4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          className="bcard-act"
          onClick={() => onRemove(item.id)}
          title="Forget this"
          aria-label="Forget this"
        >
          ×
        </button>
      </div>
    </article>
  );
}
