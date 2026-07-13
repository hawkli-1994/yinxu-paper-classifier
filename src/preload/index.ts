import { contextBridge } from 'electron';
import { ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/contracts';

const api: DesktopApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (input) => ipcRenderer.invoke('settings:save', input),
  openProviderApiKeyPage: (provider) => ipcRenderer.invoke('system:open-provider-api-key-page', provider),
  openOcrSignupPage: () => ipcRenderer.invoke('system:open-ocr-signup-page'),
  selectPrimaryPaper: () => ipcRenderer.invoke('project:select-primary'),
  selectSupplementalFiles: () => ipcRenderer.invoke('project:select-supplements'),
  createProject: (input) => ipcRenderer.invoke('project:create', input),
  listProjects: () => ipcRenderer.invoke('project:list'),
  openProject: (projectId) => ipcRenderer.invoke('project:open', projectId),
  deleteProject: (projectId) => ipcRenderer.invoke('project:delete', projectId),
  getProject: (projectId) => ipcRenderer.invoke('project:get', projectId),
  getSourcePdf: (projectId) => ipcRenderer.invoke('project:get-source-pdf', projectId),
  addSupplementalFiles: (projectId, files) => ipcRenderer.invoke('project:add-supplement-files', projectId, files),
  addSupplementalNote: (projectId, note) => ipcRenderer.invoke('project:add-supplement-note', projectId, note),
  removeSupplementalMaterial: (projectId, materialId) => ipcRenderer.invoke('project:remove-supplement', projectId, materialId),
  runClassification: (projectId) => ipcRenderer.invoke('classification:run', projectId),
  cancelClassification: (projectId) => ipcRenderer.invoke('classification:cancel', projectId),
  saveReview: (projectId, result, feedback) => ipcRenderer.invoke('review:save', projectId, result, feedback),
  exportWorkbook: (projectId) => ipcRenderer.invoke('workbook:export', projectId),
  activateResultRevision: (projectId, revisionId) => ipcRenderer.invoke('project:activate-revision', projectId, revisionId),
  getMemorySnapshot: () => ipcRenderer.invoke('memory:get'),
  updateGlobalMemorySettings: (input) => ipcRenderer.invoke('memory:settings-update', input),
  rollbackGlobalMemorySettings: () => ipcRenderer.invoke('memory:settings-rollback'),
  createPersonalRule: (input) => ipcRenderer.invoke('memory:rule-create', input),
  updatePersonalRule: (ruleId, input) => ipcRenderer.invoke('memory:rule-update', ruleId, input),
  deletePersonalRule: (ruleId) => ipcRenderer.invoke('memory:rule-delete', ruleId),
  rollbackPersonalRule: (ruleId) => ipcRenderer.invoke('memory:rule-rollback', ruleId),
  approveCandidateRule: (candidateId) => ipcRenderer.invoke('memory:candidate-approve', candidateId),
  rejectCandidateRule: (candidateId) => ipcRenderer.invoke('memory:candidate-reject', candidateId),
  clearFeedbackMemory: () => ipcRenderer.invoke('memory:feedback-clear'),
  exportMemory: () => ipcRenderer.invoke('memory:export'),
  onRunEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]): void => listener(payload);
    ipcRenderer.on('classification:event', handler);
    return () => ipcRenderer.removeListener('classification:event', handler);
  }
};

contextBridge.exposeInMainWorld('yinxu', Object.freeze(api));
