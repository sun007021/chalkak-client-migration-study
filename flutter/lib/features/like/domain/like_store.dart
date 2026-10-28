import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import '../../../core/post_events/post_event_bus.dart';
import 'like_repository.dart';
import 'toast_message.dart';

/// 한 게시물의 화면 표시용 좋아요 값.
class LikeState {
  const LikeState({required this.isLiked, required this.likeCount});

  final bool isLiked;
  final int likeCount;

  @override
  bool operator ==(Object other) =>
      other is LikeState &&
      other.isLiked == isLiked &&
      other.likeCount == likeCount;

  @override
  int get hashCode => Object.hash(isLiked, likeCount);

  @override
  String toString() => 'LikeState(isLiked: $isLiked, likeCount: $likeCount)';
}

/// 게시물 하나의 좋아요 진행 상황. 저장소 안에서만 쓴다.
class _Entry {
  _Entry(LikeState value)
    : shown = value,
      confirmed = value,
      intent = value.isLiked;

  /// 화면에 보이는 값(낙관 반영 포함).
  LikeState shown;

  /// 서버가 마지막으로 확정한 값.
  LikeState confirmed;

  /// 사용자가 마지막으로 원한 좋아요 여부.
  bool intent;

  /// 탭 횟수. 요청이 도는 동안 사용자가 더 눌렀는지 알아내는 데 쓴다.
  int taps = 0;

  /// 이 게시물에 마지막으로 좋아요 변경(낙관 반영·확정·롤백)이 있었던 저장소 version.
  int touchedAt = 0;

  /// 요청 줄을 처리 중이면 그 Future.
  Future<void>? worker;
}

/// 전시·피드·홈이 함께 쓰는 좋아요 저장소(D-04). 화면은 값을 직접 갖지 않고
/// [stateOf]를 읽으며, 바뀔 때마다 [notifyListeners]로 알린다.
///
/// 규칙:
/// - [toggle]: 게스트면 API 없이 `Copy.guestLike` 토스트. 아니면 즉시 낙관 반영
///   (`isLiked` 반전, `likeCount` ±1, 0 아래로 내려가지 않음).
/// - 같은 게시물은 직렬화한다. 요청이 진행 중일 때 누르면 요청을 쌓지 않고 마지막
///   의도만 기억하며, 응답 뒤 최종 의도와 서버 상태가 다르면 한 번 더 보낸다.
///   서로 다른 게시물은 독립적으로 병렬이다.
/// - 성공 응답의 `likeCount`·`isLiked`로 덮어쓴다(마지막 의도와 같을 때).
/// - 실패는 요청 전 확정 값으로 롤백하고 토스트(`Copy.likeErrorGeneric`). 롤백 결과가
///   이미 최종 의도와 같으면 추가 요청 없이 토스트만. 401은 롤백만(토스트 없음, 로그인
///   이동은 앱이 세션 해제로 처리). 403(등록)은 `Copy.likeErrorBanned`, 재요청 없음.
///   404는 롤백 + `Copy.likeErrorGeneric` + [PostEventBus.publishRemoved].
/// - 실패한 요청 뒤에 사용자가 더 누른 의도가 있으면 롤백이 그 의도를 되돌리지 않고
///   남은 의도를 한 번 더 보낸다(TC-LIKE-022). 이렇게 밀려난 실패는 토스트를 내지 않는다.
/// - [toasts]는 broadcast다. 화면이 보이는 동안만 구독하면 보이지 않을 때의 토스트는 버려진다.
class LikeStore extends ChangeNotifier {
  LikeStore({
    required this._repository,
    required this._events,
    required this._isGuest,
  });

  final LikeRepository _repository;
  final PostEventBus _events;
  final bool Function() _isGuest;

  final Map<String, _Entry> _entries = {};
  final StreamController<ToastMessage> _toasts =
      StreamController<ToastMessage>.broadcast();

  /// 계정 전환([reset]) 때마다 새로 만든다. 이전 세대의 응답은 버린다.
  CancelToken _cancelToken = CancelToken();
  int _generation = 0;
  int _version = 0;
  int _toastSequence = 0;
  bool _disposed = false;

  Stream<ToastMessage> get toasts => _toasts.stream;

  /// 어떤 게시물이든 값이 바뀔 때마다 1씩 오른다. 목록 재검증 요청을 보내기 전에 읽어 두었다가
  /// [reconcile]의 `since`로 넘긴다.
  int get version => _version;

  /// 아직 본 적 없는 게시물이면 null.
  LikeState? stateOf(String postId) => _entries[postId]?.shown;

  /// 서버 응답(목록·상세)의 좋아요 값을 반영하고 화면에 쓸 값을 돌려준다.
  /// `since` 이후 이 게시물에 좋아요 변경(낙관 반영·확정·롤백)이 있었거나 요청이 진행 중이면
  /// 응답 값을 버리고 현재 값을 유지한다(늦은 재검증이 덮지 않음, TC-LIKE-021·023).
  LikeState reconcile(
    String postId, {
    required bool isLiked,
    required int likeCount,
    required int since,
  }) {
    final value = LikeState(isLiked: isLiked, likeCount: likeCount);
    final entry = _entries[postId];
    if (entry == null) {
      _entries[postId] = _Entry(value);
      _changed();
      return value;
    }
    if (entry.worker != null || entry.touchedAt > since) return entry.shown;
    final differs = entry.shown != value || entry.confirmed != value;
    entry
      ..shown = value
      ..confirmed = value
      ..intent = isLiked;
    if (differs) _changed();
    return value;
  }

  /// 이 게시물의 요청 줄이 모두 끝나면 완료한다. [reconcile]로 값을 본 적 없는 게시물이면 무시한다.
  Future<void> toggle(String postId) {
    if (_disposed) return Future<void>.value();
    if (_isGuest()) {
      _emitToast(Copy.guestLike);
      return Future<void>.value();
    }
    final entry = _entries[postId];
    if (entry == null) return Future<void>.value();

    entry
      ..intent = !entry.intent
      ..taps += 1
      ..shown = _applied(entry.shown, liked: entry.intent);
    _touch(entry);
    return entry.worker ??= _drain(postId, entry);
  }

  /// 계정 전환·로그아웃: 값을 모두 비우고 진행 중 요청의 결과를 무시한다(TC-LIKE-031).
  void reset() {
    _generation++;
    _cancelToken.cancel();
    _cancelToken = CancelToken();
    _entries.clear();
    _changed();
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    _cancelToken.cancel();
    unawaited(_toasts.close());
    super.dispose();
  }

  /// 확정 값과 의도가 같아질 때까지 한 번에 하나씩 요청한다.
  Future<void> _drain(String postId, _Entry entry) async {
    final generation = _generation;
    try {
      while (entry.confirmed.isLiked != entry.intent) {
        final wanted = entry.intent;
        final tapsAtStart = entry.taps;
        try {
          final result = await _send(postId, liked: wanted);
          if (_isStale(generation)) return;
          _onSuccess(entry, result);
        } on Object catch (error) {
          if (_isStale(generation)) return;
          final resend = _onFailure(
            postId,
            entry,
            error,
            wanted: wanted,
            superseded: tapsAtStart != entry.taps,
          );
          if (!resend) break;
        }
      }
    } finally {
      if (!_isStale(generation) && identical(_entries[postId], entry)) {
        entry.worker = null;
      }
    }
  }

  Future<LikeResult> _send(String postId, {required bool liked}) => liked
      ? _repository.like(postId, cancelToken: _cancelToken)
      : _repository.unlike(postId, cancelToken: _cancelToken);

  void _onSuccess(_Entry entry, LikeResult result) {
    final confirmed = LikeState(
      isLiked: result.isLiked,
      likeCount: result.likeCount,
    );
    entry
      ..confirmed = confirmed
      ..shown = result.isLiked == entry.intent
          ? confirmed
          // 응답 뒤 사용자가 더 눌렀다면 남은 의도를 확정 값 위에 다시 낙관 반영한다.
          : _applied(confirmed, liked: entry.intent);
    _touch(entry);
  }

  /// 실패를 반영하고, 남은 의도를 다시 보내야 하면 true를 돌려준다.
  /// 취소와 인증·정지·삭제 실패는 다시 보내지 않는다.
  bool _onFailure(
    String postId,
    _Entry entry,
    Object error, {
    required bool wanted,
    required bool superseded,
  }) {
    final apiError = error is ApiError ? error : null;
    final terminal = _isTerminal(error);
    final cancelled = apiError != null && apiError.isCancelled;
    // 요청이 도는 동안 사용자가 의도를 바꿨으면 이 실패는 밀려난 것이다: 롤백하지 않고 남은 의도를 다시 보낸다.
    if (!terminal &&
        !cancelled &&
        superseded &&
        entry.intent != entry.confirmed.isLiked) {
      return true;
    }

    entry
      ..intent = entry.confirmed.isLiked
      ..shown = entry.confirmed;
    _touch(entry);
    if (cancelled) return false;

    final status = apiError?.status;
    if (status == 401) return false;
    // 정지 안내는 등록(PUT)에만 해당한다. 취소(DELETE)의 403은 일반 실패다.
    if (status == 403 && wanted) {
      _emitToast(Copy.likeErrorBanned);
      return false;
    }
    if (status == 404) _events.publishRemoved(postId);
    _emitToast(Copy.likeErrorGeneric);
    return false;
  }

  /// 다시 보내도 소용없는 실패(인증·정지·삭제).
  bool _isTerminal(Object error) =>
      error is ApiError &&
      (error.status == 401 || error.status == 403 || error.status == 404);

  LikeState _applied(LikeState from, {required bool liked}) {
    if (from.isLiked == liked) return from;
    final delta = liked ? 1 : -1;
    final count = from.likeCount + delta;
    return LikeState(isLiked: liked, likeCount: count < 0 ? 0 : count);
  }

  bool _isStale(int generation) => _disposed || generation != _generation;

  void _touch(_Entry entry) {
    _version++;
    entry.touchedAt = _version;
    notifyListeners();
  }

  void _changed() {
    _version++;
    notifyListeners();
  }

  void _emitToast(String text) {
    if (_disposed) return;
    _toasts.add(ToastMessage(id: ++_toastSequence, text: text));
  }
}
