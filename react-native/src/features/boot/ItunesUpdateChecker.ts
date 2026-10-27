import { VERSION_LOOKUP_TIMEOUT_MS } from '../../shared/constants';
import { isUpdateRequired, parseAppVersion } from './AppVersion';
import type { HttpTransport } from '../../core/http/HttpTransport';
import type { UpdateChecker, UpdateCheckResult } from './UpdateChecker';

export const ITUNES_LOOKUP_URL = 'https://itunes.apple.com/lookup';
export const DEFAULT_STORE_COUNTRY = 'kr';

/** 쿼리: bundleId, country(소문자 2자), entity=software. */
export function buildLookupUrl(bundleId: string, country: string): string {
  const query = [
    ['bundleId', bundleId],
    ['country', country.toLowerCase()],
    ['entity', 'software'],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `${ITUNES_LOOKUP_URL}?${query}`;
}

export type ItunesUpdateCheckerDeps = {
  transport: HttpTransport;
  bundleId: string;
  /** 설치 버전 문자열(예: "1.1.1"). */
  installedVersion: string;
  /** 스토어프론트 국가 코드(2자). 읽지 못하면 null -> DEFAULT_STORE_COUNTRY. */
  storefrontCountry: () => Promise<string | null>;
};

export class ItunesUpdateChecker implements UpdateChecker {
  constructor(private readonly deps: ItunesUpdateCheckerDeps) {}

  /** 조회 타임아웃은 VERSION_LOOKUP_TIMEOUT_MS. 네트워크 오류·5xx·빈 results·version 없음·파싱 실패는 'unavailable'. */
  async check(): Promise<UpdateCheckResult> {
    try {
      const country = (await this.deps.storefrontCountry()) ?? DEFAULT_STORE_COUNTRY;
      const response = await this.deps.transport.send(
        {
          method: 'GET',
          url: buildLookupUrl(this.deps.bundleId, country),
          headers: { Accept: 'application/json' },
        },
        {
          connectTimeoutMs: VERSION_LOOKUP_TIMEOUT_MS,
          responseTimeoutMs: VERSION_LOOKUP_TIMEOUT_MS,
        },
      );
      if (response.status < 200 || response.status >= 300) return 'unavailable';
      const storeVersion = parseAppVersion(extractVersion(response.bodyText) ?? '');
      const installed = parseAppVersion(this.deps.installedVersion);
      if (!storeVersion || !installed) return 'unavailable';
      return isUpdateRequired(installed, storeVersion) ? 'update-required' : 'up-to-date';
    } catch {
      return 'unavailable';
    }
  }
}

/** lookup 응답의 results[0].version. 모양이 다르면 null. */
function extractVersion(bodyText: string): string | null {
  const body = JSON.parse(bodyText) as { results?: { version?: unknown }[] } | null;
  const version = body?.results?.[0]?.version;
  return typeof version === 'string' ? version : null;
}
