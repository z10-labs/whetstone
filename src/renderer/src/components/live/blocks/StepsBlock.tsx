import { resolveValue, type Block, type LiveCard, type Step } from '@shared/cards';

type Steps = Extract<Block, { kind: 'steps' }>;

interface Props {
  block: Steps;
  card: LiveCard;
}

function StepMark({ status }: { status: Step['status'] }) {
  switch (status) {
    case 'done':
      return (
        <span className="live-step-mark live-step-mark--done" aria-hidden>
          ✓
        </span>
      );
    case 'running':
      return <span className="live-step-mark live-step-mark--running" aria-hidden />;
    case 'pending':
      return <span className="live-step-mark live-step-mark--pending" aria-hidden />;
    case 'failed':
      return (
        <span className="live-step-mark live-step-mark--failed" aria-hidden>
          ×
        </span>
      );
    case 'blocked':
      return <span className="live-step-mark live-step-mark--blocked" aria-hidden />;
  }
}

export function StepsBlock({ block, card }: Props) {
  const items = (resolveValue(block.items, card.state) as Step[] | undefined) ?? [];

  return (
    <ol className="live-steps">
      {items.map((step, i) => {
        const toneClass = step.tone ? ` live-tone-${step.tone}` : '';
        return (
          <li
            key={`${step.name}-${i}`}
            className={`live-step${step.status === 'running' ? ' is-running' : ''}`}
          >
            <StepMark status={step.status} />
            <span className="live-step-name">{step.name}</span>
            {step.detail != null && step.detail !== '' && (
              <span className={`live-step-detail${toneClass}`}>{step.detail}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
