import '../../../core/time/kst_date.dart';
import '../../feed/domain/feed_target.dart';
import '../../like/domain/toast_message.dart';
import '../domain/display_models.dart';

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
