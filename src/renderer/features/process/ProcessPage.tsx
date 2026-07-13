import { useState } from 'react';
import { Alert, Button, Card, Collapse, Empty, List, Progress, Steps, Tag, Typography, message } from 'antd';
import { useAppStore } from '../../store';

const phaseLabels = ['检查 PDF', '提取文本', '识别扫描页', '提取论文信息', '匹配三级分类', '检查分类规则', '生成结果'];
const runEventLabels = { started: '开始分类', agent: 'AI 分析', validated: '结果校验', failed: '处理失败' } as const;
const runEventDetail = (phase: keyof typeof runEventLabels, detail: string): string => {
  if (phase === 'started') return `所用模型：${detail}`;
  if (phase === 'agent') return 'AI 正在分析论文内容并生成分类结果。';
  return detail;
};

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
      message.success('AI 分类已完成。请优先复核黄色和红色标记的字段。');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '分类处理失败。');
    } finally {
      setRunning(false);
    }
  };

  if (!project || !preparation) return <Empty description="请先创建论文项目并导入主论文" />;
  const projectEvents = events.filter((event) => event.projectId === project.id);
  const ocrMode = preparation.ocrMode ?? preparation.textReport?.ocrMode ?? 'auto';
  const progress = running ? Math.min(92, 20 + projectEvents.length * 12) : projectEvents.some((event) => event.phase === 'validated') ? 100 : 0;

  return (
    <section className="page-section">
      <Typography.Title level={2}>AI 分类</Typography.Title>
      <Card className="academic-card" title={project.sourceFileName}>
        <Steps current={running ? Math.min(5, Math.max(1, projectEvents.length)) : 0} size="small" items={phaseLabels.map((title) => ({ title }))} />
        <Progress percent={progress} status={events.some((event) => event.phase === 'failed') ? 'exception' : undefined} />
        {workspace?.runs.length ? <Alert className="section-alert" type="info" showIcon message={`已保留 ${workspace.runs.length} 次分类任务。重新分类会创建新任务，不会覆盖已有结果。`} /> : null}
        <Button type="primary" loading={running} onClick={() => void run()}>{workspace?.runs.length ? '重新进行 AI 分类' : '开始 AI 分类'}</Button>
      </Card>
      {!preparation.ocrApplied && preparation.pagesNeedingOcr.length > 0 ? (
        <Alert
          className="section-alert"
          type="warning"
          showIcon
          message={ocrMode === 'local'
            ? '本地解析发现部分页面文本不完整。本地模式不会使用云端 OCR，请核对相关页面，或更改 OCR 模式后重新导入论文。'
            : '部分页面文本不完整，云端 OCR 也未返回有效结果。请检查 OCR API Key、网络连接和原始页面，然后重新导入论文。'}
        />
      ) : null}
      {preparation.textReport?.quality === 'low' ? <Alert className="section-alert" type="error" showIcon message="OCR 文本质量较低。可以继续分类，但结果将标记为需要人工复核。建议先在“论文资料”页核对相关页面。" /> : null}
      <Collapse className="academic-card" items={[{ key: 'events', label: '本次分类任务记录', children: <List size="small" dataSource={projectEvents} locale={{ emptyText: '任务尚未开始' }} renderItem={(event) => <List.Item><Tag>{runEventLabels[event.phase]}</Tag>{runEventDetail(event.phase, event.detail)}</List.Item>} /> }]} />
    </section>
  );
};
