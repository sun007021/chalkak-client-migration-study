import { ScrollMemory } from './ScrollMemory';

describe('ScrollMemory (뒤로가기·닫기 후 스크롤 복원)', () => {
  it('TC-FEED-015 history 항목 키별로 위치를 기억한다', () => {
    const memory = new ScrollMemory();
    expect(memory.read('a')).toBeNull();
    memory.save('a', 480);
    memory.save('b', 0);
    expect(memory.read('a')).toBe(480);
    expect(memory.read('b')).toBe(0);
    expect(memory.read('c')).toBeNull();
  });

  it('같은 키에 다시 저장하면 마지막 값이다', () => {
    const memory = new ScrollMemory();
    memory.save('a', 100);
    memory.save('a', 250);
    expect(memory.read('a')).toBe(250);
  });

  it('음수·NaN 같은 비정상 값은 0 이상의 유한한 값으로만 저장한다', () => {
    const memory = new ScrollMemory();
    memory.save('a', -30);
    memory.save('b', Number.NaN);
    expect(memory.read('a')).toBe(0);
    expect(memory.read('b')).toBe(0);
  });
});
