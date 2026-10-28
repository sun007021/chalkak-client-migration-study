import { objectParticle, recordedMessage } from './koreanParticle';

describe('koreanParticle', () => {
  it.each([
    ['하늘', '을'],
    ['꽃', '을'],
    ['우산', '을'],
    ['바다', '를'],
    ['나무', '를'],
  ] as const)('TC-UPL-084 %s -> %s', (word, particle) => {
    expect(objectParticle(word)).toBe(particle);
  });

  it('TC-UPL-084 끝 공백은 무시한다("겨울 " -> 을)', () => {
    expect(objectParticle('겨울 ')).toBe('을');
    expect(objectParticle('바다  ')).toBe('를');
  });

  it('TC-UPL-084 빈 주제와 한글이 아닌 끝 글자는 를이다', () => {
    expect(objectParticle('')).toBe('를');
    expect(objectParticle('   ')).toBe('를');
    // [가정: 영문·숫자로 끝나면 받침 판단을 하지 않고 를]
    expect(objectParticle('Sky')).toBe('를');
    expect(objectParticle('2026')).toBe('를');
  });

  it('TC-UPL-084 문장은 ‘{주제}’을/를 기록했어요. 형식이다', () => {
    expect(recordedMessage('가을 하늘')).toBe('‘가을 하늘’을 기록했어요.');
    expect(recordedMessage('바다')).toBe('‘바다’를 기록했어요.');
  });
});
