import { FEEDBACK_MAX, FEEDBACK_MIN } from '../../shared/constants';
import { feedbackLength, trimFeedback, validateFeedback } from './feedbackText';

const FAMILY = '👨‍👩‍👧'; // 👨 ZWJ 👩 ZWJ 👧 = code point 5개

describe('feedbackText', () => {
  it('공통 상수는 최소 1, 최대 1000이다', () => {
    expect([FEEDBACK_MIN, FEEDBACK_MAX]).toEqual([1, 1000]);
  });

  it.each([
    ['빈 문자열', ''],
    ['스페이스', '   '],
    ['탭과 개행', '\t\n\r\n'],
    ['전각 공백 U+3000 조합', '　 　\n\t'],
  ])('TC-FDBK-004 공백만(%s)이면 길이 0, empty다', (_name, text) => {
    expect(feedbackLength(text)).toBe(0);
    expect(validateFeedback(text)).toBe('empty');
  });

  it('TC-FDBK-005 trim 후 1 code point면 ok다', () => {
    expect(feedbackLength('  가  ')).toBe(1);
    expect(validateFeedback('  가  ')).toBe('ok');
  });

  it('TC-FDBK-006 trim 후 정확히 1000 code point는 ok, 1001은 too-long이다', () => {
    expect(validateFeedback('a'.repeat(1000))).toBe('ok');
    expect(validateFeedback('a'.repeat(1001))).toBe('too-long');
  });

  it('TC-FDBK-008 앞뒤 공백 포함 총 1002자여도 trim 후 1000자면 ok이고 trimFeedback이 정리한 값을 돌려준다', () => {
    const text = ` ${'a'.repeat(1000)} `;
    expect(text).toHaveLength(1002);
    expect(feedbackLength(text)).toBe(1000);
    expect(validateFeedback(text)).toBe('ok');
    expect(trimFeedback(text)).toBe('a'.repeat(1000));
  });

  it('TC-FDBK-009 이모지는 UTF-16 길이가 아니라 code point로 센다(1000개 ok, 1001개 too-long)', () => {
    const emoji = '😀';
    expect(emoji.length).toBe(2);
    expect(feedbackLength(emoji.repeat(1000))).toBe(1000);
    expect(validateFeedback(emoji.repeat(1000))).toBe('ok');
    expect(validateFeedback(emoji.repeat(1001))).toBe('too-long');
  });

  it('TC-FDBK-010 결합 이모지는 grapheme가 아니라 code point로 센다(200개 ok, 201개 too-long)', () => {
    expect(Array.from(FAMILY)).toHaveLength(5);
    expect(feedbackLength(FAMILY.repeat(200))).toBe(1000);
    expect(validateFeedback(FAMILY.repeat(200))).toBe('ok');
    expect(feedbackLength(FAMILY.repeat(201))).toBe(1005);
    expect(validateFeedback(FAMILY.repeat(201))).toBe('too-long');
  });

  it('TC-FDBK-011 한글은 정규화하지 않고 code point 그대로 센다(조합형 1, 분해형 3)', () => {
    const composed = '한'; // 한
    const decomposed = composed.normalize('NFD');
    expect(feedbackLength(composed)).toBe(1);
    expect(feedbackLength(decomposed)).toBe(3);
    expect(trimFeedback(decomposed)).toBe(decomposed);
  });

  it('TC-FDBK-012 앞뒤만 제거하고 중간의 개행·연속 공백은 보존한다', () => {
    expect(trimFeedback('\n  첫 줄\n\n  둘째   줄  \t')).toBe('첫 줄\n\n  둘째   줄');
  });

  it('TC-FDBK-014 10만 자도 즉시 길이를 세고 too-long이다', () => {
    const text = 'a'.repeat(100_000);
    expect(feedbackLength(text)).toBe(100_000);
    expect(validateFeedback(text)).toBe('too-long');
  });
});
