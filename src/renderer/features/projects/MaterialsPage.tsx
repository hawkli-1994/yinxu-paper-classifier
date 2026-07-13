import { DeleteOutlined, FileAddOutlined, FilePdfOutlined, FileTextOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, Empty, Form, Input, List, Modal, Popconfirm, Select, Space, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import type { LocalFileSelection, SupplementKind, SupplementalFileInput, SupplementalNoteInput } from '../../../shared/contracts';
import { useAppStore } from '../../store';

const kindLabels: Record<SupplementKind, string> = {
  author_metadata: '作者信息',
  bibliography: '书目信息',
  expert_note: '专家意见',
  appendix: '论文附录或补充扫描件',
  other: '其他材料'
};
const kindOptions = Object.entries(kindLabels).map(([value, label]) => ({ value, label }));
const formatBytes = (size: number): string => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
const ocrModeLabels = { auto: '自动', local: '本地', cloud: '云端' } as const;

interface PendingFile extends LocalFileSelection {
  kind: SupplementKind;
  sourceLabel: string;
}

export const MaterialsPage = (): React.JSX.Element => {
  const workspace = useAppStore((state) => state.workspace);
  const setWorkspace = useAppStore((state) => state.setWorkspace);
  const refreshProjects = useAppStore((state) => state.refreshProjects);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [filesOpen, setFilesOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteForm] = Form.useForm<SupplementalNoteInput>();

  if (!workspace) return <Empty description="请选择论文项目" />;
  const { project, preparation } = workspace;
  const ocrMode = preparation.ocrMode ?? preparation.textReport?.ocrMode ?? 'auto';
  const cloudAttemptedCount = preparation.textReport?.cloudAttemptedPages?.length ?? preparation.textReport?.ocrAppliedPages.length ?? 0;
  const cloudAppliedCount = preparation.textReport?.ocrAppliedPages.length ?? 0;
  const supplements = workspace.supplements.filter((material) => !material.removedAt);

  const applyWorkspace = async (next: Awaited<ReturnType<typeof window.yinxu.openProject>>): Promise<void> => {
    setWorkspace(next);
    await refreshProjects();
  };

  const chooseFiles = async (): Promise<void> => {
    const selected = await window.yinxu.selectSupplementalFiles();
    if (!selected.length) return;
    setPendingFiles(selected.map((item) => ({ ...item, kind: 'other', sourceLabel: '本地上传' })));
    setFilesOpen(true);
  };

  const saveFiles = async (): Promise<void> => {
    setSaving(true);
    try {
      const inputs: SupplementalFileInput[] = pendingFiles.map(({ path, kind, sourceLabel }) => ({ path, kind, sourceLabel }));
      await applyWorkspace(await window.yinxu.addSupplementalFiles(project.id, inputs));
      setFilesOpen(false);
      setPendingFiles([]);
      message.success('补充材料已添加。已有结果会保留，系统建议重新进行 AI 分类。');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '添加补充材料失败。');
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async (): Promise<void> => {
    setSaving(true);
    try {
      const note = await noteForm.validateFields();
      await applyWorkspace(await window.yinxu.addSupplementalNote(project.id, note));
      setNoteOpen(false);
      noteForm.resetFields();
      message.success('手动补充说明已保存到当前项目。');
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (materialId: string): Promise<void> => {
    try {
      await applyWorkspace(await window.yinxu.removeSupplementalMaterial(project.id, materialId));
      message.success('补充材料已从当前项目移除，历史分类任务仍保留其版本信息。');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '移除补充材料失败。');
    }
  };

  return (
    <section className="workspace-section">
      {project.status === 'materials_updated' ? <Alert className="section-alert compact-alert" type="warning" showIcon message="补充材料已更新，当前分类结果仍保留。建议前往“AI 分类”重新执行分类任务。" /> : null}
      <Card className="academic-card primary-paper-card" title="主论文" extra={<Typography.Text type="secondary">必选 · 仅一份 PDF</Typography.Text>}>
        <div className="primary-paper-row">
          <FilePdfOutlined className="primary-pdf-icon" />
          <div className="primary-paper-info">
            <Typography.Text strong>{project.sourceFileName}</Typography.Text>
            <Typography.Text type="secondary">{preparation.pageCount} 页 · 文本提取质量：{preparation.textReport?.quality === 'high' ? '良好' : preparation.textReport?.quality === 'low' ? '需要复核' : '未检测'}</Typography.Text>
          </div>
          <Space wrap>
            <Tag color={ocrMode === 'cloud' ? 'blue' : ocrMode === 'local' ? 'green' : 'geekblue'}>OCR：{ocrModeLabels[ocrMode]}</Tag>
            <Tag color={cloudAttemptedCount > 0 ? 'green' : 'default'}>
              {cloudAttemptedCount > 0 ? `提交云端识别 ${cloudAttemptedCount} 页 · 采用 ${cloudAppliedCount} 页` : '未使用云端 OCR'}
            </Tag>
            <Tag color={preparation.textReport?.quality === 'low' ? 'orange' : 'green'}>{preparation.textReport?.quality === 'low' ? '需要核验' : '资料已就绪'}</Tag>
          </Space>
        </div>
      </Card>

      <div className="materials-heading">
        <div><Typography.Title level={4}>补充材料</Typography.Title><Typography.Text type="secondary">仅用于辅助当前论文的分类；主分类的页码和引文证据必须来自主论文。</Typography.Text></div>
        <Space><Button icon={<FileAddOutlined />} onClick={() => void chooseFiles()}>添加补充材料</Button><Button icon={<PlusOutlined />} onClick={() => setNoteOpen(true)}>添加手动说明</Button></Space>
      </div>
      <Card className="academic-card supplement-list-card">
        <List
          dataSource={supplements}
          locale={{ emptyText: '当前项目暂无补充材料' }}
          renderItem={(material) => (
            <List.Item actions={[<Popconfirm key="remove" title="确认移除这份补充材料？" description="移除操作仅影响后续分类任务，历史任务的材料信息仍会保留。" onConfirm={() => void remove(material.id)}><Button type="text" danger icon={<DeleteOutlined />}>移除</Button></Popconfirm>]}>
              <List.Item.Meta
                avatar={material.sourceType === 'note' ? <FileTextOutlined className="material-file-icon" /> : <FilePdfOutlined className="material-file-icon" />}
                title={<Space wrap><Typography.Text>{material.title}</Typography.Text><Tag>{kindLabels[material.kind]}</Tag><Tag color={material.status === 'ready' ? 'green' : material.status === 'needs_review' ? 'orange' : 'red'}>{material.status === 'ready' ? '可用' : material.status === 'needs_review' ? '需核验' : '提取失败'}</Tag></Space>}
                description={<Descriptions size="small" column={3}><Descriptions.Item label="来源">{material.sourceLabel}</Descriptions.Item><Descriptions.Item label="大小">{formatBytes(material.size)}</Descriptions.Item><Descriptions.Item label="添加时间">{new Date(material.createdAt).toLocaleString()}</Descriptions.Item>{material.statusDetail ? <Descriptions.Item label="说明" span={3}>{material.statusDetail}</Descriptions.Item> : null}</Descriptions>}
              />
            </List.Item>
          )}
        />
      </Card>

      <Modal title="确认补充材料" open={filesOpen} onCancel={() => setFilesOpen(false)} onOk={() => void saveFiles()} confirmLoading={saving} okText="添加到当前项目">
        <List dataSource={pendingFiles} renderItem={(file) => <List.Item><List.Item.Meta title={file.name} description={<Space orientation="vertical" className="pending-material-fields"><Select value={file.kind} options={kindOptions} onChange={(kind) => setPendingFiles((current) => current.map((item) => item.path === file.path ? { ...item, kind } : item))} /><Input value={file.sourceLabel} placeholder="来源或提供者" onChange={(event) => setPendingFiles((current) => current.map((item) => item.path === file.path ? { ...item, sourceLabel: event.target.value } : item))} /></Space>} /></List.Item>} />
      </Modal>

      <Modal title="添加手动补充说明" open={noteOpen} onCancel={() => setNoteOpen(false)} onOk={() => void saveNote()} confirmLoading={saving} okText="保存到当前项目">
        <Form form={noteForm} layout="vertical" initialValues={{ kind: 'expert_note', sourceLabel: '用户手动补充' }}>
          <Form.Item name="title" label="说明标题" rules={[{ required: true }]}><Input /></Form.Item>
          <div className="form-grid"><Form.Item name="kind" label="材料类型" rules={[{ required: true }]}><Select options={kindOptions} /></Form.Item><Form.Item name="sourceLabel" label="来源或提供者"><Input /></Form.Item></div>
          <Form.Item name="content" label="补充内容" rules={[{ required: true }]}><Input.TextArea rows={8} maxLength={50_000} showCount /></Form.Item>
        </Form>
      </Modal>
    </section>
  );
};
