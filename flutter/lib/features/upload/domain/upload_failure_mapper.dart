import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import 'upload_models.dart';

/// 서버·네트워크 오류를 사용자에게 보일 [UploadFailure]로 바꾼다(D-02: errorCode·HTTP 상태로만 분기).
abstract final class UploadFailureMapper {
  /// - 취소 -> cancelled
  /// - 네트워크(연결·타임아웃) -> `Copy.uploadErrorNetwork`
  /// - 401(갱신 뒤에도) -> loginRequired
  /// - 403 -> `Copy.uploadGateBanned`
  /// - 그 밖 -> [fallback]
  static UploadFailure fromApi(
    ApiError error, {
    required String fallback,
    bool discardOnFallback = false,
  }) {
    if (error.isCancelled) return const UploadFailure.cancelled();
    if (error.isNetwork) return const UploadFailure(Copy.uploadErrorNetwork);
    if (error.status == 401) return const UploadFailure.loginRequired();
    if (error.status == 403) return const UploadFailure(Copy.uploadGateBanned);
    return UploadFailure(fallback, discardPrepared: discardOnFallback);
  }
}
