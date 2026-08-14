import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { AgentRun, RunEvent } from '@shared/models';
import { prettyPath, statusColorVar, statusLabel } from '../lib/ui';

interface Props {
  run: AgentRun | null;
  events: RunEvent[];
}

export function Transcript({ run, events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

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
        {events.map((ev) => (
          <EventView key={ev.id} event={ev} />
        ))}
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
    case 'result':
      return (
        <div className="event event--result">
          <div className="who">Result</div>
          <div className="bubble">{event.text || 'Run finished.'}</div>
        </div>
      );
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
