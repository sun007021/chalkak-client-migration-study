import { format } from '../../shared/copy';

/**
 * ko.json에 아직 없는 업로드·편집 화면 문구. 키가 추가되면 `t()`로 옮기고 이 파일을 지운다.
 * (README "업로드·편집" > "ko.json 키 필요" 참고. 이 PR은 ko.json을 수정하지 않는다.)
 */
export const localCopy = {
  /** upload.album-button 라벨 */
  albumButton: '앨범',
  /** upload.camera-button 라벨 */
  cameraButton: '카메라',
  /** upload.close-button 접근성 라벨 */
  closeA11y: '닫기',
  /** upload.title-counter: "{현재}/{최대}" */
  titleCounter: '{현재}/{최대}',
  /** 사진 미리보기 접근성 라벨(탭하면 편집) */
  previewA11y: '선택한 사진. 누르면 다시 편집해요',
  /** iOS 촬영 사진 저장 권한 안내 본문 */
  permissionBody: '촬영한 사진을 앨범에 저장하려면 사진 접근 권한이 필요해요.',
  /** 권한 안내 "취소" */
  permissionCancel: '취소',
  /** 편집기: 사진 준비 중 */
  editorLoading: '사진을 불러오는 중...',
  /** 편집기: 완료 후 원본 크기 렌더링 중 */
  editorRendering: '사진을 다듬는 중...',
  /** 편집기 오류 알림 "확인" */
  editorErrorRetry: '다시 시도',
  /** 업로드 게이트 확인 중 접근성 라벨 */
  gateChecking: '확인하는 중...',
} as const;

export function titleCounterText(length: number, max: number): string {
  return format(localCopy.titleCounter, { 현재: length, 최대: max });
}
