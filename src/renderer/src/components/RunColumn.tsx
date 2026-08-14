import type { CSSProperties } from 'react';
import type { AgentRun, SessionWithRuns } from '@shared/models';
import { prettyPath, statusColorVar, statusLabel } from '../lib/ui';

interface Props {
  session: SessionWithRuns | null;
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  onNewRun: () => void;
}

export function RunColumn({ session, selectedRunId, onSelectRun, onNewRun }: Props) {
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

  return (
    <section className="col col--runs">
      <div className="col-head">
        <h2>{session.name} · Runs</h2>
        <button className="icon-btn" onClick={onNewRun} title="New run">
          +
        </button>
      </div>
      <div className="scroll">
        {session.runs.length === 0 && (
          <div className="empty" style={{ paddingTop: 'var(--sp-6)' }}>
            <div className="mark">▷</div>
            <p>No runs yet. Start one — choose a directory and give the agent a prompt.</p>
            <button className="btn btn--primary" onClick={onNewRun} style={{ marginTop: 'var(--sp-2)' }}>
              New run
            </button>
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
        <span className="badge">
          <span className="dot" />
          {statusLabel(run.status)}
        </span>
        <span className="badge">{run.provider}</span>
        <span className="badge badge--count">{run.messageCount} msg</span>
      </div>
    </button>
  );
}
