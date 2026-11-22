import { useEffect, useRef } from 'react';
import type { AgentRun, AskEventData, BrainEventData, MemoryEventData, RunEvent } from '@shared/models';
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
    case 'brain': {
      const d = (event.data as BrainEventData | null) ?? {
        kind: 'task',
        title: event.text ?? '',
        action: 'add' as const,
      };
      return (
        <div className="memory-chip memory-chip--brain" title="Written to your Brain">
          <span className="memory-chip-mark">✦</span>
          <span className="memory-chip-kind">{d.action === 'done' ? 'done' : d.kind}</span>
          <span className="memory-chip-title">{d.title || event.text}</span>
        </div>
      );
    }
    case 'memory': {
      const d = (event.data as MemoryEventData | null) ?? { kind: 'note', title: event.text ?? '' };
      return (
        <div className="memory-chip" title="Written to the shared session brain">
          <span className="memory-chip-mark">🧠</span>
          <span className="memory-chip-kind">{d.kind.replace('_', ' ')}</span>
          <span className="memory-chip-title">{d.title || event.text}</span>
        </div>
      );
    }
    default:
      return null;
  }
}
