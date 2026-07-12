import { useEffect } from 'react';
import { BookOutlined, DatabaseOutlined, FileSearchOutlined, SettingOutlined, SolutionOutlined } from '@ant-design/icons';
import { ConfigProvider, Layout, Menu, Spin, Typography, message } from 'antd';
import type { MenuProps } from 'antd';
import { ImportPage } from './features/import/ImportPage';
import { ProcessPage } from './features/process/ProcessPage';
import { ReviewPage } from './features/review/ReviewPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { MemoryPage } from './features/memory/MemoryPage';
import { useAppStore, type PageKey } from './store';
import { academicTheme } from './theme';

const menuItems: MenuProps['items'] = [
  { key: 'settings', icon: <SettingOutlined />, label: '设置' },
  { key: 'import', icon: <BookOutlined />, label: '导入论文' },
  { key: 'process', icon: <FileSearchOutlined />, label: '处理分类' },
  { key: 'review', icon: <SolutionOutlined />, label: '复核导出' },
  { key: 'memory', icon: <DatabaseOutlined />, label: '规则与记忆' }
];

export const App = (): React.JSX.Element => {
  const activePage = useAppStore((state) => state.activePage);
  const setActivePage = useAppStore((state) => state.setActivePage);
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const appendRunEvent = useAppStore((state) => state.appendRunEvent);

  useEffect(() => {
    void window.yinxu.getSettings().then(setSettings).catch(() => message.error('无法读取本机设置。'));
    return window.yinxu.onRunEvent(appendRunEvent);
  }, [appendRunEvent, setSettings]);

  const content = { settings: <SettingsPage />, import: <ImportPage />, process: <ProcessPage />, review: <ReviewPage />, memory: <MemoryPage /> }[activePage];
  if (!settings) return <ConfigProvider theme={academicTheme}><main className="app-loading"><Spin size="large" /><Typography.Text>正在准备分类工作区</Typography.Text></main></ConfigProvider>;

  return (
    <ConfigProvider theme={academicTheme}>
      <Layout className="app-shell">
        <Layout.Sider width={236} className="academic-sider">
          <div className="brand-block">
            <Typography.Title level={4}>殷墟论文<br />分类助手</Typography.Title>
            <Typography.Text className="brand-subtitle">社科研究资料工作台</Typography.Text>
            <Typography.Text className="company-brand">北京容芯致远科技有限公司</Typography.Text>
          </div>
          <Menu theme="dark" mode="inline" selectedKeys={[activePage]} items={menuItems} onClick={({ key }) => setActivePage(key as PageKey)} />
        </Layout.Sider>
        <Layout>
          <Layout.Header className="academic-header"><Typography.Text type="secondary">单人本地项目 · Pi Agent 编排 · 人工复核</Typography.Text></Layout.Header>
          <Layout.Content className="academic-content">{content}</Layout.Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};
