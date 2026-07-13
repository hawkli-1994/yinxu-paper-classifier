import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { safeStorage } from 'electron';

export interface CredentialCrypto {
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}

export interface CredentialVault {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  readRaw(): Promise<string>;
}

type StoredCredentials = Record<string, string>;

const sessionCredentials = new Map<string, string>();

const getFilePath = (root: string): string => join(root, 'config', 'credentials.json');

const load = async (filePath: string): Promise<StoredCredentials> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as StoredCredentials;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
};

export const createCredentialVault = (root: string, crypto: CredentialCrypto): CredentialVault => {
  const filePath = getFilePath(root);
  return {
    async get(key) {
      const credentials = await load(filePath);
      const encoded = credentials[key];
      return encoded ? crypto.decrypt(Buffer.from(encoded, 'base64')) : undefined;
    },
    async set(key, value) {
      const credentials = await load(filePath);
      credentials[key] = crypto.encrypt(value).toString('base64');
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(credentials, null, 2)}\n`, 'utf8');
    },
    async remove(key) {
      const credentials = await load(filePath);
      delete credentials[key];
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(credentials, null, 2)}\n`, 'utf8');
    },
    async readRaw() {
      try {
        return await readFile(filePath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
        throw error;
      }
    }
  };
};

export const createSessionCredentialVault = (): CredentialVault => ({
  async get(key) {
    return sessionCredentials.get(key);
  },
  async set(key, value) {
    sessionCredentials.set(key, value);
  },
  async remove(key) {
    sessionCredentials.delete(key);
  },
  async readRaw() {
    return '';
  }
});

export const createElectronCredentialVault = (root: string): CredentialVault => {
  if (!safeStorage.isEncryptionAvailable()) {
    if (process.platform === 'win32') throw new Error('Windows 系统凭据加密功能不可用。');
    return createSessionCredentialVault();
  }
  return createCredentialVault(root, {
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value)
  });
};
