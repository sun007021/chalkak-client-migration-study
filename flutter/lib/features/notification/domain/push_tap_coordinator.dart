// 구현 전 껍데기: 본문이 비어 있어 필드가 아직 쓰이지 않는다. 구현하면서 이 줄을 지운다.
// ignore_for_file: unused_field

import '../../../core/auth/session_manager.dart';
import '../../../core/push/push_payload.dart';
import '../../auth/domain/user_data_cleaner.dart';
import 'notification_navigator.dart';
import 'notification_tap_runner.dart';
import 'pending_push_store.dart';

/// 푸시 탭 처리 상태기계(D-11 3~4, REQ-PUSH-021~032). "수신 대기 -> 보류 -> 처리 -> 이동".
///
/// [onTapped](opened 스트림, initialMessage 모두):
/// - 세션이 없거나 게스트면 이동 없이 버린다. 보류도 저장하지 않으며 이후 로그인해도 목적지로 가지 않는다(Q-12).
/// - 그 밖에는 [PendingPush]를 [PendingPushStore]에 저장한다(이전 보류분 교체) 후 [flush]를 시도한다.
///
/// [flush]: 메인이 준비됐고([setMainReady]) 막는 화면이 없을 때([setBlocked]) 보류분을 정확히 1회 소비한다.
/// - 소비는 저장소를 먼저 비운 뒤 한다(재진입으로 두 번 처리하지 않는다).
/// - 보류분의 userId가 지금 세션과 다르면 폐기한다(TC-PUSH-066).
/// - 목적지는 [NotificationRouter.fromPush]. 읽음이 필요한 계획은 [NotificationTapRunner]로 처리한다.
///   알림함 폴백은 [NotificationNavigator.openInbox]. 같은 `eventId`라도 중복 제거하지 않고 각각 처리한다.
/// - 막는 화면: 가입(약관·사인 미리보기), 업로드·피드백 작성 중(TC-PUSH-060~061). 로그인 화면은 세션이 없어 폐기된다.
/// - 업데이트 게이트(D-15)가 통과되기 전에는 메인이 준비되지 않은 것으로 본다(통합에서 [setMainReady]에 반영).
class PushTapCoordinator implements UserDataCleaner {
  PushTapCoordinator({
    required this._sessions,
    required this._store,
    required this._runner,
    required this._navigator,
  });

  final SessionManager _sessions;
  final PendingPushStore _store;
  final NotificationTapRunner _runner;
  final NotificationNavigator _navigator;

  /// 저장소에 남은 보류분을 불러온다(앱 시작 시 1회). 소비 뒤에는 남지 않는다.
  Future<void> restore() => throw UnimplementedError();

  Future<void> onTapped(PushPayload payload) => throw UnimplementedError();

  void setMainReady(bool ready) => throw UnimplementedError();

  /// [reason] 단위로 막는다. 같은 reason을 다시 켜도 한 번 끈 것으로 풀린다.
  void setBlocked(Object reason, {required bool blocked}) =>
      throw UnimplementedError();

  Future<void> flush() => throw UnimplementedError();

  bool get hasPending => throw UnimplementedError();

  /// 로그아웃·계정 전환: 보류분을 메모리와 저장소에서 지운다.
  @override
  Future<void> clearAll() => throw UnimplementedError();
}
