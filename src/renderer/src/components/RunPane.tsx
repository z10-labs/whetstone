import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { AgentRun, RunEvent } from '@shared/models';
import type { BrainItem } from '@shared/brain';
import { TerminalView } from './TerminalView';
import { Transcript } from './Transcript';
import { PromptBar } from './PromptBar';
import { prettyPath, statusColorVar, statusLabel } from '../lib/ui';

interface Props {
  run: AgentRun | null;
  events: RunEvent[];
  /** The selected Session's name, for the no-run state. */
  sessionName: string | null;
  /** The selected Session's mission, so an empty Session still shows its why. */
  mission: BrainItem | null;
  brainOpen: boolean;
  brainCount: number;
  onToggleBrain: () => void;
  onAnswer: (questionId: string, answer: string) => void;
  onSend: (prompt: string) => void;
  onCancel: () => void;
}

type Tab = 'terminal' | 'transcript';

/**
 * The working pane: a compact tab bar over the run's content. Terminal runs
 * get two tabs (the live TUI and the mirrored transcript); structured runs
 * have one view, so the bar carries only the run's identity and controls.
 */
export function RunPane({
  run,
  events,
  sessionName,
  mission,
  brainOpen,
  brainCount,
  onToggleBrain,
  onAnswer,
  onSend,
  onCancel,
}: Props) {
  const [tab, setTab] = useState<Tab>('terminal');

  const brainToggle = (
    <button
      className={`brain-toggle${brainOpen ? ' is-active' : ''}`}
      onClick={onToggleBrain}
      title="Session brain — mission and shared memory across runs"
      aria-pressed={brainOpen}
    >
      Brain
      {brainCount > 0 && <span className="brain-toggle-count">{brainCount}</span>}
    </button>
  );

  // No run yet: the Session's mission is still the thing to look at, and the
  // panel must stay reachable so a mission can be set before the first run.
  if (!run) {
    return (
      <main className="col col--main">
        {sessionName && (
          <div className="pane-bar">
            <div className="pane-tabs">
              <button className="is-active">{sessionName}</button>
            </div>
            <div className="pane-bar-meta">{brainToggle}</div>
          </div>
        )}
        <div className="empty">
          <div className="mark">✦</div>
          {mission ? (
            <>
              <h3>{mission.title}</h3>
              {mission.body && <p className="empty-mission-body">{mission.body}</p>}
              <p>No runs yet. Start one to put an agent on it.</p>
            </>
          ) : (
            <>
              <h3>{sessionName ? 'No runs yet' : 'No run selected'}</h3>
              <p>
                {sessionName
                  ? 'Start a run to put an agent on this session.'
                  : 'Pick a run in the sidebar, or start a new one, to watch the agent work.'}
              </p>
            </>
          )}
        </div>
      </main>
    );
  }

  const isTerminal = run.mode === 'terminal';
  const showTerminal = isTerminal && tab === 'terminal';

  return (
    <main className="col col--main">
      <div className="pane-bar">
        {isTerminal ? (
          <div className="pane-tabs">
            <button className={tab === 'terminal' ? 'is-active' : ''} onClick={() => setTab('terminal')}>
              Terminal
            </button>
            <button
              className={tab === 'transcript' ? 'is-active' : ''}
              onClick={() => setTab('transcript')}
            >
              Transcript
              {events.length > 0 && <span className="tab-count">{events.length}</span>}
            </button>
          </div>
        ) : (
          <div className="pane-tabs">
            <button className="is-active">Transcript</button>
          </div>
        )}

        <div className="pane-bar-meta">
          <span
            className="badge"
            style={{ '--status-color': statusColorVar(run.status) } as CSSProperties}
          >
            {run.status === 'running' ? <span className="spark" /> : <span className="dot" />}
            {statusLabel(run.status)}
          </span>
          <span className="path" title={run.cwd}>
            {prettyPath(run.cwd)}
          </span>
          {brainToggle}
        </div>
      </div>

      {showTerminal ? (
        <TerminalView run={run} />
      ) : (
        <>
          <Transcript run={run} events={events} onAnswer={onAnswer} />
          {!isTerminal && <PromptBar run={run} onSend={onSend} onCancel={onCancel} />}
        </>
      )}
    </main>
  );
}
