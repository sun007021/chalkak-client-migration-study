import Constants from 'expo-constants';

export const DEFAULT_API_BASE_URL = 'https://chalkak-dev.pysun.kr/api/v1/';

export type AppConfig = { apiBaseUrl: string };

type Extra = { apiBaseUrl?: unknown } | null | undefined;

export function readAppConfig(extra: Extra = Constants.expoConfig?.extra): AppConfig {
  const value = extra?.apiBaseUrl;
  const apiBaseUrl = typeof value === 'string' && value.length > 0 ? value : DEFAULT_API_BASE_URL;
  return { apiBaseUrl: apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/` };
}
