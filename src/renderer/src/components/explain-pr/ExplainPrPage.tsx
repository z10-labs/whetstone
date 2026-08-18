import { useEffect, useMemo, useState } from 'react';
import type { ExplainPrStore } from '../../state/useExplainPr';
import { ExplainPrStart } from './ExplainPrStart';
import { FileSpecCard } from './FileSpecCard';
import { IntentCard } from './IntentCard';
import { PendingFilesPanel } from './PendingFilesPanel';
import { SpecRail } from './SpecRail';

interface Props {
  store: ExplainPrStore;
}

export function ExplainPrPage({ store }: Props) {
  const detail = store.current;
  const [filterId, setFilterId] = useState<string | null>(null);
  useEffect(() => {
    setFilterId(null);
  }, [detail?.id]);

  const specs = useMemo(
    () => (detail ? detail.files.filter((f) => !f.isTest) : []),
    [detail],
  );
  const fileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!detail) return counts;
    for (const goal of detail.goals) {
      counts[goal.id] = specs.filter((f) => f.goals.some((g) => g.id === goal.id)).length;
    }
    return counts;
  }, [detail, specs]);

  const scoped = useMemo(() => {
    if (!filterId) return specs;
    return specs.filter((f) => f.goals.some((g) => g.id === filterId));
  }, [specs, filterId]);

  const explainedCards = scoped.filter((f) => f.spec);
  const pendingFiles = scoped.filter((f) => !f.spec);
  const filterLabel = detail?.goals.find((g) => g.id === filterId)?.label;
  const explainedCount = specs.filter((f) => f.spec).length;

  if (!detail) return <ExplainPrStart store={store} />;

  const busy = detail.status === 'fetching' || detail.status === 'mapping';

  return (
    <div className="explain-page">
      <header className="explain-bar">
        <div className="explain-bar-top">
          <button className="btn btn--ghost" onClick={store.backToStart}>
            ← All reviews
          </button>
          <h1>{detail.title}</h1>
          <span className="explain-pr-hash">#{detail.prNumber}</span>
          <span className={`explain-state explain-state--${(detail.state ?? 'open').toLowerCase()}`}>
            {detail.state ?? 'Open'}
          </span>
          {busy && (
            <button className="btn btn--danger" onClick={() => void store.cancel()}>
              Cancel
            </button>
          )}
        </div>
        <div className="explain-bar-sub">
          {detail.author && <code>{detail.author}</code>}
          {detail.author && ' wants to merge '}
          {detail.commitCount > 0 && `${detail.commitCount} commit${detail.commitCount === 1 ? '' : 's'} `}
          {detail.base && (
            <>
              into <code>{detail.base}</code>
            </>
          )}
          {detail.head && (
            <>
              {' '}
              from <code>{detail.head}</code>
            </>
          )}
          <span className={`explain-status-pill${busy ? ' is-live' : ''}`}>
            {detail.status === 'fetching' && (
              <>
                <span className="spark" /> Fetching pull request…
              </>
            )}
            {detail.status === 'mapping' && (
              <>
                <span className="spark" /> Organizing files…
              </>
            )}
            {detail.status === 'ready' && 'Ready'}
            {detail.status === 'error' && (detail.error ?? 'Failed')}
          </span>
        </div>
      </header>

      <div className="explain-body">
        <SpecRail detail={detail} onToggleReviewed={store.setReviewed} />
        <div className="explain-feed">
          <IntentCard
            intent={detail.intent}
            goals={detail.goals}
            fileCounts={fileCounts}
            filterId={filterId}
            onFilter={setFilterId}
            mapping={detail.status === 'mapping'}
          />

          {busy && (
            <MappingBanner status={detail.status} explained={explainedCount} total={specs.length} />
          )}

          <div className="explain-filter-row">
            {filterId ? (
              <>
                <span>
                  Goal slice · <b>{filterLabel}</b>
                  {' · '}
                  {explainedCards.length} explained
                  {pendingFiles.length > 0 ? ` · ${pendingFiles.length} still organizing` : ''}
                </span>
                <button className="btn btn--ghost" onClick={() => setFilterId(null)}>
                  Show all {specs.length} files
                </button>
              </>
            ) : (
              <span>
                All {specs.length} files
                {explainedCards.length < specs.length
                  ? ` · ${explainedCards.length} explained, ${pendingFiles.length} still organizing`
                  : ''}
              </span>
            )}
          </div>

          {store.error && detail.status === 'error' && (
            <p className="explain-error">{store.error}</p>
          )}

          {explainedCards.map((file) => (
            <FileSpecCard
              key={file.id}
              file={file}
              mapping={busy}
              onToggleReviewed={store.setReviewed}
            />
          ))}

          <PendingFilesPanel files={pendingFiles} mapping={busy} />

          {scoped.length === 0 && detail.status === 'fetching' && (
            <p className="explain-muted">Reading the pull request with gh…</p>
          )}
          {scoped.length === 0 && filterId && (
            <p className="explain-muted">No files in this goal yet — they appear here as Claude places them.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MappingBanner({
  status,
  explained,
  total,
}: {
  status: 'fetching' | 'mapping' | 'ready' | 'error';
  explained: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((explained / total) * 100);
  return (
    <div className="mapping-banner" role="status" aria-live="polite">
      <span className="spark" />
      <div className="mapping-banner-copy">
        <strong>{status === 'fetching' ? 'Fetching the pull request' : 'Organizing files into goals'}</strong>
        <span>
          {status === 'fetching'
            ? 'Reading title, files, and diff with gh…'
            : total === 0
              ? 'Waiting for the file list…'
              : `${explained} of ${total} files explained — cards fill in as each one lands.`}
        </span>
      </div>
      {status === 'mapping' && total > 0 && (
        <div className="mapping-banner-meter">
          <span>{pct}%</span>
          <div className="spec-progress-track">
            <div className="spec-progress-fill is-live" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
