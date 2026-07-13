import { LinkOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Divider, Form, Input, Radio, Select, Space, Tag, Typography, message } from 'antd';
import type { SettingsInput } from '../../../shared/contracts';
import {
  CUSTOM_PROVIDER_ID,
  ProviderGroupId,
  getProviderGroup,
  getProviderPreset,
  getProviderPresetsByGroup,
  isCustomProvider,
  normalizeAgentBaseUrl,
  providerGroups
} from '../../../shared/provider-config';
import { useAppStore } from '../../store';

interface SettingsFormValues {
  provider: string;
  baseUrl?: string;
  modelId: string;
  thinkingLevel: SettingsInput['agent']['thinkingLevel'];
  agentApiKey?: string;
  ocrMode: SettingsInput['ocr']['mode'];
  ocrBaseUrl: string;
  ocrModel: string;
  ocrApiKey?: string;
}

const providerSelectOptions = providerGroups.map((group) => ({
  label: group.label,
  options: getProviderPresetsByGroup(group.id).map((preset) => ({
    value: preset.id,
    label: preset.label
  }))
}));

const providerGroupTagColor: Record<ProviderGroupId, string> = {
  [ProviderGroupId.Cloud]: 'blue',
  [ProviderGroupId.Gateway]: 'cyan',
  [ProviderGroupId.CodingPlan]: 'purple',
  [ProviderGroupId.Custom]: 'gold'
};

const ocrSuggestedModels = [
  { id: 'deepseek-ai/DeepSeek-OCR', label: 'DeepSeek-OCR（PDF 直传）' },
  { id: 'PaddlePaddle/PaddleOCR-VL-1.5', label: 'PaddleOCR-VL-1.5（自动转 PNG）' }
];

const thinkingLevelOptions: Array<{ value: SettingsInput['agent']['thinkingLevel']; label: string }> = [
  { value: 'off', label: '关闭' },
  { value: 'minimal', label: '最低' },
  { value: 'low', label: '较低' },
  { value: 'medium', label: '标准' },
  { value: 'high', label: '较高' },
  { value: 'xhigh', label: '最高' }
];

const ocrModeDescriptions: Record<SettingsInput['ocr']['mode'], { type: 'info' | 'success' | 'warning'; message: string }> = {
  auto: {
    type: 'info',
    message: '自动模式：系统先检测需要识别的页面，并优先使用云端 OCR。云端服务不可用或识别质量不足时，改用本地解析结果。未配置 API Key 时仅使用本地解析。'
  },
  local: {
    type: 'success',
    message: '本地模式：仅在当前设备上解析 PDF，论文内容不会发送到 OCR 服务。纯图像扫描页可能无法完整识别，需要人工复核。'
  },
  cloud: {
    type: 'warning',
    message: '云端模式：论文的每一页都会发送到云端 OCR 服务，必须配置 API Key。云端识别失败时将停止导入，不会改用本地解析结果。'
  }
};

export const SettingsPage = (): React.JSX.Element => {
  const [form] = Form.useForm<SettingsFormValues>();
  const [saving, setSaving] = useState(false);
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const selectedProvider = Form.useWatch('provider', form);
  const selectedBaseUrl = Form.useWatch('baseUrl', form);
  const selectedModelId = Form.useWatch('modelId', form);
  const selectedOcrMode = Form.useWatch('ocrMode', form) ?? 'auto';
  const selectedOcrModel = Form.useWatch('ocrModel', form);
  const providerPreset = getProviderPreset(selectedProvider ?? '');
  const providerGroup = providerPreset ? getProviderGroup(providerPreset.group) : undefined;
  const hasAgentKeyForSelection = Boolean(
    settings?.hasAgentKey &&
      selectedProvider === settings.agent.provider &&
      (!isCustomProvider(selectedProvider ?? '') || normalizeAgentBaseUrl(selectedBaseUrl) === settings.agent.baseUrl)
  );

  useEffect(() => {
    if (!settings) return;
    form.setFieldsValue({
      provider: settings.agent.provider,
      baseUrl: settings.agent.baseUrl,
      modelId: settings.agent.modelId,
      thinkingLevel: settings.agent.thinkingLevel,
      ocrMode: settings.ocr.mode,
      ocrBaseUrl: settings.ocr.baseUrl,
      ocrModel: settings.ocr.model
    });
  }, [form, settings]);

  const save = async (values: SettingsFormValues): Promise<void> => {
    setSaving(true);
    try {
      const latestSettings = await window.yinxu.getSettings();
      const updated = await window.yinxu.saveSettings({
        agent: {
          provider: values.provider.trim(),
          modelId: values.modelId.trim(),
          thinkingLevel: values.thinkingLevel,
          baseUrl: isCustomProvider(values.provider) ? normalizeAgentBaseUrl(values.baseUrl) : undefined
        },
        ocr: { mode: values.ocrMode, baseUrl: values.ocrBaseUrl.trim(), model: values.ocrModel.trim() },
        memory: latestSettings.memory,
        agentApiKey: values.agentApiKey,
        ocrApiKey: values.ocrApiKey
      });
      setSettings(updated);
      form.setFieldsValue({ agentApiKey: '', ocrApiKey: '' });
      message.success('设置已保存在本地。');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存设置失败。');
    } finally {
      setSaving(false);
    }
  };

  const useSuggestedModel = (modelId: string): void => {
    form.setFieldValue('modelId', modelId);
  };

  const useSuggestedOcrModel = (modelId: string): void => {
    form.setFieldValue('ocrModel', modelId);
  };

  const openApiKeyPage = async (): Promise<void> => {
    if (!providerPreset) return;
    try {
      await window.yinxu.openProviderApiKeyPage(providerPreset.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '打开 API Key 获取页面失败。');
    }
  };

  const openOcrSignupPage = async (): Promise<void> => {
    try {
      await window.yinxu.openOcrSignupPage();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '打开硅基流动注册页面失败。');
    }
  };

  return (
    <section className="page-section">
      <Typography.Title level={2}>AI 模型与 OCR 设置</Typography.Title>
      <Typography.Paragraph type="secondary">可选择按量计费的 API、聚合服务或 Coding Plan 订阅。Coding Plan 使用服务商的专用接口，其凭据与按量计费 API 分开保存。只有选择“自定义兼容服务”时需要填写服务地址。</Typography.Paragraph>
      <Alert className="section-alert" type="info" showIcon message="在 Windows 中，API 凭据保存在当前用户的系统安全存储中。在 macOS 开发预览环境中，如果系统安全存储不可用，凭据仅在当前运行期间保留。凭据不会写入论文项目或导出的 Excel 文件。" />
      <Form form={form} layout="vertical" onFinish={save} initialValues={{ thinkingLevel: 'medium', ocrMode: 'auto', ocrBaseUrl: 'https://api.siliconflow.cn/v1', ocrModel: 'PaddlePaddle/PaddleOCR-VL-1.5' }}>
        <Card title="AI 分类模型" className="academic-card">
          <div className="form-grid">
            <Form.Item label="模型服务" name="provider" rules={[{ required: true, message: '请选择模型服务或自定义兼容服务。' }]}>
              <Select
                placeholder="选择模型服务"
                options={providerSelectOptions}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
            {providerPreset && (
              <Card className="provider-summary-card" size="small" bordered={false}>
                <div className="provider-summary-content">
                  <div>
                    <Space size={8} wrap>
                      <Typography.Text strong>{providerPreset.label}</Typography.Text>
                      {providerGroup && <Tag color={providerGroupTagColor[providerPreset.group]}>{providerGroup.label}</Tag>}
                    </Space>
                    <Typography.Paragraph type="secondary" className="provider-summary-description">
                      {providerPreset.description}
                    </Typography.Paragraph>
                    {providerPreset.endpointHint && (
                      <Typography.Paragraph type="secondary" className="provider-endpoint-hint">
                        {providerPreset.endpointHint}
                      </Typography.Paragraph>
                    )}
                  </div>
                  {providerPreset.apiKeyUrl ? (
                    <Button type="link" icon={<LinkOutlined />} onClick={() => void openApiKeyPage()}>
                      获取 {providerPreset.label} API Key
                    </Button>
                  ) : (
                    <Typography.Text type="secondary" className="provider-summary-note">请在所选服务的管理后台获取 API Key。</Typography.Text>
                  )}
                </div>
              </Card>
            )}
            {isCustomProvider(selectedProvider ?? '') && (
              <Form.Item
                label="服务地址（Base URL）"
                name="baseUrl"
                rules={[
                  { required: true, message: '请填写兼容服务的 Base URL。' },
                  { type: 'url', message: '请输入完整 URL，例如 https://gateway.example.com/v1。' }
                ]}
                extra="请填写与 OpenAI Chat Completions 兼容的服务根地址。系统会自动去除地址末尾的斜杠。"
              >
                <Input placeholder="https://gateway.example.com/v1" autoComplete="url" />
              </Form.Item>
            )}
            <div className="model-id-field">
              <Form.Item label="模型 ID" htmlFor="agent-model-id" name="modelId" rules={[{ required: true, message: '请输入模型 ID。' }]} extra={providerPreset?.suggestedModels.length ? '可直接点击下方候选项，也可手动填写服务商提供的模型 ID。' : '请填写该兼容服务实际提供的模型 ID。'}>
                <Input id="agent-model-id" placeholder={providerPreset?.suggestedModels[0] ?? '由服务端提供的模型 ID'} autoComplete="off" />
              </Form.Item>
              {providerPreset?.suggestedModels.length ? (
                <div className="model-suggestion-list" aria-label="推荐模型候选">
                  <Typography.Text type="secondary" className="model-suggestion-label">推荐模型</Typography.Text>
                  <Space size={[8, 8]} wrap>
                    {providerPreset.suggestedModels.map((modelId) => (
                      <Button
                        key={modelId}
                        size="small"
                        type={selectedModelId === modelId ? 'primary' : 'default'}
                        className="model-suggestion-button"
                        onClick={() => useSuggestedModel(modelId)}
                      >
                        {modelId}
                      </Button>
                    ))}
                  </Space>
                </div>
              ) : null}
            </div>
            <Form.Item label="分析强度" name="thinkingLevel" extra="较高的分析强度可能提高复杂论文的分类质量，同时会增加处理时间和模型用量。">
              <Select options={thinkingLevelOptions} />
            </Form.Item>
            <Form.Item label={hasAgentKeyForSelection ? '更换 API Key（已保存，如无需更换可留空）' : 'API Key'} name="agentApiKey" rules={hasAgentKeyForSelection ? [] : [{ required: true, message: '请输入当前模型服务的 API Key。' }]}>
              <Input.Password placeholder="不同模型服务的凭据分别保存" autoComplete="new-password" />
            </Form.Item>
          </div>
        </Card>
        <Divider />
        <Card title="PDF 文字识别（OCR）" className="academic-card">
          <Form.Item label="OCR 执行模式" name="ocrMode" rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: '自动', value: 'auto' },
                { label: '本地', value: 'local' },
                { label: '云端', value: 'cloud' }
              ]}
            />
          </Form.Item>
          <Alert
            className="section-alert compact-alert"
            showIcon
            type={ocrModeDescriptions[selectedOcrMode].type}
            message={ocrModeDescriptions[selectedOcrMode].message}
          />
          <div className="form-grid">
            <Form.Item label="云端 OCR 服务地址" name="ocrBaseUrl" rules={selectedOcrMode === 'local' ? [] : [{ required: true, message: '请填写云端 OCR 服务地址。' }]}>
              <Input disabled={selectedOcrMode === 'local'} />
            </Form.Item>
            <div className="model-id-field">
              <Form.Item label="OCR 模型" name="ocrModel" rules={selectedOcrMode === 'local' ? [] : [{ required: true, message: '请填写 OCR 模型。' }]} extra="PaddleOCR-VL-1.5 会在本机将待识别页转换为 PNG，再发送至 SiliconFlow。">
                <Input disabled={selectedOcrMode === 'local'} />
              </Form.Item>
              <div className="model-suggestion-list" aria-label="推荐 OCR 模型">
                <Typography.Text type="secondary" className="model-suggestion-label">推荐 OCR 模型</Typography.Text>
                <Space size={[8, 8]} wrap>
                  {ocrSuggestedModels.map((model) => (
                    <Button
                      key={model.id}
                      size="small"
                      type={selectedOcrModel === model.id ? 'primary' : 'default'}
                      className="model-suggestion-button"
                      disabled={selectedOcrMode === 'local'}
                      onClick={() => useSuggestedOcrModel(model.id)}
                    >
                      {model.label}
                    </Button>
                  ))}
                </Space>
              </div>
            </div>
            <Form.Item
              label={
                <Space size={4}>
                  <span>{settings?.hasOcrKey ? '更换 OCR API Key（已保存，如无需更换可留空）' : 'OCR API Key'}</span>
                  <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => void openOcrSignupPage()}>注册并获取 API Key</Button>
                </Space>
              }
              name="ocrApiKey"
              rules={selectedOcrMode === 'cloud' && !settings?.hasOcrKey ? [{ required: true, message: '云端 OCR 模式必须配置 API Key。' }] : []}
            >
              <Input.Password
                disabled={selectedOcrMode === 'local'}
                placeholder={selectedOcrMode === 'cloud' ? '必填：所有页面均使用云端 OCR' : '可选：自动模式优先使用云端 OCR'}
                autoComplete="new-password"
              />
            </Form.Item>
          </div>
        </Card>
        <Space>
          <Button type="primary" htmlType="submit" loading={saving}>保存设置</Button>
          <Typography.Text type="secondary">模型与 OCR 设置仅影响后续分类任务。全局分类指导请在“全局规则与记忆”中管理。</Typography.Text>
        </Space>
      </Form>
    </section>
  );
};
