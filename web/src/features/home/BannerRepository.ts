import type { ApiClient } from '../../core/net/ApiClient';
import type { BannerPage } from './homeModels';

/** GET /banners(공개, Authorization 없음, 401 갱신 없음). */
export class BannerRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /**
   * GET /banners?page=&pageSize=10(BANNER_PAGE_SIZE). hasNext 없으면 false. webViewUrl이 https+호스트가 아니거나 필수 필드가 빠지면 응답 전체가 InvalidResponseError.
   * thumbnailUrl이 잘못된 URL이면 그 배너만 null로 두고 유지한다.
   */
  list(_page: number, _signal?: AbortSignal): Promise<BannerPage> {
    throw new Error('not implemented');
  }
}
