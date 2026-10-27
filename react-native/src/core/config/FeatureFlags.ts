/** 빌드 설정으로 켜고 끄는 값. 읽는 곳은 앱 루트 한 곳이며 AppConfig(API 주소)와 따로 둔다. */
export type FeatureFlags = {
  /** REQ-BOOT-014 `FORCE_UPDATE_CHECK_ENABLED`. 기본 false. */
  readonly forceUpdateCheckEnabled: boolean;
  /** E2E 빌드에서만 채우는 fixture idToken. 있으면 카카오 SDK 대신 Fake 로그인을 쓴다(strategy §2). 기본 null. */
  readonly e2eKakaoIdToken: string | null;
  /** 빌드 변형(`APP_VARIANT`). 'e2e'일 때만 e2eKakaoIdToken이 효력을 가진다. 배포 빌드는 null. */
  readonly appVariant: string | null;
};

export type FeatureFlagsExtra =
  | { forceUpdateCheckEnabled?: unknown; e2eKakaoIdToken?: unknown; appVariant?: unknown }
  | null
  | undefined;

export function readFeatureFlags(extra: FeatureFlagsExtra): FeatureFlags {
  const forceUpdate = extra?.forceUpdateCheckEnabled;
  const e2eToken = extra?.e2eKakaoIdToken;
  const trimmed = typeof e2eToken === 'string' ? e2eToken.trim() : '';
  return {
    forceUpdateCheckEnabled: forceUpdate === true || forceUpdate === 'true',
    e2eKakaoIdToken: trimmed === '' ? null : trimmed,
    appVariant:
      typeof extra?.appVariant === 'string' && extra.appVariant !== '' ? extra.appVariant : null,
  };
}
