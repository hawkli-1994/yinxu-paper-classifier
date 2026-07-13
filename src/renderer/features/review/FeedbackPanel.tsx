import { Alert, Card, Checkbox, Input, Radio, Space, Tag, Typography } from 'antd';
import { FEEDBACK_ERROR_TYPES, type MemoryTrace, type ReviewFeedbackInput } from '../../../shared/contracts';
import { getFeedbackScope, isAuthorMetadataOnlyFeedback } from '../../../shared/feedback-policy';

interface FeedbackPanelProps {
  value: ReviewFeedbackInput;
  memoryTrace?: MemoryTrace;
  onChange(value: ReviewFeedbackInput): void;
}

export const FeedbackPanel = ({ value, memoryTrace, onChange }: FeedbackPanelProps): React.JSX.Element => {
  const feedbackScope = getFeedbackScope(value);
  const authorMetadataOnly = isAuthorMetadataOnlyFeedback(value);

  return <Card title="复核说明与经验记录" className="academic-card">
    <Space orientation="vertical" size="middle" className="feedback-panel">
      {memoryTrace ? (
        <div>
          <Typography.Text type="secondary">本次分类使用的参考信息：</Typography.Text>
          <Space size={[6, 6]} wrap>
            {memoryTrace.personalPromptApplied ? <Tag color="blue">全局分类指导</Tag> : null}
            {memoryTrace.appliedRuleIds.length ? <Tag color="cyan">{memoryTrace.appliedRuleIds.length} 条跨项目规则</Tag> : null}
            {memoryTrace.relevantFeedbackIds.length ? <Tag color="purple">{memoryTrace.relevantFeedbackIds.length} 条历史复核经验</Tag> : null}
            {!memoryTrace.personalPromptApplied && !memoryTrace.appliedRuleIds.length && !memoryTrace.relevantFeedbackIds.length ? <Tag>未使用全局参考信息</Tag> : null}
          </Space>
        </div>
      ) : null}
      <div>
        <Typography.Text strong>发现的问题（可多选）</Typography.Text>
        <Checkbox.Group
          className="feedback-errors"
          options={FEEDBACK_ERROR_TYPES.map((label) => ({ label, value: label }))}
          value={value.errorTypes}
          onChange={(errorTypes) => {
            const next = { ...value, errorTypes: errorTypes as ReviewFeedbackInput['errorTypes'] };
            onChange(isAuthorMetadataOnlyFeedback(next) && next.memoryAction === 'candidate_rule' ? { ...next, memoryAction: 'global_memory' } : next);
          }}
        />
      </div>
      {feedbackScope !== 'classification' ? (
        <Alert
          type="info"
          showIcon
          message={authorMetadataOnly ? '作者姓名、单位和身份信息仅作为复核记录保存，不会生成分类规则，也不会影响后续论文的分类。' : '本次反馈包含作者信息。作者信息不会写入分类规则，其他分类问题仍可整理为待确认规则。'}
        />
      ) : null}
      <div>
        <Typography.Text strong>本论文复核说明</Typography.Text>
        <Input.TextArea
          value={value.projectReason}
          maxLength={2000}
          showCount
          rows={4}
          placeholder="说明对本篇论文的修改内容和依据。该说明仅保存在当前项目中。"
          onChange={(event) => onChange({ ...value, projectReason: event.target.value })}
        />
      </div>
      <div>
        <Typography.Text strong>反馈保存范围</Typography.Text>
        <Radio.Group value={value.memoryAction} onChange={(event) => onChange({ ...value, memoryAction: event.target.value })}>
          <Space orientation="vertical" className="feedback-scope-options">
            <Radio value="project_only"><Typography.Text>仅当前论文</Typography.Text><Typography.Text type="secondary">仅保存在当前项目中，不影响其他论文。</Typography.Text></Radio>
            <Radio value="global_memory"><Typography.Text>保存为跨项目参考经验</Typography.Text><Typography.Text type="secondary">后续处理相似论文时可作为参考，但不会直接成为分类规则。</Typography.Text></Radio>
            <Radio value="candidate_rule" disabled={authorMetadataOnly}><Typography.Text>提出跨项目候选规则</Typography.Text><Typography.Text type="secondary">需要在“全局规则与记忆”中确认后，才会用于后续分类。</Typography.Text></Radio>
          </Space>
        </Radio.Group>
      </div>
      {value.memoryAction !== 'project_only' ? (
        <div>
          <Typography.Text strong>跨项目处理原则{value.memoryAction === 'candidate_rule' ? '（必填）' : '（可选）'}</Typography.Text>
          <Input.TextArea
            value={value.reusableLesson}
            maxLength={2000}
            showCount
            rows={4}
            status={value.memoryAction === 'candidate_rule' && !value.reusableLesson.trim() ? 'warning' : undefined}
            placeholder={value.memoryAction === 'candidate_rule' ? '请提炼一条适用于其他相似论文的分类原则，并说明判断依据。' : '仅填写可用于其他论文的处理原则，不要包含本篇特有的页码、文字错误或作者信息。'}
            onChange={(event) => onChange({ ...value, reusableLesson: event.target.value })}
          />
        </div>
      ) : null}
      <Typography.Text type="secondary">当前论文的复核说明与跨项目参考信息分别保存。候选规则经确认后才会用于后续分类。</Typography.Text>
    </Space>
  </Card>;
};
