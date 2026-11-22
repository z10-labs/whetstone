import type { HippomemView } from '@shared/hippomem';
import { useHippomem } from '../state/useHippomem';
import { prettyPath } from '../lib/ui';

interface Props {
  /** The selected run's folder; Hippomem is read for the repo it belongs to. */
  cwd: string | null;
  /** Only fetch while the tab is on screen. */
  enabled: boolean;
  /** Run a Hippomem command in a dock terminal (start the server, install hooks). */
  onRunInDock: (command: string, cwd: string) => void;
}

/**
 * The team's engineering memory for this repo: decisions in force and a
 * search over them. Read-only — agents propose decisions through Hippomem's
 * own tools, and Claude Code terminal runs reach it through its hooks.
 */
export function HippomemPanel({ cwd, enabled, onRunInDock }: Props) {
  const hm = useHippomem(cwd, enabled);

  if (!cwd) {
    return (
      <div className="empty">
        <h3>No repo in view</h3>
        <p>Select a run to see the decisions Hippomem holds for the repo it works in.</p>
      </div>
    );
  }

  const view = hm.view;

  return (
    <div className="hm">
      <div className="hm-head">
        <div className="hm-repo">
          <span className="hm-repo-name">{view?.repo ?? prettyPath(cwd)}</span>
          {view && <HooksBadge view={view} cwd={cwd} onRunInDock={onRunInDock} />}
        </div>
        <form
          className="hm-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void hm.search();
          }}
        >
          <input
            className="hm-input"
            type="search"
            placeholder="Search decisions…"
            aria-label="Search decisions"
            value={hm.query}
            onChange={(e) => {
              hm.setQuery(e.target.value);
              if (!e.target.value) hm.clear();
            }}
          />
        </form>
      </div>

      <div className="scroll hm-body" aria-busy={hm.loading}>
        {!view ? (
          <p className="hm-note">Reading Hippomem…</p>
        ) : view.state === 'ok' ? (
          view.text?.trim() ? (
            <pre className="hm-text">{view.text}</pre>
          ) : (
            <p className="hm-note">
              {hm.query ? 'Nothing matches.' : 'No decisions in force yet.'}
            </p>
          )
        ) : (
          <Unavailable view={view} cwd={cwd} onRetry={hm.refresh} onRunInDock={onRunInDock} />
        )}
      </div>
    </div>
  );
}

function HooksBadge({
  view,
  cwd,
  onRunInDock,
}: {
  view: HippomemView;
  cwd: string;
  onRunInDock: Props['onRunInDock'];
}) {
  if (view.hooksInstalled) {
    return (
      <span className="hm-badge is-on" title="Claude Code runs here read and write Hippomem">
        hooks on
      </span>
    );
  }
  return (
    <button
      className="hm-badge"
      title="Install Hippomem's MCP server and hooks for Claude Code in this repo"
      onClick={() => onRunInDock('hippomem install claude-code --project .', cwd)}
    >
      install hooks
    </button>
  );
}

function Unavailable({
  view,
  cwd,
  onRetry,
  onRunInDock,
}: {
  view: HippomemView;
  cwd: string;
  onRetry: () => void;
  onRunInDock: Props['onRunInDock'];
}) {
  if (view.state === 'offline') {
    return (
      <div className="hm-card">
        <p className="hm-card-title">Hippomem isn’t running</p>
        <p className="hm-note">Nothing answered at {view.url}.</p>
        <div className="hm-actions">
          <button className="btn btn--primary" onClick={() => onRunInDock('hippomem serve', cwd)}>
            Start it in a terminal
          </button>
          <button className="btn" onClick={onRetry}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (view.state === 'no-token') {
    return (
      <div className="hm-card">
        <p className="hm-card-title">Not signed in to Hippomem</p>
        <p className="hm-note">
          Run <code>hippomem login &lt;token&gt;</code> in a terminal, then retry.
        </p>
        <button className="btn" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="hm-card">
      <p className="hm-card-title">Hippomem said no</p>
      <p className="hm-note">{view.message}</p>
      <button className="btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
