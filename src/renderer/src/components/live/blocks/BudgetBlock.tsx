import { resolveValue, type Block, type LiveCard } from '@shared/cards';
import { formatBudgetLabel } from '../format';

type Budget = Extract<Block, { kind: 'budget' }>;

interface Props {
  block: Budget;
  card: LiveCard;
}

export function BudgetBlock({ block, card }: Props) {
  const value = Number(resolveValue(block.value, card.state) ?? 0);
  const reference = Number(resolveValue(block.reference, card.state) ?? 0);
  const limit = Number(resolveValue(block.limit, card.state) ?? 0);
  const unit = block.unit;
  const safeLimit = limit > 0 ? limit : 1;

  const valuePct = Math.max(0, Math.min(100, (value / safeLimit) * 100));
  const refPct = Math.max(0, Math.min(100, (reference / safeLimit) * 100));
  const overrunStart = Math.min(valuePct, refPct);
  const overrunWidth = Math.max(0, valuePct - refPct);

  const usual = formatBudgetLabel(reference, unit);
  const wake = formatBudgetLabel(limit, unit);
  const aria = `Budget ${formatBudgetLabel(value, unit)} of ${wake}, usual ${usual}`;

  return (
    <div className="live-budget">
      <div className="live-budget-track" role="img" aria-label={aria}>
        <div
          className="live-budget-fill live-budget-fill--run"
          style={{ width: `${Math.min(valuePct, refPct)}%` }}
        />
        {overrunWidth > 0 && (
          <div
            className="live-budget-fill live-budget-fill--warn"
            style={{ left: `${overrunStart}%`, width: `${overrunWidth}%` }}
          />
        )}
        <div className="live-budget-marker" style={{ left: `${refPct}%` }} />
      </div>
      <div className="live-budget-labels">
        <span>0</span>
        <span style={{ left: `${refPct}%` }} className="live-budget-usual">
          usual {usual}
        </span>
        <span>wake at {wake}</span>
      </div>
    </div>
  );
}
