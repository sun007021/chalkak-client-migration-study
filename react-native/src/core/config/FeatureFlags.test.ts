import { readFeatureFlags } from './FeatureFlags';

describe('readFeatureFlags', () => {
  it('TC-BOOT-032 값이 없으면 강제 업데이트 조회는 꺼져 있고 E2E 토큰은 없다(기본값)', () => {
    expect(readFeatureFlags(undefined)).toEqual({
      forceUpdateCheckEnabled: false,
      e2eKakaoIdToken: null,
    });
    expect(readFeatureFlags(null).forceUpdateCheckEnabled).toBe(false);
    expect(readFeatureFlags({}).forceUpdateCheckEnabled).toBe(false);
  });

  it('TC-BOOT-032 true 또는 문자열 "true"만 조회를 켠다', () => {
    expect(readFeatureFlags({ forceUpdateCheckEnabled: true }).forceUpdateCheckEnabled).toBe(true);
    expect(readFeatureFlags({ forceUpdateCheckEnabled: 'true' }).forceUpdateCheckEnabled).toBe(
      true,
    );
    for (const value of ['false', '', 'yes', 1, 0, false, {}, null]) {
      expect(readFeatureFlags({ forceUpdateCheckEnabled: value }).forceUpdateCheckEnabled).toBe(
        false,
      );
    }
  });

  it('e2eKakaoIdToken은 비어 있지 않은 문자열만 인정하고 앞뒤 공백은 자른다', () => {
    expect(readFeatureFlags({ e2eKakaoIdToken: ' tok ' }).e2eKakaoIdToken).toBe('tok');
    for (const value of ['', '   ', 123, null, undefined, {}]) {
      expect(readFeatureFlags({ e2eKakaoIdToken: value }).e2eKakaoIdToken).toBeNull();
    }
  });
});
