import { useMemo, useState } from 'react';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Descriptions, Empty, Input, InputNumber, Row, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ConfidenceBand, PaperFieldName, PaperResult } from '../../../shared/contracts';
import { PAPER_FIELD_NAMES } from '../../../shared/contracts';
import { addReviewEvidence, removeReviewEvidence, updateReviewCrossReferences, updateReviewEvidence, updateReviewField, updateReviewPrimaryCategory } from '../../../shared/review-model';
import { getCategoryPath, listLeafCategories } from '../../../shared/taxonomy';
import { useAppStore } from '../../store';
import { PdfEvidencePreview } from './PdfEvidencePreview';

const confidenceColor = (band: ConfidenceBand): string => ({ green: 'success', yellow: 'warning', red: 'error' })[band];
const assessmentBand = (score: number): ConfidenceBand => (score >= 0.85 ? 'green' : score >= 0.6 ? 'yellow' : 'red');
const categoryOptions = listLeafCategories().map((category) => ({ value: category.code, label: `${category.code} ${category.label}` }));

export const ReviewPage = (): React.JSX.Element => {
  const result = useAppStore((state) => state.result);
  const project = useAppStore((state) => state.project);
  const setResult = useAppStore((state) => state.setResult);
  const [saving, setSaving] = useState(false);
  const [selectedEvidenceIndex, setSelectedEvidenceIndex] = useState(0);
  const rows = useMemo(
    () =>
      result
        ? PAPER_FIELD_NAMES.map((name) => ({ key: name, name, value: result.fields[name], assessment: result.fieldAssessments[name] }))
        : [],
    [result]
  );

  if (!result || !project) return <Empty description="完成分类后，结果会在这里等待复核。" />;

  const update = (next: PaperResult): void => setResult({ ...next, reviewStatus: 'needs_review' });
  const selectedEvidence = result.evidence[Math.min(selectedEvidenceIndex, result.evidence.length - 1)];

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const normalized = await window.yinxu.saveReview(project.id, result);
      setResult(normalized);
      message.success('人工复核已校验并保存。');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存复核失败。');
    } finally {
      setSaving(false);
    }
  };

  const exportResult = async (): Promise<void> => {
    try {
      const path = await window.yinxu.exportWorkbook(project.id);
      message.success(`Excel 已导出：${path}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败。');
    }
  };

  return (
    <section className="page-section">
      <Typography.Title level={2}>复核与导出</Typography.Title>
      <Alert
        className="section-alert"
        type={result.confidenceBand === 'red' ? 'error' : result.confidenceBand === 'yellow' ? 'warning' : 'success'}
        showIcon
        title={`程序计算置信度：${result.confidence} 分。修改后保存会重新校验证据并计算。`}
      />
      {result.validationIssues.length > 0 ? (
        <Alert
          className="section-alert"
          type="error"
          showIcon
          title="以下问题必须在确认前修复"
          description={result.validationIssues.map((issue) => issue.message).join('；')}
        />
      ) : null}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title="主分类与互见" className="academic-card">
            <div className="form-grid">
              <div>
                <Typography.Text strong>主三级分类</Typography.Text>
                <Select
                  aria-label="主三级分类"
                  showSearch
                  value={result.primaryCategoryCode}
                  options={categoryOptions}
                  optionFilterProp="label"
                  onChange={(code) => update(updateReviewPrimaryCategory(result, code))}
                  className="review-select"
                />
              </div>
              <div>
                <Typography.Text strong>互见分类（最多三个）</Typography.Text>
                <Select
                  aria-label="互见分类"
                  mode="multiple"
                  maxCount={3}
                  showSearch
                  value={result.crossReferenceCategoryCodes}
                  options={categoryOptions.filter((option) => option.value !== result.primaryCategoryCode)}
                  optionFilterProp="label"
                  onChange={(codes) => update(updateReviewCrossReferences(result, codes))}
                  className="review-select"
                />
              </div>
            </div>
            <Descriptions column={1} size="small" className="review-path">
              <Descriptions.Item label="当前路径">
                <Tag color={confidenceColor(result.confidenceBand)}>{getCategoryPath(result.primaryCategoryCode).map((item) => `${item.code} ${item.label}`).join(' / ')}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">{result.reviewStatus === 'confirmed' ? '已确认' : '待复核'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="论文分类字段" className="academic-card">
            <Table
              size="small"
              pagination={false}
              dataSource={rows}
              scroll={{ y: 620 }}
              columns={[
                {
                  title: '字段',
                  dataIndex: 'name',
                  width: 145,
                  render: (name: PaperFieldName, row) => (
                    <Space orientation="vertical" size={0}>
                      <Typography.Text>{name}</Typography.Text>
                      <Tag color={confidenceColor(assessmentBand(row.assessment.score))}>{Math.round(row.assessment.score * 100)}%</Tag>
                    </Space>
                  )
                },
                {
                  title: '结果与依据',
                  dataIndex: 'value',
                  render: (value: string, row: { name: PaperFieldName; assessment: PaperResult['fieldAssessments'][PaperFieldName] }) => (
                    <Space orientation="vertical" size={4} className="field-editor">
                      <Input value={value} onChange={(event) => update(updateReviewField(result, row.name, event.target.value))} />
                      <Typography.Text type="secondary" className="assessment-reason">{row.assessment.reason || '暂无说明'}</Typography.Text>
                    </Space>
                  )
                }
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card title="主分类原文证据" className="academic-card">
            <Space orientation="vertical" size="middle" className="evidence-list">
              {result.evidence.map((evidence, index) => (
                <Card
                  key={`evidence-${index}`}
                  size="small"
                  type="inner"
                  title={`证据 ${index + 1}`}
                  className={selectedEvidenceIndex === index ? 'selected-evidence' : undefined}
                  extra={
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={result.evidence.length <= 2}
                      onClick={() => {
                        update(removeReviewEvidence(result, index));
                        setSelectedEvidenceIndex(0);
                      }}
                    />
                  }
                  onClick={() => setSelectedEvidenceIndex(index)}
                >
                  <Space orientation="vertical" className="evidence-editor">
                    <Space>
                      <Typography.Text>PDF 页</Typography.Text>
                      <InputNumber
                        aria-label={`证据 ${index + 1} 页码`}
                        min={1}
                        precision={0}
                        value={evidence.page}
                        onChange={(page) => update(updateReviewEvidence(result, index, { page: page ?? 1 }))}
                      />
                    </Space>
                    <Input.TextArea
                      aria-label={`证据 ${index + 1} 原文引文`}
                      value={evidence.quote}
                      autoSize={{ minRows: 2, maxRows: 5 }}
                      placeholder="必须与指定页提取文本逐字一致"
                      onChange={(event) => update(updateReviewEvidence(result, index, { quote: event.target.value }))}
                    />
                    <Input.TextArea
                      aria-label={`证据 ${index + 1} 判断理由`}
                      value={evidence.reason}
                      autoSize={{ minRows: 2, maxRows: 4 }}
                      placeholder="说明该引文为什么支持主分类"
                      onChange={(event) => update(updateReviewEvidence(result, index, { reason: event.target.value }))}
                    />
                  </Space>
                </Card>
              ))}
              <Button icon={<PlusOutlined />} onClick={() => update(addReviewEvidence(result))}>增加证据</Button>
            </Space>
          </Card>

          <Card title="证据页预览" className="academic-card">
            {selectedEvidence ? <PdfEvidencePreview projectId={project.id} page={selectedEvidence.page} /> : <Empty description="请选择证据" />}
          </Card>

          <Card title="候选分类比较" className="academic-card">
            {result.candidates.map((candidate) => (
              <Typography.Paragraph key={candidate.code}>
                <Tag color={candidate.code === result.primaryCategoryCode ? 'processing' : undefined}>{candidate.code}</Tag>
                {candidate.reason}（{Math.round(candidate.score * 100)}%）
              </Typography.Paragraph>
            ))}
            {result.ruleConflicts.length ? <Alert type="warning" showIcon title={result.ruleConflicts.join('；')} /> : null}
          </Card>
        </Col>
      </Row>
      <Space wrap>
        <Button type="primary" loading={saving} onClick={() => void save()}>校验并保存人工复核</Button>
        <Button disabled={result.reviewStatus !== 'confirmed'} onClick={() => void exportResult()}>导出 Excel</Button>
        {result.reviewStatus !== 'confirmed' ? <Typography.Text type="secondary">通过校验并保存后才能导出。</Typography.Text> : null}
      </Space>
    </section>
  );
};
