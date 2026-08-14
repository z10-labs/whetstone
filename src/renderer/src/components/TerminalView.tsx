import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { AgentRun } from '@shared/models';
import { api } from '../lib/api';
import { prettyPath } from '../lib/ui';

const MONO =
  "'SF Mono', 'JetBrains Mono', 'Fira Code', ui-monospace, Menlo, Consolas, monospace";

/** xterm theme aligned to the app's console palette. */
const THEME = {
  background: '#0b0c10',
  foreground: '#c3c8d4',
  cursor: '#ff8a3d',
  cursorAccent: '#0b0c10',
  selectionBackground: '#ff8a3d33',
  black: '#20242e',
  brightBlack: '#5c6373',
  red: '#ff6b6b',
  green: '#52d18a',
  yellow: '#ffcf5c',
  blue: '#4aa8ff',
  magenta: '#b48cff',
  cyan: '#55c9e0',
  white: '#c3c8d4',
  brightWhite: '#eef1f7',
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

    // Spawn (or re-attach and replay) the PTY.
    void api.terminal.attach({ runId, cwd: run.cwd, cols: term.cols, rows: term.rows });

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
        <div className="subline">
          <span className="badge badge--mode">terminal · claude</span>
          <span className="path">{prettyPath(run.cwd)}</span>
        </div>
      </header>
      <div className="terminal-wrap">
        <div className="terminal-host" ref={hostRef} />
      </div>
    </>
  );
}
