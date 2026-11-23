import type { Block, LiveCard } from '@shared/cards';
import { StatBlock } from './StatBlock';
import { ProgressBlock } from './ProgressBlock';
import { BudgetBlock } from './BudgetBlock';
import { StepsBlock } from './StepsBlock';
import { KvBlock } from './KvBlock';
import { SparklineBlock } from './SparklineBlock';
import { LogBlock } from './LogBlock';
import { TagsBlock } from './TagsBlock';
import { OptionsBlock } from './OptionsBlock';
import { ChoiceBlock } from './ChoiceBlock';
import { MarkdownBlock } from './MarkdownBlock';
import { ActionsBlock } from './ActionsBlock';

interface Props {
  block: Block;
  card: LiveCard;
  blockIndex: number;
  orphan: boolean;
  onAction: (input: { cardId: string; blockIndex: number; value: string }) => void;
}

/** Dispatch a card block to its small renderer. */
export function CardBlock({ block, card, blockIndex, orphan, onAction }: Props) {
  switch (block.kind) {
    case 'stat':
      return <StatBlock block={block} card={card} />;
    case 'progress':
      return <ProgressBlock block={block} card={card} />;
    case 'budget':
      return <BudgetBlock block={block} card={card} />;
    case 'steps':
      return <StepsBlock block={block} card={card} />;
    case 'kv':
      return <KvBlock block={block} card={card} />;
    case 'sparkline':
      return <SparklineBlock block={block} card={card} />;
    case 'log':
      return <LogBlock block={block} card={card} />;
    case 'tags':
      return <TagsBlock block={block} card={card} />;
    case 'options':
      return <OptionsBlock block={block} />;
    case 'choice':
      return (
        <ChoiceBlock
          block={block}
          card={card}
          blockIndex={blockIndex}
          orphan={orphan}
          onAction={onAction}
        />
      );
    case 'markdown':
      return <MarkdownBlock block={block} />;
    case 'actions':
      return (
        <ActionsBlock
          block={block}
          card={card}
          blockIndex={blockIndex}
          orphan={orphan}
          onAction={onAction}
        />
      );
  }
}
