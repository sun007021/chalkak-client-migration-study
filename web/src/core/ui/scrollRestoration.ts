/**
 * 브라우저의 자동 스크롤 복원을 끈다. 앱이 location.key별로 위치를 기억하고(ScrollMemory) 내용이 준비된 뒤에 직접 복원하므로,
 * 브라우저가 내용이 없는 시점에 먼저 스크롤하거나 값을 덮는 일을 막는다. 지원하지 않는 환경에서는 아무 일도 하지 않는다.
 */
export function disableBrowserScrollRestoration(history: { scrollRestoration?: ScrollRestoration } = window.history): void {
  try {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  } catch {
    // 일부 환경은 쓰기를 막는다: 브라우저 기본 복원이 남을 뿐이다.
  }
}
