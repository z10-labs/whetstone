import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { AgentRun, RunMode, SessionWithRuns } from '@shared/models';
import { prettyPath, statusColorVar, statusLabel } from '../lib/ui';

interface Props {
  session: SessionWithRuns | null;
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  onNewRun: (mode: RunMode) => void;
}

export function RunColumn({ session, selectedRunId, onSelectRun, onNewRun }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session) {
    return (
      <section className="col col--runs">
        <div className="col-head">
          <h2>Runs</h2>
        </div>
        <div className="empty">
          <div className="mark">◈</div>
          <h3>No session selected</h3>
          <p>Pick a session on the left, or create one, to see its agent runs.</p>
        </div>
      </section>
    );
  }

  function choose(mode: RunMode) {
    setMenuOpen(false);
    onNewRun(mode);
  }

  return (
    <section className="col col--runs">
      <div className="col-head">
        <h2>{session.name} · Runs</h2>
        <div className="new-run">
          <button className="icon-btn" onClick={() => setMenuOpen((v) => !v)} title="New run">
            +
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <button className="menu-item" onClick={() => choose('sdk')}>
                <span className="menu-title">Structured run</span>
                <span className="menu-sub">SDK · streamed events · can ask you</span>
              </button>
              <button className="menu-item" onClick={() => choose('terminal')}>
                <span className="menu-title">Terminal run</span>
                <span className="menu-sub">Live Claude Code CLI in a PTY</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="scroll">
        {session.runs.length === 0 && (
          <div className="empty" style={{ paddingTop: 'var(--sp-6)' }}>
            <div className="mark">▷</div>
            <p>No runs yet. Start one two ways — structured (SDK) or a live terminal.</p>
            <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
              <button className="btn btn--primary" onClick={() => choose('sdk')}>
                Structured
              </button>
              <button className="btn" onClick={() => choose('terminal')}>
                Terminal
              </button>
            </div>
          </div>
        )}
        {session.runs.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            active={run.id === selectedRunId}
            onClick={() => onSelectRun(run.id)}
          />
        ))}
      </div>
    </section>
  );
}

function RunCard({ run, active, onClick }: { run: AgentRun; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`run-card${active ? ' is-active' : ''}`}
      style={
        {
          width: '100%',
          textAlign: 'left',
          '--status-color': statusColorVar(run.status),
        } as CSSProperties
      }
      onClick={onClick}
    >
      <div className="title">{run.title}</div>
      <div className="cwd" title={run.cwd}>
        {prettyPath(run.cwd)}
      </div>
      <div className="row">
        <span className={`badge badge--${run.mode}`}>{run.mode === 'terminal' ? 'terminal' : 'sdk'}</span>
        <span className="badge">
          <span className="dot" />
          {statusLabel(run.status)}
        </span>
        <span className="badge badge--count">{run.messageCount} msg</span>
      </div>
    </button>
  );
}
