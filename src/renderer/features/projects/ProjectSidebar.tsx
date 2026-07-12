import { DatabaseOutlined, PlusOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Empty, Input, Tag, Typography, message } from 'antd';
import { useDeferredValue, useMemo, useState } from 'react';
import type { ProjectStatus } from '../../../shared/contracts';
import { useAppStore } from '../../store';

interface ProjectSidebarProps {
  onNewProject(): void;
}

const statusLabel: Record<ProjectStatus, string> = {
  imported: '尚未分类',
  materials_updated: '材料已更新',
  processing: '处理中',
  review_required: '待复核',
  confirmed: '已确认',
  failed: '处理失败'
};

const statusColor: Record<ProjectStatus, string> = {
  imported: 'blue',
  materials_updated: 'gold',
  processing: 'processing',
  review_required: 'orange',
  confirmed: 'green',
  failed: 'red'
};

export const ProjectSidebar = ({ onNewProject }: ProjectSidebarProps): React.JSX.Element => {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const projects = useAppStore((state) => state.projects);
  const workspace = useAppStore((state) => state.workspace);
  const globalPage = useAppStore((state) => state.globalPage);
  const openProject = useAppStore((state) => state.openProject);
  const setGlobalPage = useAppStore((state) => state.setGlobalPage);
  const filteredProjects = useMemo(() => projects.filter((project) => `${project.title}${project.author}${project.sourceFileName}`.toLocaleLowerCase().includes(deferredQuery)), [deferredQuery, projects]);

  const selectProject = async (projectId: string): Promise<void> => {
    try {
      await openProject(projectId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '无法打开论文项目。');
    }
  };

  return (
    <aside className="project-sidebar">
      <div className="brand-block project-brand">
        <Typography.Title level={4}>殷墟论文分类助手</Typography.Title>
        <Typography.Text className="company-brand">北京容芯致远科技有限公司</Typography.Text>
      </div>
      <Button className="new-project-button" type="primary" icon={<PlusOutlined />} onClick={onNewProject}>新建论文项目</Button>
      <Input className="project-search" prefix={<SearchOutlined />} value={query} allowClear placeholder="搜索论文" onChange={(event) => setQuery(event.target.value)} />
      <Typography.Text className="project-list-label">论文项目（{projects.length}）</Typography.Text>
      <div className="project-list" role="list" aria-label="论文项目列表">
        {filteredProjects.length ? filteredProjects.map((project) => (
          <button
            type="button"
            role="listitem"
            key={project.id}
            className={`project-list-item ${workspace?.project.id === project.id && !globalPage ? 'selected' : ''}`}
            onClick={() => void selectProject(project.id)}
          >
            <span className="project-list-title">{project.title}</span>
            <span className="project-list-meta">{project.author}</span>
            <span className="project-list-footer"><Tag color={statusColor[project.status]}>{statusLabel[project.status]}</Tag><span>{new Date(project.updatedAt).toLocaleDateString()}</span></span>
          </button>
        )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? '没有匹配项目' : '尚无论文项目'} />}
      </div>
      <div className="global-navigation">
        <Button type={globalPage === 'memory' ? 'primary' : 'text'} icon={<DatabaseOutlined />} onClick={() => setGlobalPage('memory')}>规则与记忆</Button>
        <Button type={globalPage === 'settings' ? 'primary' : 'text'} icon={<SettingOutlined />} onClick={() => setGlobalPage('settings')}>设置</Button>
      </div>
    </aside>
  );
};

export const projectStatusLabel = statusLabel;
export const projectStatusColor = statusColor;
