import { useState } from 'react';
import { Alert, Badge, Button, Card, Empty, List, Popconfirm, Progress, Space, Steps, Tag, Typography, message } from 'antd';
import { useAppStore } from '../../store';

const phaseLabels = ['准备任务', '读取与分析', '生成结果', '校验完成'];
const runEventLabels = { started: '任务已开始', agent: '读取与分析', validated: '结果校验完成', failed: '处理失败', cancelled: '任务已取消' } as const;
const agentEventDetails: Record<string, string> = {
  reasoning: '正在梳理论文重点，并比较候选分类。',
  reading: '正在核对论文全文、补充材料与分类规则。',
  processing: '正在处理论文内容并核验中间结果。',
  writing: '正在生成结构化分类结果。',
  finishing: 'AI 分析已完成，正在进行最终校验。',
  retrying: '模型服务正在自动重试，任务数据不会丢失。'
};
const runEventDetail = (phase: keyof typeof runEventLabels, detail: string): string => {
  if (phase === 'started') return `使用模型：${detail}`;
  if (phase === 'agent') return agentEventDetails[detail] ?? '正在分析论文内容并整理分类结果。';
  return detail;
};

export const ProcessPage = (): React.JSX.Element => {
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const project = useAppStore((state) => state.project);
  const preparation = useAppStore((state) => state.preparation);
  const events = useAppStore((state) => state.runEvents);
  const setResult = useAppStore((state) => state.setResult);
  const setWorkspace = useAppStore((state) => state.setWorkspace);
  const refreshProjects = useAppStore((state) => state.refreshProjects);
  const setWorkspaceTab = useAppStore((state) => state.setWorkspaceTab);
  const workspace = useAppStore((state) => state.workspace);
  const latestSavedRun = workspace?.runs[0];
  const projectEvents = events.filter((event) => event.projectId === project?.id);
  const latestEvent = projectEvents[projectEvents.length - 1];
  const isRunning = running || project?.status === 'processing' || Boolean(latestEvent && latestEvent.phase !== 'validated' && latestEvent.phase !== 'failed' && latestEvent.phase !== 'cancelled');

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
      const detail = error instanceof Error ? error.message : '分类处理失败。';
      if (detail.includes('取消')) message.info(detail);
      else message.error(detail);
      const next = await window.yinxu.openProject(project.id);
      setWorkspace(next);
      await refreshProjects();
    } finally {
      setRunning(false);
      setCancelling(false);
    }
  };

  const cancel = async (): Promise<void> => {
    if (!project || cancelling) return;
    setCancelling(true);
    try {
      const next = await window.yinxu.cancelClassification(project.id);
      setWorkspace(next);
      await refreshProjects();
      message.info('本次分类已取消，可以随时重新开始。');
    } catch (error) {
      setCancelling(false);
      message.error(error instanceof Error ? error.message : '无法取消当前任务。');
    }
  };

  if (!project || !preparation) return <Empty description="请先创建论文项目并导入主论文" />;
  const ocrMode = preparation.ocrMode ?? preparation.textReport?.ocrMode ?? 'auto';
  const failedEvent = projectEvents.find((event) => event.phase === 'failed');
  const cancelledEvent = projectEvents.find((event) => event.phase === 'cancelled');
  const validated = projectEvents.some((event) => event.phase === 'validated');
  const eventProgress = Math.max(0, ...projectEvents.map((event) => event.progress ?? 0));
  const progress = validated ? 100 : failedEvent || cancelledEvent ? Math.max(10, eventProgress) : isRunning ? Math.max(6, eventProgress) : 0;
  const currentStep = progress >= 96 ? 3 : progress >= 76 ? 2 : progress >= 18 ? 1 : 0;
  const activityTitle = failedEvent
    ? '本次分类未完成'
    : cancelledEvent
      ? '本次分类已取消'
    : validated
      ? '本次分类已完成'
      : isRunning
        ? 'AI 分类进行中'
        : workspace?.runs.length
          ? '当前没有进行中的分类任务'
          : '尚未开始分类';
  const activityDetail = failedEvent
    ? failedEvent.detail
    : cancelledEvent
      ? cancelledEvent.detail
    : latestEvent
      ? runEventDetail(latestEvent.phase, latestEvent.detail)
      : workspace?.runs.length
        ? '需要时可以重新分类，已有结果和历史任务不会被覆盖。'
        : '开始后会在这里显示关键阶段，同一阶段只保留一条实时状态。';

  return (
    <section className="page-section workspace-section">
      <Typography.Title level={2}>AI 分类</Typography.Title>
      <Card className="academic-card" title={project.sourceFileName}>
        <Steps current={currentStep} status={failedEvent ? 'error' : undefined} size="small" items={phaseLabels.map((title) => ({ title }))} />
        <Progress percent={progress} status={failedEvent ? 'exception' : validated ? 'success' : 'active'} />
        {workspace?.runs.length ? <Alert className="section-alert" type="info" showIcon message={`已保留 ${workspace.runs.length} 次分类任务。重新分类会创建新任务，不会覆盖已有结果。`} /> : null}
        {!isRunning && latestSavedRun?.status === 'cancelled' ? (
          <Alert className="section-alert" type="warning" showIcon message={latestSavedRun.error ?? '上一次分类已取消，可以重新开始。'} />
        ) : null}
        <Space wrap>
          <Button type="primary" loading={isRunning && !cancelling} disabled={isRunning} onClick={() => void run()}>{workspace?.runs.length ? '重新进行 AI 分类' : '开始 AI 分类'}</Button>
          {isRunning ? (
            <Popconfirm title="确定取消本次分类吗？" description="已生成的历史结果不会受影响，之后可以重新开始分类。" okText="取消任务" cancelText="继续处理" onConfirm={() => void cancel()}>
              <Button danger loading={cancelling}>取消本次分类</Button>
            </Popconfirm>
          ) : null}
        </Space>
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
      <Card
        className="academic-card classification-activity-card"
        title="本次任务进度"
        extra={<Typography.Text type="secondary">关键阶段实时更新</Typography.Text>}
      >
        <div className="classification-activity-summary">
          <Badge status={failedEvent ? 'error' : isRunning ? 'processing' : validated ? 'success' : cancelledEvent ? 'warning' : 'default'} />
          <div>
            <Typography.Text strong>{activityTitle}</Typography.Text>
            <Typography.Paragraph type="secondary">{activityDetail}</Typography.Paragraph>
          </div>
        </div>
        {projectEvents.length ? (
          <List
            className="classification-milestones"
            size="small"
            dataSource={projectEvents}
            renderItem={(event) => (
              <List.Item>
                <div className="classification-milestone-copy">
                  <Typography.Text strong>{runEventLabels[event.phase]}</Typography.Text>
                  <Typography.Text type="secondary">{runEventDetail(event.phase, event.detail)}</Typography.Text>
                </div>
                <Tag color={event.phase === 'failed' ? 'red' : event.phase === 'cancelled' ? 'orange' : event.phase === 'validated' ? 'green' : isRunning && event === latestEvent ? 'processing' : 'default'}>
                  {event.phase === 'failed' ? '失败' : event.phase === 'cancelled' ? '已取消' : event.phase === 'validated' ? '已完成' : isRunning && event === latestEvent ? '进行中' : '已完成'}
                </Tag>
              </List.Item>
            )}
          />
        ) : null}
      </Card>
    </section>
  );
};
