import { CheckOutlined, DeleteOutlined, EditOutlined, ExportOutlined, RollbackOutlined, StopOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Form, Input, List, Popconfirm, Radio, Row, Select, Space, Switch, Tag, Typography, message } from 'antd';
import type { GlobalMemorySettings, MemorySnapshot, PersonalRule, PersonalRuleInput, RuleScope } from '../../../shared/contracts';
import { listLeafCategories } from '../../../shared/taxonomy';
import { useAppStore } from '../../store';

interface RuleFormValues {
  title: string;
  text: string;
  enabled: boolean;
  scope: RuleScope;
  keywords: string;
  fromCategoryCode?: string;
  targetCategoryCode?: string;
}

const categoryOptions = listLeafCategories().map((category) => ({ value: category.code, label: `${category.code} ${category.label}` }));

const toInput = (rule: PersonalRule): PersonalRuleInput => ({
  title: rule.title,
  text: rule.text,
  enabled: rule.enabled,
  scope: rule.scope,
  triggerKeywords: rule.triggerKeywords,
  fromCategoryCode: rule.fromCategoryCode,
  targetCategoryCode: rule.targetCategoryCode
});

const toFormValues = (rule: PersonalRule): RuleFormValues => ({
  ...rule,
  keywords: rule.triggerKeywords.join('、')
});

const fromFormValues = (values: RuleFormValues): PersonalRuleInput => ({
  title: values.title,
  text: values.text,
  enabled: values.enabled,
  scope: values.scope,
  triggerKeywords: (values.keywords ?? '').split(/[；;，,、\s]+/).filter(Boolean),
  fromCategoryCode: values.fromCategoryCode?.trim() || undefined,
  targetCategoryCode: values.targetCategoryCode?.trim() || undefined
});

export const MemoryPage = (): React.JSX.Element => {
  const [form] = Form.useForm<RuleFormValues>();
  const [guidanceForm] = Form.useForm<Pick<GlobalMemorySettings, 'enabled' | 'globalGuidance'>>();
  const [snapshot, setSnapshot] = useState<MemorySnapshot>();
  const [editingId, setEditingId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const appSettings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const selectedRuleScope = Form.useWatch('scope', form) ?? 'conditional';

  const applySnapshot = (next: MemorySnapshot): void => {
    setSnapshot(next);
    guidanceForm.setFieldsValue({ enabled: next.settings.enabled, globalGuidance: next.settings.globalGuidance });
    if (appSettings) setSettings({ ...appSettings, memory: next.settings });
  };

  const refresh = async (): Promise<void> => {
    try {
      applySnapshot(await window.yinxu.getMemorySnapshot());
    } catch (error) {
      message.error(error instanceof Error ? error.message : '无法读取全局规则与记忆。');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const runMutation = async (action: () => Promise<MemorySnapshot>, success: string): Promise<boolean> => {
    setBusy(true);
    try {
      applySnapshot(await action());
      message.success(success);
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败。');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveRule = async (values: RuleFormValues): Promise<void> => {
    const input = fromFormValues(values);
    const saved = await runMutation(
      () => editingId ? window.yinxu.updatePersonalRule(editingId, input) : window.yinxu.createPersonalRule(input),
      editingId ? '跨项目规则已更新并保留旧版本。' : '跨项目规则已创建。'
    );
    if (saved) {
      setEditingId(undefined);
      form.resetFields();
    }
  };

  const saveGlobalGuidance = async (values: Pick<GlobalMemorySettings, 'enabled' | 'globalGuidance'>): Promise<void> => {
    await runMutation(() => window.yinxu.updateGlobalMemorySettings(values), '全局分类指导已保存为新版本。');
  };

  const edit = (rule: PersonalRule): void => {
    setEditingId(rule.id);
    form.setFieldsValue(toFormValues(rule));
  };

  const exportAll = async (): Promise<void> => {
    try {
      const path = await window.yinxu.exportMemory();
      message.success(`记忆已导出：${path}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败。');
    }
  };

  if (!snapshot) return <Empty description="正在读取全局规则与跨项目反馈" />;
  const pendingCandidates = snapshot.candidateRules.filter((candidate) => candidate.status === 'pending');

  return (
    <section className="page-section">
      <Typography.Title level={2}>规则与记忆</Typography.Title>
      <Typography.Paragraph type="secondary">这里维护项目之上的全局分类指导、跨项目反馈记忆和个人规则。启用的内容会影响后续所有论文项目，并保留可审计版本。</Typography.Paragraph>
      <Alert type="warning" showIcon className="section-alert" message="跨项目规则不能覆盖论文原文、专家分类体系、证据要求或安全边界；规则冲突会自动降低置信度并要求人工复核。" />

      <Card
        title={<Space wrap><Typography.Text strong>全局分类指导与记忆</Typography.Text><Tag color="blue">v{snapshot.settings.revision}</Tag><Tag color={snapshot.settings.enabled ? 'green' : 'default'}>{snapshot.settings.enabled ? '对所有后续项目启用' : '已停用'}</Tag></Space>}
        className="academic-card"
        extra={<Button icon={<RollbackOutlined />} disabled={!snapshot.settings.history.length || busy} onClick={() => void runMutation(() => window.yinxu.rollbackGlobalMemorySettings(), '已回滚全局分类指导。')}>回滚上一版本</Button>}
      >
        <Form form={guidanceForm} layout="vertical" onFinish={saveGlobalGuidance} initialValues={{ enabled: snapshot.settings.enabled, globalGuidance: snapshot.settings.globalGuidance }}>
          <Form.Item name="enabled" label="跨项目生效状态" valuePropName="checked" extra="关闭后，后续分类不会检索全局指导、个人规则或历史反馈；已有数据不会删除。">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <Form.Item name="globalGuidance" label="全局分类指导原则" extra="适合长期有效的总原则；会参与后续所有论文分类。具体条件建议创建为下方可追踪规则。最多 8000 字。">
            <Input.TextArea rows={5} maxLength={8000} showCount placeholder="例如：涉及多种材料时，以论文的核心研究问题确定主类，材料类型只作为互见。" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>保存全局指导新版本</Button>
        </Form>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={9}>
          <Card title={editingId ? '编辑跨项目规则' : '新建跨项目规则'} className="academic-card">
            <Form form={form} layout="vertical" onFinish={saveRule} initialValues={{ enabled: true, scope: 'conditional', keywords: '' }}>
              <Form.Item name="title" label="规则标题" rules={[{ required: true }]}><Input maxLength={120} /></Form.Item>
              <Form.Item name="text" label="规则内容" rules={[{ required: true }]}><Input.TextArea rows={5} maxLength={4000} showCount /></Form.Item>
              <Form.Item name="scope" label="规则适用范围" rules={[{ required: true }]}>
                <Radio.Group optionType="button" buttonStyle="solid" options={[{ label: '满足条件时', value: 'conditional' }, { label: '所有论文', value: 'all_papers' }]} />
              </Form.Item>
              {selectedRuleScope === 'conditional' ? (
                <>
                  <Form.Item name="keywords" label="触发关键词" extra="用逗号、顿号或空格分隔；触发关键词和适用的原主分类至少填写一项。"><Input placeholder="甲骨文、卜辞、祭祀" /></Form.Item>
                  <Form.Item name="fromCategoryCode" label="适用的原主分类（可选）"><Select allowClear showSearch optionFilterProp="label" options={categoryOptions} placeholder="选择三级分类" /></Form.Item>
                </>
              ) : <Alert type="warning" showIcon className="section-alert compact-alert" message="这条规则会参与所有后续论文分类，请确认它确实是长期通用原则。" />}
              <Form.Item name="targetCategoryCode" label="命中后建议主分类（可选）"><Select allowClear showSearch optionFilterProp="label" options={categoryOptions} placeholder="选择三级分类" /></Form.Item>
              <Form.Item name="enabled" label="对后续论文项目启用" valuePropName="checked"><Switch /></Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={busy}>{editingId ? '保存新版本' : '创建规则'}</Button>
                {editingId ? <Button onClick={() => { setEditingId(undefined); form.resetFields(); }}>取消</Button> : null}
              </Space>
            </Form>
          </Card>
          <Card title={`待确认候选（${pendingCandidates.length}）`} className="academic-card">
            <List
              locale={{ emptyText: '暂无待确认候选规则' }}
              dataSource={pendingCandidates}
              renderItem={(candidate) => (
                <List.Item actions={[
                  <Button key="approve" type="link" icon={<CheckOutlined />} onClick={() => void runMutation(() => window.yinxu.approveCandidateRule(candidate.id), '候选规则已批准并启用。')}>批准</Button>,
                  <Button key="reject" type="link" danger icon={<StopOutlined />} onClick={() => void runMutation(() => window.yinxu.rejectCandidateRule(candidate.id), '候选规则已驳回。')}>驳回</Button>
                ]}>
                  <List.Item.Meta title={<Space wrap><Typography.Text>{candidate.title}</Typography.Text><Tag color="gold">跨项目条件规则</Tag></Space>} description={<><Typography.Paragraph>{candidate.text}</Typography.Paragraph><Space wrap>{candidate.triggerKeywords.map((keyword) => <Tag key={keyword}>{keyword}</Tag>)}</Space></>} />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} xl={15}>
          <Card title={`已建立跨项目规则（${snapshot.rules.length}）`} className="academic-card">
            <List
              locale={{ emptyText: '尚未建立跨项目规则' }}
              dataSource={snapshot.rules}
              renderItem={(rule) => (
                <List.Item
                  actions={[
                    <Switch key="enabled" size="small" checked={rule.enabled} onChange={(enabled) => void runMutation(() => window.yinxu.updatePersonalRule(rule.id, { ...toInput(rule), enabled }), enabled ? '规则已启用。' : '规则已停用。')} />,
                    <Button key="edit" type="text" icon={<EditOutlined />} onClick={() => edit(rule)} />,
                    <Button key="rollback" type="text" icon={<RollbackOutlined />} disabled={!rule.history.length} onClick={() => void runMutation(() => window.yinxu.rollbackPersonalRule(rule.id), '已回滚到上一版本。')} />,
                    <Popconfirm key="delete" title="删除这条个人规则？" onConfirm={() => void runMutation(() => window.yinxu.deletePersonalRule(rule.id), '规则已删除。')}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm>
                  ]}
                >
                  <List.Item.Meta
                    title={<Space wrap><Typography.Text strong>{rule.title}</Typography.Text><Tag color={rule.enabled ? 'green' : 'default'}>{rule.enabled ? '启用' : '停用'}</Tag><Tag color={rule.scope === 'all_papers' ? 'volcano' : 'gold'}>{rule.scope === 'all_papers' ? '所有论文' : '条件规则'}</Tag><Tag>v{rule.revision}</Tag><Tag color="blue">可信度 {Math.round(rule.confidence * 100)}%</Tag></Space>}
                    description={<><Typography.Paragraph>{rule.text}</Typography.Paragraph><Space size={[6, 6]} wrap>{rule.triggerKeywords.map((keyword) => <Tag key={keyword}>{keyword}</Tag>)}</Space><Typography.Text type="secondary" className="rule-stats">应用 {rule.appliedCount} 次 · 接受 {rule.acceptedCount} 次 · 否决 {rule.rejectedCount} 次</Typography.Text></>}
                  />
                </List.Item>
              )}
            />
          </Card>
          <Card title={`跨项目反馈记忆（${snapshot.feedbackCount}）`} className="academic-card" extra={<Space><Button icon={<ExportOutlined />} onClick={() => void exportAll()}>导出记忆</Button><Popconfirm title="清空全部跨项目反馈记忆？项目内复核历史、规则和候选规则会保留。" onConfirm={() => void runMutation(() => window.yinxu.clearFeedbackMemory(), '跨项目反馈记忆已清空。')}><Button danger disabled={!snapshot.feedbackCount}>清空跨项目记忆</Button></Popconfirm></Space>}>
            <List
              locale={{ emptyText: '尚无跨项目反馈记忆' }}
              dataSource={snapshot.recentFeedback}
              renderItem={(feedback) => (
                <List.Item>
                  <List.Item.Meta
                    title={<Space wrap><Typography.Text>{feedback.paperTitle || '未命名论文'}</Typography.Text><Tag color={feedback.memoryAction === 'candidate_rule' ? 'gold' : 'purple'}>{feedback.memoryAction === 'candidate_rule' ? '候选规则来源' : '跨项目记忆'}</Tag>{feedback.feedbackScope === 'author_metadata' ? <Tag color="geekblue">作者信息反馈</Tag> : feedback.feedbackScope === 'mixed' ? <Tag color="purple">混合反馈</Tag> : null}<Tag>{new Date(feedback.createdAt).toLocaleString()}</Tag></Space>}
                    description={<><Typography.Paragraph>{feedback.summary}</Typography.Paragraph>{feedback.reason ? <Typography.Paragraph type="secondary">可复用经验：{feedback.reason}</Typography.Paragraph> : null}<Space wrap>{feedback.errorTypes.map((type) => <Tag color="orange" key={type}>{type}</Tag>)}</Space></>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </section>
  );
};
