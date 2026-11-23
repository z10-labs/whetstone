import type { Block, LiveCard } from '@shared/cards';

type Actions = Extract<Block, { kind: 'actions' }>;

interface Props {
  block: Actions;
  card: LiveCard;
  blockIndex: number;
  orphan: boolean;
  onAction: (input: { cardId: string; blockIndex: number; value: string }) => void;
}

export function ActionsBlock({ block, card, blockIndex, orphan, onAction }: Props) {
  return (
    <div className="live-actions">
      {block.items.map((item) => {
        if ('open' in item) {
          return (
            <a
              key={item.label}
              className="btn live-action-btn"
              href={item.open}
              target="_blank"
              rel="noreferrer"
            >
              {item.label}
            </a>
          );
        }
        const danger = Boolean(item.danger);
        return (
          <button
            key={item.label}
            type="button"
            className={`btn live-action-btn${danger ? ' live-action-btn--danger' : ''}`}
            disabled={orphan}
            title={orphan ? 'No session to send to' : undefined}
            onClick={() => onAction({ cardId: card.id, blockIndex, value: item.label })}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
