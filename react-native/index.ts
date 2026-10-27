import { registerRootComponent } from 'expo';
import { createElement } from 'react';

import { App } from './src/app/App';
import { readAppConfig } from './src/core/config/AppConfig';

// 전역 설정(expo-constants)을 읽는 곳은 앱 루트인 이 파일 하나다.
const configResult = readAppConfig();

registerRootComponent(() => createElement(App, { configResult }));
