import { useMemo, useState } from 'react';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Checkbox, Col, Descriptions, Empty, Input, InputNumber, Modal, Row, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ConfidenceBand, PaperFieldName, PaperResult, ReviewFeedbackInput } from '../../../shared/contracts';
import { PAPER_FIELD_NAMES } from '../../../shared/contracts';
import { addReviewEvidence, clearReviewFieldEvidence, removeReviewEvidence, updateReviewCrossReferences, updateReviewEvidence, updateReviewField, updateReviewPrimaryCategory } from '../../../shared/review-model';
import { getCategoryPath, listLeafCategories } from '../../../shared/taxonomy';
import { useAppStore } from '../../store';
import { PdfEvidencePreview } from './PdfEvidencePreview';
import { FeedbackPanel } from './FeedbackPanel';
import { isAuthorMetadataOnlyFeedback } from '../../../shared/feedback-policy';
import { getReviewSaveErrorMessage } from './review-save-error';

const confidenceColor = (band: ConfidenceBand): string => ({ green: 'success', yellow: 'warning', red: 'error' })[band];
const assessmentBand = (score: number): ConfidenceBand => (score >= 0.85 ? 'green' : score >= 0.6 ? 'yellow' : 'red');
const categoryOptions = listLeafCategories().map((category) => ({ value: category.code, label: `${category.code} ${category.label}` }));
const programManagedFields = new Set<PaperFieldName>(['一级分类', '二级分类', '三级细分类', '文件路径']);
const emptyFeedback = (): ReviewFeedbackInput => ({ errorTypes: [], projectReason: '', memoryAction: 'global_memory', reusableLesson: '', manualEvidenceConfirmed: false });
const evidenceFieldPattern = /^(.+?)字段的第\s*\d+\s*页证据无法核对。$/u;
const missingFieldAssessment = { score: 0, reason: '旧版结果未包含该字段，待补充。', evidence: [] };

export const ReviewPage = (): React.JSX.Element => {
  const result = useAppStore((state) => state.result);
  const project = useAppStore((state) => state.project);
  const setResult = useAppStore((state) => state.setResult);
  const setWorkspace = useAppStore((state) => state.setWorkspace);
  const refreshProjects = useAppStore((state) => state.refreshProjects);
  const [saving, setSaving] = useState(false);
  const [selectedEvidenceIndex, setSelectedEvidenceIndex] = useState(0);
  const [feedback, setFeedback] = useState<ReviewFeedbackInput>(emptyFeedback);
  const rows = useMemo(
    () =>
      result
        ? PAPER_FIELD_NAMES.map((name) => ({ key: name, name, value: result.fields[name] ?? '', assessment: result.fieldAssessments[name] ?? missingFieldAssessment }))
        : [],
    [result]
  );

  if (!result || !project) return <Empty description="完成 AI 分类后，可在此复核并导出结果。" />;

  const update = (next: PaperResult): void => setResult({ ...next, reviewStatus: 'needs_review' });
  const selectedEvidence = result.evidence[Math.min(selectedEvidenceIndex, result.evidence.length - 1)];
  const unverifiableFieldNames = result.validationIssues
    .filter((issue) => issue.code === 'UNVERIFIABLE_FIELD_EVIDENCE')
    .map((issue) => issue.message.match(evidenceFieldPattern)?.[1])
    .filter((name): name is PaperFieldName => Boolean(name));
  const hasUnverifiableEvidence = result.validationIssues.some((issue) => issue.code === 'UNVERIFIABLE_EVIDENCE' || issue.code === 'UNVERIFIABLE_FIELD_EVIDENCE');

  const save = async (): Promise<void> => {
    if (feedback.memoryAction === 'candidate_rule' && !feedback.reusableLesson.trim()) {
      message.warning('请先填写跨项目处理原则，再提交候选规则。');
      return;
    }
    setSaving(true);
    try {
      const workspace = await window.yinxu.saveReview(project.id, result, feedback);
      setWorkspace(workspace);
      if (workspace.result) setResult(workspace.result);
      await refreshProjects();
      setFeedback(emptyFeedback());
      message.success(
        isAuthorMetadataOnlyFeedback(feedback)
          ? feedback.memoryAction === 'project_only' ? '作者信息的复核记录已保存到当前项目。' : '作者信息的复核记录已保存，不会影响后续论文的分类。'
          : feedback.memoryAction === 'candidate_rule'
            ? '人工复核已保存，跨项目候选规则等待确认。'
            : feedback.memoryAction === 'global_memory'
              ? '人工复核和跨项目参考经验已保存。'
              : '人工复核仅保存到当前项目。'
      );
    } catch (error) {
      message.error(getReviewSaveErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const exportResult = async (): Promise<void> => {
    try {
      const path = await window.yinxu.exportWorkbook(project.id);
      if (!path) return;
      Modal.success({
        title: 'Excel 导出完成',
        content: <Typography.Text copyable>{path}</Typography.Text>,
        okText: '知道了'
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败。');
    }
  };

  return (
    <section className="page-section">
      <Typography.Title level={2}>人工复核与导出</Typography.Title>
      <Alert
        className="section-alert"
        type={result.confidenceBand === 'red' ? 'error' : result.confidenceBand === 'yellow' ? 'warning' : 'success'}
        showIcon
        title={`系统评估置信度：${result.confidence} 分。保存修改时，系统会重新校验证据并计算分数。`}
      />
      {hasUnverifiableEvidence ? (
        <Alert
          className="section-alert"
          type="warning"
          showIcon
          title="OCR 文本与原 PDF 有差异，不应成为人工复核的卡点"
          description={
            <Space orientation="vertical" size="small">
              <Typography.Text>你可以直接在右侧对照原 PDF 修改引文；若原 PDF 清晰但 OCR 错漏，确认后即可保存。</Typography.Text>
              {unverifiableFieldNames.length ? <Button size="small" onClick={() => update(clearReviewFieldEvidence(result, unverifiableFieldNames))}>移除 {unverifiableFieldNames.join('、')} 的无法核对引文</Button> : null}
              <Checkbox checked={feedback.manualEvidenceConfirmed === true} onChange={(event) => setFeedback({ ...feedback, manualEvidenceConfirmed: event.target.checked })}>
                我已对照原 PDF 人工核实这些证据，允许继续保存（系统将记录此确认）
              </Checkbox>
            </Space>
          }
        />
      ) : null}
      {result.validationIssues.filter((issue) => issue.code !== 'UNVERIFIABLE_EVIDENCE' && issue.code !== 'UNVERIFIABLE_FIELD_EVIDENCE').length > 0 ? (
        <Alert
          className="section-alert"
          type="error"
          showIcon
          title="以下信息仍需补充后保存"
          description={result.validationIssues.filter((issue) => issue.code !== 'UNVERIFIABLE_EVIDENCE' && issue.code !== 'UNVERIFIABLE_FIELD_EVIDENCE').map((issue) => issue.message).join('；')}
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
                <Typography.Text strong>互见分类（最多 3 项）</Typography.Text>
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
              <Descriptions.Item label="当前分类路径">
                <Tag color={confidenceColor(result.confidenceBand)}>{getCategoryPath(result.primaryCategoryCode).map((item) => `${item.code} ${item.label}`).join(' / ')}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">{result.reviewStatus === 'confirmed' ? '已确认' : '待复核'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="论文分类字段" className="academic-card">
            <Alert
              type="info"
              showIcon
              className="author-source-alert"
              message="作者姓名按论文原文顺序记录；作者单位仅记录论文中明确标注的信息。系统不根据姓名、固定名单或当前职务推断作者所属机构。"
            />
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
                  title: '结果与判定依据',
                  dataIndex: 'value',
                  render: (value: string, row: { name: PaperFieldName; assessment: PaperResult['fieldAssessments'][PaperFieldName] }) => (
                    <Space orientation="vertical" size={4} className="field-editor">
                      {programManagedFields.has(row.name) ? (
                        <Space wrap><Typography.Text code copyable>{value || '系统尚未生成'}</Typography.Text><Tag>系统维护 · 只读</Tag></Space>
                      ) : (
                        <Input value={value} onChange={(event) => update(updateReviewField(result, row.name, event.target.value))} />
                      )}
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
                    <Typography.Text>PDF 页码</Typography.Text>
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
                      placeholder="请填写与指定页面文本完全一致的原文引文"
                      onChange={(event) => update(updateReviewEvidence(result, index, { quote: event.target.value }))}
                    />
                    <Input.TextArea
                      aria-label={`证据 ${index + 1} 判断理由`}
                      value={evidence.reason}
                      autoSize={{ minRows: 2, maxRows: 4 }}
                      placeholder="说明该引文如何支持当前主分类"
                      onChange={(event) => update(updateReviewEvidence(result, index, { reason: event.target.value }))}
                    />
                  </Space>
                </Card>
              ))}
              <Button icon={<PlusOutlined />} onClick={() => update(addReviewEvidence(result))}>添加证据</Button>
            </Space>
          </Card>

          <Card title="证据页预览" className="academic-card">
            {selectedEvidence ? <PdfEvidencePreview projectId={project.id} page={selectedEvidence.page} /> : <Empty description="请选择证据" />}
          </Card>

          <Card title="候选分类对比" className="academic-card">
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
      <FeedbackPanel value={feedback} memoryTrace={result.memoryTrace} onChange={setFeedback} />
      <Space wrap>
        <Button type="primary" loading={saving} onClick={() => void save()}>校验并保存复核结果</Button>
        <Button disabled={result.reviewStatus !== 'confirmed'} onClick={() => void exportResult()}>导出 Excel</Button>
        {result.reviewStatus !== 'confirmed' ? <Typography.Text type="secondary">通过校验并保存后才能导出。</Typography.Text> : null}
      </Space>
    </section>
  );
};
