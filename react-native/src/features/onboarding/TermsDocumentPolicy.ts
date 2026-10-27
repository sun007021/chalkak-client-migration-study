/** 약관 문서를 어디서 열지(D-25). */
export type DocumentTarget =
  /** https + 허용 호스트(TERMS_ALLOWED_HOSTS 또는 그 하위 도메인), userinfo 없음 -> 앱 안 웹뷰 */
  | 'in-app'
  /** 해석되는 http(s) URL이지만 허용 호스트가 아니다 -> 외부 브라우저 */
  | 'external'
  /** 빈 문자열, 해석 불가, http(s)가 아닌 scheme -> 열지 않는다("문서를 열 수 없어요") */
  | 'reject';

export function decideDocumentTarget(_url: string): DocumentTarget {
  throw new Error('not implemented');
}
