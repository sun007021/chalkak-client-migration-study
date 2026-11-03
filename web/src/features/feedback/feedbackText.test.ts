import { FEEDBACK_MAX } from '../../constants';
import { COMBINED_EMOJI } from '../../test/settingsHarness';
import { feedbackLength, trimFeedback, validateFeedback } from './feedbackText';

const WHITESPACE_ONLY = [' ', '   ', '\t', '\n', '\r\n', '　', ' \t\n　 ', ' ', '　　\n\n'];

describe('trimFeedback', () => {
  it('TC-FDBK-004 TC-FDBK-008 앞뒤의 스페이스·탭·개행·전각 공백(U+3000)을 모두 제거한다', () => {
    expect(trimFeedback(' \t\n　안녕　\n\t ')).toBe('안녕');
  });

  it('TC-FDBK-012 중간의 개행·연속 공백은 그대로 둔다', () => {
    expect(trimFeedback('  첫 줄\n\n둘째    줄  ')).toBe('첫 줄\n\n둘째    줄');
  });

  it('TC-FDBK-011 정규화하지 않는다(분해형 한글은 분해형 그대로)', () => {
    const nfd = '한'.normalize('NFD');
    expect(trimFeedback(` ${nfd} `)).toBe(nfd);
    expect(nfd).not.toBe('한');
  });
});

describe('feedbackLength', () => {
  it('REQ-FDBK-003 trim 한 뒤의 Unicode code point 수이다', () => {
    expect(feedbackLength('')).toBe(0);
    expect(feedbackLength('  가나다  ')).toBe(3);
    expect(feedbackLength('a b')).toBe(3);
  });

  it.each(WHITESPACE_ONLY)('TC-FDBK-004 공백만(%j) 입력하면 0이다', (input) => {
    expect(feedbackLength(input)).toBe(0);
  });

  it('TC-FDBK-009 이모지 1000개는 1000(UTF-16으로는 2000)이다', () => {
    const text = '😀'.repeat(1000);
    expect(text.length).toBe(2000);
    expect(feedbackLength(text)).toBe(1000);
    expect(feedbackLength('😀'.repeat(1001))).toBe(1001);
  });

  it('TC-FDBK-010 결합 이모지는 grapheme가 아니라 code point로 센다(👨‍👩‍👧 = 5)', () => {
    expect(feedbackLength(COMBINED_EMOJI)).toBe(5);
    expect(feedbackLength(COMBINED_EMOJI.repeat(200))).toBe(1000);
    expect(feedbackLength(COMBINED_EMOJI.repeat(201))).toBe(1005);
  });

  it('TC-FDBK-011 조합형(NFC) 한글 "한"은 1, 분해형(NFD)은 3이다. 정규화하지 않는다', () => {
    expect(feedbackLength('한'.normalize('NFC'))).toBe(1);
    expect(feedbackLength('한'.normalize('NFD'))).toBe(3);
  });

  it('TC-FDBK-014 10만 자도 정확히 센다', () => {
    expect(feedbackLength('가'.repeat(100_000))).toBe(100_000);
  });
});

describe('validateFeedback', () => {
  it('FEEDBACK_MAX는 1000이다', () => {
    expect(FEEDBACK_MAX).toBe(1000);
  });

  it.each(WHITESPACE_ONLY)('TC-FDBK-004 공백만(%j)이면 empty이다', (input) => {
    expect(validateFeedback(input)).toBe('empty');
  });

  it('TC-FDBK-005 trim 후 1 code point는 ok이다', () => {
    expect(validateFeedback('가')).toBe('ok');
    expect(validateFeedback('  가  ')).toBe('ok');
    expect(validateFeedback('😀')).toBe('ok');
  });

  it('TC-FDBK-006 TC-FDBK-007 정확히 1000자는 ok이고 1001자는 too-long이다', () => {
    expect(validateFeedback('가'.repeat(1000))).toBe('ok');
    expect(validateFeedback('가'.repeat(1001))).toBe('too-long');
  });

  it('TC-FDBK-008 앞뒤 공백 포함 총 1002자여도 trim 후 1000자면 ok이다', () => {
    const padded = ` ${'가'.repeat(1000)} `;
    expect(padded.length).toBe(1002);
    expect(validateFeedback(padded)).toBe('ok');
    expect(validateFeedback(` ${'가'.repeat(1001)} `)).toBe('too-long');
  });

  it('TC-FDBK-009 이모지 1000개는 ok, 1001개는 too-long이다', () => {
    expect(validateFeedback('😀'.repeat(1000))).toBe('ok');
    expect(validateFeedback('😀'.repeat(1001))).toBe('too-long');
  });

  it('TC-FDBK-010 결합 이모지 200개(=1000)는 ok, 201개(=1005)는 too-long이다', () => {
    expect(validateFeedback(COMBINED_EMOJI.repeat(200))).toBe('ok');
    expect(validateFeedback(COMBINED_EMOJI.repeat(201))).toBe('too-long');
  });

  it('TC-FDBK-011 분해형 한글 334자(=1002 code point)는 too-long이고 조합형이면 ok이다', () => {
    const syllable = '한';
    expect(validateFeedback(syllable.normalize('NFD').repeat(334))).toBe('too-long');
    expect(validateFeedback(syllable.normalize('NFC').repeat(334))).toBe('ok');
  });

  it('TC-FDBK-014 10만 자는 too-long이다', () => {
    expect(validateFeedback('가'.repeat(100_000))).toBe('too-long');
  });
});
