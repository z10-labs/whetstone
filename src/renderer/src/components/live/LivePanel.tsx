import { useState } from 'react';
import type { LiveCard } from '@shared/cards';
import { MAX_PINNED } from '@shared/cards';
import type { CardActionInput, PinResult } from '@shared/ipc';
import { LiveCardView } from './LiveCardView';
import { PinnedSection } from './PinnedSection';

interface Props {
  session: LiveCard[];
  pinned: LiveCard[];
  pin: (id: string, replaceId?: string) => Promise<PinResult>;
  unpin: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  action: (input: CardActionInput) => Promise<void>;
  approveBinding: (id: string) => Promise<void>;
  startSession: (id: string, cwd: string) => Promise<string>;
  /** After an orphan starts a session — refresh + select it. */
  onSelectSession: (sessionId: string) => void;
}

/**
 * The Live tab: this session's cards, then the human's pinned set.
 */
export function LivePanel({
  session,
  pinned,
  pin,
  unpin,
  reorder,
  dismiss,
  action,
  approveBinding,
  startSession,
  onSelectSession,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  // Every card action crosses IPC and can fail (no session to send to, a card
  // dismissed elsewhere); say so in the panel instead of dropping it.
  const attempt = (p: Promise<unknown>) => {
    setError(null);
    p.catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    });
  };

  const [capChooser, setCapChooser] = useState<{
    pendingId: string;
    pinned: LiveCard[];
  } | null>(null);

  const handlePin = async (id: string, replaceId?: string) => {
    const result = await pin(id, replaceId);
    if (!result.ok && result.reason === 'cap') {
      setCapChooser({ pendingId: id, pinned: result.pinned });
      return;
    }
    setCapChooser(null);
  };

  const handleStartSession = async (id: string, cwd: string) => {
    const sessionId = await startSession(id, cwd);
    onSelectSession(sessionId);
  };

  const empty = session.length === 0 && pinned.length === 0;

  return (
    <div className="live">
      <div className="scroll live-scroll">
        {error && (
          <p className="live-error" role="alert">
            {error}
          </p>
        )}

        {capChooser && (
          <div className="live-cap" role="dialog" aria-label="Unpin a card to make room">
            <p>
              You have {MAX_PINNED} pinned cards. Unpin one to make room:
            </p>
            <ul className="live-cap-list">
              {capChooser.pinned.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => attempt(handlePin(capChooser.pendingId, c.id))}
                  >
                    {c.spec.title}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn" onClick={() => setCapChooser(null)}>
              Cancel
            </button>
          </div>
        )}

        {empty ? (
          <p className="live-empty">
            No live cards. Agents add them when something is worth watching.
          </p>
        ) : (
          <>
            {session.length > 0 && (
              <div className="live-session-list">
                {session.map((card) => (
                  <LiveCardView
                    key={card.id}
                    card={card}
                    onPin={(id) => attempt(handlePin(id))}
                    onUnpin={(id) => attempt(unpin(id))}
                    onDismiss={(id) => attempt(dismiss(id))}
                    onAction={(input) => attempt(action(input))}
                    onApproveBinding={(id) => attempt(approveBinding(id))}
                    onStartSession={handleStartSession}
                  />
                ))}
              </div>
            )}

            <PinnedSection
              cards={pinned}
              onReorder={(ids) => attempt(reorder(ids))}
              onPin={(id) => attempt(handlePin(id))}
              onUnpin={(id) => attempt(unpin(id))}
              onDismiss={(id) => attempt(dismiss(id))}
              onAction={(input) => attempt(action(input))}
              onApproveBinding={(id) => attempt(approveBinding(id))}
              onStartSession={handleStartSession}
            />
          </>
        )}
      </div>
    </div>
  );
}
