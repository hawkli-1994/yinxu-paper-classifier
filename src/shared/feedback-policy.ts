import type { FeedbackErrorType, ReviewFeedbackInput } from './contracts';

export const AUTHOR_METADATA_ERROR_TYPES = ['作者姓名识别错误', '作者单位或身份错误'] as const satisfies readonly FeedbackErrorType[];

const authorMetadataErrorTypeSet = new Set<FeedbackErrorType>(AUTHOR_METADATA_ERROR_TYPES);

export const isAuthorMetadataErrorType = (errorType: FeedbackErrorType): boolean => authorMetadataErrorTypeSet.has(errorType);

export const getFeedbackScope = (feedback: Pick<ReviewFeedbackInput, 'errorTypes'>): 'classification' | 'author_metadata' | 'mixed' => {
  const authorErrorCount = feedback.errorTypes.filter(isAuthorMetadataErrorType).length;
  if (authorErrorCount === 0) return 'classification';
  return authorErrorCount === feedback.errorTypes.length ? 'author_metadata' : 'mixed';
};

export const isAuthorMetadataOnlyFeedback = (feedback: Pick<ReviewFeedbackInput, 'errorTypes'>): boolean =>
  feedback.errorTypes.length > 0 && getFeedbackScope(feedback) === 'author_metadata';
