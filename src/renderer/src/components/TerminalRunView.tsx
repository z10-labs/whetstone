import { useState } from 'react';
import type { AgentRun, RunEvent } from '@shared/models';
import { TerminalView } from './TerminalView';
import { Transcript } from './Transcript';

interface Props {
  run: AgentRun;
  events: RunEvent[];
  onAnswer: (questionId: string, answer: string) => void;
}

/**
 * The pane for a terminal run: the live Claude Code TUI, or the structured
 * transcript that Phase 2's jsonl-tail mirrors from the same session.
 */
export function TerminalRunView({ run, events, onAnswer }: Props) {
  const [view, setView] = useState<'terminal' | 'transcript'>('terminal');

  return (
    <>
      <div className="pane-tabs">
        <button
          className={view === 'terminal' ? 'is-active' : ''}
          onClick={() => setView('terminal')}
        >
          Terminal
        </button>
        <button
          className={view === 'transcript' ? 'is-active' : ''}
          onClick={() => setView('transcript')}
        >
          Transcript{events.length ? ` · ${events.length}` : ''}
        </button>
      </div>
      {view === 'terminal' ? (
        <TerminalView run={run} />
      ) : (
        <Transcript run={run} events={events} onAnswer={onAnswer} />
      )}
    </>
  );
}
