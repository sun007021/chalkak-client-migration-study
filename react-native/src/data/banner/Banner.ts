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
export function decodeBannerPage(_raw: unknown): BannerPage {
  throw new Error('not implemented');
}
