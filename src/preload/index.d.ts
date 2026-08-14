import type { WhetstoneApi } from '@shared/ipc';

declare global {
  interface Window {
    whetstone: WhetstoneApi;
  }
}

export {};
