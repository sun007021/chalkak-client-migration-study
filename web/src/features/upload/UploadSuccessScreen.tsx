import type { ReactNode } from 'react';

/**
 * 업로드 성공 화면(`/upload/success`, screen_view `photo_upload_success`). container.uploadResults.get()이 없으면(새로고침·딥링크) 홈으로 replace.
 * data-testid: upload-success.root, upload-success.message, upload-success.status-message, upload-success.confirm-button.
 * "확인했어요."는 결과를 비우고 successNextPath(topicDate)로 replace 이동한다(뒤로 가기가 업로드·성공 화면으로 돌아오지 않는다).
 * 구현은 구현 단계에서.
 */
export function UploadSuccessScreen(): ReactNode {
  return null;
}
