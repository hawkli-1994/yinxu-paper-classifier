import { Card, Checkbox, Input, Space, Switch, Tag, Typography } from 'antd';
import { FEEDBACK_ERROR_TYPES, type MemoryTrace, type ReviewFeedbackInput } from '../../../shared/contracts';

interface FeedbackPanelProps {
  value: ReviewFeedbackInput;
  memoryTrace?: MemoryTrace;
  onChange(value: ReviewFeedbackInput): void;
}

export const FeedbackPanel = ({ value, memoryTrace, onChange }: FeedbackPanelProps): React.JSX.Element => (
  <Card title="本次复核反馈" className="academic-card">
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
          onChange={(errorTypes) => onChange({ ...value, errorTypes: errorTypes as ReviewFeedbackInput['errorTypes'] })}
        />
      </div>
      <div>
        <Typography.Text strong>修改理由或经验</Typography.Text>
        <Input.TextArea
          value={value.reason}
          maxLength={2000}
          showCount
          rows={4}
          placeholder="说明为什么修改；这段文字会和修改前后结果一起保存到本机记忆。"
          onChange={(event) => onChange({ ...value, reason: event.target.value })}
        />
      </div>
      <Space>
        <Switch
          checked={value.rememberAsCandidate}
          onChange={(rememberAsCandidate) => onChange({ ...value, rememberAsCandidate })}
        />
        <Typography.Text>将本次经验生成候选规则，稍后由我确认</Typography.Text>
      </Space>
      <Typography.Text type="secondary">反馈会进入本机记录；候选规则必须在“规则与记忆”页面批准后才会参与后续分类。</Typography.Text>
    </Space>
  </Card>
);
