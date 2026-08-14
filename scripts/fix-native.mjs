/**
 * Post-install fixup for node-pty's Unix `spawn-helper`.
 *
 * node-pty's prebuilt tarballs extract `spawn-helper` without the executable
 * bit on macOS/Linux, which makes `pty.spawn` fail with "posix_spawnp failed".
 * We restore +x after every install. No-op on Windows (uses conpty, no helper).
 */

import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'node_modules', 'node-pty', 'prebuilds');

if (existsSync(base)) {
  for (const dir of readdirSync(base)) {
    const helper = join(base, dir, 'spawn-helper');
    if (existsSync(helper)) {
      try {
        chmodSync(helper, 0o755);
        console.log(`[fix-native] chmod +x ${dir}/spawn-helper`);
      } catch (err) {
        console.warn(`[fix-native] could not chmod ${dir}/spawn-helper:`, err.message);
      }
    }
  }
}
