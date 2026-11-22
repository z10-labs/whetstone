/** The app's handful of line icons, drawn at 16px on currentColor. */

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 } as const;

export function SessionsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path d="M9 2.2 15.2 9 9 15.8 2.8 9 9 2.2Z" {...STROKE} />
    </svg>
  );
}

export function BrainIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path
        d="M9 3.4c-1.5-1.3-4-.8-4.6 1.1-1.5.5-1.9 2.4-.7 3.4-.7 1.4.3 3.1 1.9 3.2.5 1.5 2.5 2 3.4.8V3.4Z"
        {...STROKE}
        strokeLinejoin="round"
      />
      <path
        d="M9 3.4c1.5-1.3 4-.8 4.6 1.1 1.5.5 1.9 2.4.7 3.4.7 1.4-.3 3.1-1.9 3.2-.5 1.5-2.5 2-3.4.8V3.4Z"
        {...STROKE}
        strokeLinejoin="round"
      />
      <path d="M9 12v3.2" {...STROKE} strokeLinecap="round" />
    </svg>
  );
}

export function ExplainIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path d="M3.5 4.5h11M3.5 9h7.5M3.5 13.5h11" {...STROKE} strokeLinecap="round" />
      <circle cx="13.2" cy="9" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function SidebarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="2" {...STROKE} />
      <path d="M6.2 3v10" {...STROKE} />
    </svg>
  );
}

export function TerminalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="2" {...STROKE} />
      <path d="m4.8 6.3 2 1.7-2 1.7M8.4 10h2.8" {...STROKE} strokeLinecap="round" />
    </svg>
  );
}

export function MemoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="2" {...STROKE} />
      <path d="M9.8 3v10" {...STROKE} />
    </svg>
  );
}
