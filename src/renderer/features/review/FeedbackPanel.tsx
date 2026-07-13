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

  return <Card title="本次复核反馈" className="academic-card">
    <Space orientation="vertical" size="middle" className="feedback-panel">
      {memoryTrace ? (
        <div>
          <Typography.Text type="secondary">本次参考记忆：</Typography.Text>
          <Space size={[6, 6]} wrap>
            {memoryTrace.personalPromptApplied ? <Tag color="blue">个人提示词</Tag> : null}
            {memoryTrace.appliedRuleIds.length ? <Tag color="cyan">{memoryTrace.appliedRuleIds.length} 条个人规则</Tag> : null}
            {memoryTrace.relevantFeedbackIds.length ? <Tag color="purple">{memoryTrace.relevantFeedbackIds.length} 条历史反馈</Tag> : null}
            {!memoryTrace.personalPromptApplied && !memoryTrace.appliedRuleIds.length && !memoryTrace.relevantFeedbackIds.length ? <Tag>未命中记忆</Tag> : null}
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
          message={authorMetadataOnly ? '作者姓名、单位和身份反馈只保存为原始复核记录，不会生成分类规则，也不会注入后续论文的 Agent 上下文。' : '本次包含作者信息反馈；该部分不会进入分类规则或后续 Agent 上下文，其他分类问题仍可生成候选规则。'}
        />
      ) : null}
      <div>
        <Typography.Text strong>本论文复核说明</Typography.Text>
        <Input.TextArea
          value={value.projectReason}
          maxLength={2000}
          showCount
          rows={4}
          placeholder="说明本篇论文为什么这样修改；仅保存在当前项目的复核历史中。"
          onChange={(event) => onChange({ ...value, projectReason: event.target.value })}
        />
      </div>
      <div>
        <Typography.Text strong>本次反馈如何使用</Typography.Text>
        <Radio.Group value={value.memoryAction} onChange={(event) => onChange({ ...value, memoryAction: event.target.value })}>
          <Space orientation="vertical" className="feedback-scope-options">
            <Radio value="project_only"><Typography.Text>仅保存到当前论文</Typography.Text><Typography.Text type="secondary">不会出现在全局记忆中，也不会影响其他论文。</Typography.Text></Radio>
            <Radio value="global_memory"><Typography.Text>加入跨项目反馈记忆</Typography.Text><Typography.Text type="secondary">后续相似论文可以检索这次经验，但不会直接成为规则。</Typography.Text></Radio>
            <Radio value="candidate_rule" disabled={authorMetadataOnly}><Typography.Text>生成全局候选规则</Typography.Text><Typography.Text type="secondary">需要在“规则与记忆”中再次批准后才会生效。</Typography.Text></Radio>
          </Space>
        </Radio.Group>
      </div>
      {value.memoryAction !== 'project_only' ? (
        <div>
          <Typography.Text strong>可复用经验{value.memoryAction === 'candidate_rule' ? '（必填）' : '（可选）'}</Typography.Text>
          <Input.TextArea
            value={value.reusableLesson}
            maxLength={2000}
            showCount
            rows={4}
            status={value.memoryAction === 'candidate_rule' && !value.reusableLesson.trim() ? 'warning' : undefined}
            placeholder={value.memoryAction === 'candidate_rule' ? '提炼一条可以安全应用到其他相似论文的规则依据。' : '只填写可以跨论文复用的经验，不要放入本篇特有的页码、错字或作者信息。'}
            onChange={(event) => onChange({ ...value, reusableLesson: event.target.value })}
          />
        </div>
      ) : null}
      <Typography.Text type="secondary">项目复核说明与跨项目记忆分开保存；只有全局候选规则需要人工二次批准。</Typography.Text>
    </Space>
  </Card>;
};
