import { countTitleLength, limitTitleInput, titleForRequest } from './titleInput';

const FAMILY = '👨‍👩‍👧'; // code point 5개(남자 ZWJ 여자 ZWJ 여자아이)

describe('제목 입력 규칙(D-01)', () => {
  it('TC-FEED-019 이모지 10개는 허용(UTF-16 20)되고 11번째는 입력되지 않는다', () => {
    const nine = '🙂'.repeat(9);
    const ten = '🙂'.repeat(10);
    expect(ten.length).toBe(20);
    expect(countTitleLength(ten)).toBe(10);
    expect(limitTitleInput(nine, ten)).toBe(ten);
    expect(limitTitleInput(ten, ten + '🙂')).toBe(ten);
  });

  it('TC-FEED-020 결합 이모지는 구성 code point 수만큼 세어 2개 뒤 한 글자(11)부터 막는다', () => {
    expect(countTitleLength(FAMILY)).toBe(5);
    expect(limitTitleInput(FAMILY, FAMILY + FAMILY)).toBe(FAMILY + FAMILY);
    expect(limitTitleInput(FAMILY + FAMILY, FAMILY + FAMILY + '가')).toBe(FAMILY + FAMILY);
  });

  it('TC-FEED-020 11자 붙여넣기는 10 code point까지만 들어간다', () => {
    expect(limitTitleInput('', '가나다라마바사아자차카')).toBe('가나다라마바사아자차');
    expect(limitTitleInput('가나다', '가나다라마바사아자차카타')).toBe('가나다라마바사아자차');
  });

  it('TC-FEED-021 앞뒤 공백을 포함해 12자여도 제거 후 10자면 허용되고 전송 값은 공백이 제거된다', () => {
    const padded = ' 가나다라마바사아자차 ';
    expect(padded.length).toBe(12);
    expect(countTitleLength(padded)).toBe(10);
    expect(limitTitleInput('', padded)).toBe(padded);
    expect(titleForRequest(padded)).toBe('가나다라마바사아자차');
  });

  it('TC-FEED-022 빈 입력이나 공백만(NBSP·U+3000 포함)이면 null이다', () => {
    expect(titleForRequest('')).toBeNull();
    expect(titleForRequest('   ')).toBeNull();
    expect(titleForRequest(' 　')).toBeNull();
    expect(titleForRequest(' 가　')).toBe('가');
  });
});
