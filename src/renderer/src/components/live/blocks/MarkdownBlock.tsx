import type { Block } from '@shared/cards';
import { Markdown } from '../../transcript/Markdown';

type Md = Extract<Block, { kind: 'markdown' }>;

interface Props {
  block: Md;
}

export function MarkdownBlock({ block }: Props) {
  return (
    <div className="live-markdown">
      <Markdown text={block.text} />
    </div>
  );
}
