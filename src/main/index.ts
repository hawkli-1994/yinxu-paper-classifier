import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { APP_NAME } from '../shared/contracts';
import { registerIpcHandlers } from './ipc';
import { ensureKnowledgePackage } from './resource-service';

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    title: APP_NAME,
    width: 1280,
    minWidth: 980,
    height: 860,
    minHeight: 680,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.once('ready-to-show', () => window.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
};

void app.whenReady().then(async () => {
  app.setName(APP_NAME);
  const appRoot = app.getPath('userData');
  const knowledgePackage = await ensureKnowledgePackage(appRoot);
  registerIpcHandlers(appRoot, knowledgePackage);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
