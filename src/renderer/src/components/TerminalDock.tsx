import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { DockTerminal } from '@shared/terminals';
import type { DockStore } from '../state/useDock';
import { TerminalView } from './TerminalView';
import { prettyPath } from '../lib/ui';

const MIN_HEIGHT = 140;
const MAX_SHARE = 0.75;

interface Props {
  dock: DockStore;
  open: boolean;
  height: number;
  onResize: (height: number) => void;
  onHide: () => void;
  sessionId: string | null;
  /** Where a new shell opens: the selected run's folder, if there is one. */
  defaultCwd: string | null;
  onPickFolder: () => Promise<string | null>;
}

/**
 * The bottom dock: plain shells and long-running commands beside the work,
 * one row of tabs per Session. Every tab stays mounted while the app runs, so
 * switching tab or Session never loses scrollback.
 */
export function TerminalDock({
  dock,
  open,
  height,
  onResize,
  onHide,
  sessionId,
  defaultCwd,
  onPickFolder,
}: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const active = dock.active;

  async function openShell(cwd: string | null) {
    const where = cwd ?? (await onPickFolder());
    if (where) await dock.create({ sessionId, cwd: where, profile: 'shell' });
  }

  async function runCommand(command: string) {
    const where = defaultCwd ?? (await onPickFolder());
    if (where) await dock.create({ sessionId, cwd: where, profile: 'command', command });
  }

  function startResize(e: ReactPointerEvent<HTMLDivElement>) {
    const parent = sectionRef.current?.parentElement;
    if (!parent) return;
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;
    const max = parent.clientHeight * MAX_SHARE;
    const move = (ev: PointerEvent) => {
      const next = startHeight + (startY - ev.clientY);
      onResize(Math.round(Math.min(max, Math.max(MIN_HEIGHT, next))));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      document.body.classList.remove('is-resizing-dock');
    };
    document.body.classList.add('is-resizing-dock');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  return (
    <section
      ref={sectionRef}
      className="dock"
      hidden={!open}
      aria-label="Terminals"
      style={{ '--dock-h': `${height}px` } as CSSProperties}
    >
      <div
        className="dock-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminals"
        onPointerDown={startResize}
      />
      <div className="dock-bar">
        <div className="dock-tabs" role="tablist" aria-label="Terminal tabs">
          {dock.inSession.map((t) => (
            <DockTab
              key={t.id}
              terminal={t}
              active={t.id === active?.id}
              onSelect={() => dock.focus(t)}
              onClose={() => void dock.close(t.id)}
            />
          ))}
          <AddMenu
            defaultCwd={defaultCwd}
            onShell={() => void openShell(defaultCwd)}
            onShellElsewhere={() => void openShell(null)}
            onCommand={(cmd) => void runCommand(cmd)}
          />
        </div>
        <div className="dock-meta">
          {active && (
            <span className="dock-path" title={active.cwd}>
              {/* Isolated so the start-side ellipsis can't reorder `~/…`. */}
              <bdi>{prettyPath(active.cwd)}</bdi>
            </span>
          )}
          {active?.status === 'exited' && (
            <button className="dock-action" onClick={() => void dock.restart(active.id)}>
              Restart
            </button>
          )}
          <button className="dock-action dock-hide" onClick={onHide} title="Hide terminals (⌃`)">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span className="sr-only">Hide terminals</span>
          </button>
        </div>
      </div>

      <div className="dock-body">
        {dock.error && <p className="dock-error">{dock.error}</p>}
        {dock.inSession.length === 0 && (
          <div className="dock-empty">
            <p>No terminals in this session.</p>
            <button className="dock-action" onClick={() => void openShell(defaultCwd)}>
              {defaultCwd ? `Open a shell in ${prettyPath(defaultCwd)}` : 'Open a shell…'}
            </button>
          </div>
        )}
        {dock.terminals.map((t) => {
          const shown = open && t.id === active?.id && t.sessionId === sessionId;
          return (
            <div key={t.id} className="dock-pane" hidden={!shown} role="tabpanel">
              <TerminalView
                key={`${t.id}:${dock.generations[t.id] ?? 0}`}
                terminalId={t.id}
                visible={shown}
                exitNote={(code) => `— ${t.title} exited (${code}) · Restart from the tab bar —`}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DockTab({
  terminal,
  active,
  onSelect,
  onClose,
}: {
  terminal: DockTerminal;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const exited = terminal.status === 'exited';
  return (
    <div className={`dock-tab${active ? ' is-active' : ''}${exited ? ' is-exited' : ''}`}>
      <button
        role="tab"
        aria-selected={active}
        className="dock-tab-main"
        onClick={onSelect}
        title={terminal.command ?? terminal.cwd}
      >
        <span className="dock-glyph" aria-hidden>
          {terminal.profile === 'command' ? '▸' : '$'}
        </span>
        <span className="dock-tab-label">{terminal.title}</span>
        {exited && <span className="dock-tab-exit">exited</span>}
      </button>
      <button className="dock-tab-close" onClick={onClose} aria-label={`Close ${terminal.title}`}>
        ×
      </button>
    </div>
  );
}

function AddMenu({
  defaultCwd,
  onShell,
  onShellElsewhere,
  onCommand,
}: {
  defaultCwd: string | null;
  onShell: () => void;
  onShellElsewhere: () => void;
  onCommand: (command: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [open]);

  function pick(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="dock-add" ref={rootRef}>
      <button
        className="dock-add-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="New terminal"
        title="New terminal"
      >
        +
      </button>
      {open && (
        <div className="menu menu--up" role="menu">
          <button className="menu-item" role="menuitem" onClick={() => pick(onShell)}>
            <span className="menu-title">Shell</span>
            <span className="menu-sub">
              {defaultCwd ? prettyPath(defaultCwd) : 'choose a folder'}
            </span>
          </button>
          <button className="menu-item" role="menuitem" onClick={() => pick(onShellElsewhere)}>
            <span className="menu-title">Shell in another folder…</span>
            <span className="menu-sub">pick any directory</span>
          </button>
          <form
            className="menu-command"
            onSubmit={(e) => {
              e.preventDefault();
              const cmd = command.trim();
              if (!cmd) return;
              setCommand('');
              pick(() => onCommand(cmd));
            }}
          >
            <label className="menu-title" htmlFor="dock-command">
              Run a command
            </label>
            <input
              id="dock-command"
              className="menu-input"
              placeholder="npm run dev"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </form>
        </div>
      )}
    </div>
  );
}
