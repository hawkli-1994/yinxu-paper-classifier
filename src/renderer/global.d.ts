import type { DesktopApi } from '../shared/contracts';
import type { AppState } from './store';

declare global {
  interface Window {
    yinxu: DesktopApi;
    __yinxuDevSetState?: (state: Partial<AppState>) => void;
  }
}

export {};
