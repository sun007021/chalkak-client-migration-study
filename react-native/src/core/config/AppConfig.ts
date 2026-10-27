import Constants from 'expo-constants';
import { LOOPBACK_HOSTS } from './transportSecurity';

/** 모든 API 경로의 공통 접두(REQ-NET-003). `API_BASE_URL`은 서버 origin이고 앱이 이 접두를 붙인다. */
export const API_PATH_PREFIX = '/api/v1';

/** `apiBaseUrl`은 항상 `https://host[:port]/api/v1/` 형태(끝 슬래시 포함)다. */
export type AppConfig = { readonly apiBaseUrl: string };

export type AppConfigResult =
  | { readonly ok: true; readonly config: AppConfig }
  | { readonly ok: false; readonly error: 'config' };

type Extra = { apiBaseUrl?: unknown } | null | undefined;

const ORIGIN_PATTERN = /^(https?):\/\/([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(\/[^?#]*)?$/i;

/**
 * `API_BASE_URL`(서버 origin)을 검증·정규화한다. 없거나 올바르지 않으면 null이며 어떤 기본값으로도 대체하지 않는다(REQ-NET-002).
 * 끝 슬래시와 이미 붙어 온 `/api/v1`은 중복되지 않게 정리한다.
 */
export function normalizeApiBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = ORIGIN_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, scheme, rawHost, port, rawPath = ''] = match;
  const host = rawHost.toLowerCase();
  if (scheme.toLowerCase() === 'http' && !LOOPBACK_HOSTS.includes(host)) return null;

  const path = rawPath.replace(/\/+$/, '');
  if (path !== '' && path !== API_PATH_PREFIX) return null;
  const portSuffix = port ? `:${port}` : '';
  return `${scheme.toLowerCase()}://${host}${portSuffix}${API_PATH_PREFIX}/`;
}

/** 앱 루트에서 한 번 호출한다. 기본 인자만 전역(`expo-constants`)을 읽는다. */
export function readAppConfig(extra: Extra = Constants.expoConfig?.extra): AppConfigResult {
  const apiBaseUrl = normalizeApiBaseUrl(extra?.apiBaseUrl);
  return apiBaseUrl ? { ok: true, config: { apiBaseUrl } } : { ok: false, error: 'config' };
}
