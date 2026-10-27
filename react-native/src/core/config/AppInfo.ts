import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** 설치된 앱의 식별 정보. 강제 업데이트 조회·스토어 열기에 쓴다. */
export type AppInfo = {
  readonly platform: 'ios' | 'android';
  readonly bundleId: string;
  /** 설치 버전(예: "0.1.0"). */
  readonly version: string;
  /** App Store 숫자 id. 없으면 스토어 열기가 실패한다(강제 업데이트가 꺼져 있으면 쓰이지 않음). */
  readonly appStoreId: string | null;
};

type ExpoConfigLike = {
  version?: string;
  ios?: { bundleIdentifier?: string };
  android?: { package?: string };
  extra?: { appStoreId?: unknown } | null;
};

export function readAppInfo(
  expoConfig: ExpoConfigLike | null | undefined = Constants.expoConfig,
  os: string = Platform.OS,
): AppInfo {
  const platform = os === 'android' ? 'android' : 'ios';
  const appStoreId = expoConfig?.extra?.appStoreId;
  return {
    platform,
    bundleId:
      (platform === 'ios' ? expoConfig?.ios?.bundleIdentifier : expoConfig?.android?.package) ?? '',
    version: expoConfig?.version ?? '',
    appStoreId:
      typeof appStoreId === 'string' && appStoreId.trim() !== '' ? appStoreId.trim() : null,
  };
}
