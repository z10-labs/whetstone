import { resolveValue, type Block, type LiveCard } from '@shared/cards';

type Kv = Extract<Block, { kind: 'kv' }>;

interface Props {
  block: Kv;
  card: LiveCard;
}

export function KvBlock({ block, card }: Props) {
  const cols = block.items.length <= 2 ? block.items.length : 3;
  return (
    <div className="live-kv" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {block.items.map((item) => {
        const value = resolveValue(item.value, card.state);
        return (
          <div key={item.label} className="live-kv-item">
            <div className="live-kv-label">{item.label}</div>
            <div className="live-kv-value">{value == null ? '—' : String(value)}</div>
          </div>
        );
      })}
    </div>
  );
}
