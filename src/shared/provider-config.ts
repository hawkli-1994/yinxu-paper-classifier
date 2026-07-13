export const CUSTOM_PROVIDER_ID = 'custom-openai-compatible';

export const ProviderGroupId = {
  Cloud: 'cloud',
  Gateway: 'gateway',
  CodingPlan: 'coding-plan',
  Custom: 'custom'
} as const;

export type ProviderGroupId = typeof ProviderGroupId[keyof typeof ProviderGroupId];

export interface ProviderGroup {
  id: ProviderGroupId;
  label: string;
}

export interface OpenAICompatibleEndpoint {
  baseUrl: string;
  api: 'openai-completions';
}

export interface ProviderPreset {
  id: string;
  label: string;
  description: string;
  suggestedModels: string[];
  group: ProviderGroupId;
  apiKeyUrl?: string;
  /** A Pi built-in provider whose request compatibility should be reused. */
  runtimeProvider?: string;
  /** Replaces the built-in provider's default endpoint while keeping its request compatibility. */
  runtimeBaseUrlOverride?: string;
  /** A reviewed OpenAI-compatible endpoint to register for this specific preset. */
  compatibleEndpoint?: OpenAICompatibleEndpoint;
  /** Explains when a dedicated Coding Plan endpoint is being used. */
  endpointHint?: string;
}

export const providerGroups: ProviderGroup[] = [
  { id: ProviderGroupId.Cloud, label: '常用云端' },
  { id: ProviderGroupId.Gateway, label: '聚合与路由服务' },
  { id: ProviderGroupId.CodingPlan, label: 'Coding Plan 订阅' },
  { id: ProviderGroupId.Custom, label: '自定义兼容服务' }
];

export const providerPresets: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: '适合中文论文阅读、归纳和结构化输出，应用已内置连接配置。',
    suggestedModels: ['deepseek-v4-pro', 'deepseek-v4-flash'],
    group: ProviderGroupId.Cloud,
    apiKeyUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'qwen-api',
    label: '通义千问（按量 API）',
    description: 'DashScope 按量计费服务，不使用 Coding Plan 订阅额度。',
    suggestedModels: ['qwen3.5-plus', 'qwen3-coder-plus'],
    group: ProviderGroupId.Cloud,
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    compatibleEndpoint: {
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      api: 'openai-completions'
    },
    endpointHint: '按量计费接口地址：https://dashscope.aliyuncs.com/compatible-mode/v1'
  },
  {
    id: 'moonshotai-cn',
    label: 'Kimi / Moonshot（按量 API）',
    description: '使用 Moonshot 开放平台的按量计费 API，应用已内置连接配置。',
    suggestedModels: ['kimi-k2.6', 'kimi-k2.5'],
    group: ProviderGroupId.Cloud,
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    endpointHint: '按量计费接口地址：https://api.moonshot.cn/v1'
  },
  {
    id: 'minimax-cn',
    label: 'MiniMax（中国 API）',
    description: '使用 MiniMax 中国站的按量计费 API，应用已内置连接配置。',
    suggestedModels: ['MiniMax-M2.7', 'MiniMax-M3'],
    group: ProviderGroupId.Cloud,
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key'
  },
  {
    id: 'zai-api-cn',
    label: '智谱 GLM（按量 API）',
    description: '使用资源包或预付费余额，通过智谱通用按量计费接口调用。',
    suggestedModels: ['glm-5.2', 'glm-4.7'],
    group: ProviderGroupId.Cloud,
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    runtimeProvider: 'zai-coding-cn',
    runtimeBaseUrlOverride: 'https://open.bigmodel.cn/api/paas/v4',
    endpointHint: '按量计费接口地址：https://open.bigmodel.cn/api/paas/v4'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: '使用 OpenAI 官方 API，应用已内置连接配置。',
    suggestedModels: ['gpt-5', 'gpt-5-mini'],
    group: ProviderGroupId.Cloud,
    apiKeyUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: '使用 Anthropic 官方 API，对应 Claude 系列模型。',
    suggestedModels: ['claude-sonnet-4-5', 'claude-opus-4-5'],
    group: ProviderGroupId.Cloud,
    apiKeyUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'google',
    label: 'Google Gemini',
    description: '使用 Google AI Studio 提供的 Gemini API。',
    suggestedModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    group: ProviderGroupId.Cloud,
    apiKeyUrl: 'https://aistudio.google.com/apikey'
  },
  {
    id: 'groq',
    label: 'Groq',
    description: '使用 Groq 提供的模型推理服务。',
    suggestedModels: ['llama-3.3-70b-versatile'],
    group: ProviderGroupId.Cloud,
    apiKeyUrl: 'https://console.groq.com/keys'
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    description: '使用 Mistral AI 官方 API。',
    suggestedModels: ['mistral-large-latest'],
    group: ProviderGroupId.Cloud,
    apiKeyUrl: 'https://console.mistral.ai/api-keys/'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: '聚合多个模型厂商；模型 ID 通常包含厂商前缀。',
    suggestedModels: ['deepseek/deepseek-chat', 'anthropic/claude-sonnet-4-5'],
    group: ProviderGroupId.Gateway,
    apiKeyUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'kimi-coding',
    label: 'Kimi Coding Plan',
    description: 'Kimi 订阅制 Coding Plan，使用 Kimi Code 专用接口。',
    suggestedModels: ['kimi-for-coding'],
    group: ProviderGroupId.CodingPlan,
    apiKeyUrl: 'https://www.kimi.com/code/docs/',
    endpointHint: '专用接口地址：https://api.kimi.com/coding/；不使用 Moonshot 按量计费余额。'
  },
  {
    id: 'qwen-coding-plan',
    label: '通义千问 Coding Plan',
    description: '订阅制 Coding Plan，使用 DashScope 专用接口，与按量计费 API 分开使用。',
    suggestedModels: ['qwen3-coder-plus'],
    group: ProviderGroupId.CodingPlan,
    apiKeyUrl: 'https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/',
    compatibleEndpoint: {
      baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
      api: 'openai-completions'
    },
    endpointHint: '专用接口地址：https://coding.dashscope.aliyuncs.com/v1；不使用 DashScope 按量计费额度。'
  },
  {
    id: 'zai-coding-cn',
    label: '智谱 GLM Coding Plan（中国）',
    description: 'GLM Coding Plan 订阅，使用中国站 Coding 专用接口。',
    suggestedModels: ['glm-5.2', 'glm-4.7'],
    group: ProviderGroupId.CodingPlan,
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    endpointHint: '专用接口地址：https://open.bigmodel.cn/api/coding/paas/v4；不使用通用按量计费接口。'
  },
  {
    id: CUSTOM_PROVIDER_ID,
    label: '自定义兼容服务',
    description: '连接与 OpenAI Chat Completions 格式兼容的模型服务。',
    suggestedModels: [],
    group: ProviderGroupId.Custom
  }
];

export const getProviderPreset = (provider: string): ProviderPreset | undefined =>
  providerPresets.find((preset) => preset.id === provider);

export const getProviderGroup = (group: ProviderGroupId): ProviderGroup | undefined =>
  providerGroups.find((candidate) => candidate.id === group);

export const getProviderPresetsByGroup = (group: ProviderGroupId): ProviderPreset[] =>
  providerPresets.filter((preset) => preset.group === group);

export const isCustomProvider = (provider: string): boolean => provider === CUSTOM_PROVIDER_ID;

export const getProviderRuntimeId = (provider: string): string =>
  getProviderPreset(provider)?.runtimeProvider ?? provider;

export const getProviderRuntimeBaseUrlOverride = (provider: string): string | undefined =>
  getProviderPreset(provider)?.runtimeBaseUrlOverride;

export const getProviderCompatibleEndpoint = (provider: string): OpenAICompatibleEndpoint | undefined =>
  getProviderPreset(provider)?.compatibleEndpoint;

export const normalizeAgentBaseUrl = (baseUrl: string | undefined): string | undefined => {
  const normalized = baseUrl?.trim().replace(/\/+$/, '');
  return normalized || undefined;
};

export const getAgentCredentialKey = (agent: { provider: string; baseUrl?: string }): string => {
  if (isCustomProvider(agent.provider)) {
    const baseUrl = normalizeAgentBaseUrl(agent.baseUrl);
    if (!baseUrl) return 'agent:custom:unconfigured';
    return `agent:custom:${encodeURIComponent(baseUrl)}`;
  }
  return `agent:${agent.provider}`;
};
