import { useWhetstone } from './state/useWhetstone';
import { SessionSidebar } from './components/SessionSidebar';
import { RunColumn } from './components/RunColumn';
import { Transcript } from './components/Transcript';
import { PromptBar } from './components/PromptBar';

export default function App() {
  const store = useWhetstone();

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
        <Transcript run={store.selectedRun} events={store.events} />
        <PromptBar run={store.selectedRun} onSend={store.startAgent} onCancel={store.cancelAgent} />
      </main>
    </div>
  );
}
