import Constants from 'expo-constants';
import { registerRootComponent } from 'expo';
import { createElement } from 'react';

import { App } from './src/app/App';
import { readAppConfig } from './src/core/config/AppConfig';
import { readAppInfo } from './src/core/config/AppInfo';
import { readFeatureFlags } from './src/core/config/FeatureFlags';
import { configureExpoNotifications } from './src/core/push/expo/expoNotificationSetup';

// 전역 설정(expo-constants)을 읽는 곳은 앱 루트인 이 파일 하나다.
const configResult = readAppConfig();
const overrides = {
  featureFlags: readFeatureFlags(Constants.expoConfig?.extra),
  appInfo: readAppInfo(Constants.expoConfig),
};

// 포그라운드 알림 표시 정책과 Android 채널은 앱 시작 때 한 번 설정한다.
configureExpoNotifications();

registerRootComponent(() => createElement(App, { configResult, overrides }));
