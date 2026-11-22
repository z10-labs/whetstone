import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
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

interface Props {
  /** A terminal run's id or a dock tab's id; main knows what to launch. */
  terminalId: string;
  /** Hidden terminals stay mounted (and keep scrollback) but skip fitting. */
  visible?: boolean;
  /** Line written when the process ends. */
  exitNote: (exitCode: number) => string;
}

/**
 * One xterm bound to one PTY. Mounting attaches (spawning on first attach,
 * replaying scrollback after); the view itself never decides what runs.
 */
export function TerminalView({ terminalId, visible = true, exitNote }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<{ term: Terminal; refit: () => void } | null>(null);
  const exitNoteRef = useRef(exitNote);
  exitNoteRef.current = exitNote;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

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

    // A hidden host measures 0×0; fitting then would shrink the PTY to nothing.
    const refit = () => {
      if (!host.offsetWidth || !host.offsetHeight) return;
      try {
        fit.fit();
        api.terminal.resize({ terminalId, cols: term.cols, rows: term.rows });
      } catch {
        /* host detached mid-measure */
      }
    };
    termRef.current = { term, refit };
    if (host.offsetWidth && host.offsetHeight) fit.fit();

    const keyDisposable = term.onData((data) => api.terminal.input(terminalId, data));
    const offData = api.onTerminalData((payload) => {
      if (payload.terminalId === terminalId) term.write(payload.data);
    });
    const offExit = api.onTerminalExit((payload) => {
      if (payload.terminalId === terminalId) {
        term.write(`\r\n\x1b[90m${exitNoteRef.current(payload.exitCode)}\x1b[0m\r\n`);
      }
    });

    api.terminal
      .attach({ terminalId, cols: term.cols, rows: term.rows })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        term.write(`\x1b[31mCould not start this terminal: ${message}\x1b[0m\r\n`);
      });

    const resize = new ResizeObserver(refit);
    resize.observe(host);

    return () => {
      resize.disconnect();
      keyDisposable.dispose();
      offData();
      offExit();
      termRef.current = null;
      term.dispose();
    };
  }, [terminalId]);

  // Coming into view: size to the space it now has and take the keyboard.
  useEffect(() => {
    if (!visible || !termRef.current) return;
    const { term, refit } = termRef.current;
    const frame = requestAnimationFrame(() => {
      refit();
      term.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return (
    <div className="terminal-wrap">
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
