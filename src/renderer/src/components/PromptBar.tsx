import { useState } from 'react';
import type { AgentRun } from '@shared/models';

interface Props {
  run: AgentRun | null;
  onSend: (prompt: string) => void;
  onCancel: () => void;
}

export function PromptBar({ run, onSend, onCancel }: Props) {
  const [value, setValue] = useState('');
  if (!run) return null;

  const running = run.status === 'running';
  const isFirst = run.messageCount === 0;

  function send() {
    const text = value.trim();
    if (!text || running) return;
    onSend(text);
    setValue('');
  }

  return (
    <div className="promptbar">
      <div className="field">
        <textarea
          rows={1}
          value={value}
          disabled={running}
          placeholder={
            running
              ? 'Agent is working…'
              : isFirst
                ? 'Give the agent its first instruction… (full access in this directory)'
                : 'Continue this run…'
          }
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        {running ? (
          <button className="btn btn--danger" onClick={onCancel}>
            Stop
          </button>
        ) : (
          <button className="btn btn--primary" onClick={send} disabled={!value.trim()}>
            {isFirst ? 'Start' : 'Send'} ⌘↵
          </button>
        )}
      </div>
    </div>
  );
}
