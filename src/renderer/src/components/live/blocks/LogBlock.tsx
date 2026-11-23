import { resolveValue, type Block, type LiveCard } from '@shared/cards';

type Log = Extract<Block, { kind: 'log' }>;

interface Props {
  block: Log;
  card: LiveCard;
}

export function LogBlock({ block, card }: Props) {
  const lines = (resolveValue(block.lines, card.state) as string[] | undefined) ?? [];
  const max = block.max ?? 8;
  const tail = lines.slice(-max);

  return <pre className="live-log">{tail.length ? tail.join('\n') : '—'}</pre>;
}
