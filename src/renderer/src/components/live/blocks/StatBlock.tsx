import { useEffect, useState } from 'react';
import { resolveValue, type Block, type LiveCard } from '@shared/cards';
import { formatDuration } from '../format';

type Stat = Extract<Block, { kind: 'stat' }>;

interface Props {
  block: Stat;
  card: LiveCard;
}

function formatStatValue(
  raw: string | number | undefined,
  format: Stat['format'],
  liveExtraSec: number,
): string {
  if (raw === undefined || raw === null) return '—';
  if (format === 'duration') {
    const base = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isNaN(base)) return String(raw);
    return formatDuration(base + liveExtraSec);
  }
  if (format === 'count') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isNaN(n) ? String(raw) : n.toLocaleString();
  }
  if (format === 'percent') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isNaN(n) ? String(raw) : `${Math.round(n)}%`;
  }
  return String(raw);
}

/** Big mono number with an optional note underneath. */
export function StatBlock({ block, card }: Props) {
  const raw = resolveValue(block.value, card.state);
  const note = resolveValue(block.note, card.state);
  const live = card.status === 'live' && block.format === 'duration';
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  // Re-read lastPolledAt each tick so the duration advances between polls.
  void tick;
  const extra =
    live && card.lastPolledAt != null
      ? Math.max(0, (Date.now() - card.lastPolledAt) / 1000)
      : 0;

  const display = formatStatValue(raw as string | number | undefined, block.format, extra);
  const tone = resolveValue(block.tone, card.state);
  const toneClass = typeof tone === 'string' ? ` live-tone-${tone}` : '';

  return (
    <div className="live-stat">
      {block.label && <div className="live-stat-label">{block.label}</div>}
      <div className="live-stat-value">{display}</div>
      {note != null && note !== '' && (
        <div className={`live-stat-note${toneClass}`}>{String(note)}</div>
      )}
    </div>
  );
}
