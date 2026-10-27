import { DEV_SESSION_ENABLED, DEV_SESSION_PATH } from './devSession';

describe('개발용 세션 주입 플래그 (Q-02)', () => {
  it('TC-AUTH-059 테스트(DEV) 환경에서는 켜져 있다. 배포 빌드에서 꺼지는 것은 번들 grep으로 확인한다', () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(DEV_SESSION_ENABLED).toBe(true);
  });

  it('TC-AUTH-059 경로는 /dev/session이다', () => {
    expect(DEV_SESSION_PATH).toBe('/dev/session');
  });
});
