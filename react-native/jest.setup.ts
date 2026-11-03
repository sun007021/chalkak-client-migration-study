// 공통 Jest 설정. 필요한 전역 mock은 여기에 추가한다.
// SafeAreaProvider는 네이티브 측정 전에는 자식을 그리지 않으므로 공식 mock을 쓴다.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// react-native-webview는 네이티브 모듈(RNCWebViewModule)이 없으면 import 단계에서 던진다.
// 가짜 WebView는 마지막으로 받은 props를 `WebView.lastProps`에 남겨 어댑터 테스트가 콜백을 직접 호출하게 한다.
jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const WebView = (props: Record<string, unknown>) => {
    WebView.lastProps = props;
    return React.createElement(View, { testID: 'mock-webview' });
  };
  WebView.lastProps = null as Record<string, unknown> | null;
  return { WebView, default: WebView };
});

// AsyncStorage는 네이티브 모듈이 없으면 던진다. 공식 메모리 mock을 쓴다.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-notifications는 네이티브 모듈이 필요하다. 구독은 해제 가능한 객체를 돌려주고 나머지는 빈 값을 돌려준다.
jest.mock('expo-notifications', () => {
  const subscription = () => ({ remove: jest.fn() });
  return {
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
    AndroidImportance: { HIGH: 4 },
    addPushTokenListener: jest.fn(subscription),
    addNotificationReceivedListener: jest.fn(subscription),
    addNotificationResponseReceivedListener: jest.fn(subscription),
    getLastNotificationResponse: jest.fn(() => null),
    clearLastNotificationResponse: jest.fn(),
    getDevicePushTokenAsync: jest.fn(async () => ({ type: 'android', data: 'jest-token' })),
    getPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => null),
    scheduleNotificationAsync: jest.fn(async () => 'id'),
  };
});
