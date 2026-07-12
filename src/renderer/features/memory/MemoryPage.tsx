import { CheckOutlined, DeleteOutlined, EditOutlined, ExportOutlined, RollbackOutlined, StopOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Form, Input, List, Popconfirm, Row, Select, Space, Switch, Tag, Typography, message } from 'antd';
import type { MemorySnapshot, PersonalRule, PersonalRuleInput } from '../../../shared/contracts';
import { listLeafCategories } from '../../../shared/taxonomy';

interface RuleFormValues {
  title: string;
  text: string;
  enabled: boolean;
  keywords: string;
  fromCategoryCode?: string;
  targetCategoryCode?: string;
}

const categoryOptions = listLeafCategories().map((category) => ({ value: category.code, label: `${category.code} ${category.label}` }));

const toInput = (rule: PersonalRule): PersonalRuleInput => ({
  title: rule.title,
  text: rule.text,
  enabled: rule.enabled,
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
  triggerKeywords: (values.keywords ?? '').split(/[；;，,、\s]+/).filter(Boolean),
  fromCategoryCode: values.fromCategoryCode?.trim() || undefined,
  targetCategoryCode: values.targetCategoryCode?.trim() || undefined
});

export const MemoryPage = (): React.JSX.Element => {
  const [form] = Form.useForm<RuleFormValues>();
  const [snapshot, setSnapshot] = useState<MemorySnapshot>();
  const [editingId, setEditingId] = useState<string>();
  const [busy, setBusy] = useState(false);

  const refresh = async (): Promise<void> => {
    try {
      setSnapshot(await window.yinxu.getMemorySnapshot());
    } catch (error) {
      message.error(error instanceof Error ? error.message : '无法读取本机记忆。');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const runMutation = async (action: () => Promise<MemorySnapshot>, success: string): Promise<boolean> => {
    setBusy(true);
    try {
      setSnapshot(await action());
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
      editingId ? '规则已更新并保留旧版本。' : '个人规则已创建。'
    );
    if (saved) {
      setEditingId(undefined);
      form.resetFields();
    }
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

  if (!snapshot) return <Empty description="正在读取本机规则与反馈" />;
  const pendingCandidates = snapshot.candidateRules.filter((candidate) => candidate.status === 'pending');

  return (
    <section className="page-section">
      <Typography.Title level={2}>规则与记忆</Typography.Title>
      <Typography.Paragraph type="secondary">这是一个可审计的反馈循环：人工复核会留下原始记录；系统可以生成候选规则，但只有你批准的规则才参与后续论文分类。</Typography.Paragraph>
      <Alert type="warning" showIcon className="section-alert" message="个人规则不能覆盖论文原文、专家分类体系、证据要求或安全边界；规则冲突会自动降低置信度并要求人工复核。" />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={9}>
          <Card title={editingId ? '编辑个人规则' : '新建个人规则'} className="academic-card">
            <Form form={form} layout="vertical" onFinish={saveRule} initialValues={{ enabled: true, keywords: '' }}>
              <Form.Item name="title" label="规则标题" rules={[{ required: true }]}><Input maxLength={120} /></Form.Item>
              <Form.Item name="text" label="规则内容" rules={[{ required: true }]}><Input.TextArea rows={5} maxLength={4000} showCount /></Form.Item>
              <Form.Item name="keywords" label="触发关键词" extra="用逗号、顿号或空格分隔；留空表示通用规则。"><Input placeholder="甲骨文、卜辞、祭祀" /></Form.Item>
              <div className="form-grid">
                <Form.Item name="fromCategoryCode" label="原分类（可选）"><Select allowClear showSearch optionFilterProp="label" options={categoryOptions} placeholder="选择三级分类" /></Form.Item>
                <Form.Item name="targetCategoryCode" label="建议分类（可选）"><Select allowClear showSearch optionFilterProp="label" options={categoryOptions} placeholder="选择三级分类" /></Form.Item>
              </div>
              <Form.Item name="enabled" label="立即启用" valuePropName="checked"><Switch /></Form.Item>
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
                  <List.Item.Meta title={candidate.title} description={<><Typography.Paragraph>{candidate.text}</Typography.Paragraph><Space wrap>{candidate.triggerKeywords.map((keyword) => <Tag key={keyword}>{keyword}</Tag>)}</Space></>} />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} xl={15}>
          <Card title={`已建立规则（${snapshot.rules.length}）`} className="academic-card">
            <List
              locale={{ emptyText: '尚未建立个人规则' }}
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
                    title={<Space wrap><Typography.Text strong>{rule.title}</Typography.Text><Tag color={rule.enabled ? 'green' : 'default'}>{rule.enabled ? '启用' : '停用'}</Tag><Tag>v{rule.revision}</Tag><Tag color="blue">可信度 {Math.round(rule.confidence * 100)}%</Tag></Space>}
                    description={<><Typography.Paragraph>{rule.text}</Typography.Paragraph><Space size={[6, 6]} wrap>{rule.triggerKeywords.map((keyword) => <Tag key={keyword}>{keyword}</Tag>)}</Space><Typography.Text type="secondary" className="rule-stats">应用 {rule.appliedCount} 次 · 接受 {rule.acceptedCount} 次 · 否决 {rule.rejectedCount} 次</Typography.Text></>}
                  />
                </List.Item>
              )}
            />
          </Card>
          <Card title={`人工反馈记录（${snapshot.feedbackCount}）`} className="academic-card" extra={<Space><Button icon={<ExportOutlined />} onClick={() => void exportAll()}>导出记忆</Button><Popconfirm title="清空全部原始反馈记录？规则和候选规则会保留。" onConfirm={() => void runMutation(() => window.yinxu.clearFeedbackMemory(), '原始反馈记录已清空。')}><Button danger disabled={!snapshot.feedbackCount}>清空反馈</Button></Popconfirm></Space>}>
            <List
              locale={{ emptyText: '尚无人工复核反馈' }}
              dataSource={snapshot.recentFeedback}
              renderItem={(feedback) => (
                <List.Item>
                  <List.Item.Meta
                    title={<Space wrap><Typography.Text>{feedback.paperTitle || '未命名论文'}</Typography.Text><Tag>{new Date(feedback.createdAt).toLocaleString()}</Tag></Space>}
                    description={<><Typography.Paragraph>{feedback.summary}</Typography.Paragraph>{feedback.reason ? <Typography.Paragraph type="secondary">理由：{feedback.reason}</Typography.Paragraph> : null}<Space wrap>{feedback.errorTypes.map((type) => <Tag color="orange" key={type}>{type}</Tag>)}</Space></>}
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
