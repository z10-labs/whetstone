import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { AgentRun, RunEvent, RunMode } from '@shared/models';
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
  onCreateRun: (mode: RunMode) => void;
  onAnswer: (questionId: string, answer: string) => void;
  onSend: (prompt: string) => void;
  onCancel: () => void;
  onOpenCard?: (cardId: string) => void;
}

type View = 'terminal' | 'transcript';

/**
 * The center of the workbench: the run's identity on one line, then the run
 * itself. A Claude Code terminal run can be watched live or read as its
 * mirrored transcript; a structured run is always a conversation.
 */
export function RunPane({
  run,
  events,
  sessionName,
  mission,
  onCreateRun,
  onAnswer,
  onSend,
  onCancel,
  onOpenCard,
}: Props) {
  const [view, setView] = useState<View>('terminal');

  if (!run) {
    return (
      <main className="run-pane">
        <div className="empty run-empty">
          {sessionName ? (
            <>
              {mission && mission.title !== sessionName && (
                <p className="run-empty-kicker">{sessionName}</p>
              )}
              <h3>{mission?.title ?? 'No runs yet'}</h3>
              {mission?.body && <p className="empty-mission-body">{mission.body}</p>}
              <div className="run-empty-actions">
                <button className="btn btn--primary" onClick={() => onCreateRun('terminal')}>
                  Claude Code terminal
                </button>
                <button className="btn" onClick={() => onCreateRun('sdk')}>
                  Structured run
                </button>
              </div>
              <p>
                Pick a folder and put an agent on it. Shells and dev servers go in the terminal
                dock (⌃`).
              </p>
            </>
          ) : (
            <>
              <h3>Nothing open</h3>
              <p>Pick a run in the sidebar, or start a session to group a piece of work.</p>
            </>
          )}
        </div>
      </main>
    );
  }

  const isTerminal = run.mode === 'terminal';
  const showTerminal = isTerminal && view === 'terminal';

  return (
    <main className="run-pane">
      <header className="run-head">
        <div className="run-id">
          <h1 title={run.title}>{run.title}</h1>
          <div className="run-meta">
            <span
              className="badge"
              style={{ '--status-color': statusColorVar(run.status) } as CSSProperties}
            >
              {run.status === 'running' ? <span className="spark" /> : <span className="dot" />}
              {statusLabel(run.status)}
            </span>
            <span className="run-chip">{isTerminal ? 'Claude Code' : 'SDK'}</span>
            <span className="path" title={run.cwd}>
              {prettyPath(run.cwd)}
            </span>
            {run.model && <span className="path">{run.model}</span>}
          </div>
        </div>
        {isTerminal && (
          <div className="segmented" role="tablist" aria-label="Run view">
            <button
              role="tab"
              aria-selected={view === 'terminal'}
              className={view === 'terminal' ? 'is-active' : ''}
              onClick={() => setView('terminal')}
            >
              Live
            </button>
            <button
              role="tab"
              aria-selected={view === 'transcript'}
              className={view === 'transcript' ? 'is-active' : ''}
              onClick={() => setView('transcript')}
            >
              Transcript
              {events.length > 0 && <span className="tab-count">{events.length}</span>}
            </button>
          </div>
        )}
      </header>

      {/* The live terminal stays mounted while reading the transcript, so
          flipping between them never replays or loses the TUI. */}
      {isTerminal && (
        <div className="run-terminal" hidden={!showTerminal}>
          <TerminalView
            terminalId={run.id}
            visible={showTerminal}
            exitNote={(code) => `— claude session exited (${code}) —`}
          />
        </div>
      )}
      {!showTerminal && (
        <>
          <Transcript run={run} events={events} onAnswer={onAnswer} onOpenCard={onOpenCard} />
          {!isTerminal && <PromptBar run={run} onSend={onSend} onCancel={onCancel} />}
        </>
      )}
    </main>
  );
}
