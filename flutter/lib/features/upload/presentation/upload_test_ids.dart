/// docs/testing/testids.md "사진 업로드"·"업로드 성공"의 식별자.
/// `Semantics(identifier:)`와 `Key`에 같은 값을 쓴다.
abstract final class UploadTestIds {
  static const root = 'upload.root';
  static const closeButton = 'upload.close-button';
  static const topicTitle = 'upload.topic-title';
  static const guideText = 'upload.guide-text';
  static const photoPreview = 'upload.photo-preview';
  static const albumButton = 'upload.album-button';
  static const cameraButton = 'upload.camera-button';
  static const titleInput = 'upload.title-input';
  static const titleCounter = 'upload.title-counter';
  static const submitButton = 'upload.submit-button';
  static const preparingIndicator = 'upload.preparing-indicator';
  static const submittingIndicator = 'upload.submitting-indicator';
  static const errorMessage = 'upload.error-message';

  static const successRoot = 'upload-success.root';
  static const successMessage = 'upload-success.message';
  static const successStatusMessage = 'upload-success.status-message';
  static const successConfirmButton = 'upload-success.confirm-button';

  /// 업로드 진입 게이트 확인 중 표시.
  static const entryLoading = 'upload-entry.loading';
}
