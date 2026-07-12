import { contextBridge } from 'electron';
import { ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/contracts';

const api: DesktopApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (input) => ipcRenderer.invoke('settings:save', input),
  openProviderApiKeyPage: (provider) => ipcRenderer.invoke('system:open-provider-api-key-page', provider),
  openOcrSignupPage: () => ipcRenderer.invoke('system:open-ocr-signup-page'),
  selectAndCreateProject: () => ipcRenderer.invoke('project:select-and-create'),
  getProject: (projectId) => ipcRenderer.invoke('project:get', projectId),
  getSourcePdf: (projectId) => ipcRenderer.invoke('project:get-source-pdf', projectId),
  runClassification: (projectId) => ipcRenderer.invoke('classification:run', projectId),
  saveReview: (projectId, result, feedback) => ipcRenderer.invoke('review:save', projectId, result, feedback),
  exportWorkbook: (projectId) => ipcRenderer.invoke('workbook:export', projectId),
  getMemorySnapshot: () => ipcRenderer.invoke('memory:get'),
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
