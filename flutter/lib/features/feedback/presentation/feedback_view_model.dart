import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/auth/session_manager.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../domain/feedback_repository.dart';

class FeedbackState {
  const FeedbackState({
    this.text = '',
    this.count = 0,
    this.canSend = false,
    this.sending = false,
    this.validationMessage,
    this.errorMessage,
  });

  /// 입력창 내용 그대로(trim 전).
  final String text;

  /// 카운터 값: trim 후 code point 수. 1000을 넘어도 그대로 센다(REQ-FDBK-003).
  final int count;

  /// "보내기" 활성 여부: trim 후 1자 이상이고 전송 중이 아닐 때. 1000 초과여도 활성이다(REQ-FDBK-005).
  final bool canSend;

  /// 전송 중: 버튼이 `Copy.fdbkSending`("보내는 중...")이고 비활성이다(REQ-FDBK-006).
  final bool sending;

  /// 1000자 초과 검증 문구(`Copy.fdbkErrorInvalid`). `feedback.validation-message`.
  final String? validationMessage;

  /// 전송 실패 문구. `feedback.error-message`.
  final String? errorMessage;
}

sealed class FeedbackEvent {
  const FeedbackEvent();
}

/// 피드백 화면을 닫는다(전송 성공 뒤).
final class CloseFeedback extends FeedbackEvent {
  const CloseFeedback();
}

/// 피드백 보내기(REQ-FDBK-002~015, TC-FDBK-003~030, 034).
///
/// 입력: [onTextChanged]가 내용을 받고 카운터·활성 여부를 다시 계산한다. 입력을 막지 않는다
/// (10만 자를 붙여넣어도 그대로 세고, 보낼 때 거부한다, TC-FDBK-014). 입력을 바꾸면 이전
/// 검증·오류 문구를 지운다.
///
/// [send]:
/// - 전송 중이거나 trim 후 0자면 요청하지 않는다(연타는 POST 1회, TC-FDBK-019). 0자는 문구도 없다.
/// - trim 후 1000 초과면 요청 없이 `Copy.fdbkErrorInvalid`를 validationMessage로 보인다(TC-FDBK-007).
/// - 보내는 내용은 trim 값이다(중간 공백 보존, TC-FDBK-008, 012).
/// - 성공(201): `Copy.fdbkSuccess` 토스트, 입력 비움(TC-FDBK-020), [CloseFeedback]. 정지 회원도 같다(TC-FDBK-028).
/// - 실패는 입력을 유지하고 다시 보낼 수 있다(REQ-FDBK-009), 자동 재시도 없다(TC-FDBK-024~027):
///   400은 서버 `message`를 그대로 errorMessage로(없으면 `Copy.fdbkErrorInvalid`, TC-FDBK-021),
///   연결 실패·타임아웃은 `Copy.commonErrorNetwork`(TC-FDBK-025), 그 밖은 `Copy.fdbkErrorGeneric`
///   (500, 503/429 포함, TC-FDBK-024, 027). 401은 `ApiClient`가 갱신·세션 삭제를 하므로 문구 없이 끝난다
///   (로그인 이동은 앱 몫, TC-FDBK-022, 023). 사용자가 수동으로 다시 보내면 중복 제거 없이 새 요청이다(TC-FDBK-026).
/// - 요청을 보내는 사이 세션의 userId가 바뀌었거나 로그아웃됐으면 결과를 버린다: 토스트·이동 없음(TC-FDBK-030).
/// - [dispose](화면 이탈): 진행 중 요청을 취소하고 취소 오류를 보이지 않는다(TC-FDBK-029).
///
/// 분석: [onShown]이 `screen_view(feedback)`를 한 번 보낸다(REQ-FDBK-014). 피드백 내용은 어떤 분석
/// 파라미터에도 넣지 않는다(TC-FDBK-034).
///
/// 푸시 탭 이동 보류 훅: 화면이 열려 있는 동안 [onComposingChanged]가 true([onShown]), 닫히면 false
/// ([dispose])로 불린다(REQ-FDBK-014, REQ-PUSH-031). 알림 브랜치가 이 콜백에서 보류 상태를 바꾼다.
class FeedbackViewModel extends ChangeNotifier {
  FeedbackViewModel({
    required this._repository,
    required this._sessions,
    required this._toast,
    required this._analytics,
    this.onComposingChanged,
  });

  // ignore: unused_field
  final FeedbackRepository _repository;
  // ignore: unused_field
  final SessionManager _sessions;
  // ignore: unused_field
  final ToastSink _toast;
  // ignore: unused_field
  final AnalyticsTracker _analytics;

  /// 피드백 작성 중 여부가 바뀔 때 부른다(푸시 이동 보류 훅).
  final void Function(bool composing)? onComposingChanged;

  FeedbackState get state => throw UnimplementedError();

  Stream<FeedbackEvent> get events => throw UnimplementedError();

  void onShown() => throw UnimplementedError();

  void onTextChanged(String text) => throw UnimplementedError();

  Future<void> send() => throw UnimplementedError();
}
