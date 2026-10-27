// ignore_for_file: unused_field
import '../../../core/time/kst_date.dart';
import '../../banner/domain/banner_list_controller.dart';
import '../../banner/domain/banner_models.dart';
import 'home_models.dart';

/// 오늘 주제 머리글(REQ-HOME-004~005).
sealed class TopicState {
  const TopicState();
}

/// "오늘의 주제를 불러오는 중".
final class TopicLoading extends TopicState {
  const TopicLoading();
}

final class TopicReady extends TopicState {
  const TopicReady(this.topic);
  final Topic topic;
}

/// 404. "오늘의 주제가 아직 준비되지 않았어요".
final class TopicNotReady extends TopicState {
  const TopicNotReady();
}

/// 그 밖의 실패. "오늘의 주제를 불러오지 못했어요".
final class TopicError extends TopicState {
  const TopicError();
}

/// 히어로 7상태(D-06).
sealed class HeroState {
  const HeroState();
}

final class HeroLoading extends HeroState {
  const HeroLoading();
}

final class HeroNoOpenTopic extends HeroState {
  const HeroNoOpenTopic();
}

/// `isPosted=false`, 403(정지), 게스트. [topicTitle]은 주제를 못 받았으면 null.
final class HeroEmpty extends HeroState {
  const HeroEmpty({this.topicTitle, this.banned = false});
  final String? topicTitle;
  final bool banned;
}

final class HeroProcessing extends HeroState {
  const HeroProcessing();
}

/// PENDING(배지) 또는 APPROVED. [thumbnailUrl]은 이번 주 기록에서 같은 postId를 찾은 값이고
/// 없으면 null(대체 이미지).
final class HeroPhoto extends HeroState {
  const HeroPhoto({
    required this.postId,
    required this.thumbnailUrl,
    required this.pending,
  });
  final String postId;
  final String? thumbnailUrl;
  final bool pending;
}

final class HeroError extends HeroState {
  const HeroError();
}

/// 랭킹 섹션(어제/오늘 인기) 상태.
sealed class RankingState {
  const RankingState();
}

final class RankingLoading extends RankingState {
  const RankingLoading();
}

/// [posts]는 최대 5장. 비어 있으면 "아직 올라온 사진이 없어요".
final class RankingReady extends RankingState {
  const RankingReady({required this.posts, required this.date});
  final List<PostSummary> posts;

  /// 이 섹션이 가리키는 날짜(더보기 목적지). 주제 404면 null.
  final KstDate? date;
}

final class RankingError extends RankingState {
  const RankingError();
}

/// 이번 주 기록 섹션(REQ-HOME-019~026).
sealed class WeeklyState {
  const WeeklyState();
}

final class WeeklyLoading extends WeeklyState {
  const WeeklyLoading();
}

/// [days]는 일요일부터 7칸. 게스트는 모두 entry=null.
final class WeeklyReady extends WeeklyState {
  const WeeklyReady({required this.days});
  final List<WeekDay> days;

  /// 사진이 있는 날 수("N/7").
  int get recordedCount => throw UnimplementedError();
}

final class WeeklyError extends WeeklyState {
  const WeeklyError();
}

/// 홈 화면 전체 상태. 섹션은 서로 독립이다(REQ-HOME-002).
class HomeState {
  const HomeState({
    required this.today,
    required this.topic,
    required this.hero,
    required this.weekly,
    required this.yesterday,
    required this.popular,
    required this.banners,
    required this.hasUnread,
    required this.isRefreshing,
    this.aiCardPostId,
  });

  /// 이 상태가 기준으로 삼은 KST 오늘.
  final KstDate today;
  final TopicState topic;
  final HeroState hero;
  final WeeklyState weekly;
  final RankingState yesterday;
  final RankingState popular;
  final BannerListState banners;
  final bool hasUnread;

  /// 당겨서 새로고침 인디케이터(`home.refresh-indicator`). 콘텐츠는 유지된다.
  final bool isRefreshing;

  /// AI 카드를 보일 대상 postId. 히어로가 APPROVED이고 그 사진의 주제 날짜가 KST 오늘일 때만
  /// 값이 있다(REQ-HOME-034). AI 요청·폴링은 AIR PR이 맡는다.
  final String? aiCardPostId;
}

/// 랭킹 더보기 대상.
enum RankingKind { yesterday, popular }

/// 홈이 밖(셸·라우터)에 요청하는 일회성 이동.
sealed class HomeEvent {
  const HomeEvent();
}

/// 히어로 Empty 탭(인증 사용자·정지 아님). 셸이 업로드 진입 게이트를 시작한다.
final class OpenUploadGate extends HomeEvent {
  const OpenUploadGate();
}

final class OpenFeed extends HomeEvent {
  const OpenFeed(this.post);

  /// 목록의 이미지·좋아요 값을 시드로 넘긴다(TC-HOME-021).
  final PostSummary post;
}

/// [date]가 있으면 기록 탭에서 그 날짜를 선택한다.
final class OpenRecordTab extends HomeEvent {
  const OpenRecordTab({this.date});
  final KstDate? date;
}

final class OpenDisplayTab extends HomeEvent {
  const OpenDisplayTab({required this.date, required this.popular});
  final KstDate date;
  final bool popular;
}

final class OpenNotifications extends HomeEvent {
  const OpenNotifications();
}

final class OpenBanner extends HomeEvent {
  const OpenBanner(this.item);
  final BannerItem item;
}
