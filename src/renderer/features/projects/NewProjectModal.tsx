import { DeleteOutlined, FileAddOutlined, FilePdfOutlined, PlusOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Alert, Button, Divider, Form, Input, List, Modal, Select, Space, Tag, Typography, message } from 'antd';
import type { LocalFileSelection, SupplementKind, SupplementalNoteInput } from '../../../shared/contracts';
import { useAppStore } from '../../store';

interface NewProjectModalProps {
  open: boolean;
  onClose(): void;
}

interface SupplementalSelection extends LocalFileSelection {
  kind: SupplementKind;
  sourceLabel: string;
}

const kindOptions: Array<{ value: SupplementKind; label: string }> = [
  { value: 'author_metadata', label: '作者信息' },
  { value: 'bibliography', label: '书目信息' },
  { value: 'expert_note', label: '专家意见' },
  { value: 'appendix', label: '论文附录或补充扫描件' },
  { value: 'other', label: '其他材料' }
];

export const NewProjectModal = ({ open, onClose }: NewProjectModalProps): React.JSX.Element => {
  const [primary, setPrimary] = useState<LocalFileSelection>();
  const [supplements, setSupplements] = useState<SupplementalSelection[]>([]);
  const [showNote, setShowNote] = useState(false);
  const [creating, setCreating] = useState(false);
  const [noteForm] = Form.useForm<SupplementalNoteInput>();
  const setWorkspace = useAppStore((state) => state.setWorkspace);
  const settings = useAppStore((state) => state.settings);
  const refreshProjects = useAppStore((state) => state.refreshProjects);
  const setWorkspaceTab = useAppStore((state) => state.setWorkspaceTab);

  const reset = (): void => {
    setPrimary(undefined);
    setSupplements([]);
    setShowNote(false);
    noteForm.resetFields();
  };

  const close = (): void => {
    if (creating) return;
    reset();
    onClose();
  };

  const choosePrimary = async (): Promise<void> => {
    const selection = await window.yinxu.selectPrimaryPaper();
    if (selection) setPrimary(selection);
  };

  const chooseSupplements = async (): Promise<void> => {
    const selected = await window.yinxu.selectSupplementalFiles();
    setSupplements((current) => {
      const known = new Set(current.map((item) => item.path));
      return [...current, ...selected.filter((item) => !known.has(item.path)).map((item) => ({ ...item, kind: 'other' as const, sourceLabel: '本地上传' }))];
    });
  };

  const create = async (): Promise<void> => {
    if (!primary) {
      message.warning('请先选择一篇主论文 PDF。');
      return;
    }
    setCreating(true);
    try {
      const supplementalNotes: SupplementalNoteInput[] = [];
      if (showNote) supplementalNotes.push(await noteForm.validateFields());
      const workspace = await window.yinxu.createProject({
        sourcePdfPath: primary.path,
        supplementalFiles: supplements.map(({ path, kind, sourceLabel }) => ({ path, kind, sourceLabel })),
        supplementalNotes
      });
      setWorkspace(workspace);
      await refreshProjects();
      setWorkspaceTab('materials');
      message.success('论文项目已创建，云端 OCR 结果已保存到本地项目。');
      reset();
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建论文项目失败。');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal title="新建论文项目" open={open} onCancel={close} width={760} footer={[
      <Button key="cancel" onClick={close}>取消</Button>,
      <Button key="create" type="primary" loading={creating} disabled={!primary || !settings?.hasOcrKey} onClick={() => void create()}>创建项目</Button>
    ]}>
      <Alert type="info" showIcon message="每个项目只处理一篇主论文。主论文及 PDF 补充材料的每一页都会发送到硅基流动进行 OCR；TXT、Markdown 和手动说明不会发送到 OCR 服务。" />
      {!settings?.hasOcrKey ? <Alert className="section-alert compact-alert" type="warning" showIcon message="请先在“设置”中配置云端 OCR API Key，再创建论文项目。" /> : null}
      <section className="new-project-section">
        <Space align="center">
          <FilePdfOutlined className="new-project-file-icon" />
          <div>
            <Typography.Text strong>主论文（必选，仅一份 PDF）</Typography.Text>
            <Typography.Paragraph type="secondary" className="compact-paragraph">{primary ? `${primary.name} · ${(primary.size / 1024 / 1024).toFixed(1)} MB` : '尚未选择主论文'}</Typography.Paragraph>
          </div>
          <Button onClick={() => void choosePrimary()}>{primary ? '重新选择' : '选择主论文'}</Button>
        </Space>
      </section>
      <Divider />
      <Space className="section-heading-row">
        <div>
          <Typography.Text strong>补充材料（可选，可多份）</Typography.Text>
          <Typography.Paragraph type="secondary" className="compact-paragraph">支持 PDF、TXT 和 Markdown 文件，仅用于当前论文项目。</Typography.Paragraph>
        </div>
        <Button icon={<FileAddOutlined />} onClick={() => void chooseSupplements()}>选择补充材料</Button>
      </Space>
      <List
        className="supplement-selection-list"
        locale={{ emptyText: '未选择补充材料，仍可创建项目' }}
        dataSource={supplements}
        renderItem={(item) => (
          <List.Item actions={[<Button key="remove" type="text" danger icon={<DeleteOutlined />} onClick={() => setSupplements((current) => current.filter((candidate) => candidate.path !== item.path))} />]}>
            <List.Item.Meta title={item.name} description={<Space wrap><Tag>{item.extension.replace('.', '').toUpperCase()}</Tag><Select size="small" aria-label="补充材料类型" value={item.kind} options={kindOptions} onChange={(kind) => setSupplements((current) => current.map((candidate) => candidate.path === item.path ? { ...candidate, kind } : candidate))} /><Input size="small" value={item.sourceLabel} placeholder="材料来源或提供者" onChange={(event) => setSupplements((current) => current.map((candidate) => candidate.path === item.path ? { ...candidate, sourceLabel: event.target.value } : candidate))} /></Space>} />
          </List.Item>
        )}
      />
      <Button type="link" icon={<PlusOutlined />} onClick={() => setShowNote((value) => !value)}>{showNote ? '取消手动补充' : '添加手动补充说明'}</Button>
      {showNote ? (
        <Form form={noteForm} layout="vertical" initialValues={{ kind: 'expert_note', sourceLabel: '用户手动补充' }}>
          <div className="form-grid">
            <Form.Item name="title" label="说明标题" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="kind" label="材料类型" rules={[{ required: true }]}><Select options={kindOptions} /></Form.Item>
          </div>
          <Form.Item name="sourceLabel" label="来源或提供者"><Input /></Form.Item>
          <Form.Item name="content" label="补充内容" rules={[{ required: true }]}><Input.TextArea rows={4} maxLength={50_000} showCount /></Form.Item>
        </Form>
      ) : null}
    </Modal>
  );
};
