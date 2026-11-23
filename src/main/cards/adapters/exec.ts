/**
 * The real `exec`, `shell` and `readFile` the poller hands to adapters.
 */

import { execFile, exec as execShell } from 'node:child_process';
import { readFile as readFileFs } from 'node:fs/promises';
import type { ExecFn, ReadFileFn, ShellFn } from './types';

export const realExec: ExecFn = (file, args, opts) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd: opts.cwd, timeout: opts.timeoutMs, maxBuffer: opts.maxBuffer, signal: opts.signal },
      (err, stdout, stderr) => {
        if (err) {
          const detail = String(stderr || '').trim().split('\n').slice(-2).join(' ');
          reject(new Error(detail || err.message));
          return;
        }
        resolve(String(stdout));
      },
    );
  });

export const realShell: ShellFn = (command, opts) =>
  new Promise((resolve, reject) => {
    execShell(
      command,
      { cwd: opts.cwd, timeout: opts.timeoutMs, maxBuffer: opts.maxBuffer, signal: opts.signal },
      (err, stdout, stderr) => {
        if (err) {
          const detail = String(stderr || '').trim().split('\n').slice(-2).join(' ');
          reject(new Error(detail || err.message));
          return;
        }
        resolve(String(stdout));
      },
    );
  });

export const realReadFile: ReadFileFn = (path) => readFileFs(path, 'utf8');
