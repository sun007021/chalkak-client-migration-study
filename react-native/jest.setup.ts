// 공통 Jest 설정. 필요한 전역 mock은 여기에 추가한다.
// SafeAreaProvider는 네이티브 측정 전에는 자식을 그리지 않으므로 공식 mock을 쓴다.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
