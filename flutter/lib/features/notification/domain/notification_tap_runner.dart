// 구현 전 껍데기: 본문이 비어 있어 필드가 아직 쓰이지 않는다. 구현하면서 이 줄을 지운다.
// ignore_for_file: unused_field

import 'package:dio/dio.dart';

import '../../../core/ui/toast/toast_controller.dart';
import '../../auth/domain/user_data_cleaner.dart';
import 'notification_navigator.dart';
import 'notification_repository.dart';
import 'notification_route.dart';
import 'unread_refresher.dart';

/// [NotificationTapRunner.run]의 결과.
enum TapResult {
  /// 읽음 성공(또는 읽음이 필요 없는 계획) 후 이동했다.
  navigated,

  /// 읽음이 연결 실패·타임아웃이라 토스트 `noti.read.error.network` 후 이동했다. 행은 미읽음 그대로.
  navigatedReadFailed,

  /// 404와 그 밖의 읽음 실패: 이동하지 않고 토스트 `noti.gone`, 목록·미읽음 새로고침.
  gone,

  /// 401(갱신 후에도 UNAUTHORIZED, 또는 REAUTHENTICATION_REQUIRED): 로그인 화면으로 보냈고 이동하지 않았다.
  loginRequired,

  /// 화면 이탈(취소)·계정 전환으로 결과를 버렸다. 이동·토스트가 없다.
  cancelled,
}

/// 알림함 행 탭과 푸시 탭이 함께 쓰는 "읽음 후 이동"(D-11, REQ-NOTI-015~019, REQ-PUSH-027).
/// - `readNotificationId`가 있으면 `markRead`를 먼저 보낸다. 없으면 바로 이동한다.
/// - 읽음 성공: 이동하고 미읽음을 다시 조회한다(REQ-NOTI-029).
/// - 연결 실패: 토스트 후 이동. 404·5xx·403·400: 이동 안 함, 토스트 `noti.gone`,
///   `refreshInbox`와 미읽음 새로고침(D-24).
/// - 401: `navigator.goToLogin()`, 이동 없음.
/// - 취소(CancelToken)와 [clearAll](로그아웃·계정 전환) 뒤 도착한 응답은 버린다. 오류로 바꾸지 않는다.
class NotificationTapRunner implements UserDataCleaner {
  NotificationTapRunner({
    required this._repository,
    required this._navigator,
    required this._toast,
    required this._unread,
    required this._refreshInbox,
  });

  final NotificationRepository _repository;
  final NotificationNavigator _navigator;
  final ToastSink _toast;
  final UnreadRefresher _unread;

  /// 열려 있는 알림함 목록을 첫 페이지부터 다시 불러온다(없으면 아무것도 하지 않는다).
  final Future<void> Function() _refreshInbox;

  Future<TapResult> run(NavigatePlan plan, {CancelToken? cancelToken}) =>
      throw UnimplementedError();

  /// 진행 중인 읽음 요청의 결과를 버리게 한다.
  @override
  Future<void> clearAll() => throw UnimplementedError();
}
