import { POST_TITLE_MAX } from '../../constants';
import { clampTitleInput, countCodePoints, titlePayload } from './titleInput';

const FAMILY = '👨‍👩‍👧'; // 👨 ZWJ 👩 ZWJ 👧 = 5 code point

describe('제목 길이 (D-01, REQ-FEED-018, 019)', () => {
  it('POST_TITLE_MAX는 10이다', () => {
    expect(POST_TITLE_MAX).toBe(10);
  });

  it('TC-FEED-019 code point 수로 센다: 이모지 10개는 UTF-16으로 20이지만 10이다', () => {
    const emojis = '😀'.repeat(10);
    expect(emojis).toHaveLength(20);
    expect(countCodePoints(emojis)).toBe(10);
    expect(countCodePoints('가나다라마바사아자차')).toBe(10);
    expect(countCodePoints('')).toBe(0);
  });

  it('TC-FEED-020 결합 이모지는 grapheme이 아니라 구성 code point 수만큼 센다', () => {
    expect(countCodePoints(FAMILY)).toBe(5);
    expect(countCodePoints(FAMILY.repeat(2))).toBe(10);
  });

  it('TC-FEED-019 이모지 10개는 허용되고 11번째를 이어 붙인 입력은 10개로 되돌아온다', () => {
    const ten = '😀'.repeat(10);
    expect(clampTitleInput(ten)).toBe(ten);
    expect(clampTitleInput(`${ten}😀`)).toBe(ten);
  });

  it('TC-FEED-020 결합 이모지 2개(10 code point)는 허용되고 한 글자를 더하면 막힌다', () => {
    const two = FAMILY.repeat(2);
    expect(clampTitleInput(two)).toBe(two);
    expect(clampTitleInput(`${two}가`)).toBe(two);
  });

  it('TC-FEED-020 11자 붙여넣기는 10 code point까지만 들어간다', () => {
    expect(clampTitleInput('가나다라마바사아자차카')).toBe('가나다라마바사아자차');
    expect(clampTitleInput('😀'.repeat(15))).toBe('😀'.repeat(10));
  });

  it('TC-FEED-021 REQ-FEED-019 앞뒤 공백은 길이에 넣지 않는다: " 가나다라마바사아자차 "(12자)는 그대로 둔다', () => {
    expect(clampTitleInput(' 가나다라마바사아자차 ')).toBe(' 가나다라마바사아자차 ');
    expect(clampTitleInput('  가나다라마바사아자차카  ')).toBe('  가나다라마바사아자차');
  });

  it('10자 이하와 빈 입력은 손대지 않는다', () => {
    expect(clampTitleInput('')).toBe('');
    expect(clampTitleInput('비 오는 날')).toBe('비 오는 날');
    expect(clampTitleInput('   ')).toBe('   ');
  });
});

describe('제목 요청 값 (REQ-FEED-020)', () => {
  it('TC-FEED-021 앞뒤 공백을 제거한 문자열을 보낸다', () => {
    expect(titlePayload(' 가나다라마바사아자차 ')).toBe('가나다라마바사아자차');
    expect(titlePayload('비 오는 날')).toBe('비 오는 날');
  });

  it.each([[''], ['   '], ['\t\n '], ['　']])('TC-FEED-022 %j는 title을 null로 보낸다(키 누락 금지)', (raw) => {
    expect(titlePayload(raw)).toBeNull();
  });
});
