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

const isDev = !app.isPackaged;

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  stopAllTails();
  killAllTerminals();
  closeDb();
});
