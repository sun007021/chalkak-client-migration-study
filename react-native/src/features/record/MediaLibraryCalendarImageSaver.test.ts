import { Platform } from 'react-native';

import { ImagePermissionDeniedError } from './CalendarImage';
import { MediaLibraryCalendarImageSaver } from './MediaLibraryCalendarImageSaver';

const mockCreateAsset = jest.fn();
const mockCreateAlbum = jest.fn();
const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockFile = {
  uri: 'file:///cache/chalkak-calendar-2026-10.png',
  create: jest.fn(),
  writeSync: jest.fn(),
  delete: jest.fn(),
};

jest.mock('expo-media-library', () => ({
  Asset: { create: (...args: unknown[]) => mockCreateAsset(...args) },
  Album: { create: (...args: unknown[]) => mockCreateAlbum(...args) },
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
}));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: jest.fn().mockImplementation(() => mockFile),
}));

const image = { fileName: 'chalkak-calendar-2026-10.png', bytes: new Uint8Array([1, 2, 3]) };
const original = { os: Platform.OS, version: Platform.Version };

function setPlatform(os: 'ios' | 'android', version: string | number) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  Object.defineProperty(Platform, 'Version', { configurable: true, get: () => version });
}

afterEach(() => {
  jest.clearAllMocks();
  setPlatform(original.os as 'ios', original.version);
});

describe('MediaLibraryCalendarImageSaver', () => {
  it('iOS: 사진 추가 전용 권한을 요청하고 보관함에 추가한 뒤 임시 파일을 지운다', async () => {
    setPlatform('ios', '18.0');
    mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPermissions.mockResolvedValue({ granted: true });
    await new MediaLibraryCalendarImageSaver().save(image);
    expect(mockRequestPermissions).toHaveBeenCalledWith(true);
    expect(mockFile.writeSync).toHaveBeenCalledWith(image.bytes);
    expect(mockCreateAsset).toHaveBeenCalledWith(mockFile.uri);
    expect(mockFile.delete).toHaveBeenCalled();
  });

  it('권한이 이미 있으면 다시 묻지 않는다', async () => {
    setPlatform('ios', '18.0');
    mockGetPermissions.mockResolvedValue({ granted: true });
    await new MediaLibraryCalendarImageSaver().save(image);
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('거부(다시 묻지 않기 포함)는 ImagePermissionDeniedError이고 아무것도 저장하지 않는다', async () => {
    setPlatform('ios', '18.0');
    mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
    await expect(new MediaLibraryCalendarImageSaver().save(image)).rejects.toBeInstanceOf(
      ImagePermissionDeniedError,
    );
    mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPermissions.mockResolvedValue({ granted: false });
    await expect(new MediaLibraryCalendarImageSaver().save(image)).rejects.toBeInstanceOf(
      ImagePermissionDeniedError,
    );
    expect(mockCreateAsset).not.toHaveBeenCalled();
  });

  it('Android 11(API 30) 이상: 권한 없이 Pictures/Chalkak 앨범에 저장한다', async () => {
    setPlatform('android', 30);
    await new MediaLibraryCalendarImageSaver().save(image);
    expect(mockGetPermissions).not.toHaveBeenCalled();
    expect(mockCreateAlbum).toHaveBeenCalledWith('Chalkak', [mockFile.uri]);
  });

  it('Android 10(API 29) 이하: 쓰기 권한을 요청한다', async () => {
    setPlatform('android', 29);
    mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPermissions.mockResolvedValue({ granted: true });
    await new MediaLibraryCalendarImageSaver().save(image);
    expect(mockRequestPermissions).toHaveBeenCalledWith(true);
    expect(mockCreateAlbum).toHaveBeenCalled();
  });

  it('보관함 쓰기가 실패해도 임시 파일은 지우고 오류를 그대로 던진다', async () => {
    setPlatform('ios', '18.0');
    mockGetPermissions.mockResolvedValue({ granted: true });
    mockCreateAsset.mockRejectedValue(new Error('disk'));
    await expect(new MediaLibraryCalendarImageSaver().save(image)).rejects.toThrow('disk');
    expect(mockFile.delete).toHaveBeenCalled();
  });

  it('Android 10(API 29): 쓰기 권한이 거부되면 ImagePermissionDeniedError이고 저장하지 않는다', async () => {
    setPlatform('android', 29);
    mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPermissions.mockResolvedValue({ granted: false });
    await expect(new MediaLibraryCalendarImageSaver().save(image)).rejects.toBeInstanceOf(
      ImagePermissionDeniedError,
    );
    expect(mockCreateAlbum).not.toHaveBeenCalled();
  });

  it('임시 파일을 만들다 실패해도 오류를 그대로 던지고 정리를 시도한다', async () => {
    setPlatform('ios', '18.0');
    mockGetPermissions.mockResolvedValue({ granted: true });
    mockFile.create.mockImplementationOnce(() => {
      throw new Error('no space');
    });
    await expect(new MediaLibraryCalendarImageSaver().save(image)).rejects.toThrow('no space');
    expect(mockFile.delete).toHaveBeenCalled();
    expect(mockCreateAsset).not.toHaveBeenCalled();
  });
});
