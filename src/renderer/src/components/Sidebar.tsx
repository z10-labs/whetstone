import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { AgentRun, RunMode, SessionWithRuns } from '@shared/models';
import { NewRunMenu } from './NewRunMenu';
import { BrainIcon, ExplainIcon, SessionsIcon } from './icons';
import { relativeTime, sessionColorVar, statusColorVar } from '../lib/ui';

export type AppView = 'sessions' | 'brain' | 'explain-pr';

interface Props {
  view: AppView;
  onChangeView: (view: AppView) => void;
  sessions: SessionWithRuns[];
  selectedRunId: string | null;
  selectedSessionId: string | null;
  onSelectRun: (run: AgentRun) => void;
  onSelectSession: (id: string) => void;
  onCreateSession: (name: string) => void;
  onCreateRun: (sessionId: string, mode: RunMode) => void;
}

/**
 * The one navigation column, laid out like Claude Code's: the tools up top,
 * then every Session with its runs beneath. Selecting a run is the primary
 * action — the group header is a label with an add affordance.
 */
export function Sidebar({
  view,
  onChangeView,
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

  const inSessions = view === 'sessions';

  return (
    <nav className="sidebar" aria-label="Whetstone">
      <div className="side-nav">
        <button
          className="side-new"
          onClick={() => {
            onChangeView('sessions');
            setCreating(true);
          }}
        >
          <span className="side-new-plus" aria-hidden>
            +
          </span>
          New session
        </button>
        <NavItem active={inSessions} label="Sessions" onClick={() => onChangeView('sessions')}>
          <SessionsIcon />
        </NavItem>
        <NavItem active={view === 'brain'} label="Brain" hint="⌘J" onClick={() => onChangeView('brain')}>
          <BrainIcon />
        </NavItem>
        <NavItem
          active={view === 'explain-pr'}
          label="Explain PR"
          onClick={() => onChangeView('explain-pr')}
        >
          <ExplainIcon />
        </NavItem>
      </div>

      <div className="side-section-head">
        <h2>Sessions</h2>
      </div>

      <div className="scroll side-scroll">
        {creating && (
          <input
            autoFocus
            className="session-input"
            placeholder="What is this session for?"
            aria-label="New session name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setName('');
                setCreating(false);
              }
            }}
            onBlur={commit}
          />
        )}

        {sessions.length === 0 && !creating && (
          <p className="side-empty">
            No sessions yet. A session groups the runs and terminals for one piece of work.
          </p>
        )}

        {sessions.map((session) => (
          <SessionGroup
            key={session.id}
            session={session}
            selectedRunId={inSessions ? selectedRunId : null}
            isCurrent={inSessions && session.id === selectedSessionId}
            onSelectRun={(run) => {
              onChangeView('sessions');
              onSelectRun(run);
            }}
            onSelectSession={(id) => {
              onChangeView('sessions');
              onSelectSession(id);
            }}
            onCreateRun={(id, mode) => {
              onChangeView('sessions');
              onCreateRun(id, mode);
            }}
          />
        ))}
      </div>
    </nav>
  );
}

function NavItem({
  active,
  label,
  hint,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`side-item${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span className="side-item-icon">{children}</span>
      <span className="side-item-label">{label}</span>
      {hint && <kbd className="side-kbd">{hint}</kbd>}
    </button>
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
  const running = session.runs.some((r) => r.status === 'running');
  return (
    <section
      className={`nav-group${isCurrent ? ' is-current' : ''}`}
      style={{ '--session-color': sessionColorVar(session.color) } as CSSProperties}
    >
      <div className="nav-group-head">
        <button className="nav-group-name" onClick={() => onSelectSession(session.id)}>
          {session.name}
        </button>
        {running && <span className="spark" title="A run is working" />}
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
