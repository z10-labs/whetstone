import { useState } from 'react';
import type { Block, LiveCard } from '@shared/cards';

type Choice = Extract<Block, { kind: 'choice' }>;

interface Props {
  block: Choice;
  card: LiveCard;
  blockIndex: number;
  orphan: boolean;
  onAction: (input: { cardId: string; blockIndex: number; value: string }) => void;
}

export function ChoiceBlock({ block, card, blockIndex, orphan, onAction }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const name = `choice-${card.id}-${blockIndex}`;

  return (
    <fieldset className="live-choice" disabled={orphan}>
      <legend>{block.prompt}</legend>
      <div className="live-choice-options">
        {block.options.map((opt) => (
          <label key={opt} className="live-choice-option">
            <input
              type="radio"
              name={name}
              value={opt}
              checked={picked === opt}
              onChange={() => setPicked(opt)}
              title={orphan ? 'No session to send to' : undefined}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--primary live-choice-send"
        disabled={orphan || !picked}
        title={orphan ? 'No session to send to' : undefined}
        onClick={() => {
          if (picked) onAction({ cardId: card.id, blockIndex, value: picked });
        }}
      >
        Send to agent
      </button>
    </fieldset>
  );
}
