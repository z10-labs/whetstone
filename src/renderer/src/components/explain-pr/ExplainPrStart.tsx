import type { ExplainPrStore } from '../../state/useExplainPr';
import { prettyPath, relativeTime } from '../../lib/ui';

interface Props {
  store: ExplainPrStore;
}

export function ExplainPrStart({ store }: Props) {
  return (
    <div className="explain-start">
      <header className="explain-start-hero">
        <p className="explain-kicker">Tool</p>
        <h1>Explain PR</h1>
        <p className="explain-lead">
          Spec-first map of a pull request. Claude shapes the intent and places each file —
          you review the change yourself. Code stays hidden until you ask.
        </p>
      </header>

      <section className="explain-start-card">
        <label className="explain-field">
          <span>Repository</span>
          <div className="explain-repo-row">
            <code className="explain-path">{store.cwd ? prettyPath(store.cwd) : 'No folder selected'}</code>
            <button className="btn" onClick={() => void store.pickRepo()}>
              Choose folder
            </button>
          </div>
        </label>

        <label className="explain-field">
          <span>Pull request</span>
          <div className="explain-pr-row">
            <input
              className="explain-input"
              placeholder="#178 or a GitHub pull URL"
              value={store.pr}
              onChange={(e) => store.setPr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void store.start();
              }}
            />
            <button
              className="btn btn--primary"
              disabled={!store.cwd || !store.pr.trim() || store.starting}
              onClick={() => void store.start()}
            >
              {store.starting ? 'Starting…' : 'Explain'}
            </button>
          </div>
        </label>

        {store.error && <p className="explain-error">{store.error}</p>}
      </section>

      {store.cwd && (
        <section className="explain-start-block">
          <h2>Open pull requests</h2>
          {store.loadingOpen && <p className="explain-muted">Listing with gh…</p>}
          {!store.loadingOpen && store.openPrs.length === 0 && (
            <p className="explain-muted">No open PRs in this repo, or gh could not list them.</p>
          )}
          <div className="explain-pr-list">
            {store.openPrs.map((item) => (
              <button
                key={item.number}
                className="explain-pr-item"
                disabled={store.starting}
                onClick={() => void store.startFromOpen(item.number)}
              >
                <span className="explain-pr-num">#{item.number}</span>
                <span className="explain-pr-title">{item.title}</span>
                <span className="explain-pr-meta">
                  {item.author} · {item.headRefName} → {item.baseRefName}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {store.reviews.length > 0 && (
        <section className="explain-start-block">
          <h2>Recent</h2>
          <div className="explain-pr-list">
            {store.reviews.map((item) => (
              <button
                key={item.id}
                className="explain-pr-item"
                onClick={() => void store.openReview(item.id)}
              >
                <span className="explain-pr-num">#{item.prNumber}</span>
                <span className="explain-pr-title">{item.title}</span>
                <span className="explain-pr-meta">
                  {item.reviewedCount}/{item.fileCount} reviewed · {relativeTime(item.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
