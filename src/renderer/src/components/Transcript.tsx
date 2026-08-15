import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { AgentRun, AskEventData, RunEvent } from '@shared/models';
import { prettyPath, statusColorVar, statusLabel } from '../lib/ui';
import { QuestionCard } from './QuestionCard';

interface Props {
  run: AgentRun | null;
  events: RunEvent[];
  onAnswer: (questionId: string, answer: string) => void;
}

export function Transcript({ run, events, onAnswer }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Pair each answer to its question so answered cards render resolved.
  const answersByQuestion = new Map<string, string>();
  for (const ev of events) {
    if (ev.kind === 'answer') {
      const qid = (ev.data as { questionId?: string } | null)?.questionId;
      if (qid) answersByQuestion.set(qid, ev.text ?? '');
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events.length]);

  if (!run) {
    return (
      <div className="empty">
        <div className="mark">✦</div>
        <h3>No run selected</h3>
        <p>Select a run, or start a new one, to watch the agent work in real time.</p>
      </div>
    );
  }

  return (
    <>
      <header className="transcript-head">
        <h1>{run.title}</h1>
        <div className="subline">
          <span className="badge" style={{ '--status-color': statusColorVar(run.status) } as CSSProperties}>
            <span className="dot" />
            {run.status === 'running' ? <span className="spark" /> : null}
            {statusLabel(run.status)}
          </span>
          <span className="path">{prettyPath(run.cwd)}</span>
          {run.model && <span className="path">· {run.model}</span>}
          {run.externalId && <span className="path">· {run.externalId.slice(0, 8)}</span>}
        </div>
      </header>

      <div className="stream">
        {events.length === 0 && (
          <div className="empty" style={{ alignItems: 'flex-start', paddingTop: 0 }}>
            <p>This run is idle. Send a prompt below to start it.</p>
          </div>
        )}
        {events.map((ev) => {
          // Answers are folded into their question card.
          if (ev.kind === 'answer') return null;
          if (ev.kind === 'ask') {
            const data = ev.data as AskEventData;
            return (
              <QuestionCard
                key={ev.id}
                data={data}
                answer={answersByQuestion.get(data.questionId)}
                onAnswer={onAnswer}
              />
            );
          }
          return <EventView key={ev.id} event={ev} />;
        })}
        <div ref={bottomRef} />
      </div>
    </>
  );
}

function EventView({ event }: { event: RunEvent }) {
  switch (event.kind) {
    case 'user':
      return (
        <div className="event event--user">
          <div className="who">You</div>
          <div className="bubble">{event.text}</div>
        </div>
      );
    case 'assistant_text':
      return (
        <div className="event event--assistant">
          <div className="who">Claude</div>
          <div className="bubble">{event.text}</div>
        </div>
      );
    case 'assistant_thinking':
      return (
        <div className="event event--thinking">
          <div className="who">Thinking</div>
          <div className="bubble">{event.text}</div>
        </div>
      );
    case 'tool_use': {
      const input = (event.data as { input?: unknown })?.input;
      return (
        <div className="event event--tool">
          <div className="who">Tool call</div>
          <div className="bubble">
            <span className="tool-name">{event.toolName}</span>
            {input !== undefined && <pre>{JSON.stringify(input, null, 2)}</pre>}
          </div>
        </div>
      );
    }
    case 'tool_result':
      return (
        <div className="event event--tool">
          <div className="who">Tool result</div>
          <div className="bubble">
            <pre>{JSON.stringify((event.data as { content?: unknown })?.content ?? event.data, null, 2)}</pre>
          </div>
        </div>
      );
    case 'result': {
      // The SDK's result text duplicates the final assistant message, so we
      // render a compact completion footer with the useful metadata instead.
      const d =
        (event.data as { isError?: boolean; numTurns?: number; totalCostUsd?: number } | null) ??
        {};
      const cost = typeof d.totalCostUsd === 'number' ? `$${d.totalCostUsd.toFixed(4)}` : null;
      return (
        <div className={`result-chip${d.isError ? ' is-error' : ''}`}>
          <span className="result-mark">{d.isError ? '✕' : '✓'}</span>
          <span>{d.isError ? 'Ended with error' : 'Completed'}</span>
          {typeof d.numTurns === 'number' && (
            <span className="result-meta">{d.numTurns} turns</span>
          )}
          {cost && <span className="result-meta">{cost}</span>}
        </div>
      );
    }
    case 'error':
      return (
        <div className="event event--error">
          <div className="who">Error</div>
          <div className="bubble">{event.text}</div>
        </div>
      );
    default:
      return null;
  }
}
