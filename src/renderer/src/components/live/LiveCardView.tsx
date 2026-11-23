import type { DragEvent } from 'react';
import { isPinned, type LiveCard } from '@shared/cards';
import type { CardActionInput } from '@shared/ipc';
import { api } from '../../lib/api';
import { CardBlock } from './blocks';
import {
  bindingApprovalTarget,
  bindingEverySec,
  bindingSourceLabel,
  formatFinishedAgo,
} from './format';

interface Props {
  card: LiveCard;
  /** Drag handle attributes for pinned reorder (HTML5 DnD). */
  dragProps?: {
    draggable: boolean;
    onDragStart: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
    onDragEnd: () => void;
  };
  isDragging?: boolean;
  isDropTarget?: boolean;
  moveUp?: () => void;
  moveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onDismiss: (id: string) => void;
  onAction: (input: CardActionInput) => void;
  onApproveBinding: (id: string) => void;
  onStartSession: (id: string, cwd: string) => Promise<void>;
}

function subtitleLine(card: LiveCard): string {
  const parts: string[] = [];
  if (card.spec.subtitle) parts.push(card.spec.subtitle);
  if (isPinned(card)) {
    if (card.originSessionId === null) parts.push('session deleted');
    else if (card.originSessionName) parts.push(`from ${card.originSessionName}`);
  }
  return parts.join(' · ');
}

function footerLeft(card: LiveCard): { text: string; err?: boolean } | null {
  if (card.status === 'error' && card.lastError) {
    return { text: card.lastError, err: true };
  }
  if (card.status === 'settled') {
    const at = card.settledAt ?? card.updatedAt;
    return { text: formatFinishedAgo(at) };
  }
  if (card.spec.binding && card.status === 'live') {
    return { text: bindingSourceLabel(card.spec.binding) };
  }
  return null;
}

/**
 * One Live Card: header, optional live strip, blocks, and a pin/dismiss footer.
 */
export function LiveCardView({
  card,
  dragProps,
  isDragging,
  isDropTarget,
  moveUp,
  moveDown,
  canMoveUp,
  canMoveDown,
  onPin,
  onUnpin,
  onDismiss,
  onAction,
  onApproveBinding,
  onStartSession,
}: Props) {
  const pinned = isPinned(card);
  const orphan = pinned && card.originSessionId === null;
  const attention = card.spec.tone === 'attention';
  const suggestPin = Boolean(card.spec.suggestPin) && !pinned;
  const awaiting = card.status === 'awaiting-approval';
  const showSweep = card.status === 'live' && Boolean(card.spec.binding);
  const left = footerLeft(card);
  const sub = subtitleLine(card);

  const startFromCard = async () => {
    const cwd = await api.dialog.pickDirectory();
    if (!cwd) return;
    await onStartSession(card.id, cwd);
  };

  return (
    <article
      id={`card-${card.id}`}
      className={[
        'live-card',
        attention ? 'live-card--attention' : '',
        isDragging ? 'is-dragging' : '',
        isDropTarget ? 'is-drop-target' : '',
        showSweep ? 'live-card--sweeping' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...dragProps}
    >
      <header className="live-card-head">
        {sub && <div className="live-card-sub">{sub}</div>}
        <div className="live-card-title-row">
          <h3 className="live-card-title">{card.spec.title}</h3>
          {attention && <span className="live-card-needs">Needs you</span>}
          {pinned && (moveUp || moveDown) && (
            <div className="live-card-reorder">
              <button
                type="button"
                className="live-icon-btn"
                aria-label="Move up"
                disabled={!canMoveUp}
                onClick={moveUp}
              >
                ↑
              </button>
              <button
                type="button"
                className="live-icon-btn"
                aria-label="Move down"
                disabled={!canMoveDown}
                onClick={moveDown}
              >
                ↓
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="live-card-body">
        {awaiting && card.spec.binding && (
          <div className="live-approve">
            <p>
              Allow this card to run{' '}
              <code>{bindingApprovalTarget(card.spec.binding)}</code>
              {bindingEverySec(card.spec.binding) != null && (
                <> every {bindingEverySec(card.spec.binding)}s</>
              )}
              ?
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => onApproveBinding(card.id)}
            >
              Allow
            </button>
          </div>
        )}

        {!awaiting &&
          card.spec.blocks.map((block, i) => (
            <CardBlock
              key={i}
              block={block}
              card={card}
              blockIndex={i}
              orphan={orphan}
              onAction={onAction}
            />
          ))}
      </div>

      <footer className="live-card-foot">
        <div className="live-card-foot-left">
          {suggestPin && <span className="live-card-hint">Worth keeping?</span>}
          {left && (
            <span className={`live-card-source${left.err ? ' is-err' : ''}`}>{left.text}</span>
          )}
        </div>
        <div className="live-card-foot-right">
          {orphan && (
            <button type="button" className="btn" onClick={() => void startFromCard()}>
              Start a session from this card
            </button>
          )}
          {pinned ? (
            <button type="button" className="btn" onClick={() => onUnpin(card.id)}>
              Unpin
            </button>
          ) : (
            <button
              type="button"
              className={`btn${suggestPin ? ' btn--primary' : ''}`}
              onClick={() => onPin(card.id)}
            >
              Pin
            </button>
          )}
          <button type="button" className="btn" onClick={() => onDismiss(card.id)}>
            Dismiss
          </button>
        </div>
      </footer>
    </article>
  );
}
