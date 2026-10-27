import shared from '../../shared/constants.json';
import * as c from './constants';

/** 테스트 전용 값이라 앱 상수에는 없다. */
const TEST_ONLY_KEYS = ['FIXTURE_NOW'];

describe('shared/constants.json 대조', () => {
  const exported = c as Record<string, unknown>;

  it.each(Object.entries(shared).filter(([key]) => !TEST_ONLY_KEYS.includes(key)))('%s 값이 shared와 같다', (key, value) => {
    expect(exported[key], `constants.ts에 ${key}가 없거나 값이 다르다`).toEqual(value);
  });

  it('constants.ts의 상수는 모두 shared에 있다(Web 전용 상수 없음)', () => {
    const extra = Object.keys(c).filter((key) => !(key in shared));
    expect(extra).toEqual([]);
  });
});
