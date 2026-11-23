import type { Block } from '@shared/cards';

type Options = Extract<Block, { kind: 'options' }>;

interface Props {
  block: Options;
}

export function OptionsBlock({ block }: Props) {
  return (
    <div className="live-options">
      {block.items.map((opt) => (
        <div
          key={opt.title}
          className={`live-option${opt.leaning ? ' is-leaning' : ''}`}
        >
          <div className="live-option-head">
            <span className="live-option-title">{opt.title}</span>
            {opt.leaning && <span className="live-option-leaning">LEANING</span>}
          </div>
          {opt.pros && opt.pros.length > 0 && (
            <ul className="live-option-pros">
              {opt.pros.map((p) => (
                <li key={p}>+ {p}</li>
              ))}
            </ul>
          )}
          {opt.cons && opt.cons.length > 0 && (
            <ul className="live-option-cons">
              {opt.cons.map((c) => (
                <li key={c}>− {c}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
