import Constants from 'expo-constants';
import { registerRootComponent } from 'expo';
import { createElement } from 'react';

import { App } from './src/app/App';
import { readAppConfig } from './src/core/config/AppConfig';
import { readAppInfo } from './src/core/config/AppInfo';
import { readFeatureFlags } from './src/core/config/FeatureFlags';

// 전역 설정(expo-constants)을 읽는 곳은 앱 루트인 이 파일 하나다.
const configResult = readAppConfig();
const overrides = {
  featureFlags: readFeatureFlags(Constants.expoConfig?.extra),
  appInfo: readAppInfo(Constants.expoConfig),
};

registerRootComponent(() => createElement(App, { configResult, overrides }));
