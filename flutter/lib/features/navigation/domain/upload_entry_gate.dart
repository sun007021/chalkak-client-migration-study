// ignore_for_file: unused_field
import 'package:dio/dio.dart';

import '../../../core/time/kst_date.dart';
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

  Future<UploadGateResult> enter({CancelToken? cancelToken}) =>
      throw UnimplementedError();
}
