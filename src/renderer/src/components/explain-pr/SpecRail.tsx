import type { SpecFile, SpecGoal, SpecReviewDetail } from '@shared/explain-pr';
import { sessionColorVar } from '../../lib/ui';
import { displayPath } from './fileName';

interface Props {
  detail: SpecReviewDetail;
  onToggleReviewed: (path: string, reviewed: boolean) => void;
}

export function SpecRail({ detail, onToggleReviewed }: Props) {
  const mapping = detail.status === 'fetching' || detail.status === 'mapping';
  const specs = detail.files.filter((f) => !f.isTest);
  const tests = detail.files.filter((f) => f.isTest);
  const explained = specs.filter((f) => f.spec).length;
  const reviewed = specs.filter((f) => f.reviewed).length;
  const total = specs.length || detail.files.length;
  const mapPct = total === 0 ? 0 : Math.round((explained / total) * 100);
  const reviewPct = total === 0 ? 0 : Math.round((reviewed / total) * 100);

  const groups = detail.goals.map((goal) => ({
    goal,
    files: specs.filter((f) => f.goals.some((g) => g.id === goal.id)),
  }));
  const pending = specs.filter((f) => !f.spec);
  const cross = specs.filter((f) => f.spec && f.goals.length === 0);
  if (pending.length > 0 && mapping) {
    groups.unshift({
      goal: {
        id: 'pending',
        reviewId: detail.id,
        key: 'pending',
        label: 'Still organizing',
        blurb: '',
        color: 'amber',
        sort: -1,
      },
      files: pending,
    });
  }
  if (cross.length > 0) {
    groups.push({
      goal: {
        id: 'cross',
        reviewId: detail.id,
        key: 'cross',
        label: 'Cross-cutting',
        blurb: '',
        color: 'slate',
        sort: 99,
      },
      files: cross,
    });
  }

  return (
    <aside className="spec-rail">
      <div className="spec-progress">
        {mapping ? (
          <>
            <div className="spec-progress-row">
              <span>Organizing</span>
              <span className="spec-progress-count">
                {explained} / {total}
              </span>
            </div>
            <div className="spec-progress-track">
              <div className="spec-progress-fill is-live" style={{ width: `${mapPct}%` }} />
            </div>
          </>
        ) : (
          <>
            <div className="spec-progress-row">
              <span>Specs reviewed</span>
              <span className="spec-progress-count">
                {reviewed} / {total}
              </span>
            </div>
            <div className="spec-progress-track">
              <div className="spec-progress-fill" style={{ width: `${reviewPct}%` }} />
            </div>
          </>
        )}
      </div>
      <p className="spec-rail-hint">
        Files are grouped by the PR sub-goal they serve. A file can appear under more than one
        goal.
      </p>

      {groups.map(({ goal, files }) => (
        <GoalGroup
          key={goal.id}
          goal={goal}
          files={files}
          onToggleReviewed={onToggleReviewed}
        />
      ))}

      {tests.length > 0 && (
        <p className="spec-rail-tests">
          + {tests.length} test file{tests.length === 1 ? '' : 's'} · not shown
        </p>
      )}
    </aside>
  );
}

function GoalGroup({
  goal,
  files,
  onToggleReviewed,
}: {
  goal: SpecGoal;
  files: SpecFile[];
  onToggleReviewed: (path: string, reviewed: boolean) => void;
}) {
  return (
    <div className="spec-rail-group">
      <div className="spec-rail-group-head">
        <span className="spec-swatch" style={{ background: sessionColorVar(goal.color) }} />
        <span>{goal.label}</span>
        <span className="spec-rail-count">{files.length}</span>
      </div>
      {files.map((file) => (
        <button
          key={`${goal.id}:${file.id}`}
          className={`spec-rail-file${file.reviewed ? ' is-reviewed' : ''}`}
          onClick={() => onToggleReviewed(file.path, !file.reviewed)}
        >
          <span className={`spec-check${file.reviewed ? ' is-on' : ''}`}>
            {file.reviewed ? '✓' : ''}
          </span>
          <span className="spec-rail-name" title={file.path}>
            {displayPath(file.path)}
          </span>
        </button>
      ))}
    </div>
  );
}
