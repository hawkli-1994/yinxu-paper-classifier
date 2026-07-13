import { FileTextOutlined } from '@ant-design/icons';
import { Space, Tabs, Tag, Typography } from 'antd';
import { ProcessPage } from '../process/ProcessPage';
import { ReviewPage } from '../review/ReviewPage';
import { HistoryPage } from './HistoryPage';
import { MaterialsPage } from './MaterialsPage';
import { projectStatusColor, projectStatusLabel } from './ProjectSidebar';
import { useAppStore, type WorkspaceTab } from '../../store';

export const ProjectWorkspace = (): React.JSX.Element => {
  const workspace = useAppStore((state) => state.workspace)!;
  const workspaceTab = useAppStore((state) => state.workspaceTab);
  const setWorkspaceTab = useAppStore((state) => state.setWorkspaceTab);
  const project = workspace.project;
  const title = workspace.result?.fields.题名 || project.sourceFileName.replace(/\.pdf$/i, '');
  const author = workspace.result?.fields.作者 || '作者信息待提取';

  const items = [
    { key: 'materials', label: '论文资料', children: <MaterialsPage /> },
    { key: 'classification', label: 'AI 分类', children: <ProcessPage /> },
    { key: 'review', label: '人工复核与导出', children: <ReviewPage /> },
    { key: 'history', label: '分类记录', children: <HistoryPage /> }
  ];

  return (
    <main className="project-workspace">
      <header className="project-workspace-header">
        <FileTextOutlined className="project-header-icon" />
        <div className="project-header-main">
          <Typography.Title level={2}>{title}</Typography.Title>
          <Space size={[12, 6]} wrap>
            <Typography.Text type="secondary">{author}</Typography.Text>
            <Tag color={projectStatusColor[project.status]}>{projectStatusLabel[project.status]}</Tag>
            <Typography.Text type="secondary">补充材料 {workspace.supplements.filter((item) => !item.removedAt).length} 份</Typography.Text>
            <Typography.Text type="secondary">分类任务 {workspace.runs.length} 次</Typography.Text>
            <Typography.Text type="secondary">更新于 {new Date(project.updatedAt).toLocaleString()}</Typography.Text>
          </Space>
        </div>
      </header>
      <Tabs className="workspace-tabs" activeKey={workspaceTab} onChange={(key) => setWorkspaceTab(key as WorkspaceTab)} items={items} />
    </main>
  );
};
