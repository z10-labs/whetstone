import { useEffect, useRef, useState } from 'react';
import { useWhetstone } from './state/useWhetstone';
import { useExplainPr } from './state/useExplainPr';
import { useSessionMemory } from './state/useSessionMemory';
import { sessionBoard, useBrain } from './state/useBrain';
import { useDock } from './state/useDock';
import { usePreference } from './state/usePreference';
import { api } from './lib/api';
import { TitleBar } from './components/TitleBar';
import { Sidebar, type AppView } from './components/Sidebar';
import { RunPane } from './components/RunPane';
import { TerminalDock } from './components/TerminalDock';
import { Inspector, type InspectorTab } from './components/Inspector';
import { SessionBrain } from './components/SessionBrain';
import { HippomemPanel } from './components/HippomemPanel';
import { BrainPage } from './components/brain/BrainPage';
import { ExplainPrPage } from './components/explain-pr/ExplainPrPage';

const IS_MAC = /Mac/.test(navigator.platform);
const DEFAULT_DOCK_HEIGHT = 260;

const VIEW_NAMES: Record<AppView, string> = {
  sessions: 'Sessions',
  brain: 'Brain',
  'explain-pr': 'Explain PR',
};

/** ⌘ on macOS, Ctrl elsewhere — and never both. */
function isMod(e: KeyboardEvent): boolean {
  return IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/**
 * Ctrl chords typed into a terminal belong to the terminal (Ctrl+J is a line
 * feed, Ctrl+B is tmux's prefix). ⌘ never reaches a shell, so on macOS the app
 * shortcuts work from inside a terminal too.
 */
function ownedByTerminal(e: KeyboardEvent): boolean {
  return !IS_MAC && e.target instanceof Element && Boolean(e.target.closest('.xterm'));
}

export default function App() {
  const store = useWhetstone();
  const explain = useExplainPr();
  const memory = useSessionMemory(store.selectedSessionId);
  const myBrain = useBrain();
  const dock = useDock(store.selectedSessionId);

  const [view, setView] = useState<AppView>('sessions');
  const [captureNonce, setCaptureNonce] = useState(0);
  const [sidebarOpen, setSidebarOpen] = usePreference('sidebarOpen', true);
  const [dockOpen, setDockOpen] = usePreference('dockOpen', false);
  const [dockHeight, setDockHeight] = usePreference('dockHeight', DEFAULT_DOCK_HEIGHT);
  const [memoryOpen, setMemoryOpen] = usePreference('memoryOpen', false);
  const [inspectorTab, setInspectorTab] = usePreference<InspectorTab>('inspectorTab', 'session');

  const session = store.selectedSession;
  const run = store.selectedRun;
  // A new shell opens where the agent works: the selected run, else the
  // Session's latest run.
  const defaultCwd = run?.cwd ?? session?.runs.at(-1)?.cwd ?? null;

  const sessionSlice = store.selectedSessionId
    ? sessionBoard(myBrain.items, store.selectedSessionId)
    : null;

  // Opening an empty dock opens a shell, the way a terminal panel should.
  const toggleDock = useRef<() => void>(() => {});
  toggleDock.current = () => {
    const opening = !dockOpen;
    setView('sessions');
    setDockOpen(opening);
    if (opening && dock.inSession.length === 0 && defaultCwd) {
      void dock.create({ sessionId: store.selectedSessionId, cwd: defaultCwd, profile: 'shell' });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌃` toggles the dock from anywhere, terminals included.
      if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === '`') {
        e.preventDefault();
        toggleDock.current();
        return;
      }
      if (!isMod(e) || e.altKey || ownedByTerminal(e)) return;
      const key = e.key.toLowerCase();
      // ⌘J: the Brain has to be one keystroke from anywhere, or a thought
      // gets carried instead of captured.
      if (key === 'j' && !e.shiftKey) {
        e.preventDefault();
        setView('brain');
        setCaptureNonce((n) => n + 1);
      } else if (key === 'b' && !e.shiftKey) {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (key === 'm' && e.shiftKey) {
        e.preventDefault();
        setView('sessions');
        setMemoryOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [setSidebarOpen, setMemoryOpen]);

  const openSession = (sessionId: string) => {
    setView('sessions');
    void store.selectSession(sessionId);
  };

  const runInDock = (command: string, cwd: string) => {
    setView('sessions');
    setDockOpen(true);
    void dock.create({ sessionId: store.selectedSessionId, cwd, profile: 'command', command });
  };

  const isSessions = view === 'sessions';
  const crumbs = isSessions
    ? [session?.name ?? 'Sessions', ...(run ? [run.title] : [])]
    : [VIEW_NAMES[view]];

  return (
    <div className={`app${sidebarOpen ? '' : ' no-sidebar'}`}>
      <TitleBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        crumbs={crumbs}
        panes={
          isSessions
            ? {
                terminalOpen: dockOpen,
                memoryOpen,
                onToggleTerminal: () => toggleDock.current(),
                onToggleMemory: () => setMemoryOpen((v) => !v),
              }
            : null
        }
      />

      {sidebarOpen && (
        <Sidebar
          view={view}
          onChangeView={setView}
          sessions={store.sessions}
          selectedRunId={store.selectedRunId}
          selectedSessionId={store.selectedSessionId}
          onSelectRun={store.selectRun}
          onSelectSession={store.selectSession}
          onCreateSession={store.createSession}
          onCreateRun={store.createRun}
        />
      )}

      <div className="workspace">
        {/* The workbench stays mounted behind the tools so its terminals keep
            running and keep their scrollback. */}
        <div className={`workbench${memoryOpen ? ' has-inspector' : ''}`} hidden={!isSessions}>
          <div className="workbench-center">
            <RunPane
              key={store.selectedRunId ?? 'none'}
              run={run}
              events={store.events}
              sessionName={session?.name ?? null}
              mission={sessionSlice?.mission ?? null}
              onCreateRun={(mode) => {
                if (store.selectedSessionId) void store.createRun(store.selectedSessionId, mode);
              }}
              onAnswer={store.answerQuestion}
              onSend={store.startAgent}
              onCancel={store.cancelAgent}
            />
            <TerminalDock
              dock={dock}
              open={dockOpen && isSessions}
              height={dockHeight}
              onResize={setDockHeight}
              onHide={() => setDockOpen(false)}
              sessionId={store.selectedSessionId}
              defaultCwd={defaultCwd}
              onPickFolder={() => api.dialog.pickDirectory()}
            />
          </div>

          {memoryOpen && (
            <Inspector
              tab={inspectorTab}
              onTab={setInspectorTab}
              sessionCount={memory.entries.filter((e) => e.status !== 'superseded').length}
              onClose={() => setMemoryOpen(false)}
              session={
                store.selectedSessionId ? (
                  <SessionBrain
                    entries={memory.entries}
                    mission={sessionSlice?.mission ?? null}
                    openCount={sessionSlice?.open.length ?? 0}
                    onSetMission={() => {
                      if (store.selectedSessionId) {
                        void myBrain.setMission({ sessionId: store.selectedSessionId });
                      }
                    }}
                    onOpenBrain={() => setView('brain')}
                  />
                ) : (
                  <div className="empty">
                    <p>Select a session to see what its runs have shared.</p>
                  </div>
                )
              }
              hippomem={
                <HippomemPanel
                  cwd={defaultCwd}
                  enabled={inspectorTab === 'hippomem'}
                  onRunInDock={runInDock}
                />
              }
            />
          )}
        </div>

        {view === 'explain-pr' && <ExplainPrPage store={explain} />}
        {view === 'brain' && (
          <BrainPage
            store={myBrain}
            focusNonce={captureNonce}
            sessions={store.sessions}
            onOpenSession={openSession}
          />
        )}
      </div>
    </div>
  );
}
