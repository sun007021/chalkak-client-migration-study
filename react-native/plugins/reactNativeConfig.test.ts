// react-native.config.js가 GOOGLE_SERVICES_PLIST 유무에 따라 RNFB iOS 자동 링크를 켜고 끄는지 확인한다.
type RnConfig = { dependencies: Record<string, { platforms: { ios: null } }> };

function loadConfig(plist: string | undefined): RnConfig {
  const previous = process.env.GOOGLE_SERVICES_PLIST;
  if (plist === undefined) delete process.env.GOOGLE_SERVICES_PLIST;
  else process.env.GOOGLE_SERVICES_PLIST = plist;
  try {
    let config: RnConfig | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      config = require('../react-native.config.js') as RnConfig;
    });
    return config as RnConfig;
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_SERVICES_PLIST;
    else process.env.GOOGLE_SERVICES_PLIST = previous;
  }
}

describe('react-native.config.js', () => {
  it('GOOGLE_SERVICES_PLIST가 없으면 RNFB 두 패키지를 iOS 자동 링크에서 뺀다', () => {
    expect(loadConfig(undefined).dependencies).toEqual({
      '@react-native-firebase/app': { platforms: { ios: null } },
      '@react-native-firebase/messaging': { platforms: { ios: null } },
    });
  });

  it('공백뿐인 값은 없는 것으로 본다', () => {
    expect(Object.keys(loadConfig('  ').dependencies)).toHaveLength(2);
  });

  it('GOOGLE_SERVICES_PLIST가 있으면 자동 링크를 건드리지 않는다', () => {
    expect(loadConfig('/secure/GoogleService-Info.plist').dependencies).toEqual({});
  });
});
