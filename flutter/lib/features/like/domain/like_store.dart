import 'package:flutter/foundation.dart';

import '../../feed/domain/post_event_bus.dart';
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
///   남은 의도를 한 번 더 보낸다(TC-LIKE-022).
/// - [toasts]는 broadcast다. 화면이 보이는 동안만 구독하면 보이지 않을 때의 토스트는 버려진다.
class LikeStore extends ChangeNotifier {
  LikeStore({
    required LikeRepository repository,
    required PostEventBus events,
    required bool Function() isGuest,
  });

  Stream<ToastMessage> get toasts => throw UnimplementedError();

  /// 어떤 게시물이든 값이 바뀔 때마다 1씩 오른다. 목록 재검증 요청을 보내기 전에 읽어 두었다가
  /// [reconcile]의 `since`로 넘긴다.
  int get version => throw UnimplementedError();

  /// 아직 본 적 없는 게시물이면 null.
  LikeState? stateOf(String postId) => throw UnimplementedError();

  /// 서버 응답(목록·상세)의 좋아요 값을 반영하고 화면에 쓸 값을 돌려준다.
  /// `since` 이후 이 게시물에 좋아요 변경(낙관 반영·확정·롤백)이 있었거나 요청이 진행 중이면
  /// 응답 값을 버리고 현재 값을 유지한다(늦은 재검증이 덮지 않음, TC-LIKE-021·023).
  LikeState reconcile(
    String postId, {
    required bool isLiked,
    required int likeCount,
    required int since,
  }) => throw UnimplementedError();

  /// 이 게시물의 요청 줄이 모두 끝나면 완료한다. [reconcile]로 값을 본 적 없는 게시물이면 무시한다.
  Future<void> toggle(String postId) => throw UnimplementedError();

  /// 계정 전환·로그아웃: 값을 모두 비우고 진행 중 요청의 결과를 무시한다(TC-LIKE-031).
  void reset() => throw UnimplementedError();
}
