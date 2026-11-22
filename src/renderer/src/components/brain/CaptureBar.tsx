import { useEffect, useMemo, useRef, useState } from 'react';
import type { BrainKind, CaptureBrainInput } from '@shared/brain';
import { parseCapture } from './parse-when';
import { QUICK_WHENS, formatDue, fromLocalInputValue, toLocalInputValue } from './when';

interface Props {
  onCapture: (input: CaptureBrainInput) => Promise<void>;
  /** Bumped by the app when the capture field should take focus (⌘J). Omit to never steal focus. */
  focusNonce?: number;
  now: number;
  /** Link everything captured here to a Session (the mission card's own field). */
  sessionId?: string | null;
  defaultKind?: BrainKind;
  /** The slimmer form that sits inside a mission card. */
  compact?: boolean;
}

const KINDS: { kind: BrainKind; label: string; hint: string }[] = [
  { kind: 'jot', label: 'Jot', hint: 'Something to keep — one line' },
  { kind: 'task', label: 'Task', hint: 'Something to do · "… tomorrow 9am"' },
  { kind: 'reminder', label: 'Reminder', hint: 'Something to surface · "… in 30m"' },
];

const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

/**
 * Capture has to be faster than the thought, or the brain goes unused: one
 * field, always ready, Enter commits. The mode switch lives inside the field
 * so choosing a kind never costs a trip to another control, a time typed in
 * plain words ("in 30m", "tomorrow at 2pm") is read straight out of the line,
 * and a reminder's time is four one-tap chips before it is ever a date picker.
 */
export function CaptureBar({
  onCapture,
  focusNonce,
  now,
  sessionId = null,
  defaultKind = 'jot',
  compact = false,
}: Props) {
  const [kind, setKind] = useState<BrainKind>(defaultKind);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusNonce !== undefined) inputRef.current?.focus();
  }, [focusNonce]);

  // Reminders are the only kind that must carry a time; default it so a bare
  // Enter still produces something that fires.
  useEffect(() => {
    if (kind === 'reminder' && dueAt === null) setDueAt(QUICK_WHENS[0].at(Date.now()));
    if (kind === 'jot') {
      setDueAt(null);
      setShowPicker(false);
    }
  }, [kind, dueAt]);

  // What the line actually says, read the way it was typed. A time in the
  // words wins over the chips; a "remind me to" wins over the mode switch.
  const parsed = useMemo(() => parseCapture(title, kind, now), [title, kind, now]);
  const effectiveKind = parsed.kind;
  const effectiveDueAt = parsed.dueAt ?? (effectiveKind === 'jot' ? null : dueAt);
  const promoted = effectiveKind !== kind;

  const submit = async () => {
    if (!parsed.title) return;
    try {
      await onCapture({ kind: effectiveKind, title: parsed.title, dueAt: effectiveDueAt, sessionId });
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
  // The full bar always offers a time for tasks; the compact one inside a
  // mission card stays one line until a time is typed or a reminder is chosen.
  const showWhen = compact
    ? kind === 'reminder' || parsed.dueAt !== null
    : kind !== 'jot' || parsed.dueAt !== null;

  return (
    <div className={`capture${compact ? ' capture--compact' : ''}`}>
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

        {promoted ? (
          <span className="capture-read" aria-live="polite">
            <b>{effectiveKind}</b>
          </span>
        ) : (
          title === '' && !compact && <kbd className="capture-kbd">{IS_MAC ? '⌘J' : 'Ctrl+J'}</kbd>
        )}

        <button
          className="btn btn--primary capture-go"
          onClick={() => void submit()}
          disabled={!parsed.title}
        >
          {compact ? 'Add' : 'Capture'}
        </button>
      </div>

      {showWhen && (
        <div className="capture-when">
          <span className="capture-when-label">
            {effectiveKind === 'reminder' ? 'Surface it' : 'Due'}
          </span>
          {QUICK_WHENS.map((quick) => {
            const at = quick.at(now);
            const on = effectiveDueAt !== null && Math.abs(effectiveDueAt - at) < 60_000;
            return (
              <button
                key={quick.label}
                className={`when-chip${on ? ' is-on' : ''}`}
                onClick={() => {
                  setDueAt(at);
                  setShowPicker(false);
                }}
                disabled={parsed.dueAt !== null}
              >
                {quick.label}
              </button>
            );
          })}
          <button
            className={`when-chip${showPicker ? ' is-on' : ''}`}
            onClick={() => setShowPicker((v) => !v)}
            aria-expanded={showPicker}
            disabled={parsed.dueAt !== null}
          >
            Pick…
          </button>
          {kind === 'task' && dueAt !== null && parsed.dueAt === null && (
            <button className="when-chip when-chip--clear" onClick={() => setDueAt(null)}>
              No time
            </button>
          )}
          {showPicker && parsed.dueAt === null && (
            <input
              type="datetime-local"
              className="when-picker"
              value={dueAt === null ? '' : toLocalInputValue(dueAt)}
              onChange={(e) => setDueAt(fromLocalInputValue(e.target.value))}
            />
          )}
          {effectiveDueAt !== null && !showPicker && (
            <span className="capture-when-echo">
              {parsed.matched ? `“${parsed.matched}” → ` : ''}
              {formatDue(effectiveDueAt, now)}
            </span>
          )}
        </div>
      )}

      {error && <p className="capture-error">{error}</p>}
    </div>
  );
}
