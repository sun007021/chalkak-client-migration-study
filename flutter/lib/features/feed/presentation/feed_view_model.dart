import 'package:flutter/foundation.dart';

import '../../../core/time/kst_clock.dart';
import '../../../core/time/kst_date.dart';
import '../../like/domain/like_store.dart';
import '../../like/domain/toast_message.dart';
import '../domain/feed_target.dart';
import '../domain/post_event_bus.dart';
import '../domain/post_repository.dart';

enum FeedStatus { loading, content, notFound, error }

/// 화면에 그리는 게시물 값. 시드나 상세 응답에서 온다.
class FeedContent {
  const FeedContent({
    required this.postId,
    required this.originalImageUrl,
    required this.signatureImageUrl,
    required this.title,
    required this.topicDate,
    required this.likeCount,
    required this.isLiked,
  });

  final String postId;
  final String originalImageUrl;
  final String? signatureImageUrl;

  /// 서버 값 그대로(null 가능). 화면은 [FeedState.displayTitle]을 쓴다.
  final String? title;

  /// 상세 응답 전에 시드에 날짜가 없으면 null(기록·푸시 진입).
  final KstDate? topicDate;
  final int likeCount;
  final bool isLiked;
}

class FeedState {
  const FeedState({
    required this.status,
    required this.isConfirmed,
    required this.isMine,
    required this.canEditTitle,
    required this.canDelete,
    required this.likeEnabled,
    this.content,
    this.dateLabel,
    this.displayTitle = '',
    this.errorText,
    this.isSavingTitle = false,
    this.titleError,
    this.isDeleting = false,
  });

  final FeedStatus status;
  final FeedContent? content;

  /// 상세 응답을 받아 확정되었는가. 확정 전에는 좋아요·수정·삭제가 막힌다.
  final bool isConfirmed;

  /// 응답 전 진입 경로 값, 응답 후 `authorId == userId`(D-26). 게스트·userId 없음은 false.
  final bool isMine;

  /// 수정 버튼 노출: 내 게시물 + topicDate가 KST 오늘(D-23).
  final bool canEditTitle;

  /// 삭제 버튼 노출: 내 게시물.
  final bool canDelete;
  final bool likeEnabled;

  /// "M월 d일의 주제". topicDate를 모르면 null.
  final String? dateLabel;

  /// 제목, null·빈 값이면 `Copy.feedTitleNone`("무제").
  final String displayTitle;

  /// [FeedStatus.error] 문구: 404가 아니면 연결 실패 `Copy.commonErrorNetwork`,
  /// 응답 계약 위반 `Copy.feedErrorInvalid`, 그 밖 `Copy.feedErrorLoad`.
  final String? errorText;
  final bool isSavingTitle;

  /// 제목 수정 다이얼로그 안에 보여 줄 실패 사유(다이얼로그는 닫지 않는다).
  final String? titleError;
  final bool isDeleting;
}

sealed class FeedEvent {
  const FeedEvent();
}

final class FeedToast extends FeedEvent {
  const FeedToast(this.message);
  final ToastMessage message;
}

/// 상세를 닫고 이전 화면으로 돌아간다(삭제 성공, 수정 404).
final class FeedClose extends FeedEvent {
  const FeedClose();
}

enum TitleSaveResult {
  /// 저장 성공: 다이얼로그를 닫는다.
  saved,

  /// 실패: 다이얼로그를 유지하고 [FeedState.titleError]를 보여 준다.
  failed,

  /// 404: 게시물이 없다. 다이얼로그를 닫고 [FeedClose]가 나간다.
  notFound,

  /// 요청을 보내지 않았다(확정 전, 내 게시물 아님, 지난 주제, 저장 중).
  ignored,
}

/// 게시물 상세 상태(REQ-FEED-001~030, REQ-LIKE-009·011).
///
/// 로드
/// - [load]: 시드가 있으면 즉시 content(미확정)로 보여 주고, 없으면 loading. `GET /posts/{postId}`
///   응답이 오면 확정(content, isConfirmed)으로 교체한다. 404는 notFound(`Copy.feedErrorNotFound`),
///   시드가 있었으면 [PostEventBus.publishRemoved]도 한다. 404가 아닌 실패는 시드가 있으면 내용을
///   유지하고 토스트(연결 실패 `Copy.commonErrorNetwork`, 계약 위반 `Copy.feedErrorInvalid`, 그 밖
///   `Copy.feedErrorLoad`), 시드가 없으면 error. 화면 이탈(dispose) 뒤 응답은 무시한다.
/// - 상세 응답은 이미 끝났거나 진행 중인 좋아요·제목 수정 결과를 덮지 않는다
///   ([LikeStore.reconcile]의 `since`, 제목은 수정 성공 이후 응답이면 수정 값 유지).
/// - 응답의 `authorId == userId`로 isMine을 다시 판정한다. 시드 값은 응답 전 임시값이다.
///
/// 좋아요: [onLikeTapped]는 확정 전이면 무시(`likeEnabled == false`), 게스트는 토스트만, 그 밖은
/// [LikeStore.toggle]. 값은 [LikeStore]의 최신 값을 따른다. 작성자 본인도 누를 수 있다.
///
/// 제목 수정: [saveTitle]은 확정되지 않았거나 내 게시물이 아니거나 topicDate가 KST 오늘이 아니면
/// (요청 시점에 다시 판정) 요청 없이 ignored, 저장 중이면 ignored. strip한 값(공백뿐이면 null)을
/// `PUT`으로 보낸다. 성공: 상세·[PostEventBus.publishTitleChanged] 반영 + `Copy.feedEditSuccess` 토스트.
/// 실패는 [FeedState.titleError]에 400 `feedEditErrorState`, 403 `feedEditErrorBanned`(재전송 없음),
/// 401 `feedEditErrorLogin`, 연결 실패 `commonErrorNetwork`, 그 밖 `feedEditErrorOther`.
/// 404는 `feedErrorNotFound` 토스트 + removed 발행 + [FeedClose].
///
/// 삭제: [confirmDelete]는 확정 전·내 게시물 아님·삭제 중·이미 삭제됨이면 요청 없이 무시.
/// 204면 [PostEventBus.publishRemoved] + `Copy.feedDeleteSuccess` 토스트 + [FeedClose]. 화면을
/// 이탈한 뒤 도착해도 removed는 발행하되 이벤트는 내지 않는다. 실패는 화면에 머문 채 토스트:
/// 400 `feedDeleteErrorState`, 403 `feedDeleteErrorForbidden`, 404 `feedErrorNotFound`(+removed 발행),
/// 401 `feedEditErrorLogin`, 연결 실패 `commonErrorNetwork`, 그 밖 `feedDeleteErrorOther`. 실패 뒤 다시 시도할 수 있다.
class FeedViewModel extends ChangeNotifier {
  FeedViewModel({
    required FeedTarget target,
    required PostRepository repository,
    required LikeStore likes,
    required PostEventBus postEvents,
    required String? userId,
    KstClock clock = const KstClock(),
  });

  FeedState get state => throw UnimplementedError();

  /// broadcast. 화면이 보이는 동안만 구독한다.
  Stream<FeedEvent> get events => throw UnimplementedError();

  Future<void> load() => throw UnimplementedError();

  /// error 상태의 "다시 시도".
  Future<void> retry() => throw UnimplementedError();

  Future<void> onLikeTapped() => throw UnimplementedError();

  /// 화면이 다시 보일 때: KST 오늘을 다시 계산해 수정 버튼 판정을 갱신한다(자정 경과).
  void onResumed() => throw UnimplementedError();

  Future<TitleSaveResult> saveTitle(String input) => throw UnimplementedError();

  /// 다이얼로그를 닫을 때 titleError를 지운다.
  void clearTitleError() => throw UnimplementedError();

  Future<void> confirmDelete() => throw UnimplementedError();
}
