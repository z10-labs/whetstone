import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { AgentRun } from '@shared/models';
import { api } from '../lib/api';

const MONO =
  "'SF Mono', 'JetBrains Mono', 'Fira Code', ui-monospace, Menlo, Consolas, monospace";

/** xterm theme aligned to the app's palette in styles/tokens.css. */
const THEME = {
  background: '#141312',
  foreground: '#b7b2ab',
  cursor: '#c96442',
  cursorAccent: '#141312',
  selectionBackground: '#c9644233',
  black: '#2a2826',
  brightBlack: '#635f5a',
  red: '#c96d6d',
  green: '#6ea886',
  yellow: '#c2a05e',
  blue: '#7a9cc6',
  magenta: '#a291c4',
  cyan: '#7aa5b2',
  white: '#b7b2ab',
  brightWhite: '#ece9e4',
};

export function TerminalView({ run }: { run: AgentRun }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const runId = run.id;

    const term = new Terminal({
      fontFamily: MONO,
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      theme: THEME,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    // Keystrokes → PTY.
    const keyDisposable = term.onData((data) => api.terminal.input(runId, data));

    // PTY output → xterm (buffer replay arrives here on attach too).
    const offData = api.onTerminalData((payload) => {
      if (payload.runId === runId) term.write(payload.data);
    });
    const offExit = api.onTerminalExit((payload) => {
      if (payload.runId === runId) {
        term.write(`\r\n\x1b[90m— claude session exited (${payload.exitCode}) —\x1b[0m\r\n`);
      }
    });

    // Spawn (or re-attach and replay) the PTY. A known externalId means we
    // resume that Claude Code session rather than starting a fresh one.
    void api.terminal.attach({
      runId,
      cwd: run.cwd,
      cols: term.cols,
      rows: term.rows,
      resume: run.externalId,
    });

    const resize = new ResizeObserver(() => {
      try {
        fit.fit();
        api.terminal.resize({ runId, cols: term.cols, rows: term.rows });
      } catch {
        /* host detached mid-measure */
      }
    });
    resize.observe(host);

    term.focus();

    return () => {
      resize.disconnect();
      keyDisposable.dispose();
      offData();
      offExit();
      term.dispose();
    };
  }, [run.id, run.cwd]);

  return (
    <>
      <header className="transcript-head">
        <h1>{run.title}</h1>
        {run.externalId && (
          <div className="subline">
            <span className="path">{run.externalId.slice(0, 8)}</span>
          </div>
        )}
      </header>
      <div className="terminal-wrap">
        <div className="terminal-host" ref={hostRef} />
      </div>
    </>
  );
}
