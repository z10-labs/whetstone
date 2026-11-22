import { useState } from 'react';
import type { ToolCall } from './steps';
import { callDetail, describeCall, resultText, summarizeCalls } from './steps';

/** Long outputs are cut here; the full text lives in the run's events. */
const MAX_OUTPUT_LINES = 40;

function clipOutput(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= MAX_OUTPUT_LINES) return text;
  return `${lines.slice(0, MAX_OUTPUT_LINES).join('\n')}\n… ${lines.length - MAX_OUTPUT_LINES} more lines`;
}

/**
 * A stretch of tool calls as one quiet line ("Ran 3 commands ›"). Opening it
 * lists each call by what it did; opening a call shows its input and output.
 */
export function ToolGroup({ calls, live }: { calls: ToolCall[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const pending = live && calls.some((c) => !c.result);
  const single = calls.length === 1;

  return (
    <div className={`step${open ? ' is-open' : ''}`}>
      <button className="step-line" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {pending && <span className="step-spinner" aria-label="Working" />}
        <span className="step-text">{summarizeCalls(calls)}</span>
        <span className="step-chevron" aria-hidden>
          ›
        </span>
      </button>
      {open &&
        (single ? (
          <CallBody call={calls[0]} />
        ) : (
          <ul className="step-calls">
            {calls.map((call) => (
              <CallRow key={call.use.id} call={call} />
            ))}
          </ul>
        ))}
    </div>
  );
}

function CallRow({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`step-call${open ? ' is-open' : ''}`}>
      <button className="step-line step-line--sub" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="step-text">{describeCall(call.use)}</span>
        <span className="step-chevron" aria-hidden>
          ›
        </span>
      </button>
      {open && <CallBody call={call} />}
    </li>
  );
}

function CallBody({ call }: { call: ToolCall }) {
  const detail = callDetail(call.use);
  const output = resultText(call.result).trim();
  return (
    <div className="step-body">
      <div className="step-tool">{call.use.toolName}</div>
      {detail && <pre className="step-in">{detail}</pre>}
      {call.result ? (
        output && <pre className="step-out">{clipOutput(output)}</pre>
      ) : (
        <p className="step-waiting">No output yet</p>
      )}
    </div>
  );
}
