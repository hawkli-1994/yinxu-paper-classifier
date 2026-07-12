import { useEffect, useState } from 'react';
import { FileAddOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Empty, Layout, Spin, Typography, message } from 'antd';
import { MemoryPage } from './features/memory/MemoryPage';
import { NewProjectModal } from './features/projects/NewProjectModal';
import { ProjectSidebar } from './features/projects/ProjectSidebar';
import { ProjectWorkspace } from './features/projects/ProjectWorkspace';
import { SettingsPage } from './features/settings/SettingsPage';
import { useAppStore } from './store';
import { academicTheme } from './theme';

export const App = (): React.JSX.Element => {
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const projects = useAppStore((state) => state.projects);
  const setProjects = useAppStore((state) => state.setProjects);
  const workspace = useAppStore((state) => state.workspace);
  const globalPage = useAppStore((state) => state.globalPage);
  const openProject = useAppStore((state) => state.openProject);
  const appendRunEvent = useAppStore((state) => state.appendRunEvent);

  useEffect(() => {
    let active = true;
    void Promise.all([window.yinxu.getSettings(), window.yinxu.listProjects()])
      .then(async ([loadedSettings, loadedProjects]) => {
        if (!active) return;
        setSettings(loadedSettings);
        setProjects(loadedProjects);
        if (loadedProjects[0]) await openProject(loadedProjects[0].id);
      })
      .catch((error) => message.error(error instanceof Error ? error.message : '无法准备本机论文工作区。'));
    const unsubscribe = window.yinxu.onRunEvent(appendRunEvent);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [appendRunEvent, openProject, setProjects, setSettings]);

  if (!settings) return <ConfigProvider theme={academicTheme}><main className="app-loading"><Spin size="large" /><Typography.Text>正在准备论文项目工作区</Typography.Text></main></ConfigProvider>;

  const content = globalPage === 'settings'
    ? <div className="academic-content global-content"><SettingsPage /></div>
    : globalPage === 'memory'
      ? <div className="academic-content global-content"><MemoryPage /></div>
      : workspace
        ? <ProjectWorkspace key={workspace.project.id} />
        : <main className="workspace-empty"><Empty description={projects.length ? '请选择一个论文项目' : '尚无论文项目'}><Button type="primary" icon={<FileAddOutlined />} onClick={() => setNewProjectOpen(true)}>新建第一个论文项目</Button></Empty></main>;

  return (
    <ConfigProvider theme={academicTheme}>
      <Layout className="app-shell project-app-shell">
        <Layout.Sider width={300} className="academic-sider project-sider"><ProjectSidebar onNewProject={() => setNewProjectOpen(true)} /></Layout.Sider>
        <Layout className="project-shell-main">{content}</Layout>
      </Layout>
      <NewProjectModal open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
    </ConfigProvider>
  );
};
