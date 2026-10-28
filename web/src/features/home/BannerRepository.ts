import { BANNER_PAGE_SIZE } from '../../constants';
import type { ApiClient } from '../../core/net/ApiClient';
import { d } from '../../core/net/decode';
import type { Decoder } from '../../core/net/decode';
import { InvalidResponseError } from '../../core/net/errors';
import { isOpenableBannerUrl } from './bannerLink';
import type { Banner, BannerPage } from './homeModels';

/** webViewUrl: https+호스트가 아니면 응답 전체가 잘못된 것(REQ-BANR-003). */
const webViewUrl: Decoder<string> = (value) => {
  const url = d.string()(value);
  if (!isOpenableBannerUrl(url)) throw new InvalidResponseError('banner webViewUrl is not https');
  return url;
};

/** 잘못된 썸네일 주소는 그 배너만 null(대체 배경). */
const thumbnail: Decoder<string | null> = (value) => {
  const url = d.nullable(d.string())(value);
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname !== '' ? url : null;
  } catch {
    return null;
  }
};

const decodeBanner: Decoder<Banner> = d.object({
  id: d.string(),
  title: d.string(),
  subtitle: d.string(),
  webViewUrl,
  thumbnailUrl: thumbnail,
  createdAt: d.instant(),
});

const decodePage = d.object({
  currentPage: d.number(),
  pageSize: d.number(),
  hasNext: d.nullable(d.boolean()),
  banners: d.array(decodeBanner),
});

/** GET /banners(공개, Authorization 없음, 401 갱신 없음). */
export class BannerRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /**
   * GET /banners?page=&pageSize=10(BANNER_PAGE_SIZE). hasNext 없으면 false. webViewUrl이 https+호스트가 아니거나 필수 필드가 빠지면 응답 전체가 InvalidResponseError.
   * thumbnailUrl이 잘못된 URL이면 그 배너만 null로 두고 유지한다.
   */
  async list(page: number, signal?: AbortSignal): Promise<BannerPage> {
    const body = await this.deps.api.request({ method: 'GET', path: '/banners', query: { page, pageSize: BANNER_PAGE_SIZE }, signal }, decodePage);
    return { ...body, hasNext: body.hasNext ?? false };
  }
}
