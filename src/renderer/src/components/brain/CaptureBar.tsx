import { useEffect, useRef, useState } from 'react';
import type { BrainKind, CaptureBrainInput } from '@shared/brain';
import { QUICK_WHENS, formatDue, fromLocalInputValue, toLocalInputValue } from './when';

interface Props {
  onCapture: (input: CaptureBrainInput) => Promise<void>;
}

const KINDS: { kind: BrainKind; label: string; hint: string }[] = [
  { kind: 'jot', label: 'Jot', hint: 'Something to keep — one line' },
  { kind: 'task', label: 'Task', hint: 'Something to do' },
  { kind: 'reminder', label: 'Reminder', hint: 'Something to surface at a time' },
];

/**
 * Capture has to be faster than the thought, or the brain goes unused: one
 * field, always ready, Enter commits. The mode switch lives inside the field
 * so choosing a kind never costs a trip to another control, and a reminder's
 * time is four one-tap chips before it is ever a date picker.
 */
export function CaptureBar({ onCapture }: Props) {
  const [kind, setKind] = useState<BrainKind>('jot');
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reminders are the only kind that must carry a time; default it so a bare
  // Enter still produces something that fires.
  useEffect(() => {
    if (kind === 'reminder' && dueAt === null) setDueAt(QUICK_WHENS[0].at(Date.now()));
    if (kind === 'jot') {
      setDueAt(null);
      setShowPicker(false);
    }
  }, [kind, dueAt]);

  const submit = async () => {
    const text = title.trim();
    if (!text) return;
    try {
      await onCapture({ kind, title: text, dueAt });
      setTitle('');
      setError(null);
      if (kind === 'reminder') setDueAt(QUICK_WHENS[0].at(Date.now()));
      else setDueAt(null);
      setShowPicker(false);
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const active = KINDS.find((k) => k.kind === kind);

  return (
    <div className="capture">
      <div className="capture-field">
        <div className="capture-modes" role="group" aria-label="What are you capturing?">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              className={`capture-mode${kind === k.kind ? ' is-on' : ''}`}
              onClick={() => setKind(k.kind)}
              aria-pressed={kind === k.kind}
            >
              {k.label}
            </button>
          ))}
        </div>

        <input
          ref={inputRef}
          className="capture-input"
          value={title}
          placeholder={active?.hint}
          aria-label={active?.hint}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />

        <button className="btn btn--primary capture-go" onClick={() => void submit()} disabled={!title.trim()}>
          Capture
        </button>
      </div>

      {kind !== 'jot' && (
        <div className="capture-when">
          <span className="capture-when-label">
            {kind === 'reminder' ? 'Surface it' : 'Due'}
          </span>
          {QUICK_WHENS.map((quick) => {
            const at = quick.at(Date.now());
            const on = dueAt !== null && Math.abs(dueAt - at) < 60_000;
            return (
              <button
                key={quick.label}
                className={`when-chip${on ? ' is-on' : ''}`}
                onClick={() => {
                  setDueAt(at);
                  setShowPicker(false);
                }}
              >
                {quick.label}
              </button>
            );
          })}
          <button
            className={`when-chip${showPicker ? ' is-on' : ''}`}
            onClick={() => setShowPicker((v) => !v)}
            aria-expanded={showPicker}
          >
            Pick…
          </button>
          {kind === 'task' && dueAt !== null && (
            <button className="when-chip when-chip--clear" onClick={() => setDueAt(null)}>
              No time
            </button>
          )}
          {showPicker && (
            <input
              type="datetime-local"
              className="when-picker"
              value={dueAt === null ? '' : toLocalInputValue(dueAt)}
              onChange={(e) => setDueAt(fromLocalInputValue(e.target.value))}
            />
          )}
          {dueAt !== null && !showPicker && (
            <span className="capture-when-echo">{formatDue(dueAt)}</span>
          )}
        </div>
      )}

      {error && <p className="capture-error">{error}</p>}
    </div>
  );
}
