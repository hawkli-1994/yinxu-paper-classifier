import { DatabaseOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Empty, Input, Popconfirm, Select, Tag, Typography, message } from 'antd';
import { useDeferredValue, useMemo, useState } from 'react';
import type { ProjectStatus } from '../../../shared/contracts';
import bronzeBrandIcon from '../../../../build/icon.png';
import { useAppStore } from '../../store';

interface ProjectSidebarProps {
  onNewProject(): void;
}

const statusLabel: Record<ProjectStatus, string> = {
  imported: '待分类',
  materials_updated: '资料已更新',
  processing: '正在分类',
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

type ProjectFilter = 'all' | 'pending' | 'confirmed' | 'failed';

const pendingStatuses = new Set<ProjectStatus>(['imported', 'materials_updated', 'processing', 'review_required']);
const normalizeSearchText = (value: string): string => value
  .normalize('NFKC')
  .toLocaleLowerCase('zh-CN')
  .replace(/[\s._\-—·（）()【】\[\]《》]/g, '');

export const ProjectSidebar = ({ onNewProject }: ProjectSidebarProps): React.JSX.Element => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [deletingId, setDeletingId] = useState<string>();
  const deferredQuery = useDeferredValue(query);
  const projects = useAppStore((state) => state.projects);
  const workspace = useAppStore((state) => state.workspace);
  const globalPage = useAppStore((state) => state.globalPage);
  const openProject = useAppStore((state) => state.openProject);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const setGlobalPage = useAppStore((state) => state.setGlobalPage);
  const searchTerms = useMemo(() => deferredQuery.trim().split(/\s+/).map(normalizeSearchText).filter(Boolean), [deferredQuery]);
  const filteredProjects = useMemo(() => projects.filter((project) => {
    const matchesStatus = filter === 'all'
      || (filter === 'pending' && pendingStatuses.has(project.status))
      || project.status === filter;
    if (!matchesStatus) return false;
    const searchable = normalizeSearchText(`${project.title} ${project.author} ${project.sourceFileName} ${statusLabel[project.status]}`);
    return searchTerms.every((term) => searchable.includes(term));
  }), [filter, projects, searchTerms]);

  const selectProject = async (projectId: string): Promise<void> => {
    try {
      await openProject(projectId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '打开论文项目失败。');
    }
  };

  const removeProject = async (projectId: string): Promise<void> => {
    setDeletingId(projectId);
    try {
      await deleteProject(projectId);
      message.success('论文项目已删除。');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除论文项目失败。');
    } finally {
      setDeletingId(undefined);
    }
  };

  return (
    <aside className="project-sidebar">
      <div className="brand-block project-brand">
        <img className="brand-bronze-mark" src={bronzeBrandIcon} alt="" aria-hidden="true" />
        <div className="project-brand-copy">
          <Typography.Title level={4}>殷墟论文分类助手</Typography.Title>
          <Typography.Text className="company-brand">北京容芯致远科技有限公司</Typography.Text>
        </div>
      </div>
      <Button className="new-project-button" type="primary" icon={<PlusOutlined />} onClick={onNewProject}>新建论文项目</Button>
      <Input
        className="project-search"
        prefix={<SearchOutlined />}
        value={query}
        allowClear
        aria-label="搜索论文项目"
        autoComplete="off"
        placeholder="按题名、作者或文件名搜索"
        onChange={(event) => setQuery(event.target.value)}
        onPressEnter={() => { if (filteredProjects.length === 1) void selectProject(filteredProjects[0]!.id); }}
      />
      <div className="project-list-toolbar">
        <Typography.Text className="project-list-label">论文项目 {filteredProjects.length}/{projects.length}</Typography.Text>
        <Select<ProjectFilter>
          className="project-status-filter"
          size="small"
          value={filter}
          aria-label="按项目状态筛选"
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'pending', label: '待处理' },
            { value: 'confirmed', label: '已确认' },
            { value: 'failed', label: '处理失败' }
          ]}
        />
      </div>
      <div className="project-list" role="list" aria-label="论文项目列表">
        {filteredProjects.length ? filteredProjects.map((project) => (
          <div className="project-list-row" role="listitem" key={project.id}>
            <button
              type="button"
              className={`project-list-item ${workspace?.project.id === project.id && !globalPage ? 'selected' : ''}`}
              onClick={() => void selectProject(project.id)}
            >
              <span className="project-list-title">{project.title}</span>
              <span className="project-list-meta">{project.author}</span>
              <span className="project-list-footer"><Tag color={statusColor[project.status]}>{statusLabel[project.status]}</Tag><span>{new Date(project.updatedAt).toLocaleDateString()}</span></span>
            </button>
            <Popconfirm
              title="删除这个论文项目？"
              description={`“${project.title}”的论文、分类任务和历史结果将从本机永久删除。`}
              okText="确认删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => removeProject(project.id)}
            >
              <Button
                className="project-delete-button"
                type="text"
                danger
                size="small"
                loading={deletingId === project.id}
                icon={<DeleteOutlined />}
                aria-label={`删除项目：${project.title}`}
              />
            </Popconfirm>
          </div>
        )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query.trim() || filter !== 'all' ? '未找到匹配的论文项目' : '暂无论文项目'} />}
      </div>
      <div className="global-navigation">
        <Button type={globalPage === 'memory' ? 'primary' : 'text'} icon={<DatabaseOutlined />} onClick={() => setGlobalPage('memory')}>全局规则与记忆</Button>
        <Button type={globalPage === 'settings' ? 'primary' : 'text'} icon={<SettingOutlined />} onClick={() => setGlobalPage('settings')}>设置</Button>
      </div>
    </aside>
  );
};

export const projectStatusLabel = statusLabel;
export const projectStatusColor = statusColor;
