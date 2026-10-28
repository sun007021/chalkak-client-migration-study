import type { ReactNode } from 'react';

/**
 * 게이트 확인 중 표시(`upload-entry.loading`, role="status"). 라우트 루트(전역)에 한 번 그리며 container.uploadGate.state.checking일 때만 DOM에 있다.
 * container.uploadGate가 null(테스트용 uploadEntry 덮어쓰기)이면 아무것도 그리지 않는다.
 */
export function UploadEntryLoading(): ReactNode {
  return null;
}
