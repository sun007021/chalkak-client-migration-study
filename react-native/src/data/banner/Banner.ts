import {
  asArray,
  asObject,
  bool,
  instant,
  isHttpUrlWithHost,
  isHttpsUrlWithHost,
  nonNegInt,
  str,
  type Obj,
} from '../decode';

export type Banner = {
  id: string;
  title: string;
  subtitle: string;
  /** 항상 https이고 호스트가 있다. 아니면 응답 전체가 잘못된 응답이다(REQ-BANR-003). */
  webViewUrl: string;
  /** 형식이 잘못된 썸네일은 null로 바꿔 배너를 유지한다(대체 배경). */
  thumbnailUrl: string | null;
  createdAt: Date;
};

export type BannerPage = {
  currentPage: number;
  pageSize: number;
  /** 필드가 없으면 false(마지막 페이지, REQ-BANR-002). */
  hasNext: boolean;
  banners: readonly Banner[];
};

/** 깨진 JSON·필수 필드 누락·https가 아닌 webViewUrl이면 throw. thumbnailUrl 오류만 null로 흡수. */
export function decodeBannerPage(raw: unknown): BannerPage {
  const o = asObject(raw, 'banner page');
  return {
    currentPage: nonNegInt(o, 'currentPage'),
    pageSize: nonNegInt(o, 'pageSize'),
    hasNext: o.hasNext === undefined || o.hasNext === null ? false : bool(o, 'hasNext'),
    banners: asArray(o.banners, 'banners').map(decodeBanner),
  };
}

function decodeBanner(raw: unknown): Banner {
  const o: Obj = asObject(raw, 'banner');
  const webViewUrl = str(o, 'webViewUrl');
  if (!isHttpsUrlWithHost(webViewUrl)) throw new Error('webViewUrl must be https with a host');
  const thumbnail = o.thumbnailUrl;
  return {
    id: str(o, 'id'),
    // title·subtitle은 서버가 1자 이상으로 검증해 등록한다(BANNER-002: title 1~50, subtitle 1~100, 네 항목 모두 필수).
    // 빈 문자열은 계약 위반이므로 str()(비어 있지 않은 문자열)로 받아 응답 전체를 잘못된 응답으로 본다.
    title: str(o, 'title'),
    subtitle: str(o, 'subtitle'),
    webViewUrl,
    thumbnailUrl: typeof thumbnail === 'string' && isHttpUrlWithHost(thumbnail) ? thumbnail : null,
    createdAt: instant(o, 'createdAt'),
  };
}
