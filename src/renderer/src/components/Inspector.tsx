import type { ReactNode } from 'react';

export type InspectorTab = 'live' | 'session' | 'hippomem';

interface Props {
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  liveCount: number;
  sessionCount: number;
  onClose: () => void;
  live: ReactNode;
  session: ReactNode;
  hippomem: ReactNode;
}

/**
 * The right-hand Memory panel. Three surfaces side by side: Live (things
 * still happening), Session (what these runs have decided), and Hippomem
 * (why the repo is built the way it is).
 */
export function Inspector({
  tab,
  onTab,
  liveCount,
  sessionCount,
  onClose,
  live,
  session,
  hippomem,
}: Props) {
  return (
    <aside className="inspector" aria-label="Memory">
      <div className="inspector-head">
        <div className="pane-tabs" role="tablist" aria-label="Memory">
          <button
            role="tab"
            aria-selected={tab === 'live'}
            className={tab === 'live' ? 'is-active' : ''}
            onClick={() => onTab('live')}
          >
            Live
            {liveCount > 0 && <span className="tab-count">{liveCount}</span>}
          </button>
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
        {tab === 'live' ? live : tab === 'session' ? session : hippomem}
      </div>
    </aside>
  );
}
