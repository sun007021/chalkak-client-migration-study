import 'package:dio/dio.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import '../../../core/time/kst_date.dart';
import '../../home/domain/home_models.dart';
import '../../home/domain/today_post_repository.dart';

/// 업로드 진입 게이트 결과(D-14 1항).
sealed class UploadGateResult {
  const UploadGateResult();
}

/// 통과. [topicDate]를 업로드 화면에 고정한다.
final class UploadGateAllowed extends UploadGateResult {
  const UploadGateAllowed(this.topicDate);
  final KstDate topicDate;
}

/// 막힘. [message]를 토스트로 보여 준다.
/// - isPosted: Copy.uploadGateAlreadyPosted
/// - 404: Copy.uploadGateNoTopic
/// - 403: Copy.uploadGateBanned
/// - 그 외(네트워크, 5xx, 응답 검증 실패): Copy.uploadGateCheckFailed
final class UploadGateBlocked extends UploadGateResult {
  const UploadGateBlocked(this.message);
  final String message;
}

/// 401(갱신 후에도). 로그인 화면으로 보낸다.
final class UploadGateLoginRequired extends UploadGateResult {
  const UploadGateLoginRequired();
}

/// 요청이 취소돼 아무것도 하지 않는다.
final class UploadGateCancelled extends UploadGateResult {
  const UploadGateCancelled();
}

/// `GET /posts/today`로 업로드 진입 가능 여부를 정한다. 클라이언트 시계로 판단하지 않는다.
class UploadEntryGate {
  UploadEntryGate({required this._todayPost});

  final TodayPostRepository _todayPost;

  /// 어떤 실패도 던지지 않고 [UploadGateResult]로 돌려준다.
  Future<UploadGateResult> enter({CancelToken? cancelToken}) async {
    final TodayPost today;
    try {
      today = await _todayPost.today(cancelToken: cancelToken);
    } on ApiError catch (error) {
      return _failure(error);
    } on Object {
      // 예상 밖의 오류도 사용자에게는 "확인하지 못했다"로 같다.
      return const UploadGateBlocked(Copy.uploadGateCheckFailed);
    }
    if (today.isPosted) {
      return const UploadGateBlocked(Copy.uploadGateAlreadyPosted);
    }
    return UploadGateAllowed(today.topicDate);
  }

  static UploadGateResult _failure(ApiError error) {
    if (error.isCancelled) return const UploadGateCancelled();
    return switch (error.status) {
      401 => const UploadGateLoginRequired(),
      404 => const UploadGateBlocked(Copy.uploadGateNoTopic),
      403 => const UploadGateBlocked(Copy.uploadGateBanned),
      _ => const UploadGateBlocked(Copy.uploadGateCheckFailed),
    };
  }
}
