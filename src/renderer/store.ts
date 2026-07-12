import { create } from 'zustand';
import type { PaperResult, ProjectPreparation, ProjectRecord, ProjectSummary, ProjectWorkspace, RunEvent, SettingsView } from '../shared/contracts';

export type GlobalPage = 'settings' | 'memory';
export type WorkspaceTab = 'materials' | 'classification' | 'review' | 'history';

export interface AppState {
  settings?: SettingsView;
  projects: ProjectSummary[];
  workspace?: ProjectWorkspace;
  project?: ProjectRecord;
  preparation?: ProjectPreparation;
  result?: PaperResult;
  globalPage?: GlobalPage;
  workspaceTab: WorkspaceTab;
  runEvents: RunEvent[];
  setSettings(settings: SettingsView): void;
  setProjects(projects: ProjectSummary[]): void;
  refreshProjects(): Promise<ProjectSummary[]>;
  openProject(projectId: string): Promise<ProjectWorkspace>;
  setWorkspace(workspace: ProjectWorkspace): void;
  setResult(result: PaperResult): void;
  setGlobalPage(page?: GlobalPage): void;
  setWorkspaceTab(tab: WorkspaceTab): void;
  appendRunEvent(event: RunEvent): void;
}

const workspaceState = (workspace: ProjectWorkspace) => ({
  workspace,
  project: workspace.project,
  preparation: workspace.preparation,
  result: workspace.result,
  globalPage: undefined,
  runEvents: []
});

export const useAppStore = create<AppState>((set) => ({
  projects: [],
  workspaceTab: 'materials',
  runEvents: [],
  setSettings: (settings) => set({ settings }),
  setProjects: (projects) => set({ projects }),
  refreshProjects: async () => {
    const projects = await window.yinxu.listProjects();
    set({ projects });
    return projects;
  },
  openProject: async (projectId) => {
    const workspace = await window.yinxu.openProject(projectId);
    set(workspaceState(workspace));
    return workspace;
  },
  setWorkspace: (workspace) => set(workspaceState(workspace)),
  setResult: (result) => set((state) => ({ result, workspace: state.workspace ? { ...state.workspace, result } : state.workspace })),
  setGlobalPage: (globalPage) => set({ globalPage }),
  setWorkspaceTab: (workspaceTab) => set({ workspaceTab, globalPage: undefined }),
  appendRunEvent: (event) => set((state) => ({ runEvents: [...state.runEvents.filter((item) => item.projectId === event.projectId), event] }))
}));

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__yinxuDevSetState = (state) => useAppStore.setState(state);
}
