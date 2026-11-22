import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BrainItem, CaptureBrainInput } from '@shared/brain';
import type { SessionBoard } from '../../state/useBrain';
import { CaptureBar } from './CaptureBar';

interface Props {
  item: BrainItem;
  board: SessionBoard;
  /** CSS colour value for the Session's swatch. */
  color: string;
  now: number;
  onRename: (title: string) => void;
  onBody: (body: string) => void;
  onClose: () => void;
  onOpenSession: () => void;
  onCapture: (input: CaptureBrainInput) => Promise<void>;
}

const BODY_HINT = 'What does done look like? A few lines at most — the fire lives in the runs.';

/**
 * One Session's mission: the goal as the title, a few lines of direction as
 * the body, the shape of what is open beneath it, and a field that captures
 * straight into the Session. Both lines edit in place; the card is the editor.
 */
export function MissionCard({
  item,
  board,
  color,
  now,
  onRename,
  onBody,
  onClose,
  onOpenSession,
  onCapture,
}: Props) {
  return (
    <article className="mission" style={{ '--session-color': color } as CSSProperties}>
      <header className="mission-head">
        <span className="mission-swatch" aria-hidden />
        <button className="mission-session" onClick={onOpenSession} title="Open this session">
          {item.sessionName ?? 'Session removed'}
        </button>
        <Shape board={board} />
        <button
          className="mission-close"
          onClick={onClose}
          title="Close this mission — the session's work is done"
        >
          Close
        </button>
      </header>

      <EditableLine
        className="mission-title"
        value={item.title}
        onSave={onRename}
        hint="Click to reword the goal"
      />
      <EditableBody value={item.body} onSave={onBody} />

      <CaptureBar
        compact
        sessionId={item.sessionId}
        defaultKind="task"
        now={now}
        onCapture={onCapture}
      />
    </article>
  );
}

/** "1 in hand · 2 outstanding · 1 watching" — only the non-zero parts. */
function Shape({ board }: { board: SessionBoard }) {
  const parts = [
    [board.doing.length, 'in hand'],
    [board.outstanding.length, 'outstanding'],
    [board.watching.length, 'watching'],
    [board.jots.length, board.jots.length === 1 ? 'jot' : 'jots'],
  ].filter(([n]) => (n as number) > 0) as [number, string][];
  return (
    <span className="mission-shape">
      {parts.length === 0
        ? 'nothing open'
        : parts.map(([n, label], i) => (
            <span key={label}>
              {i > 0 && <span className="mission-shape-sep">·</span>}
              <b>{n}</b> {label}
            </span>
          ))}
    </span>
  );
}

function EditableLine({
  className,
  value,
  onSave,
  hint,
}: {
  className: string;
  value: string;
  onSave: (next: string) => void;
  hint: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  // Enter commits and unmounts the input, which fires blur — guard the second call.
  const committed = useRef(false);

  useEffect(() => {
    if (editing) {
      committed.current = false;
      ref.current?.select();
    }
  }, [editing]);

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={ref}
        className={`${className} is-editing`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      className={className}
      title={hint}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value}
    </button>
  );
}

function EditableBody({ value, onSave }: { value: string; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    if (editing) {
      committed.current = false;
      ref.current?.focus();
      ref.current?.setSelectionRange(draft.length, draft.length);
    }
    // Only when opening; the caret must not jump on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    const next = draft.trim();
    if (next !== value) onSave(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        className="mission-body is-editing"
        rows={Math.min(6, Math.max(2, draft.split('\n').length + 1))}
        value={draft}
        placeholder={BODY_HINT}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
        }}
      />
    );
  }
  return (
    <button
      className={`mission-body${value ? '' : ' is-empty'}`}
      title="Click to edit the direction"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value || BODY_HINT}
    </button>
  );
}
