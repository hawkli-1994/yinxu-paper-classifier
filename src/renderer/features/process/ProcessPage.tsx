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
  const setActivePage = useAppStore((state) => state.setActivePage);

  const run = async (): Promise<void> => {
    if (!project) return;
    setRunning(true);
    try {
      const result = await window.yinxu.runClassification(project.id);
      setResult(result);
      setActivePage('review');
      message.success('AI 已生成分类结果，请复核标黄或标红字段。');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '分类处理失败。');
    } finally {
      setRunning(false);
    }
  };

  if (!project || !preparation) return <Empty description="请先导入论文" />;
  const progress = running ? Math.min(92, 20 + events.length * 12) : events.some((event) => event.phase === 'validated') ? 100 : 0;

  return (
    <section className="page-section">
      <Typography.Title level={2}>处理与分类</Typography.Title>
      <Card className="academic-card" title={project.sourceFileName}>
        <Steps current={running ? Math.min(5, Math.max(1, events.length)) : 0} size="small" items={phaseLabels.map((title) => ({ title }))} />
        <Progress percent={progress} status={events.some((event) => event.phase === 'failed') ? 'exception' : undefined} />
        <Button type="primary" loading={running} onClick={() => void run()}>开始 AI 分类</Button>
      </Card>
      {!preparation.ocrApplied && preparation.pagesNeedingOcr.length > 0 ? <Alert className="section-alert" type="warning" showIcon message="检测到扫描页但尚未完成 OCR；请检查 OCR API Key 后重新导入，或继续由 Agent 基于可提取文本处理。" /> : null}
      {preparation.textReport?.quality === 'low' ? <Alert className="section-alert" type="error" showIcon message="OCR 文本质量异常：分类仍可继续，但结果会降级为需复核。请先回到导入页核对需复核页。" /> : null}
      <Collapse className="academic-card" items={[{ key: 'events', label: '详细记录', children: <List size="small" dataSource={events} locale={{ emptyText: '等待开始' }} renderItem={(event) => <List.Item><Tag>{event.phase}</Tag>{event.detail}</List.Item>} /> }]} />
    </section>
  );
};
