import { describe, expect, it } from 'vitest';
import {
  CUSTOM_PROVIDER_ID,
  getAgentCredentialKey,
  getProviderCompatibleEndpoint,
  getProviderPresetsByGroup,
  getProviderPreset,
  getProviderRuntimeId,
  normalizeAgentBaseUrl,
  ProviderGroupId,
  providerGroups,
  providerPresets
} from '../../src/shared/provider-config';

describe('provider configuration', () => {
  it('offers a curated built-in provider list plus a custom compatible endpoint', () => {
    expect(providerPresets.some((preset) => preset.id === 'openai')).toBe(true);
    expect(getProviderPreset(CUSTOM_PROVIDER_ID)?.label).toContain('自定义');
  });

  it('groups providers for selection and gives every built-in provider an API Key entry', () => {
    expect(providerGroups.map((group) => group.id)).toEqual([
      ProviderGroupId.Cloud,
      ProviderGroupId.Gateway,
      ProviderGroupId.CodingPlan,
      ProviderGroupId.Custom
    ]);
    expect(getProviderPresetsByGroup(ProviderGroupId.Gateway).map((preset) => preset.id)).toContain('openrouter');
    expect(
      providerPresets
        .filter((preset) => preset.id !== CUSTOM_PROVIDER_ID)
        .every((preset) => Boolean(preset.apiKeyUrl))
    ).toBe(true);
  });

  it('keeps Coding Plan providers separate from metered endpoints and credentials', () => {
    expect(getProviderPreset('kimi-coding')?.group).toBe(ProviderGroupId.CodingPlan);
    expect(getProviderPreset('kimi-coding')?.endpointHint).toContain('专用端点');
    expect(getProviderCompatibleEndpoint('qwen-coding-plan')?.baseUrl).toBe('https://coding.dashscope.aliyuncs.com/v1');
    expect(getProviderRuntimeId('zai-api-cn')).toBe('zai-coding-cn');
    expect(getAgentCredentialKey({ provider: 'moonshotai-cn' })).not.toBe(getAgentCredentialKey({ provider: 'kimi-coding' }));
  });

  it('normalizes custom endpoint addresses and scopes their stored key to the endpoint', () => {
    expect(normalizeAgentBaseUrl(' https://gateway.example.com/v1/ ')).toBe('https://gateway.example.com/v1');
    expect(
      getAgentCredentialKey({ provider: CUSTOM_PROVIDER_ID, baseUrl: 'https://gateway.example.com/v1/' })
    ).toBe('agent:custom:https%3A%2F%2Fgateway.example.com%2Fv1');
  });

  it('keeps built-in provider credentials on their provider identity', () => {
    expect(getAgentCredentialKey({ provider: 'deepseek' })).toBe('agent:deepseek');
  });
});
