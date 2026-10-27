/// 게시물 변경을 화면 밖으로 알리는 공용 버스(전시·기록·홈·피드가 같이 쓴다).
sealed class PostEvent {
  const PostEvent(this.postId);
  final String postId;
}

/// 삭제·비공개(404)로 목록과 캐시에서 빼야 하는 게시물.
final class PostRemoved extends PostEvent {
  const PostRemoved(super.postId);
}

/// 제목 수정 성공. [title]이 null이면 "무제".
final class PostTitleChanged extends PostEvent {
  const PostTitleChanged(super.postId, this.title);
  final String? title;
}

/// 구독자는 broadcast 스트림을 듣는다. 듣는 사람이 없을 때 낸 이벤트는 버려지지만,
/// 삭제된 id는 [isRemoved]로 기억해 늦은 재검증 응답이 되살리지 못하게 한다(TC-FEED-044).
class PostEventBus {
  PostEventBus();

  Stream<PostEvent> get events => throw UnimplementedError();

  /// 삭제·404로 [publishRemoved]된 적이 있는 id인가.
  bool isRemoved(String postId) => throw UnimplementedError();

  void publishRemoved(String postId) => throw UnimplementedError();

  void publishTitleChanged(String postId, String? title) =>
      throw UnimplementedError();

  /// 계정 전환: 기억한 삭제 id를 비운다(TC-FEED-057).
  void reset() => throw UnimplementedError();
}
