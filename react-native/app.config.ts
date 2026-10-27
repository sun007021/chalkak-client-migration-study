import type { ExpoConfig } from 'expo/config';

const DEFAULT_API_BASE_URL = 'https://chalkak-dev.pysun.kr/api/v1/';

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
    // E2E에서는 API_BASE_URL 환경변수로 mock 서버 주소를 넘긴다.
    apiBaseUrl: process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL,
  },
};

export default config;
