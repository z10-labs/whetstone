import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentRun, AskEventData, BrainEventData, MemoryEventData, RunEvent } from '@shared/models';
import type { CardEventData } from '@shared/cards';
import { QuestionCard } from './QuestionCard';
import { Markdown } from './transcript/Markdown';
import { ToolGroup } from './transcript/ToolGroup';
import { groupTranscript } from './transcript/steps';
import { CardIcon } from './icons';

interface Props {
  run: AgentRun | null;
  events: RunEvent[];
  onAnswer: (questionId: string, answer: string) => void;
  /** Open the Live tab and scroll to the card named by a transcript chip. */
  onOpenCard?: (cardId: string) => void;
}

/**
 * A run read like a conversation in Claude Code: your messages in a quiet
 * box, Claude's replies as plain prose, and the work in between folded into
 * one line per stretch of tool calls.
 */
export function Transcript({ run, events, onAnswer, onOpenCard }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => groupTranscript(events), [events]);

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

  const live = run.status === 'running';

  return (
    <div className="stream">
      {events.length === 0 && (
        <div className="empty" style={{ alignItems: 'flex-start', paddingTop: 0 }}>
          <p>This run is idle. Send a prompt below to start it.</p>
        </div>
      )}
      {items.map((item) => {
        if (item.type === 'tools') {
          return <ToolGroup key={item.id} calls={item.calls} live={live} />;
        }
        const ev = item.event;
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
        return <EventView key={ev.id} event={ev} onOpenCard={onOpenCard} />;
      })}
      {live && (
        <div className="turn-working" aria-live="polite">
          <span className="step-spinner" />
          Working…
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function Thinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`step${open ? ' is-open' : ''}`}>
      <button className="step-line" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="step-text step-text--thought">Thought</span>
        <span className="step-chevron" aria-hidden>
          ›
        </span>
      </button>
      {open && <p className="step-thought">{text}</p>}
    </div>
  );
}

function cardActionLabel(action: CardEventData['action']): string {
  switch (action) {
    case 'create':
      return 'Card created';
    case 'update':
      return 'Card updated';
    case 'close':
      return 'Card closed';
  }
}

function EventView({
  event,
  onOpenCard,
}: {
  event: RunEvent;
  onOpenCard?: (cardId: string) => void;
}) {
  switch (event.kind) {
    case 'user':
      return <div className="turn-user">{event.text}</div>;
    case 'assistant_text':
      return event.text ? <Markdown text={event.text} /> : null;
    case 'assistant_thinking':
      return event.text ? <Thinking text={event.text} /> : null;
    case 'result': {
      // The SDK's result text duplicates the final assistant message, so we
      // render a compact completion footer with the useful metadata instead.
      const d =
        (event.data as { isError?: boolean; numTurns?: number; totalCostUsd?: number } | null) ??
        {};
      const cost = typeof d.totalCostUsd === 'number' ? `$${d.totalCostUsd.toFixed(2)}` : null;
      return (
        <div className={`turn-end${d.isError ? ' is-error' : ''}`}>
          <span>{d.isError ? 'Ended with an error' : 'Done'}</span>
          {typeof d.numTurns === 'number' && <span>{d.numTurns} turns</span>}
          {cost && <span>{cost}</span>}
        </div>
      );
    }
    case 'error':
      return <p className="turn-error">{event.text}</p>;
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
    case 'card': {
      const d = (event.data as CardEventData | null) ?? {
        cardId: '',
        title: event.text ?? '',
        action: 'create' as const,
      };
      const label = `${cardActionLabel(d.action)} · ${d.title || event.text || ''}`;
      return (
        <button
          type="button"
          className="memory-chip memory-chip--card"
          title="Open in Live panel"
          disabled={!d.cardId || !onOpenCard}
          onClick={() => {
            if (d.cardId && onOpenCard) onOpenCard(d.cardId);
          }}
        >
          <span className="memory-chip-mark">
            <CardIcon />
          </span>
          <span className="memory-chip-title">{label}</span>
        </button>
      );
    }
    default:
      return null;
  }
}
