import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCredentialVault, createSessionCredentialVault, type CredentialCrypto } from '../../src/main/credentials-service';

const roots: string[] = [];

const testCrypto: CredentialCrypto = {
  encrypt: (value) => Buffer.from(`secured:${value}`),
  decrypt: (value) => value.toString('utf8').replace('secured:', '')
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('credential vault', () => {
  it('stores a credential without persisting plaintext', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yinxu-credentials-'));
    roots.push(root);
    const vault = createCredentialVault(root, testCrypto);

    await vault.set('agent:openai', 'secret-key');

    expect(await vault.get('agent:openai')).toBe('secret-key');
    expect(await vault.readRaw()).not.toContain('secret-key');
  });

  it('keeps development preview credentials in memory when OS secure storage is unavailable', async () => {
    const vault = createSessionCredentialVault();

    await vault.set('agent:openai', 'preview-key');

    expect(await vault.get('agent:openai')).toBe('preview-key');
    expect(await vault.readRaw()).toBe('');
  });
});
