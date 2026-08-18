import type { CSSProperties } from 'react';
import type { SpecGoal } from '@shared/explain-pr';
import { sessionColorVar } from '../../lib/ui';

interface Props {
  intent: string | null;
  goals: SpecGoal[];
  fileCounts: Record<string, number>;
  filterId: string | null;
  onFilter: (id: string | null) => void;
  mapping: boolean;
}

export function IntentCard({ intent, goals, fileCounts, filterId, onFilter, mapping }: Props) {
  return (
    <div className="intent-card">
      <div className="intent-kicker">
        <span>PR intent</span>
        <span className="intent-kicker-sub">everything below maps back to this</span>
      </div>
      {intent ? (
        <p className="intent-body">{intent}</p>
      ) : (
        <p className="intent-body is-pending">
          {mapping ? 'Shaping the PR intent…' : 'Intent will appear once the map starts.'}
        </p>
      )}
      {goals.length > 0 && (
        <div className="intent-chips">
          {goals.map((goal) => {
            const active = filterId === goal.id;
            const count = fileCounts[goal.id] ?? 0;
            return (
              <button
                key={goal.id}
                className={`intent-chip${active ? ' is-active' : ''}`}
                style={{ '--goal': sessionColorVar(goal.color) } as CSSProperties}
                onClick={() => onFilter(active ? null : goal.id)}
              >
                <span className="spec-swatch" style={{ background: sessionColorVar(goal.color) }} />
                {goal.label}
                <span className="intent-chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
