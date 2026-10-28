/**
 * 배너 링크를 열어도 되는 주소인가(REQ-BANR-013, 017). https이고 호스트가 있을 때만 true.
 * http, 빈 문자열, 호스트 없음, tel/mailto/intent/javascript/file/커스텀 스킴은 false.
 */
export function isOpenableBannerUrl(url: string): boolean {
  const prefix = 'https://';
  if (!url.startsWith(prefix)) return false;
  const rest = url.slice(prefix.length);
  if (rest === '' || /^[/?#\s]/.test(rest)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname !== '';
  } catch {
    return false;
  }
}
