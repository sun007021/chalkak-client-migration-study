import { d } from './__testing__/helpers';
import { clampToFirstTopicDate, isBeforeFirstTopicDate } from './topicDateBounds';

describe('TIME: FIRST_TOPIC_DATE 하한', () => {
  it('TC-TIME-009 2026-09-17은 이동 가능, 2026-09-16은 막힌다', () => {
    expect(isBeforeFirstTopicDate(d('2026-09-17'))).toBe(false);
    expect(isBeforeFirstTopicDate(d('2026-09-16'))).toBe(true);
    expect(isBeforeFirstTopicDate(d('2026-09-18'))).toBe(false);
    expect(isBeforeFirstTopicDate(d('2025-12-31'))).toBe(true);
  });

  it('TC-TIME-009 clampToFirstTopicDate는 하한보다 이른 날짜만 하한으로 올린다', () => {
    expect(clampToFirstTopicDate(d('2026-09-16')).toString()).toBe('2026-09-17');
    expect(clampToFirstTopicDate(d('2026-09-17')).toString()).toBe('2026-09-17');
    expect(clampToFirstTopicDate(d('2026-10-27')).toString()).toBe('2026-10-27');
  });
});
