import { isDevSessionEnabled } from './devSession';

describe('개발용 세션 주입 플래그 (Q-02)', () => {
  it.each([
    { env: { DEV: true }, expected: true },
    { env: { DEV: false, VITE_ENABLE_DEV_SESSION: 'true' }, expected: true },
    { env: { VITE_ENABLE_DEV_SESSION: 'true' }, expected: true },
    { env: {}, expected: false },
    { env: { DEV: false }, expected: false },
    { env: { DEV: false, VITE_ENABLE_DEV_SESSION: 'false' }, expected: false },
    { env: { DEV: false, VITE_ENABLE_DEV_SESSION: '1' }, expected: false },
    { env: { DEV: false, VITE_ENABLE_DEV_SESSION: 'TRUE' }, expected: false },
    { env: { DEV: false, VITE_ENABLE_DEV_SESSION: '' }, expected: false },
  ])('TC-AUTH-059 $env → $expected', ({ env, expected }) => {
    expect(isDevSessionEnabled(env)).toBe(expected);
  });
});
