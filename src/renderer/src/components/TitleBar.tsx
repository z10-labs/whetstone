import { MemoryIcon, SidebarIcon, TerminalIcon } from './icons';

interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  /** Where you are: Session › run, or the tool's name. */
  crumbs: string[];
  /** Pane toggles only exist where there are panes (the Sessions workbench). */
  panes: null | {
    terminalOpen: boolean;
    memoryOpen: boolean;
    onToggleTerminal: () => void;
    onToggleMemory: () => void;
  };
}

/**
 * The window's top edge: draggable, with the sidebar toggle by the traffic
 * lights, the breadcrumb in the middle and the pane toggles on the right —
 * the same places they sit in Claude Code.
 */
export function TitleBar({ sidebarOpen, onToggleSidebar, crumbs, panes }: Props) {
  return (
    <header className="titlebar">
      <div className="titlebar-lead">
        <button
          className={`chrome-btn${sidebarOpen ? ' is-on' : ''}`}
          onClick={onToggleSidebar}
          aria-pressed={sidebarOpen}
          title="Toggle sidebar (⌘B)"
        >
          <SidebarIcon />
          <span className="sr-only">Toggle sidebar</span>
        </button>
        {!sidebarOpen && (
          <span className="brand">
            Whet<b>stone</b>
          </span>
        )}
      </div>

      <nav className="crumbs" aria-label="Location">
        {crumbs.map((crumb, i) => (
          <span key={`${i}-${crumb}`} className={i === crumbs.length - 1 ? 'is-here' : ''}>
            {crumb}
          </span>
        ))}
      </nav>

      <div className="titlebar-trail">
        {panes && (
          <>
            <button
              className={`chrome-btn${panes.terminalOpen ? ' is-on' : ''}`}
              onClick={panes.onToggleTerminal}
              aria-pressed={panes.terminalOpen}
              title="Terminals (⌃`)"
            >
              <TerminalIcon />
              <span className="sr-only">Toggle terminals</span>
            </button>
            <button
              className={`chrome-btn${panes.memoryOpen ? ' is-on' : ''}`}
              onClick={panes.onToggleMemory}
              aria-pressed={panes.memoryOpen}
              title="Memory (⌘⇧M)"
            >
              <MemoryIcon />
              <span className="sr-only">Toggle memory panel</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
