import { useWhetstone } from './state/useWhetstone';
import { SessionSidebar } from './components/SessionSidebar';
import { RunColumn } from './components/RunColumn';
import { Transcript } from './components/Transcript';
import { TerminalRunView } from './components/TerminalRunView';
import { PromptBar } from './components/PromptBar';

export default function App() {
  const store = useWhetstone();
  const run = store.selectedRun;

  return (
    <div className="app">
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
    </div>
  );
}
