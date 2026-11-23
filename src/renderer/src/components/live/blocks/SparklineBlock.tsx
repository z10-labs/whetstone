import { resolveValue, type Block, type LiveCard } from '@shared/cards';

type Sparkline = Extract<Block, { kind: 'sparkline' }>;

interface Props {
  block: Sparkline;
  card: LiveCard;
}

const W = 110;
const H = 30;
const PAD = 2;

export function SparklineBlock({ block, card }: Props) {
  const points = (resolveValue(block.points, card.state) as number[] | undefined) ?? [];
  let polyline = '';
  if (points.length > 0) {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    polyline = points
      .map((p, i) => {
        const x = points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * (W - PAD * 2);
        const y = H - PAD - ((p - min) / span) * (H - PAD * 2);
        return `${x},${y}`;
      })
      .join(' ');
  }

  return (
    <div className="live-sparkline">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={block.label}>
        {polyline && (
          <polyline
            fill="none"
            stroke="var(--warn)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={polyline}
          />
        )}
      </svg>
      <span className="live-sparkline-label">{block.label}</span>
    </div>
  );
}
