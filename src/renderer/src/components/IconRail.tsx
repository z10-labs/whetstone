import type { ReactNode } from 'react';

export type AppView = 'sessions' | 'explain-pr';

interface Props {
  view: AppView;
  onChange: (view: AppView) => void;
}

export function IconRail({ view, onChange }: Props) {
  return (
    <nav className="icon-rail" aria-label="Whetstone tools">
      <RailButton
        active={view === 'sessions'}
        label="Sessions"
        onClick={() => onChange('sessions')}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path
            d="M9 2.2 15.2 9 9 15.8 2.8 9 9 2.2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      </RailButton>
      <RailButton
        active={view === 'explain-pr'}
        label="Explain PR"
        onClick={() => onChange('explain-pr')}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path
            d="M3.5 4.5h11M3.5 9h7.5M3.5 13.5h11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="13.2" cy="9" r="1.6" fill="currentColor" />
        </svg>
      </RailButton>
    </nav>
  );
}

function RailButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`icon-rail-btn${active ? ' is-active' : ''}`}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
