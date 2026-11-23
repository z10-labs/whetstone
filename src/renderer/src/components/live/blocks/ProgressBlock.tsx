import { resolveValue, type Block, type LiveCard } from '@shared/cards';

type Progress = Extract<Block, { kind: 'progress' }>;

interface Props {
  block: Progress;
  card: LiveCard;
}

export function ProgressBlock({ block, card }: Props) {
  const value = resolveValue(block.value, card.state);
  const max = resolveValue(block.max, card.state) ?? 100;
  const label = resolveValue(block.label, card.state);
  const n = typeof value === 'number' ? value : 0;
  const m = typeof max === 'number' && max > 0 ? max : 100;
  const pct = Math.max(0, Math.min(100, Math.round((n / m) * 100)));
  const aria = label ? `${String(label)}: ${pct}%` : `${pct}%`;

  return (
    <div className="live-progress">
      <div className="live-progress-head">
        {label != null && label !== '' && (
          <span className="live-progress-label">{String(label)}</span>
        )}
        <span className="live-progress-pct">{pct}%</span>
      </div>
      <div
        className="live-progress-track"
        role="img"
        aria-label={aria}
      >
        <div className="live-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
