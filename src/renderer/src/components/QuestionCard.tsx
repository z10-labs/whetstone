import { useState } from 'react';
import type { AskEventData } from '@shared/models';

interface Props {
  data: AskEventData;
  /** The answer text if this question has already been answered. */
  answer?: string;
  onAnswer: (questionId: string, answer: string) => void;
}

export function QuestionCard({ data, answer, onAnswer }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [other, setOther] = useState('');
  const answered = answer !== undefined;

  function submit(text: string) {
    if (answered || !text.trim()) return;
    onAnswer(data.questionId, text.trim());
  }

  function toggle(label: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  return (
    <div className={`event event--ask${answered ? ' is-answered' : ''}`}>
      <div className="who">
        <span className="ask-glyph">?</span> Claude is asking
      </div>
      <div className="ask-card">
        <div className="ask-question">{data.question}</div>

        {answered ? (
          <div className="ask-answered">
            <span className="ask-answered-label">Your answer</span>
            <span className="ask-answered-text">{answer}</span>
          </div>
        ) : (
          <>
            {data.options && data.options.length > 0 && (
              <div className="ask-options">
                {data.options.map((opt) =>
                  data.multiSelect ? (
                    <label
                      key={opt.label}
                      className={`ask-option${picked.has(opt.label) ? ' is-picked' : ''}`}
                      title={opt.preview}
                    >
                      <input
                        type="checkbox"
                        checked={picked.has(opt.label)}
                        onChange={() => toggle(opt.label)}
                      />
                      <span>
                        <span className="ask-option-label">{opt.label}</span>
                        {opt.description && (
                          <span className="ask-option-desc">{opt.description}</span>
                        )}
                      </span>
                    </label>
                  ) : (
                    <button
                      key={opt.label}
                      className="ask-option"
                      title={opt.preview}
                      onClick={() => submit(opt.label)}
                    >
                      <span className="ask-option-label">{opt.label}</span>
                      {opt.description && (
                        <span className="ask-option-desc">{opt.description}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}

            {data.multiSelect && data.options && (
              <button
                className="btn btn--primary ask-submit"
                disabled={picked.size === 0}
                onClick={() => submit([...picked].join(', '))}
              >
                Submit {picked.size > 0 ? `(${picked.size})` : ''}
              </button>
            )}

            <div className="ask-other">
              <input
                className="ask-other-input"
                placeholder="Or type your own answer…"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit(other);
                }}
              />
              <button className="btn" disabled={!other.trim()} onClick={() => submit(other)}>
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
