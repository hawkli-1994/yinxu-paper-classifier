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
      editingId ? '跨项目规则已更新，上一版本已保留。' : '跨项目规则已创建。'
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
      message.success(`规则与参考经验已导出：${path}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败。');
    }
  };

  if (!snapshot) return <Empty description="正在读取全局规则与参考经验……" />;
  const pendingCandidates = snapshot.candidateRules.filter((candidate) => candidate.status === 'pending');

  return (
    <section className="page-section">
      <Typography.Title level={2}>全局规则与记忆</Typography.Title>
      <Typography.Paragraph type="secondary">在此管理适用于多个项目的分类指导、分类规则和历史复核经验。已启用的内容可用于后续论文分类，系统会保留可追溯的历史版本。</Typography.Paragraph>
      <Alert type="warning" showIcon className="section-alert" message="跨项目规则不能取代论文原文、专家分类体系和证据要求。规则之间或规则与论文内容存在冲突时，系统会降低置信度并提示人工复核。" />

      <Card
        title={<Space wrap><Typography.Text strong>全局分类指导</Typography.Text><Tag color="blue">版本 {snapshot.settings.revision}</Tag><Tag color={snapshot.settings.enabled ? 'green' : 'default'}>{snapshot.settings.enabled ? '已启用' : '已停用'}</Tag></Space>}
        className="academic-card"
        extra={<Button icon={<RollbackOutlined />} disabled={!snapshot.settings.history.length || busy} onClick={() => void runMutation(() => window.yinxu.rollbackGlobalMemorySettings(), '已回滚全局分类指导。')}>回滚上一版本</Button>}
      >
        <Form form={guidanceForm} layout="vertical" onFinish={saveGlobalGuidance} initialValues={{ enabled: snapshot.settings.enabled, globalGuidance: snapshot.settings.globalGuidance }}>
          <Form.Item name="enabled" label="用于后续论文分类" valuePropName="checked" extra="停用后，后续分类不会使用全局指导、跨项目规则和历史复核经验；已有内容不会被删除。">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <Form.Item name="globalGuidance" label="全局分类指导" extra="请填写长期适用的总体原则。需要限定适用条件的内容，建议在下方创建单独的跨项目规则。最多 8000 字。">
            <Input.TextArea rows={5} maxLength={8000} showCount placeholder="例如：涉及多种材料时，以论文的核心研究问题确定主类，材料类型只作为互见。" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>保存为新版本</Button>
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
                  <Form.Item name="keywords" label="适用关键词" extra="多个关键词可用逗号、顿号或空格分隔。“适用关键词”和“适用的当前主分类”至少填写一项。"><Input placeholder="甲骨文、卜辞、祭祀" /></Form.Item>
                  <Form.Item name="fromCategoryCode" label="适用的当前主分类（可选）"><Select allowClear showSearch optionFilterProp="label" options={categoryOptions} placeholder="选择三级分类" /></Form.Item>
                </>
              ) : <Alert type="warning" showIcon className="section-alert compact-alert" message="这条规则会参与所有后续论文分类，请确认它确实是长期通用原则。" />}
              <Form.Item name="targetCategoryCode" label="符合条件时建议的主分类（可选）"><Select allowClear showSearch optionFilterProp="label" options={categoryOptions} placeholder="选择三级分类" /></Form.Item>
              <Form.Item name="enabled" label="用于后续论文分类" valuePropName="checked"><Switch /></Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={busy}>{editingId ? '保存新版本' : '创建规则'}</Button>
                {editingId ? <Button onClick={() => { setEditingId(undefined); form.resetFields(); }}>取消</Button> : null}
              </Space>
            </Form>
          </Card>
          <Card title={`待确认规则（${pendingCandidates.length}）`} className="academic-card">
            <List
              locale={{ emptyText: '暂无待确认规则' }}
              dataSource={pendingCandidates}
              renderItem={(candidate) => (
                <List.Item actions={[
                  <Button key="approve" type="link" icon={<CheckOutlined />} onClick={() => void runMutation(() => window.yinxu.approveCandidateRule(candidate.id), '候选规则已确认并启用。')}>确认并启用</Button>,
                  <Button key="reject" type="link" danger icon={<StopOutlined />} onClick={() => void runMutation(() => window.yinxu.rejectCandidateRule(candidate.id), '候选规则已不予采用。')}>不予采用</Button>
                ]}>
                  <List.Item.Meta title={<Space wrap><Typography.Text>{candidate.title}</Typography.Text><Tag color="gold">跨项目条件规则</Tag></Space>} description={<><Typography.Paragraph>{candidate.text}</Typography.Paragraph><Space wrap>{candidate.triggerKeywords.map((keyword) => <Tag key={keyword}>{keyword}</Tag>)}</Space></>} />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} xl={15}>
          <Card title={`跨项目规则（${snapshot.rules.length}）`} className="academic-card">
            <List
              locale={{ emptyText: '尚未建立跨项目规则' }}
              dataSource={snapshot.rules}
              renderItem={(rule) => (
                <List.Item
                  actions={[
                    <Switch key="enabled" size="small" checked={rule.enabled} onChange={(enabled) => void runMutation(() => window.yinxu.updatePersonalRule(rule.id, { ...toInput(rule), enabled }), enabled ? '规则已启用。' : '规则已停用。')} />,
                    <Button key="edit" type="text" icon={<EditOutlined />} onClick={() => edit(rule)} />,
                    <Button key="rollback" type="text" icon={<RollbackOutlined />} disabled={!rule.history.length} onClick={() => void runMutation(() => window.yinxu.rollbackPersonalRule(rule.id), '已回滚到上一版本。')} />,
                    <Popconfirm key="delete" title="确认删除这条跨项目规则？" onConfirm={() => void runMutation(() => window.yinxu.deletePersonalRule(rule.id), '规则已删除。')}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm>
                  ]}
                >
                  <List.Item.Meta
                    title={<Space wrap><Typography.Text strong>{rule.title}</Typography.Text><Tag color={rule.enabled ? 'green' : 'default'}>{rule.enabled ? '已启用' : '已停用'}</Tag><Tag color={rule.scope === 'all_papers' ? 'volcano' : 'gold'}>{rule.scope === 'all_papers' ? '适用于所有论文' : '按条件适用'}</Tag><Tag>版本 {rule.revision}</Tag><Tag color="blue">规则可靠度 {Math.round(rule.confidence * 100)}%</Tag></Space>}
                    description={<><Typography.Paragraph>{rule.text}</Typography.Paragraph><Space size={[6, 6]} wrap>{rule.triggerKeywords.map((keyword) => <Tag key={keyword}>{keyword}</Tag>)}</Space><Typography.Text type="secondary" className="rule-stats">已用于 {rule.appliedCount} 篇论文 · 复核确认 {rule.acceptedCount} 次 · 复核否定 {rule.rejectedCount} 次</Typography.Text></>}
                  />
                </List.Item>
              )}
            />
          </Card>
          <Card title={`跨项目复核经验（${snapshot.feedbackCount}）`} className="academic-card" extra={<Space><Button icon={<ExportOutlined />} onClick={() => void exportAll()}>导出规则与经验</Button><Popconfirm title="确认清空全部跨项目复核经验？各项目的复核历史、跨项目规则和待确认规则仍会保留。" onConfirm={() => void runMutation(() => window.yinxu.clearFeedbackMemory(), '跨项目复核经验已清空。')}><Button danger disabled={!snapshot.feedbackCount}>清空复核经验</Button></Popconfirm></Space>}>
            <List
              locale={{ emptyText: '暂无跨项目复核经验' }}
              dataSource={snapshot.recentFeedback}
              renderItem={(feedback) => (
                <List.Item>
                  <List.Item.Meta
                    title={<Space wrap><Typography.Text>{feedback.paperTitle || '未命名论文'}</Typography.Text><Tag color={feedback.memoryAction === 'candidate_rule' ? 'gold' : 'purple'}>{feedback.memoryAction === 'candidate_rule' ? '候选规则来源' : '跨项目参考经验'}</Tag>{feedback.feedbackScope === 'author_metadata' ? <Tag color="geekblue">作者信息</Tag> : feedback.feedbackScope === 'mixed' ? <Tag color="purple">分类与作者信息</Tag> : null}<Tag>{new Date(feedback.createdAt).toLocaleString()}</Tag></Space>}
                    description={<><Typography.Paragraph>{feedback.summary}</Typography.Paragraph>{feedback.reason ? <Typography.Paragraph type="secondary">跨项目处理原则：{feedback.reason}</Typography.Paragraph> : null}<Space wrap>{feedback.errorTypes.map((type) => <Tag color="orange" key={type}>{type}</Tag>)}</Space></>}
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
