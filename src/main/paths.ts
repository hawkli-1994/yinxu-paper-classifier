import { join } from 'node:path';

export const getProjectsDirectory = (appRoot: string): string => join(appRoot, 'projects');

export const getProjectDirectory = (appRoot: string, projectId: string): string => join(getProjectsDirectory(appRoot), projectId);

export const getMemoryDirectory = (appRoot: string): string => join(appRoot, 'memory');

export const getExportsDirectory = (appRoot: string): string => join(appRoot, 'exports');
