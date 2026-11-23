/**
 * The preload bridge — the ONLY thing exposed to the renderer. It implements
 * the shared `WhetstoneApi` contract over ipcRenderer and hangs it on
 * `window.whetstone`. contextIsolation is on; the renderer never sees Node.
 */

import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannel,
  IpcEvent,
  type WhetstoneApi,
  type TerminalDataPayload,
  type TerminalExitPayload,
} from '@shared/ipc';
import type { SpecReviewDetail } from '@shared/explain-pr';
import type { BrainItem } from '@shared/brain';
import type { DockTerminal } from '@shared/terminals';
import type { CardChange } from '@shared/cards';
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
  memory: {
    listBySession: (sessionId) => ipcRenderer.invoke(IpcChannel.MemoryListBySession, sessionId),
  },
  brain: {
    list: () => ipcRenderer.invoke(IpcChannel.BrainList),
    capture: (input) => ipcRenderer.invoke(IpcChannel.BrainCapture, input),
    update: (input) => ipcRenderer.invoke(IpcChannel.BrainUpdate, input),
    setMission: (input) => ipcRenderer.invoke(IpcChannel.BrainSetMission, input),
    remove: (id) => ipcRenderer.invoke(IpcChannel.BrainRemove, id),
    clearFinished: () => ipcRenderer.invoke(IpcChannel.BrainClearFinished),
    mirrorPath: () => ipcRenderer.invoke(IpcChannel.BrainMirrorPath),
  },
  agent: {
    start: (input) => ipcRenderer.invoke(IpcChannel.AgentStart, input),
    cancel: (runId) => ipcRenderer.invoke(IpcChannel.AgentCancel, runId),
    answer: (input) => ipcRenderer.invoke(IpcChannel.AgentAnswer, input),
  },
  dialog: {
    pickDirectory: () => ipcRenderer.invoke(IpcChannel.DialogPickDirectory),
  },
  terminal: {
    attach: (input) => ipcRenderer.invoke(IpcChannel.TerminalAttach, input),
    input: (terminalId, data) => ipcRenderer.send(IpcChannel.TerminalInput, terminalId, data),
    resize: (input) => ipcRenderer.send(IpcChannel.TerminalResize, input),
    kill: (terminalId) => ipcRenderer.send(IpcChannel.TerminalKill, terminalId),
  },
  dock: {
    list: () => ipcRenderer.invoke(IpcChannel.DockList),
    create: (input) => ipcRenderer.invoke(IpcChannel.DockCreate, input),
    restart: (id) => ipcRenderer.invoke(IpcChannel.DockRestart, id),
    close: (id) => ipcRenderer.invoke(IpcChannel.DockClose, id),
  },
  hippomem: {
    decisions: (cwd) => ipcRenderer.invoke(IpcChannel.HippomemDecisions, cwd),
    query: (input) => ipcRenderer.invoke(IpcChannel.HippomemQuery, input),
  },
  explainPr: {
    list: () => ipcRenderer.invoke(IpcChannel.ExplainPrList),
    listOpen: (cwd) => ipcRenderer.invoke(IpcChannel.ExplainPrListOpen, cwd),
    start: (input) => ipcRenderer.invoke(IpcChannel.ExplainPrStart, input),
    get: (id) => ipcRenderer.invoke(IpcChannel.ExplainPrGet, id),
    setReviewed: (input) => ipcRenderer.invoke(IpcChannel.ExplainPrSetReviewed, input),
    cancel: (id) => ipcRenderer.invoke(IpcChannel.ExplainPrCancel, id),
  },
  cards: {
    list: (sessionId) => ipcRenderer.invoke(IpcChannel.CardsList, sessionId),
    pin: (id, replaceId) => ipcRenderer.invoke(IpcChannel.CardsPin, id, replaceId),
    unpin: (id) => ipcRenderer.invoke(IpcChannel.CardsUnpin, id),
    reorder: (ids) => ipcRenderer.invoke(IpcChannel.CardsReorder, ids),
    dismiss: (id) => ipcRenderer.invoke(IpcChannel.CardsDismiss, id),
    action: (input) => ipcRenderer.invoke(IpcChannel.CardsAction, input),
    approveBinding: (id) => ipcRenderer.invoke(IpcChannel.CardsApproveBinding, id),
    startSession: (id, cwd) => ipcRenderer.invoke(IpcChannel.CardsStartSession, id, cwd),
    setViewing: (input) => ipcRenderer.send(IpcChannel.CardsSetViewing, input),
  },
  onCardChanged: (listener) => {
    const handler = (_e: unknown, change: CardChange) => listener(change);
    ipcRenderer.on(IpcEvent.CardChanged, handler);
    return () => ipcRenderer.removeListener(IpcEvent.CardChanged, handler);
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
  onTerminalData: (listener) => {
    const handler = (_e: unknown, payload: TerminalDataPayload) => listener(payload);
    ipcRenderer.on(IpcEvent.TerminalData, handler);
    return () => ipcRenderer.removeListener(IpcEvent.TerminalData, handler);
  },
  onTerminalExit: (listener) => {
    const handler = (_e: unknown, payload: TerminalExitPayload) => listener(payload);
    ipcRenderer.on(IpcEvent.TerminalExit, handler);
    return () => ipcRenderer.removeListener(IpcEvent.TerminalExit, handler);
  },
  onDockChanged: (listener) => {
    const handler = (_e: unknown, terminals: DockTerminal[]) => listener(terminals);
    ipcRenderer.on(IpcEvent.DockChanged, handler);
    return () => ipcRenderer.removeListener(IpcEvent.DockChanged, handler);
  },
  onBrainChanged: (listener) => {
    const handler = (_e: unknown, items: BrainItem[]) => listener(items);
    ipcRenderer.on(IpcEvent.BrainChanged, handler);
    return () => ipcRenderer.removeListener(IpcEvent.BrainChanged, handler);
  },
  onExplainPrUpdated: (listener) => {
    const handler = (_e: unknown, detail: SpecReviewDetail) => listener(detail);
    ipcRenderer.on(IpcEvent.ExplainPrUpdated, handler);
    return () => ipcRenderer.removeListener(IpcEvent.ExplainPrUpdated, handler);
  },
};

contextBridge.exposeInMainWorld('whetstone', api);
