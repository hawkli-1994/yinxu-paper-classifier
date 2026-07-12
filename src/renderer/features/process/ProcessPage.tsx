import { useState } from 'react';
import { Alert, Button, Card, Collapse, Empty, List, Progress, Steps, Tag, Typography, message } from 'antd';
import { useAppStore } from '../../store';

const phaseLabels = ['检查 PDF', '提取文本', '识别扫描页', '提取论文信息', '匹配三级分类', '检查分类规则', '生成结果'];

export const ProcessPage = (): React.JSX.Element => {
  const [running, setRunning] = useState(false);
  const project = useAppStore((state) => state.project);
  const preparation = useAppStore((state) => state.preparation);
  const events = useAppStore((state) => state.runEvents);
  const setResult = useAppStore((state) => state.setResult);
  const setWorkspace = useAppStore((state) => state.setWorkspace);
  const refreshProjects = useAppStore((state) => state.refreshProjects);
  const setWorkspaceTab = useAppStore((state) => state.setWorkspaceTab);
  const workspace = useAppStore((state) => state.workspace);

  const run = async (): Promise<void> => {
    if (!project) return;
    setRunning(true);
    try {
      const next = await window.yinxu.runClassification(project.id);
      setWorkspace(next);
      if (next.result) setResult(next.result);
      await refreshProjects();
      setWorkspaceTab('review');
      message.success('AI 已生成分类结果，请复核标黄或标红字段。');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '分类处理失败。');
    } finally {
      setRunning(false);
    }
  };

  if (!project || !preparation) return <Empty description="请先导入论文" />;
  const projectEvents = events.filter((event) => event.projectId === project.id);
  const progress = running ? Math.min(92, 20 + projectEvents.length * 12) : projectEvents.some((event) => event.phase === 'validated') ? 100 : 0;

  return (
    <section className="page-section">
      <Typography.Title level={2}>AI 分类</Typography.Title>
      <Card className="academic-card" title={project.sourceFileName}>
        <Steps current={running ? Math.min(5, Math.max(1, projectEvents.length)) : 0} size="small" items={phaseLabels.map((title) => ({ title }))} />
        <Progress percent={progress} status={events.some((event) => event.phase === 'failed') ? 'exception' : undefined} />
        {workspace?.runs.length ? <Alert className="section-alert" type="info" showIcon message={`已保留 ${workspace.runs.length} 次历史运行；重新分类会创建新 Run，不覆盖旧结果。`} /> : null}
        <Button type="primary" loading={running} onClick={() => void run()}>{workspace?.runs.length ? '新建一次 AI 分类运行' : '开始 AI 分类'}</Button>
      </Card>
      {!preparation.ocrApplied && preparation.pagesNeedingOcr.length > 0 ? <Alert className="section-alert" type="warning" showIcon message="检测到扫描页但尚未完成 OCR；请检查 OCR API Key 后重新导入，或继续由 Agent 基于可提取文本处理。" /> : null}
      {preparation.textReport?.quality === 'low' ? <Alert className="section-alert" type="error" showIcon message="OCR 文本质量异常：分类仍可继续，但结果会降级为需复核。请先回到资料页核对需复核页。" /> : null}
      <Collapse className="academic-card" items={[{ key: 'events', label: '本次运行详细记录', children: <List size="small" dataSource={projectEvents} locale={{ emptyText: '等待开始' }} renderItem={(event) => <List.Item><Tag>{event.phase}</Tag>{event.detail}</List.Item>} /> }]} />
    </section>
  );
};
