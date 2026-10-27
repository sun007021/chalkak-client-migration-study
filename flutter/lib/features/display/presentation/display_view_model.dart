import 'package:flutter/foundation.dart';

import '../../../core/time/kst_clock.dart';
import '../../../core/time/kst_date.dart';
import '../../feed/domain/feed_target.dart';
import '../../feed/domain/post_event_bus.dart';
import '../../like/domain/like_store.dart';
import '../../like/domain/toast_message.dart';
import '../domain/display_models.dart';
import '../domain/display_repository.dart';

enum DisplayStatus {
  /// 아직 보여 줄 전시가 없고 첫 로딩 중. 날짜 이동이 막힌다.
  loading,

  /// 오늘(최신·인기·랜덤) 또는 지난 날짜(아카이브) 전시가 보인다.
  content,

  /// 주제 404이거나 사진이 0장.
  empty,

  /// 보이는 사진이 없는데 실패.
  error,
}

class DisplayState {
  const DisplayState({
    required this.selectedDate,
    required this.today,
    required this.status,
    required this.sort,
    required this.isArchive,
    required this.showSortTabs,
    required this.canGoPrevious,
    required this.canGoNext,
    required this.dateLabel,
    required this.description,
    this.topic,
    this.items = const [],
    this.featured = const [],
    this.featuredPage = 0,
    this.hasNext = false,
    this.isRefreshing = false,
    this.isPaging = false,
    this.isNavigating = false,
    this.errorText,
  });

  /// 사용자가 가리킨 날짜. 날짜 이동 중이면 목적지다(실패하면 직전 성공 날짜로 돌아간다).
  final KstDate selectedDate;

  /// 화면이 아는 KST 오늘.
  final KstDate today;
  final DisplayStatus status;

  /// 정렬 탭에서 선택된 값(오늘 날짜에서만 의미). 지난 날짜에서도 복원용으로 유지한다.
  final DisplaySort sort;

  /// 지금 보이는 전시가 지난 날짜(popular 고정) 아카이브인가.
  final bool isArchive;

  /// 정렬 탭은 오늘 날짜일 때만 보인다.
  final bool showSortTabs;
  final bool canGoPrevious;
  final bool canGoNext;

  /// "M월 d일". 주제를 받았으면 그 `topicDate`, 아니면 [selectedDate].
  final String dateLabel;

  /// 오늘이면 `Copy.displayHeaderDescLatest`, 지난 날짜면 `Copy.displayHeaderDescArchive`.
  final String description;
  final DisplayTopic? topic;

  /// 그리드에 보이는 전체 목록. 좋아요 값은 [LikeStore]의 최신 값으로 채워져 있다.
  final List<PostCard> items;

  /// 아카이브의 인기 상위 5장(없으면 있는 만큼). 아카이브가 아니면 빈 목록.
  final List<PostCard> featured;
  final int featuredPage;
  final bool hasNext;

  /// 정렬 변경·탭 재선택·피드 복귀로 기존 사진을 둔 채 첫 페이지를 다시 받는 중.
  final bool isRefreshing;
  final bool isPaging;

  /// 날짜 이동 중(이전 전시를 계속 보여 준다).
  final bool isNavigating;

  /// [DisplayStatus.error]의 문구: 연결 실패면 `Copy.commonErrorNetwork`, 그 밖은 `Copy.displayError`.
  final String? errorText;
}

sealed class DisplayEvent {
  const DisplayEvent();
}

final class DisplayToast extends DisplayEvent {
  const DisplayToast(this.message);
  final ToastMessage message;
}

final class DisplayOpenFeed extends DisplayEvent {
  const DisplayOpenFeed(this.target);
  final FeedTarget target;
}

final class DisplayScrollToTop extends DisplayEvent {
  const DisplayScrollToTop();
}

/// 전시 탭 상태(REQ-DISP-001~035, REQ-LIKE-004·009·010).
///
/// 날짜 이동·선택
/// - [load]: [initialDate](없으면 KST 오늘)의 전시를 연다. 한 날짜는 `GET /topics?date`로 주제를 확인한 뒤
///   응답 `topicDate`로 `GET /posts`를 부른다. 첫 로딩 중에는 이동 가능 여부가 모두 false.
/// - 날짜 하한 [KstDate.firstTopic], 상한은 KST 오늘. [goPrevious]·[goNext]는 범위 밖이면 요청 없이 무시.
/// - [selectDate]는 범위 밖이면 가장 가까운 끝으로 맞추고, 지금 날짜와 같으면 재요청하지 않는다.
/// - 이동 중에는 이전 전시를 그대로 보여 주고 성공하면 교체. 연타하면 마지막 목적지만 반영하고
///   이전 목적지의 늦은 응답은 화면을 덮지 않는다(그 결과는 (날짜, 정렬) 캐시에만 남는다).
/// - 이동 실패는 직전 성공 전시·날짜로 복원하고 토스트: 주제 404 `Copy.displayDateMissing`,
///   연결 실패 `Copy.commonErrorNetwork`, 그 밖 `Copy.displayError`.
/// - 보이는 전시가 없는 첫 로딩에서: 주제 404 또는 posts 404 또는 0장은 empty,
///   그 밖 실패는 요청한 날짜를 유지한 error.
///
/// 정렬·시드·페이징
/// - 오늘만 정렬 3종(기본 recent). 지난 날짜는 popular 고정이고 오늘로 돌아오면 고른 정렬을 복원한다.
/// - 같은 (날짜, 정렬)의 캐시가 있으면 즉시 보여 주고 첫 페이지를 재검증한다([DisplayState.isRefreshing]).
///   정렬을 바꾸는 중에는 새 결과가 올 때까지 기존 사진을 둔다.
/// - random: 첫 페이지는 시드 없이 요청하고 응답 `randomSeed`를 저장해 2페이지부터 보낸다. 재검증의
///   첫 페이지에도 저장한 시드를 보내고 같은 시드의 뒤쪽 페이지는 유지한다. recent/popular로 바꾸면
///   시드를 버리고 요청에 시드를 싣지 않는다. 시드 없는 random 응답(hasNext=true)은 다음 페이지를
///   요청하지 않는다.
/// - 페이지 크기 20, 페이지 경계의 중복 id는 한 번만. 다음 페이지는 [onVisibleIndexChanged]가
///   마지막에서 세 번째 항목 이내(`index >= items.length - 3`)에 닿을 때, 진행 중이 아니고
///   hasNext이며 첫 페이지 재검증 중이 아닐 때만 한 번 요청한다. 실패하면 목록을 유지하고 토스트,
///   같은 page를 다시 요청한다.
/// - 아카이브: 상위 5장 [DisplayState.featured] + [DisplayState.items]는 전체. 같은 날짜 재검증은
///   featuredPage 유지, 다른 날짜는 0.
/// - 응답이 요청 시점의 (날짜, 정렬)·세대와 다르면 화면에 반영하지 않는다.
///
/// 새로고침: [onTabReselected]는 [DisplayScrollToTop] 이벤트와 함께, [onReturnedFromFeed]는 보던
/// 위치·정렬을 유지한 채 첫 페이지를 재검증한다. 성공하면 교체, 실패하면 기존 전시를 유지하고
/// 토스트만. [onResumed]는 KST 오늘만 다시 계산한다(보던 날짜는 그대로, 요청 없음).
///
/// 좋아요·삭제: 카드의 좋아요 값은 [LikeStore]가 최신이다([onLikeTapped]). 재검증 응답은
/// [LikeStore.reconcile]로 병합해 늦은 응답이 좋아요를 덮지 않는다. [PostEventBus]의
/// [PostRemoved]는 목록·추천·캐시에서 뺀다(이미 삭제된 id가 늦은 응답에 실려 와도 되살리지 않는다).
/// [PostTitleChanged]는 제목을 반영한다.
///
/// 게스트: 전시 조회는 하되 카드의 `isLiked`·`isMine`은 응답 값과 무관하게 false로 다룬다.
/// [onPostTapped]는 `Copy.guestFeed` 토스트만, [onLikeTapped]는 [LikeStore]가 `Copy.guestLike` 토스트만 내고 API는 없다.
/// 좋아요 토스트(실패·게스트)는 [LikeStore.toasts]로 나가며 [DisplayToast]가 아니다.
///
/// [dispose] 뒤에 도착한 응답은 상태·이벤트에 반영하지 않고 오류도 만들지 않는다(진행 중 요청은 취소).
///
/// 계정 전환: [onAccountChanged]가 캐시·시드·진행 중 응답을 모두 버리고 다시 연다.
class DisplayViewModel extends ChangeNotifier {
  DisplayViewModel({
    required DisplayRepository repository,
    required LikeStore likes,
    required PostEventBus postEvents,
    required bool isGuest,
    KstClock clock = const KstClock(),
    KstDate? initialDate,
    DisplaySort initialSort = DisplaySort.recent,
  });

  DisplayState get state => throw UnimplementedError();

  /// broadcast. 화면이 보이는 동안만 구독한다.
  Stream<DisplayEvent> get events => throw UnimplementedError();

  Future<void> load() => throw UnimplementedError();

  /// error 상태의 "다시 시도". 같은 날짜로 다시 요청한다.
  Future<void> retry() => throw UnimplementedError();

  Future<void> goPrevious() => throw UnimplementedError();
  Future<void> goNext() => throw UnimplementedError();
  Future<void> selectDate(KstDate date) => throw UnimplementedError();
  Future<void> selectSort(DisplaySort sort) => throw UnimplementedError();

  Future<void> onTabReselected() => throw UnimplementedError();
  Future<void> onReturnedFromFeed() => throw UnimplementedError();
  Future<void> onResumed() => throw UnimplementedError();
  Future<void> onAccountChanged() => throw UnimplementedError();

  /// 스크롤로 마지막으로 보인 그리드 항목의 index.
  Future<void> onVisibleIndexChanged(int lastVisibleIndex) =>
      throw UnimplementedError();

  void onFeaturedPageChanged(int page) => throw UnimplementedError();

  /// 사진 탭. 게스트는 토스트, 아니면 [DisplayOpenFeed]를 낸다(목록의 id·URL·좋아요·`isMine`·날짜가 시드).
  void onPostTapped(String postId) => throw UnimplementedError();

  Future<void> onLikeTapped(String postId) => throw UnimplementedError();
}
