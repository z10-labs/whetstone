/**
 * IPC wiring. Maps each channel in the shared contract to the repository /
 * runner, and broadcasts live run events back to every renderer window.
 * This is the only place `ipcMain` and `webContents` are touched.
 */

import { ipcMain, BrowserWindow, dialog } from 'electron';
import { IpcChannel, IpcEvent } from '@shared/ipc';
import type {
  AnswerAgentInput,
  CreateRunInput,
  CreateSessionInput,
  SetReviewedInput,
  StartAgentInput,
  StartExplainPrInput,
  TerminalAttachInput,
  TerminalResizeInput,
  UpdateSessionInput,
} from '@shared/ipc';
import type { SpecReviewDetail } from '@shared/explain-pr';
import type { CaptureBrainInput, SetMissionInput, UpdateBrainInput } from '@shared/brain';
import type { CreateDockTerminalInput, TerminalLaunch } from '@shared/terminals';
import type { HippomemQueryInput } from '@shared/hippomem';
import type { AgentRun, RunEvent } from '@shared/models';
import * as sessionsRepo from '../repo/sessions';
import * as runsRepo from '../repo/runs';
import * as memoryRepo from '../repo/session-memory';
import * as brainRepo from '../repo/brain';
import { brainFilePath } from '../brain/mirror';
import { publishBrain, setBrainBroadcaster } from '../brain/publish';
import { startReminderTicker } from '../brain/reminders';
import { startRun, cancelRun, submitAnswer } from '../agents/runner';
import * as explainPr from '../explain-pr/service';
import {
  attachTerminal,
  isTerminalAlive,
  writeTerminal,
  resizeTerminal,
  killTerminal,
} from '../terminal/manager';
import * as dock from '../terminal/dock';
import { startTail, stopTail } from '../terminal/tail';
import * as hippomem from '../memory/hippomem';

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

const emitter = {
  onEvent: (event: RunEvent) => broadcast(IpcEvent.RunEvent, event),
  onRunUpdated: (run: AgentRun) => broadcast(IpcEvent.RunUpdated, run),
};

const publishDock = () => broadcast(IpcEvent.DockChanged, dock.listDockTerminals());

const terminalEmitter = {
  onData: (terminalId: string, data: string) =>
    broadcast(IpcEvent.TerminalData, { terminalId, data }),
  onExit: (terminalId: string, exitCode: number) => {
    if (dock.markDockTerminalExited(terminalId, exitCode)) publishDock();
    else stopTail(terminalId);
    broadcast(IpcEvent.TerminalExit, { terminalId, exitCode });
  },
  onSession: (runId: string, sessionId: string) => {
    void runsRepo
      .setRunExternalId(runId, sessionId)
      .then((run) => broadcast(IpcEvent.RunUpdated, run))
      .catch((err) => console.error('[whetstone] setRunExternalId failed:', err));
    // Begin mirroring this session's transcript into structured events.
    void startTail(runId, sessionId, emitter);
  },
};

export function registerIpc(): void {
  // Sessions
  ipcMain.handle(IpcChannel.SessionsList, () => sessionsRepo.listSessions());
  // A Session is born with its mission: the name is the goal until reworded,
  // the description its first lines of direction.
  ipcMain.handle(IpcChannel.SessionsCreate, async (_e, input: CreateSessionInput) => {
    const session = await sessionsRepo.createSession(input);
    await brainRepo.setMission({
      sessionId: session.id,
      title: session.name,
      body: session.description ?? '',
    });
    await publishBrain();
    return session;
  });
  ipcMain.handle(IpcChannel.SessionsGet, (_e, id: string) => sessionsRepo.getSessionWithRuns(id));
  ipcMain.handle(IpcChannel.SessionsUpdate, (_e, input: UpdateSessionInput) =>
    sessionsRepo.updateSession(input),
  );
  ipcMain.handle(IpcChannel.SessionsDelete, async (_e, id: string) => {
    await brainRepo.removeMissionForSession(id);
    await sessionsRepo.deleteSession(id);
    await publishBrain();
  });

  // Runs
  ipcMain.handle(IpcChannel.RunsCreate, (_e, input: CreateRunInput) => runsRepo.createRun(input));
  ipcMain.handle(IpcChannel.RunsListEvents, (_e, runId: string) => runsRepo.listEvents(runId));
  ipcMain.handle(IpcChannel.RunsMove, (_e, runId: string, toSessionId: string) =>
    runsRepo.moveRun(runId, toSessionId),
  );

  // Session memory (the shared brain).
  ipcMain.handle(IpcChannel.MemoryListBySession, (_e, sessionId: string) =>
    memoryRepo.listBySession(sessionId),
  );

  // The Brain (jots, tasks, reminders, missions). Every mutation republishes
  // the whole board: it is small by design, so a diff protocol would cost more
  // than it saves — and it keeps the markdown mirror and every window in step.
  setBrainBroadcaster((items) => broadcast(IpcEvent.BrainChanged, items));

  ipcMain.handle(IpcChannel.BrainList, () => brainRepo.listBrain());
  ipcMain.handle(IpcChannel.BrainCapture, async (_e, input: CaptureBrainInput) => {
    const item = await brainRepo.captureBrainItem(input);
    await publishBrain();
    return item;
  });
  ipcMain.handle(IpcChannel.BrainUpdate, async (_e, input: UpdateBrainInput) => {
    const item = await brainRepo.updateBrainItem(input);
    await publishBrain();
    return item;
  });
  ipcMain.handle(IpcChannel.BrainSetMission, async (_e, input: SetMissionInput) => {
    const item = await brainRepo.setMission(input);
    await publishBrain();
    return item;
  });
  ipcMain.handle(IpcChannel.BrainRemove, async (_e, id: string) => {
    await brainRepo.removeBrainItem(id);
    await publishBrain();
  });
  ipcMain.handle(IpcChannel.BrainClearFinished, async () => {
    await brainRepo.clearFinishedBrainItems();
    await publishBrain();
  });
  ipcMain.handle(IpcChannel.BrainMirrorPath, () => brainFilePath());

  // Reminders fire on a clock in main, so they land whichever view is open.
  startReminderTicker({
    onChanged: () => {
      void publishBrain().catch((err) => {
        console.error('[whetstone] brain publish failed:', err);
      });
    },
  });

  // Seed the mirror on boot so agents can read the brain before it is touched.
  void publishBrain().catch((err) => {
    console.error('[whetstone] brain mirror seed failed:', err);
  });

  // Agent driving. Fire-and-forget: the runner owns status/error reporting and
  // streams everything back over IpcEvent channels, so the invoke resolves as
  // soon as the run is launched rather than when the conversation ends.
  ipcMain.handle(IpcChannel.AgentStart, (_e, input: StartAgentInput) => {
    void startRun(input.runId, input.prompt, emitter).catch((err) => {
      console.error('[whetstone] startRun failed:', err);
    });
  });
  ipcMain.handle(IpcChannel.AgentCancel, (_e, runId: string) => {
    cancelRun(runId);
  });
  ipcMain.handle(IpcChannel.AgentAnswer, (_e, input: AnswerAgentInput) =>
    submitAnswer(input.questionId, input.answer),
  );

  // Terminals (PTY transport): Claude Code terminal runs and dock tabs alike.
  // What to launch, and where, comes from main's own records.
  ipcMain.handle(IpcChannel.TerminalAttach, async (_e, input: TerminalAttachInput) => {
    const { terminalId, cols, rows } = input;
    const tab = dock.getDockTerminal(terminalId);
    if (tab) {
      // An exited tab stays exited until restarted; a re-attach just replays.
      if (tab.status === 'exited' && !isTerminalAlive(terminalId)) return;
      attachTerminal(terminalId, tab.cwd, cols, rows, dock.dockLaunch(tab), terminalEmitter);
      return;
    }
    const run = await runsRepo.getRun(terminalId);
    if (!run || run.mode !== 'terminal') throw new Error(`No terminal ${terminalId}`);
    const launch: TerminalLaunch = { profile: 'claude', resume: run.externalId };
    attachTerminal(run.id, run.cwd, cols, rows, launch, terminalEmitter);
    // Resumed runs already have their session id — start mirroring immediately.
    if (run.externalId) void startTail(run.id, run.externalId, emitter);
  });
  ipcMain.on(IpcChannel.TerminalInput, (_e, terminalId: string, data: string) => {
    writeTerminal(terminalId, data);
  });
  ipcMain.on(IpcChannel.TerminalResize, (_e, input: TerminalResizeInput) => {
    resizeTerminal(input.terminalId, input.cols, input.rows);
  });
  ipcMain.on(IpcChannel.TerminalKill, (_e, terminalId: string) => {
    killTerminal(terminalId);
    stopTail(terminalId);
  });

  // The dock: shell and command tabs beside the work.
  ipcMain.handle(IpcChannel.DockList, () => dock.listDockTerminals());
  ipcMain.handle(IpcChannel.DockCreate, (_e, input: CreateDockTerminalInput) => {
    const tab = dock.createDockTerminal(input);
    publishDock();
    return tab;
  });
  ipcMain.handle(IpcChannel.DockRestart, (_e, id: string) => {
    killTerminal(id);
    const tab = dock.markDockTerminalRunning(id);
    if (!tab) throw new Error(`No dock terminal ${id}`);
    publishDock();
    return tab;
  });
  ipcMain.handle(IpcChannel.DockClose, (_e, id: string) => {
    killTerminal(id);
    dock.removeDockTerminal(id);
    publishDock();
  });

  // Hippomem: the team's engineering memory, read from its local server.
  ipcMain.handle(IpcChannel.HippomemDecisions, (_e, cwd: string) => hippomem.listDecisions(cwd));
  ipcMain.handle(IpcChannel.HippomemQuery, (_e, input: HippomemQueryInput) =>
    hippomem.queryDecisions(input.cwd, input.text),
  );

  const explainEmit = (detail: SpecReviewDetail) => broadcast(IpcEvent.ExplainPrUpdated, detail);

  ipcMain.handle(IpcChannel.ExplainPrList, () => explainPr.listReviews());
  ipcMain.handle(IpcChannel.ExplainPrListOpen, (_e, cwd: string) => explainPr.listOpen(cwd));
  ipcMain.handle(IpcChannel.ExplainPrStart, (_e, input: StartExplainPrInput) =>
    explainPr.startReview(input, explainEmit),
  );
  ipcMain.handle(IpcChannel.ExplainPrGet, (_e, id: string) => explainPr.getReview(id));
  ipcMain.handle(IpcChannel.ExplainPrSetReviewed, (_e, input: SetReviewedInput) =>
    explainPr.setReviewed(input.reviewId, input.path, input.reviewed, explainEmit),
  );
  ipcMain.handle(IpcChannel.ExplainPrCancel, (_e, id: string) => {
    explainPr.cancelReview(id);
  });

  // Native folder picker for choosing a run's working directory.
  ipcMain.handle(IpcChannel.DialogPickDirectory, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose a folder',
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });
}
