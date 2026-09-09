import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { AgentRun, RunMode, SessionWithRuns } from '@shared/models';
import { NewRunMenu } from './NewRunMenu';
import { relativeTime, sessionColorVar, statusColorVar } from '../lib/ui';

interface Props {
  sessions: SessionWithRuns[];
  selectedRunId: string | null;
  selectedSessionId: string | null;
  onSelectRun: (run: AgentRun) => void;
  onSelectSession: (id: string) => void;
  onCreateSession: (name: string) => void;
  onCreateRun: (sessionId: string, mode: RunMode) => void;
}

/**
 * One navigation column: sessions are groups, their runs are the rows beneath.
 * Selecting a run is the primary action — the group header is a label with an
 * add affordance, not a destination in its own right.
 */
export function Sidebar({
  sessions,
  selectedRunId,
  selectedSessionId,
  onSelectRun,
  onSelectSession,
  onCreateSession,
  onCreateRun,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  function commit() {
    const trimmed = name.trim();
    if (trimmed) onCreateSession(trimmed);
    setName('');
    setCreating(false);
  }

  return (
    <nav className="col col--sidebar" aria-label="Sessions and runs">
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
          />
        )}

        {sessions.length === 0 && !creating && (
          <div className="empty" style={{ paddingTop: 'var(--sp-6)' }}>
            <div className="mark">◇</div>
            <p>No sessions yet. Create one to group your agent runs.</p>
          </div>
        )}

        {sessions.map((session) => (
          <SessionGroup
            key={session.id}
            session={session}
            selectedRunId={selectedRunId}
            isCurrent={session.id === selectedSessionId}
            onSelectRun={onSelectRun}
            onSelectSession={onSelectSession}
            onCreateRun={onCreateRun}
          />
        ))}
      </div>
    </nav>
  );
}

interface GroupProps {
  session: SessionWithRuns;
  selectedRunId: string | null;
  isCurrent: boolean;
  onSelectRun: (run: AgentRun) => void;
  onSelectSession: (id: string) => void;
  onCreateRun: (sessionId: string, mode: RunMode) => void;
}

function SessionGroup({
  session,
  selectedRunId,
  isCurrent,
  onSelectRun,
  onSelectSession,
  onCreateRun,
}: GroupProps) {
  return (
    <section
      className={`nav-group${isCurrent ? ' is-current' : ''}`}
      style={{ '--session-color': sessionColorVar(session.color) } as CSSProperties}
    >
      <div className="nav-group-head">
        <button className="nav-group-name" onClick={() => onSelectSession(session.id)}>
          {session.name}
        </button>
        <NewRunMenu onPick={(mode) => onCreateRun(session.id, mode)} />
      </div>

      {/* Runs hang off a rail in the session's color — the indent is what
          separates the two levels, so runs never look like sessions. */}
      <div className="nav-runs">
        {session.runs.length === 0 ? (
          <p className="nav-empty">No runs yet</p>
        ) : (
          session.runs.map((run) => (
            <button
              key={run.id}
              className={`nav-run${run.id === selectedRunId ? ' is-active' : ''}`}
              onClick={() => onSelectRun(run)}
              title={run.title}
            >
              <span className="dot" style={{ background: statusColorVar(run.status) }} />
              <span className="label">{run.title}</span>
              <span className="when">{relativeTime(run.updatedAt)}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
