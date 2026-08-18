import { useState } from 'react';
import { useWhetstone } from './state/useWhetstone';
import { useExplainPr } from './state/useExplainPr';
import { IconRail, type AppView } from './components/IconRail';
import { SessionSidebar } from './components/SessionSidebar';
import { RunColumn } from './components/RunColumn';
import { Transcript } from './components/Transcript';
import { TerminalRunView } from './components/TerminalRunView';
import { PromptBar } from './components/PromptBar';
import { ExplainPrPage } from './components/explain-pr/ExplainPrPage';

export default function App() {
  const store = useWhetstone();
  const explain = useExplainPr();
  const [view, setView] = useState<AppView>('sessions');
  const run = store.selectedRun;

  return (
    <div className={`app${view === 'explain-pr' ? ' is-tool' : ''}`}>
      <div className="titlestrip">
        <span className="brand">
          Whet<b>stone</b>
        </span>
      </div>
      <IconRail view={view} onChange={setView} />

      {view === 'explain-pr' ? (
        <ExplainPrPage store={explain} />
      ) : (
        <>
          <SessionSidebar
            sessions={store.sessions}
            selectedId={store.selectedSessionId}
            onSelect={store.selectSession}
            onCreate={store.createSession}
          />

          <RunColumn
            session={store.detail}
            selectedRunId={store.selectedRunId}
            onSelectRun={store.selectRun}
            onNewRun={store.createRun}
          />

          <main className="col col--transcript">
            {run?.mode === 'terminal' ? (
              <TerminalRunView
                key={run.id}
                run={run}
                events={store.events}
                onAnswer={store.answerQuestion}
              />
            ) : (
              <>
                <Transcript run={run} events={store.events} onAnswer={store.answerQuestion} />
                <PromptBar run={run} onSend={store.startAgent} onCancel={store.cancelAgent} />
              </>
            )}
          </main>
        </>
      )}
    </div>
  );
}
