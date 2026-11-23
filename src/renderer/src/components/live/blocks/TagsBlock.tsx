import { resolveValue, type Block, type LiveCard, type TagItem } from '@shared/cards';

type Tags = Extract<Block, { kind: 'tags' }>;

interface Props {
  block: Tags;
  card: LiveCard;
}

export function TagsBlock({ block, card }: Props) {
  const items = (resolveValue(block.items, card.state) as TagItem[] | undefined) ?? [];

  return (
    <ul className="live-tags">
      {items.map((item, i) => (
        <li key={`${item.text}-${i}`} className={`live-tag live-tag--${item.tag}`}>
          <span className="live-tag-pill">{item.tag.replace('-', ' ')}</span>
          <span className="live-tag-text">{item.text}</span>
          {item.note && <span className="live-tag-note">{item.note}</span>}
        </li>
      ))}
    </ul>
  );
}
