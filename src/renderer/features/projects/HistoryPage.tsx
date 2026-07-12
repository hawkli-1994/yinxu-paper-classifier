import { CheckCircleOutlined, ClockCircleOutlined, HistoryOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, List, Row, Space, Tag, Typography, message } from 'antd';
import { useAppStore } from '../../store';

export const HistoryPage = (): React.JSX.Element => {
  const workspace = useAppStore((state) => state.workspace);
  const setWorkspace = useAppStore((state) => state.setWorkspace);
  const refreshProjects = useAppStore((state) => state.refreshProjects);
  if (!workspace) return <Empty description="请选择论文项目" />;

  const activate = async (revisionId: string): Promise<void> => {
    try {
      const next = await window.yinxu.activateResultRevision(workspace.project.id, revisionId);
      setWorkspace(next);
      await refreshProjects();
      message.success('已切换当前结果版本；其他历史版本仍然保留。');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '切换结果版本失败。');
    }
  };

  return (
    <section className="workspace-section">
      <Alert type="info" showIcon className="section-alert compact-alert" message="每次 AI 分类和人工复核都会生成独立版本，不覆盖旧结果。分类运行还会记录模型、知识包和补充材料快照。" />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={11}>
          <Card title={`分类运行（${workspace.runs.length}）`} className="academic-card">
            <List
              locale={{ emptyText: '尚无分类运行' }}
              dataSource={workspace.runs}
              renderItem={(run, index) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={run.status === 'completed' ? <CheckCircleOutlined className="history-success-icon" /> : <ClockCircleOutlined />}
                    title={<Space wrap><Typography.Text strong>运行 #{workspace.runs.length - index}</Typography.Text><Tag color={run.status === 'completed' ? 'green' : run.status === 'failed' ? 'red' : 'processing'}>{run.status === 'completed' ? '已完成' : run.status === 'failed' ? '失败' : '运行中'}</Tag></Space>}
                    description={<Space orientation="vertical" size={2}><Typography.Text type="secondary">{run.agentProvider}/{run.agentModel} · 知识包 {run.knowledgeVersion}</Typography.Text><Typography.Text type="secondary">补充材料 {run.supplementIds.length} 份 · {new Date(run.startedAt).toLocaleString()}</Typography.Text>{run.error ? <Typography.Text type="danger">{run.error}</Typography.Text> : null}</Space>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} xl={13}>
          <Card title={`结果版本（${workspace.revisions.length}）`} className="academic-card">
            <List
              locale={{ emptyText: '尚无结果版本' }}
              dataSource={workspace.revisions}
              renderItem={(revision, index) => {
                const active = revision.id === workspace.project.activeRevisionId;
                return (
                  <List.Item actions={[active ? <Tag key="current" color="green">当前版本</Tag> : <Button key="activate" type="link" onClick={() => void activate(revision.id)}>设为当前版本</Button>]}>
                    <List.Item.Meta
                      avatar={<HistoryOutlined />}
                      title={<Space wrap><Typography.Text strong>版本 #{workspace.revisions.length - index}</Typography.Text><Tag color={revision.kind === 'review' ? 'blue' : 'default'}>{revision.kind === 'review' ? '人工复核' : 'AI 结果'}</Tag></Space>}
                      description={<Space orientation="vertical" size={2}><Typography.Text>{revision.summary}</Typography.Text><Typography.Text type="secondary">{new Date(revision.createdAt).toLocaleString()}</Typography.Text></Space>}
                    />
                  </List.Item>
                );
              }}
            />
          </Card>
        </Col>
      </Row>
    </section>
  );
};
