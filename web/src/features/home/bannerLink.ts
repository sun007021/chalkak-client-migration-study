/**
 * 배너 링크를 열어도 되는 주소인가(REQ-BANR-013, 017). https이고 호스트가 있을 때만 true.
 * http, 빈 문자열, 호스트 없음, tel/mailto/intent/javascript/file/커스텀 스킴은 false.
 */
export function isOpenableBannerUrl(_url: string): boolean {
  throw new Error('not implemented');
}
