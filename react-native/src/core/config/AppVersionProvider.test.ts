import { AppInfoVersionProvider } from './AppVersionProvider';
import { readAppInfo } from './AppInfo';

describe('AppVersionProvider', () => {
  it('TC-SET-049 앱 설정(expo config) 버전 문자열을 접두 없이 그대로 돌려준다', () => {
    const info = readAppInfo({ version: '1.1.1' }, 'ios');
    expect(new AppInfoVersionProvider(info).getVersion()).toBe('1.1.1');
  });

  it('TC-SET-049 Android도 같은 앱 설정 버전을 쓴다', () => {
    const info = readAppInfo({ version: '2.0.3' }, 'android');
    expect(new AppInfoVersionProvider(info).getVersion()).toBe('2.0.3');
  });

  it('TC-SET-049 버전을 읽을 수 없으면 빈 문자열이다(던지지 않는다)', () => {
    const info = readAppInfo({}, 'ios');
    expect(new AppInfoVersionProvider(info).getVersion()).toBe('');
  });
});
