import { objectParticle } from './koreanParticle';

describe('objectParticle (REQ-UPL-060, TC-UPL-084)', () => {
  it.each(['하늘', '꽃', '우산', '가을 하늘', '값'])('TC-UPL-084 받침 있는 한글 음절로 끝나면 을: %s', (word) => {
    expect(objectParticle(word)).toBe('을');
  });

  it.each(['바다', '나무', '사과', '가을 바다'])('TC-UPL-084 받침 없는 한글 음절로 끝나면 를: %s', (word) => {
    expect(objectParticle(word)).toBe('를');
  });

  it('TC-UPL-084 끝의 공백은 무시한다("겨울 " → 을), 빈 문자열은 를', () => {
    expect(objectParticle('겨울 ')).toBe('을');
    expect(objectParticle('바다  ')).toBe('를');
    expect(objectParticle('')).toBe('를');
    expect(objectParticle('   ')).toBe('를');
  });

  it.each(['abc', '123', 'Photo!', 'ㅎ', '😀'])('TC-UPL-084 한글 음절이 아닌 글자로 끝나면 를: %s', (word) => {
    expect(objectParticle(word)).toBe('를');
  });
});
