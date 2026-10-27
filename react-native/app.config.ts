import type { ExpoConfig } from 'expo/config';

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
  },
};

export default config;
