import type { ExpoConfig } from 'expo/config';

// 카카오 네이티브 앱 키는 환경변수로만 주입한다(커밋 금지). 없으면 플러그인을 빼며,
// 이때 카카오 로그인은 설정 오류(auth.login.error.config)로 끝난다.
const kakaoNativeAppKey = process.env.KAKAO_NATIVE_APP_KEY?.trim();

// E2E 빌드(APP_VARIANT=e2e)에서만 fixture idToken을 extra에 싣는다. 다른 변형에는 값이 있어도 넣지 않는다.
const isE2e = process.env.APP_VARIANT === 'e2e';

// 업로드·편집 권한 문구(iOS 설정 화면과 권한 요청 창에 보이는 한국어 안내).
// 앨범 읽기는 시스템 선택기(PHPicker / Android 포토 피커)라 권한이 필요 없지만 라이브러리가 키를 요구해 문구를 둔다.
const PHOTOS_PERMISSION = '앨범에서 사진을 고를 수 있도록 사진 접근을 사용해요.';
const CAMERA_PERMISSION = '지금 찍은 사진으로 주제에 참여할 수 있도록 카메라를 사용해요.';
const SAVE_PHOTOS_PERMISSION =
  '촬영한 사진과 달력 이미지를 내 앨범에 저장하려고 사진 추가 권한을 사용해요.';

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
    // 앨범(업로드)은 시스템 포토 피커, 기록의 달력 이미지 저장은 쓰기 전용(REQ-REC-038)이라 미디어 읽기 권한은 쓰지 않는다.
    // 라이브러리 매니페스트가 넣는 쓰이지 않는 권한을 지운다(Play 사진·동영상 권한 정책).
    // CAMERA는 막지 않는다: expo-image-picker 58.0.10의 launchCameraAsync는 ensureCameraPermissionsAreGranted()로 CAMERA 권한을 요구한다.
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.ACCESS_MEDIA_LOCATION',
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
    [
      'expo-image-picker',
      {
        photosPermission: PHOTOS_PERMISSION,
        cameraPermission: CAMERA_PERMISSION,
        // 마이크는 쓰지 않는다(iOS 키와 Android RECORD_AUDIO를 넣지 않는다).
        microphonePermission: false,
      },
    ],
    // 업로드(촬영본 저장)와 기록(달력 이미지 저장)이 함께 쓰는 단 하나의 expo-media-library 항목.
    // granularPermissions가 빈 배열이라 READ_MEDIA_IMAGES/VIDEO/AUDIO는 매니페스트에 들어가지 않는다(갤러리 저장은 MediaStore 삽입).
    [
      'expo-media-library',
      {
        photosPermission: PHOTOS_PERMISSION,
        savePhotosPermission: SAVE_PHOTOS_PERMISSION,
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
