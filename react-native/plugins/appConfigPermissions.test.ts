describe('app.config 권한', () => {
  function load() {
    let config: { android?: { blockedPermissions?: string[] } } = {};
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      config = require('../app.config').default;
    });
    return config;
  }

  it('Android CAMERA 권한을 막지 않는다(expo-image-picker 58.0.10의 launchCameraAsync가 CAMERA 권한을 요구한다)', () => {
    expect(load().android?.blockedPermissions ?? []).not.toContain('android.permission.CAMERA');
  });

  it('쓰지 않는 마이크·미디어 읽기 권한은 막는다', () => {
    expect(load().android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.RECORD_AUDIO',
        'android.permission.READ_MEDIA_IMAGES',
      ]),
    );
  });

  it('두 기능의 읽기 권한 차단을 합친다(저장 전용 + 시스템 포토 피커)', () => {
    expect(load().android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
        'android.permission.ACCESS_MEDIA_LOCATION',
      ]),
    );
  });
});

describe('app.config iOS FCM(opt-in)', () => {
  type Cfg = {
    ios?: { googleServicesFile?: string };
    extra?: { iosFcmEnabled?: boolean };
    plugins?: unknown[];
  };
  function load(plist?: string): Cfg {
    const prev = process.env.GOOGLE_SERVICES_PLIST;
    if (plist === undefined) delete process.env.GOOGLE_SERVICES_PLIST;
    else process.env.GOOGLE_SERVICES_PLIST = plist;
    let config: Cfg = {};
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        config = require('../app.config').default;
      });
    } finally {
      if (prev === undefined) delete process.env.GOOGLE_SERVICES_PLIST;
      else process.env.GOOGLE_SERVICES_PLIST = prev;
    }
    return config;
  }
  const names = (c: Cfg) => (c.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));

  it('환경변수가 없으면 Firebase 플러그인·파일·플래그가 모두 빠진다', () => {
    const c = load();
    expect(c.ios?.googleServicesFile).toBeUndefined();
    expect(c.extra?.iosFcmEnabled).toBeUndefined();
    expect(names(c).join()).not.toMatch(/firebase|build-properties/);
  });

  it('공백뿐인 값도 꺼진 것으로 본다', () => {
    expect(load('  ').extra?.iosFcmEnabled).toBeUndefined();
  });

  it('GOOGLE_SERVICES_PLIST가 있으면 파일·RNFB 플러그인·dynamic frameworks·플래그를 켠다', () => {
    const c = load('./GoogleService-Info.plist');
    expect(c.ios?.googleServicesFile).toBe('./GoogleService-Info.plist');
    expect(c.extra?.iosFcmEnabled).toBe(true);
    expect(names(c)).toEqual(
      expect.arrayContaining([
        '@react-native-firebase/app',
        '@react-native-firebase/messaging',
        'expo-build-properties',
      ]),
    );
    expect(JSON.stringify(c.plugins)).toContain('"useFrameworks":"dynamic"');
  });
});
