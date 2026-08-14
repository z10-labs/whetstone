/**
 * The preload bridge — the ONLY thing exposed to the renderer. It implements
 * the shared `WhetstoneApi` contract over ipcRenderer and hangs it on
 * `window.whetstone`. contextIsolation is on; the renderer never sees Node.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, IpcEvent, type WhetstoneApi } from '@shared/ipc';
import type { AgentRun, RunEvent } from '@shared/models';

const api: WhetstoneApi = {
  sessions: {
    list: () => ipcRenderer.invoke(IpcChannel.SessionsList),
    create: (input) => ipcRenderer.invoke(IpcChannel.SessionsCreate, input),
    get: (id) => ipcRenderer.invoke(IpcChannel.SessionsGet, id),
    update: (input) => ipcRenderer.invoke(IpcChannel.SessionsUpdate, input),
    remove: (id) => ipcRenderer.invoke(IpcChannel.SessionsDelete, id),
  },
  runs: {
    create: (input) => ipcRenderer.invoke(IpcChannel.RunsCreate, input),
    listEvents: (runId) => ipcRenderer.invoke(IpcChannel.RunsListEvents, runId),
    move: (runId, toSessionId) => ipcRenderer.invoke(IpcChannel.RunsMove, runId, toSessionId),
  },
  agent: {
    start: (input) => ipcRenderer.invoke(IpcChannel.AgentStart, input),
    cancel: (runId) => ipcRenderer.invoke(IpcChannel.AgentCancel, runId),
  },
  dialog: {
    pickDirectory: () => ipcRenderer.invoke(IpcChannel.DialogPickDirectory),
  },
  onRunEvent: (listener) => {
    const handler = (_e: unknown, event: RunEvent) => listener(event);
    ipcRenderer.on(IpcEvent.RunEvent, handler);
    return () => ipcRenderer.removeListener(IpcEvent.RunEvent, handler);
  },
  onRunUpdated: (listener) => {
    const handler = (_e: unknown, run: AgentRun) => listener(run);
    ipcRenderer.on(IpcEvent.RunUpdated, handler);
    return () => ipcRenderer.removeListener(IpcEvent.RunUpdated, handler);
  },
};

contextBridge.exposeInMainWorld('whetstone', api);
