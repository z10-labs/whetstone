import { useEffect, useState } from 'react';
import { useWhetstone } from './state/useWhetstone';
import { useExplainPr } from './state/useExplainPr';
import { useSessionMemory } from './state/useSessionMemory';
import { sessionBoard, useBrain } from './state/useBrain';
import { IconRail, type AppView } from './components/IconRail';
import { Sidebar } from './components/Sidebar';
import { RunPane } from './components/RunPane';
import { SessionBrain } from './components/SessionBrain';
import { BrainPage } from './components/brain/BrainPage';
import { ExplainPrPage } from './components/explain-pr/ExplainPrPage';

const IS_MAC = /Mac/.test(navigator.platform);

export default function App() {
  const store = useWhetstone();
  const explain = useExplainPr();
  const brain = useSessionMemory(store.selectedSessionId);
  const myBrain = useBrain();
  const [view, setView] = useState<AppView>('sessions');
  const [brainOpen, setBrainOpen] = useState(false);
  const [captureNonce, setCaptureNonce] = useState(0);

  // ⌘J (Ctrl+J elsewhere): the Brain has to be one keystroke from anywhere,
  // or a thought gets carried instead of captured. The embedded terminal is
  // the one place the keystroke already means something (Ctrl+J is a line
  // feed to a shell), so it is left alone there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (!mod || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'j') return;
      if (e.target instanceof Element && e.target.closest('.xterm')) return;
      e.preventDefault();
      setView('brain');
      setCaptureNonce((n) => n + 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const showBrain = view === 'sessions' && brainOpen && Boolean(store.selectedSessionId);
  const sessionSlice = store.selectedSessionId
    ? sessionBoard(myBrain.items, store.selectedSessionId)
    : null;

  const openSession = (sessionId: string) => {
    setView('sessions');
    void store.selectSession(sessionId);
  };

  // Sessions is the only three-column view; the standalone tools take the
  // whole width beside the rail.
  const isTool = view !== 'sessions';

  return (
    <div className={`app${isTool ? ' is-tool' : ''}${showBrain ? ' brain-open' : ''}`}>
      <div className="titlestrip">
        <span className="brand">
          Whet<b>stone</b>
        </span>
      </div>
      <IconRail view={view} onChange={setView} />

      {view === 'explain-pr' ? (
        <ExplainPrPage store={explain} />
      ) : view === 'brain' ? (
        <BrainPage
          store={myBrain}
          focusNonce={captureNonce}
          sessions={store.sessions}
          onOpenSession={openSession}
        />
      ) : (
        <>
          <Sidebar
            sessions={store.sessions}
            selectedRunId={store.selectedRunId}
            selectedSessionId={store.selectedSessionId}
            onSelectRun={store.selectRun}
            onSelectSession={store.selectSession}
            onCreateSession={store.createSession}
            onCreateRun={store.createRun}
          />

          <RunPane
            key={store.selectedRunId ?? 'none'}
            run={store.selectedRun}
            events={store.events}
            sessionName={store.selectedSession?.name ?? null}
            mission={sessionSlice?.mission ?? null}
            brainOpen={brainOpen}
            brainCount={brain.entries.filter((e) => e.status !== 'superseded').length}
            onToggleBrain={() => setBrainOpen((v) => !v)}
            onAnswer={store.answerQuestion}
            onSend={store.startAgent}
            onCancel={store.cancelAgent}
          />

          {showBrain && (
            <SessionBrain
              sessionName={store.selectedSession?.name ?? null}
              entries={brain.entries}
              mission={sessionSlice?.mission ?? null}
              openCount={sessionSlice?.open.length ?? 0}
              onSetMission={() => {
                if (store.selectedSessionId) {
                  void myBrain.setMission({ sessionId: store.selectedSessionId });
                }
              }}
              onOpenBrain={() => setView('brain')}
              onClose={() => setBrainOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
