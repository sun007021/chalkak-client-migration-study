import type { ExpoConfig } from 'expo/config';

// 카카오 네이티브 앱 키는 환경변수로만 주입한다(커밋 금지). 없으면 플러그인을 빼며,
// 이때 카카오 로그인은 설정 오류(auth.login.error.config)로 끝난다.
const kakaoNativeAppKey = process.env.KAKAO_NATIVE_APP_KEY?.trim();

// E2E 빌드(APP_VARIANT=e2e)에서만 fixture idToken을 extra에 싣는다. 다른 변형에는 값이 있어도 넣지 않는다.
const isE2e = process.env.APP_VARIANT === 'e2e';

const config: ExpoConfig = {
  name: '찰캌',
  slug: 'chalkak-rn',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'com.chalkak.study.rn', supportsTablet: false },
  android: { package: 'com.chalkak.study.rn' },
  extra: {
    // 기본값을 두지 않는다(REQ-NET-002). 값 검증은 앱 시작 시 readAppConfig()가 한다.
    apiBaseUrl: process.env.API_BASE_URL,
    // REQ-BOOT-014: 강제 업데이트 조회. 기본 꺼짐(true일 때만 켠다).
    forceUpdateCheckEnabled: process.env.FORCE_UPDATE_CHECK_ENABLED,
    // E2E 빌드 전용: 있으면 카카오 SDK 대신 이 idToken으로 로그인한다. 배포 빌드에는 넣지 않는다.
    appVariant: process.env.APP_VARIANT,
    e2eKakaoIdToken: isE2e ? process.env.E2E_KAKAO_ID_TOKEN : undefined,
    // 강제 업데이트 다이얼로그가 여는 App Store 앱 숫자 id.
    appStoreId: process.env.APP_STORE_ID,
  },
  plugins: kakaoNativeAppKey
    ? [['@react-native-seoul/kakao-login', { kakaoAppKey: kakaoNativeAppKey }]]
    : [],
};

export default config;
