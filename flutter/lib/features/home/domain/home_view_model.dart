// ignore_for_file: unused_field
import 'package:flutter/foundation.dart';

import '../../../core/time/kst_date.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../../banner/domain/banner_list_controller.dart';
import '../../banner/domain/banner_models.dart';
import 'home_preload.dart';
import 'home_repository.dart';
import 'home_state.dart';
import 'today_post_repository.dart';

/// 랭킹 사진 좋아요 위임 대상. 낙관적 갱신·롤백·직렬화는 공용 like 기능(전시·피드 PR)이 맡고,
/// 홈은 이 최소 인터페이스에만 의존한다.
abstract interface class RankingLikeToggler {
  void toggle(String postId);
}

/// 홈 탭 ViewModel. 섹션(주제·히어로·이번 주·어제/오늘 랭킹·배너·미읽음)은 서로 기다리지
/// 않고 병렬로 요청하며 한 섹션의 실패가 다른 섹션을 바꾸지 않는다(REQ-HOME-001~002).
///
/// 날짜: 오늘/어제/이번 주는 `clock.now()`의 KST로만 계산한다(REQ-HOME-003).
/// 게스트([isGuest]): `/posts/today`·`/posts/calendar`·AI·미읽음을 부르지 않고 히어로 Empty,
/// 이번 주 7칸 빈 칸, 랭킹·배너·주제만 요청한다(REQ-HOME-012, 018, 026, 047).
///
/// 진입 방식 세 가지:
/// - [load]: 첫 로드. [HomePreloadCache]에 같은 날짜·같은 게스트 여부의 스냅샷이 있으면 그
///   섹션은 요청 없이 채운다.
/// - [refresh]: 당겨서 새로고침. 콘텐츠를 유지한 채 `isRefreshing`만 켜고 전체를 다시 요청,
///   배너는 1페이지부터. 진행 중이면 무시. 실패한 섹션은 기존 값을 유지하고 한 번의
///   새로고침당 토스트 최대 1건(첫 실패 섹션: 네트워크 오류는 Copy.commonErrorNetwork).
/// - [onForeground]/[onBecameVisible]: 인디케이터·토스트 없이 조용히 전체 갱신. 실패해도 유지.
///   현재 KST 날짜가 마지막 로드 날짜와 다르면 새 날짜로 전체를 다시 불러온다
///   (이전 날짜 콘텐츠를 섞지 않는다).
/// 늦게 도착한 이전 세대 응답은 상태를 덮어쓰지 않는다. 취소는 오류로 보이지 않는다.
class HomeViewModel extends ChangeNotifier {
  HomeViewModel({
    required this._home,
    required this._todayPost,
    required this._banners,
    required this._isGuest,
    required this._toast,
    this._preloadCache,
    this._likeToggler,
  });

  final HomeRepository _home;
  final TodayPostRepository _todayPost;
  final BannerListController _banners;
  final bool _isGuest;
  final ToastSink _toast;
  final HomePreloadCache? _preloadCache;
  final RankingLikeToggler? _likeToggler;

  HomeState get state => throw UnimplementedError();
  Stream<HomeEvent> get events => throw UnimplementedError();

  Future<void> load() => throw UnimplementedError();
  Future<void> refresh() => throw UnimplementedError();
  Future<void> onForeground() => throw UnimplementedError();
  Future<void> onBecameVisible() => throw UnimplementedError();

  /// 미읽음 점만 다시 조회한다(알림함에서 돌아옴, 푸시 수신). 게스트는 아무것도 안 한다.
  Future<void> refreshUnread() => throw UnimplementedError();

  Future<void> retryHero() => throw UnimplementedError();
  Future<void> retryTopic() => throw UnimplementedError();
  Future<void> retryWeekly() => throw UnimplementedError();
  Future<void> retryRanking(RankingKind kind) => throw UnimplementedError();
  Future<void> retryBanners() => throw UnimplementedError();

  /// 배너 카드가 화면에 보일 때(마지막 카드 prefetch). [index]는 0부터.
  void onBannerVisible(int index) => throw UnimplementedError();

  /// 히어로 탭. 게스트면 Copy.homeGuestUpload 토스트, 정지(403)면 Copy.homeHeroBanned
  /// 토스트(재요청 없음), Empty(정상)면 [OpenUploadGate]. 다른 상태에서는 아무 일도 없다.
  void onHeroPressed() => throw UnimplementedError();

  /// 게스트면 Copy.homeGuestNotification 토스트(API 0건), 아니면 [OpenNotifications].
  void onNotificationPressed() => throw UnimplementedError();

  /// 게스트면 Copy.homeGuestFeed 토스트, 아니면 [OpenFeed].
  void onRankingItemPressed(String postId) => throw UnimplementedError();

  /// 게스트면 Copy.homeGuestLike 토스트(API 0건). 로그인 상태는 [RankingLikeToggler.toggle]\(postId)에 위임한다(없으면 무시).
  void onLikePressed(String postId) => throw UnimplementedError();

  /// 그 섹션 날짜의 인기순 전시로 가는 [OpenDisplayTab].
  void onRankingMorePressed(RankingKind kind) => throw UnimplementedError();

  /// 기록이 있는 칸이면 [OpenRecordTab](date), 빈 칸이면 아무 일도 없다.
  void onWeekDayPressed(KstDate date) => throw UnimplementedError();

  void onWeekMorePressed() => throw UnimplementedError();

  /// 배너 카드 탭 -> [OpenBanner]. 게스트도 연다.
  void onBannerPressed(BannerItem item) => throw UnimplementedError();
}
