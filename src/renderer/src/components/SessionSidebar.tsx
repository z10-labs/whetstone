import { useState } from 'react';
import type { Session } from '@shared/models';
import { relativeTime, sessionColorVar } from '../lib/ui';

interface Props {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}

export function SessionSidebar({ sessions, selectedId, onSelect, onCreate }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  function commit() {
    const trimmed = name.trim();
    if (trimmed) onCreate(trimmed);
    setName('');
    setCreating(false);
  }

  return (
    <nav className="col col--sessions" aria-label="Sessions">
      <div className="titlestrip">
        <span className="brand">
          Whet<b>stone</b>
        </span>
      </div>
      <div className="col-head">
        <h2>Sessions</h2>
        <button className="icon-btn" onClick={() => setCreating((v) => !v)} title="New session">
          +
        </button>
      </div>

      <div className="scroll">
        {creating && (
          <input
            autoFocus
            className="session-input"
            placeholder="Session name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setCreating(false);
            }}
            onBlur={commit}
            style={{
              width: '100%',
              background: 'var(--bg-inset)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-hi)',
              padding: 'var(--sp-3)',
              marginBottom: 'var(--sp-3)',
              outline: 'none',
              fontFamily: 'inherit',
              fontSize: 'var(--text-base)',
            }}
          />
        )}

        {sessions.length === 0 && !creating && (
          <div className="empty" style={{ paddingTop: 'var(--sp-6)' }}>
            <div className="mark">◇</div>
            <p>No sessions yet. Create one to group your agent runs.</p>
          </div>
        )}

        {sessions.map((s) => (
          <button
            key={s.id}
            className={`session-row${s.id === selectedId ? ' is-active' : ''}`}
            style={{ width: '100%', textAlign: 'left', background: 'none' }}
            onClick={() => onSelect(s.id)}
          >
            <span className="dot" style={{ background: sessionColorVar(s.color), color: sessionColorVar(s.color) }} />
            <span className="meta">
              <div className="name">{s.name}</div>
              <div className="sub">{relativeTime(s.updatedAt)}</div>
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
