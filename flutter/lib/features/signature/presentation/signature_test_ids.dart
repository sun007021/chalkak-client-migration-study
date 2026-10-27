/// docs/testing/testids.md의 사인 그리기·미리보기 식별자.
/// `Semantics(identifier:)`와 `Key`에 같은 값을 쓴다.
abstract final class SignatureTestIds {
  static const drawRoot = 'signature.root';
  static const drawTitle = 'signature.title';
  static const drawGuideText = 'signature.guide-text';
  static const drawCanvas = 'signature.canvas';
  static const drawCanvasHint = 'signature.canvas-hint';
  static const drawUndoButton = 'signature.undo-button';
  static const drawClearButton = 'signature.clear-button';
  static const drawSubmitButton = 'signature.submit-button';
  static const drawBackButton = 'signature.back-button';
  static const drawErrorMessage = 'signature.error-message';

  static const previewRoot = 'signature-preview.root';
  static const previewTitle = 'signature-preview.title';
  static const previewImage = 'signature-preview.image';
  static const previewRedrawButton = 'signature-preview.redraw-button';
  static const previewConfirmButton = 'signature-preview.confirm-button';
  static const previewChangeNotice = 'signature-preview.change-notice';
  static const previewLoading = 'signature-preview.loading';
  static const previewErrorMessage = 'signature-preview.error-message';
  static const previewErrorDialog = 'signature-preview.error-dialog';
  static const previewErrorDialogConfirmButton =
      'signature-preview.error-dialog-confirm-button';
}
