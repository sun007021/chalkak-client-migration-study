import type { ApiClient } from '../../core/http/ApiClient';
import type { BannerPage } from './Banner';

export type BannerRepositoryDeps = { api: ApiClient };

export class BannerRepository {
  constructor(private readonly deps: BannerRepositoryDeps) {}

  /**
   * GET /banners?page&pageSize(기본 BANNER_PAGE_SIZE). Authorization 헤더를 붙이지 않고(만료 토큰 401 회피, B7)
   * 401이 와도 갱신하지 않는다. 서버 순서를 유지한다.
   */
  list(_page: number, _signal?: AbortSignal): Promise<BannerPage> {
    void this.deps;
    throw new Error('not implemented');
  }
}
