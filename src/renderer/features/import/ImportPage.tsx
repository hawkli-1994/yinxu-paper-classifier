import { useState } from 'react';
import { Alert, Button, Card, Descriptions, Empty, Space, Typography, message } from 'antd';
import { FilePdfOutlined, UploadOutlined } from '@ant-design/icons';
import { useAppStore } from '../../store';

const textQualityLabel = (quality: 'high' | 'low' | 'unknown'): string =>
  ({ high: '可用', low: '需复核', unknown: '未知' })[quality];

const reviewPages = (preparation: ReturnType<typeof useAppStore.getState>['preparation']): string => {
  const pages = preparation?.textReport?.pages.filter((page) => page.needsReview).map((page) => page.page) ?? [];
  return pages.length ? pages.join('、') : '无';
};

export const ImportPage = (): React.JSX.Element => {
  const [importing, setImporting] = useState(false);
  const preparation = useAppStore((state) => state.preparation);
  const setPreparation = useAppStore((state) => state.setPreparation);
  const setActivePage = useAppStore((state) => state.setActivePage);

  const selectPaper = async (): Promise<void> => {
    setImporting(true);
    try {
      const next = await window.yinxu.selectAndCreateProject();
      if (!next) return;
      setPreparation(next);
      message.success('论文已导入并完成文本检查。');
      setActivePage('process');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入论文失败。');
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="page-section">
      <Typography.Title level={2}>导入论文</Typography.Title>
      <Typography.Paragraph type="secondary">选择一篇殷墟研究 PDF。电子版直接提取文字；扫描页会在已配置 OCR 时自动处理。</Typography.Paragraph>
      <Card className="import-card academic-card">
        <FilePdfOutlined className="import-icon" />
        <Typography.Title level={4}>选择 PDF</Typography.Title>
        <Typography.Paragraph type="secondary">第一版建议单篇不超过 100 页或 50 MB。</Typography.Paragraph>
        <Button type="primary" icon={<UploadOutlined />} loading={importing} onClick={() => void selectPaper()}>选择 PDF</Button>
      </Card>
      {preparation ? (
        <Card title="当前项目" className="academic-card">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="原始文件">{preparation.project.sourceFileName}</Descriptions.Item>
            <Descriptions.Item label="页数">{preparation.pageCount}</Descriptions.Item>
            <Descriptions.Item label="需 OCR 页">{preparation.pagesNeedingOcr.length ? preparation.pagesNeedingOcr.join('、') : '无'}</Descriptions.Item>
            <Descriptions.Item label="OCR 状态">{preparation.ocrApplied ? '已调用 OCR' : '未调用 OCR'}</Descriptions.Item>
            <Descriptions.Item label="文本质量">{preparation.textReport ? textQualityLabel(preparation.textReport.quality) : '未知'}</Descriptions.Item>
            <Descriptions.Item label="需复核页">{reviewPages(preparation)}</Descriptions.Item>
          </Descriptions>
        </Card>
      ) : (
        <Empty description="尚未导入论文" />
      )}
      {preparation?.textReport?.quality === 'low' ? <Alert className="section-alert" type="warning" showIcon message="部分 OCR 文本过短或与同一中文论文的语言不一致；分类结果会被降级为需复核，请优先检查标出的页。" /> : null}
      <Alert className="section-alert" type="warning" showIcon message="论文会发送至你选择的 Agent Provider；扫描页面还会发送至 OCR Provider。请确认你拥有相应使用权限。" />
      <Space />
    </section>
  );
};
