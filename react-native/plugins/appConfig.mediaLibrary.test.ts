// 기록 탭의 "이미지로 저장"(REQ-REC-038)에 필요한 네이티브 권한 설정이 app.config.ts에 있는지 본다.
type PluginEntry = string | [string, Record<string, unknown>];

function loadConfig() {
  let config: { plugins: PluginEntry[]; android: { blockedPermissions?: string[] } } | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    config = require('../app.config').default;
  });
  return config!;
}

describe('app.config.ts expo-media-library', () => {
  it('iOS 사진 추가 설명 문구를 주고 Android 읽기 권한(READ_MEDIA_*)은 넣지 않는다', () => {
    const entry = loadConfig().plugins.find(
      (plugin): plugin is [string, Record<string, unknown>] =>
        Array.isArray(plugin) && plugin[0] === 'expo-media-library',
    );
    expect(entry?.[1].savePhotosPermission).toEqual(expect.any(String));
    expect((entry?.[1].savePhotosPermission as string).length).toBeGreaterThan(0);
    expect(entry?.[1].granularPermissions).toEqual([]);
    // 업로드(PR 7)가 합쳐져 사진 읽기 설명(NSPhotoLibraryUsageDescription)도 채운다.
    expect(entry?.[1].photosPermission).toEqual(expect.any(String));
    expect((entry?.[1].photosPermission as string).length).toBeGreaterThan(0);
  });

  it('expo-media-library 항목은 하나뿐이고 저장 문구가 촬영본과 달력 이미지를 모두 말한다', () => {
    const entries = loadConfig().plugins.filter(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-media-library',
    ) as [string, Record<string, unknown>][];
    expect(entries).toHaveLength(1);
    expect(entries[0][1].savePhotosPermission).toEqual(expect.stringContaining('달력'));
    expect(entries[0][1].savePhotosPermission).toEqual(expect.stringContaining('촬영'));
  });

  it('저장에 필요 없는 읽기 권한은 매니페스트에서 뺀다', () => {
    expect(loadConfig().android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      ]),
    );
  });
});
