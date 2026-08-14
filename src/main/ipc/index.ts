/**
 * IPC wiring. Maps each channel in the shared contract to the repository /
 * runner, and broadcasts live run events back to every renderer window.
 * This is the only place `ipcMain` and `webContents` are touched.
 */

import { ipcMain, BrowserWindow, dialog } from 'electron';
import { IpcChannel, IpcEvent } from '@shared/ipc';
import type {
  CreateRunInput,
  CreateSessionInput,
  StartAgentInput,
  UpdateSessionInput,
} from '@shared/ipc';
import type { AgentRun, RunEvent } from '@shared/models';
import * as sessionsRepo from '../repo/sessions';
import * as runsRepo from '../repo/runs';
import { startRun, cancelRun } from '../agents/runner';

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

const emitter = {
  onEvent: (event: RunEvent) => broadcast(IpcEvent.RunEvent, event),
  onRunUpdated: (run: AgentRun) => broadcast(IpcEvent.RunUpdated, run),
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

  // Native folder picker for choosing a run's working directory.
  ipcMain.handle(IpcChannel.DialogPickDirectory, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose a working directory for this run',
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });
}
