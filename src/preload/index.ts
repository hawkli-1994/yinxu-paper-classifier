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
  saveReview: (projectId, result) => ipcRenderer.invoke('review:save', projectId, result),
  exportWorkbook: (projectId) => ipcRenderer.invoke('workbook:export', projectId),
  onRunEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]): void => listener(payload);
    ipcRenderer.on('classification:event', handler);
    return () => ipcRenderer.removeListener('classification:event', handler);
  }
};

contextBridge.exposeInMainWorld('yinxu', Object.freeze(api));
