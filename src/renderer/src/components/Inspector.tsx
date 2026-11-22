import type { ReactNode } from 'react';

export type InspectorTab = 'session' | 'hippomem';

interface Props {
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  sessionCount: number;
  onClose: () => void;
  session: ReactNode;
  hippomem: ReactNode;
}

/**
 * The right-hand Memory panel. Two memories, deliberately side by side:
 * the Session's working memory (what these runs have decided and left open)
 * and Hippomem (why the repo is built the way it is, across every Session).
 */
export function Inspector({ tab, onTab, sessionCount, onClose, session, hippomem }: Props) {
  return (
    <aside className="inspector" aria-label="Memory">
      <div className="inspector-head">
        <div className="pane-tabs" role="tablist" aria-label="Memory">
          <button
            role="tab"
            aria-selected={tab === 'session'}
            className={tab === 'session' ? 'is-active' : ''}
            onClick={() => onTab('session')}
          >
            Session
            {sessionCount > 0 && <span className="tab-count">{sessionCount}</span>}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'hippomem'}
            className={tab === 'hippomem' ? 'is-active' : ''}
            onClick={() => onTab('hippomem')}
          >
            Hippomem
          </button>
        </div>
        <button className="ghost-btn" onClick={onClose} aria-label="Close memory panel">
          ×
        </button>
      </div>
      <div className="inspector-body" role="tabpanel">
        {tab === 'session' ? session : hippomem}
      </div>
    </aside>
  );
}
