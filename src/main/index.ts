/**
 * Electron main entry — app lifecycle + the single BrowserWindow.
 * Boots the database, registers IPC, then opens the renderer.
 */

import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { initDb, closeDb } from './db/client';
import { registerIpc } from './ipc';
import { killAllTerminals } from './terminal/manager';
import { stopAllTails } from './terminal/tail';
import { stopReminderTicker } from './brain/reminders';
import { setFocused, stopCards } from './cards/service';

const isDev = !app.isPackaged;

// WHETSTONE_HOME points the whole app — database, brain mirror — at another
// directory. For running a second, throwaway instance (tests, screenshots)
// without touching the real brain. Must be set before `ready`.
const homeOverride = process.env['WHETSTONE_HOME'];
if (homeOverride) {
  app.setPath('home', homeOverride);
  app.setPath('userData', join(homeOverride, 'userData'));
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    show: false,
    backgroundColor: '#0e0f13',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  // Open external links in the OS browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devUrl) {
    void win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  await initDb(); // bootstrap schema before any IPC call can hit it
  registerIpc();
  createWindow();
  console.log('[whetstone] ready — db bootstrapped, ipc registered, window created');

  // Off-screen cards poll slower while the app is in the background.
  app.on('browser-window-focus', () => setFocused(true));
  app.on('browser-window-blur', () => setFocused(false));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  stopReminderTicker();
  stopCards();
  stopAllTails();
  killAllTerminals();
  closeDb();
});
