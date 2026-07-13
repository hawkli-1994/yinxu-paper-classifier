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
  deleteProject(projectId: string): Promise<ProjectSummary[]>;
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

export const mergeRunEvent = (events: RunEvent[], event: RunEvent): RunEvent[] => {
  const sameRun = events.filter((item) => item.projectId === event.projectId && item.runId === event.runId);
  if (event.phase === 'started') return [event];
  const existingIndex = sameRun.findIndex((item) => item.phase === event.phase);
  if (existingIndex < 0) return [...sameRun, event];
  return sameRun.map((item, index) => index === existingIndex ? event : item);
};

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
  deleteProject: async (projectId) => {
    const before = useAppStore.getState();
    const deletedIndex = before.projects.findIndex((project) => project.id === projectId);
    const projects = await window.yinxu.deleteProject(projectId);
    if (before.workspace?.project.id !== projectId) {
      set({ projects });
      return projects;
    }
    const nextProject = projects[Math.min(Math.max(0, deletedIndex), Math.max(0, projects.length - 1))];
    if (nextProject) {
      const workspace = await window.yinxu.openProject(nextProject.id);
      set({ projects, ...workspaceState(workspace), globalPage: before.globalPage });
    } else {
      set({ projects, workspace: undefined, project: undefined, preparation: undefined, result: undefined, runEvents: [], globalPage: before.globalPage });
    }
    return projects;
  },
  setWorkspace: (workspace) => set(workspaceState(workspace)),
  setResult: (result) => set((state) => ({ result, workspace: state.workspace ? { ...state.workspace, result } : state.workspace })),
  setGlobalPage: (globalPage) => set({ globalPage }),
  setWorkspaceTab: (workspaceTab) => set({ workspaceTab, globalPage: undefined }),
  appendRunEvent: (event) => set((state) => ({ runEvents: mergeRunEvent(state.runEvents, event) }))
}));

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__yinxuDevSetState = (state) => useAppStore.setState(state);
}
