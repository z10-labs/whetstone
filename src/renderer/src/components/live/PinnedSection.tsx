import { useState } from 'react';
import type { LiveCard } from '@shared/cards';
import type { CardActionInput } from '@shared/ipc';
import { LiveCardView } from './LiveCardView';

interface Props {
  cards: LiveCard[];
  onReorder: (ids: string[]) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onDismiss: (id: string) => void;
  onAction: (input: CardActionInput) => void;
  onApproveBinding: (id: string) => void;
  onStartSession: (id: string, cwd: string) => Promise<void>;
}

/**
 * Pinned cards in the human's order. Reorder by drag-and-drop or the
 * Move up / Move down buttons on each card.
 */
export function PinnedSection({
  cards,
  onReorder,
  onPin,
  onUnpin,
  onDismiss,
  onAction,
  onApproveBinding,
  onStartSession,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= cards.length || from === to) return;
    const ids = cards.map((c) => c.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    onReorder(ids);
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const from = cards.findIndex((c) => c.id === dragId);
    const to = cards.findIndex((c) => c.id === targetId);
    if (from >= 0 && to >= 0) move(from, to);
    setDragId(null);
    setOverId(null);
  };

  if (cards.length === 0) return null;

  return (
    <section className="live-pinned" aria-label="Pinned">
      <div className="live-pinned-head">
        <span className="live-pinned-label">Pinned</span>
        <span className="live-pinned-rule" aria-hidden />
      </div>
      <div className="live-pinned-list">
        {cards.map((card, index) => (
          <LiveCardView
            key={card.id}
            card={card}
            isDragging={dragId === card.id}
            isDropTarget={overId === card.id && dragId !== card.id}
            canMoveUp={index > 0}
            canMoveDown={index < cards.length - 1}
            moveUp={() => move(index, index - 1)}
            moveDown={() => move(index, index + 1)}
            dragProps={{
              draggable: true,
              onDragStart: (e) => {
                setDragId(card.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', card.id);
              },
              onDragOver: (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOverId(card.id);
              },
              onDrop: (e) => {
                e.preventDefault();
                onDrop(card.id);
              },
              onDragEnd: () => {
                setDragId(null);
                setOverId(null);
              },
            }}
            onPin={onPin}
            onUnpin={onUnpin}
            onDismiss={onDismiss}
            onAction={onAction}
            onApproveBinding={onApproveBinding}
            onStartSession={onStartSession}
          />
        ))}
      </div>
    </section>
  );
}
