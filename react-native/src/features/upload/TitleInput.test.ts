import { clampTitle, titleForRequest, titleLength } from './TitleInput';

const FAMILY = '👨‍👩‍👧'; // 5 code points(ZWJ 포함), grapheme 1개

describe('TitleInput', () => {
  it('TC-UPL-080 한글 10자는 그대로 두고 11번째 글자는 들어가지 않는다', () => {
    expect(clampTitle('가나다라마바사아자차')).toBe('가나다라마바사아자차');
    expect(clampTitle('가나다라마바사아자차카')).toBe('가나다라마바사아자차');
    expect(titleLength('가나다라마바사아자차')).toBe(10);
  });

  it('TC-UPL-080 이모지 10개는 허용되고 UTF-16 길이(20)가 아니라 code point(10)로 센다', () => {
    const ten = '😀'.repeat(10);
    expect(ten.length).toBe(20);
    expect(titleLength(ten)).toBe(10);
    expect(clampTitle(ten)).toBe(ten);
    expect(clampTitle(`${ten}😀`)).toBe(ten);
  });

  it('TC-UPL-081 결합 이모지는 grapheme이 아니라 code point로 센다(가족 이모지 2개 = 10)', () => {
    const twoFamilies = FAMILY + FAMILY;
    expect(titleLength(twoFamilies)).toBe(10);
    expect(clampTitle(twoFamilies)).toBe(twoFamilies);
    // 한 글자를 더 붙이면 11번째 code point부터 막힌다
    expect(clampTitle(`${twoFamilies}가`)).toBe(twoFamilies);
  });

  it('TC-UPL-081 11자 붙여넣기는 10 code point까지만 받는다', () => {
    expect(clampTitle('가나다라마바사아자차카')).toHaveLength(10);
    const pasted = `${FAMILY}${FAMILY}가나`;
    expect(Array.from(clampTitle(pasted))).toHaveLength(10);
    expect(clampTitle(pasted)).toBe(FAMILY + FAMILY);
  });

  it('TC-UPL-082 앞뒤 공백을 뺀 길이로 센다: " 가나다라마바사아자차 "는 10자', () => {
    expect(titleLength(' 가나다라마바사아자차 ')).toBe(10);
    expect(clampTitle(' 가나다라마바사아자차 ')).toBe(' 가나다라마바사아자차 ');
  });

  it('TC-UPL-082 요청의 title은 앞뒤 공백을 제거한 값이고 공백뿐이면 null이다', () => {
    expect(titleForRequest(' 가나다라마바사아자차 ')).toBe('가나다라마바사아자차');
    expect(titleForRequest('   ')).toBeNull();
    expect(titleForRequest('')).toBeNull();
    expect(titleForRequest('\n\t ')).toBeNull();
  });

  it('TC-UPL-082 가운데 공백은 그대로 둔다', () => {
    expect(titleForRequest(' 가을  하늘 ')).toBe('가을  하늘');
    expect(titleLength('가을  하늘')).toBe(6);
  });
});
