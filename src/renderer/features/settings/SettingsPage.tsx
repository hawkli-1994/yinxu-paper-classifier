import { LinkOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Divider, Form, Input, Select, Space, Tag, Typography, message } from 'antd';
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

export const SettingsPage = (): React.JSX.Element => {
  const [form] = Form.useForm<SettingsFormValues>();
  const [saving, setSaving] = useState(false);
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const selectedProvider = Form.useWatch('provider', form);
  const selectedBaseUrl = Form.useWatch('baseUrl', form);
  const selectedModelId = Form.useWatch('modelId', form);
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
      ocrBaseUrl: settings.ocr.baseUrl,
      ocrModel: settings.ocr.model
    });
  }, [form, settings]);

  const save = async (values: SettingsFormValues): Promise<void> => {
    setSaving(true);
    try {
      const updated = await window.yinxu.saveSettings({
        agent: {
          provider: values.provider.trim(),
          modelId: values.modelId.trim(),
          thinkingLevel: values.thinkingLevel,
          baseUrl: isCustomProvider(values.provider) ? normalizeAgentBaseUrl(values.baseUrl) : undefined
        },
        ocr: { baseUrl: values.ocrBaseUrl.trim(), model: values.ocrModel.trim() },
        agentApiKey: values.agentApiKey,
        ocrApiKey: values.ocrApiKey
      });
      setSettings(updated);
      form.setFieldsValue({ agentApiKey: '', ocrApiKey: '' });
      message.success('设置已保存到本机。');
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
      message.error(error instanceof Error ? error.message : '无法打开 API Key 页面。');
    }
  };

  const openOcrSignupPage = async (): Promise<void> => {
    try {
      await window.yinxu.openOcrSignupPage();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '无法打开 SiliconFlow 注册页面。');
    }
  };

  return (
    <section className="page-section">
      <Typography.Title level={2}>模型与 OCR 设置</Typography.Title>
      <Typography.Paragraph type="secondary">从按量 API、聚合服务或 Coding Plan 订阅中选择。Coding Plan 会固定使用对应厂商的专用端点，并与按量 API 分开保存凭据；只有“自定义兼容端点”需要填写 Base URL。</Typography.Paragraph>
      <Alert className="section-alert" type="info" showIcon message="Windows 中凭据保存在当前用户的系统安全存储；macOS 开发预览若系统安全存储不可用，凭据只保留到本次应用关闭。凭据不会写入论文项目或 Excel。" />
      <Form form={form} layout="vertical" onFinish={save} initialValues={{ thinkingLevel: 'medium', ocrBaseUrl: 'https://api.siliconflow.cn/v1', ocrModel: 'PaddlePaddle/PaddleOCR-VL-1.5' }}>
        <Card title="Pi Agent 模型" className="academic-card">
          <div className="form-grid">
            <Form.Item label="模型厂商" name="provider" rules={[{ required: true, message: '请选择模型厂商或自定义兼容端点。' }]}>
              <Select
                placeholder="选择厂商"
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
                    <Typography.Text type="secondary" className="provider-summary-note">请在所用兼容服务的控制台获取 API Key。</Typography.Text>
                  )}
                </div>
              </Card>
            )}
            {isCustomProvider(selectedProvider ?? '') && (
              <Form.Item
                label="Base URL"
                name="baseUrl"
                rules={[
                  { required: true, message: '请填写兼容服务的 Base URL。' },
                  { type: 'url', message: '请输入完整 URL，例如 https://gateway.example.com/v1。' }
                ]}
                extra="应指向 OpenAI Chat Completions 兼容服务的根地址；系统会自动去除结尾的 /。"
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
            <Form.Item label="思考强度" name="thinkingLevel">
              <Select options={['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item label={hasAgentKeyForSelection ? '新的 API Key（当前配置已保存，可留空）' : 'API Key'} name="agentApiKey" rules={hasAgentKeyForSelection ? [] : [{ required: true, message: '请输入当前厂商或端点的 API Key。' }]}>
              <Input.Password placeholder="按厂商或自定义 Base URL 分开保存" autoComplete="new-password" />
            </Form.Item>
          </div>
        </Card>
        <Divider />
        <Card title="扫描件 OCR" className="academic-card">
          <div className="form-grid">
            <Form.Item label="OCR 服务地址" name="ocrBaseUrl" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <div className="model-id-field">
              <Form.Item label="OCR 模型" name="ocrModel" rules={[{ required: true }]} extra="PaddleOCR-VL-1.5 会在本机将每个待识别 PDF 页转换为 PNG，再发送至 SiliconFlow。">
                <Input />
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
                  <span>{settings?.hasOcrKey ? '新的 OCR API Key（已保存，可留空）' : 'OCR API Key'}</span>
                  <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => void openOcrSignupPage()}>注册 / 获取 Key</Button>
                </Space>
              }
              name="ocrApiKey"
              rules={settings?.hasOcrKey ? [] : [{ required: true, message: '扫描件 OCR 需要 API Key。' }]}
            >
              <Input.Password placeholder="OCR 仅在扫描页需要时调用" autoComplete="new-password" />
            </Form.Item>
          </div>
        </Card>
        <Space>
          <Button type="primary" htmlType="submit" loading={saving}>保存设置</Button>
          <Typography.Text type="secondary">保存后即可导入论文。</Typography.Text>
        </Space>
      </Form>
    </section>
  );
};
