import { describe, expect, it } from 'vitest';
import { getReviewSaveErrorMessage } from '../../src/renderer/features/review/review-save-error';

describe('review save error messages', () => {
  it('turns missing metadata validation into clear completion guidance', () => {
    const error = new Error("Error invoking remote method 'review:save': PaperResultValidationError: Paper result failed validation: 作者、题名、出处和摘要是分类所需的关键元数据。");

    expect(getReviewSaveErrorMessage(error)).toBe(
      '暂无法保存复核结果：作者、题名、出处和摘要尚未完整填写。请在“论文分类字段”中逐项补全后再次保存。'
    );
  });

  it('removes Electron IPC wrappers from other save errors', () => {
    const error = new Error("Error invoking remote method 'review:save': Error: 当前项目正在分类。请等待任务结束后，再修改资料、复核结果或切换版本。");

    expect(getReviewSaveErrorMessage(error)).toBe(
      '保存复核结果失败：当前项目正在分类。请等待任务结束后，再修改资料、复核结果或切换版本。'
    );
  });
});
