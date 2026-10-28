import 'dart:async';

import '../../../core/auth/session.dart';
import '../../../core/auth/session_manager.dart';
import '../../../core/push/push_payload.dart';
import '../../auth/domain/user_data_cleaner.dart';
import 'notification_navigator.dart';
import 'notification_route.dart';
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

  PendingPush? _pending;
  bool _mainReady = false;
  final Set<Object> _blockers = {};
  bool _flushing = false;

  /// [clearAll]마다 올라간다. 비동기 작업 도중 계정이 바뀌었는지 가린다.
  int _generation = 0;

  /// 저장소에 남은 보류분을 불러온다(앱 시작 시 1회). 소비 뒤에는 남지 않는다.
  Future<void> restore() async {
    final generation = _generation;
    PendingPush? saved;
    try {
      saved = await _store.read();
    } on Object {
      return;
    }
    // 복원하는 사이 더 새로운 탭이 들어왔거나 계정이 정리됐으면 덮어쓰지 않는다.
    if (_pending != null || generation != _generation) return;
    _pending = saved;
    await _flushSafely();
  }

  Future<void> onTapped(PushPayload payload) async {
    final generation = _generation;
    final Session? session;
    try {
      session = await _sessions.read();
    } on Object {
      return;
    }
    // 세션이 없거나 게스트면 앱만 열린다. 보류도 저장하지 않는다(Q-12).
    if (session == null || session.isGuest || generation != _generation) {
      return;
    }
    final pending = PendingPush(payload: payload, userId: session.userId);
    _pending = pending;
    try {
      await _store.write(pending);
    } on Object {
      // 저장 실패여도 메모리 보류분으로 계속 처리한다(프로세스 재시작 복원만 잃는다).
    }
    await _flushSafely();
  }

  void setMainReady(bool ready) {
    _mainReady = ready;
    if (ready) unawaited(_flushSafely());
  }

  /// [reason] 단위로 막는다. 같은 reason을 다시 켜도 한 번 끈 것으로 풀린다.
  void setBlocked(Object reason, {required bool blocked}) {
    if (blocked) {
      _blockers.add(reason);
    } else if (_blockers.remove(reason)) {
      unawaited(_flushSafely());
    }
  }

  bool get _canFlush => _mainReady && _blockers.isEmpty;

  Future<void> flush() async {
    // 처리 중 새 탭이 보류되면 이어서 처리한다. 한 번에 한 건만 소비한다.
    if (_flushing) return;
    _flushing = true;
    try {
      while (_pending != null && _canFlush) {
        final pending = _pending!;
        _pending = null;
        final generation = _generation;
        // 소비는 저장소를 먼저 비운 뒤 한다. 도중에 죽어도 같은 탭을 두 번 처리하지 않는다.
        try {
          await _store.clear();
        } on Object {
          // 비우지 못해도 이번 소비는 진행한다.
        }
        if (generation != _generation) continue;
        await _consume(pending, generation);
      }
    } finally {
      _flushing = false;
    }
  }

  Future<void> _consume(PendingPush pending, int generation) async {
    final Session? session;
    try {
      session = await _sessions.read();
    } on Object {
      return;
    }
    // 탭한 뒤 로그아웃·계정 전환이 있었으면 폐기한다(TC-PUSH-066).
    if (session == null ||
        session.isGuest ||
        session.userId != pending.userId ||
        generation != _generation) {
      return;
    }
    try {
      await _runner.run(NotificationRouter.fromPush(pending.payload));
    } on Object {
      // 이동 실패는 삼킨다. 이미 소비했으므로 되풀이하지 않는다.
    }
  }

  Future<void> _flushSafely() async {
    try {
      await flush();
    } on Object {
      // 푸시 이동 실패가 호출한 흐름(홈 진입, 화면 전환)을 깨뜨리지 않는다.
    }
  }

  bool get hasPending => _pending != null;

  /// 로그아웃·계정 전환: 보류분을 메모리와 저장소에서 지운다.
  @override
  Future<void> clearAll() async {
    _generation++;
    _pending = null;
    try {
      await _store.clear();
    } on Object {
      // 정리 실패가 다른 정리를 막지 않는다.
    }
  }
}
