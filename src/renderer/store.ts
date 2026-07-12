import { create } from 'zustand';
import type { PaperResult, ProjectPreparation, ProjectRecord, RunEvent, SettingsView } from '../shared/contracts';

export type PageKey = 'settings' | 'import' | 'process' | 'review';

export interface AppState {
  activePage: PageKey;
  settings?: SettingsView;
  project?: ProjectRecord;
  preparation?: ProjectPreparation;
  result?: PaperResult;
  runEvents: RunEvent[];
  setActivePage(page: PageKey): void;
  setSettings(settings: SettingsView): void;
  setPreparation(preparation: ProjectPreparation): void;
  setResult(result: PaperResult): void;
  appendRunEvent(event: RunEvent): void;
}

export const useAppStore = create<AppState>((set) => ({
  activePage: 'settings',
  runEvents: [],
  setActivePage: (activePage) => set({ activePage }),
  setSettings: (settings) => set({ settings }),
  setPreparation: (preparation) => set({ preparation, project: preparation.project, runEvents: [] }),
  setResult: (result) => set({ result }),
  appendRunEvent: (event) => set((state) => ({ runEvents: [...state.runEvents, event] }))
}));

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__yinxuDevSetState = (state) => useAppStore.setState(state);
}
