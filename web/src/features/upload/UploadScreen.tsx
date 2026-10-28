import type { ReactNode } from 'react';

/**
 * 업로드 화면(`/upload`, screen_view `photo_upload`). 회원 전용(게스트가 URL로 오면 홈으로 replace + nav.guest.upload 토스트).
 * location.state가 readUploadRouteState로 읽히지 않으면 홈으로 replace(요청·screen_view 없음).
 * data-testid: upload.root, upload.close-button, upload.topic-title, upload.guide-text, upload.photo-preview, upload.album-button,
 * upload.camera-button(container.cameraCapture.supported()일 때만), upload.title-input, upload.title-counter, upload.submit-button,
 * upload.preparing-indicator, upload.submitting-indicator, upload.error-message, upload.error-state, upload.retry-button.
 * 앨범/카메라 버튼은 `<label data-testid=…>` 안의 `<input type="file" accept="image/*">`(카메라는 capture 속성도)이고 단일 선택이다.
 * 편집기는 container.photoEditor가 있을 때 vm.state.editor가 열려 있는 동안 그 컴포넌트를 그린다. 구현은 구현 단계에서.
 */
export function UploadScreen(): ReactNode {
  return null;
}
