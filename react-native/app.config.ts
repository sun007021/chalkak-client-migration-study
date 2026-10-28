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
  android: {
    package: 'com.chalkak.study.rn',
    // 기록의 달력 이미지 저장은 쓰기 전용이다(REQ-REC-038). 읽기 권한은 쓰지 않아 매니페스트에서 뺀다
    // (Play 사진·동영상 권한 정책). expo-media-library 플러그인이 기본으로 넣는 것 중 저장에 필요 없는 것들이다.
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
    ],
  },
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
  plugins: [
    // D-21: Android OkHttp의 자동 재시도(비멱등 요청 포함)를 끈다.
    './plugins/withOkHttpNoRetry',
    // 기록의 "이미지로 저장": iOS NSPhotoLibraryAddUsageDescription(사진 추가 전용 권한)과 Android 저장 권한.
    // granularPermissions가 빈 배열이라 READ_MEDIA_IMAGES/VIDEO/AUDIO는 매니페스트에 들어가지 않는다.
    [
      'expo-media-library',
      {
        savePhotosPermission: '달력을 이미지로 저장하려면 사진 보관함에 추가할 수 있어야 해요.',
        photosPermission: '사진 보관함에 접근할 수 있어야 해요.',
        granularPermissions: [],
      },
    ],
    ...(kakaoNativeAppKey
      ? [
          ['@react-native-seoul/kakao-login', { kakaoAppKey: kakaoNativeAppKey }] as [
            string,
            object,
          ],
        ]
      : []),
  ],
};

export default config;
