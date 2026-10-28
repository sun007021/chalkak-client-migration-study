import type { ApiClient } from '../../core/http/ApiClient';
import { BANNER_PAGE_SIZE } from '../../shared/constants';
import { decodeBannerPage, type BannerPage } from './Banner';

export type BannerRepositoryDeps = { api: ApiClient };

export class BannerRepository {
  constructor(private readonly deps: BannerRepositoryDeps) {}

  /**
   * GET /banners?page&pageSize(기본 BANNER_PAGE_SIZE). Authorization 헤더를 붙이지 않고(만료 토큰 401 회피, B7)
   * 401이 와도 갱신하지 않는다(RequestPolicy가 /banners를 인증 수준 none으로 다룬다). 서버 순서를 유지한다.
   */
  list(page: number, signal?: AbortSignal): Promise<BannerPage> {
    return this.deps.api.requestJson(
      {
        method: 'GET',
        path: '/banners',
        query: { page, pageSize: BANNER_PAGE_SIZE },
        signal,
      },
      decodeBannerPage,
    );
  }
}
