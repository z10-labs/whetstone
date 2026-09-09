import { useState } from 'react';
import type { RunMode } from '@shared/models';

/** The "+" on a session group: pick how the new run should be driven. */
export function NewRunMenu({ onPick }: { onPick: (mode: RunMode) => void }) {
  const [open, setOpen] = useState(false);

  function choose(mode: RunMode) {
    setOpen(false);
    onPick(mode);
  }

  return (
    <div className="new-run">
      <button
        className="nav-add"
        onClick={() => setOpen((v) => !v)}
        title="New run in this session"
        aria-expanded={open}
      >
        +
      </button>
      {open && (
        <div className="menu" role="menu">
          <button className="menu-item" onClick={() => choose('sdk')}>
            <span className="menu-title">Structured run</span>
            <span className="menu-sub">SDK · streamed events · can ask you</span>
          </button>
          <button className="menu-item" onClick={() => choose('terminal')}>
            <span className="menu-title">Terminal run</span>
            <span className="menu-sub">Live Claude Code CLI in a PTY</span>
          </button>
        </div>
      )}
    </div>
  );
}
