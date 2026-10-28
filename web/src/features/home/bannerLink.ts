/**
 * 배너 링크를 열어도 되는 주소인가(REQ-BANR-013, 017). 파싱한 결과가 https이고 호스트가 있으며 userinfo(user:pass@)가 없을 때만 true.
 * http, 빈 문자열, 공백·제어 문자 포함, 호스트 없음, tel/mailto/intent/javascript/file/커스텀 스킴은 false.
 * 스킴 대소문자는 URL 규칙대로 구분하지 않는다(`HTTPS://`는 https).
 */
export function isOpenableBannerUrl(url: string): boolean {
  // URL 파서는 탭·줄바꿈을 조용히 지우므로 파싱 전에 거른다.
  if (/[\s\u0000-\u001f\u007f]/.test(url)) return false;
  // `https:///path`는 파서가 호스트를 path의 첫 조각으로 읽는다. 권한 부분이 비어 있으면 호스트 없음이다.
  if (!/^https:\/\/[^/?#]/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname !== '' && parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}
