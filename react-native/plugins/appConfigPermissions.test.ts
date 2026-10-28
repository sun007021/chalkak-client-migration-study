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
});
