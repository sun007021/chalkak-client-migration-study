export type ExternalLinkResult = 'opened' | 'no-browser' | 'failed';

/**
 * 시스템 브라우저로 링크를 연다(웹뷰 링크 정책의 OpenExternal 수행자).
 * 실패는 throw하지 않고 결과로 돌려준다: 열 수 있는 앱이 없으면 'no-browser', 열기 자체가 실패하면 'failed'.
 */
export interface ExternalLinkOpener {
  open(url: string): Promise<ExternalLinkResult>;
}
