import { readAppInfo } from './AppInfo';

const config = {
  version: '1.2.3',
  ios: { bundleIdentifier: 'com.x.ios' },
  android: { package: 'com.x.android' },
  extra: { appStoreId: ' 123 ' },
};

describe('readAppInfo', () => {
  it('iOS는 bundleIdentifier, Android는 package를 쓴다', () => {
    expect(readAppInfo(config, 'ios')).toEqual({
      platform: 'ios',
      bundleId: 'com.x.ios',
      version: '1.2.3',
      appStoreId: '123',
    });
    expect(readAppInfo(config, 'android').bundleId).toBe('com.x.android');
  });

  it('값이 없으면 빈 문자열·null이다(크래시하지 않는다)', () => {
    expect(readAppInfo(undefined, 'ios')).toEqual({
      platform: 'ios',
      bundleId: '',
      version: '',
      appStoreId: null,
    });
  });
});
