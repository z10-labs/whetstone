import { useState } from 'react';
import { useWhetstone } from './state/useWhetstone';
import { useExplainPr } from './state/useExplainPr';
import { useSessionMemory } from './state/useSessionMemory';
import { useBrain } from './state/useBrain';
import { IconRail, type AppView } from './components/IconRail';
import { Sidebar } from './components/Sidebar';
import { RunPane } from './components/RunPane';
import { SessionBrain } from './components/SessionBrain';
import { BrainPage } from './components/brain/BrainPage';
import { ExplainPrPage } from './components/explain-pr/ExplainPrPage';

export default function App() {
  const store = useWhetstone();
  const explain = useExplainPr();
  const brain = useSessionMemory(store.selectedSessionId);
  const myBrain = useBrain();
  const [view, setView] = useState<AppView>('sessions');
  const [brainOpen, setBrainOpen] = useState(false);

  const showBrain = view === 'sessions' && brainOpen && Boolean(store.selectedSessionId);

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
        <BrainPage store={myBrain} />
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
              onClose={() => setBrainOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
