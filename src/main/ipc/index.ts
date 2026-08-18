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
import type { AgentRun, RunEvent } from '@shared/models';
import * as sessionsRepo from '../repo/sessions';
import * as runsRepo from '../repo/runs';
import { startRun, cancelRun, submitAnswer } from '../agents/runner';
import * as explainPr from '../explain-pr/service';
import {
  attachTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
} from '../terminal/manager';
import { startTail, stopTail } from '../terminal/tail';

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

const emitter = {
  onEvent: (event: RunEvent) => broadcast(IpcEvent.RunEvent, event),
  onRunUpdated: (run: AgentRun) => broadcast(IpcEvent.RunUpdated, run),
};

const terminalEmitter = {
  onData: (runId: string, data: string) =>
    broadcast(IpcEvent.TerminalData, { runId, data }),
  onExit: (runId: string, exitCode: number) => {
    stopTail(runId);
    broadcast(IpcEvent.TerminalExit, { runId, exitCode });
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
  ipcMain.handle(IpcChannel.SessionsCreate, (_e, input: CreateSessionInput) =>
    sessionsRepo.createSession(input),
  );
  ipcMain.handle(IpcChannel.SessionsGet, (_e, id: string) => sessionsRepo.getSessionWithRuns(id));
  ipcMain.handle(IpcChannel.SessionsUpdate, (_e, input: UpdateSessionInput) =>
    sessionsRepo.updateSession(input),
  );
  ipcMain.handle(IpcChannel.SessionsDelete, (_e, id: string) => sessionsRepo.deleteSession(id));

  // Runs
  ipcMain.handle(IpcChannel.RunsCreate, (_e, input: CreateRunInput) => runsRepo.createRun(input));
  ipcMain.handle(IpcChannel.RunsListEvents, (_e, runId: string) => runsRepo.listEvents(runId));
  ipcMain.handle(IpcChannel.RunsMove, (_e, runId: string, toSessionId: string) =>
    runsRepo.moveRun(runId, toSessionId),
  );

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

  // Terminal runs (PTY transport).
  ipcMain.handle(IpcChannel.TerminalAttach, (_e, input: TerminalAttachInput) => {
    attachTerminal(
      input.runId,
      input.cwd,
      input.cols,
      input.rows,
      input.resume ?? null,
      terminalEmitter,
    );
    // Resumed runs already have their session id — start mirroring immediately.
    if (input.resume) void startTail(input.runId, input.resume, emitter);
  });
  ipcMain.on(IpcChannel.TerminalInput, (_e, runId: string, data: string) => {
    writeTerminal(runId, data);
  });
  ipcMain.on(IpcChannel.TerminalResize, (_e, input: TerminalResizeInput) => {
    resizeTerminal(input.runId, input.cols, input.rows);
  });
  ipcMain.on(IpcChannel.TerminalKill, (_e, runId: string) => {
    killTerminal(runId);
  });

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
