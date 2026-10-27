import type { HttpTransport } from '../../core/http/HttpTransport';
import type { UpdateChecker, UpdateCheckResult } from './UpdateChecker';

export const ITUNES_LOOKUP_URL = 'https://itunes.apple.com/lookup';
export const DEFAULT_STORE_COUNTRY = 'kr';

/** 쿼리: bundleId, country(소문자 2자), entity=software. */
export function buildLookupUrl(_bundleId: string, _country: string): string {
  throw new Error('not implemented');
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
  check(): Promise<UpdateCheckResult> {
    void this.deps;
    throw new Error('not implemented');
  }
}
